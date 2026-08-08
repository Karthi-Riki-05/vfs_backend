-- Manual migration — the workspace becomes the OWNER, not the team.
--
-- Owner decision (2026-08-07): a workspace is the tenant (the account owner).
-- Teams stop being data boundaries — membership decides which workspace you may
-- ENTER, and everything inside a workspace is shared across all of that owner's
-- teams. `workspace_id` therefore holds a USER id from here on, never a team id.
--
-- ⚠️ IRREVERSIBLE without the backup: the team association on flows/shapes/
-- projects/etc. is not preserved. Restore from
-- backup-before-owner-workspace.sql if this needs undoing.
--
-- Personal rows stop using NULL. Every row now names its workspace explicitly,
-- which also removes the bug-094 failure mode (NULL used to MEAN "personal", so
-- a deleted team quietly re-homed its content into personal space).
--
-- Run with the app stopped, after a backup. Run once.

BEGIN;

-- ── flows ────────────────────────────────────────────────────────────────
-- owner_id ALREADY holds the tenant owner (flow.service sets
-- `resolvedOwnerId = team.teamOwnerId` for team flows, `userId` for personal),
-- so it is exactly the new workspace_id. Drop the team-based column and
-- promote owner_id in its place.
ALTER TABLE flows DROP CONSTRAINT flows_workspace_id_fkey;
DROP INDEX IF EXISTS flows_workspace_id_idx;
ALTER TABLE flows DROP COLUMN workspace_id;
ALTER TABLE flows RENAME COLUMN owner_id TO workspace_id;
ALTER TABLE flows RENAME CONSTRAINT flows_owner_id_fkey TO flows_workspace_id_fkey;
ALTER INDEX flows_owner_id_idx RENAME TO flows_workspace_id_idx;

-- ── drop the team-pointing FKs BEFORE any backfill ───────────────────────
-- The UPDATEs below write USER ids into workspace_id; with the old FK still in
-- place Postgres rejects them ("not present in table teams"). Drop first, add
-- the users(id) versions afterwards.
ALTER TABLE shapes        DROP CONSTRAINT shapes_workspace_id_fkey;
ALTER TABLE shape_groups  DROP CONSTRAINT shape_groups_workspace_id_fkey;
ALTER TABLE projects      DROP CONSTRAINT projects_workspace_id_fkey;
ALTER TABLE issue_list    DROP CONSTRAINT issue_list_workspace_id_fkey;
ALTER TABLE notifications DROP CONSTRAINT notifications_workspace_id_fkey;
ALTER TABLE chat_groups   DROP CONSTRAINT chat_groups_workspace_id_fkey;

-- ── the other seven: team id → that team's owner; NULL → the row's own user ──
UPDATE shapes s
   SET workspace_id = COALESCE(
     (SELECT t.team_owner_id FROM teams t WHERE t.id = s.workspace_id),
     s.owner_id);

UPDATE shape_groups g
   SET workspace_id = COALESCE(
     (SELECT t.team_owner_id FROM teams t WHERE t.id = g.workspace_id),
     g.user_id);

UPDATE projects p
   SET workspace_id = COALESCE(
     (SELECT t.team_owner_id FROM teams t WHERE t.id = p.workspace_id),
     p.created_by);

UPDATE issue_list i
   SET workspace_id = COALESCE(
     (SELECT t.team_owner_id FROM teams t WHERE t.id = i.workspace_id),
     i.created_by);

UPDATE notifications n
   SET workspace_id = COALESCE(
     (SELECT t.team_owner_id FROM teams t WHERE t.id = n.workspace_id),
     n.user_id);

-- chat_groups: MARK FIRST, BACKFILL SECOND. There is no is_direct/team_chat
-- column — a DM is identified purely BY its null workspace_id, so once every
-- row carries a workspace the distinction is unrecoverable. Capture it now.
ALTER TABLE chat_groups ADD COLUMN is_workspace_room BOOLEAN NOT NULL DEFAULT false;

-- The old unique fires DURING the backfill, not after it: several of one
-- owner's rooms (live + soft-deleted) collapse onto the same
-- (workspace_id, app_context). Drop it before writing anything.
ALTER TABLE chat_groups DROP CONSTRAINT chat_groups_workspace_id_app_context_key;

-- Today's team rooms are exactly the rows with a (team) workspace_id.
UPDATE chat_groups SET is_workspace_room = true
 WHERE workspace_id IS NOT NULL AND deleted_at IS NULL;

UPDATE chat_groups c
   SET workspace_id = COALESCE(
     (SELECT t.team_owner_id FROM teams t WHERE t.id = c.workspace_id),
     c.user_id);

-- If an owner ran more than one team, their rooms now collapse onto the same
-- workspace. Only the oldest may keep the canonical flag — the rest stay as
-- ordinary groups rather than being lost.
UPDATE chat_groups SET is_workspace_room = false
 WHERE is_workspace_room
   AND id NOT IN (
     SELECT DISTINCT ON (workspace_id, app_context) id
       FROM chat_groups
      WHERE is_workspace_room
      ORDER BY workspace_id, app_context, created_at NULLS LAST, id);

UPDATE ai_jobs a
   SET workspace_id = COALESCE(
     (SELECT t.team_owner_id FROM teams t WHERE t.id = a.workspace_id),
     a.user_id);

-- ── retarget every FK from teams(id) to users(id) ────────────────────────
-- ON DELETE CASCADE throughout: deleting a USER now removes their workspace's
-- content, which is the same rule their own personal rows already followed.
ALTER TABLE shapes        ADD  CONSTRAINT shapes_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE shape_groups  ADD  CONSTRAINT shape_groups_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE projects      ADD  CONSTRAINT projects_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE issue_list    ADD  CONSTRAINT issue_list_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE notifications ADD  CONSTRAINT notifications_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE chat_groups   ADD  CONSTRAINT chat_groups_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- ── chat: the canonical workspace room ───────────────────────────────────
-- The old @@unique([workspace_id, app_context]) worked only because DMs and
-- named groups carried NULL (Postgres treats NULL != NULL). Now that EVERY
-- group names its workspace, that constraint would permit exactly one chat
-- group per workspace and break DMs outright. Replace it with a PARTIAL unique
-- covering only the canonical room (flag set further up, before the backfill;
-- the old constraint is dropped up there too, since it fires mid-backfill).
CREATE UNIQUE INDEX chat_groups_workspace_room_key
    ON chat_groups (workspace_id, app_context)
 WHERE is_workspace_room;

COMMIT;
