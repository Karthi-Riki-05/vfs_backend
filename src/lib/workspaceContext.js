// The ONE place that answers "which workspace is this request scoped to?".
//
// The header was renamed `X-Team-Context` → `X-Workspace-Context` (2026-08-07).
// Both are read, new name first, so a frontend/backend deploy skew cannot blank
// every user's workspace for the duration of the rollout. Drop the legacy read
// one release after the frontend that sends the new name is fully deployed.
//
// Request-body / query-string keys are read under both names for the same
// reason. The scoping COLUMN is `workspace_id` everywhere (see the manual
// migration 2026-08-07-rename-team-id-to-workspace-id.sql).

const WORKSPACE_HEADER = "x-workspace-context";
const LEGACY_HEADER = "x-team-context";

/** Workspace id from the request headers, or null. */
function workspaceHeader(req) {
  return req?.headers?.[WORKSPACE_HEADER] || req?.headers?.[LEGACY_HEADER] || null;
}

/** Workspace id from the query string, or null. */
function workspaceQuery(req) {
  return req?.query?.workspaceId || req?.query?.teamId || null;
}

/** Workspace id from the request body, or null. */
function workspaceBody(req) {
  return req?.body?.workspaceId || req?.body?.teamId || null;
}

module.exports = {
  WORKSPACE_HEADER,
  LEGACY_HEADER,
  workspaceHeader,
  workspaceQuery,
  workspaceBody,
};
