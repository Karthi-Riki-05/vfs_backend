-- Follow-up to 2026-08-07b.
--
-- A PARTIAL unique index (`... WHERE is_workspace_room`) is the natural way to
-- say "one canonical room per workspace", but Prisma cannot express it — and
-- docker-compose runs `prisma db push` on every backend start, which drops any
-- index the schema does not declare. The guarantee would evaporate on the next
-- restart.
--
-- Same guarantee, expressed in a form Prisma CAN model: make the flag nullable
-- and store true / NULL (never false). Postgres treats NULL != NULL, so only
-- the `true` rows are constrained — exactly the trick the old
-- @@unique([workspaceId, appContext]) relied on when DMs carried a null
-- workspace.

BEGIN;

DROP INDEX chat_groups_workspace_room_key;

ALTER TABLE chat_groups ALTER COLUMN is_workspace_room DROP DEFAULT;
ALTER TABLE chat_groups ALTER COLUMN is_workspace_room DROP NOT NULL;
UPDATE chat_groups SET is_workspace_room = NULL WHERE is_workspace_room = false;

CREATE UNIQUE INDEX chat_groups_workspace_id_app_context_is_workspace_room_key
    ON chat_groups (workspace_id, app_context, is_workspace_room);

COMMIT;
