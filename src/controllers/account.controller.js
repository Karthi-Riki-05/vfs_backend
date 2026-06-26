const accountService = require("../services/account.service");
const asyncHandler = require("../utils/asyncHandler");

class AccountController {
  deleteAccount = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { password } = req.body;

    // Verify password first — before any Stripe or DB work
    await accountService.verifyPassword(userId, password);

    // Perform the full deletion (Stripe cancellation + DB hard-delete)
    await accountService.deleteAccount(userId);

    res.json({
      success: true,
      data: { message: "Account permanently deleted" },
    });
  });
}

module.exports = new AccountController();
