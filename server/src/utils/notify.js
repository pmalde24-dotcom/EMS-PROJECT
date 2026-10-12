'use strict';
const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendMail, layout } = require('./mailer');
const env = require('../config/env');

/**
 * Creates an in-app notification (and optionally an email) for a user.
 * Silently no-ops when the user id is missing or notification is disabled.
 */
async function notify({ userId, employeeId, title, body, type = 'system', link, priority = 'normal', email, sendEmail = false, refModel, refId, icon }) {
  try {
    if (!userId) return null;
    const user = await User.findById(userId).select('isActive notificationPrefs email name');
    if (!user || !user.isActive) return null;
    const prefs = user.notificationPrefs || {};
    if (prefs.inApp === false && !sendEmail) return null;
    const doc = prefs.inApp === false ? null : await Notification.create({
      user: user._id, employee: employeeId, title, body, type, link, priority, refModel, refId, icon,
      channels: sendEmail ? ['in_app', 'email'] : ['in_app'],
    });
    if ((sendEmail || prefs.email) && (email || user.email)) {
      await sendMail({
        to: email || user.email, subject: title,
        html: layout(title, `<p>${body || ''}</p>${link ? `<p><a href="${env.CLIENT_ORIGIN}${link}">Open in EMS</a></p>` : ''}`),
      });
      if (doc) { doc.emailSent = true; doc.emailSentAt = new Date(); await doc.save(); }
    }
    return doc;
  } catch (e) {
    console.warn('notify failed:', e.message);
    return null;
  }
}

/** Fan-out helper: notify many users at once. */
async function notifyMany(userIds, payload) {
  return Promise.all(userIds.filter(Boolean).map((id) => notify({ ...payload, userId: id })));
}
module.exports = { notify, notifyMany };
