#!/usr/bin/env bash
# ValueChart backend deploy script — runs on EC2 via GitHub Actions SSH.
# Triggered by: push to vfs_backend `production` branch.
#
# Usage on server (manual): sudo bash /var/www/vfs/backend/scripts/server-deploy.sh

set -euo pipefail

BRANCH="${DEPLOY_BRANCH:-production}"
PROJECT_DIR="/var/www/vfs"
BACKEND_DIR="$PROJECT_DIR/backend"
BACKUP_DIR="$HOME/backups"
TS="$(date +%F-%H%M%S)"

log() { echo "[$(date +'%F %T')] $*"; }

log "=== ValueChart backend deploy started (branch=$BRANCH) ==="

# ---------------------------------------------------------------
# 1/5 — Database backup
# ---------------------------------------------------------------
log "Step 1/5: Backing up database to $BACKUP_DIR/vfs-$TS.sql"
mkdir -p "$BACKUP_DIR"
sudo docker-compose -f "$PROJECT_DIR/docker-compose.yml" exec -T db \
    pg_dump -U admin value_charts_db > "$BACKUP_DIR/vfs-$TS.sql"

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
# 3/5 — Prisma schema sync (fail loud on data-loss warning)
# ---------------------------------------------------------------
log "Step 3/5: Running prisma db push..."
cd "$PROJECT_DIR"
if ! sudo docker-compose exec -T backend npx prisma db push; then
    log "ERROR: prisma db push failed."
    log "Common cause: data-loss warning (e.g. new unique constraint with duplicate rows)."
    log "Resolve manually on server before retrying. Containers NOT rebuilt."
    log "Backup is safe at: $BACKUP_DIR/vfs-$TS.sql"
    exit 1
fi
log "Schema sync OK"

# ---------------------------------------------------------------
# 4/5 — Rebuild + restart backend container
# ---------------------------------------------------------------
log "Step 4/5: Rebuilding backend container..."
sudo docker-compose up -d --build backend

# ---------------------------------------------------------------
# 5/5 — Health check
# ---------------------------------------------------------------
log "Step 5/5: Waiting for backend health..."
for i in $(seq 1 15); do
    if curl -fsS http://127.0.0.1:5000/health > /dev/null 2>&1; then
        log "Backend healthy (attempt $i)"
        log "=== Deploy complete: $COMMIT ==="
        exit 0
    fi
    sleep 2
done

log "ERROR: Backend did not become healthy after 30s."
log "Check: sudo docker-compose logs --tail=80 backend"
exit 1
