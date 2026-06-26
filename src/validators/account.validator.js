const { z } = require("zod");

const deleteAccountSchema = z.object({
  body: z.object({
    password: z.string().min(1, "Password is required"),
  }),
});

module.exports = { deleteAccountSchema };
