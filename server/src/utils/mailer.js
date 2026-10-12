'use strict';
const env = require('../config/env');

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!env.smtpEnabled) return null;
  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport({
    host: env.SMTP.host,
    port: env.SMTP.port,
    secure: env.SMTP.port === 465,
    auth: { user: env.SMTP.user, pass: env.SMTP.pass },
  });
  return transporter;
}

/**
 * Sends an email. Without SMTP credentials configured it logs the message
 * (dev transport) and resolves — so no flow ever breaks in demo mode.
 */
async function sendMail({ to, subject, html, text, attachments }) {
  const tx = getTransporter();
  if (!tx) {
    console.log(`📧 [dev-mail] to=${to} subject="${subject}"`);
    return { queued: true, transport: 'console' };
  }
  try {
    const info = await tx.sendMail({ from: env.SMTP.from, to, subject, html, text, attachments });
    return { queued: true, transport: 'smtp', messageId: info.messageId };
  } catch (e) {
    console.warn('mail send failed:', e.message);
    return { queued: false, error: e.message };
  }
}

const layout = (title, body) => `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
  <div style="background:#4f46e5;color:#fff;padding:18px 24px;font-size:18px;font-weight:600">${title}</div>
  <div style="padding:24px;color:#111827;font-size:14px;line-height:1.6">${body}</div>
  <div style="padding:14px 24px;background:#f9fafb;color:#6b7280;font-size:12px">Automated message from EMS. Please do not reply.</div>
</div>`;

module.exports = { sendMail, layout };
