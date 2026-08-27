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
# A previously-failed deploy can leave the stack down — pg data lives in
# the pgdata volume, so it is safe (and required) to start db first;
# otherwise every recovery deploy dies here on "service db is not running".
# ---------------------------------------------------------------
log "Step 1: Backing up database to $BACKUP_DIR/vfs-$TS.sql"
mkdir -p "$BACKUP_DIR"
if ! $DC ps --status running db 2>/dev/null | grep -q db; then
  log "db container not running — starting it for the backup..."
  $DC up -d db
  for i in $(seq 1 30); do
    $DC exec -T db pg_isready -U admin -d value_charts_db &>/dev/null && break
    sleep 2
  done
fi
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
-- Refund tombstone: /pro/grant-from-mobile refuses to grant Pro while set,
-- so a refund is not undone the next time the user opens the Pro app.
-- Nullable with no default: existing rows are correctly "never refunded".
ALTER TABLE users ADD COLUMN IF NOT EXISTS pro_refunded_at         TIMESTAMPTZ;
-- Signup provenance (write-once): which platform/app/login the account was
-- FIRST created with. Nullable with no default and NOT backfillable — the
-- signal was never captured for existing rows, so NULL must always be read as
-- "unknown" and fail open. Immutability is enforced by the trigger installed
-- further down (users_freeze_signup_provenance), not by a constraint.
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_platform   TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_app_type   TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login_type TEXT;
CREATE INDEX IF NOT EXISTS users_first_platform_first_app_type_idx
  ON users (first_platform, first_app_type);
ALTER TABLE users ADD COLUMN IF NOT EXISTS flow_addon_stripe_sub_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS flow_addon_plan          TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS flow_addon_status        TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS flow_addon_current_period_end TIMESTAMPTZ;
ALTER TABLE flow_shares ADD COLUMN IF NOT EXISTS requires_pro BOOLEAN NOT NULL DEFAULT false;
-- Billing: label transactions by what was purchased (ai_addon_credits, etc.).
ALTER TABLE transaction_logs ADD COLUMN IF NOT EXISTS purchase_type TEXT;
-- EU/UK right-of-withdrawal waiver captured at Pro checkout. Written by
-- lib/grantProCredits.js and services/pro.service.js on every Pro grant, so
-- a missing column fails the purchase itself, not just the record.
ALTER TABLE transaction_logs ADD COLUMN IF NOT EXISTS withdrawal_waiver_at   TIMESTAMPTZ;
ALTER TABLE transaction_logs ADD COLUMN IF NOT EXISTS withdrawal_waiver_text TEXT;
-- Team-context / private-buckets feature: new workspace columns + indexes (idempotent).
-- prisma db push is skipped on prod, so these must be applied here.
ALTER TABLE users        ADD COLUMN IF NOT EXISTS last_active_team_id TEXT;
ALTER TABLE shapes       ADD COLUMN IF NOT EXISTS team_id             TEXT;
ALTER TABLE issue_list   ADD COLUMN IF NOT EXISTS team_id             TEXT;
ALTER TABLE shape_groups ADD COLUMN IF NOT EXISTS workspace_team_id   TEXT;
CREATE INDEX IF NOT EXISTS shapes_team_id_idx                 ON shapes (team_id);
CREATE INDEX IF NOT EXISTS issue_list_team_id_idx             ON issue_list (team_id);
CREATE INDEX IF NOT EXISTS shape_groups_workspace_team_id_idx ON shape_groups (workspace_team_id);
-- Flow-pack grace period + shape↔team/chat associations (idempotent).
-- Added to match prisma/schema.prisma; code in pro/shape/flowPackExpiry
-- services reads these, so they must exist on the server DB.
ALTER TABLE users  ADD COLUMN IF NOT EXISTS flow_addon_grace_period_end TIMESTAMPTZ;
ALTER TABLE shapes ADD COLUMN IF NOT EXISTS associated_team_id          TEXT;
ALTER TABLE shapes ADD COLUMN IF NOT EXISTS associated_chat_group_id    TEXT;
ALTER TABLE shapes ADD COLUMN IF NOT EXISTS association_type            TEXT;
CREATE INDEX IF NOT EXISTS shapes_associated_team_id_idx       ON shapes (associated_team_id);
CREATE INDEX IF NOT EXISTS shapes_associated_chat_group_id_idx ON shapes (associated_chat_group_id);
DELETE FROM transaction_logs a USING transaction_logs b
  WHERE a.id > b.id AND a.txn_id = b.txn_id AND a.txn_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS transaction_logs_txn_id_key ON transaction_logs (txn_id);
CREATE INDEX IF NOT EXISTS subscriptions_payment_id_idx ON subscriptions (payment_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_product_type_idx ON subscriptions (status, product_type);
-- bcrypt → argon2 migration: flag for legacy bcrypt users (2026-06-08).
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_legacy_bcrypt BOOLEAN NOT NULL DEFAULT false;
-- Mark existing system/workspace teams so they are hidden from the Teams UI.
UPDATE teams SET verify_team = 'system'
  WHERE app_context = 'pro' AND (verify_team IS NULL OR verify_team != 'system');
UPDATE teams SET verify_team = 'system'
  WHERE app_context = 'team' AND (name IS NULL OR name = '') AND (verify_team IS NULL OR verify_team != 'system');
-- Public marketing-site contact/support form submissions (contact_submissions).
CREATE TABLE IF NOT EXISTS contact_submissions (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  subject     TEXT,
  message     TEXT,
  source      TEXT NOT NULL DEFAULT 'contact',
  ip_address  TEXT,
  emailed     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS contact_submissions_created_at_idx ON contact_submissions (created_at);
CREATE INDEX IF NOT EXISTS contact_submissions_source_idx     ON contact_submissions (source);
-- Billing source-of-truth column (bug: IAP purchase validation, 2026-07-13).
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'stripe';
-- RevenueCat webhook event ledger — event_id is the idempotency key.
CREATE TABLE IF NOT EXISTS iap_transactions (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider       TEXT NOT NULL DEFAULT 'revenuecat',
  store          TEXT,
  event_id       TEXT NOT NULL,
  event_type     TEXT NOT NULL,
  product_id     TEXT NOT NULL,
  transaction_id TEXT,
  price_cents    INTEGER,
  currency       TEXT,
  created_at     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS iap_transactions_event_id_key ON iap_transactions (event_id);
CREATE INDEX IF NOT EXISTS iap_transactions_user_id_idx    ON iap_transactions (user_id);
CREATE INDEX IF NOT EXISTS iap_transactions_product_id_idx ON iap_transactions (product_id);
-- bug-058: dedupe existing rows before enforcing one team-wide chat group per
-- (team, app context). NULL != NULL in Postgres, so personal/DM groups
-- (team_id IS NULL) are never touched by either statement.
DELETE FROM chat_groups a USING chat_groups b
  WHERE a.id > b.id AND a.team_id = b.team_id AND a.app_context = b.app_context
    AND a.team_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS chat_groups_team_id_app_context_key ON chat_groups (team_id, app_context);
-- bug-058: dedupe existing group-membership rows before enforcing uniqueness
-- (skipDuplicates: true calls in chat.service.js rely on this constraint).
DELETE FROM chat_group_users a USING chat_group_users b
  WHERE a.id > b.id AND a.group_id = b.group_id AND a.user_id = b.user_id;
CREATE UNIQUE INDEX IF NOT EXISTS chat_group_users_group_id_user_id_key ON chat_group_users (group_id, user_id);
-- LICENSE PROBE — TEMPORARY diagnostic table for the paid-app refund
-- experiment (does Play Integrity's appLicensingVerdict flip after a refund?).
-- Observation only: nothing reads it to decide access. No FK on user_id, by
-- design — it is a scratch table and a relation would add another cascade path
-- to reason about on account deletion.
-- DROP TABLE license_probes; once the experiment concludes.
CREATE TABLE IF NOT EXISTS license_probes (
  id                      TEXT PRIMARY KEY,
  label                   TEXT,
  device_id               TEXT,
  user_id                 TEXT,
  platform                TEXT NOT NULL,
  app_variant             TEXT,
  package_name            TEXT,
  app_licensing_verdict   TEXT,
  app_recognition_verdict TEXT,
  device_verdicts         TEXT,
  token_timestamp_ms      TEXT,
  request_hash            TEXT,
  ok                      BOOLEAN NOT NULL DEFAULT false,
  error                   TEXT,
  raw                     JSONB,
  created_at              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS license_probes_device_id_created_at_idx ON license_probes (device_id, created_at);
CREATE INDEX IF NOT EXISTS license_probes_created_at_idx           ON license_probes (created_at);
ENDSQL
log "Schema changes applied OK"

# ---------------------------------------------------------------
# 3a — Triggers. Prisma does not manage these, so `prisma db push`
# neither creates nor drops them; they must be applied here. Each
# file is idempotent (CREATE OR REPLACE + DROP TRIGGER IF EXISTS).
# ---------------------------------------------------------------
log "Step 3a: Applying database triggers..."
$DC exec -T db psql -U admin -d value_charts_db -v ON_ERROR_STOP=1 \
  < "$BACKEND_DIR/prisma/sql/freeze_signup_provenance.sql" \
  && log "Trigger users_freeze_signup_provenance applied OK" \
  || { log "FATAL: trigger apply failed"; exit 1; }

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
