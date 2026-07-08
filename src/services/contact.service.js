const { prisma } = require("../lib/prisma");
const { sendEmail } = require("../utils/email");
const logger = require("../utils/logger");

const CONTACT_INBOX = process.env.CONTACT_INBOX || "contact@valueflowsoft.com";

// Escape user input for the HTML email body (same rule as utils/email.js:
// never escape the plain-text fallback).
function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

class ContactService {
  async submitContactForm({
    name,
    email,
    phone,
    subject,
    message,
    source,
    ipAddress,
  }) {
    const tag =
      source === "support" || source === "feedback" ? source : "contact";

    // 1. Persist first — the submission is never lost even if email fails.
    const submission = await prisma.contactSubmission.create({
      data: {
        name,
        email,
        phone: phone || null,
        subject: subject || null,
        message: message || null,
        source: tag,
        ipAddress: ipAddress || null,
      },
    });

    // 2. Notify by email (best-effort — no-ops if SMTP is unconfigured).
    const safe = {
      name: escapeHtml(name),
      email: escapeHtml(email),
      phone: escapeHtml(phone),
      subject: escapeHtml(subject),
      message: escapeHtml(message).replace(/\n/g, "<br/>"),
    };
    let emailed = false;
    try {
      await sendEmail({
        to: CONTACT_INBOX,
        subject: `[Website ${tag}] ${subject || "New message"} — ${name}`,
        html: `
        <h2>New ${tag} form submission</h2>
        <p><strong>Name:</strong> ${safe.name}</p>
        <p><strong>Email:</strong> ${safe.email}</p>
        ${safe.phone ? `<p><strong>Phone:</strong> ${safe.phone}</p>` : ""}
        ${safe.subject ? `<p><strong>Subject:</strong> ${safe.subject}</p>` : ""}
        <p><strong>Message:</strong><br/>${safe.message || "(empty)"}</p>
        <hr/>
        <p style="color:#888">Sent from the valueflowsoft.com website form.</p>
      `,
        text: `New ${tag} form submission\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone || "-"}\nSubject: ${subject || "-"}\n\n${message || "(empty)"}`,
      });
      emailed = true;
      await prisma.contactSubmission.update({
        where: { id: submission.id },
        data: { emailed: true },
      });
    } catch (err) {
      // Submission is safely stored; log the email failure but don't fail the request.
      logger.error(`[contact] email notification failed: ${err.message}`);
    }

    logger.info(
      `Contact form submitted (${tag}) from ${email} — saved id=${submission.id}, emailed=${emailed}`,
    );
    return submission;
  }
}

module.exports = new ContactService();
