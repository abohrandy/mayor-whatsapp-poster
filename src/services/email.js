const { Resend } = require('resend');

let resendInstance = null;

function getResendInstance() {
    if (!resendInstance) {
        if (!process.env.RESEND_API_KEY) {
            return null;
        }
        resendInstance = new Resend(process.env.RESEND_API_KEY);
    }
    return resendInstance;
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Mayor WhatsApp Poster <noreply@mayorposter.com>';
const APP_NAME = 'Mayor WhatsApp Poster';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

// ─── Shared HTML Template ────────────────────────────────────────────────────

function baseTemplate(title, bodyHtml) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden;border:1px solid #334155;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:32px 40px;text-align:center;">
              <div style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">📣 ${APP_NAME}</div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;color:#e2e8f0;">
              <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#ffffff;">${title}</h2>
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#0f172a;padding:24px 40px;text-align:center;border-top:1px solid #334155;">
              <p style="margin:0;font-size:12px;color:#64748b;">You're receiving this because you have an account on ${APP_NAME}.<br/>© ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function infoRow(label, value) {
    return `<tr>
      <td style="padding:8px 0;color:#94a3b8;font-size:13px;width:140px;vertical-align:top;">${label}</td>
      <td style="padding:8px 0;color:#e2e8f0;font-size:13px;font-weight:600;">${value}</td>
    </tr>`;
}

function badge(text, color = '#6366f1') {
    return `<span style="display:inline-block;background:${color};color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;letter-spacing:0.5px;text-transform:uppercase;">${text}</span>`;
}

async function send({ to, subject, html }) {
    const resend = getResendInstance();
    if (!resend) {
        console.warn('[Email] RESEND_API_KEY not configured — skipping email send.');
        return;
    }
    try {
        const { error } = await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
        if (error) {
            console.error('[Email] Resend error:', error);
        } else {
            console.log(`[Email] Sent "${subject}" to ${Array.isArray(to) ? to.join(', ') : to}`);
        }
    } catch (err) {
        console.error('[Email] Failed to send email:', err.message);
    }
}

// ─── Email Templates ─────────────────────────────────────────────────────────

/**
 * Welcome email to a newly registered user.
 */
async function sendWelcomeEmail(userEmail, trialEndsAt) {
    const trialDate = trialEndsAt ? new Date(trialEndsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

    const html = baseTemplate('Welcome to Mayor WhatsApp Poster! 🎉', `
      <p style="color:#94a3b8;line-height:1.7;margin:0 0 24px;">
        Hi there! Your account has been created successfully. You now have access to a powerful WhatsApp group posting platform — schedule announcements, manage multiple accounts, and reach all your groups effortlessly.
      </p>
      ${trialDate ? `<div style="background:#1d2d4a;border:1px solid #3b82f6;border-radius:10px;padding:16px 20px;margin:0 0 24px;">
        <p style="margin:0;color:#93c5fd;font-size:13px;font-weight:600;">🎁 Your 14-day free trial is active until <strong>${trialDate}</strong>. Upgrade anytime to keep access.</p>
      </div>` : ''}
      <p style="color:#94a3b8;line-height:1.7;margin:0 0 24px;">Here's what you can do right away:</p>
      <ul style="color:#94a3b8;padding-left:20px;line-height:2;">
        <li>Link your WhatsApp account via QR code</li>
        <li>Create and schedule announcements</li>
        <li>Set up audience lists for your groups</li>
        <li>Track activity logs in real-time</li>
      </ul>
      <a href="${process.env.APP_URL || '#'}" style="display:inline-block;margin-top:24px;padding:12px 28px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">Open Dashboard →</a>
    `);

    await send({ to: userEmail, subject: `Welcome to ${APP_NAME}! Your account is ready 🎉`, html });
}

/**
 * Notify admin when a new user signs up.
 */
async function sendNewUserAdminAlert(userEmail, userId) {
    if (!ADMIN_EMAIL) return;

    const html = baseTemplate('New User Registration', `
      <p style="color:#94a3b8;margin:0 0 20px;">A new user has registered on the platform.</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;">
        ${infoRow('Email', userEmail)}
        ${infoRow('User ID', `#${userId}`)}
        ${infoRow('Registered At', new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }))}
        ${infoRow('Plan', badge('14-Day Trial', '#f59e0b'))}
      </table>
      <a href="${process.env.APP_URL || '#'}/users" style="display:inline-block;margin-top:28px;padding:11px 24px;background:#1e293b;border:1px solid #475569;color:#e2e8f0;text-decoration:none;border-radius:8px;font-weight:600;font-size:13px;">View in Admin Panel →</a>
    `);

    await send({ to: ADMIN_EMAIL, subject: `New User Signed Up: ${userEmail}`, html });
}

/**
 * Notify user and admin when a subscription is activated.
 */
async function sendSubscriptionActivatedEmail(userEmail, planName) {
    const html = baseTemplate('Subscription Activated ✅', `
      <p style="color:#94a3b8;line-height:1.7;margin:0 0 20px;">
        Great news! Your subscription has been activated successfully. You now have full access to all ${APP_NAME} features.
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;">
        ${infoRow('Plan', badge(planName, '#10b981'))}
        ${infoRow('Status', badge('Active', '#10b981'))}
        ${infoRow('Activated At', new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }))}
      </table>
      <a href="${process.env.APP_URL || '#'}" style="display:inline-block;margin-top:28px;padding:12px 28px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">Go to Dashboard →</a>
    `);

    await send({ to: userEmail, subject: `Your ${APP_NAME} subscription is now active! ✅`, html });

    // Notify admin too
    if (ADMIN_EMAIL && userEmail !== ADMIN_EMAIL) {
        const adminHtml = baseTemplate('Subscription Activated', `
          <p style="color:#94a3b8;margin:0 0 20px;">A user's subscription has been activated via Paystack.</p>
          <table cellpadding="0" cellspacing="0" style="width:100%;">
            ${infoRow('User Email', userEmail)}
            ${infoRow('Plan', badge(planName, '#10b981'))}
            ${infoRow('Activated At', new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }))}
          </table>
        `);
        await send({ to: ADMIN_EMAIL, subject: `Subscription Activated: ${userEmail} → ${planName}`, html: adminHtml });
    }
}

/**
 * Notify user when their subscription is cancelled/disabled.
 */
async function sendSubscriptionCancelledEmail(userEmail) {
    const html = baseTemplate('Subscription Cancelled', `
      <p style="color:#94a3b8;line-height:1.7;margin:0 0 20px;">
        Your ${APP_NAME} subscription has been cancelled or disabled. You will lose access to Plus features at the end of your billing period.
      </p>
      <p style="color:#94a3b8;line-height:1.7;margin:0 0 24px;">
        If you believe this was a mistake, or if you'd like to reactivate your subscription, please visit the billing section of your dashboard.
      </p>
      <a href="${process.env.APP_URL || '#'}" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">Manage Subscription →</a>
    `);

    await send({ to: userEmail, subject: `Your ${APP_NAME} subscription has been cancelled`, html });
}

/**
 * Notify user when an announcement is successfully posted.
 */
async function sendAnnouncementPostedEmail(userEmail, announcementTitle, groupCount, failedCount = 0) {
    const allSucceeded = failedCount === 0;
    const html = baseTemplate(
        allSucceeded ? 'Announcement Posted Successfully ✅' : 'Announcement Posted (with some failures) ⚠️',
        `<p style="color:#94a3b8;line-height:1.7;margin:0 0 20px;">
          Your announcement has been processed and sent to your target WhatsApp groups.
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          ${infoRow('Announcement', `<em>${announcementTitle}</em>`)}
          ${infoRow('Sent To', `${groupCount - failedCount} group(s)`)}
          ${failedCount > 0 ? infoRow('Failed', badge(`${failedCount} failed`, '#ef4444')) : ''}
          ${infoRow('Status', badge(allSucceeded ? 'All Delivered' : 'Partial Delivery', allSucceeded ? '#10b981' : '#f59e0b'))}
          ${infoRow('Posted At', new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }))}
        </table>
        <a href="${process.env.APP_URL || '#'}/activity" style="display:inline-block;margin-top:28px;padding:11px 24px;background:#1e293b;border:1px solid #475569;color:#e2e8f0;text-decoration:none;border-radius:8px;font-weight:600;font-size:13px;">View Activity Logs →</a>
      `
    );

    await send({
        to: userEmail,
        subject: allSucceeded
            ? `✅ "${announcementTitle}" posted to ${groupCount} group(s)`
            : `⚠️ "${announcementTitle}" posted with ${failedCount} failure(s)`,
        html
    });
}

/**
 * Notify user when a WhatsApp session is successfully connected.
 */
async function sendWhatsAppConnectedEmail(userEmail, phoneNumber) {
    const html = baseTemplate('WhatsApp Account Linked ✅', `
      <p style="color:#94a3b8;line-height:1.7;margin:0 0 20px;">
        A new WhatsApp account has been successfully linked to your ${APP_NAME} profile.
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;">
        ${infoRow('Phone Number', phoneNumber ? `+${phoneNumber}` : 'Unknown')}
        ${infoRow('Status', badge('Connected', '#10b981'))}
        ${infoRow('Linked At', new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }))}
      </table>
      <p style="color:#94a3b8;font-size:13px;margin-top:20px;line-height:1.6;">
        If you did not link this account, please log in immediately and remove the session from your WhatsApp Status page.
      </p>
      <a href="${process.env.APP_URL || '#'}" style="display:inline-block;margin-top:16px;padding:11px 24px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:13px;">Go to Dashboard →</a>
    `);

    await send({ to: userEmail, subject: `WhatsApp account linked to your ${APP_NAME} profile`, html });
}

/**
 * Notify user when their WhatsApp session drops/disconnects, so they know to
 * relink it before their scheduled announcements start failing to send.
 */
async function sendWhatsAppDisconnectedEmail(userEmail, phoneNumber) {
    const html = baseTemplate('WhatsApp Account Disconnected ⚠️', `
      <p style="color:#94a3b8;line-height:1.7;margin:0 0 20px;">
        Your linked WhatsApp account has disconnected from ${APP_NAME}. Any scheduled announcements for this session will not be delivered until it's reconnected.
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;">
        ${infoRow('Phone Number', phoneNumber ? `+${phoneNumber}` : 'Unknown')}
        ${infoRow('Status', badge('Disconnected', '#ef4444'))}
        ${infoRow('Disconnected At', new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }))}
      </table>
      <p style="color:#94a3b8;font-size:13px;margin-top:20px;line-height:1.6;">
        This usually happens after logging out from WhatsApp on your phone, a long period offline, or unlinking the device. Head to your WhatsApp Status page to scan a new QR code and reconnect.
      </p>
      <a href="${process.env.APP_URL || '#'}" style="display:inline-block;margin-top:16px;padding:11px 24px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:13px;">Reconnect Now →</a>
    `);

    await send({ to: userEmail, subject: `⚠️ Your WhatsApp account disconnected from ${APP_NAME}`, html });
}

/**
 * Remind a user whose trial or manually-granted access is about to expire that
 * they need to make a payment to keep uninterrupted access.
 */
async function sendPaymentReminderEmail(userEmail, expiresAt, daysLeft) {
    const expiryDate = new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const urgent = daysLeft <= 1;

    const html = baseTemplate(
        urgent ? 'Your Access Expires Tomorrow! ⏰' : `Your Access Expires in ${daysLeft} Days`,
        `<p style="color:#94a3b8;line-height:1.7;margin:0 0 20px;">
          Your ${APP_NAME} access is set to expire soon. Make a payment now to avoid any interruption to your scheduled announcements.
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          ${infoRow('Expires On', `<strong>${expiryDate}</strong>`)}
          ${infoRow('Days Remaining', badge(`${daysLeft} day${daysLeft === 1 ? '' : 's'}`, urgent ? '#ef4444' : '#f59e0b'))}
        </table>
        <p style="color:#94a3b8;line-height:1.7;margin:24px 0;">
          Once your access expires, your WhatsApp groups will stop receiving scheduled announcements until you renew.
        </p>
        <a href="${process.env.APP_URL || '#'}/billing" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">Make Payment →</a>
      `
    );

    await send({
        to: userEmail,
        subject: urgent
            ? `⏰ Your ${APP_NAME} access expires tomorrow`
            : `Reminder: Your ${APP_NAME} access expires in ${daysLeft} days`,
        html
    });
}

module.exports = {
    sendWelcomeEmail,
    sendNewUserAdminAlert,
    sendSubscriptionActivatedEmail,
    sendSubscriptionCancelledEmail,
    sendAnnouncementPostedEmail,
    sendWhatsAppConnectedEmail,
    sendWhatsAppDisconnectedEmail,
    sendPaymentReminderEmail,
};
