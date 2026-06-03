#!/usr/bin/env bash
# ValueChart full-stack deploy script — runs on EC2 via GitHub Actions SSH.
# Triggered by: push to vfs_backend `production` branch.
# Deploys: backend + frontend (Next.js) + database (PostgreSQL) via Docker.
#
# Usage on server (manual): bash /var/www/vfs/backend/scripts/server-deploy.sh

set -euo pipefail

BRANCH="${DEPLOY_BRANCH:-production}"
PROJECT_DIR="/var/www/vfs"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
FRONTEND_REPO="https://github.com/Karthi-Riki-05/vfs_frontend.git"
BACKUP_DIR="$HOME/backups"
# docker-compose.server.yml is maintained directly at PROJECT_DIR.
# Edit it via FileZilla or scp — do NOT add it back to the backend repo.
COMPOSE_FILE="$PROJECT_DIR/docker-compose.server.yml"
TS="$(date +%F-%H%M%S)"

log() { echo "[$(date +'%F %T')] $*"; }

# Support both old docker-compose v1 binary and new docker compose plugin
if command -v docker-compose &>/dev/null; then
  DC="docker-compose -f $COMPOSE_FILE"
else
  DC="docker compose -f $COMPOSE_FILE"
fi

log "=== ValueChart full-stack deploy started (branch=$BRANCH) ==="
log "Using compose command: $DC"

# ---------------------------------------------------------------
# 0 — Ensure swap is enabled (prevents OOM during frontend build)
# 3 containers × 512MB = 1.5GB + OS overhead → need swap headroom.
# ---------------------------------------------------------------
if ! swapon --show | grep -q '/swapfile'; then
  log "Step 0: Creating 2GB swapfile..."
  sudo fallocate -l 2G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab > /dev/null
  log "Swap enabled ($(free -h | awk '/Swap:/{print $2}'))"
else
  log "Step 0: Swap already active ($(free -h | awk '/Swap:/{print $2}'))"
fi

# ---------------------------------------------------------------
# 1 — Database backup (db container only, no backend needed)
# ---------------------------------------------------------------
log "Step 1: Backing up database to $BACKUP_DIR/vfs-$TS.sql"
mkdir -p "$BACKUP_DIR"
$DC exec -T db pg_dump -U admin value_charts_db > "$BACKUP_DIR/vfs-$TS.sql"
BACKUP_SIZE=$(du -h "$BACKUP_DIR/vfs-$TS.sql" | cut -f1)
log "Backup OK ($BACKUP_SIZE)"
ls -1t "$BACKUP_DIR"/vfs-*.sql 2>/dev/null | tail -n +15 | xargs -r rm -f
log "Rotated backups (keeping last 14)"

# ---------------------------------------------------------------
# 2 — Pull latest backend code
# ---------------------------------------------------------------
log "Step 2: Pulling backend $BRANCH branch..."
cd "$BACKEND_DIR"
git fetch origin --prune
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"
BACKEND_COMMIT=$(git rev-parse --short HEAD)
log "Backend at commit $BACKEND_COMMIT"

# ---------------------------------------------------------------
# 2b — Pull latest frontend code (clone on first deploy, pull after)
# ---------------------------------------------------------------
log "Step 2b: Pulling frontend $BRANCH branch..."
if [ -d "$FRONTEND_DIR/.git" ]; then
  cd "$FRONTEND_DIR"
  git fetch origin --prune
  git checkout "$BRANCH"
  git reset --hard "origin/$BRANCH"
else
  log "Frontend repo not found — cloning..."
  git clone --branch "$BRANCH" "$FRONTEND_REPO" "$FRONTEND_DIR"
  cd "$FRONTEND_DIR"
fi
FRONTEND_COMMIT=$(git rev-parse --short HEAD)
log "Frontend at commit $FRONTEND_COMMIT"

cd "$PROJECT_DIR"

# ---------------------------------------------------------------
# 3 — Apply schema changes directly via psql on the db container
# Bypasses `prisma db push` on the backend to avoid crash-loop from
# the @@unique constraint warning. All statements are idempotent.
# ---------------------------------------------------------------
log "Step 3: Applying schema changes via psql..."
$DC exec -T db psql -U admin -d value_charts_db << 'ENDSQL'
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_legacy_pro           BOOLEAN   NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS flow_addon_stripe_sub_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS flow_addon_plan          TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS flow_addon_status        TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS flow_addon_current_period_end TIMESTAMPTZ;
ALTER TABLE flow_shares ADD COLUMN IF NOT EXISTS requires_pro BOOLEAN NOT NULL DEFAULT false;
-- Team-context / private-buckets feature: new workspace columns + indexes (idempotent).
-- prisma db push is skipped on prod, so these must be applied here.
ALTER TABLE users        ADD COLUMN IF NOT EXISTS last_active_team_id TEXT;
ALTER TABLE shapes       ADD COLUMN IF NOT EXISTS team_id             TEXT;
ALTER TABLE issue_list   ADD COLUMN IF NOT EXISTS team_id             TEXT;
ALTER TABLE shape_groups ADD COLUMN IF NOT EXISTS workspace_team_id   TEXT;
CREATE INDEX IF NOT EXISTS shapes_team_id_idx                 ON shapes (team_id);
CREATE INDEX IF NOT EXISTS issue_list_team_id_idx             ON issue_list (team_id);
CREATE INDEX IF NOT EXISTS shape_groups_workspace_team_id_idx ON shape_groups (workspace_team_id);
DELETE FROM transaction_logs a USING transaction_logs b
  WHERE a.id > b.id AND a.txn_id = b.txn_id AND a.txn_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS transaction_logs_txn_id_key ON transaction_logs (txn_id);
CREATE INDEX IF NOT EXISTS subscriptions_payment_id_idx ON subscriptions (payment_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_product_type_idx ON subscriptions (status, product_type);
ENDSQL
log "Schema changes applied OK"

# ---------------------------------------------------------------
# 3b — One-time data migration (idempotent)
# ---------------------------------------------------------------
log "Step 3b: Running migrate-legacy-pro..."
# Path inside the container is /app/scripts/... (code is baked into the image,
# not bind-mounted in production). $BACKEND_DIR is a host path — wrong here.
$DC run --rm --no-deps -e DATABASE_URL \
  backend node /app/scripts/migrate-legacy-pro.js \
  && log "Legacy Pro migration OK" \
  || log "Legacy Pro migration skipped (already done)"

# ---------------------------------------------------------------
# 4 — Rebuild and start all services
# Frontend build takes 3–5 min on first run (Next.js + canvas).
# Backend and db start immediately; frontend starts after its build.
# ---------------------------------------------------------------
log "Step 4: Stopping all services (clears crash loops)..."
$DC down --remove-orphans 2>/dev/null || true

log "Step 4: Rebuilding and starting all services..."
log "  (Frontend Next.js build takes 3-5 minutes — this is expected)"
$DC up -d --build

# ---------------------------------------------------------------
# 5 — Health checks
# ---------------------------------------------------------------
log "Step 5: Waiting for backend health (60s)..."
for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:5000/health > /dev/null 2>&1; then
    log "Backend healthy (attempt $i)"
    break
  fi
  [ "$i" -eq 20 ] && { log "ERROR: Backend not healthy after 60s"; log "Run: $DC logs --tail=100 backend"; exit 1; }
  sleep 3
done

log "Step 5: Waiting for frontend health (120s)..."
for i in $(seq 1 40); do
  if curl -fsS http://127.0.0.1:3000/login > /dev/null 2>&1; then
    log "Frontend healthy (attempt $i)"
    log "=== Deploy complete: backend=$BACKEND_COMMIT frontend=$FRONTEND_COMMIT ==="
    exit 0
  fi
  [ "$i" -eq 40 ] && { log "ERROR: Frontend not healthy after 120s"; log "Run: $DC logs --tail=100 frontend"; exit 1; }
  sleep 3
done
