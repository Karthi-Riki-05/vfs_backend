const flowService = require("../services/flow.service");
const asyncHandler = require("../utils/asyncHandler");
const { prisma } = require("../lib/prisma");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const OpenAI = require("openai");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

class FlowController {
  getAllFlows = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const appContext = req.user.currentVersion || "free";
    const { search, page, limit, nonEmpty, draftsOnly } = req.query;
    const result = await flowService.getAllFlows(
      userId,
      { search, page, limit, nonEmpty, draftsOnly },
      appContext,
    );
    const shared = await flowService.getSharedFlows(userId, appContext);
    res.json({ success: true, data: { ...result, shared } });
  });

  getFlowById = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const flow = await flowService.getFlowByIdWithAccess(req.params.id, userId);
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
    const appContext = req.user.currentVersion || "free";
    const flow = await flowService.createFlow(userId, req.body, appContext);
    res.status(201).json({ success: true, data: flow });
  });

  updateFlow = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    await flowService.updateFlowWithAccess(req.params.id, userId, req.body);
    res.json({ success: true, data: { message: "Flow updated successfully" } });
  });

  deleteFlow = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    await flowService.deleteFlow(req.params.id, userId);
    res.json({ success: true, data: { message: "Flow deleted successfully" } });
  });

  duplicateFlow = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const appContext = req.user.currentVersion || "free";
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
    const appContext = req.user.currentVersion || "free";
    const flows = await flowService.getFavorites(req.user.id, appContext);
    res.json({ success: true, data: flows });
  });

  getTrash = asyncHandler(async (req, res) => {
    const appContext = req.user.currentVersion || "free";
    const result = await flowService.getTrash(
      req.user.id,
      req.query,
      appContext,
    );
    res.json({ success: true, data: result });
  });

  restoreFlow = asyncHandler(async (req, res) => {
    await flowService.restoreFlow(req.params.id, req.user.id);
    res.json({
      success: true,
      data: { message: "Flow restored successfully" },
    });
  });

  permanentDeleteFlow = asyncHandler(async (req, res) => {
    await flowService.permanentDeleteFlow(req.params.id, req.user.id);
    res.json({ success: true, data: { message: "Flow permanently deleted" } });
  });

  // ==================== SHARING ====================

  shareFlow = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const appContext = req.user.currentVersion || "free";
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
    const members = await flowService.getAvailableShareMembers(req.user.id);
    res.json({ success: true, data: members });
  });

  getAllFlowsWithShared = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const appContext = req.user.currentVersion || "free";
    const { search, page, limit, nonEmpty, draftsOnly } = req.query;
    const own = await flowService.getAllFlows(
      userId,
      { search, page, limit, nonEmpty, draftsOnly },
      appContext,
    );
    const shared = await flowService.getSharedFlows(userId, appContext);
    res.json({ success: true, data: { ...own, shared } });
  });

  getFlowByIdWithAccess = asyncHandler(async (req, res) => {
    const flow = await flowService.getFlowByIdWithAccess(
      req.params.id,
      req.user.id,
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
    await flowService.updateFlowWithAccess(
      req.params.id,
      req.user.id,
      req.body,
    );
    res.json({ success: true, data: { message: "Flow updated successfully" } });
  });

  duplicateSharedFlow = asyncHandler(async (req, res) => {
    const appContext = req.user.currentVersion || "free";
    const flow = await flowService.duplicateSharedFlow(
      req.params.id,
      req.user.id,
      appContext,
    );
    res.status(201).json({ success: true, data: flow });
  });

  generateFromDocument = [
    upload.single("document"),
    asyncHandler(async (req, res) => {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: { message: "No file uploaded" } });
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

      const systemPrompt = `You are a Value Stream Mapping (VSM) expert that outputs strictly valid mxGraph XML for draw.io.

HARD RULES — follow exactly or the diagram will fail to render:
1. Wrap everything in <mxGraphModel><root>...</root></mxGraphModel>.
2. Always include these two cells first, unchanged:
     <mxCell id="0"/>
     <mxCell id="1" parent="0"/>
3. Every shape (process step) MUST be a vertex cell with this exact structure:
     <mxCell id="N" value="Step name" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
       <mxGeometry x="X" y="Y" width="160" height="60" as="geometry"/>
     </mxCell>
   - x/y/width/height MUST live INSIDE a <mxGeometry .../> child with as="geometry". NEVER put x/y on the mxCell tag itself.
4. Every connection MUST be an edge cell with this exact structure:
     <mxCell id="N" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;" edge="1" parent="1" source="SRC_ID" target="TGT_ID">
       <mxGeometry relative="1" as="geometry"/>
     </mxCell>
5. Numeric ids start at 2 and increment. Source/target must reference real shape ids.
6. Maximum 10 process steps. Layout horizontally: x = 80, 280, 480, 680, 880, 1080, ...; y = 200 for all.
7. Output ONLY the raw XML. No markdown, no backticks, no commentary.`;

      const userPrompt = `Create a VSM diagram from this process document:\n\n${extractedText.substring(0, 3000)}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      });

      let xml = completion.choices[0]?.message?.content?.trim() || "";

      // Strip markdown fences if the model wrapped the XML in ```xml ... ```
      xml = xml
        .replace(/^```(?:xml|html)?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();

      // If the model returned only loose <mxCell> tags, wrap them
      if (xml && !xml.includes("<mxGraphModel") && xml.includes("<mxCell")) {
        xml = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${xml}</root></mxGraphModel>`;
      }

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

      res.json({ success: true, data: { xml } });
    }),
  ];

  getFlowVersions = asyncHandler(async (req, res) => {
    const flowId = req.params.id;
    const userId = req.user.id;

    const flow = await prisma.flow.findFirst({
      where: { id: flowId, ownerId: userId },
    });
    if (!flow) {
      return res.status(403).json({
        success: false,
        error: { message: "Access denied or flow not found" },
      });
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
    const { id: flowId, versionId } = req.params;
    const userId = req.user.id;

    const flow = await prisma.flow.findFirst({
      where: { id: flowId, ownerId: userId },
    });
    if (!flow) {
      return res.status(403).json({
        success: false,
        error: { message: "Access denied or flow not found" },
      });
    }

    const version = await prisma.flowVersion.findFirst({
      where: { id: versionId, flowId },
    });
    if (!version) {
      return res
        .status(404)
        .json({ success: false, error: { message: "Version not found" } });
    }

    await prisma.flow.update({
      where: { id: flowId },
      data: { diagramData: version.xml, updatedAt: new Date() },
    });

    res.json({
      success: true,
      data: { message: "Flow restored to selected version" },
    });
  });
}

module.exports = new FlowController();
