/**
 * QuickRevert Email System — powered by Brevo
 * Sends transactional emails to users from connect@quickrevert.tech
 *
 * Requires env vars:
 *   BREVO_API_KEY
 *   UNSUBSCRIBE_SECRET   (HMAC secret for unsubscribe tokens)
 *   NEON_DB_URL          (to check email_unsubscribed flag before sending)
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
  userEmail?: string;   // used for unsubscribe token (defaults to opts.to)
}

// ─── HMAC Token Generation (Web Crypto — available in Deno) ─────────────────────

export async function generateUnsubscribeToken(email: string): Promise<string> {
  const secret = Deno.env.get("UNSUBSCRIBE_SECRET") || "quickrevert-unsub-secret";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(email));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

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
  .badge { display:inline-block; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600; }
  .badge-green { background:#0d2e1a; color:#4ade80; border:1px solid #166534; }
  .badge-purple { background:#1e0d3e; color:#c084fc; border:1px solid #6c3fff; }
  .badge-red { background:#2e0d0d; color:#f87171; border:1px solid #991b1b; }
  .email-footer { padding:28px 32px 20px; border-top:1px solid #2a2a3e; background:#0f0f1a; }
  .footer-logo { max-width:140px; height:auto; display:block; margin:0 auto 20px; opacity:0.75; }
  .footer-divider { height:1px; background:#2a2a3e; margin:16px 0; }
  .footer-section-label { font-size:10px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:#4a4a60; margin:0 0 8px; }
  .footer-link { color:#6c3fff; text-decoration:none; font-size:13px; }
  .footer-social-row { display:table; }
  .social-btn { display:inline-block; padding:5px 12px; border:1px solid #2a2a3e; border-radius:20px; font-size:11px; font-weight:600; color:#a0a0b0; text-decoration:none; background:#1a1a2e; margin:3px 4px 3px 0; }
  .footer-desc { font-size:12px; color:#555570; line-height:1.7; margin:12px 0; }
  .footer-copy { font-size:11px; color:#3a3a50; text-align:center; margin:16px 0 4px; }
  .unsub-link { font-size:11px; color:#3a3a50; text-align:center; display:block; margin-top:4px; }
  .unsub-link a { color:#4a4a60; text-decoration:underline; }
`;

// ─── Footer Builder ──────────────────────────────────────────────────────────────

function buildFooter(unsubscribeUrl: string): string {
  return `
  <div class="email-footer">
    <img src="${LOGO_URL}" alt="QuickRevert" class="footer-logo" />
    <div class="footer-divider"></div>

    <p class="footer-section-label">What We Do</p>
    <p style="font-size:13px;color:#6b6b80;margin:0 0 12px;">
      <a href="https://quickrevert.tech/#features" class="footer-link">&#8594; Explore QuickRevert Features</a>
    </p>

    <p class="footer-section-label">Follow Us</p>
    <div class="footer-social-row">
      <a href="https://www.instagram.com/quickrevert/" class="social-btn" target="_blank">&#128248; Instagram</a>
      <a href="https://www.youtube.com/@quickrevert" class="social-btn" target="_blank">&#9654; YouTube</a>
      <a href="https://www.linkedin.com/company/quickrevert" class="social-btn" target="_blank">in LinkedIn</a>
      <a href="https://x.com/quickrevert" class="social-btn" target="_blank">X Twitter</a>
    </div>

    <div class="footer-divider"></div>

    <p class="footer-desc">
      QuickRevert is India's leading platform for Instagram DM automation, helping creators &amp; businesses grow.<br/>
      Officially <strong style="color:#a0a0b0;">Meta Business Partner</strong> &#8212; verified &amp; trusted.<br/>
      Trusted by <strong style="color:#a0a0b0;">1000+ creators</strong> across India.
    </p>

    <div class="footer-divider"></div>

    <p class="footer-section-label">Help &amp; Support</p>
    <p style="font-size:13px;color:#6b6b80;margin:0 0 16px;">
      <a href="https://quickrevert.tech/faqs" class="footer-link">&#8594; Frequently Asked Questions</a>
    </p>

    <p class="footer-copy">&#169; ${new Date().getFullYear()} QuickRevert. All rights reserved.</p>
    <span class="unsub-link">
      <a href="${unsubscribeUrl}">Click here to unsubscribe</a>
    </span>
  </div>
  `;
}

async function baseTemplate(content: string, userEmail: string): Promise<string> {
  const token = await generateUnsubscribeToken(userEmail);
  const unsubUrl = `https://app.quickrevert.tech/unsubscribe?email=${encodeURIComponent(userEmail)}&token=${token}`;
  const footer = buildFooter(unsubUrl);

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
    ${footer}
  </div>
</div>
</body>
</html>`;
}

// ─── Email Templates ─────────────────────────────────────────────────────────────

async function welcomeTemplate(name: string, userEmail: string): Promise<{ subject: string; html: string }> {
  return {
    subject: "Welcome to QuickRevert! 🎉 Let's automate your Instagram",
    html: await baseTemplate(`
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
    `, userEmail),
  };
}

async function paymentSuccessTemplate(opts: SendEmailOptions): Promise<{ subject: string; html: string }> {
  const name = opts.name || "there";
  const plan = opts.planName || "your plan";
  const expiry = opts.expiryDate
    ? new Date(opts.expiryDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })
    : "—";
  const amount = opts.isFree ? "₹0 (Free via coupon)" : opts.amountPaid ? `₹${opts.amountPaid.toLocaleString("en-IN")}` : "—";
  const userEmail = opts.userEmail || opts.to;

  return {
    subject: `Your QuickRevert plan is now active ✅`,
    html: await baseTemplate(`
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
    `, userEmail),
  };
}

async function expiry3DayTemplate(opts: SendEmailOptions): Promise<{ subject: string; html: string }> {
  const name = opts.name || "there";
  const plan = opts.planName || "your plan";
  const expiry = opts.expiryDate
    ? new Date(opts.expiryDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })
    : "in 3 days";
  const userEmail = opts.userEmail || opts.to;

  return {
    subject: `⏰ Your QuickRevert plan expires in 3 days`,
    html: await baseTemplate(`
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
    `, userEmail),
  };
}

async function expiryLastDayTemplate(opts: SendEmailOptions): Promise<{ subject: string; html: string }> {
  const name = opts.name || "there";
  const plan = opts.planName || "your plan";
  const expiry = opts.expiryDate
    ? new Date(opts.expiryDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })
    : "today";
  const userEmail = opts.userEmail || opts.to;

  return {
    subject: `🚨 Last day of your QuickRevert plan — renew today`,
    html: await baseTemplate(`
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
    `, userEmail),
  };
}

// ─── Unsubscribe Opt-Out Check ───────────────────────────────────────────────────

async function isUnsubscribed(email: string): Promise<boolean> {
  const neonDbUrl = Deno.env.get("NEON_DB_URL");
  if (!neonDbUrl) return false;
  try {
    const { Client } = await import("https://deno.land/x/postgres@v0.17.0/mod.ts");
    const client = new Client(neonDbUrl);
    await client.connect();
    const res = await client.queryObject<{ email_unsubscribed: boolean }>(
      "SELECT email_unsubscribed FROM users WHERE email = $1 LIMIT 1",
      [email]
    );
    await client.end();
    return res.rows[0]?.email_unsubscribed === true;
  } catch (e: any) {
    console.warn("[EMAIL] Could not check unsubscribe status:", e.message);
    return false;
  }
}

// ─── Main sendEmail Function ─────────────────────────────────────────────────────

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const brevoApiKey = Deno.env.get("BREVO_API_KEY");
  if (!brevoApiKey) {
    console.warn("[EMAIL] BREVO_API_KEY not set — skipping email to", opts.to);
    return;
  }

  // ── Opt-out guard ──
  if (await isUnsubscribed(opts.to)) {
    console.log(`[EMAIL] Skipping — ${opts.to} is unsubscribed.`);
    return;
  }

  const name = opts.name || opts.to.split("@")[0];
  const userEmail = opts.userEmail || opts.to;

  let template: { subject: string; html: string };
  switch (opts.emailType) {
    case "welcome":
      template = await welcomeTemplate(name, userEmail);
      break;
    case "payment_success":
      template = await paymentSuccessTemplate({ ...opts, userEmail });
      break;
    case "expiry_warning_3days":
      template = await expiry3DayTemplate({ ...opts, userEmail });
      break;
    case "expiry_warning_1day":
      template = await expiryLastDayTemplate({ ...opts, userEmail });
      break;
    default:
      console.error("[EMAIL] Unknown emailType:", (opts as any).emailType);
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
