-- ============================================================================
-- team_members.app_context  (owner decision, 2026-08-08)
-- ============================================================================
-- A membership row now belongs to ONE app. Buying a plan creates the row for
-- that plan's app; an invite stamps the app it was sent from. The workspace
-- switcher then filters `where { userId, appContext }` and never consults the
-- `teams` table — which is left completely untouched by this change.
--
-- Consequence, intended: a seat granted in the Team app does NOT grant the Pro
-- app. To give someone both, invite them from both apps (two rows).
--
-- IRREVERSIBLE: replaces the @@unique([userId, workspaceId]) index. Run
-- manually, after a backup (prisma/manual/backups/pre-teammember-appcontext-*).
-- `prisma db push` runs WITHOUT --accept-data-loss, so it can never do this.
-- ============================================================================

BEGIN;

-- 1. The column. Default `team` so any row written between this migration and
--    the code deploy lands in the Team app rather than becoming invisible.
ALTER TABLE "team_members"
  ADD COLUMN IF NOT EXISTS "app_context" "UserVersion" NOT NULL DEFAULT 'team';

-- 2. Backfill from the teams each row already carries. A row whose teams are
--    all pro becomes a pro row; anything else stays `team` (the default), which
--    also covers rows with no teams at all — a stranded member keeps their seat
--    in the Team app rather than losing it silently.
UPDATE "team_members" tm
SET "app_context" = 'pro'
WHERE cardinality(tm."team_ids") > 0
  AND NOT EXISTS (
    SELECT 1 FROM "teams" t
    WHERE t."id" = ANY(tm."team_ids")
      AND t."app_context" <> 'pro'
  );

-- 2b. Drop the OLD two-part key FIRST. The split in step 3 legitimately creates
--     a second row for the same (user_id, workspace_id), so the old constraint
--     has to be gone before that INSERT runs — attempting it the other way round
--     aborts the whole migration on a duplicate-key violation.
ALTER TABLE "team_members" DROP CONSTRAINT IF EXISTS "team_members_user_id_workspace_id_key";
DROP INDEX IF EXISTS "team_members_user_id_workspace_id_key";

-- 3. SPLIT the mixed rows. Under the old one-row-per-workspace rule a person
--    who owned both a Pro and a Team team had ONE row carrying both. That row
--    now has to become two, each holding only its own app's teams.
--    (test123 is exactly this case: {test123's Pro Team, Infinity}.)
INSERT INTO "team_members" (
  "id", "user_id", "workspace_id", "team_ids", "role", "app_context",
  "created_at", "updated_at"
)
SELECT
  -- Deterministic id: same shape as cuid() consumers expect (a text key), and
  -- stable if this migration is ever re-run against a restored backup.
  'tmac_' || substr(md5(tm."id" || ':pro'), 1, 20),
  tm."user_id",
  tm."workspace_id",
  ARRAY(
    SELECT t."id" FROM "teams" t
    WHERE t."id" = ANY(tm."team_ids") AND t."app_context" = 'pro'
  ),
  tm."role",
  'pro',
  tm."created_at",
  NOW()
FROM "team_members" tm
WHERE tm."app_context" = 'team'
  AND EXISTS (
    SELECT 1 FROM "teams" t
    WHERE t."id" = ANY(tm."team_ids") AND t."app_context" = 'pro'
  );

-- 4. Strip the pro teams out of the rows they were split from, so each row
--    lists only the teams belonging to its own app.
UPDATE "team_members" tm
SET "team_ids" = ARRAY(
      SELECT t."id" FROM "teams" t
      WHERE t."id" = ANY(tm."team_ids") AND t."app_context" <> 'pro'
    ),
    "updated_at" = NOW()
WHERE tm."app_context" = 'team'
  AND EXISTS (
    SELECT 1 FROM "teams" t
    WHERE t."id" = ANY(tm."team_ids") AND t."app_context" = 'pro'
  );

-- 5. The new three-part key: one row per (person, workspace, app).
ALTER TABLE "team_members"
  ADD CONSTRAINT "team_members_user_id_workspace_id_app_context_key"
  UNIQUE ("user_id", "workspace_id", "app_context");

-- 6. The switcher's query is `where { userId, appContext }` — index it.
CREATE INDEX IF NOT EXISTS "team_members_user_id_app_context_idx"
  ON "team_members" ("user_id", "app_context");

COMMIT;
