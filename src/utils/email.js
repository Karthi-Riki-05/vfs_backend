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

// Escapes a user-supplied value before it's interpolated into an HTML email
// body (bug-020). Never apply this to the plain-text fallback — that isn't
// HTML-rendered, so escaping would show literal "&amp;" etc. to the reader.
function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
  const brandColor = isPro ? "#D97706" : "#34A881";
  const brandBadge = isPro ? " Pro" : "";
  const safeTeamName = escapeHtml(teamName || "their team");
  const safeInviterName = escapeHtml(inviterName || "A team member");
  const safeInviterEmail = inviterEmail ? escapeHtml(inviterEmail) : "";

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
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 14px;">
                <tr><td style="background-color:#ffffff; border-radius:12px; padding:8px 16px;">
                  <img src="${APP_URL()}/images/${isPro ? "vc_pro.png" : "image.png"}" alt="ValueChart${brandBadge}" width="150" style="display:block; border:0; height:auto;">
                </td></tr>
              </table>
              <p style="color:rgba(255,255,255,0.9); margin:0; font-size:14px;">
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
                <strong>${safeInviterName}</strong>${safeInviterEmail ? ` (${safeInviterEmail})` : ""} has invited you to join
                the team <strong>"${safeTeamName}"</strong> on ${appName}.
              </p>
              <div style="background-color:#f8f9fa; border-radius:8px; padding:20px; margin-bottom:32px; border-left:4px solid ${brandColor};">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="color:#888888; font-size:13px; padding-bottom:8px;">TEAM</td>
                  </tr>
                  <tr>
                    <td style="color:#1a1a1a; font-size:18px; font-weight:600; padding-bottom:12px;">${escapeHtml(teamName || "Unnamed Team")}</td>
                  </tr>
                  <tr>
                    <td style="color:#888888; font-size:13px; padding-bottom:4px;">INVITED BY</td>
                  </tr>
                  <tr>
                    <td style="color:#1a1a1a; font-size:15px;">${safeInviterName}</td>
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

async function sendFlowShareEmail({
  to,
  sharerName,
  flowName,
  flowUrl,
  permission,
}) {
  const appName = "ValueChart";
  const brandColor = "#34A881";
  const permLabel = permission === "edit" ? "Can Edit" : "View Only";
  const permDesc =
    permission === "edit"
      ? "You can view <strong>and edit</strong> this flow."
      : "You can <strong>view</strong> this flow (read-only).";
  const safeSharerName = escapeHtml(sharerName || "Someone");
  const safeFlowName = escapeHtml(flowName || "Untitled Flow");

  const mailOptions = {
    from:
      process.env.SMTP_FROM ||
      process.env.SMTP_USER ||
      "noreply@valuecharts.com",
    to: resolveRecipient(to),
    subject: `${sharerName || "Someone"} shared a flow with you on ${appName}`,
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
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 14px;">
                <tr><td style="background-color:#ffffff; border-radius:12px; padding:8px 16px;">
                  <img src="${APP_URL()}/images/image.png" alt="${appName}" width="150" style="display:block; border:0; height:auto;">
                </td></tr>
              </table>
              <p style="color:rgba(255,255,255,0.9); margin:0; font-size:14px;">AI-Powered Diagramming</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h2 style="color:#1a1a1a; text-align:center; margin:0 0 16px 0; font-size:22px; font-weight:600;">
                A flow has been shared with you
              </h2>
              <p style="color:#555555; text-align:center; font-size:16px; line-height:1.6; margin:0 0 32px 0;">
                <strong>${safeSharerName}</strong> shared a flow with you on ${appName}.
              </p>
              <div style="background-color:#f8f9fa; border-radius:8px; padding:20px; margin-bottom:32px; border-left:4px solid ${brandColor};">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="color:#888888; font-size:13px; padding-bottom:8px;">FLOW</td>
                  </tr>
                  <tr>
                    <td style="color:#1a1a1a; font-size:18px; font-weight:600; padding-bottom:12px;">${safeFlowName}</td>
                  </tr>
                  <tr>
                    <td style="color:#888888; font-size:13px; padding-bottom:4px;">YOUR ACCESS</td>
                  </tr>
                  <tr>
                    <td style="color:#1a1a1a; font-size:15px;">${permLabel} — ${permDesc}</td>
                  </tr>
                </table>
              </div>
              <div style="text-align:center; margin-bottom:32px;">
                <a href="${flowUrl}"
                   style="display:inline-block; background-color:${brandColor}; color:#ffffff; text-decoration:none; padding:14px 48px; border-radius:8px; font-size:16px; font-weight:600;">
                  Open Flow
                </a>
              </div>
              <p style="color:#999999; text-align:center; font-size:13px; margin:0;">
                You need a ValueChart account to access this flow. Sign in or create a free account.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8f9fa; padding:24px 40px; border-top:1px solid #eeeeee;">
              <p style="color:#999999; font-size:12px; text-align:center; margin:0 0 8px 0;">
                If you weren't expecting this, you can safely ignore this email.
              </p>
              <p style="color:#bbbbbb; font-size:11px; text-align:center; margin:0;">
                &copy; ${new Date().getFullYear()} ValueChart. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
        <p style="color:#999999; font-size:12px; text-align:center; margin-top:16px;">
          Button not working? Copy this link:<br>
          <a href="${flowUrl}" style="color:#666666; word-break:break-all;">${flowUrl}</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    text: `${sharerName || "Someone"} shared a flow with you on ${appName}!

Flow: "${flowName || "Untitled Flow"}"
Your access: ${permLabel}

Open the flow here:
${flowUrl}

You need a ValueChart account to access this flow.

If you weren't expecting this, you can safely ignore this email.`,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Flow share email sent to ${to}`);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) logger.info(`Mail preview URL: ${previewUrl}`);
  } catch (error) {
    logger.error(`Failed to send flow share email to ${to}: ${error.message}`);
    throw error;
  }
}

async function sendFlowShareProRequiredEmail({
  to,
  sharerName,
  flowName,
  upgradeUrl,
}) {
  const appName = "ValueChart";
  const brandColor = "#34A881";
  const safeSharerName = escapeHtml(sharerName || "Someone");
  const safeFlowName = escapeHtml(flowName || "Untitled Flow");

  const mailOptions = {
    from:
      process.env.SMTP_FROM ||
      process.env.SMTP_USER ||
      "noreply@valuecharts.com",
    to: resolveRecipient(to),
    subject: `${sharerName || "Someone"} shared a flow with you — Pro upgrade required`,
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
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 14px;">
                <tr><td style="background-color:#ffffff; border-radius:12px; padding:8px 16px;">
                  <img src="${APP_URL()}/images/image.png" alt="${appName}" width="150" style="display:block; border:0; height:auto;">
                </td></tr>
              </table>
              <p style="color:rgba(255,255,255,0.9); margin:0; font-size:14px;">AI-Powered Diagramming</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h2 style="color:#1a1a1a; text-align:center; margin:0 0 16px 0; font-size:22px; font-weight:600;">
                A flow was shared with you
              </h2>
              <p style="color:#555555; text-align:center; font-size:16px; line-height:1.6; margin:0 0 24px 0;">
                <strong>${safeSharerName}</strong> (a ValueChart Pro user) shared
                the flow <strong>&ldquo;${safeFlowName}&rdquo;</strong> with you.
              </p>
              <div style="background-color:#fffbe6; border-radius:8px; padding:20px; margin-bottom:32px; border-left:4px solid #faad14;">
                <p style="color:#614700; font-size:14px; margin:0 0 8px 0; font-weight:600;">
                  ⚠️ Pro upgrade required
                </p>
                <p style="color:#614700; font-size:14px; margin:0; line-height:1.6;">
                  This flow was shared by a Pro user. To view or edit it, you need a
                  ValueChart Pro account. Upgrade now for <strong>lifetime access — just $1</strong>.
                </p>
              </div>
              <div style="text-align:center; margin-bottom:32px;">
                <a href="${upgradeUrl}"
                   style="display:inline-block; background-color:${brandColor}; color:#ffffff; text-decoration:none; padding:14px 48px; border-radius:8px; font-size:16px; font-weight:600;">
                  Upgrade to Pro — $1 Lifetime
                </a>
              </div>
              <p style="color:#999999; text-align:center; font-size:13px; margin:0;">
                After upgrading, the flow will automatically become accessible in your dashboard.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8f9fa; padding:24px 40px; border-top:1px solid #eeeeee;">
              <p style="color:#999999; font-size:12px; text-align:center; margin:0 0 8px 0;">
                If you weren't expecting this, you can safely ignore this email.
              </p>
              <p style="color:#bbbbbb; font-size:11px; text-align:center; margin:0;">
                &copy; ${new Date().getFullYear()} ValueChart. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
        <p style="color:#999999; font-size:12px; text-align:center; margin-top:16px;">
          Button not working? Copy this link:<br>
          <a href="${upgradeUrl}" style="color:#666666; word-break:break-all;">${upgradeUrl}</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    text: `${sharerName || "Someone"} shared a flow with you on ${appName}!

Flow: "${flowName || "Untitled Flow"}"

To access this flow, you need a ValueChart Pro account.
Upgrade for lifetime access — just $1:
${upgradeUrl}

After upgrading, the flow will automatically become accessible in your dashboard.

If you weren't expecting this, you can safely ignore this email.`,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Flow share Pro-required email sent to ${to}`);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) logger.info(`Mail preview URL: ${previewUrl}`);
  } catch (error) {
    logger.error(
      `Failed to send flow share Pro-required email to ${to}: ${error.message}`,
    );
    throw error;
  }
}

async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const safeName = escapeHtml(name || "there");
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
            <td style="background-color:#34A881; padding:32px 40px; text-align:center;">
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 14px;">
                <tr><td style="background-color:#ffffff; border-radius:12px; padding:8px 16px;">
                  <img src="${APP_URL()}/images/image.png" alt="ValueChart" width="150" style="display:block; border:0; height:auto;">
                </td></tr>
              </table>
              <p style="color:rgba(255,255,255,0.9); margin:0; font-size:14px;">AI-Powered Diagramming</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h2 style="color:#1a1a1a; text-align:center; margin:0 0 16px 0; font-size:22px; font-weight:600;">Reset Your Password</h2>
              <p style="color:#555555; font-size:16px; line-height:1.6;">Hi ${safeName},</p>
              <p style="color:#555555; font-size:16px; line-height:1.6;">We received a request to reset your password. Click the button below to create a new one:</p>
              <div style="text-align:center; margin:32px 0;">
                <a href="${resetUrl}"
                   style="display:inline-block; background-color:#34A881; color:#ffffff; text-decoration:none; padding:14px 48px; border-radius:8px; font-size:16px; font-weight:600;">
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

async function sendVerificationEmail({ to, name, otp }) {
  const safeName = escapeHtml(name || "there");
  const mailOptions = {
    from:
      process.env.SMTP_FROM ||
      process.env.SMTP_USER ||
      "noreply@valuecharts.com",
    to: resolveRecipient(to),
    subject: `Your ValueChart verification code: ${otp}`,
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
            <td style="background-color:#34A881; padding:32px 40px; text-align:center;">
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 14px;">
                <tr><td style="background-color:#ffffff; border-radius:12px; padding:8px 16px;">
                  <img src="${APP_URL()}/images/image.png" alt="ValueChart" width="150" style="display:block; border:0; height:auto;">
                </td></tr>
              </table>
              <p style="color:rgba(255,255,255,0.9); margin:0; font-size:14px;">AI-Powered Diagramming</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h2 style="color:#1a1a1a; text-align:center; margin:0 0 16px 0; font-size:22px; font-weight:600;">Verify Your Email</h2>
              <p style="color:#555555; font-size:16px; line-height:1.6;">Hi ${safeName},</p>
              <p style="color:#555555; font-size:16px; line-height:1.6;">Use the code below to verify your email and activate your ValueChart account.</p>
              <div style="text-align:center; margin:32px 0;">
                <div style="display:inline-block; background:#F0FDF4; border:2px solid #34A881; border-radius:12px; padding:18px 32px; font-size:32px; font-weight:700; letter-spacing:8px; color:#15803D; font-family:'Courier New', monospace;">
                  ${otp}
                </div>
              </div>
              <p style="color:#999999; font-size:13px; text-align:center;">This code expires in <strong>15 minutes</strong>.</p>
              <p style="color:#999999; font-size:13px; text-align:center;">If you didn't create an account, you can safely ignore this email.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8f9fa; padding:24px 40px; border-top:1px solid #eeeeee;">
              <p style="color:#bbbbbb; font-size:11px; text-align:center; margin:0;">&copy; ${new Date().getFullYear()} ValueChart. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `,
    text: `Hi ${name || "there"},

Your ValueChart verification code is: ${otp}

This code expires in 15 minutes. If you didn't create an account, ignore this email.`,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Verification OTP email sent to ${to}`);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      logger.info(`Mail preview URL: ${previewUrl}`);
    }
  } catch (error) {
    logger.error(
      `Failed to send verification email to ${to}: ${error.message}`,
    );
    throw error;
  }
}

/**
 * OTP-styled password reset for the native mobile shell — the web reset flow
 * (sendPasswordResetEmail) emails a link because the browser can host the
 * `/reset-password?token=` page; a native Flutter screen has no browser to
 * open, so it needs a short code it can render an input for instead. Same
 * 15-minute TTL and OTP visual style as sendVerificationEmail, different copy.
 */
async function sendPasswordResetOtpEmail({ to, name, otp }) {
  const safeName = escapeHtml(name || "there");
  const mailOptions = {
    from:
      process.env.SMTP_FROM ||
      process.env.SMTP_USER ||
      "noreply@valuecharts.com",
    to: resolveRecipient(to),
    subject: `Your ValueChart password reset code: ${otp}`,
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
            <td style="background-color:#34A881; padding:32px 40px; text-align:center;">
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 14px;">
                <tr><td style="background-color:#ffffff; border-radius:12px; padding:8px 16px;">
                  <img src="${APP_URL()}/images/image.png" alt="ValueChart" width="150" style="display:block; border:0; height:auto;">
                </td></tr>
              </table>
              <p style="color:rgba(255,255,255,0.9); margin:0; font-size:14px;">AI-Powered Diagramming</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h2 style="color:#1a1a1a; text-align:center; margin:0 0 16px 0; font-size:22px; font-weight:600;">Reset Your Password</h2>
              <p style="color:#555555; font-size:16px; line-height:1.6;">Hi ${safeName},</p>
              <p style="color:#555555; font-size:16px; line-height:1.6;">Use the code below in the app to reset your password.</p>
              <div style="text-align:center; margin:32px 0;">
                <div style="display:inline-block; background:#F0FDF4; border:2px solid #34A881; border-radius:12px; padding:18px 32px; font-size:32px; font-weight:700; letter-spacing:8px; color:#15803D; font-family:'Courier New', monospace;">
                  ${otp}
                </div>
              </div>
              <p style="color:#999999; font-size:13px; text-align:center;">This code expires in <strong>15 minutes</strong>.</p>
              <p style="color:#999999; font-size:13px; text-align:center;">If you didn't request this, you can safely ignore this email.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8f9fa; padding:24px 40px; border-top:1px solid #eeeeee;">
              <p style="color:#bbbbbb; font-size:11px; text-align:center; margin:0;">&copy; ${new Date().getFullYear()} ValueChart. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `,
    text: `Hi ${name || "there"},

Your ValueChart password reset code is: ${otp}

This code expires in 15 minutes. If you didn't request this, ignore this email.`,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Password reset OTP email sent to ${to}`);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      logger.info(`Mail preview URL: ${previewUrl}`);
    }
  } catch (error) {
    logger.error(
      `Failed to send password reset OTP email to ${to}: ${error.message}`,
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
  <div style="text-align:center;padding:24px 0;background:#34A881;border-radius:8px 8px 0 0">
    <div style="display:inline-block;background:#fff;border-radius:10px;padding:6px 14px;margin-bottom:10px">
      <img src="${APP_URL()}/images/image.png" alt="ValueChart" width="120" style="display:block;border:0;height:auto">
    </div>
    <h1 style="color:#fff;margin:0;font-size:22px">Payment Confirmed ✅</h1>
  </div>
  <div style="padding:32px 24px;border:1px solid #eee;border-top:0;border-radius:0 0 8px 8px">
    <p style="font-size:15px">Hi ${escapeHtml(user.name || "there")},</p>
    <p style="font-size:15px;line-height:1.6">Your payment of <strong>$${(amountCents / 100).toFixed(2)}</strong> for <strong>${escapeHtml(planName)}</strong> was successful. Your subscription is now active.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${APP_URL()}/dashboard/subscription" style="background:#34A881;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600">View Subscription</a>
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
    <div style="display:inline-block;background:#fff;border-radius:10px;padding:6px 14px;margin-bottom:10px">
      <img src="${APP_URL()}/images/image.png" alt="ValueChart" width="120" style="display:block;border:0;height:auto">
    </div>
    <h1 style="color:#fff;margin:0;font-size:22px">Payment Failed ⚠️</h1>
  </div>
  <div style="padding:32px 24px;border:1px solid #eee;border-top:0;border-radius:0 0 8px 8px">
    <p style="font-size:15px">Hi ${escapeHtml(user.name || "there")},</p>
    <p style="font-size:15px;line-height:1.6">We couldn't process your payment for <strong>${escapeHtml(planName)}</strong>. Please update your payment method to keep your subscription active.</p>
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
    <div style="display:inline-block;background:#fff;border-radius:10px;padding:6px 14px;margin-bottom:10px">
      <img src="${APP_URL()}/images/image.png" alt="ValueChart" width="120" style="display:block;border:0;height:auto">
    </div>
    <h1 style="color:#fff;margin:0;font-size:22px">Pack Expires in 7 Days</h1>
  </div>
  <div style="padding:32px 24px;border:1px solid #eee;border-top:0;border-radius:0 0 8px 8px">
    <p>Hi ${escapeHtml(user.name || "there")},</p>
    <p>Your <strong>${packLabel}</strong> pack expires on <strong>${new Date(expiresAt).toLocaleDateString()}</strong>. Renew now to keep all your flows accessible.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${APP_URL()}/dashboard/subscription" style="background:#34A881;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600">Renew Now</a>
    </div>
    <p style="color:#888;font-size:12px">If your pack expires you'll get a 3-day grace period; after that flows beyond your 10-flow free limit will move to trash.</p>
  </div>
</div>`,
    text: `Hi ${user.name || "there"},\n\nYour ${packLabel} pack expires on ${new Date(expiresAt).toLocaleDateString()}. Renew now to keep all your flows accessible.\n\nRenew: ${APP_URL()}/dashboard/subscription\n\nIf your pack expires you'll get a 3-day grace period; after that flows beyond your 10-flow free limit will move to trash.`,
  }),

  flowPack3Days: (user, packLabel, expiresAt) => ({
    subject: "⚠️ Only 3 days left — flow pack expiring",
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
  <div style="text-align:center;padding:24px 0;background:#FF7A45;border-radius:8px 8px 0 0">
    <div style="display:inline-block;background:#fff;border-radius:10px;padding:6px 14px;margin-bottom:10px">
      <img src="${APP_URL()}/images/image.png" alt="ValueChart" width="120" style="display:block;border:0;height:auto">
    </div>
    <h1 style="color:#fff;margin:0;font-size:22px">3 Days Until Expiry</h1>
  </div>
  <div style="padding:32px 24px;border:1px solid #eee;border-top:0;border-radius:0 0 8px 8px">
    <p>Hi ${escapeHtml(user.name || "there")},</p>
    <p>Your <strong>${packLabel}</strong> pack expires on <strong>${new Date(expiresAt).toLocaleDateString()}</strong>. Renew within 3 days to avoid losing flow access.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${APP_URL()}/dashboard/subscription" style="background:#FF7A45;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600">Renew Now</a>
    </div>
  </div>
</div>`,
    text: `Hi ${user.name || "there"},\n\nYour ${packLabel} pack expires on ${new Date(expiresAt).toLocaleDateString()}. Renew within 3 days to avoid losing flow access.\n\nRenew: ${APP_URL()}/dashboard/subscription`,
  }),

  flowPack1Day: (user, packLabel, expiresAt) => ({
    subject: "🔴 Final notice — flow pack expires tomorrow",
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
  <div style="text-align:center;padding:24px 0;background:#cf1322;border-radius:8px 8px 0 0">
    <div style="display:inline-block;background:#fff;border-radius:10px;padding:6px 14px;margin-bottom:10px">
      <img src="${APP_URL()}/images/image.png" alt="ValueChart" width="120" style="display:block;border:0;height:auto">
    </div>
    <h1 style="color:#fff;margin:0;font-size:22px">Expires Tomorrow</h1>
  </div>
  <div style="padding:32px 24px;border:1px solid #eee;border-top:0;border-radius:0 0 8px 8px">
    <p>Hi ${escapeHtml(user.name || "there")},</p>
    <p>Your <strong>${packLabel}</strong> pack expires on <strong>${new Date(expiresAt).toLocaleDateString()}</strong> — that's tomorrow. Renew now to keep your flows.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${APP_URL()}/dashboard/subscription" style="background:#cf1322;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600">Renew Now</a>
    </div>
  </div>
</div>`,
    text: `Hi ${user.name || "there"},\n\nYour ${packLabel} pack expires on ${new Date(expiresAt).toLocaleDateString()} — that's tomorrow. Renew now to keep your flows.\n\nRenew: ${APP_URL()}/dashboard/subscription`,
  }),

  flowPackGrace: (user, packLabel, gracePeriodEndsAt) => ({
    subject: "🔴 Flow pack expired — 3-day grace period started",
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
  <div style="text-align:center;padding:24px 0;background:#cf1322;border-radius:8px 8px 0 0">
    <div style="display:inline-block;background:#fff;border-radius:10px;padding:6px 14px;margin-bottom:10px">
      <img src="${APP_URL()}/images/image.png" alt="ValueChart" width="120" style="display:block;border:0;height:auto">
    </div>
    <h1 style="color:#fff;margin:0;font-size:22px">Pack Expired — Action Required</h1>
  </div>
  <div style="padding:32px 24px;border:1px solid #eee;border-top:0;border-radius:0 0 8px 8px">
    <p>Hi ${escapeHtml(user.name || "there")},</p>
    <p>Your <strong>${packLabel}</strong> pack has expired. You have a 3-day grace period — renew before <strong>${new Date(gracePeriodEndsAt).toLocaleDateString()}</strong> to keep all your flows.</p>
    <p>If you don't renew, flows beyond the 10-flow free limit will be moved to trash and you'll be asked to select 10 flows to keep.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${APP_URL()}/dashboard/subscription" style="background:#cf1322;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600">Renew Now</a>
    </div>
  </div>
</div>`,
    text: `Hi ${user.name || "there"},\n\nYour ${packLabel} pack has expired. You have a 3-day grace period — renew before ${new Date(gracePeriodEndsAt).toLocaleDateString()} to keep all your flows.\n\nIf you don't renew, flows beyond the 10-flow free limit will be moved to trash and you'll be asked to select 10 flows to keep.\n\nRenew: ${APP_URL()}/dashboard/subscription`,
  }),

  flowPickerRequired: (user, flowCount) => ({
    subject: "🔴 Action required: select 10 flows to keep",
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
  <div style="text-align:center;padding:24px 0;background:#cf1322;border-radius:8px 8px 0 0">
    <div style="display:inline-block;background:#fff;border-radius:10px;padding:6px 14px;margin-bottom:10px">
      <img src="${APP_URL()}/images/image.png" alt="ValueChart" width="120" style="display:block;border:0;height:auto">
    </div>
    <h1 style="color:#fff;margin:0;font-size:22px">Pick 10 Flows to Keep</h1>
  </div>
  <div style="padding:32px 24px;border:1px solid #eee;border-top:0;border-radius:0 0 8px 8px">
    <p>Hi ${escapeHtml(user.name || "there")},</p>
    <p>Your flow pack expired and you currently have <strong>${flowCount}</strong> flows. The free plan allows 10 — please select which 10 to keep. The rest will move to trash for 30 days, after which they'll be permanently deleted.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${APP_URL()}/dashboard/flows" style="background:#cf1322;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600">Select Flows to Keep</a>
    </div>
    <p style="color:#888;font-size:12px">You can also renew your pack at any time within 30 days to auto-restore the trashed flows.</p>
  </div>
</div>`,
    text: `Hi ${user.name || "there"},\n\nYour flow pack expired and you currently have ${flowCount} flows. The free plan allows 10 — please select which 10 to keep. The rest will move to trash for 30 days, after which they'll be permanently deleted.\n\nSelect flows to keep: ${APP_URL()}/dashboard/flows\n\nYou can also renew your pack at any time within 30 days to auto-restore the trashed flows.`,
  }),

  flowsRestoredOnRenewal: (user, restoredCount) => ({
    subject: "✅ Your flows have been restored",
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
  <div style="text-align:center;padding:24px 0;background:#34A881;border-radius:8px 8px 0 0">
    <div style="display:inline-block;background:#fff;border-radius:10px;padding:6px 14px;margin-bottom:10px">
      <img src="${APP_URL()}/images/image.png" alt="ValueChart" width="120" style="display:block;border:0;height:auto">
    </div>
    <h1 style="color:#fff;margin:0;font-size:22px">Flows Restored ✅</h1>
  </div>
  <div style="padding:32px 24px;border:1px solid #eee;border-top:0;border-radius:0 0 8px 8px">
    <p>Hi ${escapeHtml(user.name || "there")},</p>
    <p>Welcome back! We've restored <strong>${restoredCount}</strong> flow${restoredCount === 1 ? "" : "s"} from trash now that your pack is active again.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${APP_URL()}/dashboard/flows" style="background:#34A881;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600">Open Flows</a>
    </div>
  </div>
</div>`,
    text: `Hi ${user.name || "there"},\n\nWelcome back! We've restored ${restoredCount} flow${restoredCount === 1 ? "" : "s"} from trash now that your pack is active again.\n\nOpen flows: ${APP_URL()}/dashboard/flows`,
  }),

  subscriptionCancelled: (user, expiresAt) => ({
    subject: "Subscription Cancelled — ValueChart",
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
  <div style="text-align:center;padding:24px 0;background:#666;border-radius:8px 8px 0 0">
    <div style="display:inline-block;background:#fff;border-radius:10px;padding:6px 14px;margin-bottom:10px">
      <img src="${APP_URL()}/images/image.png" alt="ValueChart" width="120" style="display:block;border:0;height:auto">
    </div>
    <h1 style="color:#fff;margin:0;font-size:22px">Subscription Cancelled</h1>
  </div>
  <div style="padding:32px 24px;border:1px solid #eee;border-top:0;border-radius:0 0 8px 8px">
    <p style="font-size:15px">Hi ${escapeHtml(user.name || "there")},</p>
    <p style="font-size:15px;line-height:1.6">Your subscription has been cancelled.${expiresAt ? ` You'll keep access until <strong>${new Date(expiresAt).toLocaleDateString()}</strong>.` : ""}</p>
    <p style="font-size:14px;color:#666">After that, your account will return to the free plan.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${APP_URL()}/dashboard/subscription" style="background:#34A881;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600">Reactivate Subscription</a>
    </div>
  </div>
</div>`,
    text: `Hi ${user.name || "there"},\n\nYour subscription has been cancelled.${expiresAt ? ` Access continues until ${new Date(expiresAt).toLocaleDateString()}.` : ""}\n\nReactivate: ${APP_URL()}/dashboard/subscription`,
  }),
};

module.exports = {
  sendTeamInviteEmail,
  sendFlowShareEmail,
  sendFlowShareProRequiredEmail,
  sendPasswordResetEmail,
  sendPasswordResetOtpEmail,
  sendVerificationEmail,
  sendEmail,
  emailTemplates,
};
