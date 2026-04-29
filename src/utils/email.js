const nodemailer = require("nodemailer");
const logger = require("./logger");

// In local dev, redirect ALL emails to this address
const DEV_MAIL_OVERRIDE = process.env.DEV_MAIL_OVERRIDE || "";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === "true",
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

async function sendTeamInviteEmail({
  to,
  teamName,
  inviterName,
  inviterEmail,
  acceptUrl,
  appContext,
}) {
  const isPro = appContext === "pro";
  const appName = isPro ? "ValueChart Pro" : "ValueChart";
  const brandColor = isPro ? "#D97706" : "#3CB371";
  const brandBadge = isPro ? " Pro" : "";

  const mailOptions = {
    from:
      process.env.SMTP_FROM ||
      process.env.SMTP_USER ||
      "noreply@valuecharts.com",
    to: resolveRecipient(to),
    subject: `You've been invited to join ${teamName || "a team"} on ${appName}`,
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
                <strong>${inviterName || "A team member"}</strong>${inviterEmail ? ` (${inviterEmail})` : ""} has invited you to join
                the team <strong>"${teamName || "their team"}"</strong> on ${appName}.
              </p>
              <div style="background-color:#f8f9fa; border-radius:8px; padding:20px; margin-bottom:32px; border-left:4px solid ${brandColor};">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="color:#888888; font-size:13px; padding-bottom:8px;">TEAM</td>
                  </tr>
                  <tr>
                    <td style="color:#1a1a1a; font-size:18px; font-weight:600; padding-bottom:12px;">${teamName || "Unnamed Team"}</td>
                  </tr>
                  <tr>
                    <td style="color:#888888; font-size:13px; padding-bottom:4px;">INVITED BY</td>
                  </tr>
                  <tr>
                    <td style="color:#1a1a1a; font-size:15px;">${inviterName || "A team member"}</td>
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

${inviterName || "A team member"} has invited you to join the team "${teamName || "their team"}".

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
    from:
      process.env.SMTP_FROM ||
      process.env.SMTP_USER ||
      "noreply@valuecharts.com",
    to: resolveRecipient(to),
    subject: "Reset Your ValueChart Password",
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
              <p style="color:#555555; font-size:16px; line-height:1.6;">Hi ${name || "there"},</p>
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
    text: `Hi ${name || "there"},

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
    logger.error(
      `Failed to send password reset email to ${to}: ${error.message}`,
    );
    throw error;
  }
}

async function sendEmail({ to, subject, html, text }) {
  if (!process.env.SMTP_USER) {
    logger.warn("[Email] SMTP not configured — skipping send");
    return false;
  }
  const mailOptions = {
    from:
      process.env.SMTP_FROM ||
      process.env.SMTP_USER ||
      "noreply@valuecharts.com",
    to: resolveRecipient(to),
    subject,
    html,
    text,
  };
  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`[Email] Sent "${subject}" to ${to}`);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) logger.info(`[Email] Preview URL: ${previewUrl}`);
    return true;
  } catch (err) {
    logger.error(
      `[Email] Failed to send "${subject}" to ${to}: ${err.message}`,
    );
    return false;
  }
}

const APP_URL = () =>
  process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3002";

const emailTemplates = {
  paymentSuccess: (user, amountCents, planName) => ({
    subject: "Payment Confirmed — ValueChart",
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
  <div style="text-align:center;padding:24px 0;background:#3CB371;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:22px">Payment Confirmed ✅</h1>
  </div>
  <div style="padding:32px 24px;border:1px solid #eee;border-top:0;border-radius:0 0 8px 8px">
    <p style="font-size:15px">Hi ${user.name || "there"},</p>
    <p style="font-size:15px;line-height:1.6">Your payment of <strong>$${(amountCents / 100).toFixed(2)}</strong> for <strong>${planName}</strong> was successful. Your subscription is now active.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${APP_URL()}/dashboard/subscription" style="background:#3CB371;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600">View Subscription</a>
    </div>
    <p style="color:#888;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:16px">ValueChart — We Add Value To Your Business</p>
  </div>
</div>`,
    text: `Hi ${user.name || "there"},\n\nYour payment of $${(amountCents / 100).toFixed(2)} for ${planName} was successful.\n\nView your subscription: ${APP_URL()}/dashboard/subscription`,
  }),

  paymentFailed: (user, planName) => ({
    subject: "⚠️ Payment Failed — Action Required",
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
  <div style="text-align:center;padding:24px 0;background:#ff4d4f;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:22px">Payment Failed ⚠️</h1>
  </div>
  <div style="padding:32px 24px;border:1px solid #eee;border-top:0;border-radius:0 0 8px 8px">
    <p style="font-size:15px">Hi ${user.name || "there"},</p>
    <p style="font-size:15px;line-height:1.6">We couldn't process your payment for <strong>${planName}</strong>. Please update your payment method to keep your subscription active.</p>
    <p style="font-size:14px;color:#cf1322">If not resolved within a few days, your account will be downgraded to the free plan.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${APP_URL()}/dashboard/subscription" style="background:#ff4d4f;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600">Update Payment Method</a>
    </div>
    <p style="color:#888;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:16px">Need help? Reply to this email or contact support.</p>
  </div>
</div>`,
    text: `Hi ${user.name || "there"},\n\nYour payment for ${planName} failed. Please update your payment method: ${APP_URL()}/dashboard/subscription\n\nIf not resolved, your account will be downgraded to the free plan.`,
  }),

  flowPack7Days: (user, packLabel, expiresAt) => ({
    subject: "⚠️ Your flow pack expires in 7 days",
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
  <div style="text-align:center;padding:24px 0;background:#F59E0B;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:22px">Pack Expires in 7 Days</h1>
  </div>
  <div style="padding:32px 24px;border:1px solid #eee;border-top:0;border-radius:0 0 8px 8px">
    <p>Hi ${user.name || "there"},</p>
    <p>Your <strong>${packLabel}</strong> pack expires on <strong>${new Date(expiresAt).toLocaleDateString()}</strong>. Renew now to keep all your flows accessible.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${APP_URL()}/dashboard/subscription" style="background:#3CB371;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600">Renew Now</a>
    </div>
    <p style="color:#888;font-size:12px">If your pack expires you'll get a 3-day grace period; after that flows beyond your 10-flow free limit will move to trash.</p>
  </div>
</div>`,
  }),

  flowPack3Days: (user, packLabel, expiresAt) => ({
    subject: "⚠️ Only 3 days left — flow pack expiring",
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
  <div style="text-align:center;padding:24px 0;background:#FF7A45;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:22px">3 Days Until Expiry</h1>
  </div>
  <div style="padding:32px 24px;border:1px solid #eee;border-top:0;border-radius:0 0 8px 8px">
    <p>Hi ${user.name || "there"},</p>
    <p>Your <strong>${packLabel}</strong> pack expires on <strong>${new Date(expiresAt).toLocaleDateString()}</strong>. Renew within 3 days to avoid losing flow access.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${APP_URL()}/dashboard/subscription" style="background:#FF7A45;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600">Renew Now</a>
    </div>
  </div>
</div>`,
  }),

  flowPack1Day: (user, packLabel, expiresAt) => ({
    subject: "🔴 Final notice — flow pack expires tomorrow",
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
  <div style="text-align:center;padding:24px 0;background:#cf1322;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:22px">Expires Tomorrow</h1>
  </div>
  <div style="padding:32px 24px;border:1px solid #eee;border-top:0;border-radius:0 0 8px 8px">
    <p>Hi ${user.name || "there"},</p>
    <p>Your <strong>${packLabel}</strong> pack expires on <strong>${new Date(expiresAt).toLocaleDateString()}</strong> — that's tomorrow. Renew now to keep your flows.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${APP_URL()}/dashboard/subscription" style="background:#cf1322;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600">Renew Now</a>
    </div>
  </div>
</div>`,
  }),

  flowPackGrace: (user, packLabel, gracePeriodEndsAt) => ({
    subject: "🔴 Flow pack expired — 3-day grace period started",
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
  <div style="text-align:center;padding:24px 0;background:#cf1322;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:22px">Pack Expired — Action Required</h1>
  </div>
  <div style="padding:32px 24px;border:1px solid #eee;border-top:0;border-radius:0 0 8px 8px">
    <p>Hi ${user.name || "there"},</p>
    <p>Your <strong>${packLabel}</strong> pack has expired. You have a 3-day grace period — renew before <strong>${new Date(gracePeriodEndsAt).toLocaleDateString()}</strong> to keep all your flows.</p>
    <p>If you don't renew, flows beyond the 10-flow free limit will be moved to trash and you'll be asked to select 10 flows to keep.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${APP_URL()}/dashboard/subscription" style="background:#cf1322;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600">Renew Now</a>
    </div>
  </div>
</div>`,
  }),

  flowPickerRequired: (user, flowCount) => ({
    subject: "🔴 Action required: select 10 flows to keep",
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
  <div style="text-align:center;padding:24px 0;background:#cf1322;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:22px">Pick 10 Flows to Keep</h1>
  </div>
  <div style="padding:32px 24px;border:1px solid #eee;border-top:0;border-radius:0 0 8px 8px">
    <p>Hi ${user.name || "there"},</p>
    <p>Your flow pack expired and you currently have <strong>${flowCount}</strong> flows. The free plan allows 10 — please select which 10 to keep. The rest will move to trash for 30 days, after which they'll be permanently deleted.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${APP_URL()}/dashboard/flows" style="background:#cf1322;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600">Select Flows to Keep</a>
    </div>
    <p style="color:#888;font-size:12px">You can also renew your pack at any time within 30 days to auto-restore the trashed flows.</p>
  </div>
</div>`,
  }),

  flowsRestoredOnRenewal: (user, restoredCount) => ({
    subject: "✅ Your flows have been restored",
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
  <div style="text-align:center;padding:24px 0;background:#3CB371;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:22px">Flows Restored ✅</h1>
  </div>
  <div style="padding:32px 24px;border:1px solid #eee;border-top:0;border-radius:0 0 8px 8px">
    <p>Hi ${user.name || "there"},</p>
    <p>Welcome back! We've restored <strong>${restoredCount}</strong> flow${restoredCount === 1 ? "" : "s"} from trash now that your pack is active again.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${APP_URL()}/dashboard/flows" style="background:#3CB371;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600">Open Flows</a>
    </div>
  </div>
</div>`,
  }),

  subscriptionCancelled: (user, expiresAt) => ({
    subject: "Subscription Cancelled — ValueChart",
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
  <div style="text-align:center;padding:24px 0;background:#666;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:22px">Subscription Cancelled</h1>
  </div>
  <div style="padding:32px 24px;border:1px solid #eee;border-top:0;border-radius:0 0 8px 8px">
    <p style="font-size:15px">Hi ${user.name || "there"},</p>
    <p style="font-size:15px;line-height:1.6">Your subscription has been cancelled.${expiresAt ? ` You'll keep access until <strong>${new Date(expiresAt).toLocaleDateString()}</strong>.` : ""}</p>
    <p style="font-size:14px;color:#666">After that, your account will return to the free plan.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${APP_URL()}/dashboard/subscription" style="background:#3CB371;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600">Reactivate Subscription</a>
    </div>
  </div>
</div>`,
    text: `Hi ${user.name || "there"},\n\nYour subscription has been cancelled.${expiresAt ? ` Access continues until ${new Date(expiresAt).toLocaleDateString()}.` : ""}\n\nReactivate: ${APP_URL()}/dashboard/subscription`,
  }),
};

module.exports = {
  sendTeamInviteEmail,
  sendPasswordResetEmail,
  sendEmail,
  emailTemplates,
};
