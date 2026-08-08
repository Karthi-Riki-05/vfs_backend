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
    workspaceId: z.string().max(128).optional().nullable(),
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
    createVersion: z.boolean().optional(), // FEAT-002: manual-save snapshot flag
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
    sort: z
      .enum(["updatedAt", "name", "createdAt"])
      .optional()
      .default("updatedAt"),
    sortDirection: z.enum(["asc", "desc"]).optional().default("desc"),
    isFavorite: z.enum(["true", "false"]).optional(),
    projectId: z.string().max(128).optional(),
    workspaceId: z.string().max(128).optional(),
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
        z
          .object({
            userId: z.string().min(1).optional(),
            email: z.string().email().optional(),
            permission: z.enum(["view", "edit"]),
          })
          .refine((s) => s.userId || s.email, {
            message: "Each share entry must have userId or email",
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

const resolveLockSchema = z.object({
  body: z.object({
    appType: z.enum(["pro", "team"]),
    selectedFlowIds: z.array(z.string().min(1)).min(1),
  }),
});

const markModalShownSchema = z.object({
  body: z.object({
    appType: z.enum(["pro", "team"]),
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
  resolveLockSchema,
  markModalShownSchema,
};
