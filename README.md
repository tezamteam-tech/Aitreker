# BECOME — Telegram Mini App

## Architecture Overview

## Telegram Mini Apps Analytics (tganalytics)

To enable analytics for your Mini App, copy `.env.example` to `.env` and set:

- `VITE_TG_ANALYTICS_TOKEN` — token generated in the analytics bot/admin panel
- `VITE_TG_ANALYTICS_APP_NAME` — app identifier (e.g. `proper_food_ai`)

The SDK is initialized very early in `src/app/init.ts` and will be a no-op if env vars are missing.

## OpenAI model override (Supabase Edge Functions)

Backend calls to OpenAI happen inside Supabase Edge Functions. You can override which model is used via Supabase secrets:

- `OPENAI_API_KEY` — required
- `OPENAI_FOOD_SCAN_MODEL` — model for photo food scan (`POST /food/scan`), default `gpt-5`, fallbacks: `gpt-4o` → `gpt-4o-mini`
- `OPENAI_FOOD_ESTIMATE_MODEL` — model for text food estimate (`POST /food/estimate`), default `gpt-5-mini`, fallback: `gpt-4o-mini`

### TMA.js SDK Initialization

The app uses `@tma.js/sdk` (v3.1.7) and `@tma.js/sdk-react` (v3.0.16) for Telegram Mini App integration.

**Critical: SDK initialization happens FIRST** in `/src/app/init.ts`, before React loads:

```
App.tsx → imports init.ts → calls init() → initializes SDK → loads React
```

**Key files:**
- `/src/app/init.ts` — Bootstrap logic (SDK + Eruda initialization)
- `/src/app/App.tsx` — Entry point (imports init first, then React)
- `/src/app/components/telegram.tsx` — Early bot_auth capture via Performance API
- `/src/telegram-types.d.ts` — TypeScript definitions for window.Telegram.WebApp

**SDK Usage:**
- In components: use hooks from `@tma.js/sdk-react` (`useBackButton`, `useWebApp`, `useHapticFeedback`)
- Global access: NOT available (unlike old `@telegram-apps` SDK)
- Auto-mounting: SDK handles this automatically, no manual `mount()` needed

## Supabase Edge Function Secrets

The following secrets must be set in **Supabase Dashboard > Edge Functions > Secrets**:

```
TELEGRAM_BOT_TOKEN_BECOME=<your bot token from @BotFather>
```

After adding or changing secrets, **redeploy the Edge Function** for changes to take effect.

## Auth Flow

**Important:** When the app is hosted on Figma Sites, `initData` is always empty (`initData.len=0`) even inside Telegram. The `bot_auth` token is the primary auth mechanism.

### How it works:

1. User sends `/start` to `@BECOMEAI_BOT`
2. Bot generates a one-time `bot_auth` token (10 min TTL) and embeds it in the reply keyboard's "Open BECOME" button URL
3. User taps "Open BECOME" → app opens with `?bot_auth=TOKEN` in the URL
4. Frontend: `POST /auth/telegram` with the bot_auth token → gets `{ token, user, deviceToken }`
5. Session token + device token are saved to localStorage
6. On subsequent opens: device token refreshes the session automatically (90-day TTL)

### Auth fallback chain:

```
1. bot_auth from URL  →  POST /auth/bot-token
2. initData (if available)  →  POST /auth/telegram
3. device_token from localStorage  →  POST /auth/refresh
4. FAIL  →  show "Go to @BECOMEAI_BOT" overlay
```

### If auth fails inside Telegram:

The overlay shows "Authentication Required" with a button that opens the bot chat via `openTelegramLink('https://t.me/BECOMEAI_BOT?start=auth')`. User sends `/start`, bot refreshes the reply keyboard with a new `bot_auth` token, user taps "Open BECOME" again.