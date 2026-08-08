-- Manual migration — workspace-scoping rename.
-- team_id (and shape_groups.workspace_team_id) -> workspace_id on the EIGHT
-- tables where the column means "which workspace does this row live in".
--
-- NOT touched: team_members.team_id / team_invites.team_id (real team
-- membership), shapes.associated_team_id (shared team library association),
-- add_user_subscriptions.team_id (dead table), and the legacy int team_id
-- columns on chat_messages / chat_message_users / flow_group_users /
-- vsm_options / shape_groups.
--
-- RENAME COLUMN preserves every value, index and foreign key — no data loss.
-- Index and constraint names are renamed to the identifiers Prisma generates,
-- so `prisma db push` reports no drift after this runs.
--
-- Run with the app stopped, after a backup. Idempotent it is NOT — run once.

BEGIN;

-- 1. columns ---------------------------------------------------------------
ALTER TABLE flows          RENAME COLUMN team_id           TO workspace_id;
ALTER TABLE shapes         RENAME COLUMN team_id           TO workspace_id;
ALTER TABLE shape_groups   RENAME COLUMN workspace_team_id TO workspace_id;
ALTER TABLE chat_groups    RENAME COLUMN team_id           TO workspace_id;
ALTER TABLE issue_list     RENAME COLUMN team_id           TO workspace_id;
ALTER TABLE projects       RENAME COLUMN team_id           TO workspace_id;
ALTER TABLE notifications  RENAME COLUMN team_id           TO workspace_id;
ALTER TABLE ai_jobs        RENAME COLUMN team_id           TO workspace_id;

-- 2. indexes ---------------------------------------------------------------
ALTER INDEX flows_team_id_idx                    RENAME TO flows_workspace_id_idx;
ALTER INDEX shapes_team_id_idx                   RENAME TO shapes_workspace_id_idx;
ALTER INDEX shape_groups_workspace_team_id_idx   RENAME TO shape_groups_workspace_id_idx;
ALTER INDEX chat_groups_team_id_idx              RENAME TO chat_groups_workspace_id_idx;
ALTER INDEX issue_list_team_id_idx               RENAME TO issue_list_workspace_id_idx;
ALTER INDEX projects_team_id_idx                 RENAME TO projects_workspace_id_idx;
ALTER INDEX notifications_team_id_idx            RENAME TO notifications_workspace_id_idx;
ALTER INDEX notifications_user_id_team_id_is_read_idx
                                                 RENAME TO notifications_user_id_workspace_id_is_read_idx;

-- 3. constraints -----------------------------------------------------------
ALTER TABLE flows         RENAME CONSTRAINT flows_team_id_fkey        TO flows_workspace_id_fkey;
ALTER TABLE shapes        RENAME CONSTRAINT shapes_team_id_fkey       TO shapes_workspace_id_fkey;
ALTER TABLE shape_groups  RENAME CONSTRAINT shape_groups_workspace_team_id_fkey
                                                                     TO shape_groups_workspace_id_fkey;
ALTER TABLE chat_groups   RENAME CONSTRAINT chat_groups_team_id_fkey  TO chat_groups_workspace_id_fkey;
ALTER TABLE chat_groups   RENAME CONSTRAINT chat_groups_team_id_app_context_key
                                                                     TO chat_groups_workspace_id_app_context_key;
ALTER TABLE issue_list    RENAME CONSTRAINT issue_list_team_id_fkey   TO issue_list_workspace_id_fkey;
ALTER TABLE projects      RENAME CONSTRAINT projects_team_id_fkey     TO projects_workspace_id_fkey;
ALTER TABLE notifications RENAME CONSTRAINT notifications_team_id_fkey
                                                                     TO notifications_workspace_id_fkey;

COMMIT;
