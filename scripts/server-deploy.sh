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
# 0/5 — Ensure docker-compose.server.yml is in place
# The file lives in backend/ (versioned) and must be copied to
# $PROJECT_DIR so relative build paths (./backend, ./frontend) work.
# ---------------------------------------------------------------
log "Step 0/5: Syncing docker-compose.server.yml to $PROJECT_DIR..."
cp "$BACKEND_DIR/docker-compose.server.yml" "$COMPOSE_FILE"
log "Compose file in place"

# ---------------------------------------------------------------
# 1/5 — Database backup
# ---------------------------------------------------------------
log "Step 1/5: Backing up database to $BACKUP_DIR/vfs-$TS.sql"
mkdir -p "$BACKUP_DIR"
$DC exec -T db pg_dump -U admin value_charts_db > "$BACKUP_DIR/vfs-$TS.sql"

BACKUP_SIZE=$(du -h "$BACKUP_DIR/vfs-$TS.sql" | cut -f1)
log "Backup OK ($BACKUP_SIZE)"

# Keep last 14 backups, delete older ones
ls -1t "$BACKUP_DIR"/vfs-*.sql 2>/dev/null | tail -n +15 | xargs -r rm -f
log "Rotated backups (keeping last 14)"

# ---------------------------------------------------------------
# 2/5 — Pull latest backend code
# ---------------------------------------------------------------
log "Step 2/5: Pulling $BRANCH branch..."
cd "$BACKEND_DIR"
git fetch origin --prune
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"
COMMIT=$(git rev-parse --short HEAD)
log "Backend at commit $COMMIT"

# ---------------------------------------------------------------
# 3/5 — Prisma schema sync
# Dedup txn_id first so the @@unique constraint can be applied safely.
# ---------------------------------------------------------------
log "Step 3/5: Deduplicating transaction_logs.txn_id before prisma db push..."
$DC exec -T db psql -U admin -d value_charts_db -c \
  "DELETE FROM transaction_logs a USING transaction_logs b WHERE a.id > b.id AND a.txn_id = b.txn_id AND a.txn_id IS NOT NULL;" \
  || log "Dedup query skipped (no duplicates or table not yet updated)"

log "Step 3/5: Running prisma db push..."
cd "$PROJECT_DIR"
if ! $DC exec -T backend npx prisma db push --skip-generate; then
    log "ERROR: prisma db push failed."
    log "Common cause: data-loss warning (e.g. unique constraint with duplicate rows)."
    log "Resolve manually on server before retrying. Containers NOT rebuilt."
    log "Backup is safe at: $BACKUP_DIR/vfs-$TS.sql"
    exit 1
fi
log "Schema sync OK"

# ---------------------------------------------------------------
# 3b — One-time data migration: mark legacy Pro users
# ---------------------------------------------------------------
log "Step 3b: Running migrate-legacy-pro (idempotent)..."
$DC exec -T backend node scripts/migrate-legacy-pro.js \
  && log "Legacy Pro migration OK" \
  || log "Legacy Pro migration skipped (already done or not needed)"

# ---------------------------------------------------------------
# 4/5 — Rebuild + restart backend container
# ---------------------------------------------------------------
log "Step 4/5: Rebuilding backend container..."
$DC up -d --build backend

# ---------------------------------------------------------------
# 5/5 — Health check
# ---------------------------------------------------------------
log "Step 5/5: Waiting for backend health..."
for i in $(seq 1 20); do
    if curl -fsS http://127.0.0.1:5000/health > /dev/null 2>&1; then
        log "Backend healthy (attempt $i)"
        log "=== Deploy complete: $COMMIT ==="
        exit 0
    fi
    sleep 3
done

log "ERROR: Backend did not become healthy after 60s."
log "Check: $DC logs --tail=80 backend"
exit 1
