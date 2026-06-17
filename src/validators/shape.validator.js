const { z } = require("zod");

const createShapeSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Name is required").max(255).trim(),
    type: z.enum(["stencil", "image", "html", "shape"]).optional(),
    content: z.string().max(24000000).optional(),
    textAlignment: z.enum(["top", "center", "bottom"]).optional(),
    groupId: z.string().optional().nullable(),
    category: z.string().max(100).optional().nullable(),
    xmlContent: z.string().max(24000000).optional().nullable(),
    thumbnail: z.string().max(5000000).optional().nullable(),
    isPublic: z.boolean().optional(),
  }),
});

const updateShapeSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    name: z.string().min(1).max(255).trim().optional(),
    type: z.enum(["stencil", "image", "html", "shape"]).optional(),
    content: z.string().max(24000000).optional(),
    textAlignment: z.enum(["top", "center", "bottom"]).optional(),
    groupId: z.string().optional().nullable(),
    category: z.string().max(100).optional().nullable(),
    xmlContent: z.string().max(24000000).optional().nullable(),
    thumbnail: z.string().max(5000000).optional().nullable(),
    isPublic: z.boolean().optional(),
  }),
});

const idParamSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

// Optional shape payload sent when the diagram cell has no backing Shape row
// yet — the associate endpoint creates one on the fly ("ensure" semantics).
const inlineShapeSchema = z
  .object({
    name: z.string().min(1).max(255).trim(),
    xmlContent: z.string().max(24000000).optional().nullable(),
    thumbnail: z.string().max(5000000).optional().nullable(),
  })
  .optional();

const associateTeamSchema = z.object({
  params: z.object({
    shapeId: z.string().min(1),
  }),
  body: z.object({
    teamId: z.string().min(1, "teamId is required"),
    shape: inlineShapeSchema,
  }),
});

const associateGroupSchema = z.object({
  params: z.object({
    shapeId: z.string().min(1),
  }),
  body: z.object({
    groupId: z.string().min(1, "groupId is required"),
    shape: inlineShapeSchema,
  }),
});

const shapeIdParamSchema = z.object({
  params: z.object({
    shapeId: z.string().min(1),
  }),
});

const checkAssociationsSchema = z.object({
  body: z.object({
    shapeIds: z.array(z.string().min(1)).min(1).max(500),
  }),
});

const bulkDeleteSchema = z.object({
  body: z.object({
    shapeIds: z.array(z.string().min(1)).min(1).max(500),
  }),
});

module.exports = {
  createShapeSchema,
  updateShapeSchema,
  idParamSchema,
  associateTeamSchema,
  associateGroupSchema,
  shapeIdParamSchema,
  checkAssociationsSchema,
  bulkDeleteSchema,
};
