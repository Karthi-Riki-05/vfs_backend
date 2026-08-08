-- bug-096 — one chat room per TEAM, not per workspace.
--
-- Before: chat_groups was keyed on (workspace_id, app_context, is_workspace_room),
-- so every team an owner ran resolved to ONE room. Two teams in the Teams tab
-- shared a single message history, and a member of only one could read the other.
--
-- Additive: adds a nullable column and re-keys the unique index. No data is
-- dropped. The existing room is attached to the owner's OLDEST non-system team
-- in the same app context, so current conversations keep their team.
BEGIN;

ALTER TABLE chat_groups ADD COLUMN IF NOT EXISTS team_id TEXT;

-- Backfill: give each existing canonical room the owner's oldest matching team.
UPDATE chat_groups cg
   SET team_id = t.id
  FROM (
    SELECT DISTINCT ON (team_owner_id, app_context)
           id, team_owner_id, app_context
      FROM teams
     WHERE deleted_at IS NULL
       AND (verify_team IS NULL OR verify_team <> 'system')
     ORDER BY team_owner_id, app_context, created_at ASC
  ) t
 WHERE cg.is_workspace_room IS TRUE
   AND cg.team_id IS NULL
   AND cg.workspace_id = t.team_owner_id
   AND cg.app_context  = t.app_context;

-- Re-key the unique. Named groups and DMs keep is_workspace_room NULL, so
-- Postgres' NULL != NULL rule still leaves them unconstrained.
ALTER TABLE chat_groups
  DROP CONSTRAINT IF EXISTS chat_groups_workspace_id_app_context_is_workspace_room_key;

CREATE UNIQUE INDEX IF NOT EXISTS chat_groups_workspace_id_team_id_app_context_is_workspace_r_key
  ON chat_groups (workspace_id, team_id, app_context, is_workspace_room);

CREATE INDEX IF NOT EXISTS chat_groups_team_id_idx ON chat_groups (team_id);

COMMIT;
