const userService = require('../services/user.service');
const asyncHandler = require('../utils/asyncHandler');

class UserController {
    getMe = asyncHandler(async (req, res) => {
        const user = await userService.getUserById(req.user.id);
        res.json({ success: true, data: user });
    });

    getUserById = asyncHandler(async (req, res) => {
        const user = await userService.getUserById(req.params.id);
        res.json({ success: true, data: user });
    });

    updateUser = asyncHandler(async (req, res) => {
        const user = await userService.updateUser(req.params.id, req.body);
        res.json({ success: true, data: { message: 'User updated successfully', user } });
    });

    changePassword = asyncHandler(async (req, res) => {
        await userService.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
        res.json({ success: true, data: { message: 'Password changed successfully' } });
    });

    forgotPassword = asyncHandler(async (req, res) => {
        await userService.requestPasswordReset(req.body.email);
        res.json({ success: true, data: { message: 'If that email exists, a reset link has been sent.' } });
    });

    resetPassword = asyncHandler(async (req, res) => {
        await userService.resetPassword(req.body.token, req.body.password);
        res.json({ success: true, data: { message: 'Password reset successfully' } });
    });

    deleteUser = asyncHandler(async (req, res) => {
        await userService.softDeleteUser(req.params.id);
        res.json({ success: true, data: { message: 'User deactivated successfully' } });
    });
}

module.exports = new UserController();
