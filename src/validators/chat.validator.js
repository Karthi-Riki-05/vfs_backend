const { z } = require("zod");

const createChatGroupSchema = z.object({
  body: z.object({
    title: z.string().max(255).trim().optional().default(""),
    flowId: z.number().int().optional(),
    flowItemId: z.string().optional(),
    appType: z.enum(["enterprise", "individual"]).optional(),
    teamId: z.string().optional(),
    memberIds: z.array(z.string().min(1)).optional(),
    // When true, this is a 1-on-1 DM — backend dedupes against existing
    // DM groups between the same two users instead of creating new.
    isDirect: z.boolean().optional(),
  }),
});

const sendMessageSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    message: z.string().min(1).max(10000),
    type: z
      .enum(["text", "image", "audio", "video", "docs", "others"])
      .default("text"),
    attachPath: z.string().max(500).optional(),
  }),
});

const markReadSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

const getMessagesQuerySchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  query: z.object({
    page: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().positive())
      .optional(),
    limit: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(100))
      .optional(),
    after: z.string().optional(), // ISO timestamp for fetching missed messages
  }),
});

const idParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

const markGroupReadSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

const ALLOWED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-rar-compressed",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
];

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

const addMembersSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    userIds: z.array(z.string().min(1)).min(1).max(50),
  }),
});

const updateGroupSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    title: z.string().min(1).max(255).trim().optional(),
  }),
});

const removeMemberSchema = z.object({
  params: z.object({
    id: z.string().min(1),
    userId: z.string().min(1),
  }),
});

module.exports = {
  createChatGroupSchema,
  sendMessageSchema,
  markReadSchema,
  getMessagesQuerySchema,
  idParamSchema,
  markGroupReadSchema,
  addMembersSchema,
  updateGroupSchema,
  removeMemberSchema,
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE,
};
