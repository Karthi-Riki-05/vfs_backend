const { z } = require("zod");

// Either `password` (credentials users) OR `confirmation` (OAuth/social users
// type "DELETE") is supplied; which one is required is enforced per-user in
// account.service.verifyDeleteAuthorization based on whether a password exists.
const deleteAccountSchema = z.object({
  body: z.object({
    password: z.string().optional(),
    confirmation: z.string().optional(),
  }),
});

module.exports = { deleteAccountSchema };
