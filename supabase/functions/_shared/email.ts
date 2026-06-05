/**
 * QuickRevert Email System — powered by Brevo
 * Sends transactional emails to users from connect@quickrevert.tech
 *
 * Requires env var: BREVO_API_KEY
 *
 * Usage:
 *   import { sendEmail } from "../_shared/email.ts";
 *   await sendEmail({ emailType: "welcome", to: "user@gmail.com", name: "Priya" });
 */

export type EmailType =
  | "welcome"
  | "payment_success"
  | "expiry_warning_3days"
  | "expiry_warning_1day";

export interface SendEmailOptions {
  emailType: EmailType;
  to: string;
  name?: string;        // User's display name
  planName?: string;    // e.g. "Premium (Annual)"
  expiryDate?: string;  // ISO date string
  amountPaid?: number;  // in ₹ rupees
  isFree?: boolean;
}

// ─── HTML Templates ────────────────────────────────────────────────────────────

const LOGO_URL = "https://app.quickrevert.tech/full_logo.png";

const BASE_STYLE = `
  body { margin:0; padding:0; font-family: 'Segoe UI', Arial, sans-serif; background:#0f0f10; color:#e5e5e5; }
  .wrapper { max-width:600px; margin:0 auto; padding:32px 16px; }
  .card { background:#1a1a2e; border-radius:16px; overflow:hidden; border:1px solid #2a2a3e; }
  .header { background:linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 100%); padding:28px 32px 20px; text-align:center; border-bottom:1px solid #2a2a3e; }
  .header img { max-width:220px; height:auto; display:block; margin:0 auto; }
  .body { padding:32px; }
  .body h2 { margin:0 0 12px; font-size:20px; color:#e5e5e5; font-weight:600; }
  .body p { margin:0 0 16px; font-size:15px; color:#a0a0b0; line-height:1.65; }
  .highlight-box { background:#0f0f1a; border:1px solid #2a2a3e; border-radius:12px; padding:20px 24px; margin:20px 0; }
  .highlight-box .row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #2a2a3e; font-size:14px; }
  .highlight-box .row:last-child { border-bottom:none; }
  .highlight-box .label { color:#6b6b80; }
  .highlight-box .value { color:#e5e5e5; font-weight:600; }
  .btn { display:inline-block; margin:8px 0; padding:14px 32px; background:linear-gradient(135deg,#6c3fff,#c084fc); color:#fff !important; text-decoration:none; border-radius:10px; font-size:15px; font-weight:600; text-align:center; }
  .tutorial-card { display:block; background:#0f0f1a; border:1px solid #2a2a3e; border-radius:12px; padding:16px 20px; margin:10px 0; text-decoration:none; color:inherit; }
  .tutorial-card:hover { border-color:#6c3fff; }
  .tutorial-card .t-icon { font-size:22px; margin-bottom:6px; }
  .tutorial-card .t-title { font-size:14px; font-weight:600; color:#e5e5e5; margin:0 0 4px; }
  .tutorial-card .t-link { font-size:12px; color:#6c3fff; }
  .tutorials-label { font-size:13px; color:#6b6b80; text-transform:uppercase; letter-spacing:1px; margin:24px 0 8px; }
  .footer { padding:24px 32px; text-align:center; color:#555570; font-size:12px; border-top:1px solid #2a2a3e; }
  .footer a { color:#6c3fff; text-decoration:none; }
  .badge { display:inline-block; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600; }
  .badge-green { background:#0d2e1a; color:#4ade80; border:1px solid #166534; }
  .badge-purple { background:#1e0d3e; color:#c084fc; border:1px solid #6c3fff; }
  .badge-red { background:#2e0d0d; color:#f87171; border:1px solid #991b1b; }
`;

function baseTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style>${BASE_STYLE}</style>
</head>
<body>
<div class="wrapper">
  <div class="card">
    <div class="header">
      <img src="${LOGO_URL}" alt="QuickRevert" />
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      <p>You received this email because you have an account on <a href="https://app.quickrevert.tech">QuickRevert</a>.<br/>
      Questions? Reply to this email or visit <a href="https://app.quickrevert.tech">app.quickrevert.tech</a></p>
      <p style="margin-top:8px;">© ${new Date().getFullYear()} QuickRevert. All rights reserved.</p>
    </div>
  </div>
</div>
</body>
</html>`;
}

function welcomeTemplate(name: string): { subject: string; html: string } {
  return {
    subject: "Welcome to QuickRevert! 🎉 Let's automate your Instagram",
    html: baseTemplate(`
      <h2>Hey ${name}, welcome aboard! 🎉</h2>
      <p>You've joined QuickRevert — the smartest way to automate your Instagram DMs, comments, and lead generation.</p>

      <p class="tutorials-label">🎬 Get Started — Watch These Quick Tutorials</p>

      <a href="https://youtu.be/LPRzM5xicK0?si=U_jfmzdWVb4OIhm7" class="tutorial-card" target="_blank">
        <div class="t-icon">🔐</div>
        <div class="t-title">How to Login to QuickRevert</div>
        <div class="t-link">youtube.com → Watch Now →</div>
      </a>

      <a href="https://youtu.be/QHWKvPF6YD0?si=dvikePKT-0XTuim_" class="tutorial-card" target="_blank">
        <div class="t-icon">📸</div>
        <div class="t-title">How to Connect Your Instagram Account</div>
        <div class="t-link">youtube.com → Watch Now →</div>
      </a>

      <a href="https://youtu.be/MzRqEbfqVH0?si=EK2XM0rrmIIKTM64" class="tutorial-card" target="_blank">
        <div class="t-icon">⚡</div>
        <div class="t-title">How to Create a Comment → DM Automation</div>
        <div class="t-link">youtube.com → Watch Now →</div>
      </a>

      <p style="margin-top:24px;">Ready to dive in? Connect your Instagram and create your first automation in minutes.</p>
      <p style="text-align:center; margin-top:20px;">
        <a href="https://app.quickrevert.tech/connect-accounts" class="btn">Get Started →</a>
      </p>
      <p>If you have any questions, just reply to this email — we're always here to help.</p>
      <p>Let's go! 🚀<br/><strong>— The QuickRevert Team</strong></p>
    `),
  };
}

function paymentSuccessTemplate(opts: SendEmailOptions): { subject: string; html: string } {
  const name = opts.name || "there";
  const plan = opts.planName || "your plan";
  const expiry = opts.expiryDate
    ? new Date(opts.expiryDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })
    : "—";
  const amount = opts.isFree ? "₹0 (Free via coupon)" : opts.amountPaid ? `₹${opts.amountPaid.toLocaleString("en-IN")}` : "—";

  return {
    subject: `Your QuickRevert plan is now active ✅`,
    html: baseTemplate(`
      <h2>Payment confirmed! ✅</h2>
      <p>Hey ${name}, your <strong>${plan}</strong> plan is now active. Here's a summary of your purchase:</p>
      <div class="highlight-box">
        <div class="row"><span class="label">Plan</span><span class="value">${plan}</span></div>
        <div class="row"><span class="label">Amount Paid</span><span class="value">${amount}</span></div>
        <div class="row"><span class="label">Active Until</span><span class="value">${expiry}</span></div>
        <div class="row"><span class="label">Status</span><span class="value"><span class="badge badge-green">✅ Active</span></span></div>
      </div>
      <p>You now have full access to all QuickRevert features. Start by creating your first automation!</p>
      <p style="text-align:center;">
        <a href="https://app.quickrevert.tech/automations" class="btn">Create Automation →</a>
      </p>
      <p>Thank you for trusting QuickRevert. 🙏<br/><strong>— The QuickRevert Team</strong></p>
    `),
  };
}

function expiry3DayTemplate(opts: SendEmailOptions): { subject: string; html: string } {
  const name = opts.name || "there";
  const plan = opts.planName || "your plan";
  const expiry = opts.expiryDate
    ? new Date(opts.expiryDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })
    : "in 3 days";

  return {
    subject: `⏰ Your QuickRevert plan expires in 3 days`,
    html: baseTemplate(`
      <h2>Your plan expires in 3 days ⏰</h2>
      <p>Hey ${name}, just a heads-up — your <strong>${plan}</strong> plan expires on <strong>${expiry}</strong>.</p>
      <div class="highlight-box">
        <div class="row"><span class="label">Plan</span><span class="value">${plan}</span></div>
        <div class="row"><span class="label">Expires On</span><span class="value">${expiry}</span></div>
        <div class="row"><span class="label">Status</span><span class="value"><span class="badge badge-purple">⏰ Expiring Soon</span></span></div>
      </div>
      <p>Renew now to keep your automations running without any interruption. Don't let your Instagram leads go cold!</p>
      <p style="text-align:center;">
        <a href="https://app.quickrevert.tech/pricing" class="btn">Renew Plan →</a>
      </p>
      <p>Questions? Just reply to this email.<br/><strong>— The QuickRevert Team</strong></p>
    `),
  };
}

function expiryLastDayTemplate(opts: SendEmailOptions): { subject: string; html: string } {
  const name = opts.name || "there";
  const plan = opts.planName || "your plan";
  const expiry = opts.expiryDate
    ? new Date(opts.expiryDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })
    : "today";

  return {
    subject: `🚨 Last day of your QuickRevert plan — renew today`,
    html: baseTemplate(`
      <h2>Today is your last day 🚨</h2>
      <p>Hey ${name}, your <strong>${plan}</strong> plan expires <strong>today (${expiry})</strong>. After today, your automations will be paused.</p>
      <div class="highlight-box">
        <div class="row"><span class="label">Plan</span><span class="value">${plan}</span></div>
        <div class="row"><span class="label">Expires</span><span class="value">${expiry}</span></div>
        <div class="row"><span class="label">Status</span><span class="value"><span class="badge badge-red">🚨 Expires Today</span></span></div>
      </div>
      <p>Renew right now to keep your DMs flowing and your Instagram automations active. Takes less than a minute!</p>
      <p style="text-align:center;">
        <a href="https://app.quickrevert.tech/pricing" class="btn">Renew Now →</a>
      </p>
      <p>Don't let your momentum stop. We're rooting for you! 💪<br/><strong>— The QuickRevert Team</strong></p>
    `),
  };
}

// ─── Main sendEmail Function ────────────────────────────────────────────────────

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const brevoApiKey = Deno.env.get("BREVO_API_KEY");
  if (!brevoApiKey) {
    console.warn("[EMAIL] BREVO_API_KEY not set — skipping email to", opts.to);
    return;
  }

  const name = opts.name || opts.to.split("@")[0];

  let template: { subject: string; html: string };
  switch (opts.emailType) {
    case "welcome":
      template = welcomeTemplate(name);
      break;
    case "payment_success":
      template = paymentSuccessTemplate(opts);
      break;
    case "expiry_warning_3days":
      template = expiry3DayTemplate(opts);
      break;
    case "expiry_warning_1day":
      template = expiryLastDayTemplate(opts);
      break;
    default:
      console.error("[EMAIL] Unknown emailType:", opts.emailType);
      return;
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoApiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "QuickRevert", email: "connect@quickrevert.tech" },
        to: [{ email: opts.to, name }],
        subject: template.subject,
        htmlContent: template.html,
      }),
    });

    if (res.ok) {
      console.log(`[EMAIL] ✅ Sent '${opts.emailType}' to ${opts.to}`);
    } else {
      const errBody = await res.text();
      console.error(`[EMAIL] Brevo failed (${res.status}): ${errBody}`);
    }
  } catch (e) {
    console.error("[EMAIL] Fetch error:", e);
  }
}
