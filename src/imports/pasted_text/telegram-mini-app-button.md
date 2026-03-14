# Telegram Mini App — Blue "Launch" Button in Keyboard

Complete guide to implementing the blue button that appears in the Telegram chat keyboard area and opens your Mini App.
Copy this file into another project to replicate the same behavior.

---

## Overview

There are **two different blue buttons** that open a Mini App from a Telegram bot chat. Both are configured server-side via the Telegram Bot API:

```
┌──────────────────────────────────────────────┐
│  Chat with @YourBot                          │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │ Bot message                          │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  🎯 Open MyApp          ← Reply KB  │    │ ← Button #1 (Reply Keyboard)
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────┐  ┌────────────────────────┐    │
│  │ ≡ Menu   │  │  Type a message...     │    │ ← Button #2 (Menu Button)
│  └──────────┘  └────────────────────────┘    │
└──────────────────────────────────────────────┘
```

| Button | API Method | Where it appears | Persistence |
|---|---|---|---|
| **Menu Button** | `setChatMenuButton` | Left of the text input field, replaces the "/" commands icon | Global, always visible |
| **Reply Keyboard** | `sendMessage` with `reply_markup` | Above the text input, as a custom keyboard | Per-message, but can be `is_persistent: true` |

---

## 1. Menu Button (the small blue button near text input)

This is the button that appears **to the left of the message input field** (replacing the default "/" menu). It's a global setting — once set, it appears for every user who opens the chat with your bot.

### API Call

```
POST https://api.telegram.org/bot<TOKEN>/setChatMenuButton
```

### Payload

```json
{
  "menu_button": {
    "type": "web_app",
    "text": "Open MyApp",
    "web_app": {
      "url": "https://your-miniapp-url.com"
    }
  }
}
```

### Implementation (Deno / Hono server)

```typescript
const BOT_API = "https://api.telegram.org/bot";

async function botApi(method: string, body: Record<string, unknown>): Promise<any> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");

  const res = await fetch(`${BOT_API}${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description || "Unknown"}`);
  }
  return data.result;
}

/**
 * Set the bot's chat menu button to open the Mini App.
 * Call this once during server startup or via a setup endpoint.
 */
async function setChatMenuButton(webAppUrl: string): Promise<any> {
  return botApi("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "Open MyApp",     // ← Text shown on the button
      web_app: { url: webAppUrl },
    },
  });
}
```

### When to Call

Call `setChatMenuButton` during your server's boot sequence or from a `/setup` endpoint:

```typescript
// During server startup (auto-setup pattern)
const miniAppUrl = Deno.env.get("MINIAPP_URL");
if (miniAppUrl) {
  try {
    await setChatMenuButton(miniAppUrl);
    console.log(`Menu button set to: ${miniAppUrl}`);
  } catch (err) {
    console.log("Failed to set menu button:", err);
  }
}
```

### To Reset Back to Default

```json
{
  "menu_button": {
    "type": "default"
  }
}
```

---

## 2. Reply Keyboard Button (the big blue button in the keyboard area)

This is the **large blue button** that replaces the system keyboard. It sits **above the text input** in a custom keyboard row. When tapped, it opens the Mini App.

### Key Concepts

- It's sent as part of a regular `sendMessage` call using `reply_markup`.
- The `web_app: { url }` property makes it open a Mini App instead of sending text.
- `is_persistent: true` keeps the keyboard visible even after the user sends a message.
- `resize_keyboard: true` shrinks the keyboard to fit its buttons (no wasted space).

### TypeScript Types

```typescript
interface ReplyKeyboardButton {
  text: string;                      // Button label (visible to user)
  web_app?: { url: string };         // Opens Mini App when tapped
  request_contact?: boolean;         // Alternative: request user's contact
}

interface ReplyKeyboardMarkup {
  keyboard: ReplyKeyboardButton[][]; // 2D array: rows of buttons
  resize_keyboard?: boolean;         // true = shrink to fit
  one_time_keyboard?: boolean;       // true = hide after one tap
  is_persistent?: boolean;           // true = always visible
  input_field_placeholder?: string;  // Placeholder text in the input field
}
```

### Building the Reply Keyboard

```typescript
function buildReplyKeyboard(appUrl: string): ReplyKeyboardMarkup {
  return {
    keyboard: [
      [
        {
          text: "🎯 Open MyApp",       // ← Button text
          web_app: { url: appUrl },     // ← Opens this URL as Mini App
        },
      ],
    ],
    resize_keyboard: true,              // Shrink to button size
    is_persistent: true,                // Always show keyboard
    input_field_placeholder: "Tap «Open MyApp» above ⬆️",
  };
}
```

### Sending It to the User

The reply keyboard is attached to a `sendMessage` call. Send it once — it stays until replaced or removed.

```typescript
async function sendMessage(
  chatId: number,
  text: string,
  options?: {
    reply_markup?: ReplyKeyboardMarkup | { remove_keyboard: true };
    parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
  }
): Promise<any> {
  return botApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: options?.parse_mode || "HTML",
    ...(options?.reply_markup ? { reply_markup: options.reply_markup } : {}),
  });
}

// Usage: send after /start command or after authentication
const replyKb = buildReplyKeyboard("https://your-miniapp-url.com");
await sendMessage(
  chatId,
  "⌨️ Quick access keyboard activated.",
  { reply_markup: replyKb }
);
```

### Removing the Reply Keyboard

```typescript
await sendMessage(chatId, "Keyboard removed.", {
  reply_markup: { remove_keyboard: true },
});
```

---

## 3. Full Integration Pattern

Here's how the two buttons work together in a typical bot:

```typescript
// ── Server startup ──────────────────────────────────
// Set global menu button (appears for ALL users)
const MINIAPP_URL = Deno.env.get("MINIAPP_URL") || "";

if (MINIAPP_URL) {
  await setChatMenuButton(MINIAPP_URL);
}

// ── Webhook handler: /start command ─────────────────
// When user sends /start, give them the persistent reply keyboard
app.post("/webhook", async (c) => {
  const update = await c.req.json();
  const message = update.message;
  if (!message?.text) return c.json({ ok: true });

  const chatId = message.chat.id;
  const text = message.text.trim();

  if (text === "/start" || text.startsWith("/start ")) {
    // 1. Send welcome message (with optional inline button)
    await sendMessage(chatId, "<b>Welcome to MyApp!</b>\n\nTap the button below to open the app.", {
      parse_mode: "HTML",
    });

    // 2. Activate persistent reply keyboard with the blue "Open" button
    const replyKb = buildReplyKeyboard(MINIAPP_URL);
    await sendMessage(chatId, "⌨️ Quick access keyboard activated.", {
      reply_markup: replyKb,
    });
  }

  return c.json({ ok: true });
});
```

### What the User Sees

After sending `/start`:

1. Welcome message appears.
2. "⌨️ Quick access keyboard activated." message appears.
3. The system keyboard is replaced by a **single blue button** labeled "🎯 Open MyApp".
4. This button **persists** across messages (`is_persistent: true`).
5. Additionally, the **menu button** (small, to the left of the input) always says "Open MyApp".

Two entry points, same Mini App.

---

## 4. Deep Links via web_app Buttons

You can include `startapp` parameters in the `web_app.url` to route users to specific screens:

```typescript
// Build a URL that deep-links to a specific challenge
const deepLinkUrl = `${MINIAPP_URL}?startapp=challenge_abc123`;

// Use in an inline keyboard button
const inlineKeyboard = {
  inline_keyboard: [[
    {
      text: "🚀 Open Challenge",
      web_app: { url: deepLinkUrl },  // ← NOT "url:", use "web_app:"
    },
  ]],
};

await sendMessage(chatId, "You've been invited to a challenge!", {
  reply_markup: inlineKeyboard,
});
```

### Reading `startapp` in Your Mini App

```typescript
// In your React Mini App:
function getStartParam(): string {
  // 1. From Telegram WebApp SDK
  const tg = (window as any).Telegram?.WebApp;
  const sdkParam = tg?.initDataUnsafe?.start_param;
  if (sdkParam) return sdkParam;

  // 2. Fallback: URL query param (web_app buttons pass it this way)
  const url = new URL(window.location.href);
  return url.searchParams.get("startapp") || "";
}

// Route based on the parameter
const param = getStartParam();
if (param.startsWith("challenge_")) {
  navigate(`/challenges/${param.replace("challenge_", "")}`);
}
```

---

## 5. Inline Keyboard vs Reply Keyboard vs Menu Button

| Feature | Inline Keyboard | Reply Keyboard | Menu Button |
|---|---|---|---|
| **Where** | Attached to a specific message | Replaces system keyboard | Left of text input |
| **API** | `sendMessage` with `inline_keyboard` | `sendMessage` with `keyboard` | `setChatMenuButton` |
| **Persistence** | Lives with the message | `is_persistent: true` option | Always visible |
| **Opens Mini App** | `web_app: { url }` | `web_app: { url }` | `web_app: { url }` |
| **Deep links** | Append `?startapp=...` to url | Append `?startapp=...` to url | Only base URL |
| **Visual** | Small button under message | Large button, keyboard area | Small icon/text |
| **User action** | Triggers `callback_query` OR opens webapp | Opens webapp (if `web_app`) OR sends text | Opens webapp |

### Important: `web_app` vs `url`

```typescript
// ✅ Opens as Mini App (embedded WebView)
{ text: "Open", web_app: { url: "https://myapp.com" } }

// ❌ Opens in external browser (NOT a Mini App)
{ text: "Open", url: "https://myapp.com" }

// ❌ For deep links like t.me/bot/app — may cause "web app not found" error
{ text: "Open", url: "https://t.me/MyBot/myapp?startapp=xyz" }

// ✅ Correct deep link via web_app
{ text: "Open", web_app: { url: "https://myapp.com?startapp=xyz" } }
```

---

## 6. Environment Variables Required

| Variable | Example | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `7123456789:AAF...` | Bot token from @BotFather |
| `MINIAPP_URL` | `https://myapp.vercel.app` | Your Mini App's public URL |

---

## 7. BotFather Setup (Prerequisites)

Before the API calls work, you must configure your bot via [@BotFather](https://t.me/BotFather):

1. **Create a bot** (if not done): `/newbot`
2. **Create a Mini App**: `/newapp` → select your bot → provide:
   - Title
   - Description
   - Photo (640x360 recommended)
   - **Web App URL** — your deployed Mini App URL (e.g., `https://myapp.vercel.app`)
   - Short name (used in `t.me/YourBot/shortname` links)
3. **Enable inline mode** (optional): `/setinline` → allows inline keyboard buttons

The `setChatMenuButton` API call will override whatever you set in BotFather for the menu button.

---

## 8. Complete Minimal Example

A single-file Deno server that sets up both buttons:

```typescript
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";

const app = new Hono();
app.use("*", cors());

const BOT_API = "https://api.telegram.org/bot";
const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const MINIAPP_URL = Deno.env.get("MINIAPP_URL") || "";

async function botApi(method: string, body: Record<string, unknown>) {
  const res = await fetch(`${BOT_API}${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`TG API: ${data.description}`);
  return data.result;
}

// ── Setup endpoint: call once to configure everything ──
app.post("/setup", async (c) => {
  const webhookUrl = `${new URL(c.req.url).origin}/webhook`;

  // 1. Set webhook
  await botApi("setWebhook", {
    url: webhookUrl,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });

  // 2. Set menu button (small blue button near text input)
  if (MINIAPP_URL) {
    await botApi("setChatMenuButton", {
      menu_button: {
        type: "web_app",
        text: "Open MyApp",
        web_app: { url: MINIAPP_URL },
      },
    });
  }

  // 3. Set bot commands
  await botApi("setMyCommands", {
    commands: [
      { command: "start", description: "Start the app" },
    ],
  });

  return c.json({ success: true, webhookUrl });
});

// ── Webhook: handle incoming messages ──
app.post("/webhook", async (c) => {
  const update = await c.req.json();
  const message = update.message;
  if (!message?.text) return c.json({ ok: true });

  const chatId = message.chat.id;

  if (message.text.startsWith("/start")) {
    // Send welcome message
    await botApi("sendMessage", {
      chat_id: chatId,
      text: "<b>Welcome!</b>\n\nTap the button below to open the app.",
      parse_mode: "HTML",
    });

    // Send persistent reply keyboard (big blue button)
    if (MINIAPP_URL) {
      await botApi("sendMessage", {
        chat_id: chatId,
        text: "⌨️ Quick access keyboard activated.",
        reply_markup: {
          keyboard: [[
            { text: "🎯 Open MyApp", web_app: { url: MINIAPP_URL } },
          ]],
          resize_keyboard: true,
          is_persistent: true,
          input_field_placeholder: "Tap the button above ⬆️",
        },
      });
    }
  }

  return c.json({ ok: true });
});

Deno.serve(app.fetch);
```

### Deploy & Activate

```bash
# Deploy your server, then call setup once:
curl -X POST https://your-server.com/setup
```

After this:
- The menu button appears for all users.
- Users who send `/start` get the persistent reply keyboard with the blue "Open MyApp" button.
- Both buttons open your Mini App in Telegram's embedded WebView.

---

## 9. Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| "Web app not found" error | Using `url: "t.me/Bot/app"` instead of `web_app: { url }` | Always use `web_app: { url: "https://..." }` with your **actual deployed URL**, not a `t.me` link |
| Button sends text instead of opening app | Missing `web_app` property | Add `web_app: { url: "..." }` to the button object |
| Keyboard doesn't persist | Missing `is_persistent: true` | Add `is_persistent: true` to `ReplyKeyboardMarkup` |
| Menu button not showing | Bot doesn't have a Mini App configured | Create one via `/newapp` in @BotFather first |
| Button opens in browser, not WebView | Using `url` instead of `web_app` | Change `url: "..."` to `web_app: { url: "..." }` |
| `startapp` param not received | URL encoding issue or using `t.me` link | Pass `?startapp=value` directly in the `web_app.url` |
