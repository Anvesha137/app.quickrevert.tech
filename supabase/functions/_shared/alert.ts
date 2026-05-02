/**
 * QuickRevert Alerting System
 * Sends email alerts to the admin via Resend API.
 * Usage: import { sendAlert } from "../_shared/alert.ts";
 *
 * Requires env var: RESEND_API_KEY
 * Requires env var: ALERT_EMAIL (admin destination email)
 * Requires env var: ALERT_FROM_EMAIL (verified sender in Resend, e.g. alerts@quickrevert.tech)
 */

export type AlertLevel = "error" | "warning" | "info";

export interface AlertPayload {
  level: AlertLevel;
  subject: string;
  context: string;        // Which function / system area
  details: string;        // Human-readable description of what happened
  data?: Record<string, unknown>; // Any extra structured data (account, user, error)
}

export async function sendAlert(payload: AlertPayload): Promise<void> {
  const discordWebhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const alertEmail = Deno.env.get("ALERT_EMAIL");
  const fromEmail = Deno.env.get("ALERT_FROM_EMAIL") || "alerts@quickrevert.tech";

  const levelEmoji = payload.level === "error" ? "🔴" : payload.level === "warning" ? "🟡" : "🔵";
  const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const color = payload.level === "error" ? 0xff4d4d : payload.level === "warning" ? 0xffcc00 : 0x3399ff;

  // --- OPTION 1: DISCORD (Recommended) ---
  if (discordWebhookUrl) {
    try {
      const discordPayload = {
        embeds: [{
          title: `${levelEmoji} ${payload.subject}`,
          description: payload.details,
          color: color,
          fields: [
            { name: "Context", value: payload.context, inline: true },
            { name: "Timestamp (IST)", value: timestamp, inline: true },
            ...(payload.data ? [{ name: "Data", value: "```json\n" + JSON.stringify(payload.data, null, 2).substring(0, 1000) + "\n```" }] : [])
          ],
          footer: { text: "QuickRevert System Alert" }
        }]
      };

      const res = await fetch(discordWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(discordPayload)
      });

      if (res.ok) {
        console.log(`[ALERT] ✅ Discord notification sent: ${payload.subject}`);
        return;
      }
      console.error(`[ALERT] Discord failed (${res.status}): ${await res.text()}`);
    } catch (e) {
      console.error("[ALERT] Discord error:", e);
    }
  }

  // --- OPTION 2: RESEND (Fallback) ---
  if (resendApiKey && alertEmail) {
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#222;">
  <div style="background:${payload.level === "error" ? "#fff0f0" : payload.level === "warning" ? "#fffbe6" : "#f0f4ff"};border-left:4px solid ${payload.level === "error" ? "#e53e3e" : payload.level === "warning" ? "#d97706" : "#3b82f6"};padding:16px 20px;border-radius:4px;margin-bottom:24px;">
    <h2 style="margin:0 0 4px 0;">${levelEmoji} ${payload.subject}</h2>
    <p style="margin:0;color:#555;font-size:13px;">${payload.context} &nbsp;|&nbsp; ${timestamp} IST</p>
  </div>
  <p style="font-size:15px;line-height:1.6;">${payload.details.replace(/\n/g, "<br>")}</p>
  ${payload.data ? `<h3>Details</h3><pre style="background:#f5f5f5;padding:12px;border-radius:6px;font-size:13px;overflow:auto;">${JSON.stringify(payload.data, null, 2)}</pre>` : ""}
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/>
  <p style="font-size:12px;color:#999;">QuickRevert Automated Alert &nbsp;•&nbsp; Do not reply to this email</p>
</body>
</html>`;

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromEmail,
          to: [alertEmail],
          subject: `${levelEmoji} [QuickRevert] ${payload.subject}`,
          html,
        }),
      });

      if (res.ok) {
        console.log(`[ALERT] ✅ Email sent: ${payload.subject}`);
        return;
      }
    } catch (e) {
      console.error("[ALERT] Resend error:", e);
    }
  }

  // If no method worked or was configured
  console.warn(`[ALERT:${payload.level.toUpperCase()}] ${payload.subject} — No notification method configured (Discord or Resend)`);
}
