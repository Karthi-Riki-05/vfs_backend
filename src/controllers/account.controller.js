const accountService = require("../services/account.service");
const asyncHandler = require("../utils/asyncHandler");

class AccountController {
  deleteAccount = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { password, confirmation } = req.body;

    // Authorize first — password for credentials users, "DELETE" confirmation
    // for OAuth/social users (who have no password) — before any Stripe/DB work.
    await accountService.verifyDeleteAuthorization(userId, {
      password,
      confirmation,
    });

    // Perform the full deletion (Stripe cancellation + DB hard-delete)
    await accountService.deleteAccount(userId);

    res.json({
      success: true,
      data: { message: "Account permanently deleted" },
    });
  });
}

module.exports = new AccountController();
