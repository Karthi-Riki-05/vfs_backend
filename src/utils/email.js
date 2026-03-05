const nodemailer = require('nodemailer');
const logger = require('./logger');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

async function sendTeamInviteEmail({ to, teamName, inviterName, acceptUrl }) {
    const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@valuecharts.com',
        to,
        subject: `You've been invited to join ${teamName || 'a team'} on Value Charts`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #3CB371;">Team Invitation</h2>
                <p>${inviterName || 'A team member'} has invited you to join <strong>${teamName || 'their team'}</strong> on Value Charts.</p>
                <div style="margin: 24px 0;">
                    <a href="${acceptUrl}"
                       style="background: #3CB371; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600;">
                        Accept Invitation
                    </a>
                </div>
                <p style="color: #666; font-size: 13px;">This invitation expires in 7 days. If you didn't expect this email, you can ignore it.</p>
            </div>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        logger.info(`Invite email sent to ${to}`);
    } catch (error) {
        logger.error(`Failed to send invite email to ${to}: ${error.message}`);
        throw error;
    }
}

module.exports = { sendTeamInviteEmail };
