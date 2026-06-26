const express = require("express");
const router = express.Router();
const accountController = require("../controllers/account.controller");
const { authenticate } = require("../middleware/auth.middleware");
const validate = require("../middleware/validate");
const { deleteAccountSchema } = require("../validators/account.validator");

/**
 * @swagger
 * /api/v1/account/delete:
 *   post:
 *     summary: Permanently delete the authenticated user's account
 *     tags: [Account]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password:
 *                 type: string
 *                 description: Current password for confirmation
 *     responses:
 *       200:
 *         description: Account permanently deleted
 *       400:
 *         description: Teams must be handled first / OAuth account
 *       401:
 *         description: Password incorrect
 *       403:
 *         description: Admin accounts cannot self-delete
 */
router.post(
  "/delete",
  authenticate,
  validate(deleteAccountSchema),
  accountController.deleteAccount,
);

module.exports = router;
