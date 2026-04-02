const nodemailer = require('nodemailer');
const logger = require('./logger');

// In local dev, redirect ALL emails to this address
const DEV_MAIL_OVERRIDE = process.env.DEV_MAIL_OVERRIDE || '';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

/**
 * In local dev, overrides the recipient so all emails go to the dev address.
 * Logs the original intended recipient for debugging.
 */
function resolveRecipient(originalTo) {
    if (DEV_MAIL_OVERRIDE) {
        logger.info(`[DEV] Mail redirected: ${originalTo} -> ${DEV_MAIL_OVERRIDE}`);
        return DEV_MAIL_OVERRIDE;
    }
    return originalTo;
}

async function sendTeamInviteEmail({ to, teamName, inviterName, inviterEmail, acceptUrl, appContext }) {
    const isPro = appContext === 'pro';
    const appName = isPro ? 'ValueChart Pro' : 'ValueChart';
    const brandColor = isPro ? '#D97706' : '#3CB371';
    const brandBadge = isPro ? ' Pro' : '';

    const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@valuecharts.com',
        to: resolveRecipient(to),
        subject: `You've been invited to join ${teamName || 'a team'} on ${appName}`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5; padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:${brandColor}; padding:32px 40px; text-align:center;">
              <h1 style="color:#ffffff; margin:0; font-size:24px; font-weight:600;">
                ValueChart${brandBadge}
              </h1>
              <p style="color:rgba(255,255,255,0.9); margin:8px 0 0 0; font-size:14px;">
                Team Collaboration Platform
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h2 style="color:#1a1a1a; text-align:center; margin:0 0 16px 0; font-size:22px; font-weight:600;">
                You've been invited to join a team!
              </h2>
              <p style="color:#555555; text-align:center; font-size:16px; line-height:1.6; margin:0 0 32px 0;">
                <strong>${inviterName || 'A team member'}</strong>${inviterEmail ? ` (${inviterEmail})` : ''} has invited you to join
                the team <strong>"${teamName || 'their team'}"</strong> on ${appName}.
              </p>
              <div style="background-color:#f8f9fa; border-radius:8px; padding:20px; margin-bottom:32px; border-left:4px solid ${brandColor};">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="color:#888888; font-size:13px; padding-bottom:8px;">TEAM</td>
                  </tr>
                  <tr>
                    <td style="color:#1a1a1a; font-size:18px; font-weight:600; padding-bottom:12px;">${teamName || 'Unnamed Team'}</td>
                  </tr>
                  <tr>
                    <td style="color:#888888; font-size:13px; padding-bottom:4px;">INVITED BY</td>
                  </tr>
                  <tr>
                    <td style="color:#1a1a1a; font-size:15px;">${inviterName || 'A team member'}</td>
                  </tr>
                </table>
              </div>
              <div style="text-align:center; margin-bottom:32px;">
                <a href="${acceptUrl}"
                   style="display:inline-block; background-color:${brandColor}; color:#ffffff; text-decoration:none; padding:14px 48px; border-radius:8px; font-size:16px; font-weight:600;">
                  Accept Invitation
                </a>
              </div>
              <p style="color:#999999; text-align:center; font-size:13px; margin:0;">
                This invitation expires in 7 days. After that, a new invitation will need to be sent.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8f9fa; padding:24px 40px; border-top:1px solid #eeeeee;">
              <p style="color:#999999; font-size:12px; text-align:center; margin:0 0 8px 0;">
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
              <p style="color:#bbbbbb; font-size:11px; text-align:center; margin:0;">
                &copy; ${new Date().getFullYear()} ValueChart. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
        <p style="color:#999999; font-size:12px; text-align:center; margin-top:16px;">
          Button not working? Copy this link:<br>
          <a href="${acceptUrl}" style="color:#666666; word-break:break-all;">${acceptUrl}</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
        `,
        text: `You've been invited to join a team on ${appName}!

${inviterName || 'A team member'} has invited you to join the team "${teamName || 'their team'}".

Accept the invitation by clicking this link:
${acceptUrl}

This invitation expires in 7 days.

If you didn't expect this invitation, you can safely ignore this email.`,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        logger.info(`Invite email sent to ${to}`);

        // For Ethereal: show preview URL
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) {
            logger.info(`Mail preview URL: ${previewUrl}`);
        }
    } catch (error) {
        logger.error(`Failed to send invite email to ${to}: ${error.message}`);
        throw error;
    }
}

async function sendPasswordResetEmail({ to, name, resetUrl }) {
    const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@valuecharts.com',
        to: resolveRecipient(to),
        subject: 'Reset Your ValueChart Password',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5; padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#3CB371; padding:32px 40px; text-align:center;">
              <h1 style="color:#ffffff; margin:0; font-size:24px; font-weight:600;">ValueChart</h1>
              <p style="color:rgba(255,255,255,0.9); margin:8px 0 0 0; font-size:14px;">AI-Powered Diagramming</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h2 style="color:#1a1a1a; text-align:center; margin:0 0 16px 0; font-size:22px; font-weight:600;">Reset Your Password</h2>
              <p style="color:#555555; font-size:16px; line-height:1.6;">Hi ${name || 'there'},</p>
              <p style="color:#555555; font-size:16px; line-height:1.6;">We received a request to reset your password. Click the button below to create a new one:</p>
              <div style="text-align:center; margin:32px 0;">
                <a href="${resetUrl}"
                   style="display:inline-block; background-color:#3CB371; color:#ffffff; text-decoration:none; padding:14px 48px; border-radius:8px; font-size:16px; font-weight:600;">
                  Reset Password
                </a>
              </div>
              <p style="color:#999999; font-size:13px;">This link expires in <strong>1 hour</strong>.</p>
              <p style="color:#999999; font-size:13px;">If you didn't request this, you can safely ignore this email. Your password will not be changed.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8f9fa; padding:24px 40px; border-top:1px solid #eeeeee;">
              <p style="color:#bbbbbb; font-size:11px; text-align:center; margin:0;">&copy; ${new Date().getFullYear()} ValueChart. All rights reserved.</p>
            </td>
          </tr>
        </table>
        <p style="color:#999999; font-size:12px; text-align:center; margin-top:16px;">
          Button not working? Copy this link:<br>
          <a href="${resetUrl}" style="color:#666666; word-break:break-all;">${resetUrl}</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
        `,
        text: `Hi ${name || 'there'},

You requested a password reset for your ValueChart account. Click the link below to create a new password:

${resetUrl}

This link expires in 1 hour.

If you didn't request this, you can safely ignore this email.`,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        logger.info(`Password reset email sent to ${to}`);

        // For Ethereal: show preview URL
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) {
            logger.info(`Mail preview URL: ${previewUrl}`);
        }
    } catch (error) {
        logger.error(`Failed to send password reset email to ${to}: ${error.message}`);
        throw error;
    }
}

module.exports = { sendTeamInviteEmail, sendPasswordResetEmail };
