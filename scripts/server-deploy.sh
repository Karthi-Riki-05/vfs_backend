#!/usr/bin/env bash
# ValueChart backend deploy script — runs on EC2 via GitHub Actions SSH.
# Triggered by: push to vfs_backend `production` branch.
#
# Usage on server (manual): bash /var/www/vfs/backend/scripts/server-deploy.sh

set -euo pipefail

BRANCH="${DEPLOY_BRANCH:-production}"
PROJECT_DIR="/var/www/vfs"
BACKEND_DIR="$PROJECT_DIR/backend"
BACKUP_DIR="$HOME/backups"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.server.yml"
TS="$(date +%F-%H%M%S)"

log() { echo "[$(date +'%F %T')] $*"; }

# Support both old docker-compose v1 binary and new docker compose plugin
if command -v docker-compose &>/dev/null; then
  DC="docker-compose -f $COMPOSE_FILE"
else
  DC="docker compose -f $COMPOSE_FILE"
fi

log "=== ValueChart backend deploy started (branch=$BRANCH) ==="
log "Using compose command: $DC"

# ---------------------------------------------------------------
# 0 — Ensure docker-compose.server.yml is in place
# Versioned in backend/ repo, copied to PROJECT_DIR so that
# relative build paths (./backend, ./frontend) resolve correctly.
# ---------------------------------------------------------------
log "Step 0: Syncing docker-compose.server.yml to $PROJECT_DIR..."
cp "$BACKEND_DIR/docker-compose.server.yml" "$COMPOSE_FILE"
log "Compose file in place"

# ---------------------------------------------------------------
# 1 — Database backup (runs against db container, no backend needed)
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
log "Step 2: Pulling $BRANCH branch..."
cd "$BACKEND_DIR"
git fetch origin --prune
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"
COMMIT=$(git rev-parse --short HEAD)
log "Backend at commit $COMMIT"

# ---------------------------------------------------------------
# 3 — Apply schema changes directly via psql on the db container
#
# We bypass `prisma db push` on the backend container entirely.
# Reasons:
#   a) The backend may be crash-looping (prisma db push fails on the
#      @@unique constraint warning, causing an infinite restart loop).
#   b) docker compose exec cannot enter a restarting container.
#   c) Direct SQL with IF NOT EXISTS / IF NOT EXISTS is always safe
#      and idempotent — safe to re-run on every deploy.
# ---------------------------------------------------------------
log "Step 3: Applying schema changes directly via psql..."
$DC exec -T db psql -U admin -d value_charts_db << 'ENDSQL'
-- New User columns (additive, safe)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_legacy_pro           BOOLEAN   NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS flow_addon_stripe_sub_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS flow_addon_plan          TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS flow_addon_status        TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS flow_addon_current_period_end TIMESTAMPTZ;

-- New FlowShare column
ALTER TABLE flow_shares ADD COLUMN IF NOT EXISTS requires_pro BOOLEAN NOT NULL DEFAULT false;

-- Dedup txn_id before adding unique constraint
DELETE FROM transaction_logs a
USING  transaction_logs b
WHERE  a.id > b.id
  AND  a.txn_id = b.txn_id
  AND  a.txn_id IS NOT NULL;

-- Unique index on transaction_logs.txn_id
CREATE UNIQUE INDEX IF NOT EXISTS transaction_logs_txn_id_key
  ON transaction_logs (txn_id);

-- Performance indexes on subscriptions
CREATE INDEX IF NOT EXISTS subscriptions_payment_id_idx
  ON subscriptions (payment_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_product_type_idx
  ON subscriptions (status, product_type);
ENDSQL
log "Schema changes applied OK"

# ---------------------------------------------------------------
# 3b — One-time data migration: mark legacy Pro users (idempotent)
# Runs after schema so is_legacy_pro column definitely exists.
# Uses docker compose run so it works even if backend was stopped.
# ---------------------------------------------------------------
log "Step 3b: Running migrate-legacy-pro (idempotent)..."
cd "$PROJECT_DIR"
$DC run --rm --no-deps \
  -e DATABASE_URL \
  backend node "$BACKEND_DIR/scripts/migrate-legacy-pro.js" \
  && log "Legacy Pro migration OK" \
  || log "Legacy Pro migration skipped (already done or script not found)"

# ---------------------------------------------------------------
# 4 — Stop the backend if crash-looping, then rebuild + start
# ---------------------------------------------------------------
log "Step 4: Stopping backend (clears any crash loop)..."
$DC stop backend 2>/dev/null || true

log "Step 4: Rebuilding and starting backend container..."
$DC up -d --build backend

# ---------------------------------------------------------------
# 5 — Health check (60 s window)
# ---------------------------------------------------------------
log "Step 5: Waiting for backend health..."
for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:5000/health > /dev/null 2>&1; then
    log "Backend healthy (attempt $i)"
    log "=== Deploy complete: $COMMIT ==="
    exit 0
  fi
  sleep 3
done

log "ERROR: Backend did not become healthy after 60s."
log "Check: $DC logs --tail=100 backend"
exit 1
