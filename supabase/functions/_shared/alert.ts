/**
 * QuickRevert Alerting System
 * Sends Discord notifications to the admin via a single webhook.
 * Color-coded by channel/type for easy scanning.
 *
 * Requires env var: DISCORD_WEBHOOK_URL
 *
 * Usage:
 *   import { sendAlert } from "../_shared/alert.ts";
 *   await sendAlert({ channel: "payment", level: "info", subject: "...", context: "...", details: "..." });
 */

export type AlertLevel = "error" | "warning" | "info";

export type AlertChannel =
  | "new_user"    // 🎉 Green  — new signup
  | "payment"     // 💰 Purple — payment success
  | "automation"  // ⚡ Blue   — new automation created
  | "instagram"   // 📸 Pink   — Instagram connected
  | "error"       // 🔴 Red    — errors
  | "warning"     // 🟡 Yellow — warnings
  | "info";       // 🔵 Blue   — general info

export interface AlertPayload {
  level: AlertLevel;
  channel?: AlertChannel;   // Determines embed color + emoji. Defaults to level.
  subject: string;
  context: string;          // Which function / system area
  details: string;          // Human-readable description of what happened
  data?: Record<string, unknown>; // Extra structured data (shown as JSON code block)
}

// Channel → Discord embed color (decimal)
const CHANNEL_COLORS: Record<AlertChannel, number> = {
  new_user:   0x57F287, // Green
  payment:    0x9B59B6, // Purple
  automation: 0x3498DB, // Blue
  instagram:  0xE1306C, // Instagram Pink
  error:      0xFF4D4D, // Red
  warning:    0xFFCC00, // Yellow
  info:       0x3399FF, // Light Blue
};

// Channel → emoji prefix for the title
const CHANNEL_EMOJI: Record<AlertChannel, string> = {
  new_user:   "🎉",
  payment:    "💰",
  automation: "⚡",
  instagram:  "📸",
  error:      "🔴",
  warning:    "🟡",
  info:       "🔵",
};

export async function sendAlert(payload: AlertPayload): Promise<void> {
  const discordWebhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");

  if (!discordWebhookUrl) {
    console.warn(`[ALERT:${payload.level.toUpperCase()}] ${payload.subject} — DISCORD_WEBHOOK_URL not configured`);
    return;
  }

  // Resolve channel — fall back to level if channel not specified
  const channel: AlertChannel = payload.channel ?? (
    payload.level === "error" ? "error" :
    payload.level === "warning" ? "warning" : "info"
  );

  const color = CHANNEL_COLORS[channel];
  const emoji = CHANNEL_EMOJI[channel];
  const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "📌 Context", value: payload.context, inline: true },
    { name: "🕐 Time (IST)", value: timestamp, inline: true },
  ];

  if (payload.data && Object.keys(payload.data).length > 0) {
    const jsonStr = JSON.stringify(payload.data, null, 2);
    // Discord field values max 1024 chars
    const truncated = jsonStr.length > 980 ? jsonStr.substring(0, 980) + "\n..." : jsonStr;
    fields.push({ name: "📋 Data", value: "```json\n" + truncated + "\n```" });
  }

  const discordPayload = {
    embeds: [{
      title: `${emoji} ${payload.subject}`,
      description: payload.details,
      color,
      fields,
      footer: { text: "QuickRevert System" },
      timestamp: new Date().toISOString(),
    }],
  };

  try {
    const res = await fetch(discordWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(discordPayload),
    });

    if (res.ok) {
      console.log(`[ALERT] ✅ Discord sent: ${payload.subject}`);
    } else {
      console.error(`[ALERT] Discord failed (${res.status}): ${await res.text()}`);
    }
  } catch (e) {
    console.error("[ALERT] Discord error:", e);
  }
}
