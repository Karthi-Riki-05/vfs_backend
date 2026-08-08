"use strict";

/**
 * The WORKSPACE's own chat room — the single conversation that belongs to a
 * workspace, as opposed to the ad-hoc groups and DMs people create inside it.
 *
 * WHY THIS EXISTS (bug-093). The room used to be created LAZILY, by whoever
 * clicked the team first in the Chat tab (frontend
 * RightChatColumn.handleTeamChatOpen → POST /chat/groups). That request runs
 * through the CSV-51 permission gate, which only lets an OWNER or ADMIN create
 * groups in a workspace. So if a plain MEMBER clicked first they got 403
 * TEAM_GROUP_CREATE_FORBIDDEN and were stuck for good: they could not open the
 * room (it did not exist) and could not create it (not an admin). Whether chat
 * worked at all came down to who happened to click first.
 *
 * WHAT CHANGED (bug-096, 2026-08-08). A room belongs to a TEAM, inside a
 * workspace: `chat_groups.workspace_id` holds the owner's USER id and
 * `chat_groups.team_id` the team, keyed by
 * `@@unique([workspaceId, teamId, appContext, isWorkspaceRoom])`.
 *
 * Between 2026-08-07 and this change the room was keyed on the workspace ALONE,
 * so an owner running three teams had ONE shared conversation: three rows in the
 * Teams tab pointing at the same history, and a member of one team could read
 * the others. Teams are a grouping of PEOPLE, so a conversation per team is the
 * boundary users actually expect — and the only one that matches the tab list.
 *
 * `isWorkspaceRoom` stores `true` or NULL — never `false` — so Postgres'
 * NULL != NULL rule leaves DMs and named groups unconstrained by that unique.
 *
 * Every function takes a Prisma client or transaction as `db` so callers can
 * keep the room in the same transaction as the team write.
 */

/**
 * A `verifyTeam: "system"` billing shell gets no room: those teams are hidden
 * from the Teams list (team.service.getTeams) and from chat
 * (chat.service.getSidebarData), so a room for one could never be opened.
 */
function teamShouldHaveRoom(team) {
  return !!team && team.verifyTeam !== "system";
}

/**
 * The workspace's canonical room, or null.
 *
 * `includeDeleted` matters because of the partial unique: a SOFT-deleted room
 * still occupies the slot, so a plain `deletedAt: null` lookup reports "no
 * room" while an INSERT would fail on the constraint. Anything about to create
 * a room must ask with `includeDeleted: true` and revive what it finds;
 * anything deciding what to SHOW should use the default.
 */
async function findTeamRoom(
  db,
  workspaceId,
  teamId,
  { includeDeleted = false } = {},
) {
  if (!workspaceId || !teamId) return null;
  return db.chatGroup.findFirst({
    where: {
      workspaceId,
      teamId,
      isWorkspaceRoom: true,
      ...(includeDeleted ? {} : { deletedAt: null }),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, deletedAt: true },
  });
}

/**
 * Ensure the workspace has its canonical room, and put `creatorId` in it.
 *
 * Called on every team create — but creates at most ONE room per workspace, so
 * the second and third team simply join the room that already exists. Returns
 * the room, or null when the team should not have one.
 */
async function createTeamRoom(db, { team, creatorId, appContext }) {
  if (!teamShouldHaveRoom(team)) return null;

  // The workspace is the team's OWNER — never the team id (workspace_id is a
  // FK to users now).
  const workspaceId = team.teamOwnerId;
  if (!workspaceId) return null;

  const now = new Date();

  // Revive rather than insert alongside: a soft-deleted room still holds the
  // unique slot, so deleting a chat once (DELETE /chat/groups/:id) would
  // otherwise kill the workspace's chat forever, with no path back for anyone
  // including the owner.
  const existing = await findTeamRoom(db, workspaceId, team.id, {
    includeDeleted: true,
  });
  if (existing) {
    if (existing.deletedAt) {
      await db.chatGroup.update({
        where: { id: existing.id },
        data: { deletedAt: null, updatedAt: now },
      });
    }
    await db.chatGroupUser.createMany({
      data: [{ userId: creatorId, groupId: existing.id, createdAt: now }],
      skipDuplicates: true,
    });
    return existing;
  }

  const title = team.name || "Team Chat";
  const group = await db.chatGroup.create({
    data: {
      title,
      userId: creatorId,
      workspaceId,
      teamId: team.id,
      isWorkspaceRoom: true,
      appContext: appContext || team.appContext || "team",
      appType: team.appType || null,
      // Nullable with no @default — set explicitly (same reason as
      // chat.service.createChatGroup).
      flowId: 0,
      flowItemId: "",
      createdAt: now,
      updatedAt: now,
    },
  });

  await db.chatGroupUser.createMany({
    data: [{ userId: creatorId, groupId: group.id, createdAt: now }],
    skipDuplicates: true,
  });

  const creator = await db.user.findUnique({
    where: { id: creatorId },
    select: { name: true, email: true },
  });
  await db.chatMessage.create({
    data: {
      message: `${creator?.name || creator?.email || "Someone"} created the group "${title}"`,
      groupId: group.id,
      userId: creatorId,
      type: "text",
      createdAt: now,
      updatedAt: now,
    },
  });

  return group;
}

/**
 * Put a user in the workspace's room. Idempotent — relies on
 * @@unique([groupId, userId]) (bug-058), so a re-accepted invite or a double
 * add is a no-op rather than a duplicate row.
 */
async function addUserToTeamRoom(db, workspaceId, teamId, userId) {
  const room = await findTeamRoom(db, workspaceId, teamId);
  if (!room) return null;
  await db.chatGroupUser.createMany({
    data: [{ userId, groupId: room.id, createdAt: new Date() }],
    skipDuplicates: true,
  });
  return room;
}

/**
 * Drop a user from the workspace's room when they lose access — otherwise a
 * removed member keeps the conversation in their sidebar and goes on receiving
 * messages, since chat.service scopes groups by chat_group_users membership.
 *
 * bug-096: rooms are per TEAM again, so this removes them from ONE team's
 * conversation. Leaving a team no longer risks cutting them out of a
 * conversation they still belong to — their other teams have their own rooms.
 */
async function removeUserFromTeamRoom(db, workspaceId, teamId, userId) {
  const room = await findTeamRoom(db, workspaceId, teamId);
  if (!room) return null;
  await db.chatGroupUser.deleteMany({
    where: { groupId: room.id, userId },
  });
  return room;
}

/**
 * Drop a user from EVERY team room in a workspace — used when their workspace
 * access is revoked outright (team.service.removeUserFromWorkspace). Per-team
 * removal is the narrower `removeUserFromTeamRoom`.
 */
async function removeUserFromAllWorkspaceRooms(db, workspaceId, userId) {
  if (!workspaceId || !userId) return 0;
  const rooms = await db.chatGroup.findMany({
    where: { workspaceId, isWorkspaceRoom: true },
    select: { id: true },
  });
  if (!rooms.length) return 0;
  const res = await db.chatGroupUser.deleteMany({
    where: { groupId: { in: rooms.map((r) => r.id) }, userId },
  });
  return res.count;
}

/**
 * Soft-delete a team's room. bug-096 made rooms per-team, which finally makes
 * this meaningful: deleting a team can close ITS conversation without touching
 * the other teams in the same workspace.
 */
async function closeTeamRoom(db, teamId) {
  if (!teamId) return 0;
  const res = await db.chatGroup.updateMany({
    where: { teamId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return res.count;
}

module.exports = {
  teamShouldHaveRoom,
  findTeamRoom,
  createTeamRoom,
  addUserToTeamRoom,
  removeUserFromTeamRoom,
  removeUserFromAllWorkspaceRooms,
  closeTeamRoom,
};
