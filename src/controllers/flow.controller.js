const flowService = require("../services/flow.service");
const flowLimitService = require("../services/flowLimit.service");
const asyncHandler = require("../utils/asyncHandler");
const { prisma } = require("../lib/prisma");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const { docUpload } = require("../middleware/docUpload");
const aiCreditService = require("../services/aiCredit.service");
const aiDetectService = require("../services/aiDetect.service");
const { resolveAppContextForBilling } = require("./aiCredit.controller");
const {
  workspaceHeader,
  workspaceQuery,
  workspaceBody,
} = require("../lib/workspaceContext");

class FlowController {
  getAllFlows = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const {
      search,
      page,
      limit,
      nonEmpty,
      sort,
      sortDirection,
      isFavorite,
      projectId,
    } = req.query;
    // workspaceId may arrive as a query param or via the X-Workspace-Context header
    // set by the frontend axios interceptor.
    const workspaceId = workspaceQuery(req) || workspaceHeader(req) || null;
    const result = await flowService.getAllFlows(
      userId,
      {
        search,
        page,
        limit,
        nonEmpty,
        workspaceId,
        sort,
        sortDirection,
        // Query params arrive as strings — normalize to a real boolean.
        isFavorite: isFavorite === "true",
        projectId,
      },
      appContext,
    );
    const shared = await flowService.getSharedFlows(
      userId,
      appContext,
      workspaceId || null,
    );
    res.json({ success: true, data: { ...result, shared } });
  });

  getMasterViewFlows = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    // Default to the caller's OWN workspace when no header is present. The old
    // code returned empty here, which broke the panel for an owner sitting in
    // their personal context (the switcher does not always send a header for
    // it) — the one caller this endpoint exists for.
    const workspaceId = workspaceHeader(req) || userId;
    // Only the workspace OWNER sees this. The workspace id IS the owner's user
    // id (owner-as-workspace, 2026-08-07), so ownership is a comparison.
    //
    // This was `team.findFirst({ id: workspaceId, teamOwnerId: userId })`, which
    // could not match any row after that rename: workspaceId is a USER id, so
    // `team` was always null and the endpoint returned an empty list to
    // EVERYONE, the owner included. Nobody noticed because it fails to `[]`
    // rather than a 403 — which is still deliberate (see below).
    if (workspaceId !== userId) {
      // Empty, not 403: a member switched into someone else's workspace has a
      // legitimate reason to hit this, and the response must not reveal whether
      // that workspace has member-created flows in it.
      return res.json({ success: true, data: { flows: [], total: 0 } });
    }
    const flows = await flowService.getOwnerMasterFlows(
      userId,
      workspaceId,
      appContext,
    );
    res.json({ success: true, data: { flows, total: flows.length } });
  });

  getFlowById = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const workspaceId = workspaceHeader(req) || null;
    const flow = await flowService.getFlowByIdWithAccess(
      req.params.id,
      userId,
      appContext,
      workspaceId,
    );
    if (!flow) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Flow not found" },
      });
    }
    res.json({ success: true, data: flow });
  });

  createFlow = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    // workspaceId may also come from a header (axios interceptor) so both are
    // accepted.
    const workspaceId = workspaceBody(req) || workspaceHeader(req) || null;
    const flow = await flowService.createFlow(
      userId,
      { ...req.body, workspaceId: workspaceId || null },
      appContext,
    );
    res.status(201).json({ success: true, data: flow });
  });

  updateFlow = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    await flowService.updateFlowWithAccess(
      req.params.id,
      userId,
      req.body,
      appContext,
    );
    res.json({ success: true, data: { message: "Flow updated successfully" } });
  });

  deleteFlow = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    await flowService.deleteFlow(req.params.id, userId);
    res.json({ success: true, data: { message: "Flow deleted successfully" } });
  });

  duplicateFlow = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const flow = await flowService.duplicateFlow(
      req.params.id,
      userId,
      appContext,
    );
    res.status(201).json({ success: true, data: flow });
  });

  updateDiagramState = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { groupId, newShape } = req.body;
    const updatedDiagram = await flowService.updateDiagramState(
      req.params.id,
      userId,
      groupId,
      newShape,
    );
    res.json({ success: true, data: updatedDiagram });
  });

  getFavorites = asyncHandler(async (req, res) => {
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const workspaceId = workspaceQuery(req) || workspaceHeader(req) || null;
    const flows = await flowService.getFavorites(
      req.user.id,
      appContext,
      workspaceId,
    );
    res.json({ success: true, data: flows });
  });

  getTrash = asyncHandler(async (req, res) => {
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const workspaceId = workspaceQuery(req) || workspaceHeader(req) || null;
    const result = await flowService.getTrash(
      req.user.id,
      req.query,
      appContext,
      workspaceId,
    );
    res.json({ success: true, data: result });
  });

  // Both take the SAME appContext + workspace as getTrash — the row you can
  // see in the trash is the row you can act on. Neither passed either before,
  // so the service fell back to `workspaceId: userId` and a member could never
  // restore or purge their own deleted flow (bug-114).
  restoreFlow = asyncHandler(async (req, res) => {
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const workspaceId = workspaceQuery(req) || workspaceHeader(req) || null;
    await flowService.restoreFlow(
      req.params.id,
      req.user.id,
      appContext,
      workspaceId,
    );
    res.json({
      success: true,
      data: { message: "Flow restored successfully" },
    });
  });

  permanentDeleteFlow = asyncHandler(async (req, res) => {
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const workspaceId = workspaceQuery(req) || workspaceHeader(req) || null;
    await flowService.permanentDeleteFlow(
      req.params.id,
      req.user.id,
      appContext,
      workspaceId,
    );
    res.json({ success: true, data: { message: "Flow permanently deleted" } });
  });

  emptyTrash = asyncHandler(async (req, res) => {
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    // Same workspace resolution as getTrash — the list and the wipe must read
    // the identical scope or the wipe exceeds what was shown.
    const workspaceId = workspaceQuery(req) || workspaceHeader(req) || null;
    const result = await flowService.emptyTrash(
      req.user.id,
      appContext,
      workspaceId,
    );
    res.json({
      success: true,
      data: { message: "Trash emptied", deleted: result.count },
    });
  });

  // ==================== SHARING ====================

  shareFlow = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const results = await flowService.shareFlow(
      req.params.id,
      userId,
      req.body.shares,
      appContext,
    );
    res.json({ success: true, data: results });
  });

  getFlowShares = asyncHandler(async (req, res) => {
    const shares = await flowService.getFlowShares(req.params.id, req.user.id);
    res.json({ success: true, data: shares });
  });

  updateShare = asyncHandler(async (req, res) => {
    await flowService.updateShare(
      req.params.id,
      req.params.shareId,
      req.user.id,
      req.body.permission,
    );
    res.json({ success: true, data: { message: "Permission updated" } });
  });

  removeShare = asyncHandler(async (req, res) => {
    await flowService.removeShare(
      req.params.id,
      req.params.shareId,
      req.user.id,
    );
    res.json({ success: true, data: { message: "Share removed" } });
  });

  getAvailableShareMembers = asyncHandler(async (req, res) => {
    const result = await flowService.getAvailableShareMembers(req.user.id);
    res.json({ success: true, data: result });
  });

  getAllFlowsWithShared = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const { search, page, limit, nonEmpty } = req.query;
    const workspaceId = workspaceQuery(req) || workspaceHeader(req) || null;
    const own = await flowService.getAllFlows(
      userId,
      { search, page, limit, nonEmpty, workspaceId },
      appContext,
    );
    const shared = await flowService.getSharedFlows(
      userId,
      appContext,
      workspaceId || null,
    );
    res.json({ success: true, data: { ...own, shared } });
  });

  getFlowByIdWithAccess = asyncHandler(async (req, res) => {
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const workspaceId = workspaceHeader(req) || null;
    const flow = await flowService.getFlowByIdWithAccess(
      req.params.id,
      req.user.id,
      appContext,
      workspaceId,
    );
    if (!flow) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Flow not found" },
      });
    }
    res.json({ success: true, data: flow });
  });

  updateFlowWithAccess = asyncHandler(async (req, res) => {
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    await flowService.updateFlowWithAccess(
      req.params.id,
      req.user.id,
      req.body,
      appContext,
    );
    res.json({ success: true, data: { message: "Flow updated successfully" } });
  });

  duplicateSharedFlow = asyncHandler(async (req, res) => {
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const flow = await flowService.duplicateSharedFlow(
      req.params.id,
      req.user.id,
      appContext,
    );
    res.status(201).json({ success: true, data: flow });
  });

  generateFromDocument = [
    docUpload.single("document"),
    asyncHandler(async (req, res) => {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: { message: "No file uploaded" } });
      }
      if (!req.file.size || req.file.size <= 0) {
        return res.status(400).json({
          success: false,
          error: { code: "EMPTY_FILE", message: "Empty file uploaded" },
        });
      }

      let extractedText = "";
      const mime = req.file.mimetype;

      if (mime === "application/pdf") {
        const parsed = await pdfParse(req.file.buffer);
        extractedText = parsed.text;
      } else if (
        mime ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        mime === "application/msword"
      ) {
        const result = await mammoth.extractRawText({
          buffer: req.file.buffer,
        });
        extractedText = result.value;
      } else {
        return res.status(400).json({
          success: false,
          error: { message: "Only PDF and Word files are supported" },
        });
      }

      if (!extractedText || extractedText.trim().length < 20) {
        return res.status(400).json({
          success: false,
          error: { message: "Could not extract text from document" },
        });
      }

      // Resolve billing context (shared with aiCredit.controller) and ensure
      // the user has at least one diagram credit BEFORE spending an AI call.
      const workspaceId = workspaceHeader(req) || null;
      const appContext = await resolveAppContextForBilling(
        req.user.id,
        req.headers["x-app-context"],
        workspaceId,
        req.user.currentVersion,
      );
      if (
        !(await aiCreditService.hasCredits(
          req.user.id,
          appContext,
          workspaceId,
        ))
      ) {
        return res.status(402).json({
          success: false,
          error: {
            code: "INSUFFICIENT_CREDITS",
            message: "You have used all your diagram credits.",
          },
        });
      }

      // Step 9 — unified with the interactive path: the model picks the
      // diagram family, complexity drives provider routing (Free/SIMPLE →
      // Gemini, paid MEDIUM/COMPLEX → Claude) and token-based billing. All of
      // that lives in aiDetect.service (single source of truth).
      const {
        xml: generatedXml,
        model,
        usage,
        complexity,
      } = await aiDetectService.generateDiagramXmlFromText(
        extractedText,
        req.user,
      );
      let xml = generatedXml;

      if (!xml || !xml.includes("<mxGraphModel")) {
        return res.status(500).json({
          success: false,
          error: { message: "AI did not return valid diagram XML" },
        });
      }

      // Normalize AI mistakes: shapes/edges must live under the default layer (id=1),
      // not directly under the root cell (id=0). The AI frequently uses parent="0".
      // Step 1: re-parent every mxCell with parent="0" to parent="1".
      xml = xml.replace(/(<mxCell\b[^>]*\bparent=")0(")/g, "$11$2");
      // Step 2: cell id="1" is the default layer and MUST have parent="0".
      // Restore that explicitly (handles both attribute orders).
      xml = xml.replace(
        /<mxCell\s+id="1"\s+parent="1"(\s*\/?>)/g,
        '<mxCell id="1" parent="0"$1',
      );
      xml = xml.replace(
        /<mxCell\s+parent="1"\s+id="1"(\s*\/?>)/g,
        '<mxCell id="1" parent="0"$1',
      );
      // Step 3: cell id="0" must NOT have a parent.
      xml = xml.replace(
        /<mxCell\s+id="0"\s+parent="[^"]*"(\s*\/?>)/g,
        '<mxCell id="0"$1',
      );
      xml = xml.replace(
        /<mxCell\s+parent="[^"]*"\s+id="0"(\s*\/?>)/g,
        '<mxCell id="0"$1',
      );

      // Charge by actual token usage (Step 7/9), clamped to the complexity
      // estimate range, only after a successful generation. If generation had
      // failed it would have thrown above (asyncHandler → error response)
      // before reaching here, so nothing is over-charged.
      const estimate =
        complexity && typeof aiDetectService.estimateCredits === "function"
          ? aiDetectService.estimateCredits(complexity)
          : null;
      await aiCreditService.deductCredit(
        req.user.id,
        "diagram_generation",
        model,
        appContext,
        workspaceId,
        {
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          capMin: estimate?.min,
          capMax: estimate?.max,
        },
      );

      res.json({ success: true, data: { xml } });
    }),
  ];

  getFlowVersions = asyncHandler(async (req, res) => {
    const flowId = req.params.id;
    const userId = req.user.id;

    // Owner can always read their own versions.
    // Super admin gets read-only access for support / audit (same pattern
    // as getFlowByIdWithAccess).
    const flow = await prisma.flow.findFirst({
      where: { id: flowId, deletedAt: null },
    });
    if (!flow) {
      return res.status(404).json({
        success: false,
        error: { message: "Flow not found" },
      });
    }

    if (flow.ownerId !== userId) {
      // Shared members (any permission) can view history — it's read-only.
      // If this flow belongs to a team, every team member can see it.
      // Super admin keeps read access for support / audit.
      const [share, teamMember, requester] = await Promise.all([
        prisma.flowShare.findFirst({
          where: { flowId, sharedWithId: userId },
          select: { id: true },
        }),
        flow.workspaceId
          ? prisma.teamMember.findFirst({
              where: { workspaceId: flow.workspaceId, userId },
              select: { id: true },
            })
          : Promise.resolve(null),
        prisma.user.findUnique({
          where: { id: userId },
          select: { role: true },
        }),
      ]);
      const isSuperAdmin = requester?.role === "super_admin";
      if (!share && !teamMember && !isSuperAdmin) {
        return res.status(403).json({
          success: false,
          error: { message: "Access denied" },
        });
      }
    }

    const versions = await prisma.flowVersion.findMany({
      where: { flowId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        savedBy: { select: { id: true, name: true, email: true } },
      },
    });

    res.json({ success: true, data: versions });
  });

  restoreFlowVersion = asyncHandler(async (req, res) => {
    const result = await flowService.restoreFlowVersion(
      req.params.id,
      req.params.versionId,
      req.user.id,
    );
    res.json({ success: true, data: result });
  });

  pickerList = asyncHandler(async (req, res) => {
    const flows = await flowService.getPickerList(
      req.user.id,
      req.query.teamPicker === "true",
      workspaceQuery(req) || workspaceHeader(req) || null,
    );
    res.json({ success: true, data: flows });
  });

  confirmSelection = asyncHandler(async (req, res) => {
    const result = await flowService.confirmSelection(
      req.user.id,
      req.body?.selectedFlowIds || [],
      !!req.body?.teamPicker,
      workspaceBody(req) || workspaceHeader(req) || null,
    );
    res.json({ success: true, data: result });
  });

  packStatus = asyncHandler(async (req, res) => {
    const workspaceId = workspaceHeader(req) || null;
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const status = await flowService.getPackStatus(
      req.user.id,
      workspaceId,
      appContext,
    );
    res.json({ success: true, data: status });
  });

  // Over-limit lock endpoints
  getLockState = asyncHandler(async (req, res) => {
    const appType =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    // Pass the active workspace so a member sees the OWNER's lock (bug-125).
    const workspaceId = workspaceQuery(req) || workspaceHeader(req) || null;
    const state = await flowLimitService.getLockState(
      req.user.id,
      appType,
      workspaceId,
    );
    res.json({ success: true, data: { ...state, appType } });
  });

  markModalShown = asyncHandler(async (req, res) => {
    const { appType } = req.body;
    await flowLimitService.markModalShown(req.user.id, appType);
    res.json({ success: true, data: { marked: true } });
  });

  getFlowsForPicker = asyncHandler(async (req, res) => {
    const appType =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const flows = await flowLimitService.getFlowsForPicker(
      req.user.id,
      appType,
    );
    res.json({ success: true, data: flows });
  });

  resolveOverLimit = asyncHandler(async (req, res) => {
    const { appType, selectedFlowIds } = req.body;
    const result = await flowLimitService.resolveOverLimit(
      req.user.id,
      appType,
      selectedFlowIds,
    );
    res.json({ success: true, data: result });
  });

  checkExpiry = asyncHandler(async (req, res) => {
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const flowPackExpiry = require("../services/flowPackExpiry.service");
    const result = await flowPackExpiry.checkAndApplyExpiry(
      req.user.id,
      appContext,
    );
    res.json({ success: true, data: result });
  });
}

module.exports = new FlowController();
