const chatService = require("../services/chat.service");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const path = require("path");
const fs = require("fs");
const { uploadFile: uploadToStorage } = require("../services/storage.service");
const { sanitizeSvg, isSvgDangerous } = require("../utils/sanitizeSvg");

class ChatController {
  getSidebar = asyncHandler(async (req, res) => {
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const teamId = req.query?.teamId || req.headers["x-team-context"] || null;
    const data = await chatService.getSidebarData(
      req.user.id,
      appContext,
      teamId || null,
    );
    res.json({ success: true, data });
  });

  getChatGroups = asyncHandler(async (req, res) => {
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const teamId = req.query?.teamId || req.headers["x-team-context"] || null;
    const groups = await chatService.getChatGroups(
      req.user.id,
      appContext,
      teamId,
    );
    res.json({ success: true, data: groups });
  });

  createChatGroup = asyncHandler(async (req, res) => {
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    // teamId is ONLY taken from the body — an explicit body.teamId means
    // "this is the team-wide conversation" (handleTeamChatOpen). Injecting
    // the X-Team-Context header here gave every modal-created group/DM a
    // teamId, which getSidebarData classifies as a team conversation —
    // collapsing them into one slot and making new groups "disappear".
    // Named groups and DMs stay teamId:null and are scoped by appContext.
    const group = await chatService.createChatGroup(
      req.user.id,
      { ...req.body, teamId: req.body?.teamId || null },
      appContext,
    );
    res.status(201).json({ success: true, data: group });
  });

  getMessages = asyncHandler(async (req, res) => {
    const result = await chatService.getMessages(
      req.params.id,
      req.user.id,
      req.query,
    );
    res.json({ success: true, data: result });
  });

  sendMessage = asyncHandler(async (req, res) => {
    const message = await chatService.sendMessage(
      req.params.id,
      req.user.id,
      req.body,
    );
    res.status(201).json({ success: true, data: message });
  });

  markRead = asyncHandler(async (req, res) => {
    await chatService.markMessageRead(req.params.id, req.user.id);
    res.json({ success: true, data: { message: "Message marked as read" } });
  });

  markGroupRead = asyncHandler(async (req, res) => {
    await chatService.markGroupRead(req.params.id, req.user.id);
    res.json({
      success: true,
      data: { message: "All messages marked as read" },
    });
  });

  addMember = asyncHandler(async (req, res) => {
    const member = await chatService.addMember(
      req.params.id,
      req.user.id,
      req.body.userId,
    );
    res.status(201).json({ success: true, data: member });
  });

  uploadFile = asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError("No file uploaded", 400, "NO_FILE");
    }
    if (!req.file.size || req.file.size <= 0) {
      throw new AppError("Empty file uploaded", 400, "EMPTY_FILE");
    }

    const safeName = path.basename(req.file.originalname || "upload");
    let fileBuffer = req.file.buffer;

    // SVG sanitisation — strip <script> and dangerous attributes before storage
    const isSvg =
      req.file.mimetype === "image/svg+xml" ||
      safeName.toLowerCase().endsWith(".svg");
    if (isSvg) {
      const svgContent = fileBuffer.toString("utf-8");
      if (isSvgDangerous(svgContent)) {
        console.warn(
          `[Security] Dangerous SVG from user ${req.user.id}: ${safeName}`,
        );
      }
      fileBuffer = Buffer.from(sanitizeSvg(svgContent), "utf-8");
    }

    const result = await uploadToStorage({
      buffer: fileBuffer,
      originalName: safeName,
      mimeType: req.file.mimetype,
      folder: "chat",
      userId: req.user.id,
    });

    const groupId = req.body.groupId;
    if (groupId) {
      const message = await chatService.createFileMessage(
        groupId,
        req.user.id,
        {
          originalname: safeName,
          mimetype: req.file.mimetype,
          size: fileBuffer.length,
          url: result.url,
        },
      );
      return res.json({ success: true, data: message });
    }

    const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(safeName);
    res.json({
      success: true,
      data: {
        url: result.url,
        filename: safeName,
        type: isImage ? "image" : "docs",
        size: fileBuffer.length,
        mimetype: req.file.mimetype,
      },
    });
  });

  downloadFile = asyncHandler(async (req, res) => {
    const file = await chatService.getFile(req.params.id, req.user.id);

    // S3-stored file: filePath is an absolute URL — redirect client directly
    if (file.filePath && file.filePath.startsWith("http")) {
      return res.redirect(302, file.filePath);
    }

    // Local disk fallback
    const localPath = path.join(
      __dirname,
      "../../uploads/chat",
      path.basename(file.filePath),
    );

    if (!fs.existsSync(localPath)) {
      throw new AppError("File not found", 404, "FILE_NOT_FOUND");
    }

    // B45: serve images INLINE so the chat can preview them (window.open /
    // <img> shows the picture) instead of forcing a download. Non-images stay
    // attachments. `?download=1` still forces a download for any type.
    const isImage = (file.fileType || "").startsWith("image/");
    const forceDownload = req.query.download === "1";
    const disposition = isImage && !forceDownload ? "inline" : "attachment";
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="${file.fileName}"`,
    );
    res.setHeader("Content-Type", file.fileType);
    fs.createReadStream(localPath).pipe(res);
  });

  previewFile = asyncHandler(async (req, res) => {
    const file = await chatService.getFile(req.params.id, req.user.id);
    res.json({
      success: true,
      data: {
        id: file.id,
        fileName: file.fileName,
        fileType: file.fileType,
        fileSize: file.fileSize,
        filePath: file.filePath,
        createdAt: file.createdAt,
      },
    });
  });

  getUnreadCounts = asyncHandler(async (req, res) => {
    const appContext =
      req.headers["x-app-context"] ||
      req.query.appContext ||
      req.user.currentVersion ||
      "team";
    const counts = await chatService.getUnreadCounts(req.user.id, appContext);
    res.json({ success: true, data: counts });
  });

  getGroupInfo = asyncHandler(async (req, res) => {
    const info = await chatService.getGroupInfo(req.params.id, req.user.id);
    res.json({ success: true, data: info });
  });

  updateGroup = asyncHandler(async (req, res) => {
    const group = await chatService.updateGroup(
      req.params.id,
      req.user.id,
      req.body,
    );
    res.json({ success: true, data: group });
  });

  getAvailableMembers = asyncHandler(async (req, res) => {
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const members = await chatService.getAvailableMembers(
      req.params.id,
      req.user.id,
      appContext,
    );
    res.json({ success: true, data: members });
  });

  addMembers = asyncHandler(async (req, res) => {
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const result = await chatService.addMembers(
      req.params.id,
      req.user.id,
      req.body.userIds,
      appContext,
    );
    res.json({ success: true, data: result });
  });

  removeMember = asyncHandler(async (req, res) => {
    await chatService.removeMember(
      req.params.id,
      req.user.id,
      req.params.userId,
    );
    res.json({ success: true, data: { message: "Member removed" } });
  });

  leaveGroup = asyncHandler(async (req, res) => {
    await chatService.leaveGroup(req.params.id, req.user.id);
    res.json({ success: true, data: { message: "Left the group" } });
  });

  deleteGroup = asyncHandler(async (req, res) => {
    await chatService.deleteGroup(req.params.id, req.user.id);
    res.json({ success: true, data: { message: "Group deleted" } });
  });

  editMessage = asyncHandler(async (req, res) => {
    const message = await chatService.editMessage(
      req.params.messageId,
      req.user.id,
      req.body.content,
    );
    res.json({ success: true, data: message });
  });

  deleteMessage = asyncHandler(async (req, res) => {
    const result = await chatService.deleteMessage(
      req.params.messageId,
      req.user.id,
    );
    res.json({ success: true, data: result });
  });

  toggleReaction = asyncHandler(async (req, res) => {
    const result = await chatService.toggleReaction(
      req.params.messageId,
      req.user.id,
      req.body.emoji,
    );
    res.json({ success: true, data: result });
  });
}

module.exports = new ChatController();
