const { z } = require("zod");

const createFlowSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Name is required").max(255).trim(),
    description: z.string().max(2000).optional(),
    diagramData: z.string().optional(),
    xml: z.string().optional(),
    isPublic: z.boolean().optional(),
    thumbnail: z.string().max(500000).optional(),
    projectId: z.string().optional().nullable(),
    // Workspace scoping — null/omitted = personal, string = team workspace.
    teamId: z.string().max(128).optional().nullable(),
  }),
});

const updateFlowSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    name: z.string().min(1).max(255).trim().optional(),
    description: z.string().max(2000).optional(),
    diagramData: z.string().optional(),
    xml: z.string().optional(),
    isPublic: z.boolean().optional(),
    isFavorite: z.boolean().optional(),
    thumbnail: z.string().max(500000).optional(),
    projectId: z.string().optional().nullable(),
  }),
});

const updateDiagramStateSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    groupId: z.string().min(1, "Group ID is required"),
    newShape: z.object({}).passthrough(),
  }),
});

const getFlowsQuerySchema = z.object({
  query: z.object({
    search: z.string().max(255).optional(),
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
    nonEmpty: z.enum(["true", "false"]).optional(),
    draftsOnly: z.enum(["true", "false"]).optional(),
    sort: z.string().max(32).optional(),
    teamId: z.string().max(128).optional(),
  }),
});

const idParamSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

const shareFlowSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    shares: z
      .array(
        z.object({
          userId: z.string().min(1),
          permission: z.enum(["view", "edit"]),
        }),
      )
      .min(1, "At least one share is required"),
  }),
});

const updateShareSchema = z.object({
  params: z.object({
    id: z.string().min(1),
    shareId: z.string().min(1),
  }),
  body: z.object({
    permission: z.enum(["view", "edit"]),
  }),
});

const shareIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1),
    shareId: z.string().min(1),
  }),
});

module.exports = {
  createFlowSchema,
  updateFlowSchema,
  updateDiagramStateSchema,
  getFlowsQuerySchema,
  idParamSchema,
  shareFlowSchema,
  updateShareSchema,
  shareIdParamSchema,
};
