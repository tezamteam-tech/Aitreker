# Telegram Mini App — Entry Points (How Users Open Your App)

Complete guide to every way a user can launch your Mini App from the Telegram chat.
Copy this file into another project to replicate the same UX pattern.

---

## Overview

There are **4 entry points** that open a Mini App. Each is configured server-side via the Bot API:

```
  ┌──────────────────────────────────────────────┐
  │  Chat with @BECOMEAI_BOT                     │
  │                                              │
  │  ┌──────────────────────────────────────┐    │
  │  │  Welcome back, Alex!                 │    │
  │  │                                      │    │
  │  │  ┌────────────────────────────────┐  │    │
  │  │  │  🚀 Открыть BECOME            │  │    │ ← #1 Inline Button (web_app)
  │  │  ├────────────────────────────────┤  │    │
  │  │  │  🔄 Sync Data                 │  │    │ ← #2 Callback Button
  │  │  └────────────────────────────────┘  │    │
  │  └──────────────────────────────────────┘    │
  │                                              │
  │  ┌──────────────────────────────────────┐    │
  │  │  ⏰ Reminder: Morning Reflection     │    │
  │  │                                      │    │
  │  │  ┌────────────────────────────────┐  │    │
  │  │  │  🚀 Открыть                   │  │    │ ← #1 (deep link variant)
  │  │  └────────────────────────────────┘  │    │
  │  └──────────────────────────────────────┘    │
  │                                              │
  │  ┌──────────────────────────────────────┐    │
  │  │  🚀 Открыть BECOME               │  │    │ ← #3 Reply Keyboard (persistent)
  │  └──────────────────────────────────────┘    │
  │                                              │
  │  ┌──────────┐  ┌────────────────────────┐    │
  │  │ ≡ Menu   │  │  Нажми «Открыть» ⬆️   │    │ ← #4 Menu Button (global)
  │  └──────────┘  └────────────────────────┘    │
  └──────────────────────────────────────────────┘
```

| # | Entry Point | How it appears | When to use |
|---|---|---|---|
| 1 | **Inline Button** (`web_app`) | Blue button attached to a specific message | Welcome message, notifications, deep links |
| 2 | **Callback Button** (`callback_data`) | Button attached to a message, triggers server logic | Sync, settings, actions that need server response |
| 3 | **Reply Keyboard** (`web_app`) | Persistent blue button replacing the system keyboard | Always-visible "Open" button at bottom of chat |
| 4 | **Menu Button** | Small button next to the text input (replaces ≡) | Global, always visible for all users |

---

## 1. Inline Button (`web_app: { url }`)

Attached to a specific message. Opens the Mini App **directly** in an embedded WebView.

### When it's used

- **Welcome message** — after `/start`, new user sees "Open BECOME"
- **Notifications** — "Morning reminder: tap to open your day"
- **Deep links** — "You've been invited to a challenge → Open Challenge"

### Code

```typescript
import type { InlineKeyboardButton } from "./telegram-bot.tsx";

// Simple "Open" button
function openButton(label: string, appUrl: string): InlineKeyboardButton[] {
  return [{ text: label, web_app: { url: appUrl } }];
}

// Deep link button — routes to a specific screen inside the Mini App
function deepLinkButton(
  label: string,
  appUrl: string,
  startapp: string
): InlineKeyboardButton[] {
  const url = appUrl.includes("?")
    ? `${appUrl}&startapp=${encodeURIComponent(startapp)}`
    : `${appUrl}?startapp=${encodeURIComponent(startapp)}`;
  return [{ text: label, web_app: { url } }];
}

// Usage in welcome message:
const keyboard: InlineKeyboardButton[][] = [
  openButton("🚀 Открыть BECOME", MINIAPP_URL),       // Row 1: open app
  [{ text: "🔄 Sync Data", callback_data: "cmd_sync" }], // Row 2: callback
];

await sendMessage(chatId, welcomeText, {
  reply_markup: { inline_keyboard: keyboard },
});
```

### Deep Link Example (Notifications)

```typescript
// Notification about a new challenge invitation
const btn = deepLinkButton(
  "🚀 Открыть челлендж",
  MINIAPP_URL,
  `challenge_${challengeId}`
);

await sendMessage(chatId, "🏆 <b>Тебя пригласили в челлендж!</b>", {
  reply_markup: { inline_keyboard: [btn] },
});
```

The Mini App reads `startapp` on load and routes accordingly:

```typescript
// In your React app (layout.tsx):
const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param
  || new URL(window.location.href).searchParams.get("startapp")
  || "";

if (startParam.startsWith("challenge_")) {
  navigate(`/challenges/${startParam.replace("challenge_", "")}`);
}
```

### CRITICAL: `web_app` vs `url`

```typescript
// ✅ Correct — opens inside Telegram as Mini App
{ text: "Open", web_app: { url: "https://myapp.com" } }

// ❌ Wrong — opens in external browser
{ text: "Open", url: "https://myapp.com" }

// ❌ Wrong — may cause "web app not found" error
{ text: "Open", url: "https://t.me/MyBot/app?startapp=xyz" }

// ✅ Correct deep link via web_app
{ text: "Open", web_app: { url: "https://myapp.com?startapp=xyz" } }
```

**Exception**: The `url:` type can be used with `t.me` deep links (`buildTgDeepLink()`) — Telegram resolves them natively. This is useful as a fallback when the direct domain has SSL issues:

```typescript
// Also works — Telegram resolves t.me links natively
{ text: "Open", url: "https://t.me/BECOMEAI_BOT/app" }
// But does NOT support startapp — use web_app for deep links
```

---

## 2. Callback Button (`callback_data`)

Attached to a message. When tapped, sends a `callback_query` to your webhook — the **server handles it**, not the Mini App.

### When it's used

- **Sync Data** — server-side operation, no need to open the app
- **Settings toggles** — enable/disable notifications
- **Quick actions** — mark task done, skip day, etc.

### Code

```typescript
// In the inline keyboard:
const keyboard: InlineKeyboardButton[][] = [
  [{ text: "🔄 Sync Data", callback_data: "cmd_sync" }],
  [{ text: "⚙️ Settings",  callback_data: "cmd_settings" }],
];

await sendMessage(chatId, "What would you like to do?", {
  reply_markup: { inline_keyboard: keyboard },
});
```

### Handling in Webhook

```typescript
app.post("/webhook", async (c) => {
  const update = await c.req.json();

  // Handle callback queries (inline button presses)
  if (update.callback_query) {
    const cb = update.callback_query;
    const chatId = cb.message?.chat?.id;
    const data = cb.data; // "cmd_sync", "cmd_settings", etc.

    // MUST answer the callback to remove the loading spinner
    await botApi("answerCallbackQuery", {
      callback_query_id: cb.id,
      text: "Processing...",
    });

    switch (data) {
      case "cmd_sync":
        // Perform sync logic...
        await sendMessage(chatId, "✅ Data synced!");
        break;
      case "cmd_settings":
        // Show settings keyboard...
        break;
    }
  }

  return c.json({ ok: true });
});
```

### Callback vs Inline — When to Use Which

| Need | Use |
|---|---|
| Open the Mini App | `web_app: { url }` |
| Open the Mini App at a specific screen | `web_app: { url: "...?startapp=..." }` |
| Run server-side logic without opening anything | `callback_data: "cmd_..."` |
| Open a link in external browser | `url: "https://..."` |

---

## 3. Reply Keyboard (Persistent "Open" Button)

Replaces the system keyboard with a **permanent big blue button** at the bottom of the chat. This is the **primary way users re-open the app** — it's always there.

### When it's used

- After `/start` — activated for every user
- Always visible (` is_persistent: true`)
- Contains `web_app: { url }` — tapping opens the Mini App

### Code

```typescript
interface ReplyKeyboardButton {
  text: string;
  web_app?: { url: string };
  request_contact?: boolean;
}

interface ReplyKeyboardMarkup {
  keyboard: ReplyKeyboardButton[][];
  resize_keyboard?: boolean;
  is_persistent?: boolean;
  input_field_placeholder?: string;
}

function buildReplyKeyboard(lang: string, appUrl: string): ReplyKeyboardMarkup {
  return {
    keyboard: [[
      {
        text: lang === "ru" ? "🚀 Открыть BECOME" : "🚀 Open BECOME",
        web_app: { url: appUrl },
      },
    ]],
    resize_keyboard: true,      // Shrink to fit button (not full keyboard height)
    is_persistent: true,        // Always show, even after user sends a message
    input_field_placeholder: lang === "ru"
      ? "Нажми «Открыть BECOME» ⬆️"
      : "Tap «Open BECOME» above ⬆️",
  };
}
```

### Sending After /start

```typescript
// After the welcome inline message, send a separate message
// that activates the persistent reply keyboard:
const replyKb = buildReplyKeyboard(lang, MINIAPP_URL);

await sendMessage(chatId,
  lang === "ru"
    ? "⌨️ Клавиатура быстрых действий активирована."
    : "⌨️ Quick actions keyboard activated.",
  { reply_markup: replyKb }
);
```

### What the User Sees

```
After /start:
1. Welcome message (with inline "Open" button)
2. "⌨️ Quick actions keyboard activated."
3. System keyboard is replaced by:

   ┌──────────────────────────────────────┐
   │  🚀 Открыть BECOME                  │  ← big blue button, always here
   └──────────────────────────────────────┘
   ┌──────────┐  ┌────────────────────────┐
   │ ≡ Menu   │  │  Нажми «Открыть» ⬆️   │
   └──────────┘  └────────────────────────┘
```

### Auth via Reply Keyboard (bot_auth Token)

Unlike inline `web_app` buttons (which get `initData` from Telegram SDK), the reply keyboard `web_app` button does **not always provide `initData`** reliably. To solve this, we embed a `bot_auth` token directly in the URL:

```typescript
// Generate a short-lived auth token for this user
const botAuthToken = await generateBotAuthToken(userId, telegramId);

// Build URL with token embedded
const appUrlWithAuth = `${MINIAPP_URL}?bot_auth=${botAuthToken}`;

// Pass this URL to the reply keyboard
const replyKb = buildReplyKeyboard(lang, appUrlWithAuth);
```

The Mini App extracts `bot_auth` from the URL on load:

```typescript
// In telegram.ts — capture bot_auth before SPA routing strips it
const url = new URL(window.location.href);
const botAuth = url.searchParams.get("bot_auth");
if (botAuth) {
  // Use for authentication on the /auth endpoint
  capturedBotAuth = botAuth;
}
```

---

## 4. Menu Button (Global, Next to Text Input)

A small button that appears **to the left of the message input field** for every user. Set once — works globally.

### When it's used

- Always visible, even before `/start`
- Acts as a secondary "Open" button
- Set during server boot or via a `/setup` endpoint

### Code

```typescript
async function setChatMenuButton(webAppUrl: string): Promise<any> {
  return botApi("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "Open BECOME",
      web_app: { url: webAppUrl },
    },
  });
}

// Call on server startup:
const MINIAPP_URL = Deno.env.get("BECOME_MINIAPP_URL") || "";
if (MINIAPP_URL) {
  await setChatMenuButton(MINIAPP_URL);
  console.log(`Menu button set to: ${MINIAPP_URL}`);
}
```

### BotFather Prerequisite

The menu button API call works **only after** you've registered a Mini App via @BotFather:

1. `/newapp` in BotFather
2. Select your bot
3. Provide: title, description, photo (640x360), Web App URL, short name
4. After this, `setChatMenuButton` will work

---

## 5. Full /start Flow (How It All Connects)

Here's the complete sequence when a user taps `/start`:

```
User sends /start
    │
    ├─ Is this a NEW user?
    │   │
    │   ├─ YES → Create account from TG data
    │   │   │
    │   │   ├─ Send welcome message with inline button:
    │   │   │   "Welcome! Tap below to open the app"
    │   │   │   [🚀 Open BECOME]  ← web_app inline button
    │   │   │
    │   │   └─ Send reply keyboard message:
    │   │       "⌨️ Quick access keyboard activated."
    │   │       ┌──────────────────────────┐
    │   │       │ 🚀 Открыть BECOME       │  ← persistent reply keyboard
    │   │       └──────────────────────────┘
    │   │
    │   └─ NO → Returning user
    │       │
    │       ├─ Generate bot_auth token (24h TTL)
    │       │   → embed in reply keyboard URL
    │       │
    │       ├─ Send welcome-back message (no inline button):
    │       │   "Welcome back! Tap «Open BECOME» on the keyboard below ↓
    │       │    or the Menu button (≡) next to the text field."
    │       │   [🔄 Sync Data]  ← callback button only
    │       │
    │       └─ Send reply keyboard with bot_auth:
    │           "⌨️ Quick actions keyboard activated."
    │           ┌──────────────────────────────────────┐
    │           │ 🚀 Открыть BECOME                    │  ← has ?bot_auth=xxx
    │           └──────────────────────────────────────┘
    │
    └─ Menu button (≡) was already set on server boot
        → always available as a third entry point
```

### Why Returning Users Don't Get an Inline "Open" Button

For returning users, we set `skipOpenButton: true` because:

1. The **reply keyboard** already has "Open BECOME" — it's persistent and always visible.
2. The **menu button** (≡) is always available too.
3. Having an inline button **plus** a reply keyboard button is redundant and clutters the chat.
4. The inline message instead **instructs the user** where to find the buttons.

New users get the inline button because the reply keyboard hasn't been sent yet at that point.

---

## 6. Notification Buttons

When the bot sends automated notifications (reminders, streak alerts, etc.), each message has an inline button to open the relevant screen:

```typescript
/**
 * Helper: build an inline keyboard button that opens the Mini App.
 * Uses web_app type for direct opening.
 */
function appButton(label: string, startapp?: string): InlineKeyboardButton[] {
  const url = MINIAPP_URL;
  if (!url) return [];
  const finalUrl = startapp
    ? `${url}?startapp=${encodeURIComponent(startapp)}`
    : url;
  return [{ text: label, web_app: { url: finalUrl } }];
}

// Daily reminder notification
const btn = appButton(
  lang === "ru" ? "🚀 Открыть" : "🚀 Open"
);

await sendMessage(telegramId, reminderText, {
  reply_markup: { inline_keyboard: [btn] },
});

// Strategic goal reminder — deep links to the goal screen
const goalBtn = appButton(
  lang === "ru" ? "🎯 Открыть цель" : "🎯 Open Goal",
  `strategic_goal_${goalId}`
);

await sendMessage(telegramId, goalText, {
  reply_markup: { inline_keyboard: [goalBtn] },
});
```

### Notification Button Types by Context

| Notification | Button label | `startapp` param | Opens screen |
|---|---|---|---|
| Daily task reminder | "🚀 Open" | _(none)_ | Dashboard |
| Challenge invite | "🚀 Open Challenge" | `challenge_{id}` | Challenge detail |
| Strategic goal reminder | "🎯 Open Goal" | `strategic_goal_{id}` | Goal detail |
| AI Coach prompt | "🤖 Open Coach" | `coach` | Coach chat |
| Streak alert | "🚀 Open" | _(none)_ | Dashboard |

---

## 7. TypeScript Types (Complete)

```typescript
// ---- Inline Keyboard (attached to messages) ----

interface InlineKeyboardButton {
  text: string;                         // Button label
  web_app?: { url: string };            // Opens Mini App in WebView
  url?: string;                         // Opens URL in browser
  callback_data?: string;               // Sends callback_query to webhook
  switch_inline_query?: string;         // Switches to inline mode
}

interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][]; // 2D array: rows of buttons
}

// ---- Reply Keyboard (replaces system keyboard) ----

interface ReplyKeyboardButton {
  text: string;                         // Button label
  web_app?: { url: string };            // Opens Mini App in WebView
  request_contact?: boolean;            // Requests user's phone number
  request_location?: boolean;           // Requests user's location
}

interface ReplyKeyboardMarkup {
  keyboard: ReplyKeyboardButton[][];    // 2D array: rows of buttons
  resize_keyboard?: boolean;            // Shrink to fit buttons
  one_time_keyboard?: boolean;          // Hide after single tap
  is_persistent?: boolean;              // Always visible
  input_field_placeholder?: string;     // Placeholder in text input
}

// ---- Remove Reply Keyboard ----

interface ReplyKeyboardRemove {
  remove_keyboard: true;
}

// ---- Menu Button ----

interface MenuButtonWebApp {
  type: "web_app";
  text: string;
  web_app: { url: string };
}

interface MenuButtonDefault {
  type: "default";
}

type MenuButton = MenuButtonWebApp | MenuButtonDefault;
```

---

## 8. Comparison Table

| Feature | Inline `web_app` | Inline `callback_data` | Reply Keyboard `web_app` | Menu Button |
|---|---|---|---|---|
| **Where** | Under a specific message | Under a specific message | Bottom of chat, replaces keyboard | Left of text input |
| **Visibility** | Only on that message | Only on that message | Always (persistent) | Always |
| **Opens Mini App?** | Yes | No (triggers webhook) | Yes | Yes |
| **Supports deep links?** | Yes (`?startapp=...`) | No (server-side) | Yes (`?startapp=...`) | No (base URL only) |
| **Auth context** | `initData` from TG SDK | `callback_query.from` | `bot_auth` token in URL | `initData` from TG SDK |
| **Visual size** | Medium button | Medium button | Large, full-width | Small icon/text |
| **Use case** | "Open this challenge" | "Sync data", "Toggle setting" | Main "Open app" button | Secondary entry point |

---

## 9. Common Pitfalls

| Pitfall | What happens | Fix |
|---|---|---|
| Using `url:` instead of `web_app:` for inline buttons | Opens in external browser, not as Mini App | Use `web_app: { url: "..." }` |
| Using `t.me` link in `web_app.url` | "Web app not found" error | Use your actual deployed URL (e.g., `https://myapp.vercel.app`) |
| Not answering `callback_query` | Loading spinner stays forever on the button | Always call `answerCallbackQuery` in your webhook handler |
| Reply keyboard without `is_persistent` | Keyboard disappears after user sends a message | Add `is_persistent: true` |
| Reply keyboard without `resize_keyboard` | Keyboard takes full screen height (4 empty rows) | Add `resize_keyboard: true` |
| No `bot_auth` in reply keyboard URL | User can't authenticate when opening via reply keyboard | Generate and embed `bot_auth` token in the URL |
| `bot_auth` token expires too fast | User taps the reply keyboard button but token is expired | Use a generous TTL (24h) — the button persists in chat |
| Sending both inline + reply keyboard in one message | Only one `reply_markup` is allowed per `sendMessage` | Send them as **two separate messages** |
| Not setting up Mini App in BotFather first | `setChatMenuButton` fails silently | Run `/newapp` in @BotFather before calling the API |

---

## 10. Complete Minimal Example

A single-file server that sets up all 4 entry points:

```typescript
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";

const app = new Hono();
app.use("*", cors());

const BOT_API = "https://api.telegram.org/bot";
const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const MINIAPP_URL = Deno.env.get("BECOME_MINIAPP_URL") || "";

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

// ── 1. Setup: Menu Button + Webhook ──

app.post("/setup", async (c) => {
  // Set webhook
  await botApi("setWebhook", {
    url: `${new URL(c.req.url).origin}/webhook`,
    allowed_updates: ["message", "callback_query"],
  });

  // Set menu button (#4)
  if (MINIAPP_URL) {
    await botApi("setChatMenuButton", {
      menu_button: {
        type: "web_app",
        text: "Open MyApp",
        web_app: { url: MINIAPP_URL },
      },
    });
  }

  return c.json({ ok: true });
});

// ── 2. Webhook: Handle /start + Callbacks ──

app.post("/webhook", async (c) => {
  const update = await c.req.json();

  // ── Handle callback_query (#2) ──
  if (update.callback_query) {
    const cb = update.callback_query;
    await botApi("answerCallbackQuery", { callback_query_id: cb.id });

    if (cb.data === "cmd_sync") {
      await botApi("sendMessage", {
        chat_id: cb.message.chat.id,
        text: "✅ Data synced!",
      });
    }
    return c.json({ ok: true });
  }

  // ── Handle messages ──
  const msg = update.message;
  if (!msg?.text) return c.json({ ok: true });
  const chatId = msg.chat.id;

  if (msg.text.startsWith("/start")) {
    // ── Message 1: Welcome with inline button (#1) ──
    const inlineKeyboard = [];
    if (MINIAPP_URL) {
      inlineKeyboard.push([
        { text: "🚀 Open MyApp", web_app: { url: MINIAPP_URL } },
      ]);
    }
    inlineKeyboard.push([
      { text: "🔄 Sync Data", callback_data: "cmd_sync" },
    ]);

    await botApi("sendMessage", {
      chat_id: chatId,
      text: "<b>Welcome!</b>\n\nTap the button to open the app.",
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: inlineKeyboard },
    });

    // ── Message 2: Persistent reply keyboard (#3) ──
    if (MINIAPP_URL) {
      await botApi("sendMessage", {
        chat_id: chatId,
        text: "⌨️ Quick access keyboard activated.",
        reply_markup: {
          keyboard: [[
            { text: "🚀 Open MyApp", web_app: { url: MINIAPP_URL } },
          ]],
          resize_keyboard: true,
          is_persistent: true,
          input_field_placeholder: "Tap «Open MyApp» above ⬆️",
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

After this, the user has **3 persistent ways** to open the app at any time:
1. Scroll up to the welcome message → tap inline button
2. Tap the reply keyboard button (always visible at bottom)
3. Tap the Menu button (≡) next to the text input
