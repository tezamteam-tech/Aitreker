// =============================================
// Proper Food AI — Supabase Edge Function Server
// Hono web server with all API routes
// =============================================

import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { validateInitData } from "./telegram-auth.tsx";
import { ensureSeedData, localizeProgram, localizeDay } from "./seed.tsx";
import {
  sendMessage,
  editMessageText,
  answerCallbackQuery,
  sendChatAction,
  setWebhook,
  deleteWebhook,
  getWebhookInfo,
  setMyCommands,
  setChatMenuButton,
  fetchUserAvatarUrl,
  buildWelcomeMessage,
  buildNewUserWelcomeMessage,
  buildReturningStartMessage,
  buildContactSuccessMessage,
  buildReplyKeyboard,
  buildHelpMessage,
  buildSettingsMessage,
  sendPhoto,
  sendVideo,
  sendMediaGroup,
  createInvoiceLink,
  answerPreCheckoutQuery,
  sendInvoice,
  type TgUpdate,
  type TgMessage,
  type TgCallbackQuery,
  type TgPreCheckoutQuery,
  type InlineKeyboardButton,
} from "./telegram-bot.tsx";
import { detectLang, type Lang } from "./i18n.tsx";
import {
  notifyDayComplete,
  notifyStreakMilestone,
  notifyProgramCompleted,
  notifyChallengeNewMember,
  notifyChallengeJoined,
  notifyChallengeMemberDayComplete,
  notifyTaskReminder,
  notifyDailyReminder,
  notifyDailyDigest,
  notifyWelcome,
  notifyChallengeExpiring,
  getNotificationPrefs,
  setNotificationPrefs,
  computeStreak,
  type NotificationPrefs,
} from "./notifications.tsx";

const PREFIX = "/make-server-fc549837";
const app = new Hono();

// Admin configuration — @dozorir (5772448919) + original admin (7879078497)
const ADMIN_TG_IDS = ["5772448919", "7879078497"];
function isAdminUser(telegramId: string): boolean {
  return ADMIN_TG_IDS.includes(telegramId);
}

// Enable logger
app.use("*", logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "X-Proper-Token", "X-Become-Token"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  })
);

// ---- Env var helpers (PROPER > BECOME fallback for backward compat) ----

function getProperBotToken(): string {
  return Deno.env.get("TELEGRAM_BOT_TOKEN_PROPER") || Deno.env.get("TELEGRAM_BOT_TOKEN_BECOME") || "";
}

function getProperMiniAppUrl(): string {
  return Deno.env.get("PROPERFOOD_MINIAPP_URL") || Deno.env.get("BECOME_MINIAPP_URL") || "";
}

// ---- Helpers ----

function generateId(prefix: string): string {
  const rand = crypto.getRandomValues(new Uint8Array(12));
  const hex = Array.from(rand)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${prefix}_${hex}`;
}

function generateToken(): string {
  const rand = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(rand)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Resolve content language from request:
 * 1. ?lang=ru query param (highest priority)
 * 2. Authenticated user's saved language
 * 3. Fallback to "en"
 */
async function resolveContentLang(c: any): Promise<string> {
  const qLang = c.req.query("lang");
  if (qLang && (qLang === "ru" || qLang === "en")) return qLang;
  try {
    const auth = await resolveUser(c);
    if (auth) {
      const user = await kv.get(`become:user:${auth.userId}`);
      if (user?.language) return user.language;
    }
  } catch (_) { /* fallback */ }
  return "en";
}

// XP constants
const XP_DONE = 10;
const XP_SKIP = 2;

// ---- Referral bonus on subscription ----
const REFERRAL_BONUS_DAYS = 7;

/**
 * When a user subscribes, check if they were referred by someone.
 * If so, grant the referrer +7 premium days and send a notification.
 * Fire-and-forget — never blocks the payment flow.
 */
async function grantReferralBonusOnSubscription(subscriberUserId: string): Promise<void> {
  try {
    const refLog = await kv.get(`become:referral:log:${subscriberUserId}`);
    if (!refLog || !refLog.referrerId) {
      console.log(`[Referral Bonus] User ${subscriberUserId} has no referrer — skipping`);
      return;
    }

    const referrerUserId = refLog.referrerId;
    const invitedKey = `become:referral:invited:${referrerUserId}`;
    const invited: any[] = (await kv.get(invitedKey)) || [];
    const invEntry = invited.find((inv: any) => inv.userId === subscriberUserId);

    if (invEntry && invEntry.bonusDaysGranted > 0) {
      console.log(`[Referral Bonus] Already granted for subscriber=${subscriberUserId}, referrer=${referrerUserId}`);
      return;
    }

    const referrer = await kv.get(`become:user:${referrerUserId}`);
    if (!referrer) {
      console.log(`[Referral Bonus] Referrer ${referrerUserId} not found — skipping`);
      return;
    }

    const currentExpiry = referrer.subscriptionExpiresAt
      ? new Date(referrer.subscriptionExpiresAt).getTime()
      : Date.now();
    const base = Math.max(currentExpiry, Date.now());
    referrer.subscriptionExpiresAt = new Date(base + REFERRAL_BONUS_DAYS * 24 * 60 * 60 * 1000).toISOString();
    referrer.updatedAt = new Date().toISOString();
    await kv.set(`become:user:${referrerUserId}`, referrer);

    if (invEntry) {
      invEntry.isSubscribed = true;
      invEntry.bonusDaysGranted = REFERRAL_BONUS_DAYS;
      await kv.set(invitedKey, invited);
    } else {
      const subscriber = await kv.get(`become:user:${subscriberUserId}`);
      invited.push({
        userId: subscriberUserId,
        firstName: subscriber?.firstName || "User",
        username: subscriber?.username || null,
        joinedAt: refLog.registeredAt || new Date().toISOString(),
        isSubscribed: true,
        bonusDaysGranted: REFERRAL_BONUS_DAYS,
      });
      await kv.set(invitedKey, invited);
    }

    // Send Telegram notification to referrer
    try {
      const referrerLang = referrer.language === "ru" ? "ru" : "en";
      const subscriber = await kv.get(`become:user:${subscriberUserId}`);
      const subName = subscriber?.firstName || "A friend";

      const notifText = referrerLang === "ru"
        ? `🎉 <b>Реферальный бонус!</b>\n\nВаш друг <b>${subName}</b> оформил Premium подписку.\nВы получили <b>+${REFERRAL_BONUS_DAYS} дней</b> премиум подписки!\n\n📊 Всего приглашено: <b>${referrer.referralCount || 0}</b> друзей`
        : `🎉 <b>Referral Bonus!</b>\n\nYour friend <b>${subName}</b> subscribed to Premium.\nYou earned <b>+${REFERRAL_BONUS_DAYS} days</b> of premium subscription!\n\n📊 Total invited: <b>${referrer.referralCount || 0}</b> friends`;

      const tgId = referrer.telegramId;
      if (tgId) {
        const deepLink = buildTgDeepLink("referrals");
        const keyboard: InlineKeyboardButton[][] = [
          [{ text: referrerLang === "ru" ? "👥 Мои рефералы" : "👥 My Referrals", url: deepLink }],
        ];
        await sendMessage(Number(tgId), notifText, { reply_markup: { inline_keyboard: keyboard } });
        console.log(`[Referral Bonus] Notification sent to referrer tg:${tgId}`);
      }
    } catch (notifErr) {
      console.log(`[Referral Bonus] Notification send failed (non-critical):`, notifErr);
    }

    console.log(`[Referral Bonus] Granted +${REFERRAL_BONUS_DAYS} days to referrer=${referrerUserId} for subscriber=${subscriberUserId}`);
  } catch (err) {
    console.log(`[Referral Bonus] Error (non-critical):`, err);
  }
}

/**
 * Notify referrer when a new friend joins (not yet subscribed).
 * Fire-and-forget.
 */
async function notifyReferrerNewJoin(referrerUserId: string, newUserName: string): Promise<void> {
  try {
    const referrer = await kv.get(`become:user:${referrerUserId}`);
    if (!referrer || !referrer.telegramId) return;

    const lang = referrer.language === "ru" ? "ru" : "en";
    const text = lang === "ru"
      ? `👋 <b>Новый реферал!</b>\n\n<b>${newUserName}</b> присоединился по вашей ссылке.\nКогда друг оформит подписку, ��ы получите <b>+${REFERRAL_BONUS_DAYS} дней</b> Premium!\n\n📊 Всего приглашено: <b>${referrer.referralCount || 0}</b>`
      : `👋 <b>New Referral!</b>\n\n<b>${newUserName}</b> joined through your link.\nWhen they subscribe, you'll earn <b>+${REFERRAL_BONUS_DAYS} days</b> Premium!\n\n📊 Total invited: <b>${referrer.referralCount || 0}</b>`;

    const deepLink = buildTgDeepLink("referrals");
    const keyboard: InlineKeyboardButton[][] = [
      [{ text: lang === "ru" ? "👥 Мои рефералы" : "👥 My Referrals", url: deepLink }],
    ];
    await sendMessage(Number(referrer.telegramId), text, { reply_markup: { inline_keyboard: keyboard } });
    console.log(`[Referral] Join notification sent to referrer ${referrerUserId}`);
  } catch (err) {
    console.log(`[Referral] Join notification error (non-critical):`, err);
  }
}

// ---- Bot auth token (for Mini App auth without initData) ----
const BOT_AUTH_TTL = 24 * 60 * 60 * 1000; // 24 hours — reply keyboard stays visible long, needs generous TTL
const DEVICE_TOKEN_TTL = 90 * 24 * 60 * 60 * 1000; // 90 days
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const SESSION_REFRESH_THRESHOLD = 3 * 24 * 60 * 60 * 1000; // refresh when < 3 days left
const PHONE_CODE_TTL = 5 * 60 * 1000; // 5 minutes
const PHONE_SESSION_TTL = 180 * 24 * 60 * 60 * 1000; // 180 days — long-lived for phone auth

// ---- Phone normalization ----
function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

// ---- Phone-to-userId index helper ----
async function setPhoneIndex(phone: string, userId: string): Promise<void> {
  const normalized = normalizePhone(phone);
  if (normalized.length >= 7) {
    await kv.set(`become:user:phone:${normalized}`, userId);
    console.log(`[Auth] Phone index set: ${normalized} -> ${userId}`);
  }
}

async function findUserByPhone(phone: string): Promise<{ userId: string; user: any } | null> {
  const normalized = normalizePhone(phone);
  if (normalized.length < 7) return null;

  // 1. Try index first (fast path)
  const indexed = await kv.get(`become:user:phone:${normalized}`);
  if (indexed) {
    const user = await kv.get(`become:user:${indexed}`);
    if (user) return { userId: indexed, user };
  }

  // 2. Fallback: iterate all users (migration for users without phone index)
  try {
    const mappings = await kv.getByPrefix("become:user:tg:");
    for (const item of mappings) {
      const uid = typeof item === 'string' ? item : (item && typeof item === 'object' && 'value' in item ? (item as any).value : item);
      if (!uid || typeof uid !== 'string') continue;
      const u = await kv.get(`become:user:${uid}`);
      if (u && u.phoneNumber) {
        const uPhone = normalizePhone(u.phoneNumber);
        if (uPhone === normalized) {
          // Create index for future lookups
          await setPhoneIndex(u.phoneNumber, uid);
          return { userId: uid, user: u };
        }
      }
    }
  } catch (e) {
    console.log(`[Auth] findUserByPhone fallback error:`, e);
  }

  return null;
}

async function generateBotAuthToken(userId: string, telegramId: string): Promise<string> {
  const token = generateToken();
  await kv.set(`become:bot_auth:${token}`, {
    userId,
    telegramId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + BOT_AUTH_TTL).toISOString(),
  });
  console.log(`[Auth] Generated bot_auth token for user ${userId}`);
  return token;
}

function buildAppUrlWithAuth(botAuthToken: string, deepLinkParam?: string): string {
  const miniAppUrl = getProperMiniAppUrl();
  if (!miniAppUrl) return "";
  const url = new URL(miniAppUrl);
  url.searchParams.set("bot_auth", botAuthToken);
  if (deepLinkParam) {
    url.searchParams.set("startapp", deepLinkParam);
  }
  return url.toString();
}

/**
 * Build a t.me deep link that opens the Mini App natively via Telegram.
 * This bypasses any SSL issues on the direct web URL and always opens
 * as a proper Mini App within Telegram, not a browser tab.
 *
 * Format: https://t.me/ProperFoodAI_bot/app?startapp=PARAM
 *
 * Use this for `url:` type inline buttons instead of direct Vercel URLs.
 * Telegram treats t.me links as trusted and opens them natively.
 */
function buildTgDeepLink(startapp?: string): string {
  const botUsername = Deno.env.get("TELEGRAM_BOT_USERNAME") || "ProperFoodAI_bot";
  const appShortName = Deno.env.get("TELEGRAM_MINIAPP_SHORT_NAME") || "app";
  const base = `https://t.me/${botUsername}/${appShortName}`;
  if (startapp) {
    return `${base}?startapp=${encodeURIComponent(startapp)}`;
  }
  return base;
}

/**
 * Send a targeted message when the user arrives via a deep link
 * (e.g., /start challenge_ch_xxx).
 *
 * Shows a specific inline button that opens the Mini App at the right screen
 * using web_app: { url } with ?startapp= parameter.
 */
async function sendDeepLinkMessage(
  chatId: number,
  lang: string,
  deepLinkParam: string,
  baseAppUrl?: string
): Promise<void> {
  try {
    const miniAppUrl = baseAppUrl || getProperMiniAppUrl();
    if (!miniAppUrl) return;

    // Build web_app URL with startapp parameter for deep routing
    const appUrlWithParam = miniAppUrl.includes("?")
      ? `${miniAppUrl}&startapp=${encodeURIComponent(deepLinkParam)}`
      : `${miniAppUrl}?startapp=${encodeURIComponent(deepLinkParam)}`;

    if (deepLinkParam.startsWith("challenge_")) {
      // Challenge deep link: fetch challenge title if possible
      const challengeId = deepLinkParam.replace("challenge_", "");
      let challengeTitle = "";
      try {
        const ch = await kv.get(`become:challenge:${challengeId}`);
        if (ch?.title) challengeTitle = ch.title;
      } catch {}

      const text = lang === "ru"
        ? `🏆 <b>${challengeTitle ? `Челлендж: ${challengeTitle}` : "Тебя пригласили в челлендж!"}</b>\n\nНажми кнопку ниже, чтобы открыть его в приложении:`
        : `🏆 <b>${challengeTitle ? `Challenge: ${challengeTitle}` : "You've been invited to a challenge!"}</b>\n\nTap the button below to open it in the app:`;

      const keyboard: InlineKeyboardButton[][] = [[
        {
          text: lang === "ru" ? "🚀 Открыть челлендж" : "🚀 Open Challenge",
          web_app: { url: appUrlWithParam },
        },
      ]];

      await sendMessage(chatId, text, {
        reply_markup: { inline_keyboard: keyboard },
      });
      console.log(`[TG Bot] Sent deep link message for challenge: ${challengeId}`);

    } else if (deepLinkParam === "strategic_goals" || deepLinkParam === "goals") {
      const text = lang === "ru"
        ? "🎯 <b>Стратегические цели</b>\n\nОткрой приложение, чтобы посмотреть свои цели:"
        : "🎯 <b>Strategic Goals</b>\n\nOpen the app to view your goals:";

      const keyboard: InlineKeyboardButton[][] = [[
        {
          text: lang === "ru" ? "🎯 Открыть цели" : "🎯 Open Goals",
          web_app: { url: appUrlWithParam },
        },
      ]];

      await sendMessage(chatId, text, {
        reply_markup: { inline_keyboard: keyboard },
      });
      console.log(`[TG Bot] Sent deep link message for strategic goals`);

    } else if (deepLinkParam === "coach") {
      const text = lang === "ru"
        ? "🤖 <b>AI-коуч</b>\n\nОткрой приложение для разговора с коучем:"
        : "🤖 <b>AI Coach</b>\n\nOpen the app to chat with your coach:";

      const keyboard: InlineKeyboardButton[][] = [[
        {
          text: lang === "ru" ? "🤖 Открыть коуча" : "🤖 Open Coach",
          web_app: { url: appUrlWithParam },
        },
      ]];

      await sendMessage(chatId, text, {
        reply_markup: { inline_keyboard: keyboard },
      });
    }
    // Other deep links (journal, focus, etc.) — silently ignore, the main welcome is enough
  } catch (err) {
    console.log(`[TG Bot] Deep link message error (non-critical):`, err);
  }
}

// ---- Auth middleware ----

async function resolveUser(c: any): Promise<{ userId: string; telegramId: string } | null> {
  const token = c.req.header("X-Proper-Token") || c.req.header("X-Become-Token");
  if (!token) {
    return null;
  }

  try {
    const session = await kv.get(`become:session:${token}`);
    if (!session) return null;

    if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
      await kv.del(`become:session:${token}`);
      return null;
    }

    // Sliding window: auto-extend session if < 3 days remaining
    if (session.expiresAt) {
      const remaining = new Date(session.expiresAt).getTime() - Date.now();
      if (remaining < SESSION_REFRESH_THRESHOLD) {
        session.expiresAt = new Date(Date.now() + SESSION_TTL).toISOString();
        kv.set(`become:session:${token}`, session).catch(() => {});
      }
    }

    return { userId: session.userId, telegramId: session.telegramId };
  } catch (err) {
    console.log("Error resolving user from token:", err);
    return null;
  }
}

/**
 * Generate a long-lived device token for session refresh without re-auth.
 * Stored as `become:device:{token}` with 90 day TTL.
 */
async function generateDeviceToken(userId: string, telegramId: string): Promise<string> {
  const token = generateToken();
  await kv.set(`become:device:${token}`, {
    userId,
    telegramId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + DEVICE_TOKEN_TTL).toISOString(),
  });
  console.log(`[Auth] Generated device token for user ${userId}`);
  return token;
}

// ---- Seed data on startup ----
let seedPromise: Promise<void> | null = null;
function triggerSeed() {
  if (!seedPromise) {
    seedPromise = ensureSeedData();
  }
  return seedPromise;
}

// ---- Auto-setup Telegram webhook on startup ----
let webhookSetupPromise: Promise<void> | null = null;
let lastWebhookCheck = 0;
const WEBHOOK_CHECK_INTERVAL = 5 * 60 * 1000; // re-verify every 5 min

async function ensureWebhookSetup(force = false): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const botToken = getProperBotToken();
    const miniAppUrl = getProperMiniAppUrl();

    if (!botToken) {
      console.log("[TG Bot Auto-Setup] TELEGRAM_BOT_TOKEN_PROPER not set — skipping webhook setup");
      return;
    }
    if (!supabaseUrl) {
      console.log("[TG Bot Auto-Setup] SUPABASE_URL not set — skipping webhook setup");
      return;
    }

    const webhookUrl = `${supabaseUrl}/functions/v1${PREFIX}/telegram/webhook`;

    // Check current webhook — update if URL differs, or if allowed_updates is missing pre_checkout_query
    const currentInfo = await getWebhookInfo();
    const allowedUpdates: string[] = currentInfo?.allowed_updates || [];
    const hasPreCheckout = allowedUpdates.includes("pre_checkout_query");
    if (!force && currentInfo?.url === webhookUrl && hasPreCheckout) {
      console.log(`[TG Bot Auto-Setup] Webhook already set to ${webhookUrl} with pre_checkout_query — skipping`);
      lastWebhookCheck = Date.now();
      return;
    }
    if (!hasPreCheckout) {
      console.log(`[TG Bot Auto-Setup] FORCE re-set: pre_checkout_query missing from allowed_updates: [${allowedUpdates.join(",")}]`);
    }

    console.log(`[TG Bot Auto-Setup] ${force ? "FORCE " : ""}Setting webhook to: ${webhookUrl}`);
    console.log(`[TG Bot Auto-Setup] Previous URL: ${currentInfo?.url || "(empty/deleted)"}`);
    await setWebhook(webhookUrl);

    // Set bot commands
    try {
      await setMyCommands();
      console.log("[TG Bot Auto-Setup] Bot commands registered");
    } catch (cmdErr) {
      console.log("[TG Bot Auto-Setup] Failed to set commands:", cmdErr);
    }

    // Set menu button (Mini App)
    if (miniAppUrl) {
      try {
        await setChatMenuButton(miniAppUrl);
        console.log(`[TG Bot Auto-Setup] Menu button set to: ${miniAppUrl}`);
      } catch (menuErr) {
        console.log("[TG Bot Auto-Setup] Failed to set menu button:", menuErr);
      }
    } else {
      console.log("[TG Bot Auto-Setup] PROPERFOOD_MINIAPP_URL not set — menu button skipped");
    }

    lastWebhookCheck = Date.now();
    console.log("[TG Bot Auto-Setup] Webhook setup complete!");
  } catch (err) {
    console.log("[TG Bot Auto-Setup] Error during auto-setup:", err);
  }
}

function triggerWebhookSetup(force = false) {
  if (force || Date.now() - lastWebhookCheck > WEBHOOK_CHECK_INTERVAL) {
    webhookSetupPromise = ensureWebhookSetup(force);
  } else if (!webhookSetupPromise) {
    webhookSetupPromise = ensureWebhookSetup(false);
  }
  return webhookSetupPromise;
}

// =============================================
// ROUTES
// =============================================

// Health check — also force-verifies webhook + env diagnostics
app.get(`${PREFIX}/health`, async (c) => {
  await triggerSeed();
  await triggerWebhookSetup(true); // force re-check (heals deleted webhooks)

  const botToken = getProperBotToken();
  const miniAppUrl = getProperMiniAppUrl();

  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "2.0.0-proper",
    env: {
      TELEGRAM_BOT_TOKEN_PROPER: botToken ? `set (${botToken.length} chars, starts: ${botToken.substring(0, 8)}...)` : "NOT SET ⚠️",
      PROPERFOOD_MINIAPP_URL: miniAppUrl || "NOT SET ⚠️",
      SUPABASE_URL: Deno.env.get("SUPABASE_URL") ? "set" : "NOT SET ⚠️",
    },
  });
});

// ---- POST /auth/dev-preview — REMOVED ----
// Dev-preview auth was removed. This is a production Telegram Mini App.
// Authentication MUST go through /auth/telegram with valid initData.

// ---- Referral helpers (used by /auth/telegram for inline referral processing) ----

/**
 * Process referral for an EXISTING user who hasn't been referred yet.
 * Called when an existing user re-authenticates with a ref_ startParam.
 */
async function processReferralInline(userId: string, user: any, refCode: string): Promise<void> {
  const referrerUserId = await kv.get(`become:referral:${refCode}`);
  if (!referrerUserId || referrerUserId === userId) return;

  user.referredBy = referrerUserId;
  user.updatedAt = new Date().toISOString();
  await kv.set(`become:user:${userId}`, user);

  await processReferralBonus(referrerUserId as string, userId, user.firstName || "A friend");
  console.log(`[Auth] Inline referral: existing user ${userId} referred by ${referrerUserId}`);
}

/**
 * Grant referral bonus to the referrer: increment count, check milestones,
 * log the referral, add to invited list, and notify.
 */
async function processReferralBonus(referrerUserId: string, newUserId: string, newUserName: string): Promise<void> {
  const referrer = await kv.get(`become:user:${referrerUserId}`);
  if (!referrer) return;

  referrer.referralCount = (referrer.referralCount || 0) + 1;
  referrer.updatedAt = new Date().toISOString();

  // +7 premium days per referral
  const REFERRAL_BONUS_DAYS = 7;
  const currentExpiry = referrer.subscriptionExpiresAt ? new Date(referrer.subscriptionExpiresAt).getTime() : Date.now();
  const base = Math.max(currentExpiry, Date.now());
  referrer.subscriptionExpiresAt = new Date(base + REFERRAL_BONUS_DAYS * 24 * 60 * 60 * 1000).toISOString();
  console.log(`[Auth] Referral bonus: +${REFERRAL_BONUS_DAYS} days for referrer ${referrerUserId}, total referrals=${referrer.referralCount}`);

  // Check milestone bonuses (every 10 referrals → +30 extra days)
  const prevRewards = await kv.get(`become:bonus:ref_rewards:${referrerUserId}`) || 0;
  const newMilestones = Math.floor(referrer.referralCount / 10);
  if (newMilestones > (prevRewards as number)) {
    const milestoneDays = (newMilestones - (prevRewards as number)) * 30;
    const milestoneBase = new Date(referrer.subscriptionExpiresAt).getTime();
    referrer.subscriptionExpiresAt = new Date(milestoneBase + milestoneDays * 24 * 60 * 60 * 1000).toISOString();
    await kv.set(`become:bonus:ref_rewards:${referrerUserId}`, newMilestones);
    console.log(`[Auth] Referral milestone! user=${referrerUserId}, count=${referrer.referralCount}, +${milestoneDays} milestone days`);
  }

  await kv.set(`become:user:${referrerUserId}`, referrer);

  // Log the referral
  await kv.set(`become:referral:log:${newUserId}`, { referrerId: referrerUserId, registeredAt: new Date().toISOString() });

  // Add to referrer's invited list
  const invitedKey = `become:referral:invited:${referrerUserId}`;
  const existingInvited: any[] = (await kv.get(invitedKey) as any[]) || [];
  existingInvited.push({
    userId: newUserId,
    firstName: newUserName,
    username: null,
    joinedAt: new Date().toISOString(),
    isSubscribed: false,
    bonusDaysGranted: REFERRAL_BONUS_DAYS,
  });
  await kv.set(invitedKey, existingInvited);

  // Notify referrer
  notifyReferrerNewJoin(referrerUserId, newUserName).catch(() => {});
}

// ---- POST /auth/telegram ----
app.post(`${PREFIX}/auth/telegram`, async (c) => {
  await triggerSeed();
  triggerWebhookSetup(); // fire-and-forget, don't await

  try {
    const body = await c.req.json();
    const { initData, startParam } = body;

    if (!initData) {
      return c.json(
        { message: "initData is required", code: "MISSING_INIT_DATA", status: 400 },
        400
      );
    }

    const result = await validateInitData(initData);

    if (!result.valid || !result.user) {
      return c.json(
        { message: "Invalid Telegram auth data", code: "INVALID_AUTH", status: 401 },
        401
      );
    }

    const tgUser = result.user;
    const tgId = String(tgUser.id);

    let userId = await kv.get(`become:user:tg:${tgId}`);
    let user: any = null;

    if (userId) {
      user = await kv.get(`become:user:${userId}`);
    }

    const now = new Date().toISOString();

    if (user) {
      user.firstName = tgUser.first_name;
      user.lastName = tgUser.last_name || null;
      user.username = tgUser.username || null;
      user.photoUrl = tgUser.photo_url || null;
      user.updatedAt = now;
      // Ensure xp field exists
      if (user.xp === undefined) user.xp = 0;
      // SECURITY: Never grant or extend subscription on re-authentication.
      // subscriptionExpiresAt is only set when a user is first created (trial)
      // or when they pay/earn bonus days. Re-auth must never touch this field.
      const subStatus = user.subscriptionExpiresAt
        ? (new Date(user.subscriptionExpiresAt).getTime() > Date.now() ? "active" : "expired")
        : "none";
      console.log(`[Auth] Re-auth user ${userId}: subscription=${subStatus}, expiresAt=${user.subscriptionExpiresAt || "null"}`);
      if (!user.referralCode) {
        user.referralCode = generateId("ref").replace("ref_", "").slice(0, 10);
        await kv.set(`become:referral:${user.referralCode}`, userId);
      }
      if (user.referralCount === undefined) user.referralCount = 0;
      await kv.set(`become:user:${userId}`, user);

      // Process referral for existing user who hasn't been referred yet
      if (startParam && typeof startParam === 'string' && startParam.startsWith('ref_') && !user.referredBy) {
        const refCode = startParam.replace('ref_', '');
        if (refCode) {
          processReferralInline(userId, user, refCode).catch((err: any) => {
            console.log(`[Auth] Inline referral for existing user failed (non-critical): ${err}`);
          });
        }
      }
    } else {
      userId = generateId("user");
      const referralCode = generateId("ref").replace("ref_", "").slice(0, 10);
      const subExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      // Resolve referrer from startParam (e.g. startapp=ref_XXXXXX)
      let referredBy: string | null = null;
      if (startParam && typeof startParam === 'string' && startParam.startsWith('ref_')) {
        const refCode = startParam.replace('ref_', '');
        if (refCode) {
          const referrerUserId = await kv.get(`become:referral:${refCode}`);
          if (referrerUserId && referrerUserId !== userId) {
            referredBy = referrerUserId as string;
            console.log(`[Auth] New user referred by ${referrerUserId} via startParam=${startParam}`);
          }
        }
      }

      user = {
        id: userId,
        telegramId: tgUser.id,
        firstName: tgUser.first_name,
        lastName: tgUser.last_name || null,
        username: tgUser.username || null,
        photoUrl: tgUser.photo_url || null,
        language: tgUser.language_code || "en",
        tone: "supportive",
        selectedGoal: null,
        xp: 0,
        dailyReminderTime: "10:00",
        utcOffset: 0,
        activeProgramId: null,
        subscriptionExpiresAt: subExpiresAt,
        referralCode,
        referralCount: 0,
        referredBy,
        createdAt: now,
        updatedAt: now,
      };

      const wallet = {
        id: generateId("wallet"),
        userId: userId,
        starsBalance: 0,
        tonBalance: 0,
      };

      await kv.set(`become:user:${userId}`, user);
      await kv.set(`become:user:tg:${tgId}`, userId);
      await kv.set(`become:wallet:${userId}`, wallet);
      await kv.set(`become:referral:${referralCode}`, userId);

      // Fire-and-forget: send welcome notification via bot
      (async () => {
        try {
          await notifyWelcome(userId, tgUser.id, tgUser.first_name);
        } catch (notifErr) {
          console.log("[Notifications] Error sending welcome:", notifErr);
        }
      })();

      // Fire-and-forget: process referral bonus for the referrer (new user registration)
      if (referredBy) {
        processReferralBonus(referredBy, userId, user.firstName || "A friend").catch((err: any) => {
          console.log(`[Auth] Referral bonus for referrer ${referredBy} failed (non-critical): ${err}`);
        });
      }
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL).toISOString();
    await kv.set(`become:session:${token}`, {
      userId,
      telegramId: tgId,
      expiresAt,
    });

    // Generate long-lived device token for session refresh
    const deviceToken = await generateDeviceToken(userId, tgId);

    console.log(`Auth success: user ${userId} (tg:${tgId})${user.referredBy ? `, referredBy=${user.referredBy}` : ''}`);
    return c.json({ user, token, deviceToken, referralProcessed: !!user.referredBy });
  } catch (err) {
    console.log("Auth error:", err);
    return c.json(
      { message: `Internal server error during auth: ${err}`, code: "INTERNAL_ERROR", status: 500 },
      500
    );
  }
});

// ---- POST /auth/bot-token ----
// Authenticate via bot-generated one-time token (for environments without initData)
app.post(`${PREFIX}/auth/bot-token`, async (c) => {
  await triggerSeed();

  try {
    const body = await c.req.json();
    const { token: botToken } = body;

    if (!botToken) {
      return c.json(
        { message: "bot_auth token is required", code: "MISSING_TOKEN", status: 400 },
        400
      );
    }

    // Look up the bot auth token
    const authData = await kv.get(`become:bot_auth:${botToken}`);
    if (!authData) {
      return c.json(
        { message: "Invalid or expired bot auth token", code: "INVALID_TOKEN", status: 401 },
        401
      );
    }

    // Check expiry
    if (authData.expiresAt && new Date(authData.expiresAt) < new Date()) {
      await kv.del(`become:bot_auth:${botToken}`);
      return c.json(
        { message: "Bot auth token has expired", code: "TOKEN_EXPIRED", status: 401 },
        401
      );
    }

    // NOTE: bot_auth tokens are reusable within their TTL window (24h).
    // Reply keyboard persists in chat and user may tap it multiple times.
    // Token is NOT deleted after use — it expires naturally.

    // Find the user
    const user = await kv.get(`become:user:${authData.userId}`);
    if (!user) {
      return c.json(
        { message: "User not found for bot auth token", code: "NOT_FOUND", status: 404 },
        404
      );
    }

    // Ensure xp
    if (user.xp === undefined) user.xp = 0;

    // SECURITY: Never grant or extend subscription on re-authentication.
    // Only migrate referral fields (non-sensitive). Subscription stays as-is.
    const subStatus = user.subscriptionExpiresAt
      ? (new Date(user.subscriptionExpiresAt).getTime() > Date.now() ? "active" : "expired")
      : "none";
    console.log(`[Auth] Bot-auth re-auth user ${authData.userId}: subscription=${subStatus}, expiresAt=${user.subscriptionExpiresAt || "null"}`);
    let userChanged = false;
    if (!user.referralCode) {
      user.referralCode = generateId("ref").replace("ref_", "").slice(0, 10);
      await kv.set(`become:referral:${user.referralCode}`, authData.userId);
      userChanged = true;
    }
    if (user.referralCount === undefined) {
      user.referralCount = 0;
      userChanged = true;
    }
    if (userChanged) {
      user.updatedAt = new Date().toISOString();
      await kv.set(`become:user:${authData.userId}`, user);
      console.log(`[Auth] Bot-auth: migrated referral fields for user ${authData.userId}`);
    }

    // Create session
    const sessionToken = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL).toISOString();
    await kv.set(`become:session:${sessionToken}`, {
      userId: authData.userId,
      telegramId: authData.telegramId,
      expiresAt,
    });

    // Generate long-lived device token for session refresh
    const deviceToken = await generateDeviceToken(authData.userId, authData.telegramId);

    console.log(`[Auth] Bot-token auth success: user ${authData.userId} (tg:${authData.telegramId})`);
    return c.json({ user, token: sessionToken, deviceToken });
  } catch (err) {
    console.log("Bot-token auth error:", err);
    return c.json(
      { message: `Internal server error during bot-token auth: ${err}`, code: "INTERNAL_ERROR", status: 500 },
      500
    );
  }
});

// ---- POST /auth/refresh ----
// Refresh session using a long-lived device token.
// Returns a new session token (and extends the device token if needed).
app.post(`${PREFIX}/auth/refresh`, async (c) => {
  try {
    const body = await c.req.json();
    const { deviceToken } = body;

    if (!deviceToken) {
      return c.json(
        { message: "deviceToken is required", code: "MISSING_TOKEN", status: 400 },
        400
      );
    }

    const deviceData = await kv.get(`become:device:${deviceToken}`);
    if (!deviceData) {
      return c.json(
        { message: "Invalid or expired device token", code: "INVALID_DEVICE_TOKEN", status: 401 },
        401
      );
    }

    // Check expiry
    if (deviceData.expiresAt && new Date(deviceData.expiresAt) < new Date()) {
      await kv.del(`become:device:${deviceToken}`);
      return c.json(
        { message: "Device token has expired, please re-authenticate via bot", code: "DEVICE_TOKEN_EXPIRED", status: 401 },
        401
      );
    }

    // Verify user still exists
    const user = await kv.get(`become:user:${deviceData.userId}`);
    if (!user) {
      await kv.del(`become:device:${deviceToken}`);
      return c.json(
        { message: "User not found", code: "NOT_FOUND", status: 404 },
        404
      );
    }

    // Ensure fields
    if (user.xp === undefined) user.xp = 0;

    // Create new session
    const sessionToken = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL).toISOString();
    await kv.set(`become:session:${sessionToken}`, {
      userId: deviceData.userId,
      telegramId: deviceData.telegramId,
      expiresAt,
    });

    // Extend device token if < 30 days remaining
    let newDeviceToken: string | undefined;
    const deviceRemaining = new Date(deviceData.expiresAt).getTime() - Date.now();
    if (deviceRemaining < 30 * 24 * 60 * 60 * 1000) {
      // Delete old device token and create a new one
      await kv.del(`become:device:${deviceToken}`);
      newDeviceToken = await generateDeviceToken(deviceData.userId, deviceData.telegramId);
    }

    console.log(`[Auth] Session refreshed via device token: user ${deviceData.userId} (tg:${deviceData.telegramId})`);
    return c.json({
      user,
      token: sessionToken,
      deviceToken: newDeviceToken || deviceToken,
    });
  } catch (err) {
    console.log("Auth refresh error:", err);
    return c.json(
      { message: `Error refreshing session: ${err}`, code: "INTERNAL_ERROR", status: 500 },
      500
    );
  }
});

// ---- POST /auth/phone-request ----
// Send a verification code to the user's Telegram chat
app.post(`${PREFIX}/auth/phone-request`, async (c) => {
  try {
    const { phone } = await c.req.json();
    if (!phone || typeof phone !== 'string') {
      return c.json({ message: "Phone number is required", code: "BAD_REQUEST", status: 400 }, 400);
    }

    const normalized = normalizePhone(phone);
    if (normalized.length < 7) {
      return c.json({ message: "Invalid phone number", code: "BAD_REQUEST", status: 400 }, 400);
    }

    console.log(`[PhoneAuth] Code requested for phone: ${normalized}`);

    // Find user by phone number
    const found = await findUserByPhone(normalized);
    if (!found) {
      console.log(`[PhoneAuth] No user found for phone: ${normalized}`);
      return c.json({ message: "No account found with this phone number. Please share your contact in the bot first.", code: "NOT_FOUND", status: 404 }, 404);
    }

    // Generate 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + PHONE_CODE_TTL).toISOString();

    await kv.set(`become:phone_code:${normalized}`, {
      code,
      userId: found.userId,
      expiresAt,
      attempts: 0,
    });

    // Send code to user's Telegram chat
    const lang = found.user.language === "ru" ? "ru" : "en";
    const codeText = lang === "ru"
      ? [
          `🔐 <b>Код подтверждения Proper Food</b>`,
          ``,
          `Ваш код для входа в приложение:`,
          ``,
          `<code>${code}</code>`,
          ``,
          `⏱ Код действителен 5 минут.`,
          `Если вы не запрашивали код — просто проигнорируйте.`,
        ].join("\n")
      : [
          `🔐 <b>Proper Food Verification Code</b>`,
          ``,
          `Your code to log in:`,
          ``,
          `<code>${code}</code>`,
          ``,
          `⏱ Code is valid for 5 minutes.`,
          `If you didn't request this — just ignore it.`,
        ].join("\n");

    await sendMessage(Number(found.user.telegramId), codeText);
    console.log(`[PhoneAuth] Code sent to tg:${found.user.telegramId} for phone:${normalized}`);

    return c.json({ success: true });
  } catch (err) {
    console.log("POST /auth/phone-request error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /auth/phone-verify ----
// Verify the code and create a long-lived session
app.post(`${PREFIX}/auth/phone-verify`, async (c) => {
  try {
    const { phone, code } = await c.req.json();
    if (!phone || !code) {
      return c.json({ message: "Phone and code are required", code: "BAD_REQUEST", status: 400 }, 400);
    }

    const normalized = normalizePhone(phone);
    const stored = await kv.get(`become:phone_code:${normalized}`);

    if (!stored) {
      return c.json({ message: "No verification code found. Please request a new one.", code: "CODE_NOT_FOUND", status: 404 }, 404);
    }

    // Check expiry
    if (new Date(stored.expiresAt) < new Date()) {
      await kv.del(`become:phone_code:${normalized}`);
      return c.json({ message: "Code expired. Please request a new one.", code: "CODE_EXPIRED", status: 410 }, 410);
    }

    // Check attempts (max 5)
    if (stored.attempts >= 5) {
      await kv.del(`become:phone_code:${normalized}`);
      return c.json({ message: "Too many attempts. Please request a new code.", code: "TOO_MANY_ATTEMPTS", status: 429 }, 429);
    }

    // Verify code
    if (stored.code !== String(code).trim()) {
      stored.attempts = (stored.attempts || 0) + 1;
      await kv.set(`become:phone_code:${normalized}`, stored);
      return c.json({ message: "Invalid code", code: "INVALID_CODE", status: 401 }, 401);
    }

    // Code matches! Clean up
    await kv.del(`become:phone_code:${normalized}`);

    // Get user
    const user = await kv.get(`become:user:${stored.userId}`);
    if (!user) {
      return c.json({ message: "User not found", code: "NOT_FOUND", status: 404 }, 404);
    }

    // Ensure fields
    if (user.xp === undefined) user.xp = 0;

    // Create long-lived session (180 days)
    const sessionToken = generateToken();
    await kv.set(`become:session:${sessionToken}`, {
      userId: stored.userId,
      telegramId: String(user.telegramId),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + PHONE_SESSION_TTL).toISOString(),
    });

    // Generate device token for session refresh
    const deviceToken = await generateDeviceToken(stored.userId, String(user.telegramId));

    console.log(`[PhoneAuth] Verified! User ${stored.userId} (tg:${user.telegramId}) authenticated via phone:${normalized}. Session TTL: 180 days.`);

    return c.json({
      user,
      token: sessionToken,
      deviceToken,
    });
  } catch (err) {
    console.log("POST /auth/phone-verify error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /me ----
app.get(`${PREFIX}/me`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) {
      return c.json(
        { message: "Unauthorized - invalid or missing token", code: "UNAUTHORIZED", status: 401 },
        401
      );
    }

    const user = await kv.get(`become:user:${auth.userId}`);
    if (!user) {
      return c.json(
        { message: "User not found", code: "NOT_FOUND", status: 404 },
        404
      );
    }

    // Ensure xp field exists
    if (user.xp === undefined) user.xp = 0;

    return c.json(user);
  } catch (err) {
    console.log("GET /me error:", err);
    return c.json(
      { message: `Error fetching user: ${err}`, code: "INTERNAL_ERROR", status: 500 },
      500
    );
  }
});

// ---- PUT /me ----
app.put(`${PREFIX}/me`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) {
      return c.json(
        { message: "Unauthorized", code: "UNAUTHORIZED", status: 401 },
        401
      );
    }

    const user = await kv.get(`become:user:${auth.userId}`);
    if (!user) {
      return c.json(
        { message: "User not found", code: "NOT_FOUND", status: 404 },
        404
      );
    }

    const body = await c.req.json();
    const allowedFields = ["language", "tone", "selectedGoal", "firstName", "lastName", "dailyReminderTime", "utcOffset", "privacySettings"];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        user[field] = body[field];
      }
    }
    user.updatedAt = new Date().toISOString();

    await kv.set(`become:user:${auth.userId}`, user);
    console.log(`User updated: ${auth.userId}`);
    return c.json(user);
  } catch (err) {
    console.log("PUT /me error:", err);
    return c.json(
      { message: `Error updating user: ${err}`, code: "INTERNAL_ERROR", status: 500 },
      500
    );
  }
});

// ---- GET /programs ----
app.get(`${PREFIX}/programs`, async (c) => {
  await triggerSeed();

  try {
    const lang = await resolveContentLang(c);
    const programs = await kv.getByPrefix("become:program:");
    if (!programs || programs.length === 0) {
      return c.json([]);
    }

    const enriched = await Promise.all(
      programs.map(async (program: any) => {
        const days = await kv.getByPrefix(`become:day:${program.id}:`);
        days.sort((a: any, b: any) => a.dayNumber - b.dayNumber);
        return localizeProgram({ ...program, days }, lang);
      })
    );

    return c.json(enriched);
  } catch (err) {
    console.log("GET /programs error:", err);
    return c.json(
      { message: `Error fetching programs: ${err}`, code: "INTERNAL_ERROR", status: 500 },
      500
    );
  }
});

// ---- GET /programs/active ----
app.get(`${PREFIX}/programs/active`, async (c) => {
  await triggerSeed();

  try {
    const lang = await resolveContentLang(c);

    // Prioritize user's activeProgramId if set
    try {
      const auth = await resolveUser(c);
      if (auth) {
        const user = await kv.get(`become:user:${auth.userId}`);
        if (user?.activeProgramId) {
          const userProg = await kv.get(`become:program:${user.activeProgramId}`);
          if (userProg) {
            const days = await kv.getByPrefix(`become:day:${user.activeProgramId}:`);
            days.sort((a: any, b: any) => a.dayNumber - b.dayNumber);
            return c.json(localizeProgram({ ...userProg, days }, lang));
          }
        }
      }
    } catch (_) { /* no auth or error, fallback below */ }

    // Fallback: any program marked isActive
    const programs = await kv.getByPrefix("become:program:");
    const active = programs?.find((p: any) => p.isActive);
    if (!active) {
      return c.json(
        { message: "No active program found", code: "NOT_FOUND", status: 404 },
        404
      );
    }

    const days = await kv.getByPrefix(`become:day:${active.id}:`);
    days.sort((a: any, b: any) => a.dayNumber - b.dayNumber);

    return c.json(localizeProgram({ ...active, days }, lang));
  } catch (err) {
    console.log("GET /programs/active error:", err);
    return c.json(
      { message: `Error fetching active program: ${err}`, code: "INTERNAL_ERROR", status: 500 },
      500
    );
  }
});

// ---- GET /programs/:id/days ----
app.get(`${PREFIX}/programs/:id/days`, async (c) => {
  await triggerSeed();

  try {
    const lang = await resolveContentLang(c);
    const programId = c.req.param("id");
    const days = await kv.getByPrefix(`become:day:${programId}:`);
    days.sort((a: any, b: any) => a.dayNumber - b.dayNumber);
    return c.json(days.map((d: any) => localizeDay(d, lang)));
  } catch (err) {
    console.log("GET /programs/:id/days error:", err);
    return c.json(
      { message: `Error fetching program days: ${err}`, code: "INTERNAL_ERROR", status: 500 },
      500
    );
  }
});

// ---- GET /programs/:id/days/:dayNumber ----
app.get(`${PREFIX}/programs/:id/days/:dayNumber`, async (c) => {
  await triggerSeed();

  try {
    const lang = await resolveContentLang(c);
    const programId = c.req.param("id");
    const dayNumber = parseInt(c.req.param("dayNumber"), 10);

    const days = await kv.getByPrefix(`become:day:${programId}:`);
    const day = days?.find((d: any) => d.dayNumber === dayNumber);

    if (!day) {
      return c.json(
        { message: `Day ${dayNumber} not found`, code: "NOT_FOUND", status: 404 },
        404
      );
    }

    return c.json(localizeDay(day, lang));
  } catch (err) {
    console.log("GET /programs/:id/days/:dayNumber error:", err);
    return c.json(
      { message: `Error fetching program day: ${err}`, code: "INTERNAL_ERROR", status: 500 },
      500
    );
  }
});

// ---- GET /progress ----
app.get(`${PREFIX}/progress`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) {
      return c.json(
        { message: "Unauthorized", code: "UNAUTHORIZED", status: 401 },
        401
      );
    }

    // Only return progress for the active program so new plans start fresh
    const user = await kv.get(`become:user:${auth.userId}`);
    const activeProgramId = user?.activeProgramId;
    const prefix = activeProgramId
      ? `become:progress:${auth.userId}:${activeProgramId}:`
      : `become:progress:${auth.userId}:`;
    const progressList = await kv.getByPrefix(prefix);
    progressList.sort((a: any, b: any) => a.dayNumber - b.dayNumber);
    return c.json(progressList);
  } catch (err) {
    console.log("GET /progress error:", err);
    return c.json(
      { message: `Error fetching progress: ${err}`, code: "INTERNAL_ERROR", status: 500 },
      500
    );
  }
});

// ---- GET /progress/summary ----
app.get(`${PREFIX}/progress/summary`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) {
      return c.json(
        { message: "Unauthorized", code: "UNAUTHORIZED", status: 401 },
        401
      );
    }

    const user = await kv.get(`become:user:${auth.userId}`);
    const activeProgramId = user?.activeProgramId;
    const prefix = activeProgramId
      ? `become:progress:${auth.userId}:${activeProgramId}:`
      : `become:progress:${auth.userId}:`;
    const progressList = await kv.getByPrefix(prefix);

    const doneDays = progressList.filter((p: any) => p.status === "done").length;
    const skippedDays = progressList.filter((p: any) => p.status === "skip").length;

    // Streak: consecutive done days from the latest done day backwards
    const doneEntries = progressList
      .filter((p: any) => p.status === "done")
      .sort((a: any, b: any) => b.dayNumber - a.dayNumber);

    let streak = 0;
    if (doneEntries.length > 0) {
      for (let i = 0; i < doneEntries.length; i++) {
        const expected = doneEntries[0].dayNumber - i;
        if (doneEntries[i].dayNumber === expected) streak++;
        else break;
      }
    }

    // Find total days from user's active program (direct lookup, not full scan)
    const activeProg = activeProgramId ? await kv.get(`become:program:${activeProgramId}`) : null;
    const totalDays = activeProg?.durationDays || 7;

    return c.json({
      doneDays,
      skippedDays,
      streak,
      xp: user?.xp || 0,
      totalDays,
    });
  } catch (err) {
    console.log("GET /progress/summary error:", err);
    return c.json(
      { message: `Error fetching progress summary: ${err}`, code: "INTERNAL_ERROR", status: 500 },
      500
    );
  }
});

// ---- POST /progress (upsert with XP) ----
app.post(`${PREFIX}/progress`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) {
      return c.json(
        { message: "Unauthorized", code: "UNAUTHORIZED", status: 401 },
        401
      );
    }

    const body = await c.req.json();
    const { programId, dayNumber, status, reflectionText, metaJson } = body;

    if (!programId || dayNumber === undefined || !status) {
      return c.json(
        { message: "programId, dayNumber, and status are required", code: "BAD_REQUEST", status: 400 },
        400
      );
    }

    const key = `become:progress:${auth.userId}:${programId}:${dayNumber}`;
    const existing = await kv.get(key);
    const now = new Date().toISOString();

    // Calculate XP to award (only if new or changing to a higher-XP status)
    let xpEarned = 0;
    const xpForStatus = status === "done" ? XP_DONE : status === "skip" ? XP_SKIP : 0;

    if (existing) {
      // Only award difference if upgrading (skip->done etc.)
      const prevXp = existing.metaJson?.xpEarned || 0;
      xpEarned = Math.max(0, xpForStatus - prevXp);

      existing.status = status;
      if (reflectionText !== undefined) {
        existing.reflectionText = reflectionText;
      }
      if (metaJson) {
        existing.metaJson = { ...metaJson, xpEarned: prevXp + xpEarned };
      } else {
        existing.metaJson = { ...(existing.metaJson || {}), xpEarned: prevXp + xpEarned };
      }
      existing.updatedAt = now;
      await kv.set(key, existing);

      // Update user XP
      if (xpEarned > 0) {
        const user = await kv.get(`become:user:${auth.userId}`);
        if (user) {
          user.xp = (user.xp || 0) + xpEarned;
          user.updatedAt = now;
          await kv.set(`become:user:${auth.userId}`, user);
        }
      }

      const totalUser = await kv.get(`become:user:${auth.userId}`);
      console.log(`Progress updated: user ${auth.userId}, day ${dayNumber}, status ${status}, xp +${xpEarned}`);

      // Fire-and-forget: send Telegram notification for progress update
      (async () => {
        try {
          const tgId = Number(auth.telegramId);
          if (!tgId) return;
          const allProgress = await kv.getByPrefix(`become:progress:${auth.userId}:${programId}:`);
          const streak = computeStreak(allProgress);
          const programs = await kv.getByPrefix("become:program:");
          const activeProgram = programs?.find((p: any) => p.id === programId);
          const totalDays = activeProgram?.durationDays || 7;

          await notifyDayComplete(
            auth.userId, tgId, dayNumber, totalDays,
            status, xpEarned, totalUser?.xp || 0, streak
          );

          if (status === "done" && streak >= 3) {
            await notifyStreakMilestone(auth.userId, tgId, streak);
          }

          const doneDays = allProgress.filter((p: any) => p.status === "done").length;
          const skippedDays = allProgress.filter((p: any) => p.status === "skip").length;
          if (doneDays + skippedDays >= totalDays && activeProgram) {
            await notifyProgramCompleted(
              auth.userId, tgId, activeProgram.title,
              totalUser?.xp || 0, doneDays, totalDays
            );
          }
        } catch (notifErr) {
          console.log("[Notifications] Error in progress update notification:", notifErr);
        }
      })();

      return c.json({ progress: existing, xpEarned, totalXp: totalUser?.xp || 0 });
    }

    // Create new progress entry
    const progressMeta = metaJson
      ? { ...metaJson, xpEarned: xpForStatus }
      : { completedTaskIds: [], xpEarned: xpForStatus };

    const progress = {
      id: generateId("prog"),
      userId: auth.userId,
      programId,
      dayNumber,
      status,
      reflectionText: reflectionText || null,
      metaJson: progressMeta,
      createdAt: now,
    };
    await kv.set(key, progress);

    // Award XP
    xpEarned = xpForStatus;
    const user = await kv.get(`become:user:${auth.userId}`);
    if (user) {
      user.xp = (user.xp || 0) + xpEarned;
      user.updatedAt = now;
      await kv.set(`become:user:${auth.userId}`, user);
    }

    console.log(`Progress saved: user ${auth.userId}, day ${dayNumber}, status ${status}, xp +${xpEarned}`);

    // Fire-and-forget: send Telegram notification for new progress
    (async () => {
      try {
        const tgId = Number(auth.telegramId);
        if (!tgId) return;
        const allProgress = await kv.getByPrefix(`become:progress:${auth.userId}:${programId}:`);
        const streak = computeStreak(allProgress);
        const programs = await kv.getByPrefix("become:program:");
        const activeProgram = programs?.find((p: any) => p.id === programId);
        const totalDays = activeProgram?.durationDays || 7;

        await notifyDayComplete(
          auth.userId, tgId, dayNumber, totalDays,
          status, xpEarned, user?.xp || 0, streak
        );

        if (status === "done" && streak >= 3) {
          await notifyStreakMilestone(auth.userId, tgId, streak);
        }

        const doneDays = allProgress.filter((p: any) => p.status === "done").length;
        const skippedDays = allProgress.filter((p: any) => p.status === "skip").length;
        if (doneDays + skippedDays >= totalDays && activeProgram) {
          await notifyProgramCompleted(
            auth.userId, tgId, activeProgram.title,
            user?.xp || 0, doneDays, totalDays
          );
        }

        // Notify challenge members when a fellow member completes a day
        if (status === "done") {
          try {
            const allChallenges = await kv.getByPrefix("become:challenge:");
            const activeChallenges = allChallenges.filter(
              (ch: any) => ch.id && ch.status === "active" && ch.programId === programId
            );
            for (const ch of activeChallenges) {
              const members = await kv.getByPrefix(`become:ch_member:${ch.id}:`);
              const isMember = members?.some((m: any) => m.userId === auth.userId);
              if (!isMember || !members || members.length <= 1) continue;

              const memberName = user ? `${user.firstName} ${user.lastName || ""}`.trim() : "Someone";
              const memberDoneDays = allProgress.filter((p: any) => p.status === "done").length;

              // Build list of other members with their telegramIds
              const otherMembers: Array<{ userId: string; telegramId?: number }> = [];
              for (const m of members) {
                if (m.userId === auth.userId) continue;
                const otherUser = await kv.get(`become:user:${m.userId}`);
                if (otherUser?.telegramId) {
                  otherMembers.push({ userId: m.userId, telegramId: Number(otherUser.telegramId) });
                }
              }

              if (otherMembers.length > 0) {
                await notifyChallengeMemberDayComplete(
                  auth.userId, memberName, ch.title,
                  dayNumber, memberDoneDays, ch.durationDays || 7,
                  streak, otherMembers
                );
              }
            }
          } catch (chNotifErr) {
            console.log("[Notifications] Error in challenge member notification:", chNotifErr);
          }
        }
      } catch (notifErr) {
        console.log("[Notifications] Error in new progress notification:", notifErr);
      }
    })();

    return c.json({ progress, xpEarned, totalXp: user?.xp || 0 });
  } catch (err) {
    console.log("POST /progress error:", err);
    return c.json(
      { message: `Error saving progress: ${err}`, code: "INTERNAL_ERROR", status: 500 },
      500
    );
  }
});

// ---- POST /progress/reflection ----
app.post(`${PREFIX}/progress/reflection`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) {
      return c.json(
        { message: "Unauthorized", code: "UNAUTHORIZED", status: 401 },
        401
      );
    }

    const body = await c.req.json();
    const { programId, dayNumber, reflectionText } = body;

    if (!programId || dayNumber === undefined) {
      return c.json(
        { message: "programId and dayNumber are required", code: "BAD_REQUEST", status: 400 },
        400
      );
    }

    const key = `become:progress:${auth.userId}:${programId}:${dayNumber}`;
    const existing = await kv.get(key);

    if (!existing) {
      return c.json(
        { message: "Progress entry not found", code: "NOT_FOUND", status: 404 },
        404
      );
    }

    existing.reflectionText = reflectionText || null;
    existing.updatedAt = new Date().toISOString();
    await kv.set(key, existing);

    // Also create a Journal note of type 'reflection' (fire-and-forget)
    if (reflectionText && reflectionText.trim()) {
      const noteId = generateId("note");
      const now = new Date().toISOString();
      await kv.set(`become:note:${auth.userId}:${noteId}`, {
        id: noteId,
        userId: auth.userId,
        type: "reflection",
        contentText: reflectionText.trim(),
        contentAudioUrl: null,
        relatedProgramId: programId,
        relatedDayNumber: dayNumber,
        createdAt: now,
      }).catch((e: any) => console.log(`[Notes] Error auto-creating reflection note: ${e}`));
    }

    console.log(`Reflection saved: user ${auth.userId}, day ${dayNumber}`);
    return c.json(existing);
  } catch (err) {
    console.log("POST /progress/reflection error:", err);
    return c.json(
      { message: `Error saving reflection: ${err}`, code: "INTERNAL_ERROR", status: 500 },
      500
    );
  }
});

// =============================================
// CHALLENGE ROUTES
// =============================================

// ---- Auto-settle helper: settles expired active challenges ----
const AUTO_SETTLE_THRESHOLD = 0.8;

async function autoSettleChallenge(ch: any): Promise<any> {
  if (ch.status !== "active") return ch;
  if (new Date(ch.endAt).getTime() > Date.now()) return ch;

  // Challenge is expired and still active — auto-settle
  console.log(`[AutoSettle] Settling expired challenge ${ch.id} (ended ${ch.endAt})`);

  const members = await kv.getByPrefix(`become:ch_member:${ch.id}:`);
  const activeMembers = (members || []).filter((m: any) => m.status === "active");

  for (const member of activeMembers) {
    const progressList = await kv.getByPrefix(`become:progress:${member.userId}:${ch.programId}:`);
    const doneDays = progressList.filter((p: any) => p.status === "done").length;
    const completionRate = ch.durationDays > 0 ? doneDays / ch.durationDays : 0;
    const passed = completionRate >= AUTO_SETTLE_THRESHOLD;

    const deposit = member.depositAmount || 0;
    const cur = member.depositCurrency || ch.currency || "stars";

    if (deposit > 0 && member.deposited) {
      let wallet = await kv.get(`become:wallet:${member.userId}`);
      if (wallet) {
        if (passed) {
          if (cur === "stars") {
            wallet.starsReserved = Math.max(0, (wallet.starsReserved || 0) - deposit);
          } else {
            wallet.tonReserved = Math.max(0, (wallet.tonReserved || 0) - deposit);
          }
        } else {
          if (cur === "stars") {
            wallet.starsReserved = Math.max(0, (wallet.starsReserved || 0) - deposit);
            wallet.starsBalance = Math.max(0, (wallet.starsBalance || 0) - deposit);
          } else {
            wallet.tonReserved = Math.max(0, (wallet.tonReserved || 0) - deposit);
            wallet.tonBalance = Math.max(0, (wallet.tonBalance || 0) - deposit);
          }
        }
        await kv.set(`become:wallet:${member.userId}`, wallet);
        // Log transaction
        if (passed) {
          await logTransaction(member.userId, "deposit_return", deposit, cur, { challengeId: ch.id, challengeTitle: ch.title });
        } else {
          await logTransaction(member.userId, "deposit_penalty", deposit, cur, { challengeId: ch.id, challengeTitle: ch.title });
        }
      }
    }

    member.status = passed ? "completed" : "failed";
    member.doneDays = doneDays;
    member.depositReturned = passed;
    member.penaltyAmount = passed ? 0 : deposit;
    member.settledAt = new Date().toISOString();
    await kv.set(`become:ch_member:${ch.id}:${member.userId}`, member);
  }

  // ---- Pool redistribution (for pool-type challenges) ----
  if (ch.type === "pool" && ch.depositAmount > 0) {
    const updatedMembers = await kv.getByPrefix(`become:ch_member:${ch.id}:`);
    const winners = (updatedMembers || []).filter((m: any) => m.status === "completed" && m.deposited);
    const losers = (updatedMembers || []).filter((m: any) => (m.status === "failed" || m.status === "left") && m.deposited);
    
    const totalForfeited = losers.reduce((sum: number, m: any) => sum + (m.penaltyAmount || m.depositAmount || 0), 0);
    const cur = ch.currency || "stars";

    if (totalForfeited > 0 && winners.length > 0) {
      const bonusPerWinner = Math.floor(totalForfeited / winners.length);
      const remainder = totalForfeited - bonusPerWinner * winners.length;

      for (let i = 0; i < winners.length; i++) {
        const w = winners[i];
        const bonus = bonusPerWinner + (i === 0 ? remainder : 0);
        if (bonus <= 0) continue;

        let wallet = await kv.get(`become:wallet:${w.userId}`);
        if (wallet) {
          if (cur === "stars") {
            wallet.starsBalance = (wallet.starsBalance || 0) + bonus;
          } else {
            wallet.tonBalance = (wallet.tonBalance || 0) + bonus;
          }
          await kv.set(`become:wallet:${w.userId}`, wallet);
          console.log(`[AutoSettle Pool] Bonus ${bonus} ${cur} to winner ${w.userId}`);
          await logTransaction(w.userId, "pool_bonus", bonus, cur, { challengeId: ch.id, challengeTitle: ch.title });
        }

        // Update member record with bonus
        w.poolBonus = bonus;
        await kv.set(`become:ch_member:${ch.id}:${w.userId}`, w);
      }
    }
  }

  ch.status = "settled";
  ch.settledAt = new Date().toISOString();
  await kv.set(`become:challenge:${ch.id}`, ch);

  // Fire-and-forget notifications
  (async () => {
    try {
      const allMembers = await kv.getByPrefix(`become:ch_member:${ch.id}:`);
      const settledMembers = (allMembers || []).filter((m: any) => m.settledAt);
      for (const m of settledMembers) {
        const mUser = await kv.get(`become:user:${m.userId}`);
        if (!mUser?.telegramId) continue;
        const tgId = Number(mUser.telegramId);
        const mLang = mUser.language === "ru" ? "ru" : "en";
        const passed = m.status === "completed";
        const deposit = m.depositAmount || 0;
        const curSymbol = ch.currency === "stars" ? "\u2B50" : "TON";
        const poolBonus = m.poolBonus || 0;

        let notifText: string;
        if (passed) {
          const bonusLine = poolBonus > 0
            ? (mLang === "ru" ? `\n\u{1F381} \u0411\u043E\u043D\u0443\u0441 \u0438\u0437 \u043F\u0443\u043B\u0430: +${poolBonus} ${curSymbol}` : `\n\u{1F381} Pool bonus: +${poolBonus} ${curSymbol}`)
            : "";
          notifText = mLang === "ru"
            ? `\u2705 <b>\u0427\u0435\u043B\u043B\u0435\u043D\u0434\u0436 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D!</b>\n\n\u{1F3C6} <b>\u00AB${ch.title}\u00BB</b> \u2014 ${m.doneDays || 0}/${ch.durationDays} \u0434\u043D\u0435\u0439${deposit > 0 ? `\n\u{1F4B0} \u0414\u0435\u043F\u043E\u0437\u0438\u0442 ${deposit} ${curSymbol} \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0451\u043D!` : ""}${bonusLine}`
            : `\u2705 <b>Challenge Complete!</b>\n\n\u{1F3C6} <b>\u201C${ch.title}\u201D</b> \u2014 ${m.doneDays || 0}/${ch.durationDays} days${deposit > 0 ? `\n\u{1F4B0} Deposit ${deposit} ${curSymbol} returned!` : ""}${bonusLine}`;
        } else {
          notifText = mLang === "ru"
            ? `\u274C <b>\u0427\u0435\u043B\u043B\u0435\u043D\u0434\u0436 \u043D\u0435 \u043F\u0440\u043E\u0439\u0434\u0435\u043D</b>\n\n<b>\u00AB${ch.title}\u00BB</b> \u2014 ${m.doneDays || 0}/${ch.durationDays} (\u043D\u0443\u0436\u043D\u043E \u226580%)${deposit > 0 ? `\n\u{1F6A8} \u0421\u043F\u0438\u0441\u0430\u043D\u043E: ${deposit} ${curSymbol}` : ""}\n\u{1F4AA} \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439 \u0441\u043D\u043E\u0432\u0430!`
            : `\u274C <b>Challenge Not Passed</b>\n\n<b>\u201C${ch.title}\u201D</b> \u2014 ${m.doneDays || 0}/${ch.durationDays} (need \u226580%)${deposit > 0 ? `\n\u{1F6A8} Forfeited: ${deposit} ${curSymbol}` : ""}\n\u{1F4AA} Try again!`;
        }
        await sendMessage(tgId, notifText);
      }
    } catch (notifErr) {
      console.log("[AutoSettle] Notification error:", notifErr);
    }
  })();

  return ch;
}

// ---- GET /challenges ----
app.get(`${PREFIX}/challenges`, async (c) => {
  await triggerSeed();
  try {
    const auth = await resolveUser(c);
    const userId = auth?.userId;

    const challenges = await kv.getByPrefix("become:challenge:");
    if (!challenges || challenges.length === 0) {
      return c.json([]);
    }

    // Filter only actual challenge objects (not members)
    const validChallenges = challenges.filter((ch: any) => ch.id && ch.type && ch.title);

    // Auto-settle expired challenges
    for (const ch of validChallenges) {
      if (ch.status === "active" && new Date(ch.endAt).getTime() <= Date.now()) {
        try { await autoSettleChallenge(ch); } catch (e) { console.log("[AutoSettle] Error:", e); }
      }
    }

    const enriched = await Promise.all(
      validChallenges.map(async (ch: any) => {
        // Re-read in case auto-settle updated it
        const freshCh = await kv.get(`become:challenge:${ch.id}`) || ch;
        const members = await kv.getByPrefix(`become:ch_member:${freshCh.id}:`);
        const isMember = userId ? members?.some((m: any) => m.userId === userId) : false;
        const activeMembers = (members || []).filter((m: any) => m.status !== "left");
        return {
          ...freshCh,
          visibility: freshCh.visibility || "open",
          inviteCode: isMember ? (freshCh.inviteCode || null) : null,
          members: members || [],
          isMember,
          memberCount: activeMembers.length,
        };
      })
    );

    // Sort: active first, then by createdAt desc
    enriched.sort((a: any, b: any) => {
      if (a.status === "active" && b.status !== "active") return -1;
      if (b.status === "active" && a.status !== "active") return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return c.json(enriched);
  } catch (err) {
    console.log("GET /challenges error:", err);
    return c.json(
      { message: `Error fetching challenges: ${err}`, code: "INTERNAL_ERROR", status: 500 },
      500
    );
  }
});

// ---- GET /challenges/:id ----
app.get(`${PREFIX}/challenges/:id`, async (c) => {
  await triggerSeed();
  try {
    const auth = await resolveUser(c);
    const userId = auth?.userId;
    const challengeId = c.req.param("id");

    let ch = await kv.get(`become:challenge:${challengeId}`);
    if (!ch) {
      return c.json(
        { message: "Challenge not found", code: "NOT_FOUND", status: 404 },
        404
      );
    }

    // Auto-settle if expired
    if (ch.status === "active" && new Date(ch.endAt).getTime() <= Date.now()) {
      try { ch = await autoSettleChallenge(ch); } catch (e) { console.log("[AutoSettle] Error:", e); }
      ch = await kv.get(`become:challenge:${challengeId}`) || ch;
    }

    const members = await kv.getByPrefix(`become:ch_member:${ch.id}:`);

    // Enrich members with progress snapshot
    const enrichedMembers = await Promise.all(
      (members || []).map(async (member: any) => {
        const progressList = await kv.getByPrefix(`become:progress:${member.userId}:${ch.programId}:`);
        const doneDays = progressList.filter((p: any) => p.status === "done").length;

        // Streak
        const doneEntries = progressList
          .filter((p: any) => p.status === "done")
          .sort((a: any, b: any) => b.dayNumber - a.dayNumber);
        let streak = 0;
        if (doneEntries.length > 0) {
          for (let i = 0; i < doneEntries.length; i++) {
            if (doneEntries[i].dayNumber === doneEntries[0].dayNumber - i) streak++;
            else break;
          }
        }

        // Today status: based on highest day number
        const highestDay = progressList.length > 0
          ? Math.max(...progressList.map((p: any) => p.dayNumber))
          : 0;
        const currentDayProgress = progressList.find((p: any) => p.dayNumber === highestDay);

        return {
          ...member,
          doneDays,
          streak,
          todayStatus: currentDayProgress?.status || "pending",
        };
      })
    );

    const isMember = userId ? enrichedMembers.some((m: any) => m.userId === userId) : false;
    return c.json({
      ...ch,
      visibility: ch.visibility || "open",
      // Only expose inviteCode to members
      inviteCode: isMember ? (ch.inviteCode || null) : null,
      members: enrichedMembers,
      isMember,
      memberCount: enrichedMembers.length,
    });
  } catch (err) {
    console.log("GET /challenges/:id error:", err);
    return c.json(
      { message: `Error fetching challenge: ${err}`, code: "INTERNAL_ERROR", status: 500 },
      500
    );
  }
});

// ---- POST /challenges (create) ----
app.post(`${PREFIX}/challenges`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) {
      return c.json(
        { message: "Unauthorized", code: "UNAUTHORIZED", status: 401 },
        401
      );
    }

    const body = await c.req.json();
    const { type, title, depositAmount, currency, durationDays, rulesText, programId, visibility } = body;

    if (!type || !title || !programId) {
      return c.json(
        { message: "type, title, and programId are required", code: "BAD_REQUEST", status: 400 },
        400
      );
    }

    const user = await kv.get(`become:user:${auth.userId}`);
    const now = new Date().toISOString();
    const endAt = new Date(Date.now() + (durationDays || 7) * 86400000).toISOString();
    const challengeId = generateId("ch");
    const deposit = depositAmount || 0;
    const cur = currency || "stars";

    // ---- Freeze deposit from wallet balance ----
    let depositFrozen = false;
    if (deposit > 0) {
      let wallet = await kv.get(`become:wallet:${auth.userId}`);
      if (!wallet) {
        wallet = { id: generateId("wallet"), userId: auth.userId, starsBalance: 0, tonBalance: 0, starsReserved: 0, tonReserved: 0 };
      }
      if (wallet.starsReserved === undefined) wallet.starsReserved = 0;
      if (wallet.tonReserved === undefined) wallet.tonReserved = 0;

      if (cur === "stars") {
        const available = (wallet.starsBalance || 0) - (wallet.starsReserved || 0);
        if (available < deposit) {
          return c.json(
            { message: `Insufficient Stars balance. Available: ${available}, required: ${deposit}`, code: "INSUFFICIENT_FUNDS", status: 400 },
            400
          );
        }
        wallet.starsReserved = (wallet.starsReserved || 0) + deposit;
      } else {
        const available = (wallet.tonBalance || 0) - (wallet.tonReserved || 0);
        if (available < deposit) {
          return c.json(
            { message: `Insufficient TON balance. Available: ${available}, required: ${deposit}`, code: "INSUFFICIENT_FUNDS", status: 400 },
            400
          );
        }
        wallet.tonReserved = (wallet.tonReserved || 0) + deposit;
      }
      await kv.set(`become:wallet:${auth.userId}`, wallet);
      depositFrozen = true;
      console.log(`[Challenge] Froze deposit ${deposit} ${cur} for user ${auth.userId}, wallet: stars=${wallet.starsBalance}/${wallet.starsReserved}, ton=${wallet.tonBalance}/${wallet.tonReserved}`);
    }

    // Generate a 6-char invite code for private challenges
    const vis = visibility === "private" ? "private" : "open";
    const inviteCode = vis === "private"
      ? Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("")
      : null;

    const challenge = {
      id: challengeId,
      ownerId: auth.userId,
      ownerName: user ? `${user.firstName} ${user.lastName || ""}`.trim() : "Unknown",
      type,
      title,
      depositAmount: deposit,
      currency: cur,
      durationDays: durationDays || 7,
      startAt: now,
      endAt,
      rulesText: rulesText || "",
      status: "active",
      visibility: vis,
      inviteCode,
      programId,
      createdAt: now,
    };

    await kv.set(`become:challenge:${challengeId}`, challenge);

    // Auto-join the creator as first member
    const memberId = generateId("cm");
    const member = {
      id: memberId,
      challengeId,
      userId: auth.userId,
      userName: challenge.ownerName,
      deposited: depositFrozen,
      depositAmount: depositFrozen ? deposit : 0,
      depositCurrency: cur,
      status: "active",
      joinedAt: now,
    };
    await kv.set(`become:ch_member:${challengeId}:${auth.userId}`, member);

    // Log deposit freeze transaction
    if (depositFrozen && deposit > 0) {
      await logTransaction(auth.userId, "deposit_freeze", deposit, cur, {
        challengeId,
        challengeTitle: title,
      });
    }

    console.log(`Challenge created: ${challengeId} by user ${auth.userId}, deposit frozen: ${depositFrozen}`);
    return c.json({
      ...challenge,
      members: [{ ...member, doneDays: 0, streak: 0, todayStatus: "pending" }],
      isMember: true,
      memberCount: 1,
    });
  } catch (err) {
    console.log("POST /challenges error:", err);
    return c.json(
      { message: `Error creating challenge: ${err}`, code: "INTERNAL_ERROR", status: 500 },
      500
    );
  }
});

// ---- POST /challenges/:id/join ----
app.post(`${PREFIX}/challenges/:id/join`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) {
      return c.json(
        { message: "Unauthorized", code: "UNAUTHORIZED", status: 401 },
        401
      );
    }

    const challengeId = c.req.param("id");
    const ch = await kv.get(`become:challenge:${challengeId}`);
    if (!ch) {
      return c.json(
        { message: "Challenge not found", code: "NOT_FOUND", status: 404 },
        404
      );
    }

    if (ch.status !== "active") {
      return c.json(
        { message: "Challenge is no longer active", code: "CHALLENGE_INACTIVE", status: 400 },
        400
      );
    }

    // If private challenge, validate invite code
    if (ch.visibility === "private" && ch.inviteCode) {
      let body: any = {};
      try { body = await c.req.json(); } catch (_) {}
      const providedCode = (body?.inviteCode || "").toUpperCase().trim();
      if (providedCode !== ch.inviteCode) {
        return c.json(
          { message: "Invalid invite code", code: "INVALID_CODE", status: 403 },
          403
        );
      }
    }

    // Check if already a member
    const existingMember = await kv.get(`become:ch_member:${challengeId}:${auth.userId}`);
    if (existingMember) {
      return c.json(
        { message: "Already a member", code: "ALREADY_JOINED", status: 400 },
        400
      );
    }

    const user = await kv.get(`become:user:${auth.userId}`);
    const memberId = generateId("cm");
    const now = new Date().toISOString();
    const deposit = ch.depositAmount || 0;
    const cur = ch.currency || "stars";

    // ---- Freeze deposit from wallet balance ----
    let depositFrozen = false;
    if (deposit > 0) {
      let wallet = await kv.get(`become:wallet:${auth.userId}`);
      if (!wallet) {
        wallet = { id: generateId("wallet"), userId: auth.userId, starsBalance: 0, tonBalance: 0, starsReserved: 0, tonReserved: 0 };
      }
      if (wallet.starsReserved === undefined) wallet.starsReserved = 0;
      if (wallet.tonReserved === undefined) wallet.tonReserved = 0;

      if (cur === "stars") {
        const available = (wallet.starsBalance || 0) - (wallet.starsReserved || 0);
        if (available < deposit) {
          return c.json(
            { message: `Insufficient Stars balance. Available: ${available}, required: ${deposit}`, code: "INSUFFICIENT_FUNDS", status: 400 },
            400
          );
        }
        wallet.starsReserved = (wallet.starsReserved || 0) + deposit;
      } else {
        const available = (wallet.tonBalance || 0) - (wallet.tonReserved || 0);
        if (available < deposit) {
          return c.json(
            { message: `Insufficient TON balance. Available: ${available}, required: ${deposit}`, code: "INSUFFICIENT_FUNDS", status: 400 },
            400
          );
        }
        wallet.tonReserved = (wallet.tonReserved || 0) + deposit;
      }
      await kv.set(`become:wallet:${auth.userId}`, wallet);
      depositFrozen = true;
      console.log(`[Challenge Join] Froze deposit ${deposit} ${cur} for user ${auth.userId}`);
    }

    const member = {
      id: memberId,
      challengeId,
      userId: auth.userId,
      userName: user ? `${user.firstName} ${user.lastName || ""}`.trim() : "Unknown",
      deposited: depositFrozen,
      depositAmount: depositFrozen ? deposit : 0,
      depositCurrency: cur,
      status: "active",
      joinedAt: now,
    };

    await kv.set(`become:ch_member:${challengeId}:${auth.userId}`, member);

    // Log deposit freeze transaction
    if (depositFrozen && deposit > 0) {
      await logTransaction(auth.userId, "deposit_freeze", deposit, cur, {
        challengeId,
        challengeTitle: ch.title,
      });
    }

    // Return updated challenge
    const members = await kv.getByPrefix(`become:ch_member:${challengeId}:`);
    console.log(`User ${auth.userId} joined challenge ${challengeId}`);

    // Fire-and-forget: notify the joiner and the challenge owner
    (async () => {
      try {
        const tgId = Number(auth.telegramId);
        if (tgId) {
          await notifyChallengeJoined(
            auth.userId, tgId, ch.title, ch.type, ch.durationDays
          );
        }

        // Notify the challenge owner (if different from joiner)
        if (ch.ownerId && ch.ownerId !== auth.userId) {
          const ownerUser = await kv.get(`become:user:${ch.ownerId}`);
          if (ownerUser?.telegramId) {
            await notifyChallengeNewMember(
              ch.ownerId,
              Number(ownerUser.telegramId),
              member.userName,
              ch.title,
              members?.length || 0
            );
          }
        }
      } catch (notifErr) {
        console.log("[Notifications] Error in challenge join notification:", notifErr);
      }
    })();

    return c.json({
      ...ch,
      members: members || [],
      isMember: true,
      memberCount: members?.length || 0,
    });
  } catch (err) {
    console.log("POST /challenges/:id/join error:", err);
    return c.json(
      { message: `Error joining challenge: ${err}`, code: "INTERNAL_ERROR", status: 500 },
      500
    );
  }
});

// ---- POST /challenges/:id/leave ----
// Voluntary leave — deposit is forfeited (penalty) as the user abandons the commitment
app.post(`${PREFIX}/challenges/:id/leave`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) {
      return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    }

    const challengeId = c.req.param("id");
    const ch = await kv.get(`become:challenge:${challengeId}`);
    if (!ch) {
      return c.json({ message: "Challenge not found", code: "NOT_FOUND", status: 404 }, 404);
    }

    const member = await kv.get(`become:ch_member:${challengeId}:${auth.userId}`);
    if (!member) {
      return c.json({ message: "Not a member", code: "NOT_MEMBER", status: 400 }, 400);
    }

    if (member.status !== "active") {
      return c.json({ message: "Already left or completed", code: "ALREADY_LEFT", status: 400 }, 400);
    }

    const deposit = member.depositAmount || 0;
    const cur = member.depositCurrency || ch.currency || "stars";

    // ---- Handle deposit: unfreeze reserved, apply penalty ----
    if (deposit > 0 && member.deposited) {
      let wallet = await kv.get(`become:wallet:${auth.userId}`);
      if (wallet) {
        if (cur === "stars") {
          wallet.starsReserved = Math.max(0, (wallet.starsReserved || 0) - deposit);
          wallet.starsBalance = Math.max(0, (wallet.starsBalance || 0) - deposit);
        } else {
          wallet.tonReserved = Math.max(0, (wallet.tonReserved || 0) - deposit);
          wallet.tonBalance = Math.max(0, (wallet.tonBalance || 0) - deposit);
        }
        await kv.set(`become:wallet:${auth.userId}`, wallet);
        console.log(`[Challenge Leave] Penalty: ${deposit} ${cur} deducted from user ${auth.userId}`);
      }
      // Log leave penalty transaction
      await logTransaction(auth.userId, "leave_penalty", deposit, cur, {
        challengeId,
        challengeTitle: ch.title,
      });
    }

    member.status = "left";
    member.penaltyAmount = deposit;
    member.depositReturned = false;
    member.leftAt = new Date().toISOString();
    await kv.set(`become:ch_member:${challengeId}:${auth.userId}`, member);

    console.log(`[Challenge] User ${auth.userId} left challenge ${challengeId}, penalty: ${deposit} ${cur}`);

    const members = await kv.getByPrefix(`become:ch_member:${challengeId}:`);
    const activeMembers = (members || []).filter((m: any) => m.status === "active");

    return c.json({
      ...ch,
      members: members || [],
      isMember: false,
      memberCount: activeMembers.length,
      leftWithPenalty: deposit > 0,
      penaltyAmount: deposit,
      penaltyCurrency: cur,
    });
  } catch (err) {
    console.log("POST /challenges/:id/leave error:", err);
    return c.json({ message: `Error leaving challenge: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /challenges/:id/settle ----
// Settle a completed/expired challenge — refund or penalize deposits
// Completion threshold: 80% of days done = success (deposit returned)
const COMPLETION_THRESHOLD = 0.8;

app.post(`${PREFIX}/challenges/:id/settle`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) {
      return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    }

    const challengeId = c.req.param("id");
    const ch = await kv.get(`become:challenge:${challengeId}`);
    if (!ch) {
      return c.json({ message: "Challenge not found", code: "NOT_FOUND", status: 404 }, 404);
    }

    const isOwner = ch.ownerId === auth.userId;
    const isExpired = new Date(ch.endAt).getTime() <= Date.now();
    const settleUser = await kv.get(`become:user:${auth.userId}`);
    const isAdmin = isAdminUser(String(settleUser?.telegramId));

    if (!isOwner && !isAdmin && !isExpired) {
      return c.json({ message: "Only owner can settle before expiry", code: "FORBIDDEN", status: 403 }, 403);
    }

    if (ch.status === "settled") {
      return c.json({ message: "Already settled", code: "ALREADY_SETTLED", status: 400 }, 400);
    }

    const members = await kv.getByPrefix(`become:ch_member:${challengeId}:`);
    const activeMembers = (members || []).filter((m: any) => m.status === "active");

    const results: Array<{ userId: string; userName: string; doneDays: number; passed: boolean; depositReturned: boolean; penaltyAmount: number }> = [];

    for (const member of activeMembers) {
      const progressList = await kv.getByPrefix(`become:progress:${member.userId}:${ch.programId}:`);
      const doneDays = progressList.filter((p: any) => p.status === "done").length;
      const completionRate = ch.durationDays > 0 ? doneDays / ch.durationDays : 0;
      const passed = completionRate >= COMPLETION_THRESHOLD;

      const deposit = member.depositAmount || 0;
      const cur = member.depositCurrency || ch.currency || "stars";

      if (deposit > 0 && member.deposited) {
        let wallet = await kv.get(`become:wallet:${member.userId}`);
        if (wallet) {
          if (passed) {
            // Success: just unfreeze (deposit stays in balance)
            if (cur === "stars") {
              wallet.starsReserved = Math.max(0, (wallet.starsReserved || 0) - deposit);
            } else {
              wallet.tonReserved = Math.max(0, (wallet.tonReserved || 0) - deposit);
            }
            console.log(`[Challenge Settle] Refunded ${deposit} ${cur} to user ${member.userId} (${doneDays}/${ch.durationDays})`);
            await logTransaction(member.userId, "deposit_return", deposit, cur, { challengeId, challengeTitle: ch.title });
          } else {
            // Failed: unfreeze AND deduct from balance
            if (cur === "stars") {
              wallet.starsReserved = Math.max(0, (wallet.starsReserved || 0) - deposit);
              wallet.starsBalance = Math.max(0, (wallet.starsBalance || 0) - deposit);
            } else {
              wallet.tonReserved = Math.max(0, (wallet.tonReserved || 0) - deposit);
              wallet.tonBalance = Math.max(0, (wallet.tonBalance || 0) - deposit);
            }
            console.log(`[Challenge Settle] Penalty: ${deposit} ${cur} from user ${member.userId} (${doneDays}/${ch.durationDays})`);
            await logTransaction(member.userId, "deposit_penalty", deposit, cur, { challengeId, challengeTitle: ch.title });
          }
          await kv.set(`become:wallet:${member.userId}`, wallet);
        }
      }

      member.status = passed ? "completed" : "failed";
      member.doneDays = doneDays;
      member.depositReturned = passed;
      member.penaltyAmount = passed ? 0 : deposit;
      member.settledAt = new Date().toISOString();
      await kv.set(`become:ch_member:${challengeId}:${member.userId}`, member);

      results.push({ userId: member.userId, userName: member.userName, doneDays, passed, depositReturned: passed, penaltyAmount: passed ? 0 : deposit });
    }

    // ---- Pool redistribution for pool-type challenges ----
    if (ch.type === "pool" && ch.depositAmount > 0) {
      const allMembers2 = await kv.getByPrefix(`become:ch_member:${challengeId}:`);
      const winners = (allMembers2 || []).filter((m: any) => m.status === "completed" && m.deposited);
      const losers = (allMembers2 || []).filter((m: any) => (m.status === "failed" || m.status === "left") && m.deposited);
      const totalForfeited = losers.reduce((sum: number, m: any) => sum + (m.penaltyAmount || m.depositAmount || 0), 0);
      const cur2 = ch.currency || "stars";

      if (totalForfeited > 0 && winners.length > 0) {
        const bonusPerWinner = Math.floor(totalForfeited / winners.length);
        const remainder = totalForfeited - bonusPerWinner * winners.length;

        for (let i = 0; i < winners.length; i++) {
          const w = winners[i];
          const bonus = bonusPerWinner + (i === 0 ? remainder : 0);
          if (bonus <= 0) continue;

          let wWallet = await kv.get(`become:wallet:${w.userId}`);
          if (wWallet) {
            if (cur2 === "stars") {
              wWallet.starsBalance = (wWallet.starsBalance || 0) + bonus;
            } else {
              wWallet.tonBalance = (wWallet.tonBalance || 0) + bonus;
            }
            await kv.set(`become:wallet:${w.userId}`, wWallet);
            console.log(`[Settle Pool] Bonus ${bonus} ${cur2} to winner ${w.userId}`);
            await logTransaction(w.userId, "pool_bonus", bonus, cur2, { challengeId, challengeTitle: ch.title });
          }

          w.poolBonus = bonus;
          await kv.set(`become:ch_member:${challengeId}:${w.userId}`, w);

          // Update results entry
          const rIdx = results.findIndex(r => r.userId === w.userId);
          if (rIdx >= 0) (results[rIdx] as any).poolBonus = bonus;
        }
      }
    }

    ch.status = "settled";
    ch.settledAt = new Date().toISOString();
    await kv.set(`become:challenge:${challengeId}`, ch);

    console.log(`[Challenge] Settled ${challengeId}: ${results.filter(r => r.passed).length} passed, ${results.filter(r => !r.passed).length} failed`);

    // Notify members (fire-and-forget)
    (async () => {
      try {
        for (const result of results) {
          const mUser = await kv.get(`become:user:${result.userId}`);
          if (!mUser?.telegramId) continue;
          const tgId = Number(mUser.telegramId);
          const mLang = mUser.language === "ru" ? "ru" : "en";

          let notifText: string;
          if (result.passed) {
            notifText = mLang === "ru"
              ? `\u2705 <b>\u0427\u0435\u043B\u043B\u0435\u043D\u0434\u0436 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D!</b>\n\n\u{1F3C6} \u0423\u0441\u043F\u0435\u0448\u043D\u043E: <b>\u00AB${ch.title}\u00BB</b>\n\u{1F4CA} ${result.doneDays}/${ch.durationDays} \u0434\u043D\u0435\u0439${result.depositReturned && ch.depositAmount > 0 ? `\n\u{1F4B0} \u0414\u0435\u043F\u043E\u0437\u0438\u0442 ${ch.depositAmount} ${ch.currency === "stars" ? "\u2B50" : "TON"} \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0451\u043D!` : ""}`
              : `\u2705 <b>Challenge Complete!</b>\n\n\u{1F3C6} You passed <b>\u201C${ch.title}\u201D</b>!\n\u{1F4CA} ${result.doneDays}/${ch.durationDays} days${result.depositReturned && ch.depositAmount > 0 ? `\n\u{1F4B0} Deposit ${ch.depositAmount} ${ch.currency === "stars" ? "\u2B50" : "TON"} returned!` : ""}`;
          } else {
            notifText = mLang === "ru"
              ? `\u274C <b>\u0427\u0435\u043B\u043B\u0435\u043D\u0434\u0436 \u043D\u0435 \u043F\u0440\u043E\u0439\u0434\u0435\u043D</b>\n\n<b>\u00AB${ch.title}\u00BB</b> \u2014 ${result.doneDays}/${ch.durationDays} (\u043D\u0443\u0436\u043D\u043E \u226580%)${result.penaltyAmount > 0 ? `\n\u{1F6A8} \u0421\u043F\u0438\u0441\u0430\u043D\u043E: ${result.penaltyAmount} ${ch.currency === "stars" ? "\u2B50" : "TON"}` : ""}\n\u{1F4AA} \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439 \u0441\u043D\u043E\u0432\u0430!`
              : `\u274C <b>Challenge Not Passed</b>\n\n<b>\u201C${ch.title}\u201D</b> \u2014 ${result.doneDays}/${ch.durationDays} (need \u226580%)${result.penaltyAmount > 0 ? `\n\u{1F6A8} Forfeited: ${result.penaltyAmount} ${ch.currency === "stars" ? "\u2B50" : "TON"}` : ""}\n\u{1F4AA} Try again!`;
          }
          await sendMessage(tgId, notifText);
        }
      } catch (notifErr) {
        console.log("[Challenge Settle] Notification error:", notifErr);
      }
    })();

    const updatedMembers = await kv.getByPrefix(`become:ch_member:${challengeId}:`);
    const isMember = (updatedMembers || []).some((m: any) => m.userId === auth.userId);

    return c.json({
      ...ch,
      members: updatedMembers || [],
      isMember,
      memberCount: (updatedMembers || []).filter((m: any) => m.status !== "left").length,
      settlementResults: results,
    });
  } catch (err) {
    console.log("POST /challenges/:id/settle error:", err);
    return c.json({ message: `Error settling challenge: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// =============================================
// TRANSACTION LOG HELPER
// =============================================
type TxType =
  | "deposit_freeze"
  | "deposit_return"
  | "deposit_penalty"
  | "pool_bonus"
  | "topup_stars"
  | "topup_ton"
  | "subscription"
  | "leave_penalty";

interface TxRecord {
  id: string;
  userId: string;
  type: TxType;
  amount: number;
  currency: "stars" | "ton";
  challengeId?: string;
  challengeTitle?: string;
  description?: string;
  createdAt: string;
}

async function logTransaction(
  userId: string,
  type: TxType,
  amount: number,
  currency: "stars" | "ton",
  opts?: { challengeId?: string; challengeTitle?: string; description?: string }
): Promise<TxRecord> {
  const txId = generateId("tx");
  const tx: TxRecord = {
    id: txId,
    userId,
    type,
    amount,
    currency,
    challengeId: opts?.challengeId,
    challengeTitle: opts?.challengeTitle,
    description: opts?.description,
    createdAt: new Date().toISOString(),
  };
  await kv.set(`become:tx:${txId}`, tx);
  const txList: string[] = (await kv.get(`become:txs:${userId}`)) || [];
  txList.push(txId);
  if (txList.length > 200) txList.splice(0, txList.length - 200);
  await kv.set(`become:txs:${userId}`, txList);
  console.log(`[TX] ${type} ${amount} ${currency} for user ${userId}${opts?.challengeId ? ` ch:${opts.challengeId}` : ""}`);
  return tx;
}

// ---- GET /wallet ----
app.get(`${PREFIX}/wallet`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) {
      return c.json(
        { message: "Unauthorized", code: "UNAUTHORIZED", status: 401 },
        401
      );
    }

    let wallet = await kv.get(`become:wallet:${auth.userId}`);
    if (!wallet) {
      wallet = {
        id: generateId("wallet"),
        userId: auth.userId,
        starsBalance: 0,
        tonBalance: 0,
        starsReserved: 0,
        tonReserved: 0,
      };
      await kv.set(`become:wallet:${auth.userId}`, wallet);
    }
    // Ensure reserved fields exist (migration for old wallets)
    if (wallet.starsReserved === undefined) wallet.starsReserved = 0;
    if (wallet.tonReserved === undefined) wallet.tonReserved = 0;

    return c.json(wallet);
  } catch (err) {
    console.log("GET /wallet error:", err);
    return c.json(
      { message: `Error fetching wallet: ${err}`, code: "INTERNAL_ERROR", status: 500 },
      500
    );
  }
});

// ---- GET /wallet/payments ----
// Returns payment history for the current user
app.get(`${PREFIX}/wallet/payments`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const paymentIds: string[] = await kv.get(`become:payments:${auth.userId}`) || [];
    if (paymentIds.length === 0) {
      return c.json({ payments: [] });
    }

    // Fetch all payment records
    const keys = paymentIds.map((id: string) => `become:payment:${id}`);
    const payments = await kv.mget(keys);
    const validPayments = payments
      .filter((p: any) => p && p.id)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return c.json({ payments: validPayments });
  } catch (err) {
    console.log("GET /wallet/payments error:", err);
    return c.json({ message: `Error fetching payment history: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /wallet/transactions ----
// Returns unified transaction log (deposits, penalties, pool bonuses, etc.)
app.get(`${PREFIX}/wallet/transactions`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const txIds: string[] = (await kv.get(`become:txs:${auth.userId}`)) || [];
    if (txIds.length === 0) {
      return c.json({ transactions: [] });
    }

    const keys = txIds.map((id: string) => `become:tx:${id}`);
    const txs = await kv.mget(keys);
    const valid = txs
      .filter((t: any) => t && t.id)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return c.json({ transactions: valid });
  } catch (err) {
    console.log("GET /wallet/transactions error:", err);
    return c.json({ message: `Error fetching transactions: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /bonuses ----
app.get(`${PREFIX}/bonuses`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const user = await kv.get(`become:user:${auth.userId}`);
    if (!user) return c.json({ message: "User not found", code: "NOT_FOUND", status: 404 }, 404);

    // Safety-net: ensure referral code exists (migration for users who logged in before this feature)
    if (!user.referralCode) {
      user.referralCode = generateId("ref").replace("ref_", "").slice(0, 10);
      await kv.set(`become:referral:${user.referralCode}`, auth.userId);
      if (user.referralCount === undefined) user.referralCount = 0;
      // SECURITY: Never auto-grant subscription. Users without it stay on free plan.
      user.updatedAt = new Date().toISOString();
      await kv.set(`become:user:${auth.userId}`, user);
      console.log(`[Bonuses] Migrated referral code for user ${auth.userId}: ${user.referralCode}`);
    }

    // Social follow statuses
    const tgClaimed = !!(await kv.get(`become:bonus:social:${auth.userId}:telegram`));
    const igClaimed = !!(await kv.get(`become:bonus:social:${auth.userId}:instagram`));

    const now = Date.now();
    const subExpires = user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt).getTime() : 0;
    const daysLeft = Math.max(0, Math.ceil((subExpires - now) / (24 * 60 * 60 * 1000)));
    const isActive = subExpires > now;

    // Count how many times referral reward was already given (each 10 friends)
    const referralRewardsGiven = await kv.get(`become:bonus:ref_rewards:${auth.userId}`) || 0;

    return c.json({
      subscription: {
        isActive,
        expiresAt: user.subscriptionExpiresAt || null,
        daysLeft,
      },
      social: {
        telegram: { claimed: tgClaimed },
        instagram: { claimed: igClaimed },
      },
      referral: {
        code: user.referralCode || null,
        count: user.referralCount || 0,
        rewardsGiven: referralRewardsGiven,
        nextRewardAt: ((referralRewardsGiven + 1) * 10),
      },
    });
  } catch (err) {
    console.log("GET /bonuses error:", err);
    return c.json({ message: `Error fetching bonuses: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /bonuses/social-claim ----
app.post(`${PREFIX}/bonuses/social-claim`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const { platform } = await c.req.json();
    if (!platform || !["telegram", "instagram"].includes(platform)) {
      return c.json({ message: "Invalid platform", code: "BAD_REQUEST", status: 400 }, 400);
    }

    // Check if already claimed
    const alreadyClaimed = await kv.get(`become:bonus:social:${auth.userId}:${platform}`);
    if (alreadyClaimed) {
      return c.json({ message: "Already claimed", code: "ALREADY_CLAIMED", status: 409 }, 409);
    }

    // Mark as claimed
    await kv.set(`become:bonus:social:${auth.userId}:${platform}`, { claimedAt: new Date().toISOString() });

    // Add 7 days to subscription
    const user = await kv.get(`become:user:${auth.userId}`);
    if (user) {
      const currentExpiry = user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt).getTime() : Date.now();
      const base = Math.max(currentExpiry, Date.now());
      user.subscriptionExpiresAt = new Date(base + 7 * 24 * 60 * 60 * 1000).toISOString();
      user.updatedAt = new Date().toISOString();
      await kv.set(`become:user:${auth.userId}`, user);
    }

    console.log(`[Bonuses] Social claim: user=${auth.userId}, platform=${platform}`);
    return c.json({ success: true, newExpiresAt: user?.subscriptionExpiresAt });
  } catch (err) {
    console.log("POST /bonuses/social-claim error:", err);
    return c.json({ message: `Error claiming social bonus: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /bonuses/referral-check ----
// Called when a referred user registers. The start_param is parsed in auth.
app.post(`${PREFIX}/bonuses/referral-register`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const { referralCode } = await c.req.json();
    if (!referralCode) return c.json({ message: "No referral code", code: "BAD_REQUEST", status: 400 }, 400);

    // Check if this user already used a referral
    const user = await kv.get(`become:user:${auth.userId}`);
    if (!user) return c.json({ message: "User not found", code: "NOT_FOUND", status: 404 }, 404);
    if (user.referredBy) return c.json({ message: "Already referred", code: "ALREADY_REFERRED", status: 409 }, 409);

    // Resolve referrer
    const referrerUserId = await kv.get(`become:referral:${referralCode}`);
    if (!referrerUserId) return c.json({ message: "Invalid referral code", code: "NOT_FOUND", status: 404 }, 404);
    if (referrerUserId === auth.userId) return c.json({ message: "Cannot refer yourself", code: "BAD_REQUEST", status: 400 }, 400);

    // Update referred user
    user.referredBy = referrerUserId;
    user.updatedAt = new Date().toISOString();
    await kv.set(`become:user:${auth.userId}`, user);

    // Increment referrer's count
    const referrer = await kv.get(`become:user:${referrerUserId}`);
    if (referrer) {
      referrer.referralCount = (referrer.referralCount || 0) + 1;
      referrer.updatedAt = new Date().toISOString();

      // Check if referrer reached a new milestone (every 10 referrals)
      const prevRewards = await kv.get(`become:bonus:ref_rewards:${referrerUserId}`) || 0;
      const newMilestones = Math.floor(referrer.referralCount / 10);
      if (newMilestones > prevRewards) {
        // Grant +30 days for each new milestone
        const bonusDays = (newMilestones - prevRewards) * 30;
        const currentExpiry = referrer.subscriptionExpiresAt ? new Date(referrer.subscriptionExpiresAt).getTime() : Date.now();
        const base = Math.max(currentExpiry, Date.now());
        referrer.subscriptionExpiresAt = new Date(base + bonusDays * 24 * 60 * 60 * 1000).toISOString();
        await kv.set(`become:bonus:ref_rewards:${referrerUserId}`, newMilestones);
        console.log(`[Bonuses] Referral milestone! user=${referrerUserId}, count=${referrer.referralCount}, +${bonusDays} days`);
      }

      await kv.set(`become:user:${referrerUserId}`, referrer);
    }

    // Log the referral
    await kv.set(`become:referral:log:${auth.userId}`, { referrerId: referrerUserId, registeredAt: new Date().toISOString() });

    // Add to referrer's invited list for listing
    const invitedKey = `become:referral:invited:${referrerUserId}`;
    const existingInvited: any[] = (await kv.get(invitedKey)) || [];
    existingInvited.push({
      userId: auth.userId,
      firstName: user.firstName || "User",
      username: user.username || null,
      joinedAt: new Date().toISOString(),
      isSubscribed: false,
      bonusDaysGranted: 0,
    });
    await kv.set(invitedKey, existingInvited);

    // Fire-and-forget: notify referrer about the new join
    notifyReferrerNewJoin(referrerUserId, user.firstName || "A friend").catch(() => {});

    console.log(`[Bonuses] Referral registered: new_user=${auth.userId}, referrer=${referrerUserId}`);
    return c.json({ success: true, referrerUserId });
  } catch (err) {
    console.log("POST /bonuses/referral-register error:", err);
    return c.json({ message: `Error registering referral: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /referrals ----
// Returns the current user's referral info: code, invited users, bonus days
app.get(`${PREFIX}/referrals`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const user = await kv.get(`become:user:${auth.userId}`);
    if (!user) return c.json({ message: "User not found", code: "NOT_FOUND", status: 404 }, 404);

    // Ensure referral code
    if (!user.referralCode) {
      user.referralCode = generateId("ref").replace("ref_", "").slice(0, 10);
      await kv.set(`become:referral:${user.referralCode}`, auth.userId);
      if (user.referralCount === undefined) user.referralCount = 0;
      user.updatedAt = new Date().toISOString();
      await kv.set(`become:user:${auth.userId}`, user);
    }

    // Get invited users list
    const invitedKey = `become:referral:invited:${auth.userId}`;
    const invited: any[] = (await kv.get(invitedKey)) || [];

    // Calculate total bonus days earned
    const totalBonusDays = invited.reduce((sum: number, inv: any) => sum + (inv.bonusDaysGranted || 0), 0);

    return c.json({
      referral_code: user.referralCode,
      referral_count: user.referralCount || 0,
      bonus_days_earned: totalBonusDays,
      invited_users: invited.map((inv: any) => ({
        user_id: inv.userId,
        first_name: inv.firstName || "User",
        username: inv.username || null,
        joined_at: inv.joinedAt,
        is_subscribed: inv.isSubscribed || false,
        bonus_days_granted: inv.bonusDaysGranted || 0,
      })),
    });
  } catch (err) {
    console.log("GET /referrals error:", err);
    return c.json({ message: `Error fetching referrals: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /referrals/grant-bonus ----
// When an invited user subscribes, grant bonus premium days to referrer.
// Body: { invited_user_id: string }
app.post(`${PREFIX}/referrals/grant-bonus`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const { invited_user_id } = await c.req.json();
    if (!invited_user_id) return c.json({ message: "invited_user_id required", code: "BAD_REQUEST", status: 400 }, 400);

    // Find the referral log for this invited user
    const refLog = await kv.get(`become:referral:log:${invited_user_id}`);
    if (!refLog || refLog.referrerId !== auth.userId) {
      return c.json({ message: "No referral relationship found", code: "NOT_FOUND", status: 404 }, 404);
    }

    // Check if bonus already granted for this user
    const invitedKey = `become:referral:invited:${auth.userId}`;
    const invited: any[] = (await kv.get(invitedKey)) || [];
    const invEntry = invited.find((inv: any) => inv.userId === invited_user_id);

    if (invEntry && invEntry.bonusDaysGranted > 0) {
      return c.json({ message: "Bonus already granted for this user", code: "ALREADY_GRANTED", status: 409 }, 409);
    }

    // Grant 7 bonus premium days to the referrer
    const BONUS_DAYS = 7;
    const referrer = await kv.get(`become:user:${auth.userId}`);
    if (!referrer) return c.json({ message: "Referrer not found", code: "NOT_FOUND", status: 404 }, 404);

    const currentExpiry = referrer.subscriptionExpiresAt ? new Date(referrer.subscriptionExpiresAt).getTime() : Date.now();
    const base = Math.max(currentExpiry, Date.now());
    referrer.subscriptionExpiresAt = new Date(base + BONUS_DAYS * 24 * 60 * 60 * 1000).toISOString();
    referrer.updatedAt = new Date().toISOString();
    await kv.set(`become:user:${auth.userId}`, referrer);

    // Update invited entry
    if (invEntry) {
      invEntry.isSubscribed = true;
      invEntry.bonusDaysGranted = BONUS_DAYS;
      await kv.set(invitedKey, invited);
    }

    console.log(`[Referral] Bonus granted: referrer=${auth.userId}, invited=${invited_user_id}, +${BONUS_DAYS} days`);
    return c.json({ success: true, bonus_days: BONUS_DAYS });
  } catch (err) {
    console.log("POST /referrals/grant-bonus error:", err);
    return c.json({ message: `Error granting bonus: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /referrals/leaderboard ----
// Returns top referrers ranked by referral count + bonus days. Public (no auth required).
app.get(`${PREFIX}/referrals/leaderboard`, async (c) => {
  try {
    // Get all users via tg mappings
    const tgMappings = await kv.getByPrefix("become:user:tg:");
    if (!tgMappings || tgMappings.length === 0) {
      return c.json({ leaderboard: [], total_referrers: 0 });
    }

    // Collect user IDs
    const userIds: string[] = tgMappings
      .map((item: any) => typeof item === "string" ? item : (item?.value || item))
      .filter((id: any) => id && typeof id === "string");

    // Fetch users in batches and filter those with referrals
    const referrers: Array<{
      user_id: string;
      first_name: string;
      username: string | null;
      referral_count: number;
      bonus_days_earned: number;
      rank: number;
    }> = [];

    for (const uid of userIds) {
      try {
        const u = await kv.get(`become:user:${uid}`);
        if (u && (u.referralCount || 0) > 0) {
          // Calculate bonus days from invited list
          const invited: any[] = (await kv.get(`become:referral:invited:${uid}`)) || [];
          const bonusDays = invited.reduce((sum: number, inv: any) => sum + (inv.bonusDaysGranted || 0), 0);

          referrers.push({
            user_id: uid,
            first_name: u.firstName || "User",
            username: u.username || null,
            referral_count: u.referralCount || 0,
            bonus_days_earned: bonusDays,
            rank: 0,
          });
        }
      } catch (_) { /* skip */ }
    }

    // Sort by referral count descending, then by bonus days
    referrers.sort((a, b) => {
      if (b.referral_count !== a.referral_count) return b.referral_count - a.referral_count;
      return b.bonus_days_earned - a.bonus_days_earned;
    });

    // Assign ranks and limit to top 50
    const top = referrers.slice(0, 50);
    top.forEach((r, i) => { r.rank = i + 1; });

    // Find requesting user's rank if authenticated
    let my_rank: number | null = null;
    let my_stats: typeof referrers[0] | null = null;
    try {
      const auth = await resolveUser(c);
      if (auth) {
        const idx = referrers.findIndex(r => r.user_id === auth.userId);
        if (idx >= 0) {
          my_rank = idx + 1;
          my_stats = { ...referrers[idx], rank: my_rank };
        }
      }
    } catch (_) { /* no auth, that's fine */ }

    return c.json({
      leaderboard: top,
      total_referrers: referrers.length,
      my_rank,
      my_stats,
    });
  } catch (err) {
    console.log("GET /referrals/leaderboard error:", err);
    return c.json({ message: `Error fetching leaderboard: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- Rate limit config ----
const COACH_RATE_LIMIT = 10; // max requests per window
const COACH_RATE_WINDOW = 60 * 60 * 1000; // 1 hour in ms

// ---- POST /ai/coach ----
app.post(`${PREFIX}/ai/coach`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) {
      return c.json(
        { message: "Unauthorized", code: "UNAUTHORIZED", status: 401 },
        401
      );
    }

    const body = await c.req.json();
    const { dayNumber, userTone, userGoal, reflectionText, completionStatus } = body;

    if (!dayNumber || !userTone || !completionStatus) {
      return c.json(
        { message: "Missing required fields: dayNumber, userTone, completionStatus", code: "BAD_REQUEST", status: 400 },
        400
      );
    }

    // ---- Rate limiting ----
    const rateLimitKey = `become:rate:coach:${auth.userId}`;
    const rateData = await kv.get(rateLimitKey);
    const now = Date.now();

    if (rateData) {
      const windowStart = rateData.windowStart || 0;
      const count = rateData.count || 0;

      if (now - windowStart < COACH_RATE_WINDOW) {
        if (count >= COACH_RATE_LIMIT) {
          const retryAfter = Math.ceil((COACH_RATE_WINDOW - (now - windowStart)) / 1000);
          console.log(`[AI Coach] Rate limited user ${auth.userId}: ${count}/${COACH_RATE_LIMIT}`);
          return c.json(
            {
              message: `Too many requests. Try again in ${Math.ceil(retryAfter / 60)} minutes.`,
              code: "RATE_LIMITED",
              status: 429,
              retryAfterSeconds: retryAfter,
            },
            429
          );
        }
        await kv.set(rateLimitKey, { windowStart, count: count + 1 });
      } else {
        // Window expired — start a new one
        await kv.set(rateLimitKey, { windowStart: now, count: 1 });
      }
    } else {
      await kv.set(rateLimitKey, { windowStart: now, count: 1 });
    }

    // ---- Check if response already cached ----
    const cacheKey = `become:coach:${auth.userId}:${dayNumber}:${completionStatus}`;
    const cached = await kv.get(cacheKey);
    if (cached && cached.shortMessage) {
      console.log(`[AI Coach] Returning cached response for user ${auth.userId}, day ${dayNumber}`);
      return c.json({ ...cached, cached: true });
    }

    // Get user language
    const user = await kv.get(`become:user:${auth.userId}`);
    const language = user?.language || "en";

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      console.log("OPENAI_API_KEY not set — returning fallback coach response");
      const fallback = {
        shortMessage: completionStatus === "done"
          ? "Great work completing this day. Consistency builds momentum."
          : "Taking a break is honest. Come back when you're ready.",
        nextStep: "Review tomorrow's tasks tonight so you start the day with clarity.",
        reframe: completionStatus === "skip"
          ? "A skipped day isn't failure — it's data about what you need right now."
          : undefined,
      };
      // Cache fallback too
      await kv.set(cacheKey, { ...fallback, createdAt: new Date().toISOString() });
      return c.json(fallback);
    }

    // Build tone description
    const toneMap: Record<string, string> = {
      support: "Warm, encouraging, empathetic. Celebrate small wins. Never shame or guilt-trip.",
      strict: "Direct, honest, no sugarcoating. Hold the user accountable but with respect. Never shame or humiliate.",
      hybrid: "Balanced — acknowledge feelings, then push gently toward action. Honest but kind.",
    };
    const toneDesc = toneMap[userTone] || toneMap.support;

    // Language instruction
    const langInstruction = language === "en"
      ? "Respond in English."
      : `Respond in the language with code "${language}". All output must be in that language.`;

    const systemPrompt = `You are an AI coach for a nutrition & fitness tracker app called Proper Food. Your role is to give brief, practical coaching after the user completes or skips a daily task set.

RULES:
- ${langInstruction}
- Tone: ${toneDesc}
- Keep "shortMessage" to 2-4 sentences maximum.
- "nextStep" must be ONE specific, actionable thing the user can do next.
- "reframe" is optional — only include it if the user skipped the day or seems to struggle. It should reframe the situation constructively.
- NEVER use esoteric language, astrology, or pseudoscience.
- NEVER manipulate, guilt-trip, or shame the user.
- NEVER use toxic positivity. Be genuine.
- Focus on practical psychology: habits, identity, small wins, self-compassion.

Respond ONLY with valid JSON in this exact format:
{
  "shortMessage": "...",
  "nextStep": "...",
  "reframe": "..." // or omit this field
}`;

    const userMessage = `Day ${dayNumber} of 7.
Status: ${completionStatus === "done" ? "Completed all tasks" : "Skipped this day"}.
${userGoal ? `User's goal: ${userGoal}` : "No specific goal set."}
${reflectionText ? `User's reflection: "${reflectionText}"` : "No reflection provided."}`;

    console.log(`[AI Coach] Calling OpenAI for user ${auth.userId}, day ${dayNumber}, status ${completionStatus}`);

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.log(`[AI Coach] OpenAI API error ${openaiRes.status}: ${errText}`);
      return c.json(
        { message: `AI service error: ${openaiRes.status}`, code: "AI_ERROR", status: 502 },
        502
      );
    }

    const openaiData = await openaiRes.json();
    const content = openaiData.choices?.[0]?.message?.content;

    if (!content) {
      console.log("[AI Coach] Empty response from OpenAI");
      return c.json(
        { message: "AI returned empty response", code: "AI_EMPTY", status: 502 },
        502
      );
    }

    // Parse the JSON response from GPT
    let parsed;
    try {
      // Strip markdown code fences if present
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.log("[AI Coach] Failed to parse AI response:", content);
      // Fallback: use the raw text as shortMessage
      parsed = {
        shortMessage: content.slice(0, 300),
        nextStep: "Take one small step toward your goal today.",
      };
    }

    const coachResponse = {
      shortMessage: parsed.shortMessage || "Keep going.",
      nextStep: parsed.nextStep || "Focus on your next task.",
      reframe: parsed.reframe || undefined,
    };

    // Persist coach response in KV for future retrieval
    await kv.set(cacheKey, {
      ...coachResponse,
      dayNumber,
      completionStatus,
      userTone,
      createdAt: new Date().toISOString(),
    });
    console.log(`[AI Coach] Success for user ${auth.userId}, cached at ${cacheKey}`);

    return c.json(coachResponse);
  } catch (err) {
    console.log("POST /ai/coach error:", err);
    return c.json(
      { message: `Error in AI coach: ${err}`, code: "INTERNAL_ERROR", status: 500 },
      500
    );
  }
});

// ---- POST /ai/coach/followup ----
// Follow-up question to the coach after initial response
app.post(`${PREFIX}/ai/coach/followup`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const body = await c.req.json();
    const { dayNumber, userQuestion, previousResponse } = body;
    if (!userQuestion || !previousResponse) {
      return c.json({ message: "userQuestion and previousResponse required", code: "BAD_REQUEST", status: 400 }, 400);
    }

    // Rate limiting (shared with main coach endpoint)
    const rateLimitKey = `become:rate:coach:${auth.userId}`;
    const rateData = await kv.get(rateLimitKey);
    const now = Date.now();
    if (rateData) {
      const windowStart = rateData.windowStart || 0;
      const count = rateData.count || 0;
      if (now - windowStart < COACH_RATE_WINDOW) {
        if (count >= COACH_RATE_LIMIT) {
          const retryAfter = Math.ceil((COACH_RATE_WINDOW - (now - windowStart)) / 1000);
          return c.json({ message: `Too many requests. Try again in ${Math.ceil(retryAfter / 60)} minutes.`, code: "RATE_LIMITED", status: 429, retryAfterSeconds: retryAfter }, 429);
        }
        await kv.set(rateLimitKey, { windowStart, count: count + 1 });
      } else {
        await kv.set(rateLimitKey, { windowStart: now, count: 1 });
      }
    } else {
      await kv.set(rateLimitKey, { windowStart: now, count: 1 });
    }

    const user = await kv.get(`become:user:${auth.userId}`);
    const language = user?.language || "en";
    const tone = user?.tone || "supportive";

    const toneMap: Record<string, string> = {
      supportive: "Warm, encouraging, empathetic.",
      strict: "Direct, honest, no sugarcoating but respectful.",
      hybrid: "Balanced — acknowledge feelings, then push toward action.",
    };
    const toneDesc = toneMap[tone] || toneMap.supportive;
    const langInstruction = language === "en" ? "Respond in English." : `Respond in the language with code "${language}".`;

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return c.json({ shortMessage: "Coach is thinking...", nextStep: "Try again later." });
    }

    const systemPrompt = `You are an AI coach for Proper Food, a nutrition & fitness tracker app. The user just received your coaching and is now asking a follow-up question.

RULES:
- ${langInstruction}
- Tone: ${toneDesc}
- Keep "shortMessage" to 2-4 sentences answering their specific question.
- "nextStep" must be ONE specific, actionable suggestion related to their question.
- Be practical, personal, and concrete.
- NEVER use pseudoscience or manipulate.

Your previous response was:
- Message: "${previousResponse.shortMessage}"
- Next step: "${previousResponse.nextStep}"
${previousResponse.reframe ? `- Reframe: "${previousResponse.reframe}"` : ""}

Respond ONLY with valid JSON:
{
  "shortMessage": "...",
  "nextStep": "...",
  "reframe": "..."
}`;

    const userMessage = `Day ${dayNumber || "?"}. My question: "${userQuestion}"`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.log(`[Coach Followup] OpenAI error ${openaiRes.status}: ${errText}`);
      return c.json({ message: `AI error: ${openaiRes.status}`, code: "AI_ERROR", status: 502 }, 502);
    }

    const data = await openaiRes.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return c.json({ message: "AI empty response", code: "AI_EMPTY", status: 502 }, 502);

    let parsed;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { shortMessage: content.slice(0, 300), nextStep: "Focus on one thing at a time." };
    }

    console.log(`[Coach Followup] Success for user ${auth.userId}, day ${dayNumber}`);
    return c.json({
      shortMessage: parsed.shortMessage || "Let me think...",
      nextStep: parsed.nextStep || "Take one step.",
      reframe: parsed.reframe || undefined,
    });
  } catch (err) {
    console.log("POST /ai/coach/followup error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /ai/coach/history ----
// Retrieve past coach responses for the current user
app.get(`${PREFIX}/ai/coach/history`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) {
      return c.json(
        { message: "Unauthorized", code: "UNAUTHORIZED", status: 401 },
        401
      );
    }

    const cached = await kv.getByPrefix(`become:coach:${auth.userId}:`);
    const sorted = cached
      .filter((r: any) => r.shortMessage)
      .sort((a: any, b: any) => (a.dayNumber || 0) - (b.dayNumber || 0));

    return c.json(sorted);
  } catch (err) {
    console.log("GET /ai/coach/history error:", err);
    return c.json(
      { message: `Error fetching coach history: ${err}`, code: "INTERNAL_ERROR", status: 500 },
      500
    );
  }
});

// =============================================
// AI PLAN BUILDER ROUTES (multi-step, 7/30/100 days)
// =============================================

// Helper: call OpenAI with JSON response
async function callOpenAI(systemPrompt: string, userMessage: string, maxTokens = 6000): Promise<any | null> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }], temperature: 0.75, max_tokens: maxTokens, response_format: { type: "json_object" } }),
    });
    if (!res.ok) { console.log(`[OpenAI] Error ${res.status}: ${await res.text()}`); return null; }
    const data = await res.json();
    const c2 = data.choices?.[0]?.message?.content;
    if (!c2) return null;
    return JSON.parse(c2.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
  } catch (err) { console.log("[OpenAI] Error:", err); return null; }
}

// Helper: get tone personality string
function getToneStr(tone: string, isRu: boolean): string {
  const m: Record<string, Record<string, string>> = {
    supportive: { en: "You are a warm, empathetic coach. Celebrate wins. Encourage gently.", ru: "\u0422\u044B \u0442\u0451\u043F\u043B\u044B\u0439 \u044D\u043C\u043F\u0430\u0442\u0438\u0447\u043D\u044B\u0439 \u043A\u043E\u0443\u0447. \u041F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0430 \u0438 \u043F\u043E\u0437\u0438\u0442\u0438\u0432." },
    strict: { en: "You are a TOUGH drill-sergeant coach. No excuses. Push hard. Sarcastic.", ru: "\u0422\u044B \u0416\u0401\u0421\u0422\u041A\u0418\u0419 \u043A\u043E\u0443\u0447 \u0441 \u043F\u0430\u043B\u043A\u043E\u0439. \u0411\u0435\u0437 \u043E\u043F\u0440\u0430\u0432\u0434\u0430\u043D\u0438\u0439. \u0421\u0430\u0440\u043A\u0430\u0437\u043C." },
    hybrid: { en: "TOUGH LOVE coach. Drill sergeant + therapist. Sarcastic but caring.", ru: "\u041A\u043E\u0443\u0447 \u0441 \u0416\u0401\u0421\u0422\u041A\u041E\u0419 \u041B\u042E\u0411\u041E\u0412\u042C\u042E. \u0421\u0435\u0440\u0436\u0430\u043D\u0442 + \u0442\u0435\u0440\u0430\u043F\u0435\u0432\u0442." },
  };
  return (m[tone] || m.supportive)[isRu ? "ru" : "en"];
}

// Helper: generate full plan for a given duration
async function generateFullPlan(opts: any): Promise<any> {
  const { userText, timePerDay, preferredTime, schedule, dur, isRu, firstName, goal, conversationContext } = opts;
  const langI = isRu ? "\u0412\u0441\u0451 \u043D\u0430 \u0420\u0423\u0421\u0421\u041A\u041E\u041C." : "All in ENGLISH.";
  const tl: Record<string,string> = { morning: isRu?"\u0443\u0442\u0440\u043E":"morning", day: isRu?"\u0434\u0435\u043D\u044C":"afternoon", evening: isRu?"\u0432\u0435\u0447\u0435\u0440":"evening", any: isRu?"\u0433\u0438\u0431\u043A\u043E":"flexible" };
  const prompt = `${opts.toneStr}\n${langI}\n${firstName ? (isRu ? `\u0418\u043C\u044F: ${firstName}.` : `Name: ${firstName}.`) : ""}
${conversationContext ? `CONVERSATION:\n${conversationContext}\n\n` : ""}Build a DETAILED ${dur}-day program. ${timePerDay||20} min/day, preferred: ${tl[preferredTime||"any"]||"flexible"}, schedule: ${schedule||"everyday"}${goal?`, goal: ${goal}`:""}.
Each day: 2-4 tasks with "reminderTime" (HH:MM), "whyItMatters". Each day: "coachMessage", "skipReaction", "doneReaction". Include "coachIntro" and "coachOutro".
${dur===30?"Week 1: foundation. Week 2: habits. Week 3: deepening. Week 4: integration.":""}${dur===100?"Generate first 20 days in detail. Plan = 5 blocks of 20 days.":""}
Return ONLY JSON: {"programTitle":"str","programSubtitle":"str","durationDays":${dur},"goalCategory":"str","coachIntro":"str","coachOutro":"str","days":[{"dayNumber":1,"title":"str","description":"str","coachMessage":"str","skipReaction":"str","doneReaction":"str","tasks":[{"title":"str","description":"str","estimatedMinutes":5,"type":"action|reflection|mindfulness","reminderTime":"08:00","whyItMatters":"str"}],"reflectionPrompt":"str"}]}`;
  const maxTok = dur===7?6000:dur===30?14000:8000;
  let plan = await callOpenAI(prompt, userText.slice(0,2000), maxTok);
  const expDays = dur===100?20:dur;
  if (!plan||!plan.days||plan.days.length<Math.min(expDays,7)) {
    // Fallback
    const mpt=Math.round((timePerDay||20)/3), bt=["08:00","12:00","20:00"];
    const th=isRu?["\u041D\u0430\u043C\u0435\u0440\u0435\u043D\u0438\u0435","\u041E\u0441\u043E\u0437\u043D\u0430\u043D\u043D\u043E\u0441\u0442\u044C","\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435","\u041F\u0440\u0438\u0432\u044B\u0447\u043A\u0438","\u042D\u043D\u0435\u0440\u0433\u0438\u044F","\u0424\u043E\u043A\u0443\u0441","\u0418\u043D\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044F"]:["Intention","Awareness","Action","Habits","Energy","Focus","Integration"];
    const td=dur===100?20:dur;
    plan={ programTitle:isRu?`${dur} \u0434\u043D\u0435\u0439 \u043A \u0446\u0435\u043B\u0438`:`${dur} Days to Goal`, programSubtitle:isRu?"\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u0430":"Personal program", durationDays:dur, goalCategory:goal||"discipline",
      coachIntro:isRu?`${firstName}, \u043F\u043E\u0435\u0445\u0430\u043B\u0438!`:`${firstName}, let's go!`, coachOutro:isRu?`\u0413\u043E\u0440\u0436\u0443\u0441\u044C, ${firstName}!`:`Proud, ${firstName}!`,
      days:Array.from({length:td},(_,i)=>({ dayNumber:i+1, title:th[i%th.length], description:`${isRu?"\u0414\u0435\u043D\u044C":"Day"} ${i+1}`, coachMessage:`${isRu?"\u0414\u0435\u043D\u044C":"Day"} ${i+1}, ${firstName}!`, skipReaction:isRu?"\u041F\u0440\u043E\u043F\u0443\u0441\u0442\u0438\u043B? \u0417\u0430\u0432\u0442\u0440\u0430 \u0431\u0435\u0437 \u043E\u043F\u0440\u0430\u0432\u0434\u0430\u043D\u0438\u0439.":"Skipped? No excuses tomorrow.", doneReaction:isRu?`\u041C\u043E\u043B\u043E\u0434\u0435\u0446, ${firstName}!`:`Great, ${firstName}!`,
        tasks:["08:00","12:00","20:00"].map((rt,j)=>({ title:isRu?["\u0423\u0442\u0440\u043E","\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435","\u0412\u0435\u0447\u0435\u0440"][j]:["Morning","Action","Evening"][j], description:`~${mpt} min`, estimatedMinutes:mpt, type:j===0?"mindfulness":j===2?"reflection":"action", reminderTime:rt, whyItMatters:isRu?"\u041E\u0441\u043D\u043E\u0432\u0430.":"Foundation." })),
        reflectionPrompt:isRu?"\u0427\u0442\u043E \u0437\u0430\u043C\u0435\u0442\u0438\u043B?":"What did you notice?" })),
      ...(dur===100?{generatedUpToDay:20,totalBlocks:5}:{}) };
  }
  if (dur===100) { plan.durationDays=100; plan.generatedUpToDay=plan.days.length; plan.totalBlocks=5; }
  return plan;
}

// ---- POST /ai/plan-step ----
// Unified multi-step: 7d=1 step, 30d=3 steps, 100d=5 steps
app.post(`${PREFIX}/ai/plan-step`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    const body = await c.req.json();
    const user = await kv.get(`become:user:${auth.userId}`);
    const lang = user?.language||"en"; const tone = user?.tone||"supportive";
    const _rawGoal = user?.selectedGoal||""; const goal = _rawGoal.startsWith("custom:") ? _rawGoal.slice(7) : _rawGoal; const firstName = user?.firstName||"";
    const isRu = lang==="ru"; const n = firstName||(isRu?"\u0434\u0440\u0443\u0433":"friend");
    const toneStr = getToneStr(tone, isRu);
    const langInstr = isRu?"\u0412\u0441\u0451 \u043D\u0430 \u0420\u0423\u0421\u0421\u041A\u041E\u041C.":"All in ENGLISH.";

    // STEP 1: New conversation
    if (body.userText) {
      const { userText, timePerDay, preferredTime, schedule, durationDays } = body;
      if (!userText||userText.length<10) return c.json({ message:"userText too short", code:"BAD_REQUEST", status:400 },400);
      const dur = [7,30,100].includes(durationDays)?durationDays:7;
      const totalSteps = dur===7?1:dur===30?3:5;
      const draftId = generateId("draft");

      if (dur===7) {
        const plan = await generateFullPlan({ userText, timePerDay, preferredTime, schedule, dur:7, isRu, toneStr, firstName:n, goal, conversationContext:"" });
        await kv.set(`become:plan_draft:${auth.userId}:${draftId}`, { id:draftId, userId:auth.userId, durationDays:7, plan, inputSummary:userText.slice(0,500), timePerDay, preferredTime, schedule, currentStep:1, totalSteps:1, createdAt:new Date().toISOString() });
        return c.json({ draftId, type:"plan", plan, stepNumber:1, totalSteps:1 });
      }

      // Multi-step: ask clarifying questions
      const qPrompt = `${toneStr}\n${langInstr}\n${firstName?(isRu?`\u0418\u043C\u044F: ${firstName}.`:`Name: ${firstName}.`):""}
The user wants a ${dur}-day program. Ask 3-4 specific clarifying questions to understand them deeply. Dig into: daily routine, what they tried, obstacles, what success looks like.${dur===100?" Also: long-term vision, accountability.":""}
${isRu?"\u0421\u043D\u0430\u0447\u0430\u043B\u0430 2-3 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u043F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u044F \u0447\u0442\u043E \u043F\u043E\u043D\u044F\u043B, \u0437\u0430\u0442\u0435\u043C \u0432\u043E\u043F\u0440\u043E\u0441\u044B.":"First 2-3 sentences showing understanding, then questions."}
Return JSON: {"coachResponse":"string","questions":["q1","q2","q3"]}`;

      const result = await callOpenAI(qPrompt, userText.slice(0,2000));
      const questions = result?.questions||(isRu?["\u041A\u0430\u043A \u0432\u044B\u0433\u043B\u044F\u0434\u0438\u0442 \u0442\u0432\u043E\u0439 \u0434\u0435\u043D\u044C?","\u0427\u0442\u043E \u043F\u0440\u043E\u0431\u043E\u0432\u0430\u043B?","\u041A\u0430\u043A \u0432\u044B\u0433\u043B\u044F\u0434\u0438\u0442 \u0443\u0441\u043F\u0435\u0445?"]:["What's your typical day?","What have you tried?","What does success look like?"]);
      const coachResponse = result?.coachResponse||(isRu?`${n}, \u043F\u043E\u043D\u0438\u043C\u0430\u044E. \u0427\u0442\u043E\u0431\u044B \u0441\u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0442\u043E\u0447\u043D\u044B\u0439 \u043F\u043B\u0430\u043D, \u043D\u0443\u0436\u043D\u043E \u0431\u043E\u043B\u044C\u0448\u0435 \u0438\u043D\u0444\u043E.`:`${n}, got it. Need more info for a precise plan.`);

      await kv.set(`become:plan_draft:${auth.userId}:${draftId}`, { id:draftId, userId:auth.userId, durationDays:dur, inputSummary:userText.slice(0,500), timePerDay, preferredTime, schedule, currentStep:1, totalSteps, conversationHistory:[{role:"user",content:userText.slice(0,2000)},{role:"assistant",content:coachResponse}], questions, createdAt:new Date().toISOString() });
      return c.json({ draftId, type:"questions", coachResponse, questions, stepNumber:1, totalSteps });
    }

    // STEP 2+: Continue conversation
    const { draftId, userResponse } = body;
    if (!draftId||!userResponse) return c.json({ message:"draftId and userResponse required", code:"BAD_REQUEST", status:400 },400);
    const draft = await kv.get(`become:plan_draft:${auth.userId}:${draftId}`);
    if (!draft) return c.json({ message:"Draft not found", code:"NOT_FOUND", status:404 },404);

    const nextStep = (draft.currentStep||1)+1;
    const totalSteps = draft.totalSteps||3;
    const dur = draft.durationDays||30;
    const history = draft.conversationHistory||[];
    history.push({role:"user",content:userResponse.slice(0,2000)});
    const isFinal = nextStep>=totalSteps;

    if (isFinal) {
      const ctx = history.map((h:any)=>`${h.role==="user"?(isRu?"\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C":"User"):(isRu?"\u041A\u043E\u0443\u0447":"Coach")}: ${h.content}`).join("\n\n");
      const plan = await generateFullPlan({ userText:draft.inputSummary, timePerDay:draft.timePerDay, preferredTime:draft.preferredTime, schedule:draft.schedule, dur, isRu, toneStr, firstName:n, goal, conversationContext:ctx });
      draft.plan=plan; draft.currentStep=nextStep; draft.conversationHistory=history;
      await kv.set(`become:plan_draft:${auth.userId}:${draftId}`, draft);
      return c.json({ draftId, type:"plan", plan, stepNumber:nextStep, totalSteps });
    }

    // Intermediate: more questions
    const ctxS = history.map((h:any)=>`${h.role}: ${h.content}`).join("\n");
    const qPrompt = `${toneStr}\n${langInstr}\nStep ${nextStep}/${totalSteps} for ${dur}-day plan.\nConversation:\n${ctxS}\n\nAsk 2-3 MORE SPECIFIC follow-up questions building on what they said. ${isRu?"1-2 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u0447\u0442\u043E \u0443\u0441\u043B\u044B\u0448\u0430\u043B, \u0437\u0430\u0442\u0435\u043C \u0432\u043E\u043F\u0440\u043E\u0441\u044B.":"1-2 sentences showing you heard, then questions."}\nReturn JSON: {"coachResponse":"string","questions":["q1","q2"]}`;

    const result = await callOpenAI(qPrompt, userResponse.slice(0,2000));
    const questions = result?.questions||(isRu?["\u0420\u0430\u0441\u0441\u043A\u0430\u0436\u0438 \u043F\u043E\u0434\u0440\u043E\u0431\u043D\u0435\u0435"]:["Tell me more"]);
    const coachResponse = result?.coachResponse||(isRu?"\u041F\u043E\u043D\u044F\u043B. \u0415\u0449\u0451 \u0432\u043E\u043F\u0440\u043E\u0441\u044B.":"Got it. More questions.");
    history.push({role:"assistant",content:coachResponse});
    draft.currentStep=nextStep; draft.conversationHistory=history; draft.questions=questions;
    await kv.set(`become:plan_draft:${auth.userId}:${draftId}`, draft);
    return c.json({ draftId, type:"questions", coachResponse, questions, stepNumber:nextStep, totalSteps });
  } catch (err) {
    console.log("POST /ai/plan-step error:", err);
    return c.json({ message:`Error: ${err}`, code:"INTERNAL_ERROR", status:500 },500);
  }
});

// ---- GET /ai/plan-drafts ----
// Returns all saved plan drafts (generated but not yet activated)
app.get(`${PREFIX}/ai/plan-drafts`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    const drafts = await kv.getByPrefix(`become:plan_draft:${auth.userId}:`);
    const sorted = (drafts || []).sort((a: any, b: any) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return tb - ta;
    });
    const result = sorted.map((d: any) => ({
      draftId: d.id,
      inputSummary: d.inputSummary || "",
      durationDays: d.durationDays || 7,
      timePerDay: d.timePerDay || 20,
      preferredTime: d.preferredTime || "any",
      schedule: d.schedule || "everyday",
      currentStep: d.currentStep || 1,
      totalSteps: d.totalSteps || 1,
      hasPlan: !!d.plan,
      planTitle: d.plan?.programTitle || null,
      planSubtitle: d.plan?.programSubtitle || null,
      createdAt: d.createdAt || "",
    }));
    return c.json({ drafts: result });
  } catch (err) {
    console.log("GET /ai/plan-drafts error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /ai/plan-drafts/:draftId ----
app.get(`${PREFIX}/ai/plan-drafts/:draftId`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    const draftId = c.req.param("draftId");
    const draft = await kv.get(`become:plan_draft:${auth.userId}:${draftId}`);
    if (!draft) return c.json({ message: "Draft not found", code: "NOT_FOUND", status: 404 }, 404);
    return c.json({ draft });
  } catch (err) {
    console.log("GET /ai/plan-drafts/:draftId error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- DELETE /ai/plan-drafts/:draftId ----
app.delete(`${PREFIX}/ai/plan-drafts/:draftId`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    const draftId = c.req.param("draftId");
    await kv.del(`become:plan_draft:${auth.userId}:${draftId}`);
    console.log(`[Drafts] Deleted draft ${draftId} for user ${auth.userId}`);
    return c.json({ ok: true });
  } catch (err) {
    console.log("DELETE /ai/plan-drafts/:draftId error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /programs/history ----
app.get(`${PREFIX}/programs/history`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message:"Unauthorized", code:"UNAUTHORIZED", status:401 },401);
    const lang = await resolveContentLang(c);
    // Helper: resolve bilingual {en,ru} fields to plain string
    const resolveStr = (field: any): string => {
      if (typeof field === "string") return field;
      if (field && typeof field === "object") return field[lang] || field.en || "";
      return "";
    };
    const genPlans = await kv.getByPrefix(`become:generated_plan:${auth.userId}:`);
    const programs: any[] = [];
    for (const gp of genPlans) {
      const prog = await kv.get(`become:program:${gp.programId}`);
      if (prog) {
        const pl = await kv.getByPrefix(`become:progress:${auth.userId}:${gp.programId}:`);
        programs.push({ ...prog, title: resolveStr(prog.title), subtitle: resolveStr(prog.subtitle), doneDays:pl.filter((p:any)=>p.status==="done").length, totalProgress:pl.length, inputSummary:gp.inputSummary, startedAt:gp.createdAt });
      }
    }
    const seedProg = await kv.get("become:program:prog_7day_focus");
    if (seedProg) {
      const sp = await kv.getByPrefix(`become:progress:${auth.userId}:prog_7day_focus:`);
      programs.unshift({ ...seedProg, title: resolveStr(seedProg.title), subtitle: resolveStr(seedProg.subtitle), doneDays:sp.filter((p:any)=>p.status==="done").length, totalProgress:sp.length, inputSummary:"", startedAt:seedProg.createdAt||"" });
    }
    const user = await kv.get(`become:user:${auth.userId}`);
    return c.json({ programs, activeProgramId:user?.activeProgramId||"prog_7day_focus" });
  } catch (err) {
    console.log("GET /programs/history error:", err);
    return c.json({ message:`Error: ${err}`, code:"INTERNAL_ERROR", status:500 },500);
  }
});

// ---- POST /programs/switch ----
app.post(`${PREFIX}/programs/switch`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message:"Unauthorized", code:"UNAUTHORIZED", status:401 },401);
    const { programId } = await c.req.json();
    if (!programId) return c.json({ message:"programId required", code:"BAD_REQUEST", status:400 },400);
    const prog = await kv.get(`become:program:${programId}`);
    if (!prog) return c.json({ message:"Program not found", code:"NOT_FOUND", status:404 },404);
    const user = await kv.get(`become:user:${auth.userId}`);
    if (user) { user.activeProgramId=programId; user.updatedAt=new Date().toISOString(); await kv.set(`become:user:${auth.userId}`,user); }
    return c.json({ success:true, programId });
  } catch (err) {
    console.log("POST /programs/switch error:", err);
    return c.json({ message:`Error: ${err}`, code:"INTERNAL_ERROR", status:500 },500);
  }
});

// ---- POST /notifications/task-reminder (for cron, with utcOffset) ----
app.post(`${PREFIX}/notifications/task-reminder`, async (c) => {
  try {
    const now = new Date();
    const hh = String(now.getUTCHours()).padStart(2,"0");
    const mm = String(now.getUTCMinutes()).padStart(2,"0");
    const currentHHMM = `${hh}:${mm}`;
    const users = await kv.getByPrefix("become:user:");
    let sent = 0;
    for (const user of (users||[])) {
      if (!user.telegramId||!user.id||!user.activeProgramId) continue;
      try {
        const prefs = await getNotificationPrefs(user.id);
        if (!prefs.enabled || !prefs.dailyReminder) continue;

        const prog = await kv.get(`become:program:${user.activeProgramId}`);
        if (!prog) continue;
        const pl = await kv.getByPrefix(`become:progress:${user.id}:${user.activeProgramId}:`);
        const done = pl.filter((p:any)=>p.status==="done"||p.status==="skip").length;
        if (done>=(prog.durationDays||7)) continue;
        const dayNum = done+1;
        const day = await kv.get(`become:day:${user.activeProgramId}:${dayNum}`);
        if (!day?.tasksJson) continue;

        // Apply user timezone offset
        const userOffset = user.utcOffset || 0;
        const userNow = new Date(now.getTime() + userOffset * 60000);
        const userHH = String(userNow.getUTCHours()).padStart(2,"0");
        const userMM = String(userNow.getUTCMinutes()).padStart(2,"0");
        const userHHMM = `${userHH}:${userMM}`;

        for (const task of day.tasksJson) {
          if (task.reminderTime===userHHMM) {
            const l = user.language||"en";
            const miniAppUrl = getProperMiniAppUrl();
            const text = l==="ru"
              ? `\u23F0 <b>\u041D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u0435:</b> ${task.title}\n${task.description||""}\n\n\uD83D\uDCCB \u0414\u0435\u043D\u044C ${dayNum} \u2022 ~${task.estimatedMinutes||5} \u043C\u0438\u043D`
              : `\u23F0 <b>Reminder:</b> ${task.title}\n${task.description||""}\n\n\uD83D\uDCCB Day ${dayNum} \u2022 ~${task.estimatedMinutes||5} min`;
            const kbd: any[][] = [];
            // Use t.me deep link — reliable even with SSL issues on direct domain
            kbd.push([{ text: l==="ru" ? "\uD83D\uDE80 \u041E\u0442\u043A\u0440\u044B\u0442\u044C" : "\uD83D\uDE80 Open", url: buildTgDeepLink() }]);
            await sendMessage(Number(user.telegramId), text, kbd.length > 0 ? { reply_markup: { inline_keyboard: kbd } } : undefined);
            sent++;
          }
        }
      } catch (ue) { console.log(`[TaskReminder] Error for ${user.id}:`, ue); }
    }
    return c.json({ success:true, sent, checkedTime:currentHHMM });
  } catch (err) {
    console.log("POST /notifications/task-reminder error:", err);
    return c.json({ message:`Error: ${err}`, code:"INTERNAL_ERROR", status:500 },500);
  }
});

// ---- GET /notifications/task-reminder (cron) ----
// Sends per-task reminders when task.reminderTime matches user's local time.
// Secondary granular reminders — see /notifications/daily-digest for the main daily notification.
app.get(`${PREFIX}/notifications/task-reminder`, async (c) => {
  try {
    const now = new Date();
    const hh = String(now.getUTCHours()).padStart(2,"0");
    const mm = String(now.getUTCMinutes()).padStart(2,"0");
    const currentHHMM = `${hh}:${mm}`;

    // Dedup: avoid double-sends within same minute
    const dedupKey = `become:cron:taskreminder:${currentHHMM}`;
    const lastRun = await kv.get(dedupKey);
    if (lastRun) {
      return c.json({ success:true, sent:0, checkedTime:currentHHMM, skipped:"already_ran_this_minute" });
    }
    await kv.set(dedupKey, { ts: now.toISOString() });

    const users = await kv.getByPrefix("become:user:");
    let sent = 0;
    for (const user of (users||[])) {
      if (!user.telegramId||!user.id||!user.activeProgramId) continue;
      try {
        const prefs = await getNotificationPrefs(user.id);
        if (!prefs.enabled || !prefs.dailyReminder) continue;

        const prog = await kv.get(`become:program:${user.activeProgramId}`);
        if (!prog) continue;
        const pl = await kv.getByPrefix(`become:progress:${user.id}:${user.activeProgramId}:`);
        const completedDays = pl.filter((p:any)=>p.status==="done"||p.status==="skip").length;
        if (completedDays>=(prog.durationDays||7)) continue;
        const dayNum = completedDays+1;
        const day = await kv.get(`become:day:${user.activeProgramId}:${dayNum}`);
        if (!day?.tasksJson) continue;

        // Apply user timezone offset (utcOffset in minutes, e.g. 180 for UTC+3)
        const userOffset = user.utcOffset || 0;
        const userNow = new Date(now.getTime() + userOffset * 60000);
        const userHH = String(userNow.getUTCHours()).padStart(2,"0");
        const userMM = String(userNow.getUTCMinutes()).padStart(2,"0");
        const userHHMM = `${userHH}:${userMM}`;

        for (const task of day.tasksJson) {
          if (task.reminderTime === userHHMM) {
            const l = user.language||"en";
            const miniAppUrl = getProperMiniAppUrl();
            const text = l==="ru"
              ? `\u23F0 <b>\u041D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u0435:</b> ${task.title}\n${task.description||""}\n\n\uD83D\uDCCB \u0414\u0435\u043D\u044C ${dayNum} \u2022 ~${task.estimatedMinutes||5} \u043C\u0438\u043D`
              : `\u23F0 <b>Reminder:</b> ${task.title}\n${task.description||""}\n\n\uD83D\uDCCB Day ${dayNum} \u2022 ~${task.estimatedMinutes||5} min`;
            const kbd: any[][] = [];
            // Use t.me deep link — reliable even with SSL issues on direct domain
            kbd.push([{ text: l==="ru" ? "\uD83D\uDE80 \u041E\u0442\u043A\u0440\u044B\u0442\u044C" : "\uD83D\uDE80 Open", url: buildTgDeepLink() }]);
            await sendMessage(Number(user.telegramId), text, kbd.length > 0 ? { reply_markup: { inline_keyboard: kbd } } : undefined);
            sent++;
          }
        }
      } catch (ue) { console.log(`[TaskReminder] Error for ${user.id}:`, ue); }
    }
    console.log(`[Cron] Task reminder check at ${currentHHMM} UTC, sent ${sent} reminders`);
    return c.json({ success:true, sent, checkedTime:currentHHMM });
  } catch (err) {
    console.log("GET /notifications/task-reminder error:", err);
    return c.json({ message:`Error: ${err}`, code:"INTERNAL_ERROR", status:500 },500);
  }
});

// ---- GET /notifications/daily-digest (cron — PRIMARY daily notification) ----
// Sends each user a personalized message with their specific tasks for today,
// progress, streak, XP. Runs every 15 min — checks if it's time to send
// based on user's dailyReminderTime (default "10:00") adjusted for utcOffset.
app.get(`${PREFIX}/notifications/daily-digest`, async (c) => {
  try {
    const now = new Date();
    const nowUTC = now.getTime();

    // Global dedup: prevent cron double-firing within same minute
    const utcMin = `${String(now.getUTCHours()).padStart(2,"0")}:${String(now.getUTCMinutes()).padStart(2,"0")}`;
    const globalDedupKey = `become:cron:digest:${utcMin}`;
    const alreadyRan = await kv.get(globalDedupKey);
    if (alreadyRan) {
      return c.json({ success: true, sent: 0, skipped: "already_ran_this_minute" });
    }
    await kv.set(globalDedupKey, { ts: now.toISOString() });

    const users = await kv.getByPrefix("become:user:");
    let sent = 0;
    let checked = 0;
    const errors: string[] = [];

    for (const user of (users || [])) {
      if (!user.telegramId || !user.id || !user.activeProgramId) continue;
      checked++;

      try {
        // Check notification prefs
        const prefs = await getNotificationPrefs(user.id);
        if (!prefs.enabled || !prefs.dailyReminder) continue;

        // User's preferred digest time (default "10:00")
        const preferredTime = user.dailyReminderTime || "10:00";
        const [prefH, prefM] = preferredTime.split(":").map(Number);
        if (isNaN(prefH) || isNaN(prefM)) continue;

        // Convert user's preferred local time to UTC using their offset
        const userOffset = user.utcOffset || 0; // minutes, e.g. 180 for UTC+3
        // User wants 09:00 local = 09:00 - offset in UTC
        // E.g., 09:00 Moscow (UTC+3, offset=180) = 06:00 UTC
        const prefMinutesUTC = (prefH * 60 + prefM) - userOffset;
        const normalizedPrefUTC = ((prefMinutesUTC % 1440) + 1440) % 1440; // handle negative/wrap

        const currentMinutesUTC = now.getUTCHours() * 60 + now.getUTCMinutes();

        // Check if current UTC time is within ±7 minutes of the target
        // (cron may run every 15 min, so 7 min window catches it once)
        const diff = Math.abs(currentMinutesUTC - normalizedPrefUTC);
        const wrappedDiff = Math.min(diff, 1440 - diff);
        if (wrappedDiff > 7) continue;

        // Per-user dedup: only one digest per day
        const today = now.toISOString().slice(0, 10); // "2026-02-19"
        const userDedupKey = `become:cron:digest:${user.id}:${today}`;
        const alreadySent = await kv.get(userDedupKey);
        if (alreadySent) continue;

        // Load program and day data
        const prog = await kv.get(`become:program:${user.activeProgramId}`);
        if (!prog) continue;

        const pl = await kv.getByPrefix(`become:progress:${user.id}:${user.activeProgramId}:`);
        const completedDays = pl.filter((p: any) => p.status === "done" || p.status === "skip").length;
        if (completedDays >= (prog.durationDays || 7)) continue; // program done
        const dayNum = completedDays + 1;

        const day = await kv.get(`become:day:${user.activeProgramId}:${dayNum}`);
        if (!day?.tasksJson || day.tasksJson.length === 0) continue;

        // Compute streak
        const doneEntries = pl
          .filter((p: any) => p.status === "done")
          .sort((a: any, b: any) => b.dayNumber - a.dayNumber);
        let streak = 0;
        if (doneEntries.length > 0) {
          for (let i = 0; i < doneEntries.length; i++) {
            if (doneEntries[i].dayNumber === doneEntries[0].dayNumber - i) streak++;
            else break;
          }
        }

        // Build task list for the digest
        const tasks = day.tasksJson.map((t: any) => ({
          emoji: t.emoji || (t.type === "mindfulness" ? "\u{1F9D8}" : t.type === "reflection" ? "\u{270D}\uFE0F" : "\u{1F3AF}"),
          title: t.title,
          description: t.description,
          estimatedMinutes: t.estimatedMinutes,
          type: t.type,
        }));

        // Load strategic goals for this user to include in digest
        let sgDigestData: Array<{ title: string; dueTasks: number; totalTasks: number; completedTasks: number }> | undefined;
        try {
          const sGoals = await kv.getByPrefix(`become:sgoal:${user.id}:`);
          const activeGoals = sGoals.filter((g: any) => g.status === "active");
          if (activeGoals.length > 0) {
            const sTasks = await kv.getByPrefix(`become:stask:${user.id}:`);
            sgDigestData = activeGoals.map((g: any) => {
              const gTasks = sTasks.filter((t: any) => t.goalId === g.id);
              const dueTasks = gTasks.filter((t: any) => t.nextDueDate && t.nextDueDate <= today).length;
              const completedTasks = gTasks.filter((t: any) => t.completedCount > 0).length;
              return { title: g.title, dueTasks, totalTasks: gTasks.length, completedTasks };
            });
          }
        } catch (sgErr) { console.log(`[DailyDigest] Error loading strategic goals for ${user.id}:`, sgErr); }

        // Send personalized digest
        await notifyDailyDigest(user.id, Number(user.telegramId), {
          firstName: user.firstName || user.first_name || "Friend",
          dayNumber: dayNum,
          totalDays: prog.durationDays || 7,
          dayTitle: day.title || `Day ${dayNum}`,
          programTitle: prog.title || "Your Program",
          tasks,
          streak,
          xp: user.xp || 0,
          strategicGoals: sgDigestData,
        });

        // Mark as sent for today
        await kv.set(userDedupKey, { sentAt: now.toISOString() });
        sent++;
      } catch (ue) {
        const errMsg = `[DailyDigest] Error for user ${user.id}: ${ue}`;
        console.log(errMsg);
        errors.push(errMsg);
      }
    }

    console.log(`[Cron] Daily digest at ${utcMin} UTC — checked ${checked} users, sent ${sent} digests`);
    return c.json({ success: true, sent, checked, utcMinute: utcMin, errors: errors.length > 0 ? errors : undefined });
  } catch (err) {
    console.log("GET /notifications/daily-digest error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /maintenance/cleanup-drafts (cron-compatible) ----
// Removes plan drafts older than 30 days across all users
app.get(`${PREFIX}/maintenance/cleanup-drafts`, async (c) => {
  try {
    const allDrafts = await kv.getByPrefix("become:plan_draft:");
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days
    const toDelete: string[] = [];
    for (const d of allDrafts) {
      const created = new Date(d.createdAt || 0).getTime();
      if (created < cutoff && d.userId && d.id) {
        toDelete.push(`become:plan_draft:${d.userId}:${d.id}`);
      }
    }
    if (toDelete.length > 0) {
      await kv.mdel(toDelete);
    }
    console.log(`[Cron] Cleaned up ${toDelete.length} stale drafts (>30d)`);
    return c.json({ success: true, deleted: toDelete.length });
  } catch (err) {
    console.log("GET /maintenance/cleanup-drafts error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- PUT /days/:programId/:dayNumber/task-reminder ----
// Update reminderTime for a specific task within a day
app.put(`${PREFIX}/days/:programId/:dayNumber/task-reminder`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message:"Unauthorized", code:"UNAUTHORIZED", status:401 },401);
    const programId = c.req.param("programId");
    const dayNumber = parseInt(c.req.param("dayNumber"),10);
    const { taskId, reminderTime } = await c.req.json();
    if (!taskId) return c.json({ message:"taskId required", code:"BAD_REQUEST", status:400 },400);
    if (reminderTime && !/^\d{2}:\d{2}$/.test(reminderTime)) {
      return c.json({ message:"Invalid reminderTime format (HH:MM)", code:"BAD_REQUEST", status:400 },400);
    }
    const day = await kv.get(`become:day:${programId}:${dayNumber}`);
    if (!day) return c.json({ message:"Day not found", code:"NOT_FOUND", status:404 },404);
    const tasks = day.tasksJson || [];
    let found = false;
    for (const task of tasks) {
      if (task.id === taskId) { task.reminderTime = reminderTime || null; found = true; break; }
    }
    if (!found) return c.json({ message:"Task not found", code:"NOT_FOUND", status:404 },404);
    day.tasksJson = tasks;
    await kv.set(`become:day:${programId}:${dayNumber}`, day);
    console.log(`[TaskReminder] Updated task ${taskId} in day ${dayNumber} to ${reminderTime||"disabled"}`);
    return c.json({ success:true, taskId, reminderTime: reminderTime||null });
  } catch (err) {
    console.log("PUT /days/task-reminder error:", err);
    return c.json({ message:`Error: ${err}`, code:"INTERNAL_ERROR", status:500 },500);
  }
});

// ---- POST /ai/generate-next-block ----
// Lazy generation: next 20-day block for 100-day plans
app.post(`${PREFIX}/ai/generate-next-block`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message:"Unauthorized", code:"UNAUTHORIZED", status:401 },401);
    const { programId } = await c.req.json();
    if (!programId) return c.json({ message:"programId required", code:"BAD_REQUEST", status:400 },400);
    const prog = await kv.get(`become:program:${programId}`);
    if (!prog) return c.json({ message:"Program not found", code:"NOT_FOUND", status:404 },404);
    if ((prog.durationDays||7)<100) return c.json({ message:"Not a 100-day plan", code:"BAD_REQUEST", status:400 },400);

    const existingDays = await kv.getByPrefix(`become:day:${programId}:`);
    const existingNums = existingDays.map((d:any)=>d.dayNumber).sort((a:number,b:number)=>a-b);
    const maxDay = existingNums.length>0 ? Math.max(...existingNums) : 0;
    const nextStart = maxDay+1;
    const nextEnd = Math.min(maxDay+20, 100);
    if (nextStart>100) return c.json({ success:true, message:"All blocks generated", alreadyComplete:true });

    const blockNum = Math.ceil(nextStart/20);
    const user = await kv.get(`become:user:${auth.userId}`);
    const lang = user?.language||"en"; const tone = user?.tone||"supportive";
    const firstName = user?.firstName||""; const isRu = lang==="ru";
    const toneStr = getToneStr(tone, isRu);
    const n = firstName||(isRu?"\u0434\u0440\u0443\u0433":"friend");
    const langI = isRu?"\u0412\u0441\u0451 \u043D\u0430 \u0420\u0423\u0421\u0421\u041A\u041E\u041C.":"All in ENGLISH.";
    const blockNames = isRu?["\u0424\u0443\u043D\u0434\u0430\u043C\u0435\u043D\u0442","\u041D\u0430\u0431\u043E\u0440 \u043E\u0431\u043E\u0440\u043E\u0442\u043E\u0432","\u0420\u043E\u0441\u0442","\u041C\u0430\u0441\u0442\u0435\u0440\u0441\u0442\u0432\u043E","\u0418\u043D\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044F"]:["Foundation","Momentum","Growth","Mastery","Integration"];

    // Get conversation context from original draft
    let convCtx = "";
    const genPlans = await kv.getByPrefix(`become:generated_plan:${auth.userId}:`);
    const thisPlan = genPlans.find((g:any)=>g.programId===programId);
    if (thisPlan?.draftId) {
      const draft = await kv.get(`become:plan_draft:${auth.userId}:${thisPlan.draftId}`);
      if (draft?.conversationHistory) convCtx = draft.conversationHistory.map((h:any)=>`${h.role}: ${h.content}`).join("\n");
    }
    const lastDays = existingDays.slice(-3).map((d:any)=>`Day ${d.dayNumber}: ${d.title}`).join(", ");

    const prompt = `${toneStr}\n${langI}\n${firstName?(isRu?`\u0418\u043C\u044F: ${n}.`:`Name: ${n}.`):""}
${convCtx?`Context:\n${convCtx}\n\n`:""}Block ${blockNum} (${blockNames[blockNum-1]||"Next"}) of 100-day plan "${prog.title}".
Previous: ${lastDays||"none"}. Generate days ${nextStart}-${nextEnd}. Tasks should PROGRESS in difficulty.
Each day: 2-4 tasks with "reminderTime","whyItMatters","coachMessage","skipReaction","doneReaction".
Return ONLY JSON: {"days":[{"dayNumber":${nextStart},"title":"str","description":"str","coachMessage":"str","skipReaction":"str","doneReaction":"str","tasks":[{"title":"str","description":"str","estimatedMinutes":5,"type":"action|reflection|mindfulness","reminderTime":"08:00","whyItMatters":"str"}],"reflectionPrompt":"str"}]}`;

    let result = await callOpenAI(prompt, `Block ${blockNum}`, 8000);
    const emojis = ["\uD83C\uDF05","\uD83E\uDDD8","\u26A1","\uD83D\uDD04","\uD83D\uDD0B","\uD83C\uDFAF","\uD83D\uDC8E"];
    if (!result?.days||result.days.length===0) {
      const th = isRu?["\u041D\u0430\u043C\u0435\u0440\u0435\u043D\u0438\u0435","\u041E\u0441\u043E\u0437\u043D\u0430\u043D\u043D\u043E\u0441\u0442\u044C","\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435","\u041F\u0440\u0438\u0432\u044B\u0447\u043A\u0438","\u042D\u043D\u0435\u0440\u0433\u0438\u044F","\u0424\u043E\u043A\u0443\u0441","\u0418\u043D\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044F"]:["Intention","Awareness","Action","Habits","Energy","Focus","Integration"];
      result = { days: Array.from({length:nextEnd-nextStart+1},(_,i)=>({
        dayNumber:nextStart+i, title:th[(nextStart+i-1)%th.length], description:`${isRu?"\u0414\u0435\u043D\u044C":"Day"} ${nextStart+i}`,
        coachMessage:`${isRu?"\u0414\u0435\u043D\u044C":"Day"} ${nextStart+i}, ${n}!`, skipReaction:isRu?"\u041F\u0440\u043E\u043F\u0443\u0441\u0442\u0438\u043B?":"Skipped?", doneReaction:isRu?"\u041C\u043E\u043B\u043E\u0434\u0435\u0446!":"Great!",
        tasks:[{title:isRu?"\u0423\u0442\u0440\u043E":"Morning",description:"~7 min",estimatedMinutes:7,type:"mindfulness",reminderTime:"08:00",whyItMatters:isRu?"\u041E\u0441\u043D\u043E\u0432\u0430.":"Foundation."},
               {title:isRu?"\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435":"Action",description:"~7 min",estimatedMinutes:7,type:"action",reminderTime:"12:00",whyItMatters:isRu?"\u041F\u0440\u043E\u0433\u0440\u0435\u0441\u0441.":"Progress."}],
        reflectionPrompt:isRu?"\u0427\u0442\u043E \u0437\u0430\u043C\u0435\u0442\u0438\u043B?":"What did you notice?",
      }))};
    }

    const dayKeys:string[] = []; const dayValues:any[] = [];
    for (const dd of result.days) {
      const dayId = generateId("day");
      const tasks = (dd.tasks||[]).map((t:any,idx:number)=>({ id:`${dayId}_t${idx}`, title:t.title, description:t.description, type:t.type||"action", emoji:emojis[(dd.dayNumber-1)%emojis.length]||"\u2728", estimatedMinutes:t.estimatedMinutes||5, reminderTime:t.reminderTime||null, whyItMatters:t.whyItMatters||"" }));
      dayKeys.push(`become:day:${programId}:${dd.dayNumber}`);
      dayValues.push({ id:dayId, programId, dayNumber:dd.dayNumber, title:dd.title, description:dd.description||"", tasksJson:tasks, reflectionPrompt:dd.reflectionPrompt||"", coachMessage:dd.coachMessage||"", skipReaction:dd.skipReaction||"", doneReaction:dd.doneReaction||"" });
    }
    await kv.mset(dayKeys, dayValues);
    prog.generatedUpToDay = nextEnd;
    await kv.set(`become:program:${programId}`, prog);
    console.log(`[AI Block] Generated block ${blockNum} (days ${nextStart}-${nextEnd}) for ${programId}`);
    return c.json({ success:true, blockNumber:blockNum, daysGenerated:result.days.length, fromDay:nextStart, toDay:nextEnd });
  } catch (err) {
    console.log("POST /ai/generate-next-block error:", err);
    return c.json({ message:`Error: ${err}`, code:"INTERNAL_ERROR", status:500 },500);
  }
});

// ---- POST /ai/generate-plan (backward compat — wraps plan-step for 7d) ----
app.post(`${PREFIX}/ai/generate-plan`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    const body = await c.req.json();
    const { userText, timePerDay, preferredTime, schedule } = body;
    if (!userText || userText.length < 10) return c.json({ message: "userText too short", code: "BAD_REQUEST", status: 400 }, 400);
    const user = await kv.get(`become:user:${auth.userId}`);
    const lang = user?.language || "en";
    const tone = user?.tone || "supportive";
    const _rGoal = user?.selectedGoal || ""; const goal = _rGoal.startsWith("custom:") ? _rGoal.slice(7) : _rGoal;
    const firstName = user?.firstName || "";
    const isRu = lang === "ru";
    const n = firstName || (isRu ? "\u0434\u0440\u0443\u0433" : "friend");

    const tonePersonality: Record<string, Record<string, string>> = {
      supportive: {
        en: "You are a warm, empathetic personal coach. You believe in the person deeply. Celebrate every small win. Use encouraging language, gentle nudges, positive reframing. Phrases: \"I believe in you\", \"You've got this\", \"I'm proud of you\".",
        ru: "\u0422\u044B \u0442\u0451\u043F\u043B\u044B\u0439, \u044D\u043C\u043F\u0430\u0442\u0438\u0447\u043D\u044B\u0439 \u043A\u043E\u0443\u0447. \u0413\u043B\u0443\u0431\u043E\u043A\u043E \u0432\u0435\u0440\u0438\u0448\u044C \u0432 \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430. \u041F\u0440\u0430\u0437\u0434\u043D\u0443\u0435\u0448\u044C \u043A\u0430\u0436\u0434\u0443\u044E \u043F\u043E\u0431\u0435\u0434\u0443. \u041C\u044F\u0433\u043A\u0438\u0435 \u043F\u043E\u0434\u0442\u0430\u043B\u043A\u0438\u0432\u0430\u043D\u0438\u044F, \u043F\u043E\u0437\u0438\u0442\u0438\u0432\u043D\u044B\u0439 \u0440\u0435\u0444\u0440\u0435\u0439\u043C\u0438\u043D\u0433. \u0424\u0440\u0430\u0437\u044B: \"\u042F \u0432\u0435\u0440\u044E \u0432 \u0442\u0435\u0431\u044F\", \"\u0423 \u0442\u0435\u0431\u044F \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u0441\u044F\", \"\u042F \u0433\u043E\u0440\u0436\u0443\u0441\u044C \u0442\u043E\u0431\u043E\u0439\".",
      },
      strict: {
        en: "You are a TOUGH drill-sergeant coach with a stick. No excuses. No coddling. Push hard. Call out laziness. If they skip \u2014 mock with dark humor. If done \u2014 brief praise then push harder. Phrases: \"No excuses\", \"Did you think this was optional?\", \"Stop whining and DO IT\". Be sarcastic. Be brutally honest.",
        ru: "\u0422\u044B \u0416\u0401\u0421\u0422\u041A\u0418\u0419 \u043A\u043E\u0443\u0447-\u0441\u0435\u0440\u0436\u0430\u043D\u0442 \u0441 \u043F\u0430\u043B\u043A\u043E\u0439. \u041D\u0438\u043A\u0430\u043A\u0438\u0445 \u043E\u043F\u0440\u0430\u0432\u0434\u0430\u043D\u0438\u0439. \u0414\u0430\u0432\u0438\u0448\u044C \u0441\u0438\u043B\u044C\u043D\u043E. \u041D\u0430\u0437\u044B\u0432\u0430\u0435\u0448\u044C \u043B\u0435\u043D\u044C \u043B\u0435\u043D\u044C\u044E. \u041F\u0440\u043E\u043F\u0443\u0441\u0442\u0438\u043B\u0438 \u2014 \u0432\u044B\u0441\u043C\u0435\u0438\u0432\u0430\u0435\u0448\u044C. \u0412\u044B\u043F\u043E\u043B\u043D\u0438\u043B\u0438 \u2014 \u043A\u0440\u0430\u0442\u043A\u0430\u044F \u043F\u043E\u0445\u0432\u0430\u043B\u0430 \u0438 \u043D\u043E\u0432\u044B\u0439 \u0432\u044B\u0437\u043E\u0432. \u0424\u0440\u0430\u0437\u044B: \"\u0411\u0435\u0437 \u043E\u043F\u0440\u0430\u0432\u0434\u0430\u043D\u0438\u0439\", \"\u0425\u0432\u0430\u0442\u0438\u0442 \u043D\u044B\u0442\u044C \u2014 \u0414\u0415\u041B\u0410\u0419\". \u0421\u0430\u0440\u043A\u0430\u0437\u043C. \u0416\u0451\u0441\u0442\u043A\u0430\u044F \u0447\u0435\u0441\u0442\u043D\u043E\u0441\u0442\u044C.",
      },
      hybrid: {
        en: "You are a TOUGH LOVE coach \u2014 drill sergeant meets therapist. Push hard but soften when needed. Alternate \"I believe in you\" and \"Stop making excuses\". Celebrate wins. Get in their face when they slack. Like a wise older sibling \u2014 sarcastic but deeply caring. ALWAYS watching, always care.",
        ru: "\u0422\u044B \u043A\u043E\u0443\u0447 \u0441 \u0416\u0401\u0421\u0422\u041A\u041E\u0419 \u041B\u042E\u0411\u041E\u0412\u042C\u042E \u2014 \u0441\u0435\u0440\u0436\u0430\u043D\u0442 + \u0442\u0435\u0440\u0430\u043F\u0435\u0432\u0442. \u0414\u0430\u0432\u0438\u0448\u044C, \u043D\u043E \u0437\u043D\u0430\u0435\u0448\u044C \u043A\u043E\u0433\u0434\u0430 \u0441\u043C\u044F\u0433\u0447\u0438\u0442\u044C. \u0427\u0435\u0440\u0435\u0434\u0443\u0435\u0448\u044C \"\u042F \u0432\u0435\u0440\u044E\" \u0438 \"\u0425\u0432\u0430\u0442\u0438\u0442 \u043E\u0442\u0433\u043E\u0432\u043E\u0440\u043E\u043A\". \u041A\u0430\u043A \u043C\u0443\u0434\u0440\u044B\u0439 \u0441\u0442\u0430\u0440\u0448\u0438\u0439 \u0431\u0440\u0430\u0442 \u2014 \u0441\u0430\u0440\u043A\u0430\u0441\u0442\u0438\u0447\u043D\u044B\u0439 \u043D\u043E \u0437\u0430\u0431\u043E\u0442\u043B\u0438\u0432\u044B\u0439. \u0412\u0421\u0415\u0413\u0414\u0410 \u0440\u044F\u0434\u043E\u043C.",
      },
    };
    const langInstr = isRu ? "\u0412\u0435\u0441\u044C \u043A\u043E\u043D\u0442\u0435\u043D\u0442 \u0421\u0422\u0420\u041E\u0413\u041E \u043D\u0430 \u0420\u0423\u0421\u0421\u041A\u041E\u041C." : "All content STRICTLY in ENGLISH.";
    const timeLabel: Record<string, string> = { morning: isRu ? "\u0443\u0442\u0440\u043E (7-10)" : "morning (7-10)", day: isRu ? "\u0434\u0435\u043D\u044C (12-15)" : "afternoon (12-15)", evening: isRu ? "\u0432\u0435\u0447\u0435\u0440 (18-22)" : "evening (18-22)", any: isRu ? "\u0433\u0438\u0431\u043A\u043E" : "flexible" };

    const systemPrompt = `${(tonePersonality[tone] || tonePersonality.supportive)[isRu ? "ru" : "en"]}

${langInstr}
${firstName ? (isRu ? `\u0418\u043C\u044F: ${firstName}. \u041E\u0431\u0440\u0430\u0449\u0430\u0439\u0441\u044F \u043F\u043E \u0438\u043C\u0435\u043D\u0438.` : `Name: ${firstName}. Address by name.`) : ""}

Build a DETAILED 7-day personal transformation program. Not generic \u2014 precision-crafted for their SPECIFIC situation.

CONTEXT: ${timePerDay || 20} min/day, preferred: ${timeLabel[preferredTime || "any"] || timeLabel.any}, schedule: ${schedule || "everyday"}${goal ? `, goal: ${goal}` : ""}

REQUIREMENTS:
1. Analyze ROOT problem, not symptoms.
2. Tasks must create REAL behavioral change \u2014 specific, actionable, measurable.
3. Each task: specific time slot (HH:MM), "reminderTime" for push notification.
4. Each day: "coachMessage" (morning text, personal, in-character, 2-3 sentences).
5. Each day: "skipReaction" (what you say if they SKIP \u2014 be in character!) and "doneReaction" (completion praise).
6. "coachIntro": your first message as their coach. Set expectations. Be memorable. 2-4 sentences.
7. "coachOutro": what you say when they finish all 7 days. 2-3 sentences.
8. Each task: "whyItMatters" \u2014 1 sentence connecting this task to THEIR specific problem.

Return ONLY valid JSON:
{"programTitle":"string","programSubtitle":"string","durationDays":7,"goalCategory":"health|relationships|career|discipline|confidence|stress|other","coachIntro":"string","coachOutro":"string","days":[{"dayNumber":1,"title":"string","description":"string (2-3 sentences)","coachMessage":"string","skipReaction":"string","doneReaction":"string","tasks":[{"title":"string","description":"string (2-3 sentences, specific)","estimatedMinutes":5,"type":"action|reflection|mindfulness","reminderTime":"08:00","whyItMatters":"string"}],"reflectionPrompt":"string"}]}`;

    let plan: any = null;
    if (openaiKey) {
      console.log(`[AI Plan] Enhanced gen for ${auth.userId}, lang=${lang}, tone=${tone}`);
      const OPENAI_MODEL = "gpt-4o-mini"; // Change model here
      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: OPENAI_MODEL, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userText.slice(0, 2000) }], temperature: 0.75, max_tokens: 6000, response_format: { type: "json_object" } }),
      });
      if (!openaiRes.ok) { console.log(`[AI Plan] OpenAI error ${openaiRes.status}: ${await openaiRes.text()}`); }
      else {
        const data = await openaiRes.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) { try { plan = JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()); } catch { console.log("[AI Plan] Parse error"); } }
      }
    } else { console.log("[AI Plan] No OPENAI_API_KEY, using template"); }

    // Enhanced fallback template
    if (!plan || !plan.days || plan.days.length !== 7) {
      const tpl = isRu ? {
        title: "7 \u0434\u043D\u0435\u0439 \u043A \u0446\u0435\u043B\u0438", sub: "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u0430 \u0442\u0440\u0430\u043D\u0441\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u0438",
        ci: `${n}, \u043F\u0440\u0438\u0432\u0435\u0442! \u042F \u0431\u0443\u0434\u0443 \u0442\u0432\u043E\u0438\u043C \u043A\u043E\u0443\u0447\u0435\u043C 7 \u0434\u043D\u0435\u0439. \u041D\u0435 \u0436\u0434\u0438 \u043B\u0451\u0433\u043A\u043E\u0439 \u043F\u0440\u043E\u0433\u0443\u043B\u043A\u0438 \u2014 \u0436\u0434\u0438 \u0440\u0435\u0430\u043B\u044C\u043D\u044B\u0445 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439. \u041F\u043E\u0435\u0445\u0430\u043B\u0438!`,
        co: `${n}, \u0442\u044B \u043F\u0440\u043E\u0448\u0451\u043B \u0432\u0441\u0435 7 \u0434\u043D\u0435\u0439. \u042D\u0442\u043E \u043D\u0435 \u0444\u0438\u043D\u0438\u0448 \u2014 \u044D\u0442\u043E \u043D\u0430\u0447\u0430\u043B\u043E \u043D\u043E\u0432\u043E\u0433\u043E \u0442\u0435\u0431\u044F. \u0413\u043E\u0440\u0436\u0443\u0441\u044C.`,
        d: ["\u041D\u0430\u043C\u0435\u0440\u0435\u043D\u0438\u0435","\u041E\u0441\u043E\u0437\u043D\u0430\u043D\u043D\u043E\u0441\u0442\u044C","\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435","\u041F\u0440\u0438\u0432\u044B\u0447\u043A\u0438","\u042D\u043D\u0435\u0440\u0433\u0438\u044F","\u0424\u043E\u043A\u0443\u0441","\u0418\u043D\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044F"],
        cm: [`\u0414\u043E\u0431\u0440\u043E\u0435 \u0443\u0442\u0440\u043E, ${n}! \u0414\u0435\u043D\u044C 1 \u2014 \u0441\u0430\u043C\u044B\u0439 \u0432\u0430\u0436\u043D\u044B\u0439. \u0417\u0430\u043A\u043B\u0430\u0434\u044B\u0432\u0430\u0435\u043C \u0444\u0443\u043D\u0434\u0430\u043C\u0435\u043D\u0442.`,`\u0414\u0435\u043D\u044C 2. \u0412\u0447\u0435\u0440\u0430 \u043D\u0430\u0447\u0430\u043B \u2014 \u0441\u0435\u0433\u043E\u0434\u043D\u044F \u0443\u0433\u043B\u0443\u0431\u043B\u044F\u0435\u043C\u0441\u044F.`,`\u0414\u0435\u043D\u044C 3 \u2014 \u0441\u0435\u0440\u0435\u0434\u0438\u043D\u0430. \u0414\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u043C!`,`\u0414\u0435\u043D\u044C 4. \u041F\u0440\u0438\u0432\u044B\u0447\u043A\u0438 \u2014 \u0441\u0443\u043F\u0435\u0440\u0441\u0438\u043B\u0430. \u0421\u0442\u0440\u043E\u0438\u043C.`,`\u0414\u0435\u043D\u044C 5 \u2014 \u044D\u043D\u0435\u0440\u0433\u0438\u044F \u0440\u0435\u0448\u0430\u0435\u0442.`,`\u0414\u0435\u043D\u044C 6. \u0424\u043E\u043A\u0443\u0441 \u2014 \u043C\u044B\u0448\u0446\u0430.`,`\u0414\u0435\u043D\u044C 7 \u2014 \u0444\u0438\u043D\u0430\u043B!`],
        sr: [`\u041F\u0435\u0440\u0432\u044B\u0439 \u0434\u0435\u043D\u044C \u043F\u0440\u043E\u043F\u0443\u0441\u0442\u0438\u043B? ${n}, \u043C\u044B \u0434\u0430\u0436\u0435 \u043D\u0435 \u043D\u0430\u0447\u0430\u043B\u0438...`,`\u0414\u0432\u0430 \u0434\u043D\u044F \u0438 \u0441\u0434\u0430\u0451\u0448\u044C\u0441\u044F?`,`\u0421\u0435\u0440\u0435\u0434\u0438\u043D\u0443 \u043F\u0440\u043E\u043F\u0443\u0441\u0442\u0438\u043B? \u0425\u043C.`,`\u041F\u0440\u0438\u0432\u044B\u0447\u043A\u0438 \u043D\u0435 \u0441\u0442\u0440\u043E\u044F\u0442\u0441\u044F \u043F\u0440\u043E\u043F\u0443\u0441\u043A\u0430\u043C\u0438.`,`\u041F\u0440\u043E\u043F\u0443\u0441\u0442\u0438\u043B? \u0417\u0430\u0432\u0442\u0440\u0430 \u0431\u0435\u0437 \u043E\u043F\u0440\u0430\u0432\u0434\u0430\u043D\u0438\u0439.`,`\u0424\u043E\u043A\u0443\u0441 \u043D\u0435 \u0442\u0440\u0435\u043D\u0438\u0440\u0443\u0435\u0442\u0441\u044F \u043A\u043E\u0433\u0434\u0430 \u0438\u0437\u0431\u0435\u0433\u0430\u0435\u0448\u044C.`,`\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0439 \u0434\u0435\u043D\u044C \u0438 \u043F\u0440\u043E\u043F\u0443\u0441\u043A? ${n}...`],
        dr: [`\u041F\u0435\u0440\u0432\u044B\u0439 \u0448\u0430\u0433, ${n}! \u041C\u043E\u043B\u043E\u0434\u0435\u0446!`,`\u0414\u0432\u0430 \u0434\u043D\u044F! \u0422\u044B \u0432 \u0438\u0433\u0440\u0435.`,`\u0421\u0435\u0440\u0435\u0434\u0438\u043D\u0430 \u043F\u0440\u043E\u0439\u0434\u0435\u043D\u0430!`,`\u041F\u0440\u0438\u0432\u044B\u0447\u043A\u0438 \u0437\u0430\u043A\u043B\u0430\u0434\u044B\u0432\u0430\u044E\u0442\u0441\u044F!`,`\u042D\u043D\u0435\u0440\u0433\u0438\u044F \u043D\u0430 \u0432\u044B\u0441\u043E\u0442\u0435!`,`\u0424\u043E\u043A\u0443\u0441 \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442!`,`\u0412\u0421\u0415 7 \u0414\u041D\u0415\u0419! \u0413\u043E\u0440\u0436\u0443\u0441\u044C, ${n}!`],
        t: [["\u0423\u0442\u0440\u0435\u043D\u043D\u044F\u044F \u0440\u0435\u0444\u043B\u0435\u043A\u0441\u0438\u044F","\u0417\u0430\u043F\u0438\u0448\u0438 \u0446\u0435\u043B\u044C \u0434\u043D\u044F","\u0412\u0435\u0447\u0435\u0440\u043D\u0438\u0439 \u043E\u0431\u0437\u043E\u0440"],["\u041C\u0435\u0434\u0438\u0442\u0430\u0446\u0438\u044F 5 \u043C\u0438\u043D","\u0416\u0443\u0440\u043D\u0430\u043B \u0431\u043B\u0430\u0433\u043E\u0434\u0430\u0440\u043D\u043E\u0441\u0442\u0438","\u0426\u0438\u0444\u0440\u043E\u0432\u043E\u0439 \u0434\u0435\u0442\u043E\u043A\u0441"],["\u0413\u043B\u0430\u0432\u043D\u0430\u044F \u0437\u0430\u0434\u0430\u0447\u0430","\u041F\u0435\u0440\u0435\u0440\u044B\u0432 \u0441 \u0434\u0432\u0438\u0436\u0435\u043D\u0438\u0435\u043C","\u041E\u0446\u0435\u043D\u043A\u0430 \u043F\u0440\u043E\u0433\u0440\u0435\u0441\u0441\u0430"],["\u0423\u0442\u0440\u0435\u043D\u043D\u044F\u044F \u0440\u0443\u0442\u0438\u043D\u0430","\u0422\u0440\u0435\u043A\u0435\u0440 \u043F\u0440\u0438\u0432\u044B\u0447\u0435\u043A","\u041F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435"],["\u0410\u0443\u0434\u0438\u0442 \u044D\u043D\u0435\u0440\u0433\u0438\u0438","\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0439 \u043E\u0442\u0434\u044B\u0445","\u041E\u043F\u0442\u0438\u043C\u0438\u0437\u0430\u0446\u0438\u044F"],["\u0411\u043B\u043E\u043A \u0433\u043B\u0443\u0431\u043E\u043A\u043E\u0439 \u0440\u0430\u0431\u043E\u0442\u044B","\u041E\u0434\u043D\u043E\u0437\u0430\u0434\u0430\u0447\u043D\u043E\u0441\u0442\u044C","\u0420\u0435\u0444\u043B\u0435\u043A\u0441\u0438\u044F"],["\u041E\u0431\u0437\u043E\u0440 \u043D\u0435\u0434\u0435\u043B\u0438","\u0412\u044B\u0431\u043E\u0440 \u043F\u0440\u0438\u0432\u044B\u0447\u043A\u0438","\u0424\u0438\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u043C\u0435\u0434\u0438\u0442\u0430\u0446\u0438\u044F"]],
        rp: ["\u0427\u0442\u043E \u043F\u043E\u0447\u0443\u0432\u0441\u0442\u0432\u043E\u0432\u0430\u043B \u043A\u043E\u0433\u0434\u0430 \u0437\u0430\u043F\u0438\u0441\u0430\u043B \u0446\u0435\u043B\u044C?","\u0427\u0442\u043E \u0437\u0430\u043C\u0435\u0442\u0438\u043B \u0432 \u043E\u0441\u043E\u0437\u043D\u0430\u043D\u043D\u043E\u0441\u0442\u0438?","\u041A\u0430\u043A \u043E\u0449\u0443\u0449\u0430\u043B\u043E\u0441\u044C \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435?","\u041A\u0430\u043A\u0430\u044F \u043F\u0440\u0438\u0432\u044B\u0447\u043A\u0430 \u0434\u0430\u043B\u0430\u0441\u044C \u043B\u0435\u0433\u0447\u0435?","\u0413\u0434\u0435 \u0442\u0435\u0440\u044F\u0435\u0448\u044C \u044D\u043D\u0435\u0440\u0433\u0438\u044E?","\u041A\u043E\u0433\u0434\u0430 \u0444\u043E\u043A\u0443\u0441 \u043C\u0430\u043A\u0441\u0438\u043C\u0430\u043B\u0435\u043D?","\u0427\u0442\u043E \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u043E\u0441\u044C \u0437\u0430 7 \u0434\u043D\u0435\u0439?"],
      } : {
        title: "7 Days to Your Goal", sub: "A personal transformation program",
        ci: `Hey ${n}! I'm your coach for 7 days. No casual stroll \u2014 real change. Let's go!`,
        co: `${n}, all 7 days done. This is the start of a new you. Proud.`,
        d: ["Intention","Awareness","Action","Habits","Energy","Focus","Integration"],
        cm: [`Morning, ${n}! Day 1 \u2014 the most important.`,`Day 2. Go deeper.`,`Day 3 \u2014 midweek. Act!`,`Day 4. Habits = superpower.`,`Day 5 \u2014 energy matters.`,`Day 6. Focus is a muscle.`,`Day 7 \u2014 finale!`],
        sr: [`Skipped Day 1? ${n}, really?`,`Giving up already?`,`Midway skip? Hm.`,`Habits don't build with gaps.`,`Tomorrow \u2014 no excuses.`,`Focus doesn't train when avoided.`,`Last day skip? ${n}...`],
        dr: [`First step, ${n}! Great!`,`Two days! In the game.`,`Midpoint cleared!`,`Habits forming!`,`Energy up!`,`Focus working!`,`ALL 7 DAYS! Proud, ${n}!`],
        t: [["Morning Reflection","Write Today's Goal","Evening Review"],["5-min Meditation","Gratitude Journal","Digital Detox"],["Main Task","Movement Break","Progress Check"],["Morning Routine","Habit Tracker","Plan Tomorrow"],["Energy Audit","Active Rest","Optimize Schedule"],["Deep Work Block","Single-Tasking","Focus Reflection"],["Week Review","Pick Habit","Closing Meditation"]],
        rp: ["What did you feel writing your goal?","What did you notice?","How did action feel?","Easiest habit?","Where lose energy?","When focus strongest?","What changed in 7 days?"],
      };
      const mpt = Math.round((timePerDay || 20) / 3);
      const bt = ["08:00","12:00","20:00"];
      plan = {
        programTitle: tpl.title, programSubtitle: tpl.sub, durationDays: 7,
        goalCategory: goal || "discipline", coachIntro: tpl.ci, coachOutro: tpl.co,
        days: tpl.d.map((title: string, i: number) => ({
          dayNumber: i + 1, title,
          description: isRu ? `\u0414\u0435\u043D\u044C ${i+1}: "${title}" \u2014 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u0435 \u0448\u0430\u0433\u0438 \u043A \u0446\u0435\u043B\u0438.` : `Day ${i+1}: "${title}" \u2014 concrete steps.`,
          coachMessage: tpl.cm[i], skipReaction: tpl.sr[i], doneReaction: tpl.dr[i],
          tasks: tpl.t[i].map((t: string, j: number) => ({
            title: t, description: isRu ? `\u0412\u044B\u043F\u043E\u043B\u043D\u0438 "${t}" \u0437\u0430 ~${mpt} \u043C\u0438\u043D.` : `Complete "${t}" in ~${mpt} min.`,
            estimatedMinutes: mpt, type: j === 0 ? "mindfulness" : j === tpl.t[i].length - 1 ? "reflection" : "action",
            reminderTime: bt[j] || "12:00", whyItMatters: isRu ? "\u0421\u043E\u0437\u0434\u0430\u0451\u0442 \u043E\u0441\u043D\u043E\u0432\u0443 \u0434\u043B\u044F \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439." : "Builds the foundation for change.",
          })),
          reflectionPrompt: tpl.rp[i],
        })),
      };
    }

    const draftId = generateId("draft");
    await kv.set(`become:plan_draft:${auth.userId}:${draftId}`, { id: draftId, userId: auth.userId, plan, inputSummary: userText.slice(0, 500), timePerDay, preferredTime, schedule, createdAt: new Date().toISOString() });
    console.log(`[AI Plan] Draft ${draftId} saved for user ${auth.userId}`);
    return c.json({ draftId, plan });
  } catch (err) {
    console.log("POST /ai/generate-plan error:", err);
    return c.json({ message: `Error generating plan: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /ai/coach-checkin ----
// Proactive coach check-in: generates a personalized message based on current progress
app.post(`${PREFIX}/ai/coach-checkin`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    const user = await kv.get(`become:user:${auth.userId}`);
    if (!user) return c.json({ message: "User not found", code: "NOT_FOUND", status: 404 }, 404);

    const lang = user.language || "en";
    const tone = user.tone || "supportive";
    const firstName = user.firstName || "";
    const programId = user.activeProgramId;
    const isRu = lang === "ru";

    // Get progress data
    let doneDays = 0, skippedDays = 0, streak = 0, currentDay = 1, totalDays = 7;
    if (programId) {
      const prog = await kv.get(`become:program:${programId}`);
      totalDays = prog?.durationDays || 7;
      const progressList = await kv.getByPrefix(`become:progress:${auth.userId}:${programId}:`);
      doneDays = progressList.filter((p: any) => p.status === "done").length;
      skippedDays = progressList.filter((p: any) => p.status === "skip").length;
      currentDay = Math.min(doneDays + skippedDays + 1, totalDays);
      // Calculate streak
      const sorted = progressList.filter((p: any) => p.status === "done").sort((a: any, b: any) => b.dayNumber - a.dayNumber);
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].dayNumber === sorted[0].dayNumber - i) streak++;
        else break;
      }
    }

    // Check for stored coach data from generated plan
    let coachData: any = null;
    if (programId) {
      const genPlan = await kv.getByPrefix(`become:generated_plan:${auth.userId}:`);
      if (genPlan.length > 0) {
        const latest = genPlan[genPlan.length - 1];
        const draft = await kv.get(`become:plan_draft:${auth.userId}:${latest.draftId}`);
        coachData = draft?.plan || null;
      }
      // Also check program directly for coach messages
      const dayData = await kv.get(`become:day:${programId}:${currentDay}`);
      if (dayData?.coachMessage) {
        coachData = { ...(coachData || {}), currentDayCoachMessage: dayData.coachMessage };
      }
    }

    // Load recent journal entries for richer daily digest context
    let journalContext = "";
    let recentNoteCount = 0;
    try {
      const allNotes = await kv.getByPrefix(`become:note:${auth.userId}:`);
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recentNotes = allNotes
        .filter((n: any) => new Date(n.createdAt).getTime() > weekAgo)
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      recentNoteCount = recentNotes.length;
      if (recentNotes.length > 0) {
        const snippets = recentNotes.slice(0, 5).map((n: any) => `"${(n.contentText || "").slice(0, 100)}"`).join("; ");
        journalContext = isRu
          ? ` \u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0430\u043F\u0438\u0441\u0430\u043B ${recentNotes.length} \u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u0432 \u0436\u0443\u0440\u043D\u0430\u043B \u0437\u0430 \u043D\u0435\u0434\u0435\u043B\u044E. \u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435: ${snippets}. \u041C\u043E\u0436\u0435\u0448\u044C \u0443\u043F\u043E\u043C\u044F\u043D\u0443\u0442\u044C \u0447\u0442\u043E \u0437\u0430\u043C\u0435\u0442\u0438\u043B \u0432 \u0437\u0430\u043F\u0438\u0441\u044F\u0445 (\u043A\u0440\u0430\u0442\u043A\u043E, 1 \u0444\u0440\u0430\u0437\u0430).`
          : ` User wrote ${recentNotes.length} journal entries this week. Recent: ${snippets}. You may briefly reference journal patterns (1 phrase).`;
      }
    } catch (jErr) {
      console.log("[Coach Checkin] Journal context error:", jErr);
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    let message = "";

    if (openaiKey && programId) {
      const toneDesc: Record<string, string> = {
        supportive: isRu ? "\u0422\u0451\u043F\u043B\u044B\u0439 \u0438 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u044E\u0449\u0438\u0439" : "Warm and supportive",
        strict: isRu ? "\u0421\u0442\u0440\u043E\u0433\u0438\u0439 \u0441\u0435\u0440\u0436\u0430\u043D\u0442 \u0441 \u043F\u0430\u043B\u043A\u043E\u0439" : "Tough drill sergeant with a stick",
        hybrid: isRu ? "\u0416\u0451\u0441\u0442\u043A\u0430\u044F \u043B\u044E\u0431\u043E\u0432\u044C" : "Tough love coach",
      };
      const prompt = isRu
        ? `\u0422\u044B ${toneDesc[tone] || toneDesc.supportive} \u043A\u043E\u0443\u0447. \u0418\u043C\u044F: ${firstName}. \u041F\u0440\u043E\u0433\u0440\u0435\u0441\u0441: \u0434\u0435\u043D\u044C ${currentDay}/${totalDays}, \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043E ${doneDays}, \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E ${skippedDays}, \u0441\u0435\u0440\u0438\u044F ${streak}. \u041D\u0430\u043F\u0438\u0448\u0438 \u043A\u043E\u0440\u043E\u0442\u043A\u043E\u0435 \u043C\u043E\u0442\u0438\u0432\u0438\u0440\u0443\u044E\u0449\u0435\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 (2-3 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u044F). \u0415\u0441\u043B\u0438 \u043C\u043D\u043E\u0433\u043E \u043F\u0440\u043E\u043F\u0443\u0441\u043A\u043E\u0432 \u2014 \u0431\u0443\u0434\u044C \u0436\u0451\u0441\u0442\u043A\u0438\u043C. \u0415\u0441\u043B\u0438 \u0445\u043E\u0440\u043E\u0448\u043E \u2014 \u043F\u043E\u0445\u0432\u0430\u043B\u0438.${journalContext} \u041E\u0442\u0432\u0435\u0442\u044C JSON: {"message":"string"}`
        : `You are a ${toneDesc[tone] || toneDesc.supportive} coach. Name: ${firstName}. Progress: day ${currentDay}/${totalDays}, done ${doneDays}, skipped ${skippedDays}, streak ${streak}. Write a short motivational message (2-3 sentences). If many skips \u2014 be tough. If good \u2014 praise.${journalContext} Reply JSON: {"message":"string"}`;
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }], temperature: 0.8, max_tokens: 300, response_format: { type: "json_object" } }),
        });
        if (res.ok) {
          const data = await res.json();
          const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
          message = parsed.message || "";
        }
      } catch { /* fallback below */ }
    }

    // Fallback messages
    if (!message) {
      if (skippedDays > doneDays) {
        message = isRu
          ? `${firstName || "\u042D\u0439"}, ${skippedDays} \u043F\u0440\u043E\u043F\u0443\u0441\u043A\u043E\u0432 \u0438\u0437 ${currentDay - 1} \u0434\u043D\u0435\u0439. \u0421\u0435\u0440\u044C\u0451\u0437\u043D\u043E? \u0422\u044B \u043C\u043E\u0436\u0435\u0448\u044C \u043B\u0443\u0447\u0448\u0435. \u0414\u043E\u043A\u0430\u0436\u0438 \u044D\u0442\u043E \u0441\u0435\u0433\u043E\u0434\u043D\u044F.`
          : `${firstName || "Hey"}, ${skippedDays} skips out of ${currentDay - 1} days. Seriously? You can do better. Prove it today.`;
      } else if (streak >= 3) {
        message = isRu
          ? `${firstName || ""}, ${streak} \u0434\u043D\u0435\u0439 \u043F\u043E\u0434\u0440\u044F\u0434! \u0422\u044B \u043D\u0430\u0431\u0438\u0440\u0430\u0435\u0448\u044C \u043E\u0431\u043E\u0440\u043E\u0442\u044B. \u041D\u0435 \u043E\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u0439\u0441\u044F!`
          : `${firstName || ""}, ${streak} days in a row! Momentum is building. Don't stop!`;
      } else {
        message = isRu
          ? `\u0414\u0435\u043D\u044C ${currentDay} \u0436\u0434\u0451\u0442, ${firstName || "\u0434\u0440\u0443\u0433"}. \u041A\u0430\u0436\u0434\u044B\u0439 \u0434\u0435\u043D\u044C \u2014 \u044D\u0442\u043E \u0448\u0430\u043D\u0441 \u0441\u0442\u0430\u0442\u044C \u043B\u0443\u0447\u0448\u0435. \u0414\u0430\u0432\u0430\u0439!`
          : `Day ${currentDay} is waiting, ${firstName || "friend"}. Every day is a chance to get better. Let's go!`;
      }
    }

    return c.json({ message, doneDays, skippedDays, streak, currentDay, totalDays, recentNoteCount });
  } catch (err) {
    console.log("POST /ai/coach-checkin error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /ai/activate-plan ----
app.post(`${PREFIX}/ai/activate-plan`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const { draftId } = await c.req.json();
    if (!draftId) return c.json({ message: "draftId required", code: "BAD_REQUEST", status: 400 }, 400);

    const draft = await kv.get(`become:plan_draft:${auth.userId}:${draftId}`);
    if (!draft?.plan) return c.json({ message: "Draft not found", code: "NOT_FOUND", status: 404 }, 404);

    const plan = draft.plan;
    const now = new Date().toISOString();
    const programId = generateId("prog");
    const emojis = ["\u{1F305}", "\u{1F9D8}", "\u26A1", "\u{1F504}", "\u{1F50B}", "\u{1F3AF}", "\u{1F48E}"];

    const program = { id: programId, code: `generated-${draftId}`, title: plan.programTitle || "My Plan", subtitle: plan.programSubtitle || "", durationDays: plan.durationDays || 7, isActive: true, ownerId: auth.userId, goalCategory: plan.goalCategory || "other", coachIntro: plan.coachIntro || "", coachOutro: plan.coachOutro || "", createdAt: now };
    await kv.set(`become:program:${programId}`, program);

    const dayKeys: string[] = [];
    const dayValues: any[] = [];
    for (const dd of (plan.days || [])) {
      const dayId = generateId("day");
      const tasks = (dd.tasks || []).map((t: any, idx: number) => ({ id: `${dayId}_t${idx}`, title: t.title, description: t.description, type: t.type || "action", emoji: emojis[dd.dayNumber - 1] || "\u2728", estimatedMinutes: t.estimatedMinutes || 5, reminderTime: t.reminderTime || null, whyItMatters: t.whyItMatters || "" }));
      dayKeys.push(`become:day:${programId}:${dd.dayNumber}`);
      dayValues.push({ id: dayId, programId, dayNumber: dd.dayNumber, title: dd.title, description: dd.description || "", tasksJson: tasks, reflectionPrompt: dd.reflectionPrompt || "", coachMessage: dd.coachMessage || "", skipReaction: dd.skipReaction || "", doneReaction: dd.doneReaction || "" });
    }
    await kv.mset(dayKeys, dayValues);

    const user = await kv.get(`become:user:${auth.userId}`);
    if (user) { user.activeProgramId = programId; user.updatedAt = now; await kv.set(`become:user:${auth.userId}`, user); }

    await kv.set(`become:generated_plan:${auth.userId}:${programId}`, { userId: auth.userId, programId, draftId, inputSummary: draft.inputSummary, createdAt: now });
    await kv.del(`become:plan_draft:${auth.userId}:${draftId}`);

    console.log(`[AI Plan] Activated ${programId} for user ${auth.userId}`);
    return c.json({ programId, program });
  } catch (err) {
    console.log("POST /ai/activate-plan error:", err);
    return c.json({ message: `Error activating plan: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// =============================================
// TELEGRAM BOT WEBHOOK ROUTES
// =============================================

// ---- Helper: find user by Telegram ID ----
async function findUserByTelegramId(tgId: number): Promise<any | null> {
  try {
    const userId = await kv.get(`become:user:tg:${String(tgId)}`);
    if (!userId) return null;
    return await kv.get(`become:user:${userId}`);
  } catch {
    return null;
  }
}

// ---- Helper: get progress summary for a user ----
async function getUserProgressSummary(userId: string): Promise<{
  doneDays: number;
  skippedDays: number;
  streak: number;
  xp: number;
  totalDays: number;
  currentDay: number;
}> {
  const user = await kv.get(`become:user:${userId}`);
  const activeProgramId = user?.activeProgramId;

  // Filter progress by user's active program only
  const progressList = activeProgramId
    ? await kv.getByPrefix(`become:progress:${userId}:${activeProgramId}:`)
    : [];

  // Direct lookup instead of scanning all programs
  const active = activeProgramId ? await kv.get(`become:program:${activeProgramId}`) : null;
  const totalDays = active?.durationDays || 7;

  const doneDays = progressList.filter((p: any) => p.status === "done").length;
  const skippedDays = progressList.filter((p: any) => p.status === "skip").length;

  const doneEntries = progressList
    .filter((p: any) => p.status === "done")
    .sort((a: any, b: any) => b.dayNumber - a.dayNumber);

  let streak = 0;
  if (doneEntries.length > 0) {
    for (let i = 0; i < doneEntries.length; i++) {
      if (doneEntries[i].dayNumber === doneEntries[0].dayNumber - i) streak++;
      else break;
    }
  }

  const currentDay = Math.min(doneDays + skippedDays + 1, totalDays);

  return {
    doneDays,
    skippedDays,
    streak,
    xp: user?.xp || 0,
    totalDays,
    currentDay,
  };
}

// ---- Helper: get today's tasks for a specific user ----
async function getTodayTasks(userId: string): Promise<{
  dayNumber: number;
  dayTitle: string;
  tasks: Array<{ emoji: string; title: string; description?: string; estimatedMinutes?: number; type?: string }>;
  programTitle: string;
  programSubtitle?: string;
  totalDays: number;
  streak: number;
  xp: number;
} | null> {
  // Use user's activeProgramId — direct lookup, not full scan
  const user = await kv.get(`become:user:${userId}`);
  const activeProgramId = user?.activeProgramId;
  if (!activeProgramId) return null;

  const active = await kv.get(`become:program:${activeProgramId}`);
  if (!active) return null;

  const progressList = await kv.getByPrefix(`become:progress:${userId}:${activeProgramId}:`);
  const completedDays = progressList.filter((p: any) =>
    p.status === "done" || p.status === "skip"
  ).length;
  const currentDayNum = Math.min(completedDays + 1, active.durationDays || 7);

  // If program already completed, no tasks today
  if (completedDays >= (active.durationDays || 7)) return null;

  // Direct lookup for the specific day
  const today = await kv.get(`become:day:${activeProgramId}:${currentDayNum}`);
  if (!today) return null;

  // Compute streak
  const doneEntries = progressList
    .filter((p: any) => p.status === "done")
    .sort((a: any, b: any) => b.dayNumber - a.dayNumber);
  let streak = 0;
  if (doneEntries.length > 0) {
    for (let i = 0; i < doneEntries.length; i++) {
      if (doneEntries[i].dayNumber === doneEntries[0].dayNumber - i) streak++;
      else break;
    }
  }

  return {
    dayNumber: currentDayNum,
    dayTitle: today.title,
    tasks: (today.tasksJson || []).map((t: any) => ({
      emoji: t.emoji || (t.type === "mindfulness" ? "\u{1F9D8}" : t.type === "reflection" ? "\u{270D}\uFE0F" : "\u{1F3AF}"),
      title: t.title,
      description: t.description,
      estimatedMinutes: t.estimatedMinutes,
      type: t.type,
    })),
    programTitle: active.title,
    programSubtitle: active.subtitle,
    totalDays: active.durationDays || 7,
    streak,
    xp: user?.xp || 0,
  };
}

// ---- Handle /start command ----
async function handleStartCommand(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const user = msg.from;
  if (!user) return;

  // Extract deep link parameter (e.g., /start challenge_abc123)
  const text = msg.text || "";
  const parts = text.split(" ");
  const deepLinkParam = parts.length > 1 ? parts.slice(1).join("_") : undefined;

  console.log(`[TG Bot] /start from user ${user.id} (${user.first_name}), deepLink: ${deepLinkParam || "none"}`);

  await sendChatAction(chatId);

  // Check if user already exists
  const tgId = String(user.id);
  const existingUserId = await kv.get(`become:user:tg:${tgId}`);

  // ---- Server-side referral tracking ----
  if (deepLinkParam && deepLinkParam.startsWith("ref_")) {
    const refCode = deepLinkParam.replace("ref_", "");
    if (existingUserId) {
      // Returning user: apply referral directly on the server
      try {
        const userData = await kv.get(`become:user:${existingUserId}`);
        if (userData && !userData.referredBy) {
          const referrerUserId = await kv.get(`become:referral:${refCode}`);
          if (referrerUserId && referrerUserId !== existingUserId) {
            userData.referredBy = referrerUserId;
            userData.updatedAt = new Date().toISOString();
            await kv.set(`become:user:${existingUserId}`, userData);
            // Increment referrer count + milestone check
            const referrer = await kv.get(`become:user:${referrerUserId}`);
            if (referrer) {
              referrer.referralCount = (referrer.referralCount || 0) + 1;
              referrer.updatedAt = new Date().toISOString();
              const prevRewards = await kv.get(`become:bonus:ref_rewards:${referrerUserId}`) || 0;
              const newMilestones = Math.floor(referrer.referralCount / 10);
              if (newMilestones > prevRewards) {
                const bonusDays = (newMilestones - prevRewards) * 30;
                const currentExpiry = referrer.subscriptionExpiresAt ? new Date(referrer.subscriptionExpiresAt).getTime() : Date.now();
                const base = Math.max(currentExpiry, Date.now());
                referrer.subscriptionExpiresAt = new Date(base + bonusDays * 24 * 60 * 60 * 1000).toISOString();
                await kv.set(`become:bonus:ref_rewards:${referrerUserId}`, newMilestones);
                console.log(`[Referral] Milestone! referrer=${referrerUserId}, count=${referrer.referralCount}, +${bonusDays} days`);
              }
              await kv.set(`become:user:${referrerUserId}`, referrer);
            }
            await kv.set(`become:referral:log:${existingUserId}`, { referrerId: referrerUserId, registeredAt: new Date().toISOString() });
            console.log(`[Referral] Server-side applied for returning user ${existingUserId}, referrer=${referrerUserId}`);
            // Notify referrer about new referral
            try {
              if (referrer?.telegramId) {
                const refLang = referrer.language === "ru" ? "ru" : "en";
                const count = referrer.referralCount || 1;
                const notifText = refLang === "ru"
                  ? `🎉 <b>У тебя новый реферал!</b>\n\nПриглашено: <b>${count}/10</b>\n${count >= 10 ? "🏆 Ты достиг милестоуна! +30 дней подписки!" : `Ещё ${10 - (count % 10)} до бонуса +30 дней`}`
                  : `🎉 <b>You have a new referral!</b>\n\nInvited: <b>${count}/10</b>\n${count >= 10 ? "🏆 Milestone reached! +30 days subscription!" : `${10 - (count % 10)} more until +30 days bonus`}`;
                await sendMessage(Number(referrer.telegramId), notifText);
                console.log(`[Referral] Notified referrer ${referrerUserId} (tg:${referrer.telegramId}) about new referral, count=${count}`);
              }
            } catch (notifErr) {
              console.log(`[Referral] Failed to notify referrer:`, notifErr);
            }
          } else {
            console.log(`[Referral] Skipped: invalid code or self-referral (code=${refCode}, user=${existingUserId})`);
          }
        } else {
          console.log(`[Referral] Skipped: user ${existingUserId} already referred by ${userData?.referredBy}`);
        }
      } catch (err) {
        console.log(`[Referral] Error applying for returning user:`, err);
      }
    } else {
      // New user: store pending referral — will be applied after account creation
      await kv.set(`become:pending_referral:tg:${tgId}`, refCode);
      console.log(`[Referral] Stored pending referral for new tg:${tgId}, code=${refCode}`);
    }
  }

  if (existingUserId) {
    // ---- Returning user: show welcome-back with inline keyboard + persistent reply keyboard ----
    const lang = detectLang(user.language_code);
    // Update language preference
    await kv.set(`become:lang:${tgId}`, lang);
    // Generate device token + session for robust auth via reply keyboard
    await generateDeviceToken(existingUserId, tgId);
    const sessionToken = generateToken();
    await kv.set(`become:session:${sessionToken}`, {
      userId: existingUserId,
      telegramId: tgId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_TTL).toISOString(),
    });

    // Generate bot_auth token for the reply keyboard web_app button
    const kbBotAuthToken = await generateBotAuthToken(existingUserId, tgId);
    const kbAppUrl = buildAppUrlWithAuth(kbBotAuthToken);

    // skipOpenButton=true: "Open Proper Food" is in the reply keyboard, not inline
    const returning = buildReturningStartMessage(user, deepLinkParam, undefined, true);
    await sendMessage(chatId, returning.text, {
      reply_markup: returning.reply_markup,
    });

    // Also send reply keyboard (persistent at bottom) with bot_auth in web_app URL
    const replyKb = buildReplyKeyboard(lang, kbAppUrl || undefined);
    await sendMessage(chatId,
      lang === "ru"
        ? "\u{2328}\uFE0F \u041A\u043B\u0430\u0432\u0438\u0430\u0442\u0443\u0440\u0430 \u0431\u044B\u0441\u0442\u0440\u044B\u0445 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439 \u0430\u043A\u0442\u0438\u0432\u0438\u0440\u043E\u0432\u0430\u043D\u0430."
        : "\u{2328}\uFE0F Quick actions keyboard activated.",
      { reply_markup: replyKb }
    );

    // Refresh avatar in background
    (async () => {
      try {
        const avatarUrl = await fetchUserAvatarUrl(user.id);
        if (avatarUrl) {
          const userData = await kv.get(`become:user:${existingUserId}`);
          if (userData && userData.photoUrl !== avatarUrl) {
            userData.photoUrl = avatarUrl;
            userData.updatedAt = new Date().toISOString();
            await kv.set(`become:user:${existingUserId}`, userData);
            console.log(`[TG Bot] Refreshed avatar for returning user ${existingUserId}`);
          }
        }
      } catch (err) {
        console.log(`[TG Bot] Avatar refresh error (non-critical):`, err);
      }
    })();

    console.log(`[TG Bot] Returning user ${existingUserId} (tg:${tgId})`);

    // ---- Deep link: send targeted message if user came via a deep link ----
    if (deepLinkParam) {
      await sendDeepLinkMessage(chatId, lang, deepLinkParam, kbAppUrl);
    }
  } else {
    // ---- New user: create account directly from TG data (no contact sharing) ----
    const lang = detectLang(user.language_code);
    const newUserId = generateId("user");
    const now = new Date().toISOString();
    const referralCode = generateId("ref").replace("ref_", "").slice(0, 10);
    const subExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const newUser: any = {
      id: newUserId,
      telegramId: user.id,
      firstName: user.first_name,
      lastName: user.last_name || null,
      username: user.username || null,
      photoUrl: null,
      phoneNumber: null,
      language: user.language_code || "en",
      tone: "supportive",
      selectedGoal: null,
      xp: 0,
      dailyReminderTime: "10:00",
      utcOffset: 0,
      activeProgramId: null,
      subscriptionExpiresAt: subExpiresAt,
      referralCode,
      referralCount: 0,
      referredBy: null,
      createdAt: now,
      updatedAt: now,
    };
    const newWallet = {
      id: generateId("wallet"),
      userId: newUserId,
      starsBalance: 0,
      tonBalance: 0,
    };

    await kv.set(`become:user:${newUserId}`, newUser);
    await kv.set(`become:user:tg:${tgId}`, newUserId);
    await kv.set(`become:wallet:${newUserId}`, newWallet);
    await kv.set(`become:referral:${referralCode}`, newUserId);
    await kv.set(`become:lang:${tgId}`, lang);

    console.log(`[TG Bot] New user created from TG data: ${newUserId} (tg:${tgId}, refCode:${referralCode})`);

    // Apply pending referral (stored earlier in this function if deepLink had ref_CODE)
    try {
      const pendingRefCode = await kv.get(`become:pending_referral:tg:${tgId}`);
      if (pendingRefCode) {
        await kv.del(`become:pending_referral:tg:${tgId}`);
        const referrerUserId = await kv.get(`become:referral:${pendingRefCode}`);
        if (referrerUserId && referrerUserId !== newUserId) {
          newUser.referredBy = referrerUserId;
          newUser.updatedAt = new Date().toISOString();
          await kv.set(`become:user:${newUserId}`, newUser);
          const referrer = await kv.get(`become:user:${referrerUserId}`);
          if (referrer) {
            referrer.referralCount = (referrer.referralCount || 0) + 1;
            referrer.updatedAt = new Date().toISOString();
            const prevRewards = await kv.get(`become:bonus:ref_rewards:${referrerUserId}`) || 0;
            const newMilestones = Math.floor(referrer.referralCount / 10);
            if (newMilestones > prevRewards) {
              const bonusDays = (newMilestones - prevRewards) * 30;
              const currentExpiry = referrer.subscriptionExpiresAt ? new Date(referrer.subscriptionExpiresAt).getTime() : Date.now();
              const base = Math.max(currentExpiry, Date.now());
              referrer.subscriptionExpiresAt = new Date(base + bonusDays * 24 * 60 * 60 * 1000).toISOString();
              await kv.set(`become:bonus:ref_rewards:${referrerUserId}`, newMilestones);
            }
            await kv.set(`become:user:${referrerUserId}`, referrer);
          }
          await kv.set(`become:referral:log:${newUserId}`, { referrerId: referrerUserId, registeredAt: new Date().toISOString() });
          console.log(`[Referral] Applied for new user ${newUserId}, referrer=${referrerUserId}`);
          try {
            if (referrer?.telegramId) {
              const refLang = referrer.language === "ru" ? "ru" : "en";
              const count = referrer.referralCount || 1;
              const notifText = refLang === "ru"
                ? `🎉 <b>У тебя новый реферал!</b>\n\nПриглашено: <b>${count}/10</b>\n${count >= 10 ? "🏆 Ты достиг милестоуна! +30 дней подписки!" : `Ещё ${10 - (count % 10)} до бонуса +30 дней`}`
                : `🎉 <b>You have a new referral!</b>\n\nInvited: <b>${count}/10</b>\n${count >= 10 ? "🏆 Milestone reached! +30 days subscription!" : `${10 - (count % 10)} more until +30 days bonus`}`;
              await sendMessage(Number(referrer.telegramId), notifText);
            }
          } catch {}
        }
      }
    } catch (err) {
      console.log(`[TG Bot] Referral apply error:`, err);
    }

    // Generate device token + bot_auth for seamless Mini App login
    await generateDeviceToken(newUserId, tgId);
    const newBotAuthToken = await generateBotAuthToken(newUserId, tgId);
    const newAppUrl = buildAppUrlWithAuth(newBotAuthToken);
    const miniAppUrl = newAppUrl || getProperMiniAppUrl();

    // Send welcome message with "Open Proper Food" inline button
    const welcomeMsg = buildNewUserWelcomeMessage(user, miniAppUrl || undefined);
    await sendMessage(chatId, welcomeMsg.text, { reply_markup: welcomeMsg.reply_markup });

    // Send persistent reply keyboard
    const replyKb = buildReplyKeyboard(lang, miniAppUrl || undefined);
    await sendMessage(chatId,
      lang === "ru" ? "⌨️ Клавиатура быстрого доступа активирована." : "⌨️ Quick access keyboard activated.",
      { reply_markup: replyKb }
    );

    // Fetch avatar in background (non-blocking)
    (async () => {
      try {
        const avatarUrl = await fetchUserAvatarUrl(user.id);
        if (avatarUrl) {
          newUser.photoUrl = avatarUrl;
          newUser.updatedAt = new Date().toISOString();
          await kv.set(`become:user:${newUserId}`, newUser);
          console.log(`[TG Bot] Avatar fetched for new user ${newUserId}`);
        }
      } catch {}
    })();

    console.log(`[TG Bot] New user onboarded without contact sharing (tg:${tgId})`);

    // ---- Deep link: send targeted message if user came via a deep link ----
    if (deepLinkParam) {
      await sendDeepLinkMessage(chatId, lang, deepLinkParam, miniAppUrl);
    }
  }
}

// ---- Handle contact sharing ----
async function handleContactMessage(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const from = msg.from;
  const contact = msg.contact;
  if (!from || !contact) return;

  // Security: only accept contact from the user themselves
  if (contact.user_id && contact.user_id !== from.id) {
    console.log(`[TG Bot] Contact user_id mismatch: ${contact.user_id} vs ${from.id}`);
    const lang = detectLang(from.language_code);
    await sendMessage(chatId,
      lang === "ru"
        ? "\u274C \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u043F\u043E\u0434\u0435\u043B\u0438\u0441\u044C \u0441\u0432\u043E\u0438\u043C \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u043C \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u043E\u043C."
        : "\u274C Please share your own contact."
    );
    return;
  }

  await sendChatAction(chatId);

  const tgId = String(from.id);
  let existingUserId = await kv.get(`become:user:tg:${tgId}`);

  if (!existingUserId) {
    // Create new user with full subscription & referral fields
    const userId = generateId("user");
    const now = new Date().toISOString();
    const referralCode = generateId("ref").replace("ref_", "").slice(0, 10);
    const subExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const newUser: any = {
      id: userId,
      telegramId: from.id,
      firstName: contact.first_name || from.first_name,
      lastName: contact.last_name || from.last_name || null,
      username: from.username || null,
      photoUrl: null,
      phoneNumber: contact.phone_number || null,
      language: from.language_code || "en",
      tone: "supportive",
      selectedGoal: null,
      xp: 0,
      dailyReminderTime: "10:00",
      utcOffset: 0,
      activeProgramId: null,
      subscriptionExpiresAt: subExpiresAt,
      referralCode,
      referralCount: 0,
      referredBy: null,
      createdAt: now,
      updatedAt: now,
    };
    const wallet = {
      id: generateId("wallet"),
      userId,
      starsBalance: 0,
      tonBalance: 0,
    };
    await kv.set(`become:user:${userId}`, newUser);
    await kv.set(`become:user:tg:${tgId}`, userId);
    await kv.set(`become:wallet:${userId}`, wallet);
    await kv.set(`become:referral:${referralCode}`, userId);
    // Save phone index for phone-based auth
    if (contact.phone_number) {
      await setPhoneIndex(contact.phone_number, userId);
    }
    // Save language preference for i18n notifications
    await kv.set(`become:lang:${tgId}`, detectLang(from.language_code));
    existingUserId = userId;

    console.log(`[TG Bot] New user created via contact: ${userId} (tg:${tgId}, phone:${contact.phone_number}, refCode:${referralCode})`);

    // ---- Apply pending referral from /start ref_CODE ----
    try {
      const pendingRefCode = await kv.get(`become:pending_referral:tg:${tgId}`);
      if (pendingRefCode) {
        await kv.del(`become:pending_referral:tg:${tgId}`);
        const referrerUserId = await kv.get(`become:referral:${pendingRefCode}`);
        if (referrerUserId && referrerUserId !== userId) {
          newUser.referredBy = referrerUserId;
          newUser.updatedAt = new Date().toISOString();
          await kv.set(`become:user:${userId}`, newUser);
          // Increment referrer count + milestone
          const referrer = await kv.get(`become:user:${referrerUserId}`);
          if (referrer) {
            referrer.referralCount = (referrer.referralCount || 0) + 1;
            referrer.updatedAt = new Date().toISOString();
            const prevRewards = await kv.get(`become:bonus:ref_rewards:${referrerUserId}`) || 0;
            const newMilestones = Math.floor(referrer.referralCount / 10);
            if (newMilestones > prevRewards) {
              const bonusDays = (newMilestones - prevRewards) * 30;
              const currentExpiry = referrer.subscriptionExpiresAt ? new Date(referrer.subscriptionExpiresAt).getTime() : Date.now();
              const base = Math.max(currentExpiry, Date.now());
              referrer.subscriptionExpiresAt = new Date(base + bonusDays * 24 * 60 * 60 * 1000).toISOString();
              await kv.set(`become:bonus:ref_rewards:${referrerUserId}`, newMilestones);
              console.log(`[Referral] Milestone! referrer=${referrerUserId}, count=${referrer.referralCount}, +${bonusDays} days`);
            }
            await kv.set(`become:user:${referrerUserId}`, referrer);
          }
          await kv.set(`become:referral:log:${userId}`, { referrerId: referrerUserId, registeredAt: new Date().toISOString() });
          console.log(`[Referral] Applied pending referral for new user ${userId}, referrer=${referrerUserId}`);
          // Notify referrer about new referral
          try {
            if (referrer?.telegramId) {
              const refLang = referrer.language === "ru" ? "ru" : "en";
              const count = referrer.referralCount || 1;
              const notifText = refLang === "ru"
                ? `🎉 <b>У тебя новый реферал!</b>\n\nПриглашено: <b>${count}/10</b>\n${count >= 10 ? "🏆 Ты достиг милестоуна! +30 дней подписки!" : `Ещё ${10 - (count % 10)} до бонуса +30 дней`}`
                : `🎉 <b>You have a new referral!</b>\n\nInvited: <b>${count}/10</b>\n${count >= 10 ? "🏆 Milestone reached! +30 days subscription!" : `${10 - (count % 10)} more until +30 days bonus`}`;
              await sendMessage(Number(referrer.telegramId), notifText);
              console.log(`[Referral] Notified referrer ${referrerUserId} about new referral (pending), count=${count}`);
            }
          } catch (notifErr) {
            console.log(`[Referral] Failed to notify referrer:`, notifErr);
          }
        } else {
          console.log(`[Referral] Pending referral invalid or self-referral (code=${pendingRefCode}, newUser=${userId})`);
        }
      }
    } catch (err) {
      console.log(`[Referral] Error applying pending referral:`, err);
    }
  } else {
    // Full sync: update name, phone, username, language for existing user
    const existing = await kv.get(`become:user:${existingUserId}`);
    if (existing) {
      let changed = false;
      if (contact.phone_number && existing.phoneNumber !== contact.phone_number) {
        existing.phoneNumber = contact.phone_number;
        changed = true;
        // Update phone index for phone-based auth
        await setPhoneIndex(contact.phone_number, existingUserId);
      }
      if (contact.first_name && existing.firstName !== contact.first_name) {
        existing.firstName = contact.first_name;
        existing.displayName = contact.first_name + (contact.last_name ? " " + contact.last_name : (existing.lastName ? " " + existing.lastName : ""));
        changed = true;
      }
      if (contact.last_name !== undefined && existing.lastName !== (contact.last_name || null)) {
        existing.lastName = contact.last_name || null;
        existing.displayName = (existing.firstName || contact.first_name) + (contact.last_name ? " " + contact.last_name : "");
        changed = true;
      }
      if (from.username && existing.telegramUsername !== from.username) {
        existing.telegramUsername = from.username;
        changed = true;
      }
      if (from.language_code && existing.language !== from.language_code) {
        existing.language = from.language_code;
        changed = true;
      }
      if (changed) {
        existing.updatedAt = new Date().toISOString();
        await kv.set(`become:user:${existingUserId}`, existing);
        console.log(`[TG Bot] Full sync for existing user ${existingUserId}: phone=${existing.phoneNumber}, name=${existing.displayName}`);
      }
      // Refresh device token + session for robust auth
      await generateDeviceToken(existingUserId, tgId);
      const sessionToken = generateToken();
      await kv.set(`become:session:${sessionToken}`, {
        userId: existingUserId,
        telegramId: tgId,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + SESSION_TTL).toISOString(),
      });
      await kv.set(`become:lang:${tgId}`, detectLang(from.language_code));
    }
  }

  // Fetch and store user avatar (fire-and-forget to not block response)
  (async () => {
    try {
      const avatarUrl = await fetchUserAvatarUrl(from.id);
      if (avatarUrl) {
        const userData = await kv.get(`become:user:${existingUserId}`);
        if (userData) {
          userData.photoUrl = avatarUrl;
          userData.updatedAt = new Date().toISOString();
          await kv.set(`become:user:${existingUserId}`, userData);
          console.log(`[TG Bot] Saved avatar for user ${existingUserId}`);
        }
      }
    } catch (err) {
      console.log(`[TG Bot] Avatar fetch error (non-critical):`, err);
    }
  })();

  // Generate bot auth token for Mini App URL
  const botAuthToken = await generateBotAuthToken(existingUserId, tgId);
  const appUrl = buildAppUrlWithAuth(botAuthToken);

  // Send success message with inline keyboard + persistent reply keyboard
  const success = buildContactSuccessMessage(from, appUrl || undefined);
  await sendMessage(chatId, success.text, {
    reply_markup: success.inline_markup,
  });

  // Set persistent reply keyboard
  const lang = detectLang(from.language_code);
  await sendMessage(chatId,
    lang === "ru"
      ? "\u{2328}\uFE0F \u041A\u043B\u0430\u0432\u0438\u0430\u0442\u0443\u0440\u0430 \u0431\u044B\u0441\u0442\u0440\u044B\u0445 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439 \u0430\u043A\u0442\u0438\u0432\u0438\u0440\u043E\u0432\u0430\u043D\u0430 \u{1F447}"
      : "\u{2328}\uFE0F Quick actions keyboard activated \u{1F447}",
    { reply_markup: success.reply_markup }
  );
}

// ---- Helper: get user lang ----
function getLang(user: any, from?: any): Lang {
  if (user?.language) return detectLang(user.language);
  if (from?.language_code) return detectLang(from.language_code);
  return "en";
}

// ---- Handle /progress command ----
async function handleProgressCommand(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const from = msg.from;
  if (!from) return;

  await sendChatAction(chatId);

  const user = await findUserByTelegramId(from.id);
  const lang = getLang(user, from);
  if (!user) {
    await sendMessage(chatId, lang === "ru"
      ? "\u0422\u044B \u0435\u0449\u0451 \u043D\u0435 \u043D\u0430\u0447\u0430\u043B. \u041E\u0442\u043F\u0440\u0430\u0432\u044C /start!"
      : "You haven't started yet. Send /start to begin!");
    return;
  }

  const summary = await getUserProgressSummary(user.id);
  const miniAppUrl = getProperMiniAppUrl();

  const progressBar = Array.from({ length: summary.totalDays }, (_, i) => {
    if (i < summary.doneDays) return "\u2705";
    if (i < summary.doneDays + summary.skippedDays) return "\u23ED\uFE0F";
    return "\u2B1C";
  }).join("");

  const text = lang === "ru" ? [
    `<b>\uD83D\uDCCA \u0422\u0432\u043E\u0439 \u043F\u0440\u043E\u0433\u0440\u0435\u0441\u0441</b>`,
    ``, progressBar, ``,
    `\u2705 \u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E: <b>${summary.doneDays}/${summary.totalDays}</b> \u0434\u043D\u0435\u0439`,
    `\uD83D\uDD25 \u0421\u0435\u0440\u0438\u044F: <b>${summary.streak}</b> \u0434\u043D\u0435\u0439`,
    `\u23ED\uFE0F \u041F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E: <b>${summary.skippedDays}</b>`,
    `\u2B50 XP: <b>${summary.xp}</b>`,
    ``, `\u0414\u0435\u043D\u044C ${summary.currentDay} \u0438\u0437 ${summary.totalDays}`,
  ].join("\n") : [
    `<b>\uD83D\uDCCA Your Progress</b>`,
    ``, progressBar, ``,
    `\u2705 Completed: <b>${summary.doneDays}/${summary.totalDays}</b> days`,
    `\uD83D\uDD25 Streak: <b>${summary.streak}</b> days`,
    `\u23ED\uFE0F Skipped: <b>${summary.skippedDays}</b>`,
    `\u2B50 XP: <b>${summary.xp}</b>`,
    ``, `Day ${summary.currentDay} of ${summary.totalDays}`,
  ].join("\n");

  const keyboard: InlineKeyboardButton[][] = [];
  if (miniAppUrl) {
    keyboard.push([
      { text: lang === "ru" ? "\uD83C\uDFAF \u041E\u0442\u043A\u0440\u044B\u0442\u044C" : "\uD83C\uDFAF Open App", web_app: { url: miniAppUrl } },
    ]);
  }
  keyboard.push([
    { text: lang === "ru" ? "\uD83D\uDCCB \u0417\u0430\u0434\u0430\u043D\u0438\u044F" : "\uD83D\uDCCB Today's Tasks", callback_data: "cmd_today" },
    { text: lang === "ru" ? "\u25C0\uFE0F \u041C\u0435\u043D\u044E" : "\u25C0\uFE0F Menu", callback_data: "cmd_menu" },
  ]);

  await sendMessage(chatId, text, { reply_markup: { inline_keyboard: keyboard } });
}

// ---- Handle /today command ----
async function handleTodayCommand(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const from = msg.from;
  if (!from) return;

  await sendChatAction(chatId);

  const user = await findUserByTelegramId(from.id);
  const lang = getLang(user, from);
  if (!user) {
    await sendMessage(chatId, lang === "ru"
      ? "\u0422\u044B \u0435\u0449\u0451 \u043D\u0435 \u043D\u0430\u0447\u0430\u043B. \u041E\u0442\u043F\u0440\u0430\u0432\u044C /start!"
      : "You haven't started yet. Send /start to begin!");
    return;
  }

  const todayData = await getTodayTasks(user.id);
  const miniAppUrl = getProperMiniAppUrl();

  if (!todayData) {
    await sendMessage(chatId, lang === "ru"
      ? "\u041D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0439 \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u044B. \u041E\u0442\u043A\u0440\u043E\u0439 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435!"
      : "No active program found. Open the app to start a program!");
    return;
  }

  const taskLines = todayData.tasks.map((tk) => `  ${tk.emoji} ${tk.title}`).join("\n");

  const text = [
    `<b>\uD83D\uDCCB ${lang === "ru" ? "\u0414\u0435\u043D\u044C" : "Day"} ${todayData.dayNumber}: ${todayData.dayTitle}</b>`,
    `<i>${todayData.programTitle}</i>`,
    ``,
    lang === "ru" ? "\u0417\u0430\u0434\u0430\u043D\u0438\u044F \u043D\u0430 \u0441\u0435\u0433\u043E\u0434\u043D\u044F:" : "Today's tasks:",
    taskLines,
    ``,
    lang === "ru"
      ? "\u041E\u0442\u043A\u0440\u043E\u0439 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0434\u043B\u044F \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F!"
      : "Open the app to complete your tasks and earn XP!",
  ].join("\n");

  const keyboard: InlineKeyboardButton[][] = [];
  if (miniAppUrl) {
    keyboard.push([{
      text: lang === "ru"
        ? `\uD83C\uDFAF \u041D\u0430\u0447\u0430\u0442\u044C \u0434\u0435\u043D\u044C ${todayData.dayNumber}`
        : `\uD83C\uDFAF Start Day ${todayData.dayNumber}`,
      web_app: { url: miniAppUrl },
    }]);
  }
  keyboard.push([
    { text: lang === "ru" ? "\uD83D\uDCCA \u041F\u0440\u043E\u0433\u0440\u0435\u0441\u0441" : "\uD83D\uDCCA Progress", callback_data: "cmd_progress" },
    { text: lang === "ru" ? "\u25C0\uFE0F \u041C\u0435\u043D\u044E" : "\u25C0\uFE0F Menu", callback_data: "cmd_menu" },
  ]);

  await sendMessage(chatId, text, { reply_markup: { inline_keyboard: keyboard } });
}

// ---- Handle /coach command ----
async function handleCoachCommand(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const from = msg.from;
  if (!from) return;

  await sendChatAction(chatId);

  const user = await findUserByTelegramId(from.id);
  const lang = getLang(user, from);
  if (!user) {
    await sendMessage(chatId, lang === "ru"
      ? "\u0422\u044B \u0435\u0449\u0451 \u043D\u0435 \u043D\u0430\u0447\u0430\u043B. \u041E\u0442\u043F\u0440\u0430\u0432\u044C /start!"
      : "You haven't started yet. Send /start to begin!");
    return;
  }

  const miniAppUrl = getProperMiniAppUrl();

  const text = lang === "ru" ? [
    `<b>\uD83E\uDD16 AI-\u043A\u043E\u0443\u0447</b>`,
    ``,
    `AI-\u043A\u043E\u0443\u0447 \u0434\u0430\u0451\u0442 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u0441\u043E\u0432\u0435\u0442\u044B \u043F\u043E\u0441\u043B\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u044F \u0438\u043B\u0438 \u043F\u0440\u043E\u043F\u0443\u0441\u043A\u0430 \u0434\u043D\u044F.`,
    ``,
    `\u041A\u0430\u043A \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u043A\u043E\u0443\u0447\u0438\u043D\u0433:`,
    `1. \u041E\u0442\u043A\u0440\u043E\u0439 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435`,
    `2. \u0412\u044B\u043F\u043E\u043B\u043D\u0438 \u0437\u0430\u0434\u0430\u043D\u0438\u044F (\u0438\u043B\u0438 \u043F\u0440\u043E\u043F\u0443\u0441\u0442\u0438)`,
    `3. \u041D\u0430\u0436\u043C\u0438 \u00AB\u0421\u043F\u0440\u043E\u0441\u0438\u0442\u044C \u043A\u043E\u0443\u0447\u0430\u00BB`,
    ``,
    `\u041A\u043E\u0443\u0447 \u0430\u0434\u0430\u043F\u0442\u0438\u0440\u0443\u0435\u0442\u0441\u044F \u043F\u043E\u0434 \u0442\u0432\u043E\u0439 \u0442\u043E\u043D \u0438 \u044F\u0437\u044B\u043A.`,
  ].join("\n") : [
    `<b>\uD83E\uDD16 AI Coach</b>`,
    ``,
    `Your AI Coach gives personalized advice after you complete or skip a day.`,
    ``,
    `To get coaching:`,
    `1. Open the app`,
    `2. Complete today's tasks (or skip)`,
    `3. Tap "Ask Coach" on the completion screen`,
    ``,
    `The coach adapts to your tone preference and language.`,
  ].join("\n");

  const keyboard: InlineKeyboardButton[][] = [];
  if (miniAppUrl) {
    keyboard.push([{
      text: lang === "ru" ? "\uD83C\uDFAF \u041E\u0442\u043A\u0440\u044B\u0442\u044C" : "\uD83C\uDFAF Open App",
      web_app: { url: miniAppUrl }
    }]);
  }
  keyboard.push([{
    text: lang === "ru" ? "\u25C0\uFE0F \u041C\u0435\u043D\u044E" : "\u25C0\uFE0F Menu",
    callback_data: "cmd_menu"
  }]);

  await sendMessage(chatId, text, { reply_markup: { inline_keyboard: keyboard } });
}

// ---- Handle /challenge command ----
async function handleChallengeCommand(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const from = msg.from;
  if (!from) return;

  await sendChatAction(chatId);

  const user = await findUserByTelegramId(from.id);
  const lang = getLang(user, from);
  const miniAppUrl = getProperMiniAppUrl();

  let challengeInfo = lang === "ru"
    ? "\u0422\u044B \u0435\u0449\u0451 \u043D\u0435 \u0443\u0447\u0430\u0441\u0442\u0432\u0443\u0435\u0448\u044C \u0432 \u0447\u0435\u043B\u043B\u0435\u043D\u0434\u0436\u0430\u0445."
    : "You haven't joined any challenges yet.";

  if (user) {
    const challenges = await kv.getByPrefix("become:challenge:");
    const validChallenges = challenges.filter((ch: any) => ch.id && ch.type && ch.title && ch.status === "active");

    if (validChallenges.length > 0) {
      const userChallenges: string[] = [];
      for (const ch of validChallenges) {
        const member = await kv.get(`become:ch_member:${ch.id}:${user.id}`);
        if (member) {
          userChallenges.push(`\u2022 <b>${ch.title}</b> (${ch.type})`);
        }
      }

      if (userChallenges.length > 0) {
        challengeInfo = lang === "ru"
          ? `\u0422\u0432\u043E\u0438 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0435 \u0447\u0435\u043B\u043B\u0435\u043D\u0434\u0436\u0438:\n${userChallenges.join("\n")}`
          : `Your active challenges:\n${userChallenges.join("\n")}`;
      }
    }
  }

  const text = lang === "ru" ? [
    `<b>\uD83C\uDFC6 \u0427\u0435\u043B\u043B\u0435\u043D\u0434\u0436\u0438</b>`,
    ``, challengeInfo, ``,
    `<b>\u0420\u0435\u0436\u0438\u043C\u044B:</b>`,
    `\u2022 <b>\u0421\u043E\u043B\u043E</b> \u2014 \u041B\u0438\u0447\u043D\u043E\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u043E`,
    `\u2022 <b>\u041A\u043E\u043D\u0442\u0440\u0430\u043A\u0442</b> \u2014 \u0421\u0442\u0430\u0432\u043A\u0430 \u043D\u0430 \u0441\u0435\u0431\u044F`,
    `\u2022 <b>\u041E\u0431\u0449\u0438\u0439 \u043F\u0443\u0442\u044C</b> \u2014 \u041A\u043E\u043C\u0430\u043D\u0434\u043D\u0430\u044F \u0440\u0430\u0431\u043E\u0442\u0430`,
    ``, `\u041E\u0442\u043A\u0440\u043E\u0439 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0434\u043B\u044F \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F \u0438\u043B\u0438 \u0443\u0447\u0430\u0441\u0442\u0438\u044F!`,
  ].join("\n") : [
    `<b>\uD83C\uDFC6 Challenges</b>`,
    ``, challengeInfo, ``,
    `<b>Challenge modes:</b>`,
    `\u2022 <b>Solo</b> \u2014 Free personal commitment`,
    `\u2022 <b>Commitment Contract</b> \u2014 Stake a deposit`,
    `\u2022 <b>Shared Path</b> \u2014 Team up with others`,
    ``, `Open the app to create or join challenges!`,
  ].join("\n");

  const keyboard: InlineKeyboardButton[][] = [];
  if (miniAppUrl) {
    keyboard.push([{
      text: lang === "ru" ? "\uD83C\uDFC6 \u0421\u043C\u043E\u0442\u0440\u0435\u0442\u044C" : "\uD83C\uDFC6 View Challenges",
      web_app: { url: miniAppUrl }
    }]);
  }
  keyboard.push([
    { text: lang === "ru" ? "\u25C0\uFE0F \u041C\u0435\u043D\u044E" : "\u25C0\uFE0F Menu", callback_data: "cmd_menu" },
  ]);

  await sendMessage(chatId, text, { reply_markup: { inline_keyboard: keyboard } });
}

// ---- Handle callback queries ----
async function handleCallbackQuery(cbq: TgCallbackQuery): Promise<void> {
  const chatId = cbq.message?.chat?.id;
  const messageId = cbq.message?.message_id;
  const data = cbq.data;
  const from = cbq.from;

  if (!chatId || !data) {
    await answerCallbackQuery(cbq.id);
    return;
  }

  console.log(`[TG Bot] Callback query: ${data} from user ${from.id}`);

  try {
    switch (data) {
      case "cmd_menu": {
        const cbUser = await findUserByTelegramId(from.id);
        const cbLang = getLang(cbUser, from);
        // Generate fresh bot_auth for the Open App button
        let menuAppUrl: string | undefined;
        if (cbUser) {
          const menuToken = await generateBotAuthToken(cbUser.id, String(from.id));
          menuAppUrl = buildAppUrlWithAuth(menuToken) || undefined;
        }
        const welcome = buildReturningStartMessage(from, undefined, menuAppUrl);
        if (messageId) {
          await editMessageText(chatId, messageId, welcome.text, {
            reply_markup: welcome.reply_markup,
          });
        } else {
          await sendMessage(chatId, welcome.text, { reply_markup: welcome.reply_markup });
        }
        await answerCallbackQuery(cbq.id);
        break;
      }

      case "cmd_progress": {
        const user = await findUserByTelegramId(from.id);
        const pLang = getLang(user, from);
        if (!user) {
          await answerCallbackQuery(cbq.id, {
            text: pLang === "ru" ? "\u041E\u0442\u043F\u0440\u0430\u0432\u044C /start!" : "Send /start first!",
            show_alert: true
          });
          return;
        }

        const summary = await getUserProgressSummary(user.id);
        const miniAppUrl = getProperMiniAppUrl();

        const progressBar = Array.from({ length: summary.totalDays }, (_, i) => {
          if (i < summary.doneDays) return "\u2705";
          if (i < summary.doneDays + summary.skippedDays) return "\u23ED\uFE0F";
          return "\u2B1C";
        }).join("");

        const pText = pLang === "ru" ? [
          `<b>\uD83D\uDCCA \u0422\u0432\u043E\u0439 \u043F\u0440\u043E\u0433\u0440\u0435\u0441\u0441</b>`,
          ``, progressBar, ``,
          `\u2705 \u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E: <b>${summary.doneDays}/${summary.totalDays}</b> \u0434\u043D\u0435\u0439`,
          `\uD83D\uDD25 \u0421\u0435\u0440\u0438\u044F: <b>${summary.streak}</b> \u0434\u043D\u0435\u0439`,
          `\u23ED\uFE0F \u041F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E: <b>${summary.skippedDays}</b>`,
          `\u2B50 XP: <b>${summary.xp}</b>`,
          ``, `\u0414\u0435\u043D\u044C ${summary.currentDay} \u0438\u0437 ${summary.totalDays}`,
        ].join("\n") : [
          `<b>\uD83D\uDCCA Your Progress</b>`,
          ``, progressBar, ``,
          `\u2705 Completed: <b>${summary.doneDays}/${summary.totalDays}</b> days`,
          `\uD83D\uDD25 Streak: <b>${summary.streak}</b> days`,
          `\u23ED\uFE0F Skipped: <b>${summary.skippedDays}</b>`,
          `\u2B50 XP: <b>${summary.xp}</b>`,
          ``, `Day ${summary.currentDay} of ${summary.totalDays}`,
        ].join("\n");

        const pKeyboard: InlineKeyboardButton[][] = [];
        if (miniAppUrl) {
          pKeyboard.push([{
            text: pLang === "ru" ? "\uD83C\uDFAF \u041E\u0442\u043A\u0440\u044B\u0442\u044C" : "\uD83C\uDFAF Open App",
            web_app: { url: miniAppUrl }
          }]);
        }
        pKeyboard.push([
          { text: pLang === "ru" ? "\uD83D\uDCCB \u0417\u0430\u0434\u0430\u043D\u0438\u044F" : "\uD83D\uDCCB Today", callback_data: "cmd_today" },
          { text: pLang === "ru" ? "\u25C0\uFE0F \u041C\u0435\u043D\u044E" : "\u25C0\uFE0F Menu", callback_data: "cmd_menu" },
        ]);

        if (messageId) {
          await editMessageText(chatId, messageId, pText, {
            reply_markup: { inline_keyboard: pKeyboard },
          });
        } else {
          await sendMessage(chatId, pText, { reply_markup: { inline_keyboard: pKeyboard } });
        }
        await answerCallbackQuery(cbq.id);
        break;
      }

      case "cmd_today": {
        const user = await findUserByTelegramId(from.id);
        const tLang = getLang(user, from);
        if (!user) {
          await answerCallbackQuery(cbq.id, {
            text: tLang === "ru" ? "\u041E\u0442\u043F\u0440\u0430\u0432\u044C /start!" : "Send /start first!",
            show_alert: true
          });
          return;
        }

        const todayData = await getTodayTasks(user.id);
        const miniAppUrl = getProperMiniAppUrl();

        if (!todayData) {
          await answerCallbackQuery(cbq.id, {
            text: tLang === "ru" ? "\u041D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0439 \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u044B" : "No active program found",
            show_alert: true
          });
          return;
        }

        const taskLines = todayData.tasks.map((tk) => `  ${tk.emoji} ${tk.title}`).join("\n");
        const tText = [
          `<b>\uD83D\uDCCB ${tLang === "ru" ? "\u0414\u0435\u043D\u044C" : "Day"} ${todayData.dayNumber}: ${todayData.dayTitle}</b>`,
          `<i>${todayData.programTitle}</i>`,
          ``,
          tLang === "ru" ? "\u0417\u0430\u0434\u0430\u043D\u0438\u044F:" : "Today's tasks:",
          taskLines,
          ``,
          tLang === "ru" ? "\u041E\u0442\u043A\u0440\u043E\u0439 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435!" : "Open the app to complete your tasks!",
        ].join("\n");

        const tKeyboard: InlineKeyboardButton[][] = [];
        if (miniAppUrl) {
          tKeyboard.push([{
            text: tLang === "ru"
              ? `\uD83C\uDFAF \u041D\u0430\u0447\u0430\u0442\u044C \u0434\u0435\u043D\u044C ${todayData.dayNumber}`
              : `\uD83C\uDFAF Start Day ${todayData.dayNumber}`,
            web_app: { url: miniAppUrl },
          }]);
        }
        tKeyboard.push([
          { text: tLang === "ru" ? "\uD83D\uDCCA \u041F\u0440\u043E\u0433\u0440\u0435\u0441\u0441" : "\uD83D\uDCCA Progress", callback_data: "cmd_progress" },
          { text: tLang === "ru" ? "\u25C0\uFE0F \u041C\u0435\u043D\u044E" : "\u25C0\uFE0F Menu", callback_data: "cmd_menu" },
        ]);

        if (messageId) {
          await editMessageText(chatId, messageId, tText, {
            reply_markup: { inline_keyboard: tKeyboard },
          });
        } else {
          await sendMessage(chatId, tText, { reply_markup: { inline_keyboard: tKeyboard } });
        }
        await answerCallbackQuery(cbq.id);
        break;
      }

      case "cmd_coach": {
        const coachUser = await findUserByTelegramId(from.id);
        const cLang = getLang(coachUser, from);
        const miniAppUrl = getProperMiniAppUrl();
        const cText = cLang === "ru" ? [
          `<b>\uD83E\uDD16 AI-\u043A\u043E\u0443\u0447</b>`,
          ``,
          `\u0417\u0430\u0432\u0435\u0440\u0448\u0438 \u0438\u043B\u0438 \u043F\u0440\u043E\u043F\u0443\u0441\u0442\u0438 \u0434\u0435\u043D\u044C \u0432 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0438, \u0447\u0442\u043E\u0431\u044B \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0439 \u043A\u043E\u0443\u0447\u0438\u043D\u0433.`,
          ``,
          `\u041A\u043E\u0443\u0447 \u0430\u0434\u0430\u043F\u0442\u0438\u0440\u0443\u0435\u0442\u0441\u044F \u043F\u043E\u0434 \u0442\u0432\u043E\u0439 \u0442\u043E\u043D \u0438 \u044F\u0437\u044B\u043A.`,
        ].join("\n") : [
          `<b>\uD83E\uDD16 AI Coach</b>`,
          ``,
          `Complete or skip a day in the app to get personalized coaching advice.`,
          ``,
          `The coach adapts to your preferred tone and language.`,
        ].join("\n");

        const cKeyboard: InlineKeyboardButton[][] = [];
        if (miniAppUrl) {
          cKeyboard.push([{
            text: cLang === "ru" ? "\uD83C\uDFAF \u041E\u0442\u043A\u0440\u044B\u0442\u044C" : "\uD83C\uDFAF Open App",
            web_app: { url: miniAppUrl }
          }]);
        }
        cKeyboard.push([{
          text: cLang === "ru" ? "\u25C0\uFE0F \u041C\u0435\u043D\u044E" : "\u25C0\uFE0F Menu",
          callback_data: "cmd_menu"
        }]);

        if (messageId) {
          await editMessageText(chatId, messageId, cText, {
            reply_markup: { inline_keyboard: cKeyboard },
          });
        } else {
          await sendMessage(chatId, cText, { reply_markup: { inline_keyboard: cKeyboard } });
        }
        await answerCallbackQuery(cbq.id);
        break;
      }

      case "cmd_challenges": {
        const user = await findUserByTelegramId(from.id);
        const chLang = getLang(user, from);
        const miniAppUrl = getProperMiniAppUrl();

        let challengeInfo = chLang === "ru"
          ? "\u041D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0447\u0435\u043B\u043B\u0435\u043D\u0434\u0436\u0435\u0439."
          : "No active challenges yet.";
        if (user) {
          const challenges = await kv.getByPrefix("become:challenge:");
          const activeCh = challenges.filter((ch: any) => ch.id && ch.status === "active");
          if (activeCh.length > 0) {
            const lines: string[] = [];
            for (const ch of activeCh.slice(0, 5)) {
              const member = await kv.get(`become:ch_member:${ch.id}:${user.id}`);
              const badge = member ? "\u2705" : "\uD83D\uDC65";
              lines.push(`${badge} <b>${ch.title}</b> (${ch.type})`);
            }
            challengeInfo = lines.join("\n");
          }
        }

        const chText = [
          `<b>\uD83C\uDFC6 ${chLang === "ru" ? "\u0427\u0435\u043B\u043B\u0435\u043D\u0434\u0436\u0438" : "Challenges"}</b>`,
          ``,
          challengeInfo,
          ``,
          chLang === "ru"
            ? "\u041E\u0442\u043A\u0440\u043E\u0439 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0434\u043B\u044F \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F \u0438\u043B\u0438 \u0443\u0447\u0430\u0441\u0442\u0438\u044F!"
            : "Open the app to create or join challenges!",
        ].join("\n");

        const chKeyboard: InlineKeyboardButton[][] = [];
        // DISABLED: web_app button doesn't work from Figma Sites context
        // if (miniAppUrl) {
        //   chKeyboard.push([{
        //     text: chLang === "ru" ? "\uD83C\uDFC6 \u0421\u043C\u043E\u0442\u0440\u0435\u0442\u044C" : "\uD83C\uDFC6 View Challenges",
        //     web_app: { url: miniAppUrl }
        //   }]);
        // }
        chKeyboard.push([{
          text: chLang === "ru" ? "\u25C0\uFE0F \u041C\u0435\u043D\u044E" : "\u25C0\uFE0F Menu",
          callback_data: "cmd_menu"
        }]);

        if (messageId) {
          await editMessageText(chatId, messageId, chText, {
            reply_markup: { inline_keyboard: chKeyboard },
          });
        } else {
          await sendMessage(chatId, chText, { reply_markup: { inline_keyboard: chKeyboard } });
        }
        await answerCallbackQuery(cbq.id);
        break;
      }

      case "cmd_settings": {
        const user = await findUserByTelegramId(from.id);
        const lang = user?.language || "en";
        const tone = user?.tone || "supportive";

        const settings = buildSettingsMessage(lang, tone);

        if (messageId) {
          await editMessageText(chatId, messageId, settings.text, {
            reply_markup: settings.reply_markup,
          });
        } else {
          await sendMessage(chatId, settings.text, { reply_markup: settings.reply_markup });
        }
        await answerCallbackQuery(cbq.id);
        break;
      }

      // cmd_request_contact is no longer used — account is created from TG data directly
      case "cmd_request_contact": {
        await answerCallbackQuery(cbq.id);
        break;
      }

      // Sync — prompt user to re-share contact (best sync: updates name, phone, avatar, tokens)
      case "cmd_sync": {
        const syncUser = await findUserByTelegramId(from.id);
        const syncLang = getLang(syncUser, from);

        if (!syncUser) {
          await answerCallbackQuery(cbq.id, {
            text: syncLang === "ru" ? "\u274C \u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D. \u041E\u0442\u043F\u0440\u0430\u0432\u044C /start" : "\u274C User not found. Send /start",
            show_alert: true,
          });
          break;
        }

        // Prompt user to re-share contact for data sync
        const contactKb = {
          keyboard: [
            [{ text: syncLang === "ru" ? "\u{1F4F2} \u041F\u043E\u0434\u0435\u043B\u0438\u0441\u044C \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u043E\u043C" : "\u{1F4F2} Share Contact", request_contact: true }],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
          input_field_placeholder: syncLang === "ru"
            ? "\u041D\u0430\u0436\u043C\u0438 \u043A\u043D\u043E\u043F\u043A\u0443 \u043D\u0438\u0436\u0435..."
            : "Tap the button below...",
        };
        await sendMessage(chatId,
          syncLang === "ru"
            ? "\u{1F504} <b>\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u0434\u0430\u043D\u043D\u044B\u0445</b>\n\n\u{1F447} <b>\u041D\u0430\u0436\u043C\u0438 \u043A\u043D\u043E\u043F\u043A\u0443 \u043D\u0438\u0436\u0435</b>, \u0447\u0442\u043E\u0431\u044B \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0441\u0432\u043E\u0438 \u0434\u0430\u043D\u043D\u044B\u0435 \u0438 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u0440\u043E\u0444\u0438\u043B\u044C:"
            : "\u{1F504} <b>Update Data</b>\n\n\u{1F447} <b>Tap the button below</b> to update your data and sync your profile:",
          { reply_markup: contactKb }
        );
        await answerCallbackQuery(cbq.id);
        break;
      }

      // Verify — show auth status card (kept for backward compatibility)
      case "cmd_verify": {
        const verifyUser = await findUserByTelegramId(from.id);
        const verifyLang = getLang(verifyUser, from);
        if (verifyUser) {
          const verifyText = verifyLang === "ru"
            ? [
                `<b>\u2705 \u0412\u0435\u0440\u0438\u0444\u0438\u043A\u0430\u0446\u0438\u044F \u043F\u0440\u043E\u0439\u0434\u0435\u043D\u0430</b>`,
                ``,
                `\u{1F464} <b>\u0418\u043C\u044F:</b> ${verifyUser.firstName}${verifyUser.lastName ? " " + verifyUser.lastName : ""}`,
                verifyUser.username ? `\u{1F4CE} <b>Username:</b> @${verifyUser.username}` : "",
                `\u{1F4F1} <b>\u0422\u0435\u043B\u0435\u0444\u043E\u043D:</b> ${verifyUser.phoneNumber || "\u2014"}`,
                `\u{1F30D} <b>\u042F\u0437\u044B\u043A:</b> ${verifyUser.language === "ru" ? "\u0420\u0443\u0441\u0441\u043A\u0438\u0439" : "English"}`,
                `\u{2B50} <b>XP:</b> ${verifyUser.xp || 0}`,
                `\u{1F4C5} <b>\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044F:</b> ${new Date(verifyUser.createdAt).toLocaleDateString("ru-RU")}`,
                verifyUser.photoUrl ? `\u{1F4F7} <b>\u0410\u0432\u0430\u0442\u0430\u0440:</b> \u2705` : `\u{1F4F7} <b>\u0410\u0432\u0430\u0442\u0430\u0440:</b> \u274C`,
              ].filter(Boolean).join("\n")
            : [
                `<b>\u2705 Verification Passed</b>`,
                ``,
                `\u{1F464} <b>Name:</b> ${verifyUser.firstName}${verifyUser.lastName ? " " + verifyUser.lastName : ""}`,
                verifyUser.username ? `\u{1F4CE} <b>Username:</b> @${verifyUser.username}` : "",
                `\u{1F4F1} <b>Phone:</b> ${verifyUser.phoneNumber || "\u2014"}`,
                `\u{1F30D} <b>Language:</b> ${verifyUser.language === "ru" ? "Russian" : "English"}`,
                `\u{2B50} <b>XP:</b> ${verifyUser.xp || 0}`,
                `\u{1F4C5} <b>Registered:</b> ${new Date(verifyUser.createdAt).toLocaleDateString("en-US")}`,
                verifyUser.photoUrl ? `\u{1F4F7} <b>Avatar:</b> \u2705` : `\u{1F4F7} <b>Avatar:</b> \u274C`,
              ].filter(Boolean).join("\n");
          const verifyKb: InlineKeyboardButton[][] = [
            [{ text: verifyLang === "ru" ? "\u{1F504} \u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0430\u0432\u0430\u0442\u0430\u0440" : "\u{1F504} Refresh Avatar", callback_data: "cmd_refresh_avatar" }],
            [{ text: verifyLang === "ru" ? "\u{2699}\uFE0F \u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438" : "\u{2699}\uFE0F Settings", callback_data: "cmd_settings" }],
          ];
          if (messageId) {
            await editMessageText(chatId, messageId, verifyText, { reply_markup: { inline_keyboard: verifyKb } });
          } else {
            await sendMessage(chatId, verifyText, { reply_markup: { inline_keyboard: verifyKb } });
          }
        } else {
          await sendMessage(chatId,
            verifyLang === "ru"
              ? "\u274C \u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D. \u041E\u0442\u043F\u0440\u0430\u0432\u044C /start \u0434\u043B\u044F \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438."
              : "\u274C User not found. Send /start to register."
          );
        }
        await answerCallbackQuery(cbq.id);
        break;
      }

      // Refresh avatar from Telegram profile photo
      case "cmd_refresh_avatar": {
        const avatarUser = await findUserByTelegramId(from.id);
        const avatarLang = getLang(avatarUser, from);
        if (avatarUser) {
          const newAvatarUrl = await fetchUserAvatarUrl(from.id);
          if (newAvatarUrl) {
            avatarUser.photoUrl = newAvatarUrl;
            avatarUser.updatedAt = new Date().toISOString();
            await kv.set(`become:user:${avatarUser.id}`, avatarUser);
            await answerCallbackQuery(cbq.id, {
              text: avatarLang === "ru" ? "\u2705 \u0410\u0432\u0430\u0442\u0430\u0440 \u043E\u0431\u043D\u043E\u0432\u043B\u0451\u043D!" : "\u2705 Avatar updated!",
            });
          } else {
            await answerCallbackQuery(cbq.id, {
              text: avatarLang === "ru" ? "\u274C \u0424\u043E\u0442\u043E \u043F\u0440\u043E\u0444\u0438\u043B\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E" : "\u274C No profile photo found",
              show_alert: true,
            });
          }
        } else {
          await answerCallbackQuery(cbq.id, { text: "User not found" });
        }
        break;
      }

      case "cmd_help": {
        const helpUser = await findUserByTelegramId(from.id);
        const helpLang = getLang(helpUser, from);
        const help = buildHelpMessage(helpLang);
        if (messageId) {
          await editMessageText(chatId, messageId, help.text, {
            reply_markup: help.reply_markup,
          });
        } else {
          await sendMessage(chatId, help.text, { reply_markup: help.reply_markup });
        }
        await answerCallbackQuery(cbq.id);
        break;
      }

      // Settings: language changes
      case "set_lang_en":
      case "set_lang_ru": {
        const langCode = data === "set_lang_en" ? "en" : "ru";
        const user = await findUserByTelegramId(from.id);
        if (user) {
          user.language = langCode;
          user.updatedAt = new Date().toISOString();
          await kv.set(`become:user:${user.id}`, user);
        }
        const settings = buildSettingsMessage(langCode, user?.tone || "supportive");
        if (messageId) {
          await editMessageText(chatId, messageId, settings.text, {
            reply_markup: settings.reply_markup,
          });
        }
        await answerCallbackQuery(cbq.id, {
          text: langCode === "en" ? "Language set to English" : "\uD83C\uDDF7\uD83C\uDDFA \u042F\u0437\u044B\u043A: \u0440\u0443\u0441\u0441\u043A\u0438\u0439",
        });
        break;
      }

      // Settings: tone changes
      case "set_tone_support":
      case "set_tone_strict":
      case "set_tone_hybrid": {
        const tone = data.replace("set_tone_", "");
        const user = await findUserByTelegramId(from.id);
        if (user) {
          user.tone = tone;
          user.updatedAt = new Date().toISOString();
          await kv.set(`become:user:${user.id}`, user);
        }
        const settings = buildSettingsMessage(user?.language || "en", tone);
        if (messageId) {
          await editMessageText(chatId, messageId, settings.text, {
            reply_markup: settings.reply_markup,
          });
        }
        const toneLang = getLang(user, from);
        const toneLabelsI18n: Record<string, Record<Lang, string>> = {
          support: { en: "Supportive", ru: "\u041F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u044E\u0449\u0438\u0439" },
          strict: { en: "Strict", ru: "\u0421\u0442\u0440\u043E\u0433\u0438\u0439" },
          hybrid: { en: "Balanced", ru: "\u0411\u0430\u043B\u0430\u043D\u0441" },
        };
        const toneText = toneLabelsI18n[tone]?.[toneLang] || tone;
        await answerCallbackQuery(cbq.id, {
          text: toneLang === "ru" ? `\u0422\u043E\u043D: ${toneText}` : `Tone set to ${toneText}`,
        });
        break;
      }

      default: {
        // ---- Payment callbacks from /payment command ----
        if (data.startsWith("pay_sub_")) {
          // Direct subscription purchase via Stars invoice in chat
          const planDays = data.replace("pay_sub_", "");
          const subPlans: Record<string, { days: number; stars: number; title_en: string; title_ru: string; desc_en: string; desc_ru: string }> = {
            "30": { days: 30, stars: 350, title_en: "Proper Food Premium — 1 Month", title_ru: "Proper Food Premium — 1 месяц", desc_en: "30 days of full access to all features", desc_ru: "30 дней полного доступа ко всем функциям" },
            "60": { days: 60, stars: 600, title_en: "Proper Food Premium — 2 Months", title_ru: "Proper Food Premium — 2 месяца", desc_en: "60 days of full access (save 14%)", desc_ru: "60 дней полного доступа (экономия 14%)" },
            "90": { days: 90, stars: 900, title_en: "Proper Food Premium — 3 Months", title_ru: "Proper Food Premium — 3 месяца", desc_en: "90 days of full access (save 14%)", desc_ru: "90 дней полного доступа (экономия 14%)" },
          };
          const plan = subPlans[planDays];
          if (plan) {
            const payUser = await findUserByTelegramId(from.id);
            const payUserId = payUser?.id || "";
            const payLang = getLang(payUser, from);
            await answerCallbackQuery(cbq.id, {
              text: payLang === "ru" ? "\u{1F4E4} \u041E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u043C \u0441\u0447\u0451\u0442..." : "\u{1F4E4} Sending invoice...",
            });
            await sendInvoice({
              chatId,
              title: payLang === "ru" ? plan.title_ru : plan.title_en,
              description: payLang === "ru" ? plan.desc_ru : plan.desc_en,
              payload: `sub_${planDays}_${payUserId}_${Date.now()}`,
              currency: "XTR",
              prices: [{ label: payLang === "ru" ? "\u041F\u043E\u0434\u043F\u0438\u0441\u043A\u0430" : "Subscription", amount: plan.stars }],
            });
            console.log(`[Payment] /payment callback: sent sub invoice plan=${planDays} to chat ${chatId}`);
          } else {
            await answerCallbackQuery(cbq.id, { text: "Invalid plan", show_alert: true });
          }
          break;
        }

        if (data.startsWith("pay_topup_")) {
          // Top up Stars balance via invoice in chat
          const amount = parseInt(data.replace("pay_topup_", ""), 10);
          if (amount > 0) {
            const payUser = await findUserByTelegramId(from.id);
            const payUserId = payUser?.id || "";
            const payLang = getLang(payUser, from);
            await answerCallbackQuery(cbq.id, {
              text: payLang === "ru" ? "\u{1F4E4} \u041E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u043C \u0441\u0447\u0451\u0442..." : "\u{1F4E4} Sending invoice...",
            });
            await sendInvoice({
              chatId,
              title: payLang === "ru" ? `\u041F\u043E\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 \u2014 ${amount} \u2B50` : `Top Up \u2014 ${amount} \u2B50`,
              description: payLang === "ru" ? `Пополнение баланса Proper Food на ${amount} Stars` : `Add ${amount} Stars to your Proper Food balance`,
              payload: `topup_${amount}_${payUserId}_${Date.now()}`,
              currency: "XTR",
              prices: [{ label: payLang === "ru" ? "\u041F\u043E\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435" : "Top Up", amount }],
            });
            console.log(`[Payment] /payment callback: sent topup invoice amount=${amount} to chat ${chatId}`);
          } else {
            await answerCallbackQuery(cbq.id, { text: "Invalid amount", show_alert: true });
          }
          break;
        }

        if (data === "pay_from_balance") {
          // Show plan selection for paying from internal balance
          const payUser = await findUserByTelegramId(from.id);
          const payLang = getLang(payUser, from);
          const payWallet = await kv.get(`become:wallet:${payUser?.id}`);
          const available = (payWallet?.starsBalance || 0) - (payWallet?.starsReserved || 0);

          const balKeyboard: InlineKeyboardButton[][] = [];
          if (available >= 350) {
            balKeyboard.push([{ text: `30d \u00B7 350\u2B50 ${payLang === "ru" ? "\u0441 \u0431\u0430\u043B\u0430\u043D\u0441\u0430" : "from balance"}`, callback_data: "pay_bal_30" }]);
          }
          if (available >= 600) {
            balKeyboard.push([{ text: `60d \u00B7 600\u2B50 ${payLang === "ru" ? "\u0441 \u0431\u0430\u043B\u0430\u043D\u0441\u0430" : "from balance"}`, callback_data: "pay_bal_60" }]);
          }
          if (available >= 900) {
            balKeyboard.push([{ text: `90d \u00B7 900\u2B50 ${payLang === "ru" ? "\u0441 \u0431\u0430\u043B\u0430\u043D\u0441\u0430" : "from balance"}`, callback_data: "pay_bal_90" }]);
          }
          balKeyboard.push([{ text: payLang === "ru" ? "\u25C0\uFE0F \u041D\u0430\u0437\u0430\u0434" : "\u25C0\uFE0F Back", callback_data: "pay_back" }]);

          const balText = payLang === "ru"
            ? `<b>\u{1F4B0} \u041E\u043F\u043B\u0430\u0442\u0430 \u0441 \u0431\u0430\u043B\u0430\u043D\u0441\u0430</b>\n\n\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u043E: <b>${available} Stars</b>\n\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u043B\u0430\u043D:`
            : `<b>\u{1F4B0} Pay from Balance</b>\n\nAvailable: <b>${available} Stars</b>\nChoose a plan:`;

          if (messageId) {
            await editMessageText(chatId, messageId, balText, { reply_markup: { inline_keyboard: balKeyboard } });
          } else {
            await sendMessage(chatId, balText, { reply_markup: { inline_keyboard: balKeyboard } });
          }
          await answerCallbackQuery(cbq.id);
          break;
        }

        if (data.startsWith("pay_bal_")) {
          // Pay subscription from internal Stars balance
          const planDays = data.replace("pay_bal_", "");
          const pricing: Record<string, { days: number; stars: number }> = {
            "30": { days: 30, stars: 350 },
            "60": { days: 60, stars: 600 },
            "90": { days: 90, stars: 900 },
          };
          const planInfo = pricing[planDays];
          if (!planInfo) {
            await answerCallbackQuery(cbq.id, { text: "Invalid plan", show_alert: true });
            break;
          }

          const payUser = await findUserByTelegramId(from.id);
          const payLang = getLang(payUser, from);
          if (!payUser) {
            await answerCallbackQuery(cbq.id, {
              text: payLang === "ru" ? "\u041E\u0442\u043F\u0440\u0430\u0432\u044C /start!" : "Send /start first!",
              show_alert: true,
            });
            break;
          }

          let payWallet = await kv.get(`become:wallet:${payUser.id}`);
          if (!payWallet) payWallet = { id: generateId("wallet"), userId: payUser.id, starsBalance: 0, tonBalance: 0, starsReserved: 0, tonReserved: 0 };
          if (payWallet.starsReserved === undefined) payWallet.starsReserved = 0;

          const available = payWallet.starsBalance - payWallet.starsReserved;
          if (available < planInfo.stars) {
            await answerCallbackQuery(cbq.id, {
              text: payLang === "ru"
                ? `\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u0441\u0440\u0435\u0434\u0441\u0442\u0432. \u041D\u0443\u0436\u043D\u043E: ${planInfo.stars}, \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E: ${available}`
                : `Insufficient funds. Need: ${planInfo.stars}, available: ${available}`,
              show_alert: true,
            });
            break;
          }

          // Deduct from balance
          payWallet.starsBalance -= planInfo.stars;
          await kv.set(`become:wallet:${payUser.id}`, payWallet);

          // Extend subscription
          const currentExpiry = payUser.subscriptionExpiresAt
            ? new Date(payUser.subscriptionExpiresAt).getTime()
            : Date.now();
          const base = Math.max(currentExpiry, Date.now());
          payUser.subscriptionExpiresAt = new Date(base + planInfo.days * 24 * 60 * 60 * 1000).toISOString();
          payUser.updatedAt = new Date().toISOString();
          await kv.set(`become:user:${payUser.id}`, payUser);

          // Record payment
          const paymentId = generateId("pay");
          await kv.set(`become:payment:${paymentId}`, {
            id: paymentId,
            userId: payUser.id,
            telegramId: String(from.id),
            currency: "XTR",
            amount: planInfo.stars,
            payload: `balance_sub_${planDays}`,
            daysAdded: planInfo.days,
            type: "subscription",
            source: "wallet_balance_bot",
            createdAt: new Date().toISOString(),
          });
          const paymentList = await kv.get(`become:payments:${payUser.id}`) || [];
          paymentList.push(paymentId);
          await kv.set(`become:payments:${payUser.id}`, paymentList);

          console.log(`[Payment] Balance payment from bot: user=${payUser.id}, plan=${planDays}, stars=${planInfo.stars}`);
          await logTransaction(payUser.id, "subscription", planInfo.stars, "stars", { description: `+${planInfo.days}d` });

          // Fire-and-forget: grant referral bonus to referrer if applicable
          grantReferralBonusOnSubscription(payUser.id).catch(() => {});

          const successText = payLang === "ru"
            ? `\u2705 <b>\u041E\u043F\u043B\u0430\u0442\u0430 \u043F\u0440\u043E\u0448\u043B\u0430 \u0443\u0441\u043F\u0435\u0448\u043D\u043E!</b>\n\n\u{1F389} \u041F\u043E\u0434\u043F\u0438\u0441\u043A\u0430 \u043F\u0440\u043E\u0434\u043B\u0435\u043D\u0430 \u043D\u0430 <b>${planInfo.days} \u0434\u043D\u0435\u0439</b>.\n\u0421\u043F\u0438\u0441\u0430\u043D\u043E: <b>${planInfo.stars} Stars</b>\n\u041E\u0441\u0442\u0430\u0442\u043E\u043A: <b>${payWallet.starsBalance} Stars</b>\n\u0414\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 \u0434\u043E: <b>${new Date(payUser.subscriptionExpiresAt).toLocaleDateString("ru-RU")}</b>`
            : `\u2705 <b>Payment successful!</b>\n\n\u{1F389} Subscription extended by <b>${planInfo.days} days</b>.\nCharged: <b>${planInfo.stars} Stars</b>\nRemaining: <b>${payWallet.starsBalance} Stars</b>\nValid until: <b>${new Date(payUser.subscriptionExpiresAt).toLocaleDateString("en-US")}</b>`;

          if (messageId) {
            await editMessageText(chatId, messageId, successText);
          } else {
            await sendMessage(chatId, successText);
          }
          await answerCallbackQuery(cbq.id);
          break;
        }

        if (data === "pay_back") {
          // Return to /payment menu — re-trigger the message
          const payUser = await findUserByTelegramId(from.id);
          const payLang = getLang(payUser, from);

          // Re-build the payment menu text inline
          let payWallet = await kv.get(`become:wallet:${payUser?.id}`);
          if (!payWallet) payWallet = { starsBalance: 0, tonBalance: 0, starsReserved: 0, tonReserved: 0 };

          const pNow = Date.now();
          const pExp = payUser?.subscriptionExpiresAt ? new Date(payUser.subscriptionExpiresAt).getTime() : 0;
          const pActive = pExp > pNow;
          const pDays = pActive ? Math.ceil((pExp - pNow) / (24 * 60 * 60 * 1000)) : 0;

          const pStatus = pActive
            ? (payLang === "ru" ? `\u2705 \u041F\u043E\u0434\u043F\u0438\u0441\u043A\u0430 \u0430\u043A\u0442\u0438\u0432\u043D\u0430 (${pDays} \u0434\u043D.)` : `\u2705 Subscription active (${pDays} days)`)
            : (payLang === "ru" ? "\u274C \u041F\u043E\u0434\u043F\u0438\u0441\u043A\u0430 \u043D\u0435\u0430\u043A\u0442\u0438\u0432\u043D\u0430" : "\u274C Subscription inactive");

          const pBal = payLang === "ru"
            ? `\u2B50 \u0411\u0430\u043B\u0430\u043D\u0441: <b>${payWallet.starsBalance || 0} Stars</b> \u00B7 <b>${(payWallet.tonBalance || 0).toFixed(1)} TON</b>`
            : `\u2B50 Balance: <b>${payWallet.starsBalance || 0} Stars</b> \u00B7 <b>${(payWallet.tonBalance || 0).toFixed(1)} TON</b>`;

          const pText = payLang === "ru" ? [
            `<b>\u{1F48E} \u041E\u043F\u043B\u0430\u0442\u0430 \u0438 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0430</b>`, ``, pStatus, pBal, ``,
            `<b>\u041F\u043B\u0430\u043D\u044B \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0438 (Telegram Stars):</b>`,
            `\u2022 30 \u0434\u043D\u0435\u0439 \u2014 350 \u2B50`, `\u2022 60 \u0434\u043D\u0435\u0439 \u2014 600 \u2B50`, `\u2022 90 \u0434\u043D\u0435\u0439 \u2014 900 \u2B50`,
            ``, `\u{1F4B3} \u0412\u043E\u043F\u0440\u043E\u0441\u044B \u043F\u043E \u043E\u043F\u043B\u0430\u0442\u0435? \u2192 /paysupport`,
          ].join("\n") : [
            `<b>\u{1F48E} Payment & Subscription</b>`, ``, pStatus, pBal, ``,
            `<b>Subscription plans (Telegram Stars):</b>`,
            `\u2022 30 days \u2014 350 \u2B50`, `\u2022 60 days \u2014 600 \u2B50`, `\u2022 90 days \u2014 900 \u2B50`,
            ``, `\u{1F4B3} Payment issues? \u2192 /paysupport`,
          ].join("\n");

          const pAvail = (payWallet.starsBalance || 0) - (payWallet.starsReserved || 0);
          const pKb: InlineKeyboardButton[][] = [
            [
              { text: "30d \u00B7 350\u2B50", callback_data: "pay_sub_30" },
              { text: "60d \u00B7 600\u2B50", callback_data: "pay_sub_60" },
              { text: "90d \u00B7 900\u2B50", callback_data: "pay_sub_90" },
            ],
            [
              { text: "\u2795 100\u2B50", callback_data: "pay_topup_100" },
              { text: "\u2795 250\u2B50", callback_data: "pay_topup_250" },
              { text: "\u2795 500\u2B50", callback_data: "pay_topup_500" },
            ],
          ];
          if (pAvail >= 350) {
            pKb.push([{ text: payLang === "ru" ? "\u{1F4B0} \u041E\u043F\u043B\u0430\u0442\u0438\u0442\u044C \u0441 \u0431\u0430\u043B\u0430\u043D\u0441\u0430" : "\u{1F4B0} Pay from balance", callback_data: "pay_from_balance" }]);
          }
          pKb.push([{ text: payLang === "ru" ? "\u25C0\uFE0F \u041C\u0435\u043D\u044E" : "\u25C0\uFE0F Menu", callback_data: "cmd_menu" }]);

          if (messageId) {
            await editMessageText(chatId, messageId, pText, { reply_markup: { inline_keyboard: pKb } });
          } else {
            await sendMessage(chatId, pText, { reply_markup: { inline_keyboard: pKb } });
          }
          await answerCallbackQuery(cbq.id);
          break;
        }

        await answerCallbackQuery(cbq.id, { text: "Unknown action" });
        break;
      }
    }
  } catch (err) {
    console.log(`[TG Bot] Callback error for '${data}':`, err);
    await answerCallbackQuery(cbq.id, { text: "Something went wrong", show_alert: true });
  }
}

// ---- Handle /paysupport command ----
// Required by Telegram payment policy — directs users to payment support
async function handlePaySupportCommand(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const from = msg.from;
  if (!from) return;

  const user = await findUserByTelegramId(from.id);
  const lang = getLang(user, from);

  const text = lang === "ru" ? [
    `<b>\u{1F4B3} \u041F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0430 \u043F\u043E \u043E\u043F\u043B\u0430\u0442\u0435</b>`,
    ``,
    `\u0415\u0441\u043B\u0438 \u0443 \u0432\u0430\u0441 \u0432\u043E\u0437\u043D\u0438\u043A\u043B\u0438 \u0432\u043E\u043F\u0440\u043E\u0441\u044B \u0438\u043B\u0438 \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u044B \u0441 \u043E\u043F\u043B\u0430\u0442\u043E\u0439:`,
    ``,
    `\u2022 <b>\u0412\u043E\u0437\u0432\u0440\u0430\u0442 \u0441\u0440\u0435\u0434\u0441\u0442\u0432</b> \u2014 Telegram Stars \u043C\u043E\u0436\u043D\u043E \u0432\u0435\u0440\u043D\u0443\u0442\u044C \u0447\u0435\u0440\u0435\u0437 Telegram \u0432 \u0442\u0435\u0447\u0435\u043D\u0438\u0435 \u0441\u0440\u043E\u043A\u0430 \u0432\u043E\u0437\u0432\u0440\u0430\u0442\u0430`,
    `\u2022 <b>\u041D\u0435 \u0437\u0430\u0447\u0438\u0441\u043B\u0438\u043B\u0441\u044F \u043F\u043B\u0430\u0442\u0451\u0436</b> \u2014 \u043D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u0432 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0443 \u0441 \u0434\u0435\u0442\u0430\u043B\u044F\u043C\u0438 \u0442\u0440\u0430\u043D\u0437\u0430\u043A\u0446\u0438\u0438`,
    `\u2022 <b>\u0421\u043F\u043E\u0440\u043D\u044B\u0435 \u0441\u0438\u0442\u0443\u0430\u0446\u0438\u0438</b> \u2014 \u043C\u044B \u0440\u0430\u0437\u0431\u0435\u0440\u0451\u043C\u0441\u044F \u0432 \u043A\u0440\u0430\u0442\u0447\u0430\u0439\u0448\u0438\u0435 \u0441\u0440\u043E\u043A\u0438`,
    ``,
    `\u{1F4E9} <b>\u041A\u043E\u043D\u0442\u0430\u043A\u0442 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0438:</b> @tezam_by`,
    ``,
    `\u041F\u0440\u0438 \u043E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u0438 \u0443\u043A\u0430\u0436\u0438\u0442\u0435:`,
    `1. \u0412\u0430\u0448 Telegram ID: <code>${from.id}</code>`,
    `2. \u0414\u0430\u0442\u0443 \u0438 \u0441\u0443\u043C\u043C\u0443 \u043F\u043B\u0430\u0442\u0435\u0436\u0430`,
    `3. \u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u044B`,
  ].join("\n") : [
    `<b>\u{1F4B3} Payment Support</b>`,
    ``,
    `If you have any payment questions or issues:`,
    ``,
    `\u2022 <b>Refunds</b> \u2014 Telegram Stars can be refunded through Telegram within the refund period`,
    `\u2022 <b>Payment not credited</b> \u2014 contact support with your transaction details`,
    `\u2022 <b>Disputes</b> \u2014 we'll resolve them as quickly as possible`,
    ``,
    `\u{1F4E9} <b>Support contact:</b> @tezam_by`,
    ``,
    `When reaching out, please include:`,
    `1. Your Telegram ID: <code>${from.id}</code>`,
    `2. Payment date and amount`,
    `3. Description of the issue`,
  ].join("\n");

  const keyboard: InlineKeyboardButton[][] = [
    [{ text: lang === "ru" ? "\u{1F4AC} \u041D\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u0432 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0443" : "\u{1F4AC} Contact Support", url: "https://t.me/tezam_by" }],
    [{ text: lang === "ru" ? "\u25C0\uFE0F \u041C\u0435\u043D\u044E" : "\u25C0\uFE0F Menu", callback_data: "cmd_menu" }],
  ];

  await sendMessage(chatId, text, { reply_markup: { inline_keyboard: keyboard } });
}

// ---- Handle /payment command ----
// Allows users to subscribe or top up directly from the bot chat
async function handlePaymentCommand(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const from = msg.from;
  if (!from) return;

  await sendChatAction(chatId);

  const user = await findUserByTelegramId(from.id);
  const lang = getLang(user, from);

  if (!user) {
    await sendMessage(chatId, lang === "ru"
      ? "\u0422\u044B \u0435\u0449\u0451 \u043D\u0435 \u043D\u0430\u0447\u0430\u043B. \u041E\u0442\u043F\u0440\u0430\u0432\u044C /start!"
      : "You haven't started yet. Send /start to begin!");
    return;
  }

  // Get wallet info
  const userId = user.id;
  let wallet = await kv.get(`become:wallet:${userId}`);
  if (!wallet) {
    wallet = { starsBalance: 0, tonBalance: 0, starsReserved: 0, tonReserved: 0 };
  }

  // Subscription status
  const now = Date.now();
  const expiresAt = user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt).getTime() : 0;
  const isActive = expiresAt > now;
  const daysLeft = isActive ? Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000)) : 0;

  const subStatus = isActive
    ? (lang === "ru"
      ? `\u2705 \u041F\u043E\u0434\u043F\u0438\u0441\u043A\u0430 \u0430\u043A\u0442\u0438\u0432\u043D\u0430 (${daysLeft} \u0434\u043D.)`
      : `\u2705 Subscription active (${daysLeft} days)`)
    : (lang === "ru"
      ? "\u274C \u041F\u043E\u0434\u043F\u0438\u0441\u043A\u0430 \u043D\u0435\u0430\u043A\u0442\u0438\u0432\u043D\u0430"
      : "\u274C Subscription inactive");

  const starsAvailable = (wallet.starsBalance || 0) - (wallet.starsReserved || 0);
  const tonAvailable = (wallet.tonBalance || 0) - (wallet.tonReserved || 0);

  const balanceInfo = lang === "ru"
    ? `\u2B50 \u0411\u0430\u043B\u0430\u043D\u0441: <b>${wallet.starsBalance || 0} Stars</b> \u00B7 <b>${(wallet.tonBalance || 0).toFixed(1)} TON</b>`
    : `\u2B50 Balance: <b>${wallet.starsBalance || 0} Stars</b> \u00B7 <b>${(wallet.tonBalance || 0).toFixed(1)} TON</b>`;

  const text = lang === "ru" ? [
    `<b>\u{1F48E} \u041E\u043F\u043B\u0430\u0442\u0430 \u0438 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0430</b>`,
    ``,
    subStatus,
    balanceInfo,
    ``,
    `<b>\u041F\u043B\u0430\u043D\u044B \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0438 (Telegram Stars):</b>`,
    `\u2022 30 \u0434\u043D\u0435\u0439 \u2014 350 \u2B50`,
    `\u2022 60 \u0434\u043D\u0435\u0439 \u2014 600 \u2B50 <i>(\u044D\u043A\u043E\u043D\u043E\u043C\u0438\u044F 14%)</i>`,
    `\u2022 90 \u0434\u043D\u0435\u0439 \u2014 900 \u2B50 <i>(\u044D\u043A\u043E\u043D\u043E\u043C\u0438\u044F 14%)</i>`,
    ``,
    `<b>\u041F\u043E\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 \u0431\u0430\u043B\u0430\u043D\u0441\u0430:</b>`,
    `\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u0443\u043C\u043C\u0443 \u0434\u043B\u044F \u043F\u043E\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F Stars-\u0431\u0430\u043B\u0430\u043D\u0441\u0430`,
    ``,
    `\u{1F4B3} \u0412\u043E\u043F\u0440\u043E\u0441\u044B \u043F\u043E \u043E\u043F\u043B\u0430\u0442\u0435? \u2192 /paysupport`,
  ].join("\n") : [
    `<b>\u{1F48E} Payment & Subscription</b>`,
    ``,
    subStatus,
    balanceInfo,
    ``,
    `<b>Subscription plans (Telegram Stars):</b>`,
    `\u2022 30 days \u2014 350 \u2B50`,
    `\u2022 60 days \u2014 600 \u2B50 <i>(save 14%)</i>`,
    `\u2022 90 days \u2014 900 \u2B50 <i>(save 14%)</i>`,
    ``,
    `<b>Top up balance:</b>`,
    `Choose an amount to add Stars to your balance`,
    ``,
    `\u{1F4B3} Payment issues? \u2192 /paysupport`,
  ].join("\n");

  const keyboard: InlineKeyboardButton[][] = [
    // Subscribe row — direct Stars invoices
    [
      { text: "30d \u00B7 350\u2B50", callback_data: "pay_sub_30" },
      { text: "60d \u00B7 600\u2B50", callback_data: "pay_sub_60" },
      { text: "90d \u00B7 900\u2B50", callback_data: "pay_sub_90" },
    ],
    // Top up row
    [
      { text: "\u2795 100\u2B50", callback_data: "pay_topup_100" },
      { text: "\u2795 250\u2B50", callback_data: "pay_topup_250" },
      { text: "\u2795 500\u2B50", callback_data: "pay_topup_500" },
    ],
  ];

  // Pay from balance (if enough available Stars for cheapest plan)
  if (starsAvailable >= 350) {
    keyboard.push([
      { text: lang === "ru" ? "\u{1F4B0} \u041E\u043F\u043B\u0430\u0442\u0438\u0442\u044C \u0441 \u0431\u0430\u043B\u0430\u043D\u0441\u0430" : "\u{1F4B0} Pay from balance", callback_data: "pay_from_balance" },
    ]);
  }

  // Menu
  keyboard.push([
    { text: lang === "ru" ? "\u25C0\uFE0F \u041C\u0435\u043D\u044E" : "\u25C0\uFE0F Menu", callback_data: "cmd_menu" },
  ]);

  await sendMessage(chatId, text, { reply_markup: { inline_keyboard: keyboard } });
}

// ---- Handle text messages (keyboard buttons etc.) ----
async function handleTextMessage(msg: TgMessage): Promise<void> {
  const text = msg.text || "";
  const chatId = msg.chat.id;
  const from = msg.from;

  const user = from ? await findUserByTelegramId(from.id) : null;
  const lang = getLang(user, from);

  // Match both en/ru button labels
  if (text.includes("Progress") || text.includes("\u043F\u0440\u043E\u0433\u0440\u0435\u0441\u0441") || text.includes("\u041F\u0440\u043E\u0433\u0440\u0435\u0441\u0441")) {
    await handleProgressCommand(msg);
  } else if (text.includes("Today") || text.includes("\u0441\u0435\u0433\u043E\u0434\u043D\u044F") || text.includes("\u0417\u0430\u0434\u0430\u043D\u0438\u044F")) {
    await handleTodayCommand(msg);
  } else if (text.includes("Coach") || text.includes("\u043A\u043E\u0443\u0447") || text.includes("\u041A\u043E\u0443\u0447")) {
    await handleCoachCommand(msg);
  } else if (text.includes("Help") || text.includes("\u041F\u043E\u043C\u043E\u0449\u044C") || text.includes("\u043F\u043E\u043C\u043E\u0449\u044C")) {
    const help = buildHelpMessage(lang);
    await sendMessage(chatId, help.text, { reply_markup: help.reply_markup });
  } else {
    const miniAppUrl = getProperMiniAppUrl();
    const keyboard: InlineKeyboardButton[][] = [];
    // DISABLED: web_app button doesn't work from Figma Sites context
    // if (miniAppUrl) {
    //   keyboard.push([{
    //     text: lang === "ru" ? "\uD83C\uDFAF Открыть Proper Food" : "\uD83C\uDFAF Open Proper Food",
    //     web_app: { url: miniAppUrl }
    //   }]);
    // }
    keyboard.push([
      { text: lang === "ru" ? "\uD83D\uDCCA \u041F\u0440\u043E\u0433\u0440\u0435\u0441\u0441" : "\uD83D\uDCCA Progress", callback_data: "cmd_progress" },
      { text: lang === "ru" ? "\u2753 \u041F\u043E\u043C\u043E\u0449\u044C" : "\u2753 Help", callback_data: "cmd_help" },
    ]);

    await sendMessage(chatId,
      lang === "ru"
        ? "Я твой Proper Food бот! Используй кнопки ниже или /start, /progress, /today, /help."
        : "I'm your Proper Food bot! Use the buttons below or try /start, /progress, /today, /help.",
      { reply_markup: { inline_keyboard: keyboard } }
    );
  }
}

// ---- POST /telegram/webhook \u2014 receives updates from Telegram ----
app.post(`${PREFIX}/telegram/webhook`, async (c) => {
  try {
    const update: TgUpdate = await c.req.json();

    // CRITICAL: Handle pre_checkout_query FIRST — Telegram requires response within 10 sec
    if (update.pre_checkout_query) {
      const pcq = update.pre_checkout_query;
      console.log(`[Payment] pre_checkout_query id=${pcq.id} from=${pcq.from.id} payload=${pcq.invoice_payload} amount=${pcq.total_amount} ${pcq.currency}`);
      try {
        await answerPreCheckoutQuery(pcq.id, true);
        console.log(`[Payment] Approved pre_checkout_query ${pcq.id}`);
      } catch (err) {
        console.log(`[Payment] Error answering pre_checkout_query ${pcq.id}:`, err);
        // Retry once
        try {
          await answerPreCheckoutQuery(pcq.id, true);
          console.log(`[Payment] Retry succeeded for pre_checkout_query ${pcq.id}`);
        } catch (retryErr) {
          console.log(`[Payment] Retry also failed for pre_checkout_query ${pcq.id}:`, retryErr);
        }
      }
      return c.json({ ok: true });
    }

    console.log(`[TG Bot] Received update ${update.update_id}, type: ${
      update.message ? "message" : update.callback_query ? "callback_query" : "other"
    }`);

    if (update.message) {
      const msg = update.message;
      const msgText = msg.text || "";

      // Handle successful payment
      if (msg.successful_payment) {
        const sp = msg.successful_payment;
        console.log(`[Payment] successful_payment from ${msg.from?.id}, payload: ${sp.invoice_payload}, amount: ${sp.total_amount} ${sp.currency}`);
        try {
          const payerTgId = String(msg.from?.id || 0);
          const payerUserId = await kv.get(`become:user:tg:${payerTgId}`);
          if (payerUserId) {
            const payerUser = await kv.get(`become:user:${payerUserId}`);
            if (payerUser) {
              const isTopup = sp.invoice_payload.startsWith("topup_");
              const lang = payerUser.language === "ru" ? "ru" : "en";

              if (isTopup) {
                // ---- Top-up: credit internal Stars balance ----
                const starsAmount = sp.total_amount;
                let wallet = await kv.get(`become:wallet:${payerUserId}`);
                if (!wallet) {
                  wallet = { id: generateId("wallet"), userId: payerUserId, starsBalance: 0, tonBalance: 0 };
                }
                wallet.starsBalance = (wallet.starsBalance || 0) + starsAmount;
                await kv.set(`become:wallet:${payerUserId}`, wallet);

                const paymentId = generateId("pay");
                await kv.set(`become:payment:${paymentId}`, {
                  id: paymentId,
                  userId: payerUserId,
                  telegramId: payerTgId,
                  currency: sp.currency,
                  amount: sp.total_amount,
                  payload: sp.invoice_payload,
                  telegramPaymentChargeId: sp.telegram_payment_charge_id,
                  providerPaymentChargeId: sp.provider_payment_charge_id,
                  daysAdded: 0,
                  type: "topup",
                  createdAt: new Date().toISOString(),
                });
                const paymentList = await kv.get(`become:payments:${payerUserId}`) || [];
                paymentList.push(paymentId);
                await kv.set(`become:payments:${payerUserId}`, paymentList);

                console.log(`[Payment] Stars topup credited for user ${payerUserId}, amount=${starsAmount}, newBalance=${wallet.starsBalance}`);
                await logTransaction(payerUserId, "topup_stars", starsAmount, "stars");

                const notifText = lang === "ru"
                  ? `✅ <b>Пополнение прошло успешно!</b>\n\n⭐ <b>+${starsAmount} Stars</b> зачислено на баланс.\nТекущий баланс: <b>${wallet.starsBalance} Stars</b>`
                  : `✅ <b>Top-up successful!</b>\n\n⭐ <b>+${starsAmount} Stars</b> added to your balance.\nCurrent balance: <b>${wallet.starsBalance} Stars</b>`;
                await sendMessage(msg.chat.id, notifText);
              } else {
                // ---- Subscription payment ----
                let daysToAdd = 30;
                if (sp.invoice_payload.includes("_90_")) daysToAdd = 90;
                else if (sp.invoice_payload.includes("_60_")) daysToAdd = 60;
                else if (sp.invoice_payload.includes("_30_")) daysToAdd = 30;

                const currentExpiry = payerUser.subscriptionExpiresAt
                  ? new Date(payerUser.subscriptionExpiresAt).getTime()
                  : Date.now();
                const base = Math.max(currentExpiry, Date.now());
                payerUser.subscriptionExpiresAt = new Date(base + daysToAdd * 24 * 60 * 60 * 1000).toISOString();
                payerUser.updatedAt = new Date().toISOString();
                await kv.set(`become:user:${payerUserId}`, payerUser);

                const paymentId = generateId("pay");
                await kv.set(`become:payment:${paymentId}`, {
                  id: paymentId,
                  userId: payerUserId,
                  telegramId: payerTgId,
                  currency: sp.currency,
                  amount: sp.total_amount,
                  payload: sp.invoice_payload,
                  telegramPaymentChargeId: sp.telegram_payment_charge_id,
                  providerPaymentChargeId: sp.provider_payment_charge_id,
                  daysAdded: daysToAdd,
                  type: "subscription",
                  createdAt: new Date().toISOString(),
                });
                const paymentList = await kv.get(`become:payments:${payerUserId}`) || [];
                paymentList.push(paymentId);
                await kv.set(`become:payments:${payerUserId}`, paymentList);

                console.log(`[Payment] Extended subscription for user ${payerUserId} by ${daysToAdd} days, new expiry: ${payerUser.subscriptionExpiresAt}`);
                await logTransaction(payerUserId, "subscription", starsAmount, "stars", { description: `+${daysToAdd}d` });

                // Fire-and-forget: grant referral bonus to referrer if applicable
                grantReferralBonusOnSubscription(payerUserId).catch(() => {});

                const notifText = lang === "ru"
                  ? `✅ <b>Оплата прошла успешно!</b>\n\n🎉 Подписка продлена на <b>${daysToAdd} дней</b>.\nДействует до: <b>${new Date(payerUser.subscriptionExpiresAt).toLocaleDateString("ru-RU")}</b>`
                  : `✅ <b>Payment successful!</b>\n\n🎉 Subscription extended by <b>${daysToAdd} days</b>.\nValid until: <b>${new Date(payerUser.subscriptionExpiresAt).toLocaleDateString("en-US")}</b>`;
                await sendMessage(msg.chat.id, notifText);
              }
            }
          }
        } catch (err) {
          console.log(`[Payment] Error processing successful_payment:`, err);
        }
        return c.json({ ok: true });
      }

      // Handle contact sharing (user authorized via share contact)
      if (msg.contact) {
        await handleContactMessage(msg);
        return c.json({ ok: true });
      }

      const isCommand = msg.entities?.some((e) => e.type === "bot_command" && e.offset === 0);

      if (isCommand) {
        const cmd = msgText.split(" ")[0].split("@")[0].toLowerCase();

        switch (cmd) {
          case "/start":
            await handleStartCommand(msg);
            break;
          case "/progress":
            await handleProgressCommand(msg);
            break;
          case "/today":
            await handleTodayCommand(msg);
            break;
          case "/coach":
            await handleCoachCommand(msg);
            break;
          case "/challenge":
            await handleChallengeCommand(msg);
            break;
          case "/help": {
            const helpUser = await findUserByTelegramId(msg.from?.id || 0);
            const helpLang = getLang(helpUser, msg.from);
            const help = buildHelpMessage(helpLang);
            await sendMessage(msg.chat.id, help.text, { reply_markup: help.reply_markup });
            break;
          }
          case "/settings": {
            const settUser = await findUserByTelegramId(msg.from?.id || 0);
            const settings = buildSettingsMessage(settUser?.language || "en", settUser?.tone || "supportive");
            await sendMessage(msg.chat.id, settings.text, { reply_markup: settings.reply_markup });
            break;
          }
          case "/payment":
            await handlePaymentCommand(msg);
            break;
          case "/paysupport":
            await handlePaySupportCommand(msg);
            break;
          default:
            await sendMessage(msg.chat.id, "Unknown command. Try /help for a list of commands.");
        }
      } else if (msgText) {
        await handleTextMessage(msg);
      }
    }

    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }

    return c.json({ ok: true });
  } catch (err) {
    console.log("[TG Bot] Webhook error:", err);
    return c.json({ ok: true });
  }
});

// ---- POST /telegram/setup \u2014 register webhook with Telegram ----
app.post(`${PREFIX}/telegram/setup`, async (c) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    // PREFIX is /make-server-fc549837
    // Full URL: supabaseUrl/functions/v1/make-server-fc549837/telegram/webhook
    const webhookUrl = `${supabaseUrl}/functions/v1${PREFIX}/telegram/webhook`;

    console.log(`[TG Bot] Setting up webhook: ${webhookUrl}`);

    const webhookResult = await setWebhook(webhookUrl);

    let commandsResult = null;
    try {
      commandsResult = await setMyCommands();
    } catch (cmdErr) {
      console.log("[TG Bot] Failed to set commands:", cmdErr);
    }

    let menuResult = null;
    try {
      menuResult = await setChatMenuButton();
    } catch (menuErr) {
      console.log("[TG Bot] Failed to set menu button:", menuErr);
    }

    return c.json({
      success: true,
      webhookUrl,
      webhook: webhookResult,
      commands: commandsResult,
      menuButton: menuResult,
      miniAppUrl: getProperMiniAppUrl() || "(not set)",
    });
  } catch (err) {
    console.log("[TG Bot] Setup error:", err);
    return c.json(
      { success: false, message: `Setup failed: ${err}`, code: "SETUP_ERROR" },
      500
    );
  }
});

// ---- DELETE /telegram/webhook \u2014 remove webhook ----
app.delete(`${PREFIX}/telegram/webhook`, async (c) => {
  try {
    const result = await deleteWebhook();
    return c.json({ success: true, result });
  } catch (err) {
    console.log("[TG Bot] Delete webhook error:", err);
    return c.json(
      { success: false, message: `Failed to delete webhook: ${err}` },
      500
    );
  }
});

// ---- GET /telegram/webhook-info \u2014 check webhook status ----
app.get(`${PREFIX}/telegram/webhook-info`, async (c) => {
  try {
    const info = await getWebhookInfo();
    return c.json({
      success: true,
      ...info,
      miniAppUrl: getProperMiniAppUrl() || "(not set)",
    });
  } catch (err) {
    console.log("[TG Bot] Webhook info error:", err);
    return c.json(
      { success: false, message: `Failed to get webhook info: ${err}` },
      500
    );
  }
});

// ---- POST /telegram/send-notification \u2014 send a message to a user ----
app.post(`${PREFIX}/telegram/send-notification`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) {
      return c.json(
        { message: "Unauthorized", code: "UNAUTHORIZED", status: 401 },
        401
      );
    }

    const body = await c.req.json();
    const { telegramId, text, keyboard, userId } = body;

    // Support both telegramId (direct) and userId (lookup)
    let tgId = telegramId;
    if (!tgId && userId) {
      const u = await kv.get(`become:user:${userId}`);
      if (u?.telegramId) tgId = u.telegramId;
    }

    if (!tgId || !text) {
      return c.json(
        { message: "telegramId (or userId) and text are required", code: "BAD_REQUEST", status: 400 },
        400
      );
    }

    const options: any = {};
    if (keyboard) {
      options.reply_markup = { inline_keyboard: keyboard };
    }

    const result = await sendMessage(Number(tgId), text, options);
    return c.json({ success: true, messageId: result?.message_id });
  } catch (err) {
    console.log("[TG Bot] Send notification error:", err);
    return c.json(
      { message: `Failed to send notification: ${err}`, code: "SEND_ERROR", status: 500 },
      500
    );
  }
});

// ---- POST /telegram/webhook/force-reset — force re-register webhook ----
app.post(`${PREFIX}/telegram/webhook/force-reset`, async (c) => {
  try {
    console.log("[TG Bot] Force-resetting webhook...");
    await ensureWebhookSetup(true);

    const info = await getWebhookInfo();
    return c.json({
      success: true,
      message: "Webhook force-reset complete",
      webhookUrl: info?.url || "(unknown)",
      pendingUpdates: info?.pending_update_count || 0,
    });
  } catch (err) {
    console.log("[TG Bot] Force-reset error:", err);
    return c.json(
      { success: false, message: `Force-reset failed: ${err}` },
      500
    );
  }
});

// =============================================
// NOTIFICATION PREFERENCES ROUTES
// =============================================

// ---- GET /notifications/preferences ----
app.get(`${PREFIX}/notifications/preferences`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) {
      return c.json(
        { message: "Unauthorized", code: "UNAUTHORIZED", status: 401 },
        401
      );
    }

    const prefs = await getNotificationPrefs(auth.userId);
    return c.json(prefs);
  } catch (err) {
    console.log("GET /notifications/preferences error:", err);
    return c.json(
      { message: `Error fetching notification prefs: ${err}`, code: "INTERNAL_ERROR", status: 500 },
      500
    );
  }
});

// ---- PUT /notifications/preferences ----
app.put(`${PREFIX}/notifications/preferences`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) {
      return c.json(
        { message: "Unauthorized", code: "UNAUTHORIZED", status: 401 },
        401
      );
    }

    const body = await c.req.json();
    const updated = await setNotificationPrefs(auth.userId, body);
    console.log(`Notification prefs updated for user ${auth.userId}`);
    return c.json(updated);
  } catch (err) {
    console.log("PUT /notifications/preferences error:", err);
    return c.json(
      { message: `Error updating notification prefs: ${err}`, code: "INTERNAL_ERROR", status: 500 },
      500
    );
  }
});

// ---- POST /notifications/daily-reminder ----
// Trigger daily reminder for all active users (can be called by cron)
app.post(`${PREFIX}/notifications/daily-reminder`, async (c) => {
  try {
    const users = await kv.getByPrefix("become:user:");
    if (!users || users.length === 0) {
      return c.json({ success: true, sent: 0 });
    }

    let sent = 0;
    const programs = await kv.getByPrefix("become:program:");
    const activeProgram = programs?.find((p: any) => p.isActive);

    if (!activeProgram) {
      return c.json({ success: true, sent: 0, reason: "No active program" });
    }

    const days = await kv.getByPrefix(`become:day:${activeProgram.id}:`);

    for (const user of users) {
      if (!user.telegramId || !user.id) continue;

      try {
        const progressList = await kv.getByPrefix(`become:progress:${user.id}:${activeProgram.id}:`);
        const completedDays = progressList.filter(
          (p: any) => p.status === "done" || p.status === "skip"
        ).length;

        // If program already done, skip
        if (completedDays >= activeProgram.durationDays) continue;

        const currentDayNum = completedDays + 1;
        const today = days?.find((d: any) => d.dayNumber === currentDayNum);
        if (!today) continue;

        const taskCount = (today.tasksJson || []).length;
        await notifyDailyReminder(
          user.id,
          Number(user.telegramId),
          currentDayNum,
          today.title,
          taskCount
        );
        sent++;
      } catch (userErr) {
        console.log(`[Daily Reminder] Error for user ${user.id}:`, userErr);
      }
    }

    console.log(`[Daily Reminder] Sent ${sent} reminders`);
    return c.json({ success: true, sent });
  } catch (err) {
    console.log("POST /notifications/daily-reminder error:", err);
    return c.json(
      { message: `Error sending daily reminders: ${err}`, code: "INTERNAL_ERROR", status: 500 },
      500
    );
  }
});

// ---- POST /notifications/test ----
// Send a test notification — if user has an active program, sends a preview of
// their actual daily digest; otherwise sends the generic test message.
app.post(`${PREFIX}/notifications/test`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) {
      return c.json(
        { message: "Unauthorized", code: "UNAUTHORIZED", status: 401 },
        401
      );
    }

    const tgId = Number(auth.telegramId);
    if (!tgId) {
      return c.json(
        { message: "No Telegram ID associated", code: "NO_TG_ID", status: 400 },
        400
      );
    }

    const testUser = await kv.get(`become:user:${auth.userId}`);
    const testLang = detectLang(testUser?.language);

    // Try to send a real daily digest preview
    const todayData = await getTodayTasks(auth.userId);
    if (todayData && todayData.tasks.length > 0) {
      await notifyDailyDigest(auth.userId, tgId, {
        firstName: testUser?.firstName || testUser?.first_name || "Friend",
        dayNumber: todayData.dayNumber,
        totalDays: todayData.totalDays,
        dayTitle: todayData.dayTitle,
        programTitle: todayData.programTitle,
        tasks: todayData.tasks,
        streak: todayData.streak,
        xp: todayData.xp,
      });
      return c.json({ success: true, type: "daily_digest_preview" });
    }

    // Fallback: generic test notification
    const miniAppUrl = getProperMiniAppUrl();
    const keyboard: any[][] = [];
    // DISABLED: web_app button doesn't work from Figma Sites context
    // if (miniAppUrl) {
    //   keyboard.push([{ text: "\u{1F3AF} Open Proper Food", web_app: { url: miniAppUrl } }]);
    // }

    await sendMessage(tgId, testLang === "ru" ? [
      `\u{1F514} <b>\u0422\u0435\u0441\u0442\u043E\u0432\u043E\u0435 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435</b>`,
      ``,
      `\u0415\u0441\u043B\u0438 \u0442\u044B \u0432\u0438\u0434\u0438\u0448\u044C \u044D\u0442\u043E \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435, \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F \u0440\u0430\u0431\u043E\u0442\u0430\u044E\u0442!`,
      `\u041A\u043E\u0433\u0434\u0430 \u0442\u044B \u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0448\u044C \u043F\u043B\u0430\u043D, \u044F \u0431\u0443\u0434\u0443 \u043F\u0440\u0438\u0441\u044B\u043B\u0430\u0442\u044C \u0442\u0432\u043E\u0438 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u0437\u0430\u0434\u0430\u0447\u0438 \u043D\u0430 \u0434\u0435\u043D\u044C.`,
    ].join("\n") : [
      `\u{1F514} <b>Test Notification</b>`,
      ``,
      `If you see this message, notifications are working!`,
      `Once you start a plan, I'll send your personalized daily tasks.`,
    ].join("\n"), {
      reply_markup: keyboard.length > 0 ? { inline_keyboard: keyboard } : undefined,
    });

    return c.json({ success: true, type: "generic_test" });
  } catch (err) {
    console.log("POST /notifications/test error:", err);
    return c.json(
      { message: `Error sending test notification: ${err}`, code: "SEND_ERROR", status: 500 },
      500
    );
  }
});

// ---- POST /ai/transcribe ----
// Voice-to-text via OpenAI Whisper API
app.post(`${PREFIX}/ai/transcribe`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const body = await c.req.json();
    const { audioBase64, mimeType, language } = body;

    if (!audioBase64) {
      return c.json({ message: "audioBase64 is required", code: "BAD_REQUEST", status: 400 }, 400);
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return c.json({ message: "OPENAI_API_KEY not configured", code: "CONFIG_ERROR", status: 500 }, 500);
    }

    // Decode base64 to binary
    const raw = audioBase64.includes(",") ? audioBase64.split(",")[1] : audioBase64;
    const binaryStr = atob(raw);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Determine file extension from mime type
    const mime = mimeType || "audio/webm";
    let ext = "webm";
    if (mime.includes("mp4") || mime.includes("m4a")) ext = "m4a";
    else if (mime.includes("ogg")) ext = "ogg";
    else if (mime.includes("wav")) ext = "wav";
    else if (mime.includes("mp3") || mime.includes("mpeg")) ext = "mp3";

    // Build multipart form data for Whisper API
    const formData = new FormData();
    const blob = new Blob([bytes], { type: mime });
    formData.append("file", blob, `voice.${ext}`);
    formData.append("model", "whisper-1");
    if (language) {
      formData.append("language", language === "ru" ? "ru" : "en");
    }
    formData.append("response_format", "json");

    const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const errText = await whisperResponse.text();
      console.log(`[Whisper] API error ${whisperResponse.status}: ${errText}`);
      return c.json({ message: `Whisper API error: ${errText}`, code: "WHISPER_ERROR", status: 500 }, 500);
    }

    const result = await whisperResponse.json();
    const text = result.text || "";

    console.log(`[Whisper] Transcribed ${bytes.length} bytes -> ${text.length} chars for user ${auth.userId}`);
    return c.json({ text, language: language || "auto" });
  } catch (err) {
    console.log(`POST /ai/transcribe error: ${err}`);
    return c.json({ message: `Error transcribing: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// =============================================
// NOTES / JOURNAL ROUTES
// =============================================

// ---- POST /notes ----
app.post(`${PREFIX}/notes`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const body = await c.req.json();
    const { type, contentText, contentAudioUrl, relatedProgramId, relatedDayNumber } = body;

    if (!type || !["quick", "reflection", "journal", "voice"].includes(type)) {
      return c.json({ message: "type must be 'quick', 'reflection', 'journal' or 'voice'", code: "BAD_REQUEST", status: 400 }, 400);
    }
    if (!contentText && !contentAudioUrl) {
      return c.json({ message: "contentText or contentAudioUrl required", code: "BAD_REQUEST", status: 400 }, 400);
    }

    const noteId = generateId("note");
    const now = new Date().toISOString();

    const note = {
      id: noteId,
      userId: auth.userId,
      type,
      contentText: contentText || "",
      contentAudioUrl: contentAudioUrl || null,
      relatedProgramId: relatedProgramId || null,
      relatedDayNumber: relatedDayNumber != null ? Number(relatedDayNumber) : null,
      createdAt: now,
    };

    await kv.set(`become:note:${auth.userId}:${noteId}`, note);
    console.log(`[Notes] Created ${type} note ${noteId} for user ${auth.userId}`);
    return c.json(note);
  } catch (err) {
    console.log("POST /notes error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /notes ----
app.get(`${PREFIX}/notes`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const typeFilter = c.req.query("type") || "";
    const search = (c.req.query("search") || "").toLowerCase();
    const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 200);
    const offset = parseInt(c.req.query("offset") || "0", 10);

    const allNotes = await kv.getByPrefix(`become:note:${auth.userId}:`);

    let filtered = allNotes;
    if (typeFilter) {
      filtered = filtered.filter((n: any) => n.type === typeFilter);
    }
    if (search) {
      filtered = filtered.filter((n: any) =>
        (n.contentText || "").toLowerCase().includes(search)
      );
    }

    // Sort newest first
    filtered.sort((a: any, b: any) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    return c.json({ notes: paginated, total });
  } catch (err) {
    console.log("GET /notes error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- DELETE /notes/:id ----
app.delete(`${PREFIX}/notes/:id`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const noteId = c.req.param("id");
    const key = `become:note:${auth.userId}:${noteId}`;
    const note = await kv.get(key);

    if (!note) {
      return c.json({ message: "Note not found", code: "NOT_FOUND", status: 404 }, 404);
    }

    await kv.del(key);
    console.log(`[Notes] Deleted note ${noteId} for user ${auth.userId}`);
    return c.json({ success: true });
  } catch (err) {
    console.log("DELETE /notes/:id error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /notes/upload-audio ----
app.post(`${PREFIX}/notes/upload-audio`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const { audioBase64, mimeType } = await c.req.json();
    if (!audioBase64) {
      return c.json({ message: "audioBase64 required", code: "BAD_REQUEST", status: 400 }, 400);
    }

    const mime = mimeType || "audio/webm";
    const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
    const fileName = `notes-audio/${auth.userId}/${Date.now()}_${generateId("a")}.${ext}`;

    const raw = audioBase64.includes(",") ? audioBase64.split(",")[1] : audioBase64;
    const binaryStr = atob(raw);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const supabase = getSupabaseAdmin();
    const { error: uploadError } = await supabase.storage
      .from(PROOF_BUCKET)
      .upload(fileName, bytes.buffer, { contentType: mime, upsert: true });

    if (uploadError) {
      console.log(`[Notes Audio] Upload error: ${uploadError.message}`);
      return c.json({ message: `Upload error: ${uploadError.message}`, code: "STORAGE_ERROR", status: 500 }, 500);
    }

    const { data: signedData, error: signError } = await supabase.storage
      .from(PROOF_BUCKET)
      .createSignedUrl(fileName, 30 * 24 * 60 * 60);

    if (signError || !signedData?.signedUrl) {
      return c.json({ message: "Error creating signed URL", code: "STORAGE_ERROR", status: 500 }, 500);
    }

    console.log(`[Notes Audio] Uploaded: ${fileName}`);
    return c.json({ success: true, signedUrl: signedData.signedUrl, filePath: fileName });
  } catch (err) {
    console.log("POST /notes/upload-audio error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- Supabase Storage for task proof photos & vision board ----
const PROOF_BUCKET = "make-f366fb78-task-proofs";
const VISION_BUCKET = "make-f366fb78-vision-board";

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function ensureProofBucket() {
  try {
    const supabase = getSupabaseAdmin();
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets?.some((b: any) => b.name === PROOF_BUCKET);
    if (!exists) {
      await supabase.storage.createBucket(PROOF_BUCKET, { public: false });
      console.log(`[Storage] Created bucket ${PROOF_BUCKET}`);
    }
  } catch (err) {
    console.log(`[Storage] Error ensuring bucket: ${err}`);
  }
}

async function ensureVisionBucket() {
  try {
    const supabase = getSupabaseAdmin();
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets?.some((b: any) => b.name === VISION_BUCKET);
    if (!exists) {
      await supabase.storage.createBucket(VISION_BUCKET, { public: false });
      console.log(`[Storage] Created bucket ${VISION_BUCKET}`);
    }
  } catch (err) {
    console.log(`[Storage] Error ensuring vision bucket: ${err}`);
  }
}

// Helper: upload base64 image to a storage bucket, return file path
async function uploadImageToStorage(bucket: string, filePath: string, imageBase64: string): Promise<string | null> {
  try {
    const raw = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
    const binaryStr = atob(raw);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage.from(bucket).upload(filePath, bytes.buffer, { contentType: "image/jpeg", upsert: true });
    if (error) { console.log(`[Storage] Upload error: ${error.message}`); return null; }
    return filePath;
  } catch (err) {
    console.log(`[Storage] Upload exception: ${err}`);
    return null;
  }
}

// Helper: get signed URL for a stored image
async function getSignedUrl(bucket: string, filePath: string, expiresIn = 3600): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, expiresIn);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch { return null; }
}

// ---- POST /progress/upload-proof ----
// Upload a photo proof for a task. Accepts base64 image data.
app.post(`${PREFIX}/progress/upload-proof`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const body = await c.req.json();
    const { programId, dayNumber, taskId, imageBase64, mimeType } = body;

    if (!programId || dayNumber === undefined || !taskId || !imageBase64) {
      return c.json({ message: "programId, dayNumber, taskId, and imageBase64 are required", code: "BAD_REQUEST", status: 400 }, 400);
    }

    const mime = mimeType || "image/jpeg";
    const ext = mime.includes("png") ? "png" : "jpg";
    const fileName = `${auth.userId}/${programId}/day${dayNumber}/${taskId}_${Date.now()}.${ext}`;

    // Decode base64
    const raw = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
    const binaryStr = atob(raw);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const supabase = getSupabaseAdmin();
    const { error: uploadError } = await supabase.storage
      .from(PROOF_BUCKET)
      .upload(fileName, bytes.buffer, {
        contentType: mime,
        upsert: true,
      });

    if (uploadError) {
      console.log(`[Storage] Upload error: ${uploadError.message}`);
      return c.json({ message: `Upload error: ${uploadError.message}`, code: "STORAGE_ERROR", status: 500 }, 500);
    }

    // Create signed URL (valid 7 days)
    const { data: signedData, error: signError } = await supabase.storage
      .from(PROOF_BUCKET)
      .createSignedUrl(fileName, 7 * 24 * 60 * 60);

    if (signError || !signedData?.signedUrl) {
      console.log(`[Storage] SignedUrl error: ${signError?.message}`);
      return c.json({ message: "Error creating signed URL", code: "STORAGE_ERROR", status: 500 }, 500);
    }

    // Update progress metaJson with proof photo URL
    const progressKey = `become:progress:${auth.userId}:${programId}:${dayNumber}`;
    const progress = await kv.get(progressKey);
    if (progress) {
      const meta = progress.metaJson || { completedTaskIds: [], xpEarned: 0 };
      meta.proofPhotos = meta.proofPhotos || {};
      meta.proofPhotos[taskId] = fileName; // store path, not signed URL (URLs expire)
      progress.metaJson = meta;

      // Also mark task as completed if not already
      if (!meta.completedTaskIds.includes(taskId)) {
        meta.completedTaskIds.push(taskId);
      }
      progress.updatedAt = new Date().toISOString();
      await kv.set(progressKey, progress);
    } else {
      // Create progress record if none exists
      const newProgress = {
        id: generateId("p"),
        userId: auth.userId,
        programId,
        dayNumber,
        status: "pending",
        reflectionText: null,
        metaJson: {
          completedTaskIds: [taskId],
          xpEarned: 0,
          proofPhotos: { [taskId]: fileName },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await kv.set(progressKey, newProgress);
    }

    console.log(`[Storage] Proof uploaded: ${fileName} for user ${auth.userId}`);
    return c.json({
      success: true,
      taskId,
      signedUrl: signedData.signedUrl,
      filePath: fileName,
    });
  } catch (err) {
    console.log(`POST /progress/upload-proof error: ${err}`);
    return c.json({ message: `Error uploading proof: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /progress/proofs/:programId/:dayNumber ----
// Get all proof photo signed URLs for a day
app.get(`${PREFIX}/progress/proofs/:programId/:dayNumber`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const programId = c.req.param("programId");
    const dayNumber = parseInt(c.req.param("dayNumber"), 10);

    const progressKey = `become:progress:${auth.userId}:${programId}:${dayNumber}`;
    const progress = await kv.get(progressKey);
    const proofPaths = progress?.metaJson?.proofPhotos || {};

    // Generate signed URLs for all proof photos
    const supabase = getSupabaseAdmin();
    const proofs: Record<string, string> = {};

    for (const [taskId, filePath] of Object.entries(proofPaths)) {
      const { data } = await supabase.storage
        .from(PROOF_BUCKET)
        .createSignedUrl(filePath as string, 7 * 24 * 60 * 60);
      if (data?.signedUrl) {
        proofs[taskId] = data.signedUrl;
      }
    }

    return c.json({ proofs });
  } catch (err) {
    console.log(`GET /progress/proofs error: ${err}`);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// =============================================
// USER GOALS & TASKS ROUTES
// =============================================

// ---- POST /goals ----
app.post(`${PREFIX}/goals`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const body = await c.req.json();
    const { title, description, targetDate } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return c.json({ message: "title is required", code: "BAD_REQUEST", status: 400 }, 400);
    }

    const goalId = generateId("goal");
    const now = new Date().toISOString();

    const goal = {
      id: goalId,
      userId: auth.userId,
      title: title.trim(),
      description: (description || "").trim() || null,
      targetDate: targetDate || null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    await kv.set(`become:goal:${auth.userId}:${goalId}`, goal);
    console.log(`[Goals] Created goal ${goalId} for user ${auth.userId}: ${title}`);
    return c.json(goal);
  } catch (err) {
    console.log("POST /goals error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /goals ----
app.get(`${PREFIX}/goals`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const statusFilter = c.req.query("status") || "";
    const allGoals = await kv.getByPrefix(`become:goal:${auth.userId}:`);

    let filtered = allGoals;
    if (statusFilter) {
      filtered = filtered.filter((g: any) => g.status === statusFilter);
    }

    filtered.sort((a: any, b: any) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const allTasks = await kv.getByPrefix(`become:task:${auth.userId}:`);
    const goalsWithCounts = filtered.map((goal: any) => {
      const goalTasks = allTasks.filter((t: any) => t.goalId === goal.id);
      return {
        ...goal,
        taskCount: goalTasks.length,
        tasksDone: goalTasks.filter((t: any) => t.status === "done").length,
      };
    });

    return c.json({ goals: goalsWithCounts });
  } catch (err) {
    console.log("GET /goals error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- PATCH /goals/:id ----
app.patch(`${PREFIX}/goals/:id`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const goalId = c.req.param("id");
    const key = `become:goal:${auth.userId}:${goalId}`;
    const goal = await kv.get(key);

    if (!goal) {
      return c.json({ message: "Goal not found", code: "NOT_FOUND", status: 404 }, 404);
    }

    const body = await c.req.json();
    const { title, description, targetDate, status } = body;

    if (title !== undefined) goal.title = title.trim();
    if (description !== undefined) goal.description = description?.trim() || null;
    if (targetDate !== undefined) goal.targetDate = targetDate || null;
    if (status !== undefined && ["active", "done", "archived"].includes(status)) {
      goal.status = status;
    }
    goal.updatedAt = new Date().toISOString();

    await kv.set(key, goal);
    console.log(`[Goals] Updated goal ${goalId}`);
    return c.json(goal);
  } catch (err) {
    console.log("PATCH /goals/:id error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /tasks ----
app.post(`${PREFIX}/tasks`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const body = await c.req.json();
    const { title, description, goalId, dueDate, estimatedMinutes } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return c.json({ message: "title is required", code: "BAD_REQUEST", status: 400 }, 400);
    }

    if (goalId) {
      const goal = await kv.get(`become:goal:${auth.userId}:${goalId}`);
      if (!goal) {
        return c.json({ message: "Goal not found", code: "NOT_FOUND", status: 404 }, 404);
      }
    }

    const taskId = generateId("task");
    const now = new Date().toISOString();

    const task: Record<string, any> = {
      id: taskId,
      userId: auth.userId,
      goalId: goalId || null,
      title: title.trim(),
      description: (description || "").trim() || null,
      dueDate: dueDate || null,
      estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : null,
      status: "todo",
      reminderEnabled: body.reminderEnabled ?? false,
      reminderTime: body.reminderTime || null,           // "HH:mm"
      reminderFrequency: body.reminderFrequency || "daily", // "once" | "daily" | "weekdays"
      reminderStartDate: body.reminderStartDate || null,    // "YYYY-MM-DD"
      nextReminderAt: null,    // ISO — computed below
      lastReminderSentAt: null,
      sourceNoteId: body.sourceNoteId || null,
      createdAt: now,
      updatedAt: now,
    };

    // Compute nextReminderAt from reminderStartDate + reminderTime
    if (task.reminderEnabled && task.reminderTime && task.reminderStartDate) {
      task.nextReminderAt = `${task.reminderStartDate}T${task.reminderTime}:00`;
    }

    await kv.set(`become:task:${auth.userId}:${taskId}`, task);
    console.log(`[Tasks] Created task ${taskId} for user ${auth.userId}`);
    return c.json(task);
  } catch (err) {
    console.log("POST /tasks error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /tasks ----
app.get(`${PREFIX}/tasks`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const goalId = c.req.query("goalId") || "";
    const statusFilter = c.req.query("status") || "";

    const allTasks = await kv.getByPrefix(`become:task:${auth.userId}:`);

    let filtered = allTasks;
    if (goalId) {
      filtered = filtered.filter((t: any) => t.goalId === goalId);
    }
    if (statusFilter) {
      filtered = filtered.filter((t: any) => t.status === statusFilter);
    }

    filtered.sort((a: any, b: any) => {
      if (a.status !== b.status) return a.status === "todo" ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return c.json({ tasks: filtered });
  } catch (err) {
    console.log("GET /tasks error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- PATCH /tasks/:id ----
app.patch(`${PREFIX}/tasks/:id`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const taskId = c.req.param("id");
    const key = `become:task:${auth.userId}:${taskId}`;
    const task = await kv.get(key);

    if (!task) {
      return c.json({ message: "Task not found", code: "NOT_FOUND", status: 404 }, 404);
    }

    const body = await c.req.json();
    const { title, description, dueDate, estimatedMinutes, status, goalId,
            reminderEnabled, reminderTime, reminderFrequency, reminderStartDate } = body;

    if (title !== undefined) task.title = title.trim();
    if (description !== undefined) task.description = description?.trim() || null;
    if (dueDate !== undefined) task.dueDate = dueDate || null;
    if (estimatedMinutes !== undefined) task.estimatedMinutes = estimatedMinutes ? Number(estimatedMinutes) : null;
    if (status !== undefined && ["todo", "done"].includes(status)) {
      task.status = status;
      if (status === "done") {
        task.completedAt = new Date().toISOString();
        task.reminderEnabled = false;
        task.nextReminderAt = null;
      }
    }
    if (goalId !== undefined) task.goalId = goalId || null;
    if (reminderEnabled !== undefined) task.reminderEnabled = !!reminderEnabled;
    if (reminderTime !== undefined) task.reminderTime = reminderTime || null;
    if (reminderFrequency !== undefined) task.reminderFrequency = reminderFrequency;
    if (reminderStartDate !== undefined) task.reminderStartDate = reminderStartDate || null;

    // Recompute nextReminderAt
    if (task.reminderEnabled && task.reminderTime && task.reminderStartDate) {
      task.nextReminderAt = `${task.reminderStartDate}T${task.reminderTime}:00`;
    } else if (!task.reminderEnabled) {
      task.nextReminderAt = null;
    }
    task.updatedAt = new Date().toISOString();

    await kv.set(key, task);
    console.log(`[Tasks] Updated task ${taskId}`);
    return c.json(task);
  } catch (err) {
    console.log("PATCH /tasks/:id error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- DELETE /tasks/:id ----
app.delete(`${PREFIX}/tasks/:id`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const taskId = c.req.param("id");
    const key = `become:task:${auth.userId}:${taskId}`;
    const task = await kv.get(key);

    if (!task) {
      return c.json({ message: "Task not found", code: "NOT_FOUND", status: 404 }, 404);
    }

    await kv.del(key);
    console.log(`[Tasks] Deleted task ${taskId}`);
    return c.json({ success: true });
  } catch (err) {
    console.log("DELETE /tasks/:id error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// =============================================
// FOCUS TIMER ROUTES
// =============================================

// ---- POST /focus/start ----
app.post(`${PREFIX}/focus/start`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const { durationMinutes, tag } = await c.req.json();
    if (!durationMinutes || typeof durationMinutes !== "number" || durationMinutes < 1 || durationMinutes > 120) {
      return c.json({ message: "durationMinutes must be 1-120", code: "BAD_REQUEST", status: 400 }, 400);
    }

    const sessionId = generateId("focus");
    const now = new Date().toISOString();

    const session = {
      id: sessionId,
      userId: auth.userId,
      durationMinutes,
      startedAt: now,
      endedAt: null,
      status: "active",
      tag: tag || null,
      createdAt: now,
    };

    await kv.set(`become:focus:${auth.userId}:${sessionId}`, session);
    console.log(`[Focus] Session started: ${sessionId}, ${durationMinutes}min, user ${auth.userId}`);
    return c.json(session);
  } catch (err) {
    console.log("POST /focus/start error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /focus/stop ----
const FOCUS_XP = 5;

app.post(`${PREFIX}/focus/stop`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const { sessionId, completed, resultText } = await c.req.json();
    if (!sessionId) return c.json({ message: "sessionId required", code: "BAD_REQUEST", status: 400 }, 400);

    const key = `become:focus:${auth.userId}:${sessionId}`;
    const session = await kv.get(key);
    if (!session) return c.json({ message: "Session not found", code: "NOT_FOUND", status: 404 }, 404);

    session.endedAt = new Date().toISOString();
    session.status = completed ? "completed" : "stopped";
    if (resultText) session.resultText = resultText;
    await kv.set(key, session);

    // Award XP on completion
    let xpEarned = 0;
    let totalXp = 0;
    if (completed) {
      xpEarned = FOCUS_XP;
      const user = await kv.get(`become:user:${auth.userId}`);
      if (user) {
        user.xp = (user.xp || 0) + xpEarned;
        user.updatedAt = new Date().toISOString();
        await kv.set(`become:user:${auth.userId}`, user);
        totalXp = user.xp;
      }
    }

    // Compute focus streak
    const allSessions = await kv.getByPrefix(`become:focus:${auth.userId}:`);
    const streak = computeFocusStreak(allSessions);

    console.log(`[Focus] Session ${completed ? "completed" : "stopped"}: ${sessionId}, xp +${xpEarned}, streak ${streak}`);
    return c.json({ ...session, xpEarned, totalXp, streak });
  } catch (err) {
    console.log("POST /focus/stop error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /focus/upload-photo ----
app.post(`${PREFIX}/focus/upload-photo`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const { sessionId, imageBase64, mimeType } = await c.req.json();
    if (!sessionId || !imageBase64) {
      return c.json({ message: "sessionId and imageBase64 required", code: "BAD_REQUEST", status: 400 }, 400);
    }

    const key = `become:focus:${auth.userId}:${sessionId}`;
    const session = await kv.get(key);
    if (!session) return c.json({ message: "Session not found", code: "NOT_FOUND", status: 404 }, 404);

    const mime = mimeType || "image/jpeg";
    const ext = mime.includes("png") ? "png" : "jpg";
    const fileName = `focus/${auth.userId}/${sessionId}_${Date.now()}.${ext}`;

    const raw = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
    const binaryStr = atob(raw);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const supabase = getSupabaseAdmin();
    const { error: uploadError } = await supabase.storage
      .from(PROOF_BUCKET)
      .upload(fileName, bytes.buffer, { contentType: mime, upsert: true });

    if (uploadError) {
      console.log(`[Focus Storage] Upload error: ${uploadError.message}`);
      return c.json({ message: `Upload error: ${uploadError.message}`, code: "STORAGE_ERROR", status: 500 }, 500);
    }

    const { data: signedData, error: signError } = await supabase.storage
      .from(PROOF_BUCKET)
      .createSignedUrl(fileName, 7 * 24 * 60 * 60);

    if (signError || !signedData?.signedUrl) {
      return c.json({ message: "Error creating signed URL", code: "STORAGE_ERROR", status: 500 }, 500);
    }

    session.photoPath = fileName;
    await kv.set(key, session);

    console.log(`[Focus Storage] Photo uploaded: ${fileName}`);
    return c.json({ success: true, signedUrl: signedData.signedUrl, filePath: fileName });
  } catch (err) {
    console.log("POST /focus/upload-photo error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

/** Focus streak: consecutive calendar days with ≥1 completed session */
function computeFocusStreak(sessions: any[]): number {
  const completed = sessions.filter((s: any) => s.status === "completed" && s.createdAt);
  if (completed.length === 0) return 0;
  const dateSet = new Set<string>();
  for (const s of completed) dateSet.add(s.createdAt.slice(0, 10));
  const today = new Date().toISOString().slice(0, 10);
  let checkDate = today;
  if (!dateSet.has(today)) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (!dateSet.has(yesterday)) return 0;
    checkDate = yesterday;
  }
  let streak = 0;
  let d = new Date(checkDate + "T00:00:00Z");
  while (dateSet.has(d.toISOString().slice(0, 10))) {
    streak++;
    d = new Date(d.getTime() - 86400000);
  }
  return streak;
}

// ---- GET /focus/stats ----
app.get(`${PREFIX}/focus/stats`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const sessions = await kv.getByPrefix(`become:focus:${auth.userId}:`);
    const now = Date.now();
    const msIn7d = 7 * 24 * 60 * 60 * 1000;
    const msIn30d = 30 * 24 * 60 * 60 * 1000;

    const completed = sessions.filter((s: any) => s.status === "completed");

    const stats7d = completed.filter((s: any) => now - new Date(s.createdAt).getTime() < msIn7d);
    const stats30d = completed.filter((s: any) => now - new Date(s.createdAt).getTime() < msIn30d);

    const totalMinutes7d = stats7d.reduce((sum: number, s: any) => sum + (s.durationMinutes || 0), 0);
    const totalMinutes30d = stats30d.reduce((sum: number, s: any) => sum + (s.durationMinutes || 0), 0);

    const streak = computeFocusStreak(sessions);

    return c.json({
      totalSessions: completed.length,
      totalMinutes: completed.reduce((sum: number, s: any) => sum + (s.durationMinutes || 0), 0),
      last7days: { sessions: stats7d.length, minutes: totalMinutes7d },
      last30days: { sessions: stats30d.length, minutes: totalMinutes30d },
      streak,
      totalXpEarned: completed.length * FOCUS_XP,
    });
  } catch (err) {
    console.log("GET /focus/stats error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// =============================================
// STRATEGIC GOAL ENGINE ROUTES
// =============================================

// ---- POST /strategic-goals/initiate ----
app.post(`${PREFIX}/strategic-goals/initiate`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const { goalText, category, visionImagePath, selfieImagePath } = await c.req.json();
    if (!goalText || typeof goalText !== "string" || goalText.trim().length < 5) {
      return c.json({ message: "goalText must be at least 5 characters", code: "BAD_REQUEST", status: 400 }, 400);
    }

    const user = await kv.get(`become:user:${auth.userId}`);
    const lang = user?.language || "en";
    const tone = user?.tone || "supportive";
    const isRu = lang === "ru";
    const firstName = user?.firstName || user?.first_name || (isRu ? "\u0434\u0440\u0443\u0433" : "friend");
    const toneStr = getToneStr(tone, isRu);
    const langInstr = isRu ? "\u0412\u0441\u0451 \u043D\u0430 \u0420\u0423\u0421\u0421\u041A\u041E\u041C \u044F\u0437\u044B\u043A\u0435." : "All in ENGLISH.";

    const systemPrompt = `${toneStr}\n${langInstr}\nYou are a strategic life coach helping build long-term plans.\nIMPORTANT: Never give medical, legal, or financial investment advice.\n${firstName ? (isRu ? `\u0418\u043C\u044F: ${firstName}.` : `Name: ${firstName}.`) : ""}\nThe user wants to set a strategic long-term goal. Ask 3-5 clarifying questions to deeply understand their situation, timeline, resources, success criteria, and obstacles.\nFirst write 2-3 sentences showing you understand their goal, then list questions.\nReturn ONLY valid JSON:\n{"coachIntro":"your 2-3 sentence intro","questions":[{"id":"unique_id","text":"question text","type":"text"}]}\n"type" can be "text", "number", or "select". For "select", add "options":["opt1","opt2"].`;

    const result = await callOpenAI(systemPrompt, goalText.trim().slice(0, 2000));

    const questions = result?.questions || [
      { id: "timeline", text: isRu ? "\u0417\u0430 \u043A\u0430\u043A\u043E\u0439 \u0441\u0440\u043E\u043A \u0432\u044B \u0445\u043E\u0442\u0438\u0442\u0435 \u0434\u043E\u0441\u0442\u0438\u0447\u044C \u044D\u0442\u043E\u0433\u043E?" : "In what timeframe do you want to achieve this?", type: "text" },
      { id: "resources", text: isRu ? "\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u0432\u0440\u0435\u043C\u0435\u043D\u0438 \u0432 \u043D\u0435\u0434\u0435\u043B\u044E \u0432\u044B \u0433\u043E\u0442\u043E\u0432\u044B \u0443\u0434\u0435\u043B\u044F\u0442\u044C?" : "How much time per week can you dedicate?", type: "text" },
      { id: "obstacles", text: isRu ? "\u041A\u0430\u043A\u0438\u0435 \u043F\u0440\u0435\u043F\u044F\u0442\u0441\u0442\u0432\u0438\u044F \u0432\u044B \u043F\u0440\u0435\u0434\u0432\u0438\u0434\u0438\u0442\u0435?" : "What obstacles do you foresee?", type: "text" },
      { id: "success", text: isRu ? "\u041A\u0430\u043A \u0432\u044B\u0433\u043B\u044F\u0434\u0438\u0442 \u0443\u0441\u043F\u0435\u0445 \u0434\u043B\u044F \u0432\u0430\u0441?" : "What does success look like?", type: "text" },
    ];
    const coachIntro = result?.coachIntro || (isRu ? `${firstName}, \u043E\u0442\u043B\u0438\u0447\u043D\u0430\u044F \u0446\u0435\u043B\u044C! \u0414\u0430\u0432\u0430\u0439 \u0440\u0430\u0437\u0431\u0435\u0440\u0451\u043C\u0441\u044F \u0432 \u0434\u0435\u0442\u0430\u043B\u044F\u0445.` : `${firstName}, great goal! Let's dig into the details.`);

    const draftId = generateId("sgdraft");
    const draftData: any = {
      id: draftId, userId: auth.userId, goalText: goalText.trim(),
      category: category || "general", questions, coachIntro, createdAt: new Date().toISOString(),
    };
    if (visionImagePath) draftData.visionImagePath = visionImagePath;
    if (selfieImagePath) draftData.selfieImagePath = selfieImagePath;
    await kv.set(`become:sgoal_draft:${auth.userId}:${draftId}`, draftData);

    console.log(`[StrategicGoal] Draft ${draftId} created for user ${auth.userId}`);
    return c.json({ draftId, coachIntro, questions });
  } catch (err) {
    console.log("POST /strategic-goals/initiate error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /strategic-goals/generate-plan ----
app.post(`${PREFIX}/strategic-goals/generate-plan`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const { draftId, answers } = await c.req.json();
    if (!draftId) return c.json({ message: "draftId required", code: "BAD_REQUEST", status: 400 }, 400);

    const draft = await kv.get(`become:sgoal_draft:${auth.userId}:${draftId}`);
    if (!draft) return c.json({ message: "Draft not found", code: "NOT_FOUND", status: 404 }, 404);

    const user = await kv.get(`become:user:${auth.userId}`);
    const lang = user?.language || "en";
    const tone = user?.tone || "supportive";
    const isRu = lang === "ru";
    const firstName = user?.firstName || user?.first_name || (isRu ? "\u0434\u0440\u0443\u0433" : "friend");
    const toneStr = getToneStr(tone, isRu);
    const langInstr = isRu ? "\u0412\u0441\u0451 \u043D\u0430 \u0420\u0423\u0421\u0421\u041A\u041E\u041C." : "All in ENGLISH.";

    const qaContext = (draft.questions || []).map((q: any) => `Q: ${q.text}\nA: ${answers?.[q.id] || ""}`).join("\n\n");

    const todayStr = new Date().toISOString().slice(0, 10);
    const systemPrompt = `${toneStr}\n${langInstr}\nYou are a strategic life coach building a long-term actionable plan.\nIMPORTANT: Never give medical, legal, or financial investment advice.\n${firstName ? (isRu ? `\u0418\u043C\u044F: ${firstName}.` : `Name: ${firstName}.`) : ""}\n\nBased on the user's goal and answers, create a comprehensive strategic plan.\nCalculate firstDueDate starting from today: ${todayStr}. Weekly tasks: next Monday. Monthly tasks: 1st of next month.\n\nReturn ONLY valid JSON:\n{"strategySummary":"3-5 sentences","timelineWeeks":24,"phases":[{"title":"str","description":"str","weekStart":1,"weekEnd":8}],"tasks":[{"title":"str","description":"str","frequency":"weekly","firstDueDate":"YYYY-MM-DD"}]}`;

    const userMessage = `GOAL: ${draft.goalText}\n\nCONTEXT:\n${qaContext}`;
    console.log(`[StrategicGoal] Generating plan for draft ${draftId}`);
    const plan = await callOpenAI(systemPrompt, userMessage.slice(0, 4000), 8000);

    if (!plan || !plan.tasks || !plan.strategySummary) {
      const today = new Date();
      const nextMon = new Date(today); nextMon.setDate(today.getDate() + ((8 - today.getDay()) % 7 || 7));
      const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const fb = {
        strategySummary: isRu ? `${firstName}, \u043D\u0430 \u043E\u0441\u043D\u043E\u0432\u0435 \u0442\u0432\u043E\u0435\u0439 \u0446\u0435\u043B\u0438 \u044F \u0441\u043E\u0441\u0442\u0430\u0432\u0438\u043B \u043F\u043B\u0430\u043D.` : `${firstName}, based on your goal I've built a plan.`,
        timelineWeeks: 12,
        phases: [
          { title: isRu ? "\u0424\u0443\u043D\u0434\u0430\u043C\u0435\u043D\u0442" : "Foundation", description: isRu ? "\u0417\u0430\u043A\u043B\u0430\u0434\u044B\u0432\u0430\u0435\u043C \u043E\u0441\u043D\u043E\u0432\u0443" : "Building the base", weekStart: 1, weekEnd: 4 },
          { title: isRu ? "\u0420\u0430\u0437\u0432\u0438\u0442\u0438\u0435" : "Growth", description: isRu ? "\u041D\u0430\u0440\u0430\u0449\u0438\u0432\u0430\u0435\u043C \u0442\u0435\u043C\u043F" : "Increasing momentum", weekStart: 5, weekEnd: 8 },
          { title: isRu ? "\u041C\u0430\u0441\u0442\u0435\u0440\u0441\u0442\u0432\u043E" : "Mastery", description: isRu ? "\u0417\u0430\u043A\u0440\u0435\u043F\u043B\u044F\u0435\u043C" : "Solidifying", weekStart: 9, weekEnd: 12 },
        ],
        tasks: [
          { title: isRu ? "\u041E\u0431\u0437\u043E\u0440 \u043F\u0440\u043E\u0433\u0440\u0435\u0441\u0441\u0430" : "Progress review", description: isRu ? "\u041E\u0446\u0435\u043D\u0438 \u043F\u0440\u043E\u0433\u0440\u0435\u0441\u0441" : "Assess progress", frequency: "weekly", firstDueDate: nextMon.toISOString().slice(0, 10) },
          { title: isRu ? "\u041E\u0441\u043D\u043E\u0432\u043D\u043E\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435" : "Core action", description: isRu ? "\u0413\u043B\u0430\u0432\u043D\u044B\u0439 \u0448\u0430\u0433" : "Main step", frequency: "weekly", firstDueDate: nextMon.toISOString().slice(0, 10) },
          { title: isRu ? "\u0420\u0435\u0442\u0440\u043E\u0441\u043F\u0435\u043A\u0442\u0438\u0432\u0430" : "Retrospective", description: isRu ? "\u0410\u043D\u0430\u043B\u0438\u0437 \u043C\u0435\u0441\u044F\u0446\u0430" : "Monthly analysis", frequency: "monthly", firstDueDate: nextMonth.toISOString().slice(0, 10) },
        ],
      };
      draft.plan = fb;
      await kv.set(`become:sgoal_draft:${auth.userId}:${draftId}`, draft);
      return c.json({ draftId, plan: fb });
    }

    draft.plan = plan; draft.answers = answers;
    await kv.set(`become:sgoal_draft:${auth.userId}:${draftId}`, draft);
    console.log(`[StrategicGoal] Plan generated: ${plan.timelineWeeks}w, ${plan.tasks.length} tasks`);
    return c.json({ draftId, plan });
  } catch (err) {
    console.log("POST /strategic-goals/generate-plan error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /strategic-goals/activate ----
app.post(`${PREFIX}/strategic-goals/activate`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const { draftId } = await c.req.json();
    if (!draftId) return c.json({ message: "draftId required", code: "BAD_REQUEST", status: 400 }, 400);

    const draft = await kv.get(`become:sgoal_draft:${auth.userId}:${draftId}`);
    if (!draft || !draft.plan) return c.json({ message: "Draft/plan not found", code: "NOT_FOUND", status: 404 }, 404);

    const now = new Date().toISOString();
    const goalId = generateId("sgoal");

    const goal: any = {
      id: goalId, userId: auth.userId, title: draft.goalText,
      category: draft.category || "general", timelineWeeks: draft.plan.timelineWeeks || 12,
      structuredDataJson: { strategySummary: draft.plan.strategySummary, phases: draft.plan.phases || [], answers: draft.answers || {}, coachIntro: draft.coachIntro || "" },
      status: "active", createdAt: now, updatedAt: now,
    };
    // Attach vision board / selfie image paths if provided
    if (draft.visionImagePath) goal.visionImagePath = draft.visionImagePath;
    if (draft.selfieImagePath) goal.selfieImagePath = draft.selfieImagePath;
    await kv.set(`become:sgoal:${auth.userId}:${goalId}`, goal);

    const taskRecords: any[] = [];
    for (const t of (draft.plan.tasks || [])) {
      const taskId = generateId("stask");
      const task = {
        id: taskId, userId: auth.userId, goalId, title: t.title || "Task",
        description: t.description || "", frequency: t.frequency === "monthly" ? "monthly" : "weekly",
        nextDueDate: t.firstDueDate || now.slice(0, 10), autoGenerated: true, completedCount: 0, createdAt: now,
      };
      await kv.set(`become:stask:${auth.userId}:${taskId}`, task);
      taskRecords.push(task);
    }

    await kv.del(`become:sgoal_draft:${auth.userId}:${draftId}`);
    console.log(`[StrategicGoal] Activated ${goalId} with ${taskRecords.length} tasks`);
    return c.json({ goal, tasks: taskRecords });
  } catch (err) {
    console.log("POST /strategic-goals/activate error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /strategic-goals ----
app.get(`${PREFIX}/strategic-goals`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const statusFilter = c.req.query("status") || "";
    const allGoals = await kv.getByPrefix(`become:sgoal:${auth.userId}:`);
    let filtered = allGoals;
    if (statusFilter) filtered = filtered.filter((g: any) => g.status === statusFilter);
    filtered.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const allTasks = await kv.getByPrefix(`become:stask:${auth.userId}:`);
    const goalsWithStats = filtered.map((goal: any) => {
      const gTasks = allTasks.filter((t: any) => t.goalId === goal.id);
      const totalCompleted = gTasks.reduce((sum: number, t: any) => sum + (t.completedCount || 0), 0);
      const dueSoon = gTasks.filter((t: any) => t.nextDueDate && new Date(t.nextDueDate).getTime() - Date.now() <= 3 * 86400000 && new Date(t.nextDueDate).getTime() - Date.now() >= -86400000).length;
      return { ...goal, taskCount: gTasks.length, totalCompleted, dueSoon };
    });

    return c.json({ goals: goalsWithStats });
  } catch (err) {
    console.log("GET /strategic-goals error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /strategic-goals/:id ----
app.get(`${PREFIX}/strategic-goals/:id`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const goalId = c.req.param("id");
    const goal = await kv.get(`become:sgoal:${auth.userId}:${goalId}`);
    if (!goal) return c.json({ message: "Goal not found", code: "NOT_FOUND", status: 404 }, 404);

    const allTasks = await kv.getByPrefix(`become:stask:${auth.userId}:`);
    const tasks = allTasks.filter((t: any) => t.goalId === goalId)
      .sort((a: any, b: any) => {
        if (a.sortOrder !== undefined && b.sortOrder !== undefined) return a.sortOrder - b.sortOrder;
        if (a.sortOrder !== undefined) return -1;
        if (b.sortOrder !== undefined) return 1;
        return (a.nextDueDate || "z").localeCompare(b.nextDueDate || "z");
      });

    return c.json({ goal, tasks });
  } catch (err) {
    console.log("GET /strategic-goals/:id error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- PATCH /strategic-goals/:id ----
app.patch(`${PREFIX}/strategic-goals/:id`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const goalId = c.req.param("id");
    const key = `become:sgoal:${auth.userId}:${goalId}`;
    const goal = await kv.get(key);
    if (!goal) return c.json({ message: "Goal not found", code: "NOT_FOUND", status: 404 }, 404);

    const body = await c.req.json();
    if (body.status && ["active", "completed", "archived"].includes(body.status)) goal.status = body.status;
    if (body.title) goal.title = body.title.trim();
    goal.updatedAt = new Date().toISOString();
    await kv.set(key, goal);
    return c.json(goal);
  } catch (err) {
    console.log("PATCH /strategic-goals/:id error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /strategic-tasks/:id/complete ----
app.post(`${PREFIX}/strategic-tasks/:id/complete`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const taskId = c.req.param("id");
    const key = `become:stask:${auth.userId}:${taskId}`;
    const task = await kv.get(key);
    if (!task) return c.json({ message: "Task not found", code: "NOT_FOUND", status: 404 }, 404);

    task.completedCount = (task.completedCount || 0) + 1;
    const current = task.nextDueDate ? new Date(task.nextDueDate) : new Date();
    if (task.frequency === "monthly") { current.setMonth(current.getMonth() + 1); }
    else { current.setDate(current.getDate() + 7); }
    task.nextDueDate = current.toISOString().slice(0, 10);
    task.lastCompletedAt = new Date().toISOString();

    await kv.set(key, task);

    // Award XP for strategic task completion
    const xpAwarded = 5;
    const userKey = `become:user:${auth.userId}`;
    const userData = await kv.get(userKey);
    if (userData) {
      userData.xp = (userData.xp || 0) + xpAwarded;
      await kv.set(userKey, userData);
    }

    console.log(`[StrategicTask] Completed ${taskId}, count=${task.completedCount}, next=${task.nextDueDate}, xp+${xpAwarded}`);
    return c.json({ ...task, xpAwarded });
  } catch (err) {
    console.log("POST /strategic-tasks/:id/complete error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /notifications/strategic-daily (cron, idempotent) ----
// Enhanced: groups tasks by goal name, richer notification, fixed reply_markup format
// Time-aware: respects user's dailyReminderTime and utcOffset (same logic as daily-digest).
app.get(`${PREFIX}/notifications/strategic-daily`, async (c) => {
  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const currentMinutesUTC = now.getUTCHours() * 60 + now.getUTCMinutes();

    const allUsers = await kv.getByPrefix("become:user:");
    let sent = 0;
    let skippedDup = 0;
    let skippedTime = 0;

    for (const user of allUsers) {
      if (!user.telegramId) continue;

      // ---- Time-awareness: only send when it's the user's preferred local time ----
      const preferredTime = user.dailyReminderTime || "10:00";
      const [prefH, prefM] = preferredTime.split(":").map(Number);
      if (isNaN(prefH) || isNaN(prefM)) continue;

      const userOffset = user.utcOffset || 0; // minutes, e.g. 180 for UTC+3
      const prefMinutesUTC = (prefH * 60 + prefM) - userOffset;
      const normalizedPrefUTC = ((prefMinutesUTC % 1440) + 1440) % 1440;

      const diff = Math.abs(currentMinutesUTC - normalizedPrefUTC);
      const wrappedDiff = Math.min(diff, 1440 - diff);
      if (wrappedDiff > 7) { skippedTime++; continue; }

      const dedupKey = `become:snotif_sent:${user.id}:${today}`;
      const alreadySent = await kv.get(dedupKey);
      if (alreadySent) { skippedDup++; continue; }

      // Load all active goals and their tasks
      const allGoals = await kv.getByPrefix(`become:sgoal:${user.id}:`);
      const activeGoals = allGoals.filter((g: any) => g.status === "active");
      if (activeGoals.length === 0) continue;

      const tasks = await kv.getByPrefix(`become:stask:${user.id}:`);
      const dueTasks = tasks.filter((t: any) => t.nextDueDate && t.nextDueDate <= today);
      if (dueTasks.length === 0) continue;

      const prefs = await getNotificationPrefs(user.id);
      if (prefs && !prefs.enabled) continue;

      const isRu = user.language === "ru";
      const name = user.firstName || user.first_name || (isRu ? "\u0434\u0440\u0443\u0433" : "friend");

      // Group tasks by goal for a richer notification
      const goalMap = new Map<string, { title: string; tasks: string[] }>();
      for (const t of dueTasks) {
        const goal = activeGoals.find((g: any) => g.id === t.goalId);
        const goalTitle = goal?.title || (isRu ? "\u0426\u0435\u043B\u044C" : "Goal");
        if (!goalMap.has(t.goalId)) goalMap.set(t.goalId, { title: goalTitle, tasks: [] });
        goalMap.get(t.goalId)!.tasks.push(t.title);
      }

      const lines: string[] = [];
      for (const [, { title, tasks: gTasks }] of goalMap) {
        lines.push(`\n\uD83C\uDFAF <b>${title}</b>`);
        for (const tt of gTasks.slice(0, 3)) lines.push(`  \u2022 ${tt}`);
        if (gTasks.length > 3) lines.push(`  ... +${gTasks.length - 3}`);
      }

      const header = isRu
        ? `\uD83D\uDD25 ${name}, \u0443 \u0442\u0435\u0431\u044F ${dueTasks.length} \u0441\u0442\u0440\u0430\u0442. \u0437\u0430\u0434\u0430\u0447 \u043D\u0430 \u0441\u0435\u0433\u043E\u0434\u043D\u044F:`
        : `\uD83D\uDD25 ${name}, you have ${dueTasks.length} strategic task${dueTasks.length > 1 ? "s" : ""} due today:`;

      const footer = isRu
        ? "\n\n\uD83D\uDCAA \u041D\u0435 \u0437\u0430\u0431\u0443\u0434\u044C \u043E\u0442\u043C\u0435\u0442\u0438\u0442\u044C \u043F\u0440\u043E\u0433\u0440\u0435\u0441\u0441!"
        : "\n\n\uD83D\uDCAA Don\u2019t forget to mark your progress!";

      const text = header + lines.join("\n") + footer;

      try {
        // Use web_app button — opens the Mini App directly via its URL.
        const appUrl = getProperMiniAppUrl();
        const kbd: any[][] = [];
        if (appUrl) {
          const sgUrl = `${appUrl}?startapp=strategic_goals`;
          kbd.push([{ text: isRu ? "\uD83D\uDE80 Открыть Proper Food" : "\uD83D\uDE80 Open Proper Food", web_app: { url: sgUrl } }]);
        }
        await sendMessage(Number(user.telegramId), text, {
          reply_markup: kbd.length ? { inline_keyboard: kbd } : undefined,
          parse_mode: "HTML",
        });
        await kv.set(dedupKey, { sentAt: new Date().toISOString() });
        sent++;
      } catch (msgErr) { console.log(`[StrategicNotif] Send err ${user.telegramId}: ${msgErr}`); }
    }

    console.log(`[StrategicNotif] Daily: sent=${sent}, skippedDup=${skippedDup}, skippedTime=${skippedTime}, date=${today}`);
    return c.json({ success: true, sent, skippedDup, skippedTime, date: today });
  } catch (err) {
    console.log("GET /notifications/strategic-daily error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /cron/trigger ----
// Unified cron: calls all scheduled jobs. Safe to invoke every 15 min.
app.get(`${PREFIX}/cron/trigger`, async (c) => {
  try {
    console.log("[Cron] Trigger invoked at", new Date().toISOString());
    const supaUrl = Deno.env.get("SUPABASE_URL") || "";
    const baseUrl = `${supaUrl}/functions/v1/make-server-f366fb78`;
    const authHeader = c.req.header("Authorization") || `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") || ""}`;
    const results: Record<string, any> = {};

    try {
      const r1 = await fetch(`${baseUrl}/notifications/strategic-daily`, { headers: { Authorization: authHeader } });
      results.strategicDaily = await r1.json();
    } catch (err) { results.strategicDaily = { error: String(err) }; }

    try {
      const r2 = await fetch(`${baseUrl}/notifications/daily-digest`, { headers: { Authorization: authHeader } });
      results.dailyDigest = await r2.json();
    } catch (err) { results.dailyDigest = { error: String(err) }; }

    console.log("[Cron] Results:", JSON.stringify(results));
    return c.json({ success: true, timestamp: new Date().toISOString(), results });
  } catch (err) {
    console.log("GET /cron/trigger error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// =============================================
// AI PROGRESS REVIEW (Monthly Check-in)
// =============================================

app.post(`${PREFIX}/strategic-goals/:id/ai-review`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const goalId = c.req.param("id");
    const goal = await kv.get(`become:sgoal:${auth.userId}:${goalId}`);
    if (!goal) return c.json({ message: "Goal not found", code: "NOT_FOUND", status: 404 }, 404);

    const user = await kv.get(`become:user:${auth.userId}`);
    const lang = user?.language || "en";
    const tone = user?.tone || "supportive";
    const isRu = lang === "ru";
    const firstName = user?.firstName || user?.first_name || (isRu ? "\u0434\u0440\u0443\u0433" : "friend");
    const toneStr = getToneStr(tone, isRu);
    const langInstr = isRu ? "\u0412\u0441\u0451 \u043D\u0430 \u0420\u0423\u0421\u0421\u041A\u041E\u041C." : "All in ENGLISH.";

    const allTasks = await kv.getByPrefix(`become:stask:${auth.userId}:`);
    const goalTasks = allTasks.filter((t: any) => t.goalId === goalId);
    const today = new Date().toISOString().slice(0, 10);
    const totalCompletions = goalTasks.reduce((s: number, t: any) => s + (t.completedCount || 0), 0);
    const overdue = goalTasks.filter((t: any) => t.nextDueDate && t.nextDueDate < today).length;
    const onTrack = goalTasks.filter((t: any) => t.nextDueDate && t.nextDueDate >= today).length;

    const taskSummary = goalTasks.map((t: any) => {
      const st = t.nextDueDate < today ? "OVERDUE" : t.nextDueDate === today ? "DUE_TODAY" : "upcoming";
      return `- "${t.title}" (${t.frequency}): done ${t.completedCount || 0}x, ${st}, next: ${t.nextDueDate}`;
    }).join("\n");

    const weeksElapsed = Math.max(1, Math.round((Date.now() - new Date(goal.createdAt).getTime()) / (7 * 86400000)));
    const weeksTotal = goal.timelineWeeks || 12;
    const prevReviews = await kv.getByPrefix(`become:sgoal_review:${auth.userId}:${goalId}:`);

    const systemPrompt = `${toneStr}\n${langInstr}\nYou are a strategic progress coach.\nIMPORTANT: Never give medical, legal, or financial investment advice.\n${firstName ? (isRu ? `\u0418\u043C\u044F: ${firstName}.` : `Name: ${firstName}.`) : ""}\nAnalyze progress and provide a check-in review.\nReturn ONLY valid JSON:\n{"overallScore":75,"scoreLabel":"Good progress","summary":"2-3 sentences","wins":["w1"],"concerns":["c1"],"recommendations":["r1"],"motivationalMessage":"1-2 sentences","adjustments":["a1"]}\noverallScore: 0-100. scoreLabel: "Excellent"|"Good progress"|"Needs attention"|"At risk".`;

    const userMessage = `GOAL: "${goal.title}"\nCategory: ${goal.category}\nStrategy: ${goal.structuredDataJson?.strategySummary || "N/A"}\nWeek ${weeksElapsed} of ${weeksTotal}\nCompletions: ${totalCompletions}, On track: ${onTrack}, Overdue: ${overdue}\nPrevious reviews: ${prevReviews.length}\n\nTASKS:\n${taskSummary || "No tasks"}`;

    console.log(`[AIReview] Generating for goal ${goalId}`);
    const review = await callOpenAI(systemPrompt, userMessage, 3000);

    const fallback = {
      overallScore: totalCompletions > 0 ? 60 : 20,
      scoreLabel: totalCompletions > 0 ? (isRu ? "\u0425\u043E\u0440\u043E\u0448\u0438\u0439 \u043F\u0440\u043E\u0433\u0440\u0435\u0441\u0441" : "Good progress") : (isRu ? "\u0422\u0440\u0435\u0431\u0443\u0435\u0442 \u0432\u043D\u0438\u043C\u0430\u043D\u0438\u044F" : "Needs attention"),
      summary: isRu ? `\u041D\u0435\u0434\u0435\u043B\u044F ${weeksElapsed} \u0438\u0437 ${weeksTotal}. ${totalCompletions} \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0439.` : `Week ${weeksElapsed} of ${weeksTotal}. ${totalCompletions} completions.`,
      wins: totalCompletions > 0 ? [isRu ? "\u0415\u0441\u0442\u044C \u043F\u0440\u043E\u0433\u0440\u0435\u0441\u0441" : "Making progress"] : [],
      concerns: overdue > 0 ? [isRu ? `${overdue} \u043F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D\u043D\u044B\u0445` : `${overdue} overdue`] : [],
      recommendations: [isRu ? "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0430\u0439" : "Keep going"],
      motivationalMessage: isRu ? "\u041A\u0430\u0436\u0434\u044B\u0439 \u0448\u0430\u0433 \u0441\u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044F!" : "Every step counts!",
      adjustments: [],
    };

    const finalReview = (review && review.summary) ? review : fallback;
    const reviewId = generateId("srev");
    const rec = { id: reviewId, goalId, userId: auth.userId, ...finalReview, createdAt: new Date().toISOString() };
    await kv.set(`become:sgoal_review:${auth.userId}:${goalId}:${reviewId}`, rec);

    console.log(`[AIReview] Review ${reviewId}, score=${finalReview.overallScore}`);
    return c.json({ review: rec });
  } catch (err) {
    console.log("POST /strategic-goals/:id/ai-review error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

app.get(`${PREFIX}/strategic-goals/:id/reviews`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    const goalId = c.req.param("id");
    const reviews = await kv.getByPrefix(`become:sgoal_review:${auth.userId}:${goalId}:`);
    reviews.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return c.json({ reviews });
  } catch (err) {
    console.log("GET /strategic-goals/:id/reviews error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// =============================================
// STRATEGIC TASK REORDER (Drag & Drop)
// =============================================

app.post(`${PREFIX}/strategic-tasks/reorder`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    const { goalId, taskIds } = await c.req.json();
    if (!goalId || !Array.isArray(taskIds)) return c.json({ message: "goalId and taskIds[] required", code: "BAD_REQUEST", status: 400 }, 400);

    for (let i = 0; i < taskIds.length; i++) {
      const key = `become:stask:${auth.userId}:${taskIds[i]}`;
      const task = await kv.get(key);
      if (task && task.goalId === goalId) { task.sortOrder = i; await kv.set(key, task); }
    }

    console.log(`[StrategicTask] Reordered ${taskIds.length} tasks for goal ${goalId}`);
    return c.json({ success: true, count: taskIds.length });
  } catch (err) {
    console.log("POST /strategic-tasks/reorder error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /strategic-goals/analyze-image ----
// GPT-4o vision: analyze a "dream photo" or selfie to suggest goals
app.post(`${PREFIX}/strategic-goals/analyze-image`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const { imageBase64, mode } = await c.req.json();
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return c.json({ message: "imageBase64 is required", code: "BAD_REQUEST", status: 400 }, 400);
    }
    const imageMode = mode === "selfie" ? "selfie" : "vision";

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return c.json({ message: "OPENAI_API_KEY not configured", code: "CONFIG_ERROR", status: 500 }, 500);
    }

    const user = await kv.get(`become:user:${auth.userId}`);
    const lang = user?.language || "en";
    const isRu = lang === "ru";
    const firstName = user?.firstName || user?.first_name || (isRu ? "\u0434\u0440\u0443\u0433" : "friend");
    const langInstr = isRu ? "\u041E\u0442\u0432\u0435\u0442\u044C \u041F\u041E\u041B\u041D\u041E\u0421\u0422\u042C\u042E \u043D\u0430 \u0420\u0423\u0421\u0421\u041A\u041E\u041C \u044F\u0437\u044B\u043A\u0435." : "Respond ENTIRELY in ENGLISH.";

    let systemPrompt: string;
    if (imageMode === "selfie") {
      systemPrompt = [
        langInstr,
        `You are a friendly AI nutrition & fitness coach named Proper Food.`,
        `The user "${firstName}" uploaded a photo of THEMSELVES (a selfie).`,
        `Analyze their appearance and suggest potential self-improvement goals.`,
        `Consider: fitness/body composition, style/fashion, grooming, posture, confidence, etc.`,
        `Be RESPECTFUL and POSITIVE \u2014 don't body-shame. Frame everything as "enhancement" or "potential".`,
        `Return ONLY valid JSON:`,
        `{"analysis":"2-3 sentence observation about the person, warm and positive",`,
        `"suggestedGoals":["goal 1","goal 2","goal 3","goal 4","goal 5"],`,
        `"followUpQuestion":"One open-ended question like: What would YOU most like to change or improve?"}`,
      ].join("\n");
    } else {
      systemPrompt = [
        langInstr,
        `You are a friendly AI nutrition & fitness coach named Proper Food.`,
        `The user "${firstName}" uploaded an INSPIRATION photo \u2014 something they aspire to (a dream car, dream body, lifestyle, place, skill, etc).`,
        `Analyze the image and figure out what kind of goal the user likely wants.`,
        `Return ONLY valid JSON:`,
        `{"analysis":"2-3 sentence description of what you see and what the user might aspire to",`,
        `"suggestedGoals":["specific goal 1","specific goal 2","specific goal 3"],`,
        `"followUpQuestion":"One clarifying question to narrow down their exact goal"}`,
      ].join("\n");
    }

    // Use GPT-4o-mini with vision
    const imageUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: [
            { type: "text", text: imageMode === "selfie"
              ? (isRu ? "\u0412\u043E\u0442 \u043C\u043E\u0451 \u0444\u043E\u0442\u043E. \u0427\u0442\u043E \u0442\u044B \u0434\u0443\u043C\u0430\u0435\u0448\u044C, \u043A\u0430\u043A\u0438\u0435 \u0446\u0435\u043B\u0438 \u044F \u043C\u043E\u0433 \u0431\u044B \u043F\u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C?" : "Here's my photo. What goals could I set for self-improvement?")
              : (isRu ? "\u0412\u043E\u0442 \u0444\u043E\u0442\u043E \u043C\u043E\u0435\u0439 \u043C\u0435\u0447\u0442\u044B. \u041A\u0430\u043A\u0443\u044E \u0446\u0435\u043B\u044C \u043C\u043D\u0435 \u043F\u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C?" : "Here's my dream photo. What goal should I set?")
            },
            { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
          ]},
        ],
        temperature: 0.7,
        max_tokens: 1500,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.log(`[Vision] OpenAI error ${res.status}: ${errText}`);
      return c.json({ message: `Vision API error: ${errText}`, code: "VISION_ERROR", status: 500 }, 500);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return c.json({ message: "No response from Vision API", code: "VISION_EMPTY", status: 500 }, 500);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    } catch {
      parsed = { analysis: content, suggestedGoals: [], followUpQuestion: "" };
    }

    // Save image to storage for vision board / selfie tracking
    const ts = Date.now();
    const storagePath = `${auth.userId}/${imageMode}/${ts}.jpg`;
    const savedPath = await uploadImageToStorage(VISION_BUCKET, storagePath, imageBase64);
    let imageSignedUrl: string | null = null;
    if (savedPath) {
      imageSignedUrl = await getSignedUrl(VISION_BUCKET, savedPath);
    }

    console.log(`[Vision] ${imageMode} analysis for user ${auth.userId}: ${parsed.suggestedGoals?.length || 0} goals, stored=${!!savedPath}`);
    return c.json({
      analysis: parsed.analysis || "",
      suggestedGoals: parsed.suggestedGoals || [],
      followUpQuestion: parsed.followUpQuestion || "",
      mode: imageMode,
      imagePath: savedPath || null,
      imageSignedUrl: imageSignedUrl || null,
    });
  } catch (err) {
    console.log("POST /strategic-goals/analyze-image error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /strategic-goals/:id/vision-image ----
// Return signed URL for the vision board image
app.get(`${PREFIX}/strategic-goals/:id/vision-image`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    const goalId = c.req.param("id");
    const goal = await kv.get(`become:sgoal:${auth.userId}:${goalId}`);
    if (!goal) return c.json({ message: "Goal not found", code: "NOT_FOUND", status: 404 }, 404);
    const imagePath = goal.visionImagePath;
    if (!imagePath) return c.json({ url: null });
    const url = await getSignedUrl(VISION_BUCKET, imagePath);
    return c.json({ url });
  } catch (err) {
    console.log("GET /strategic-goals/:id/vision-image error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /strategic-goals/:id/selfie-checkin ----
// Upload a new selfie, compare with the original via GPT-4o Vision
app.post(`${PREFIX}/strategic-goals/:id/selfie-checkin`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    const goalId = c.req.param("id");
    const { imageBase64 } = await c.req.json();
    if (!imageBase64) return c.json({ message: "imageBase64 required", code: "BAD_REQUEST", status: 400 }, 400);

    const goal = await kv.get(`become:sgoal:${auth.userId}:${goalId}`);
    if (!goal) return c.json({ message: "Goal not found", code: "NOT_FOUND", status: 404 }, 404);

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return c.json({ message: "OPENAI_API_KEY not configured", code: "CONFIG_ERROR", status: 500 }, 500);

    const user = await kv.get(`become:user:${auth.userId}`);
    const lang = user?.language || "en";
    const isRu = lang === "ru";
    const firstName = user?.firstName || user?.first_name || (isRu ? "\u0434\u0440\u0443\u0433" : "friend");

    // Save new selfie
    const ts = Date.now();
    const newSelfiePath = `${auth.userId}/selfie/${goalId}_${ts}.jpg`;
    await uploadImageToStorage(VISION_BUCKET, newSelfiePath, imageBase64);
    const newSelfieUrl = await getSignedUrl(VISION_BUCKET, newSelfiePath);

    // Get original selfie path
    const originalPath = goal.selfieImagePath || goal.visionImagePath;
    let originalUrl: string | null = null;
    let hasOriginal = false;

    if (originalPath) {
      originalUrl = await getSignedUrl(VISION_BUCKET, originalPath);
      hasOriginal = !!originalUrl;
    }

    // Build GPT-4o Vision request
    const langInstr = isRu ? "\u041E\u0442\u0432\u0435\u0442\u044C \u041F\u041E\u041B\u041D\u041E\u0421\u0422\u042C\u042E \u043D\u0430 \u0420\u0423\u0421\u0421\u041A\u041E\u041C." : "Respond ENTIRELY in ENGLISH.";
    const goalTitle = goal.title || "";
    const daysSinceStart = Math.floor((Date.now() - new Date(goal.createdAt).getTime()) / (1000 * 60 * 60 * 24));

    const imageUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;

    let systemPrompt: string;
    let userContent: any[];

    if (hasOriginal && originalUrl) {
      systemPrompt = [
        langInstr,
        `You are Proper Food, a supportive AI coach.`,
        `"${firstName}" set a goal: "${goalTitle}" ${daysSinceStart} days ago.`,
        `They uploaded their BEFORE selfie when starting, and NOW uploaded a new CHECK-IN selfie.`,
        `Compare the two photos and provide an honest but encouraging progress assessment.`,
        `Be specific about visible changes (or lack thereof). Always be respectful.`,
        `Return ONLY valid JSON:`,
        `{"progressSummary":"2-3 sentences about visible changes","score":0-100,"positiveChanges":["change1","change2"],"areasToFocus":["area1","area2"],"motivationalMessage":"encouraging message","recommendation":"one specific actionable tip"}`,
      ].join("\n");
      userContent = [
        { type: "text", text: isRu ? `\u0412\u043E\u0442 \u043C\u043E\u0451 \u0444\u043E\u0442\u043E \u0414\u041E (\u043D\u0430\u0447\u0430\u043B\u043E) \u0438 \u0421\u0415\u0419\u0427\u0410\u0421 (\u0441\u043F\u0443\u0441\u0442\u044F ${daysSinceStart} \u0434\u043D\u0435\u0439). \u0426\u0435\u043B\u044C: ${goalTitle}` : `Here's my BEFORE (start) and NOW (after ${daysSinceStart} days). Goal: ${goalTitle}` },
        { type: "image_url", image_url: { url: originalUrl, detail: "low" } },
        { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
      ];
    } else {
      systemPrompt = [
        langInstr,
        `You are Proper Food, a supportive AI coach.`,
        `"${firstName}" set a goal: "${goalTitle}" ${daysSinceStart} days ago.`,
        `They uploaded a new check-in selfie. No previous selfie available for comparison.`,
        `Analyze the photo and provide encouragement and assessment related to their goal.`,
        `Return ONLY valid JSON:`,
        `{"progressSummary":"2-3 sentences of analysis","score":50,"positiveChanges":["observation1"],"areasToFocus":["area1"],"motivationalMessage":"encouraging message","recommendation":"one specific actionable tip"}`,
      ].join("\n");
      userContent = [
        { type: "text", text: isRu ? `\u0412\u043E\u0442 \u043C\u043E\u0451 \u0444\u043E\u0442\u043E-\u0447\u0435\u043A\u0438\u043D. \u0426\u0435\u043B\u044C: ${goalTitle}` : `Here's my check-in selfie. Goal: ${goalTitle}` },
        { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
      ];
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.7, max_tokens: 1500,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.log(`[SelfieCheckin] OpenAI error ${res.status}: ${errText}`);
      return c.json({ message: `Vision API error: ${errText}`, code: "VISION_ERROR", status: 500 }, 500);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    let parsed: any;
    try {
      parsed = JSON.parse((content || "{}").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    } catch {
      parsed = { progressSummary: content || "", score: 50, positiveChanges: [], areasToFocus: [], motivationalMessage: "", recommendation: "" };
    }

    // Save selfie record to KV
    const selfieRecord = {
      id: generateId("selfie"),
      userId: auth.userId,
      goalId,
      imagePath: newSelfiePath,
      analysis: parsed,
      hasOriginalComparison: hasOriginal,
      daysSinceStart,
      createdAt: new Date().toISOString(),
    };
    await kv.set(`become:selfie:${auth.userId}:${goalId}:${selfieRecord.id}`, selfieRecord);

    // If this is the first selfie for this goal and no selfieImagePath exists, save it
    if (!goal.selfieImagePath) {
      goal.selfieImagePath = newSelfiePath;
      goal.updatedAt = new Date().toISOString();
      await kv.set(`become:sgoal:${auth.userId}:${goalId}`, goal);
    }

    console.log(`[SelfieCheckin] Analyzed for user ${auth.userId}, goal ${goalId}, score=${parsed.score}`);
    return c.json({
      selfie: selfieRecord,
      newSelfieUrl: newSelfieUrl || null,
      originalUrl: originalUrl || null,
      analysis: parsed,
    });
  } catch (err) {
    console.log("POST /strategic-goals/:id/selfie-checkin error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /strategic-goals/:id/selfies ----
// Return all selfie check-ins for a goal
app.get(`${PREFIX}/strategic-goals/:id/selfies`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    const goalId = c.req.param("id");

    const records = await kv.getByPrefix(`become:selfie:${auth.userId}:${goalId}:`);
    const sorted = records.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Generate signed URLs for each selfie
    const selfies = [];
    for (const rec of sorted) {
      const url = await getSignedUrl(VISION_BUCKET, rec.imagePath);
      selfies.push({ ...rec, imageUrl: url });
    }

    return c.json({ selfies });
  } catch (err) {
    console.log("GET /strategic-goals/:id/selfies error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// =============================================
// AI COACH CHAT — Full conversational coaching
// =============================================

// ---- POST /ai/coach/chat ----
app.post(`${PREFIX}/ai/coach/chat`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const body = await c.req.json();
    const { message: userMessage, conversationId } = body;

    if (!userMessage || !userMessage.trim()) {
      return c.json({ message: "message is required", code: "BAD_REQUEST", status: 400 }, 400);
    }

    // Rate limiting
    const rateLimitKey = `become:rate:coach:${auth.userId}`;
    const rateData = await kv.get(rateLimitKey);
    const now = Date.now();
    if (rateData) {
      const windowStart = rateData.windowStart || 0;
      const count = rateData.count || 0;
      if (now - windowStart < COACH_RATE_WINDOW) {
        if (count >= COACH_RATE_LIMIT * 3) {
          const retryAfter = Math.ceil((COACH_RATE_WINDOW - (now - windowStart)) / 1000);
          return c.json({ message: `Too many requests. Try again in ${Math.ceil(retryAfter / 60)} min.`, code: "RATE_LIMITED", status: 429, retryAfterSeconds: retryAfter }, 429);
        }
        await kv.set(rateLimitKey, { windowStart, count: count + 1 });
      } else {
        await kv.set(rateLimitKey, { windowStart: now, count: 1 });
      }
    } else {
      await kv.set(rateLimitKey, { windowStart: now, count: 1 });
    }

    const user = await kv.get(`become:user:${auth.userId}`);
    const language = user?.language || "en";
    const tone = user?.tone || "supportive";
    const firstName = user?.firstName || "";

    const convId = conversationId || generateId("conv");
    const convKey = `become:coach_conv:${auth.userId}:${convId}`;
    const existing = await kv.get(convKey);
    const messages: Array<{ role: string; content: string; ts: string }> = existing?.messages || [];

    messages.push({ role: "user", content: userMessage.trim(), ts: new Date().toISOString() });

    // Gather context
    let contextInfo = "";
    try {
      if (user?.activeProgramId) {
        const progressList = await kv.getByPrefix(`become:progress:${auth.userId}:${user.activeProgramId}:`);
        const doneDays = progressList.filter((p: any) => p.status === "done").length;
        const skippedDays = progressList.filter((p: any) => p.status === "skip").length;
        const streak = computeStreak(progressList);
        contextInfo += `\nActive program progress: done ${doneDays}, skipped ${skippedDays}, streak ${streak}.`;
      }
      const sGoals = await kv.getByPrefix(`become:sgoal:${auth.userId}:`);
      const activeGoals = sGoals.filter((g: any) => g.status === "active");
      if (activeGoals.length > 0) {
        contextInfo += `\nStrategic goals: ${activeGoals.map((g: any) => g.title).join(", ")}.`;
      }
      const allNotes = await kv.getByPrefix(`become:note:${auth.userId}:`);
      allNotes.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const recentNotes = allNotes.slice(0, 5);
      if (recentNotes.length > 0) {
        contextInfo += `\nRecent journal: ${recentNotes.map((n: any) => `"${(n.contentText || "").slice(0, 80)}"`).join("; ")}`;
      }
    } catch (ctxErr) {
      console.log("[Coach Chat] Context error:", ctxErr);
    }

    const toneMap: Record<string, string> = {
      supportive: "Warm, encouraging, empathetic. Celebrate small wins. Never shame.",
      strict: "Direct, honest, no sugarcoating. Hold accountable but with respect.",
      hybrid: "Balanced — acknowledge feelings, then push gently toward action.",
    };
    const toneDesc = toneMap[tone] || toneMap.supportive;
    const langInstruction = language === "en" ? "Respond in English." : `Respond in the language with code "${language}". All output must be in that language.`;

    const systemPrompt = `You are Proper Food Coach — an AI nutrition & fitness coach. You help with nutrition, fitness, habit building, and health goals.

RULES:
- ${langInstruction}
- Tone: ${toneDesc}
- User's name: "${firstName}".
- Keep responses 3-6 sentences. Be conversational.
- Give practical, specific advice for real situations.
- Ask clarifying questions when needed.
- Never use pseudoscience, astrology, or manipulation.
- Focus on practical psychology: habits, identity, cognitive reframes, self-compassion.
- Reference user's real progress/goals when relevant.
${contextInfo ? `\nUSER CONTEXT:\n${contextInfo}` : ""}`;

    const historyForAi = messages.slice(-40).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    let assistantMessage = "";

    if (!apiKey) {
      assistantMessage = language === "ru"
        ? "AI сервис временно недоступен. Попробуй позже."
        : "AI service is temporarily unavailable. Try again later.";
    } else {
      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: systemPrompt }, ...historyForAi],
          temperature: 0.75,
          max_tokens: 500,
        }),
      });

      if (!openaiRes.ok) {
        const errText = await openaiRes.text();
        console.log(`[Coach Chat] OpenAI error ${openaiRes.status}: ${errText}`);
        return c.json({ message: `AI error: ${openaiRes.status}`, code: "AI_ERROR", status: 502 }, 502);
      }

      const data = await openaiRes.json();
      assistantMessage = data.choices?.[0]?.message?.content || "";
    }

    if (!assistantMessage) {
      return c.json({ message: "AI returned empty response", code: "AI_EMPTY", status: 502 }, 502);
    }

    messages.push({ role: "assistant", content: assistantMessage, ts: new Date().toISOString() });

    await kv.set(convKey, {
      id: convId,
      userId: auth.userId,
      messages: messages.slice(-100),
      updatedAt: new Date().toISOString(),
      createdAt: existing?.createdAt || new Date().toISOString(),
    });

    console.log(`[Coach Chat] User ${auth.userId}, conv ${convId}, msgs: ${messages.length}`);
    return c.json({ conversationId: convId, response: assistantMessage, messageCount: messages.length });
  } catch (err) {
    console.log("POST /ai/coach/chat error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /ai/coach/chat/:conversationId ----
app.get(`${PREFIX}/ai/coach/chat/:conversationId`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    const convId = c.req.param("conversationId");
    const conv = await kv.get(`become:coach_conv:${auth.userId}:${convId}`);
    if (!conv) return c.json({ message: "Conversation not found", code: "NOT_FOUND", status: 404 }, 404);
    return c.json(conv);
  } catch (err) {
    console.log("GET /ai/coach/chat/:id error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /ai/coach/conversations ----
app.get(`${PREFIX}/ai/coach/conversations`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    const convs = await kv.getByPrefix(`become:coach_conv:${auth.userId}:`);
    const sorted = convs.sort((a: any, b: any) =>
      new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
    );
    const summaries = sorted.map((conv: any) => {
      const lastMsg = conv.messages?.[conv.messages.length - 1];
      return {
        id: conv.id,
        messageCount: conv.messages?.length || 0,
        lastMessage: lastMsg?.content?.slice(0, 100) || "",
        lastRole: lastMsg?.role || "",
        updatedAt: conv.updatedAt || conv.createdAt,
        createdAt: conv.createdAt,
      };
    });
    return c.json({ conversations: summaries });
  } catch (err) {
    console.log("GET /ai/coach/conversations error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- DELETE /ai/coach/chat/:conversationId ----
app.delete(`${PREFIX}/ai/coach/chat/:conversationId`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    const convId = c.req.param("conversationId");
    await kv.del(`become:coach_conv:${auth.userId}:${convId}`);
    return c.json({ success: true });
  } catch (err) {
    console.log("DELETE /ai/coach/chat/:id error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// =============================================
// JOURNAL INSIGHTS — AI analytics
// =============================================

// ---- POST /ai/journal-insights ----
app.post(`${PREFIX}/ai/journal-insights`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const body = await c.req.json();
    const period = body.period || "week";

    // Rate limiting
    const rateLimitKey = `become:rate:insights:${auth.userId}`;
    const rateData = await kv.get(rateLimitKey);
    const now = Date.now();
    const INSIGHTS_WINDOW = 60 * 60 * 1000;
    const INSIGHTS_LIMIT = 5;
    if (rateData) {
      if (now - (rateData.windowStart || 0) < INSIGHTS_WINDOW) {
        if ((rateData.count || 0) >= INSIGHTS_LIMIT) {
          return c.json({ message: "Too many requests. Try again later.", code: "RATE_LIMITED", status: 429 }, 429);
        }
        await kv.set(rateLimitKey, { windowStart: rateData.windowStart, count: (rateData.count || 0) + 1 });
      } else {
        await kv.set(rateLimitKey, { windowStart: now, count: 1 });
      }
    } else {
      await kv.set(rateLimitKey, { windowStart: now, count: 1 });
    }

    const cutoffDate = period === "month"
      ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const allNotes = await kv.getByPrefix(`become:note:${auth.userId}:`);
    const periodNotes = allNotes.filter((n: any) =>
      new Date(n.createdAt).getTime() >= cutoffDate.getTime()
    );

    if (periodNotes.length < 2) {
      return c.json({
        message: "Not enough entries for analysis. Write at least 2.",
        code: "INSUFFICIENT_DATA",
        status: 400,
        noteCount: periodNotes.length,
      }, 400);
    }

    periodNotes.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const user = await kv.get(`become:user:${auth.userId}`);
    const language = user?.language || "en";
    const langInstruction = language === "en" ? "Respond in English." : `Respond in the language with code "${language}". All output must be in that language.`;

    const notesText = periodNotes.map((n: any) => {
      const date = new Date(n.createdAt).toLocaleDateString(language === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "short" });
      return `[${date}, ${n.type || "note"}] ${(n.contentText || "").slice(0, 500)}`;
    }).join("\n");

    let progressContext = "";
    try {
      if (user?.activeProgramId) {
        const pl = await kv.getByPrefix(`become:progress:${auth.userId}:${user.activeProgramId}:`);
        progressContext = `Program: ${pl.filter((p: any) => p.status === "done").length} done, ${pl.filter((p: any) => p.status === "skip").length} skipped.`;
      }
    } catch (_) {}

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return c.json({ summary: "AI service not configured.", themes: [], patterns: [], strengths: [], areasToWork: [], advice: [], noteCount: periodNotes.length, period });
    }

    const systemPrompt = `You are a psychologist-coach analyzing journal entries over the past ${period === "month" ? "30 days" : "7 days"}.

RULES:
- ${langInstruction}
- Be empathetic but practical.
- Never pathologize normal experiences.
- Give specific, actionable advice.
${progressContext ? `\n${progressContext}` : ""}

Respond ONLY with valid JSON:
{
  "summary": "2-3 sentence overview",
  "themes": [{"name": "theme", "count": 3, "emoji": "🧠", "description": "brief"}],
  "patterns": ["pattern 1", "pattern 2"],
  "moodTrend": "improving" | "stable" | "declining" | "fluctuating",
  "strengths": ["strength 1"],
  "areasToWork": ["area 1"],
  "advice": [{"title": "title", "description": "actionable advice"}],
  "keyQuote": "most revealing quote from entries"
}`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: `${periodNotes.length} entries:\n\n${notesText}` }],
        temperature: 0.6,
        max_tokens: 1000,
        response_format: { type: "json_object" },
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.log(`[Insights] OpenAI error ${openaiRes.status}: ${errText}`);
      return c.json({ message: `AI error: ${openaiRes.status}`, code: "AI_ERROR", status: 502 }, 502);
    }

    const data = await openaiRes.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return c.json({ message: "AI empty response", code: "AI_EMPTY", status: 502 }, 502);

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { summary: content.slice(0, 500), themes: [], patterns: [], strengths: [], areasToWork: [], advice: [] };
    }

    await kv.set(`become:insights:${auth.userId}:${period}`, { ...parsed, noteCount: periodNotes.length, period, generatedAt: new Date().toISOString() });
    console.log(`[Insights] Success user ${auth.userId}, ${periodNotes.length} notes, period ${period}`);
    return c.json({ ...parsed, noteCount: periodNotes.length, period });
  } catch (err) {
    console.log("POST /ai/journal-insights error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// Auto-setup webhook + seed + storage bucket on startup (fire-and-forget)
// Force webhook re-setup on every cold start to ensure allowed_updates includes pre_checkout_query
triggerSeed();
triggerWebhookSetup(true);
ensureProofBucket();
ensureVisionBucket();

// ======================================================
// Core task-reminder logic with distributed lock & per-task dedup
// ======================================================
const CRON_LOCK_KEY = "become:cron:task-reminders:lock";
const CRON_LOCK_TTL = 10 * 60 * 1000; // 10 min

async function runTaskRemindersCron(): Promise<{ sent: number; timestamp: string; skipped?: boolean }> {
  const nowMs = Date.now();
  const nowISO = new Date(nowMs).toISOString();

  // ── Distributed lock via KV ──
  const existing = await kv.get(CRON_LOCK_KEY);
  if (existing && (nowMs - existing.ts) < CRON_LOCK_TTL) {
    console.log(`[Cron] Skipped — lock held (age ${Math.round((nowMs - existing.ts) / 1000)}s)`);
    return { sent: 0, timestamp: nowISO, skipped: true };
  }
  const lockId = crypto.randomUUID();
  await kv.set(CRON_LOCK_KEY, { id: lockId, ts: nowMs });

  // Re-read to verify we won the race
  const verify = await kv.get(CRON_LOCK_KEY);
  if (verify?.id !== lockId) {
    console.log("[Cron] Lost lock race, skipping");
    return { sent: 0, timestamp: nowISO, skipped: true };
  }

  let sent = 0;
  try {
    const allUsers = await kv.getByPrefix("become:user:");
    for (const user of allUsers) {
      if (!user?.id || !user?.telegramId) continue;
      const utcOff = user.utcOffset || 0;
      const tasks = await kv.getByPrefix(`become:task:${user.id}:`);
      const pending = tasks.filter(
        (t: any) => t.status === "todo" && t.reminderEnabled && t.reminderTime
      );
      for (const task of pending) {
        const userNowDate = new Date(nowMs + utcOff * 60000).toISOString().slice(0, 10);
        if (!task.nextReminderAt && task.reminderTime) {
          task.nextReminderAt = `${task.reminderStartDate || userNowDate}T${task.reminderTime}:00`;
          task.reminderStartDate = task.reminderStartDate || userNowDate;
          task.reminderFrequency = task.reminderFrequency || "daily";
        }
        if (!task.nextReminderAt) continue;
        const nextLocal = new Date(task.nextReminderAt);
        const nextUTC = new Date(nextLocal.getTime() - utcOff * 60000);
        const diff = nowMs - nextUTC.getTime();
        if (diff < -60000 || diff > 8 * 60000) continue;

        // Per-task dedup: re-read fresh copy
        const tKey = `become:task:${user.id}:${task.id}`;
        const fresh = await kv.get(tKey);
        if (!fresh) continue;
        if (fresh.lastReminderSentAt) {
          if (nowMs - new Date(fresh.lastReminderSentAt).getTime() < 13 * 60000) continue;
        }

        // Optimistic lock: persist BEFORE sending
        fresh.lastReminderSentAt = nowISO;
        const freq = fresh.reminderFrequency || "daily";
        if (freq === "once") {
          fresh.reminderEnabled = false;
          fresh.nextReminderAt = null;
        } else {
          const nd = new Date(nextLocal);
          nd.setDate(nd.getDate() + 1);
          if (freq === "weekdays") {
            while (nd.getDay() === 0 || nd.getDay() === 6) nd.setDate(nd.getDate() + 1);
          }
          fresh.nextReminderAt = `${nd.toISOString().slice(0, 10)}T${fresh.reminderTime}:00`;
        }
        fresh.updatedAt = nowISO;
        await kv.set(tKey, fresh);

        // Send notification
        try {
          await notifyTaskReminder(user.id, Number(user.telegramId), fresh.title, fresh.description, fresh.id);
          sent++;
        } catch (e) {
          console.log(`[Cron] Send failed for task ${fresh.id}:`, e);
        }
      }
    }
    console.log(`[Cron] Task reminders sent: ${sent}`);
    return { sent, timestamp: nowISO };
  } finally {
    try { await kv.del(CRON_LOCK_KEY); } catch (_) {}
  }
}

// ---- POST /cron/task-reminders ----
app.post(`${PREFIX}/cron/task-reminders`, async (c) => {
  try {
    const result = await runTaskRemindersCron();
    return c.json(result);
  } catch (err) {
    console.log("[Cron] task-reminders error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /tasks/:id/send-reminder ----
// Manual trigger: send reminder NOW for a specific task (for testing / instant send).
app.post(`${PREFIX}/tasks/:id/send-reminder`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const taskId = c.req.param("id");
    const key = `become:task:${auth.userId}:${taskId}`;
    const task = await kv.get(key);
    if (!task) return c.json({ message: "Task not found", code: "NOT_FOUND", status: 404 }, 404);

    const user = await kv.get(`become:user:${auth.userId}`);
    if (!user?.telegramId) return c.json({ message: "No telegramId", code: "BAD_REQUEST", status: 400 }, 400);

    await notifyTaskReminder(
      auth.userId,
      Number(user.telegramId),
      task.title,
      task.description,
      task.id
    );

    task.lastReminderSentAt = new Date().toISOString();
    task.updatedAt = task.lastReminderSentAt;
    await kv.set(key, task);

    console.log(`[Tasks] Manual reminder sent for task ${taskId}`);
    return c.json({ success: true, sentAt: task.lastReminderSentAt });
  } catch (err) {
    console.log("POST /tasks/:id/send-reminder error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// =============================================
// FREEMIUM LIMITS & NUTRITION AI ENDPOINTS
// =============================================

const FREE_SCAN_LIMIT_PER_DAY = 5;
const FREE_MEAL_PLAN_LIMIT_PER_WEEK = 1;

async function isPremiumUser(userId: string): Promise<boolean> {
  const user = await kv.get(`become:user:${userId}`);
  if (!user) return false;
  if (!user.subscriptionExpiresAt) return false;
  return new Date(user.subscriptionExpiresAt).getTime() > Date.now();
}

async function getDailyScanCount(userId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  return (await kv.get(`become:usage:scan:${userId}:${today}`)) || 0;
}

async function incrementDailyScanCount(userId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const key = `become:usage:scan:${userId}:${today}`;
  const next = ((await kv.get(key)) || 0) + 1;
  await kv.set(key, next);
  return next;
}

function getISOWeek(): string {
  const d = new Date();
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

async function getWeeklyMealPlanCount(userId: string): Promise<number> {
  return (await kv.get(`become:usage:mealplan:${userId}:${getISOWeek()}`)) || 0;
}

async function incrementWeeklyMealPlanCount(userId: string): Promise<number> {
  const key = `become:usage:mealplan:${userId}:${getISOWeek()}`;
  const next = ((await kv.get(key)) || 0) + 1;
  await kv.set(key, next);
  return next;
}

// ---- GET /subscription/usage ----
app.get(`${PREFIX}/subscription/usage`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const premium = await isPremiumUser(auth.userId);
    const scanCount = await getDailyScanCount(auth.userId);
    const mealPlanCount = await getWeeklyMealPlanCount(auth.userId);

    return c.json({
      is_premium: premium,
      scans: { used: scanCount, limit: premium ? null : FREE_SCAN_LIMIT_PER_DAY, remaining: premium ? null : Math.max(0, FREE_SCAN_LIMIT_PER_DAY - scanCount) },
      meal_plans: { used: mealPlanCount, limit: premium ? null : FREE_MEAL_PLAN_LIMIT_PER_WEEK, remaining: premium ? null : Math.max(0, FREE_MEAL_PLAN_LIMIT_PER_WEEK - mealPlanCount) },
      workout_plans: { advanced: premium },
    });
  } catch (err) {
    console.log("GET /subscription/usage error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /food/scan ----
app.post(`${PREFIX}/food/scan`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const premium = await isPremiumUser(auth.userId);
    if (!premium) {
      const scanCount = await getDailyScanCount(auth.userId);
      if (scanCount >= FREE_SCAN_LIMIT_PER_DAY) {
        return c.json({ message: "Daily scan limit reached. Upgrade to Premium for unlimited scans.", code: "LIMIT_REACHED", status: 429, limit: FREE_SCAN_LIMIT_PER_DAY, used: scanCount }, 429);
      }
    }

    const { imageBase64, mimeType } = await c.req.json();
    if (!imageBase64) return c.json({ message: "imageBase64 is required", code: "BAD_REQUEST", status: 400 }, 400);

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return c.json({ message: "OpenAI not configured", code: "CONFIG_ERROR", status: 500 }, 500);

    const imgMime = mimeType || "image/jpeg";
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a nutrition expert. Analyze the food in the image and return a JSON object with exactly these fields: food_name (string), estimated_calories (number), protein (number, grams), carbs (number, grams), fat (number, grams). Return ONLY the JSON, no other text." },
          { role: "user", content: [
            { type: "text", text: "What food is this? Estimate the calories and macronutrients." },
            { type: "image_url", image_url: { url: `data:${imgMime};base64,${imageBase64}` } },
          ] },
        ],
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.log(`[Food Scan] OpenAI error: ${response.status} ${errText}`);
      return c.json({ message: "AI analysis failed", code: "AI_ERROR", status: 502 }, 502);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    let parsed: any;
    try {
      const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.log("[Food Scan] Failed to parse AI response:", content);
      return c.json({ message: "Could not parse AI response", code: "PARSE_ERROR", status: 502 }, 502);
    }

    await incrementDailyScanCount(auth.userId);
    console.log(`[Food Scan] Success for user ${auth.userId}: ${parsed.food_name} (${parsed.estimated_calories} cal)`);
    return c.json({ food_name: parsed.food_name || "Unknown food", estimated_calories: parsed.estimated_calories || 0, protein: parsed.protein || 0, carbs: parsed.carbs || 0, fat: parsed.fat || 0 });
  } catch (err) {
    console.log("POST /food/scan error:", err);
    return c.json({ message: `Error scanning food: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /food/entries ----
app.post(`${PREFIX}/food/entries`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const body = await c.req.json();
    const { food_name, calories, protein, carbs, fat, meal_type } = body;
    if (!food_name) return c.json({ message: "food_name required", code: "BAD_REQUEST", status: 400 }, 400);

    const entryId = generateId("food");
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const entry = { id: entryId, userId: auth.userId, food_name, calories: calories || 0, protein: protein || 0, carbs: carbs || 0, fat: fat || 0, meal_type: meal_type || "snack", date: today, created_at: now };

    await kv.set(`become:food:${auth.userId}:${entryId}`, entry);
    const indexKey = `become:food_idx:${auth.userId}:${today}`;
    const index: string[] = (await kv.get(indexKey)) || [];
    index.push(entryId);
    await kv.set(indexKey, index);

    // Invalidate weekly trends cache on new food entry
    try {
      const cacheKey = `become:cache:weekly_trends:${auth.userId}:${today}`;
      await kv.del(cacheKey);
    } catch (_) {}

    console.log(`[Food] Entry added: user=${auth.userId}, food=${food_name}, cal=${calories}`);
    return c.json(entry);
  } catch (err) {
    console.log("POST /food/entries error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /food/entries ----
app.get(`${PREFIX}/food/entries`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const date = c.req.query("date") || new Date().toISOString().slice(0, 10);
    const indexKey = `become:food_idx:${auth.userId}:${date}`;
    const index: string[] = (await kv.get(indexKey)) || [];
    if (index.length === 0) return c.json({ entries: [], totals: { calories: 0, protein: 0, carbs: 0, fat: 0 } });

    const keys = index.map((id: string) => `become:food:${auth.userId}:${id}`);
    const rawEntries = await kv.mget(keys);
    const entries = rawEntries.filter((e: any) => e && e.id).sort((a: any, b: any) => a.created_at > b.created_at ? 1 : -1);

    // Compute totals
    const totals = entries.reduce((acc: any, e: any) => ({
      calories: acc.calories + (e.calories || 0),
      protein: acc.protein + (e.protein || 0),
      carbs: acc.carbs + (e.carbs || 0),
      fat: acc.fat + (e.fat || 0),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

    return c.json({ entries, totals });
  } catch (err) {
    console.log("GET /food/entries error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- DELETE /food/entries/:id ----
app.delete(`${PREFIX}/food/entries/:id`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const entryId = c.req.param("id");
    const entry = await kv.get(`become:food:${auth.userId}:${entryId}`);
    if (!entry) return c.json({ message: "Entry not found", code: "NOT_FOUND", status: 404 }, 404);

    await kv.del(`become:food:${auth.userId}:${entryId}`);
    const date = entry.date || new Date().toISOString().slice(0, 10);
    const indexKey = `become:food_idx:${auth.userId}:${date}`;
    const index: string[] = (await kv.get(indexKey)) || [];
    await kv.set(indexKey, index.filter((id: string) => id !== entryId));

    // Invalidate weekly trends cache on food deletion
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const cacheKey = `become:cache:weekly_trends:${auth.userId}:${todayStr}`;
      await kv.del(cacheKey);
    } catch (_) {}

    return c.json({ success: true });
  } catch (err) {
    console.log("DELETE /food/entries/:id error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /meal-plans/generate ----
app.post(`${PREFIX}/meal-plans/generate`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const premium = await isPremiumUser(auth.userId);
    if (!premium) {
      const count = await getWeeklyMealPlanCount(auth.userId);
      if (count >= FREE_MEAL_PLAN_LIMIT_PER_WEEK) {
        return c.json({ message: "Weekly meal plan limit reached. Upgrade to Premium for unlimited plans.", code: "LIMIT_REACHED", status: 429, limit: FREE_MEAL_PLAN_LIMIT_PER_WEEK, used: count }, 429);
      }
    }

    const body = await c.req.json();
    const { plan_length, goal, daily_calories, gender, activity_level } = body;
    const days = plan_length || 7;

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return c.json({ message: "OpenAI not configured", code: "CONFIG_ERROR", status: 500 }, 500);

    const userProfile = await kv.get(`become:user_profile:${auth.telegramId}`);
    const calTarget = daily_calories || userProfile?.daily_calorie_target || 2000;
    const userGoal = goal || userProfile?.goal || "maintain weight";
    const userGender = gender || userProfile?.gender || "not specified";
    const userActivity = activity_level || userProfile?.activity_level || "moderate";
    const batchDays = Math.min(days, 7);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: 'You are a professional nutritionist. Create a detailed meal plan. Return ONLY a JSON object: { "days": [ { "day": 1, "meals": { "breakfast": { "name": "...", "calories": N, "protein": N, "carbs": N, "fat": N, "ingredients": ["..."], "instructions": "..." }, "lunch": {...}, "dinner": {...}, "snack": {...} }, "total_calories": N } ] }. No other text.' },
          { role: "user", content: `Create a ${batchDays}-day meal plan for a ${userGender} with ${userActivity} activity level. Goal: ${userGoal}. Daily calorie target: ${calTarget} calories. Make meals varied, practical, and nutritious.` },
        ],
        max_tokens: 4000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.log(`[Meal Plan] OpenAI error: ${response.status} ${errText}`);
      return c.json({ message: "AI generation failed", code: "AI_ERROR", status: 502 }, 502);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    let planData: any;
    try {
      const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      planData = JSON.parse(jsonStr);
    } catch {
      console.log("[Meal Plan] Failed to parse AI response:", content.slice(0, 500));
      return c.json({ message: "Could not parse AI response", code: "PARSE_ERROR", status: 502 }, 502);
    }

    const planId = generateId("mplan");
    const savedPlan = { id: planId, userId: auth.userId, plan_length: days, plan_data: planData, created_at: new Date().toISOString() };
    await kv.set(`become:mealplan:${auth.userId}:${planId}`, savedPlan);

    const plansIndexKey = `become:mealplans:${auth.userId}`;
    const plansIndex: string[] = (await kv.get(plansIndexKey)) || [];
    plansIndex.unshift(planId);
    await kv.set(plansIndexKey, plansIndex);

    await incrementWeeklyMealPlanCount(auth.userId);
    console.log(`[Meal Plan] Generated ${batchDays}-day plan for user ${auth.userId}`);
    return c.json(savedPlan);
  } catch (err) {
    console.log("POST /meal-plans/generate error:", err);
    return c.json({ message: `Error generating meal plan: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /meal-plans ----
app.get(`${PREFIX}/meal-plans`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    const plansIndex: string[] = (await kv.get(`become:mealplans:${auth.userId}`)) || [];
    if (plansIndex.length === 0) return c.json([]);
    const keys = plansIndex.map((id: string) => `become:mealplan:${auth.userId}:${id}`);
    const plans = await kv.mget(keys);
    return c.json(plans.filter((p: any) => p && p.id));
  } catch (err) {
    console.log("GET /meal-plans error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /meal-plans/:id ----
app.get(`${PREFIX}/meal-plans/:id`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    const plan = await kv.get(`become:mealplan:${auth.userId}:${c.req.param("id")}`);
    if (!plan) return c.json({ message: "Plan not found", code: "NOT_FOUND", status: 404 }, 404);
    return c.json(plan);
  } catch (err) {
    console.log("GET /meal-plans/:id error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- DELETE /meal-plans/:id ----
app.delete(`${PREFIX}/meal-plans/:id`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    const planId = c.req.param("id");
    await kv.del(`become:mealplan:${auth.userId}:${planId}`);
    const plansIndex: string[] = (await kv.get(`become:mealplans:${auth.userId}`)) || [];
    await kv.set(`become:mealplans:${auth.userId}`, plansIndex.filter((id: string) => id !== planId));
    return c.json({ success: true });
  } catch (err) {
    console.log("DELETE /meal-plans/:id error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// =============================================
// WORKOUT PLAN ENDPOINTS
// =============================================

// ---- POST /workout-plans/generate ----
app.post(`${PREFIX}/workout-plans/generate`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const body = await c.req.json();
    const { plan_length, workout_type, goal, gender, activity_level } = body;
    const days = plan_length || 7;
    const wType = workout_type || "home";

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return c.json({ message: "OpenAI not configured", code: "CONFIG_ERROR", status: 500 }, 500);

    const userProfile = await kv.get(`become:user_profile:${auth.telegramId}`);
    const userGoal = goal || userProfile?.goal || "stay fit";
    const userGender = gender || userProfile?.gender || "not specified";
    const userActivity = activity_level || userProfile?.activity_level || "moderate";
    const batchDays = Math.min(days, 7);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: `You are a certified fitness trainer. Create a detailed ${wType} workout plan. Return ONLY a JSON object: { "days": [ { "day": 1, "workout_type": "upper body|lower body|cardio|full body|rest|hiit|flexibility", "name": "...", "duration_min": N, "calories_burn": N, "exercises": [ { "name": "...", "sets": N, "reps": "...", "rest_sec": N, "notes": "..." } ] } ] }. Include 1-2 rest days per week. No other text.` },
          { role: "user", content: `Create a ${batchDays}-day ${wType} workout plan for a ${userGender} with ${userActivity} activity level. Goal: ${userGoal}. Make workouts varied and progressive.` },
        ],
        max_tokens: 4000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.log(`[Workout Plan] OpenAI error: ${response.status} ${errText}`);
      return c.json({ message: "AI generation failed", code: "AI_ERROR", status: 502 }, 502);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    let workoutData: any;
    try {
      const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      workoutData = JSON.parse(jsonStr);
    } catch {
      console.log("[Workout Plan] Failed to parse AI response:", content.slice(0, 500));
      return c.json({ message: "Could not parse AI response", code: "PARSE_ERROR", status: 502 }, 502);
    }

    const planId = generateId("wplan");
    const savedPlan = { id: planId, userId: auth.userId, plan_length: days, workout_type: wType, workout_data: workoutData, created_at: new Date().toISOString() };
    await kv.set(`become:workout_plans:${auth.userId}:${planId}`, savedPlan);

    const indexKey = `become:workout_plans_index:${auth.userId}`;
    const plansIndex: string[] = (await kv.get(indexKey)) || [];
    plansIndex.unshift(planId);
    await kv.set(indexKey, plansIndex);

    console.log(`[Workout Plan] Generated ${batchDays}-day ${wType} plan for user ${auth.userId}`);
    return c.json(savedPlan);
  } catch (err) {
    console.log("POST /workout-plans/generate error:", err);
    return c.json({ message: `Error generating workout plan: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /workout-plans ----
app.get(`${PREFIX}/workout-plans`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    const indexKey = `become:workout_plans_index:${auth.userId}`;
    const plansIndex: string[] = (await kv.get(indexKey)) || [];
    if (plansIndex.length === 0) return c.json({ plans: [] });
    const keys = plansIndex.map((id: string) => `become:workout_plans:${auth.userId}:${id}`);
    const plans = (await kv.mget(keys)).filter((p: any) => p && p.id).map((p: any) => ({
      id: p.id,
      plan_length: p.plan_length,
      workout_type: p.workout_type,
      created_at: p.created_at,
      preview: p.workout_data?.days?.[0]?.name || "Workout plan",
    }));
    return c.json({ plans });
  } catch (err) {
    console.log("GET /workout-plans error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /workout-plans/:id ----
app.get(`${PREFIX}/workout-plans/:id`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    const plan = await kv.get(`become:workout_plans:${auth.userId}:${c.req.param("id")}`);
    if (!plan) return c.json({ message: "Plan not found", code: "NOT_FOUND", status: 404 }, 404);
    return c.json(plan);
  } catch (err) {
    console.log("GET /workout-plans/:id error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- DELETE /workout-plans/:id ----
app.delete(`${PREFIX}/workout-plans/:id`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    const planId = c.req.param("id");
    await kv.del(`become:workout_plans:${auth.userId}:${planId}`);
    const indexKey = `become:workout_plans_index:${auth.userId}`;
    const plansIndex: string[] = (await kv.get(indexKey)) || [];
    await kv.set(indexKey, plansIndex.filter((id: string) => id !== planId));
    return c.json({ success: true });
  } catch (err) {
    console.log("DELETE /workout-plans/:id error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// =============================================
// SUBSCRIPTION / PAYWALL ENDPOINTS
// =============================================

// ---- GET /subscription/status ----
app.get(`${PREFIX}/subscription/status`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const user = await kv.get(`become:user:${auth.userId}`);
    if (!user) return c.json({ message: "User not found", code: "NOT_FOUND", status: 404 }, 404);

    const expiresAt = user.subscriptionExpiresAt || null;
    const isActive = expiresAt ? new Date(expiresAt).getTime() > Date.now() : false;
    const daysLeft = expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : 0;

    return c.json({
      isActive,
      expiresAt,
      daysLeft,
      isAdmin: isAdminUser(auth.telegramId),
    });
  } catch (err) {
    console.log("GET /subscription/status error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /subscription/create-invoice ----
// Sends a Telegram Stars invoice directly into the user's chat for subscription purchase
app.post(`${PREFIX}/subscription/create-invoice`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const { plan } = await c.req.json();
    const plans: Record<string, { days: number; stars: number; title_en: string; title_ru: string; desc_en: string; desc_ru: string }> = {
      "30": { days: 30, stars: 350, title_en: "Proper Food Premium — 1 Month", title_ru: "Proper Food Premium — 1 месяц", desc_en: "30 days of full access to all features", desc_ru: "30 дней полного доступа ко всем функциям" },
      "60": { days: 60, stars: 600, title_en: "Proper Food Premium — 2 Months", title_ru: "Proper Food Premium — 2 месяца", desc_en: "60 days of full access (save 14%)", desc_ru: "60 дней полного доступа (экономия 14%)" },
      "90": { days: 90, stars: 900, title_en: "Proper Food Premium — 3 Months", title_ru: "Proper Food Premium — 3 месяца", desc_en: "90 days of full access (save 14%)", desc_ru: "90 дней полного доступа (экономия 14%)" },
    };

    const planData = plans[plan];
    if (!planData) return c.json({ message: "Invalid plan", code: "BAD_REQUEST", status: 400 }, 400);

    const chatId = parseInt(auth.telegramId);
    if (!chatId) return c.json({ message: "No chat ID", code: "BAD_REQUEST", status: 400 }, 400);

    const user = await kv.get(`become:user:${auth.userId}`);
    const lang = user?.language === "ru" ? "ru" : "en";

    await sendInvoice({
      chatId,
      title: lang === "ru" ? planData.title_ru : planData.title_en,
      description: lang === "ru" ? planData.desc_ru : planData.desc_en,
      payload: `sub_${plan}_${auth.userId}_${Date.now()}`,
      currency: "XTR",
      prices: [{ label: lang === "ru" ? "Подписка" : "Subscription", amount: planData.stars }],
    });

    console.log(`[Payment] Sent Stars invoice to chat ${chatId} for user ${auth.userId}, plan=${plan}, stars=${planData.stars}`);
    return c.json({ success: true, sentToChat: true, plan, stars: planData.stars, days: planData.days });
  } catch (err) {
    console.log("POST /subscription/create-invoice error:", err);
    return c.json({ message: `Error sending invoice: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /subscription/create-invoice-link ----
// Returns an invoice link for Telegram.WebApp.openInvoice() — instant in-app payment
app.post(`${PREFIX}/subscription/create-invoice-link`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const { plan } = await c.req.json();
    const plans: Record<string, { days: number; stars: number; title_en: string; title_ru: string; desc_en: string; desc_ru: string }> = {
      "30": { days: 30, stars: 350, title_en: "Proper Food Premium — 1 Month", title_ru: "Proper Food Premium — 1 месяц", desc_en: "30 days of full access to all features", desc_ru: "30 дней полного доступа ко всем функциям" },
      "60": { days: 60, stars: 600, title_en: "Proper Food Premium — 2 Months", title_ru: "Proper Food Premium — 2 месяца", desc_en: "60 days of full access (save 14%)", desc_ru: "60 дней полного доступа (экономия 14%)" },
      "90": { days: 90, stars: 900, title_en: "Proper Food Premium — 3 Months", title_ru: "Proper Food Premium — 3 месяца", desc_en: "90 days of full access (save 14%)", desc_ru: "90 дней полного доступа (экономия 14%)" },
    };

    const planData = plans[plan];
    if (!planData) return c.json({ message: "Invalid plan", code: "BAD_REQUEST", status: 400 }, 400);

    const user = await kv.get(`become:user:${auth.userId}`);
    const lang = user?.language === "ru" ? "ru" : "en";

    const invoiceLink = await createInvoiceLink({
      title: lang === "ru" ? planData.title_ru : planData.title_en,
      description: lang === "ru" ? planData.desc_ru : planData.desc_en,
      payload: `sub_${plan}_${auth.userId}_${Date.now()}`,
      currency: "XTR",
      prices: [{ label: lang === "ru" ? "Подписка" : "Subscription", amount: planData.stars }],
    });

    console.log(`[Payment] Created invoice link for user ${auth.userId}, plan=${plan}`);
    return c.json({ success: true, invoiceLink, plan, stars: planData.stars, days: planData.days });
  } catch (err) {
    console.log("POST /subscription/create-invoice-link error:", err);
    return c.json({ message: `Error creating invoice link: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /subscription/activate ----
// Called from Mini App after successful in-app payment to activate subscription immediately
// (The webhook handler also activates, this is a safety net for immediate UI feedback)
app.post(`${PREFIX}/subscription/activate`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const { plan, stars } = await c.req.json();
    const daysMap: Record<string, number> = { "30": 30, "60": 60, "90": 90 };
    const daysToAdd = daysMap[plan] || 30;

    const user = await kv.get(`become:user:${auth.userId}`);
    if (!user) return c.json({ message: "User not found", code: "NOT_FOUND", status: 404 }, 404);

    // Check if subscription was already extended by the webhook (avoid double-granting)
    const currentExpiry = user.subscriptionExpiresAt
      ? new Date(user.subscriptionExpiresAt).getTime()
      : 0;
    const expectedMinExpiry = Date.now() + (daysToAdd - 1) * 24 * 60 * 60 * 1000;

    if (currentExpiry >= expectedMinExpiry) {
      console.log(`[Payment] Subscription already active for user ${auth.userId}, skipping duplicate activate`);
      return c.json({
        success: true,
        alreadyActive: true,
        expiresAt: user.subscriptionExpiresAt,
        daysAdded: daysToAdd,
      });
    }

    // Extend subscription
    const base = Math.max(currentExpiry, Date.now());
    user.subscriptionExpiresAt = new Date(base + daysToAdd * 24 * 60 * 60 * 1000).toISOString();
    user.updatedAt = new Date().toISOString();
    await kv.set(`become:user:${auth.userId}`, user);

    // Record payment
    const paymentId = generateId("pay");
    await kv.set(`become:payment:${paymentId}`, {
      id: paymentId,
      userId: auth.userId,
      telegramId: auth.telegramId,
      currency: "XTR",
      amount: stars || 0,
      payload: `miniapp_sub_${plan}_${auth.userId}_${Date.now()}`,
      daysAdded: daysToAdd,
      type: "subscription",
      source: "miniapp_activate",
      createdAt: new Date().toISOString(),
    });
    const paymentList = await kv.get(`become:payments:${auth.userId}`) || [];
    paymentList.push(paymentId);
    await kv.set(`become:payments:${auth.userId}`, paymentList);

    console.log(`[Payment] Mini App activate: user ${auth.userId} +${daysToAdd} days, expires ${user.subscriptionExpiresAt}`);

    // Fire-and-forget referral bonus
    grantReferralBonusOnSubscription(auth.userId).catch(() => {});

    return c.json({
      success: true,
      alreadyActive: false,
      expiresAt: user.subscriptionExpiresAt,
      daysAdded: daysToAdd,
    });
  } catch (err) {
    console.log("POST /subscription/activate error:", err);
    return c.json({ message: `Error activating subscription: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /subscription/restore ----
// Restore purchase: checks payment history and re-activates subscription if valid payment exists but sub is inactive
app.post(`${PREFIX}/subscription/restore`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const user = await kv.get(`become:user:${auth.userId}`);
    if (!user) return c.json({ message: "User not found", code: "NOT_FOUND", status: 404 }, 404);

    // Check if already active
    const currentExpiry = user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt).getTime() : 0;
    if (currentExpiry > Date.now()) {
      const daysLeft = Math.ceil((currentExpiry - Date.now()) / (24 * 60 * 60 * 1000));
      return c.json({
        success: true,
        restored: false,
        expiresAt: user.subscriptionExpiresAt,
        daysLeft,
        message: "Subscription is already active",
      });
    }

    // Look for payments that should still grant remaining days
    const paymentIds: string[] = await kv.get(`become:payments:${auth.userId}`) || [];
    if (paymentIds.length === 0) {
      return c.json({
        success: true,
        restored: false,
        expiresAt: null,
        daysLeft: 0,
        message: "No payment history found",
      });
    }

    // Fetch all payment records
    const keys = paymentIds.map((id: string) => `become:payment:${id}`);
    const payments = await kv.mget(keys);
    const validPayments = payments
      .filter((p: any) => p && p.id && p.type === "subscription" && p.daysAdded)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (validPayments.length === 0) {
      return c.json({
        success: true,
        restored: false,
        expiresAt: null,
        daysLeft: 0,
        message: "No subscription payments found to restore",
      });
    }

    // Find the most recent payment and check if its expiry window is still valid
    // (paid_at + days_added should be in the future)
    const lastPayment = validPayments[0];
    const paidAt = new Date(lastPayment.createdAt).getTime();
    const expectedExpiry = paidAt + (lastPayment.daysAdded * 24 * 60 * 60 * 1000);

    if (expectedExpiry <= Date.now()) {
      return c.json({
        success: true,
        restored: false,
        expiresAt: null,
        daysLeft: 0,
        message: "Last payment's subscription period has already expired. Please purchase a new plan.",
      });
    }

    // Restore: set expiry to the expected date
    user.subscriptionExpiresAt = new Date(expectedExpiry).toISOString();
    user.updatedAt = new Date().toISOString();
    await kv.set(`become:user:${auth.userId}`, user);

    const daysLeft = Math.ceil((expectedExpiry - Date.now()) / (24 * 60 * 60 * 1000));

    console.log(`[Payment] Restore purchase: user ${auth.userId}, restored to ${user.subscriptionExpiresAt} (${daysLeft} days left)`);

    return c.json({
      success: true,
      restored: true,
      expiresAt: user.subscriptionExpiresAt,
      daysLeft,
      message: `Subscription restored! ${daysLeft} days remaining.`,
    });
  } catch (err) {
    console.log("POST /subscription/restore error:", err);
    return c.json({ message: `Error restoring purchase: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /subscription/check-expiry-reminder ----
// Client-triggered: sends Telegram notification if subscription expires within 3 days (deduped daily)
app.post(`${PREFIX}/subscription/check-expiry-reminder`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const user = await kv.get(`become:user:${auth.userId}`);
    if (!user) return c.json({ sent: false, daysLeft: 0 });

    const expiresAt = user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt).getTime() : 0;
    if (expiresAt <= Date.now()) {
      return c.json({ sent: false, daysLeft: 0 });
    }

    const daysLeft = Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000));

    // Only send if ≤3 days left
    if (daysLeft > 3) {
      return c.json({ sent: false, daysLeft });
    }

    // Dedup: only send once per day
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const dedupKey = `become:expiry_reminder:${auth.userId}:${today}`;
    const alreadySent = await kv.get(dedupKey);
    if (alreadySent) {
      return c.json({ sent: false, daysLeft });
    }

    // Mark as sent for today
    await kv.set(dedupKey, { sentAt: new Date().toISOString() });

    // Send Telegram notification
    const tgId = user.telegramId;
    if (tgId) {
      const lang = user.language === "ru" ? "ru" : "en";
      const text = lang === "ru"
        ? `⏰ <b>Подписка скоро истекает!</b>\n\nВаша Premium подписка истекает через <b>${daysLeft} ${daysLeft === 1 ? "день" : "дня"}</b>.\n\n🔄 Продлите подписку, чтобы сохранить безлимитный доступ к сканированию еды, планам питания и тренировкам.`
        : `⏰ <b>Subscription Expiring Soon!</b>\n\nYour Premium subscription expires in <b>${daysLeft} day${daysLeft === 1 ? "" : "s"}</b>.\n\n🔄 Renew now to keep unlimited access to food scanning, meal plans, and workouts.`;

      const deepLink = buildTgDeepLink("upgrade");
      const keyboard: InlineKeyboardButton[][] = [
        [{ text: lang === "ru" ? "⭐ Продлить Premium" : "⭐ Renew Premium", url: deepLink }],
      ];

      try {
        await sendMessage(Number(tgId), text, { reply_markup: { inline_keyboard: keyboard } });
        console.log(`[Subscription] Expiry reminder sent to user ${auth.userId} (${daysLeft} days left)`);
      } catch (notifErr) {
        console.log(`[Subscription] Failed to send expiry reminder:`, notifErr);
      }
    }

    return c.json({ sent: true, daysLeft });
  } catch (err) {
    console.log("POST /subscription/check-expiry-reminder error:", err);
    return c.json({ sent: false, daysLeft: 0 });
  }
});

// ---- POST /subscription/create-ton-invoice ----
// Creates a TON payment link for subscription purchase
app.post(`${PREFIX}/subscription/create-ton-invoice`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const { plan } = await c.req.json();
    const tonPlans: Record<string, { days: number; tonAmount: number }> = {
      "30": { days: 30, tonAmount: 2.5 },
      "60": { days: 60, tonAmount: 4 },
      "90": { days: 90, tonAmount: 5 },
    };

    const planData = tonPlans[plan];
    if (!planData) return c.json({ message: "Invalid plan", code: "BAD_REQUEST", status: 400 }, 400);

    // Create a pending payment record
    const paymentId = generateId("tonpay");
    await kv.set(`become:ton-payment:${paymentId}`, {
      id: paymentId,
      userId: auth.userId,
      telegramId: auth.telegramId,
      plan,
      days: planData.days,
      tonAmount: planData.tonAmount,
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    // The invoiceUrl links to the bot with payment command
    const botUsername = Deno.env.get("TELEGRAM_BOT_USERNAME") || "ProperFoodAI_bot";
    const invoiceUrl = `https://t.me/${botUsername}?start=tonpay_${paymentId}`;

    console.log(`[Payment] Created TON invoice for user ${auth.userId}, plan=${plan}, ton=${planData.tonAmount}`);
    return c.json({ invoiceUrl, plan, tonAmount: planData.tonAmount, days: planData.days });
  } catch (err) {
    console.log("POST /subscription/create-ton-invoice error:", err);
    return c.json({ message: `Error creating TON invoice: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /wallet/topup-stars ----
// Sends a Stars invoice directly into the user's chat with the bot
app.post(`${PREFIX}/wallet/topup-stars`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const { amount } = await c.req.json();
    const starsAmount = parseInt(amount);
    if (!starsAmount || starsAmount < 1 || starsAmount > 10000) {
      return c.json({ message: "Invalid amount (1-10000)", code: "BAD_REQUEST", status: 400 }, 400);
    }

    const chatId = parseInt(auth.telegramId);
    if (!chatId) return c.json({ message: "No chat ID", code: "BAD_REQUEST", status: 400 }, 400);

    const user = await kv.get(`become:user:${auth.userId}`);
    const lang = user?.language === "ru" ? "ru" : "en";

    await sendInvoice({
      chatId,
      title: lang === "ru" ? `Пополнение — ${starsAmount} ⭐` : `Top Up — ${starsAmount} ⭐`,
      description: lang === "ru"
        ? `Пополнение баланса Proper Food на ${starsAmount} Stars. Оплатите прямо здесь.`
        : `Add ${starsAmount} Stars to your Proper Food wallet. Pay right here.`,
      payload: `topup_stars_${starsAmount}_${auth.userId}_${Date.now()}`,
      currency: "XTR",
      prices: [{ label: lang === "ru" ? "Пополнение" : "Top Up", amount: starsAmount }],
    });

    console.log(`[Payment] Sent Stars topup invoice to chat ${chatId} for user ${auth.userId}, amount=${starsAmount}`);
    return c.json({ success: true, sentToChat: true, amount: starsAmount });
  } catch (err) {
    console.log("POST /wallet/topup-stars error:", err);
    return c.json({ message: `Error sending topup invoice: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /wallet/topup-ton ----
// Sends a message to the user's chat with TON wallet address + instructions
app.post(`${PREFIX}/wallet/topup-ton`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const { amount } = await c.req.json();
    const tonAmount = parseFloat(amount) || 0;
    if (tonAmount <= 0) {
      return c.json({ message: "Invalid amount", code: "BAD_REQUEST", status: 400 }, 400);
    }

    const tonWalletAddress = Deno.env.get("TON_WALLET_ADDRESS");
    if (!tonWalletAddress) {
      return c.json({ message: "TON wallet not configured", code: "CONFIG_ERROR", status: 500 }, 500);
    }

    const chatId = parseInt(auth.telegramId);
    if (!chatId) return c.json({ message: "No chat ID", code: "BAD_REQUEST", status: 400 }, 400);

    const user = await kv.get(`become:user:${auth.userId}`);
    const lang = user?.language === "ru" ? "ru" : "en";

    const text = lang === "ru"
      ? [
          `💎 <b>Пополнение баланса — ${tonAmount} TON</b>`,
          ``,
          `Переведите <b>${tonAmount} TON</b> на кошелёк:`,
          ``,
          `<code>${tonWalletAddress}</code>`,
          ``,
          `📋 Скопируйте адрес выше и выполните перевод.`,
          ``,
          `После перевода отправьте скриншот транзакции менеджеру @tezam_by — ваш баланс будет пополнен вручную.`,
        ].join("\n")
      : [
          `💎 <b>Top Up — ${tonAmount} TON</b>`,
          ``,
          `Send <b>${tonAmount} TON</b> to this wallet:`,
          ``,
          `<code>${tonWalletAddress}</code>`,
          ``,
          `📋 Copy the address above and complete the transfer.`,
          ``,
          `After sending, share a screenshot of the transaction with @tezam_by — your balance will be credited manually.`,
        ].join("\n");

    await sendMessage(chatId, text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: lang === "ru" ? "💬 Написать @tezam_by" : "💬 Message @tezam_by", url: "https://t.me/tezam_by" }],
        ],
      },
    });

    console.log(`[Payment] Sent TON topup instructions to chat ${chatId} for user ${auth.userId}, amount=${tonAmount}`);
    return c.json({ success: true, sentToChat: true, amount: tonAmount });
  } catch (err) {
    console.log("POST /wallet/topup-ton error:", err);
    return c.json({ message: `Error sending TON topup instructions: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /wallet/pay-subscription ----
// Pay for subscription using internal wallet balance
app.post(`${PREFIX}/wallet/pay-subscription`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const { plan, currency } = await c.req.json();

    const pricing: Record<string, { days: number; stars: number; ton: number }> = {
      "30": { days: 30, stars: 350, ton: 2.5 },
      "60": { days: 60, stars: 600, ton: 4 },
      "90": { days: 90, stars: 900, ton: 5 },
    };

    const planData = pricing[plan];
    if (!planData) return c.json({ message: "Invalid plan", code: "BAD_REQUEST", status: 400 }, 400);
    if (currency !== "stars" && currency !== "ton") return c.json({ message: "Invalid currency", code: "BAD_REQUEST", status: 400 }, 400);

    let wallet = await kv.get(`become:wallet:${auth.userId}`);
    if (!wallet) {
      wallet = { id: generateId("wallet"), userId: auth.userId, starsBalance: 0, tonBalance: 0, starsReserved: 0, tonReserved: 0 };
    }
    if (wallet.starsReserved === undefined) wallet.starsReserved = 0;
    if (wallet.tonReserved === undefined) wallet.tonReserved = 0;

    const requiredAmount = currency === "stars" ? planData.stars : planData.ton;
    const currentBalance = currency === "stars" ? wallet.starsBalance : wallet.tonBalance;
    const reserved = currency === "stars" ? wallet.starsReserved : wallet.tonReserved;
    const available = currentBalance - reserved;

    if (available < requiredAmount) {
      return c.json({
        message: `Insufficient available balance. Need: ${requiredAmount}, available: ${available} (reserved: ${reserved})`,
        code: "INSUFFICIENT_BALANCE",
        status: 400,
        required: requiredAmount,
        current: available,
      }, 400);
    }

    if (currency === "stars") {
      wallet.starsBalance -= planData.stars;
    } else {
      wallet.tonBalance -= planData.ton;
    }
    await kv.set(`become:wallet:${auth.userId}`, wallet);

    const user = await kv.get(`become:user:${auth.userId}`);
    if (user) {
      const currentExpiry = user.subscriptionExpiresAt
        ? new Date(user.subscriptionExpiresAt).getTime()
        : Date.now();
      const base = Math.max(currentExpiry, Date.now());
      user.subscriptionExpiresAt = new Date(base + planData.days * 24 * 60 * 60 * 1000).toISOString();
      user.updatedAt = new Date().toISOString();
      await kv.set(`become:user:${auth.userId}`, user);

      const paymentId = generateId("pay");
      await kv.set(`become:payment:${paymentId}`, {
        id: paymentId,
        userId: auth.userId,
        telegramId: auth.telegramId,
        currency: currency === "stars" ? "XTR" : "TON",
        amount: requiredAmount,
        payload: `balance_sub_${plan}`,
        daysAdded: planData.days,
        type: "subscription",
        source: "wallet_balance",
        createdAt: new Date().toISOString(),
      });
      const paymentList = await kv.get(`become:payments:${auth.userId}`) || [];
      paymentList.push(paymentId);
      await kv.set(`become:payments:${auth.userId}`, paymentList);

      console.log(`[Payment] Subscription from balance: user=${auth.userId}, plan=${plan}, currency=${currency}`);
      await logTransaction(auth.userId, "subscription", requiredAmount, currency as "stars" | "ton", { description: `+${planData.days}d` });

      // Fire-and-forget: grant referral bonus to referrer if applicable
      grantReferralBonusOnSubscription(auth.userId).catch(() => {});

      return c.json({
        success: true,
        daysAdded: planData.days,
        newExpiry: user.subscriptionExpiresAt,
        newBalance: currency === "stars" ? wallet.starsBalance : wallet.tonBalance,
      });
    }

    return c.json({ message: "User not found", code: "NOT_FOUND", status: 404 }, 404);
  } catch (err) {
    console.log("POST /wallet/pay-subscription error:", err);
    return c.json({ message: `Error processing balance payment: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /wallet/ton-address ----
app.get(`${PREFIX}/wallet/ton-address`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    const tonWalletAddress = Deno.env.get("TON_WALLET_ADDRESS") || "";
    return c.json({ address: tonWalletAddress });
  } catch (err) {
    console.log("GET /wallet/ton-address error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /notifications/subscription-expiry ----
// Cron: send notifications for subscriptions expiring in 5 or 1 days
app.post(`${PREFIX}/notifications/subscription-expiry`, async (c) => {
  try {
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);

    // Dedup: avoid running twice on the same day
    const dedupKey = `become:cron:subexpiry:${today}`;
    const lastRun = await kv.get(dedupKey);
    if (lastRun) {
      return c.json({ success: true, sent: 0, skipped: "already_ran_today" });
    }
    await kv.set(dedupKey, { ranAt: new Date().toISOString() });

    const allMappings = await kv.getByPrefix("become:user:tg:");
    const userIds: string[] = [];
    for (const mapping of allMappings) {
      // getByPrefix returns values directly (not {key,value} objects)
      if (typeof mapping === "string") {
        userIds.push(mapping);
      }
    }

    let sent = 0;
    const batchSize = 20;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const keys = batch.map((id: string) => `become:user:${id}`);
      const users = await kv.mget(keys);

      for (const user of users) {
        if (!user || !user.telegramId || !user.subscriptionExpiresAt) continue;
        if (isAdminUser(String(user.telegramId))) continue; // skip admin

        const expiryTime = new Date(user.subscriptionExpiresAt).getTime();
        const daysLeft = Math.ceil((expiryTime - now) / (24 * 60 * 60 * 1000));
        const lang = user.language === "ru" ? "ru" : "en";
        const chatId = Number(user.telegramId);

        // Already notified for this threshold?
        const notifKey = `become:subnotif:${user.id}:${daysLeft}d`;
        const alreadySent = await kv.get(notifKey);
        if (alreadySent) continue;

        if (daysLeft === 5) {
          const text = lang === "ru"
            ? `⚠️ <b>Подписка истекает через 5 дней</b>\n\n📅 Действует до: <b>${new Date(user.subscriptionExpiresAt).toLocaleDateString("ru-RU")}</b>\n\nПродли подписку, чтобы не потерять доступ к AI-коучу и всем функциям Proper Food.`
            : `⚠️ <b>Your subscription expires in 5 days</b>\n\n📅 Valid until: <b>${new Date(user.subscriptionExpiresAt).toLocaleDateString("en-US")}</b>\n\nRenew your subscription to keep access to AI Coach and all Proper Food features.`;
          try {
            await sendMessage(chatId, text);
            await kv.set(notifKey, { sentAt: new Date().toISOString() });
            sent++;
          } catch (err) { console.log(`[SubExpiry] Error for user ${user.id} (5d):`, err); }
        } else if (daysLeft === 1) {
          const text = lang === "ru"
            ? `🔴 <b>Подписка истекает завтра!</b>\n\n⏰ Последний день: <b>${new Date(user.subscriptionExpiresAt).toLocaleDateString("ru-RU")}</b>\n\nПродли сейчас, чтобы продолжить путь к лучшей версии себя! 💪`
            : `🔴 <b>Your subscription expires tomorrow!</b>\n\n⏰ Last day: <b>${new Date(user.subscriptionExpiresAt).toLocaleDateString("en-US")}</b>\n\nRenew now to continue your journey to a better self! 💪`;
          try {
            await sendMessage(chatId, text);
            await kv.set(notifKey, { sentAt: new Date().toISOString() });
            sent++;
          } catch (err) { console.log(`[SubExpiry] Error for user ${user.id} (1d):`, err); }
        }
      }
    }

    console.log(`[SubExpiry] Sent ${sent} subscription expiry notifications`);
    return c.json({ success: true, sent, date: today });
  } catch (err) {
    console.log("POST /notifications/subscription-expiry error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// =============================================
// ADMIN ENDPOINTS
// =============================================

// Admin auth guard middleware helper
async function requireAdmin(c: any): Promise<{ userId: string; telegramId: string } | null> {
  const auth = await resolveUser(c);
  if (!auth) return null;
  if (!isAdminUser(auth.telegramId)) return null;
  return auth;
}

// ---- GET /admin/users ----
// List all users with optional search & pagination
app.get(`${PREFIX}/admin/users`, async (c) => {
  try {
    const admin = await requireAdmin(c);
    if (!admin) return c.json({ message: "Forbidden: admin only", code: "FORBIDDEN", status: 403 }, 403);

    const search = (c.req.query("search") || "").toLowerCase();
    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "50");
    const filter = c.req.query("filter") || "all"; // all | active | expired

    // Get all user mappings from KV by prefix
    // getByPrefix returns values directly (not {key,value} objects)
    const allMappings = await kv.getByPrefix("become:user:tg:");
    console.log(`[Admin] getByPrefix returned ${allMappings.length} mappings, sample:`, allMappings.slice(0, 3));
    const userIds: string[] = [];
    for (const mapping of allMappings) {
      if (typeof mapping === "string") {
        userIds.push(mapping);
      }
    }
    console.log(`[Admin] Extracted ${userIds.length} userIds from mappings`);

    // Fetch all users in batches
    const users: any[] = [];
    const batchSize = 20;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const keys = batch.map((id) => `become:user:${id}`);
      const results = await kv.mget(keys);
      for (const u of results) {
        if (u) users.push(u);
      }
    }

    // Filter
    let filtered = users;
    if (search) {
      filtered = filtered.filter((u) => {
        const name = (u.displayName || u.firstName || "").toLowerCase();
        const phone = (u.phoneNumber || "").toLowerCase();
        const tgId = String(u.telegramId || "").toLowerCase();
        const username = (u.telegramUsername || "").toLowerCase();
        return name.includes(search) || phone.includes(search) || tgId.includes(search) || username.includes(search);
      });
    }

    if (filter === "active") {
      filtered = filtered.filter((u) => u.subscriptionExpiresAt && new Date(u.subscriptionExpiresAt).getTime() > Date.now());
    } else if (filter === "expired") {
      filtered = filtered.filter((u) => !u.subscriptionExpiresAt || new Date(u.subscriptionExpiresAt).getTime() <= Date.now());
    }

    // Sort by createdAt desc
    filtered.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    const total = filtered.length;
    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    // Fetch payment totals for paginated users
    const paymentTotals: Record<string, number> = {};
    for (const u of paginated) {
      try {
        const payIds: string[] = await kv.get(`become:payments:${u.id}`) || [];
        if (payIds.length > 0) {
          const payKeys = payIds.map((id: string) => `become:payment:${id}`);
          const pays = await kv.mget(payKeys);
          let total = 0;
          for (const p of pays) {
            if (p && p.amount) {
              // Convert XTR amounts (Stars) to display value
              total += p.currency === "XTR" ? p.amount : p.amount;
            }
          }
          paymentTotals[u.id] = total;
        }
      } catch (_) { /* non-critical */ }
    }

    return c.json({
      users: paginated.map((u) => ({
        id: u.id,
        displayName: u.displayName || u.firstName || "Unknown",
        telegramId: u.telegramId,
        telegramUsername: u.telegramUsername,
        phoneNumber: u.phoneNumber,
        language: u.language,
        subscriptionExpiresAt: u.subscriptionExpiresAt,
        isSubscriptionActive: u.subscriptionExpiresAt ? new Date(u.subscriptionExpiresAt).getTime() > Date.now() : false,
        referralCode: u.referralCode,
        referralCount: u.referralCount || 0,
        xp: u.xp || 0,
        totalPaid: paymentTotals[u.id] || 0,
        createdAt: u.createdAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.log("GET /admin/users error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /admin/subscription ----
// Grant or revoke subscription for a user
app.post(`${PREFIX}/admin/subscription`, async (c) => {
  try {
    const admin = await requireAdmin(c);
    if (!admin) return c.json({ message: "Forbidden: admin only", code: "FORBIDDEN", status: 403 }, 403);

    const { userId, action, days } = await c.req.json();
    // action: "grant" | "revoke"
    // days: number of days to grant (only for "grant")

    if (!userId || !action) {
      return c.json({ message: "userId and action required", code: "BAD_REQUEST", status: 400 }, 400);
    }

    const user = await kv.get(`become:user:${userId}`);
    if (!user) return c.json({ message: "User not found", code: "NOT_FOUND", status: 404 }, 404);

    if (action === "grant") {
      const daysToAdd = days || 30;
      const currentExpiry = user.subscriptionExpiresAt
        ? new Date(user.subscriptionExpiresAt).getTime()
        : Date.now();
      const base = Math.max(currentExpiry, Date.now());
      user.subscriptionExpiresAt = new Date(base + daysToAdd * 24 * 60 * 60 * 1000).toISOString();
      user.updatedAt = new Date().toISOString();
      await kv.set(`become:user:${userId}`, user);

      // Notify user
      try {
        if (user.telegramId) {
          const lang = user.language === "ru" ? "ru" : "en";
          const text = lang === "ru"
            ? `🎁 <b>Вам выдана подписка!</b>\n\nАдминистратор выдал вам <b>${daysToAdd} дней</b> подписки.\nДействует до: <b>${new Date(user.subscriptionExpiresAt).toLocaleDateString("ru-RU")}</b>`
            : `🎁 <b>Subscription granted!</b>\n\nAdmin granted you <b>${daysToAdd} days</b> subscription.\nValid until: <b>${new Date(user.subscriptionExpiresAt).toLocaleDateString("en-US")}</b>`;
          await sendMessage(Number(user.telegramId), text);
        }
      } catch (_) { /* non-critical */ }

      console.log(`[Admin] Granted ${daysToAdd} days to user ${userId}, new expiry: ${user.subscriptionExpiresAt}`);
      return c.json({ success: true, subscriptionExpiresAt: user.subscriptionExpiresAt, action: "grant", days: daysToAdd });
    } else if (action === "revoke") {
      user.subscriptionExpiresAt = new Date(Date.now() - 1000).toISOString(); // Set to past
      user.updatedAt = new Date().toISOString();
      await kv.set(`become:user:${userId}`, user);

      // Notify user
      try {
        if (user.telegramId) {
          const lang = user.language === "ru" ? "ru" : "en";
          const text = lang === "ru"
            ? `⚠️ <b>Подписка отключена</b>\n\nВаша подписка была отключена администратором.`
            : `⚠️ <b>Subscription revoked</b>\n\nYour subscription has been revoked by admin.`;
          await sendMessage(Number(user.telegramId), text);
        }
      } catch (_) { /* non-critical */ }

      console.log(`[Admin] Revoked subscription for user ${userId}`);
      return c.json({ success: true, subscriptionExpiresAt: user.subscriptionExpiresAt, action: "revoke" });
    }

    return c.json({ message: "Invalid action, use 'grant' or 'revoke'", code: "BAD_REQUEST", status: 400 }, 400);
  } catch (err) {
    console.log("POST /admin/subscription error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /admin/broadcast ----
// Send broadcast message to users
app.post(`${PREFIX}/admin/broadcast`, async (c) => {
  try {
    const admin = await requireAdmin(c);
    if (!admin) return c.json({ message: "Forbidden: admin only", code: "FORBIDDEN", status: 403 }, 403);

    const { text, audience, mediaType, mediaUrls } = await c.req.json();
    // audience: "all" | "subscribers" | "non_subscribers"
    // mediaType: null | "photo" | "photos" | "video"
    // mediaUrls: string[] — URLs of photos/video

    if (!text && (!mediaUrls || mediaUrls.length === 0)) {
      return c.json({ message: "Text or media required", code: "BAD_REQUEST", status: 400 }, 400);
    }

    // Get all users
    // getByPrefix returns values directly (not {key,value} objects)
    const allMappings = await kv.getByPrefix("become:user:tg:");
    const userIds: string[] = [];
    for (const mapping of allMappings) {
      if (typeof mapping === "string") {
        userIds.push(mapping);
      }
    }
    console.log(`[Admin] Starting broadcast to ${userIds.length} users (audience: ${audience})`);

    // Fetch all users
    const users: any[] = [];
    const batchSize = 20;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const keys = batch.map((id) => `become:user:${id}`);
      const results = await kv.mget(keys);
      for (const u of results) {
        if (u && u.telegramId) users.push(u);
      }
    }

    // Filter audience
    let targets = users;
    if (audience === "subscribers") {
      targets = users.filter((u) => u.subscriptionExpiresAt && new Date(u.subscriptionExpiresAt).getTime() > Date.now());
    } else if (audience === "non_subscribers") {
      targets = users.filter((u) => !u.subscriptionExpiresAt || new Date(u.subscriptionExpiresAt).getTime() <= Date.now());
    }

    console.log(`[Admin] Broadcast: ${targets.length} targets after audience filter '${audience}' (total users: ${users.length})`);

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const user of targets) {
      try {
        const chatId = Number(user.telegramId);

        if (mediaType === "photos" && mediaUrls && mediaUrls.length > 1) {
          // Send media group
          const media = mediaUrls.map((url: string, idx: number) => ({
            type: "photo" as const,
            media: url,
            ...(idx === 0 && text ? { caption: text, parse_mode: "HTML" } : {}),
          }));
          await sendMediaGroup(chatId, media);
        } else if (mediaType === "photo" && mediaUrls && mediaUrls.length > 0) {
          await sendPhoto(chatId, mediaUrls[0], text || undefined);
        } else if (mediaType === "video" && mediaUrls && mediaUrls.length > 0) {
          await sendVideo(chatId, mediaUrls[0], text || undefined);
        } else if (text) {
          await sendMessage(chatId, text);
        }

        sent++;

        // Rate limit: ~30 messages per second (Telegram limit)
        if (sent % 25 === 0) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      } catch (err) {
        failed++;
        errors.push(`${user.telegramId}: ${err}`);
        console.log(`[Admin] Broadcast failed for ${user.telegramId}:`, err);
      }
    }

    // Log broadcast
    const broadcastId = generateId("bc");
    await kv.set(`become:broadcast:${broadcastId}`, {
      id: broadcastId,
      adminId: admin.userId,
      audience,
      text: text?.substring(0, 200),
      mediaType,
      mediaUrls,
      targetCount: targets.length,
      sent,
      failed,
      createdAt: new Date().toISOString(),
    });

    console.log(`[Admin] Broadcast ${broadcastId} complete: sent=${sent}, failed=${failed}`);
    return c.json({ success: true, broadcastId, sent, failed, total: targets.length, errors: errors.slice(0, 10) });
  } catch (err) {
    console.log("POST /admin/broadcast error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /admin/stats ----
app.get(`${PREFIX}/admin/stats`, async (c) => {
  try {
    const admin = await requireAdmin(c);
    if (!admin) return c.json({ message: "Forbidden: admin only", code: "FORBIDDEN", status: 403 }, 403);

    // getByPrefix returns values directly (not {key,value} objects)
    const allMappings = await kv.getByPrefix("become:user:tg:");
    const userIds: string[] = [];
    for (const mapping of allMappings) {
      if (typeof mapping === "string") userIds.push(mapping);
    }

    const users: any[] = [];
    const batchSize = 20;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const keys = batch.map((id) => `become:user:${id}`);
      const results = await kv.mget(keys);
      for (const u of results) if (u) users.push(u);
    }

    const now = Date.now();
    const activeSubscribers = users.filter((u) => u.subscriptionExpiresAt && new Date(u.subscriptionExpiresAt).getTime() > now).length;
    const today = new Date().toISOString().slice(0, 10);
    const newToday = users.filter((u) => u.createdAt?.startsWith(today)).length;
    const totalReferrals = users.reduce((s, u) => s + (u.referralCount || 0), 0);

    return c.json({
      totalUsers: users.length,
      activeSubscribers,
      expiredSubscribers: users.length - activeSubscribers,
      newToday,
      totalReferrals,
    });
  } catch (err) {
    console.log("GET /admin/stats error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /admin/send-notification ----
// Send a direct message to a specific user via bot (supports text + media)
app.post(`${PREFIX}/admin/send-notification`, async (c) => {
  try {
    const admin = await requireAdmin(c);
    if (!admin) return c.json({ message: "Forbidden: admin only", code: "FORBIDDEN", status: 403 }, 403);

    const { userId, text, mediaType, mediaUrls } = await c.req.json();
    if (!userId || (!text && (!mediaUrls || mediaUrls.length === 0))) {
      return c.json({ message: "userId and text (or media) are required", code: "BAD_REQUEST", status: 400 }, 400);
    }

    const user = await kv.get(`become:user:${userId}`);
    if (!user || !user.telegramId) {
      return c.json({ message: "User not found or no telegramId", code: "NOT_FOUND", status: 404 }, 404);
    }

    const chatId = Number(user.telegramId);
    const filteredUrls = (mediaUrls || []).filter((u: string) => u && u.trim());

    if (mediaType === "photos" && filteredUrls.length > 1) {
      // Send media group
      const media = filteredUrls.map((url: string, idx: number) => ({
        type: "photo" as const,
        media: url,
        ...(idx === 0 && text ? { caption: text, parse_mode: "HTML" } : {}),
      }));
      await sendMediaGroup(chatId, media);
    } else if (mediaType === "photo" && filteredUrls.length > 0) {
      await sendPhoto(chatId, filteredUrls[0], text || undefined);
    } else if (mediaType === "video" && filteredUrls.length > 0) {
      await sendVideo(chatId, filteredUrls[0], text || undefined);
    } else if (text) {
      await sendMessage(chatId, text);
    } else {
      return c.json({ message: "Nothing to send", code: "BAD_REQUEST", status: 400 }, 400);
    }

    console.log(`[Admin] Notification sent to user ${userId} (tg:${user.telegramId}), mediaType=${mediaType || "none"}`);
    return c.json({ success: true });
  } catch (err: any) {
    console.log("POST /admin/send-notification error:", err);
    return c.json({ success: false, error: err?.message || String(err) }, 500);
  }
});

// ---- POST /admin/credit-wallet ----
// Credit Stars or TON to a user's wallet
app.post(`${PREFIX}/admin/credit-wallet`, async (c) => {
  try {
    const admin = await requireAdmin(c);
    if (!admin) return c.json({ message: "Forbidden: admin only", code: "FORBIDDEN", status: 403 }, 403);

    const { userId, currency, amount } = await c.req.json();
    if (!userId || !currency || !amount || amount <= 0) {
      return c.json({ message: "userId, currency (stars|ton), and positive amount are required", code: "BAD_REQUEST", status: 400 }, 400);
    }
    if (currency !== "stars" && currency !== "ton") {
      return c.json({ message: "currency must be 'stars' or 'ton'", code: "BAD_REQUEST", status: 400 }, 400);
    }

    const wallet = await kv.get(`become:wallet:${userId}`);
    if (!wallet) {
      return c.json({ message: "Wallet not found for user", code: "NOT_FOUND", status: 404 }, 404);
    }

    if (currency === "stars") {
      wallet.starsBalance = (wallet.starsBalance || 0) + amount;
    } else {
      wallet.tonBalance = (wallet.tonBalance || 0) + amount;
    }
    wallet.updatedAt = new Date().toISOString();
    await kv.set(`become:wallet:${userId}`, wallet);

    // Log transaction
    await logTransaction(userId, currency === "stars" ? "topup_stars" : "topup_ton", amount, currency, {
      description: `Admin credit by ${admin.userId}`,
    });

    // Notify user about wallet credit via Telegram
    try {
      const creditedUser = await kv.get(`become:user:${userId}`);
      if (creditedUser && creditedUser.telegramId) {
        const chatId = Number(creditedUser.telegramId);
        const lang = creditedUser.language || "en";
        const symbol = currency === "stars" ? "★" : "TON";
        const newBalance = currency === "stars" ? wallet.starsBalance : wallet.tonBalance;
        const notifText = lang === "ru"
          ? `🎁 <b>Баланс пополнен!</b>\n\n💰 Зачислено: <b>${amount} ${symbol}</b>\n📊 Новый баланс: <b>${newBalance} ${symbol}</b>\n\nСпасибо, что вы с Proper Food! 🚀`
          : `🎁 <b>Balance topped up!</b>\n\n💰 Credited: <b>${amount} ${symbol}</b>\n📊 New balance: <b>${newBalance} ${symbol}</b>\n\nThank you for being with Proper Food! 🚀`;
        await sendMessage(chatId, notifText);
        console.log(`[Admin] Sent credit notification to user ${userId} (tg:${creditedUser.telegramId}): ${amount} ${currency}`);
      }
    } catch (notifErr) {
      // Non-critical: don't fail the credit operation if notification fails
      console.log(`[Admin] Failed to send credit notification to user ${userId}:`, notifErr);
    }

    console.log(`[Admin] Credited ${amount} ${currency} to user ${userId} by admin ${admin.userId}`);
    return c.json({
      success: true,
      starsBalance: wallet.starsBalance,
      tonBalance: wallet.tonBalance,
    });
  } catch (err) {
    console.log("POST /admin/credit-wallet error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /admin/user-wallet ----
// Get wallet details for a specific user (admin only)
app.get(`${PREFIX}/admin/user-wallet`, async (c) => {
  try {
    const admin = await requireAdmin(c);
    if (!admin) return c.json({ message: "Forbidden: admin only", code: "FORBIDDEN", status: 403 }, 403);

    const userId = c.req.query("userId");
    if (!userId) {
      return c.json({ message: "userId query param is required", code: "BAD_REQUEST", status: 400 }, 400);
    }

    const wallet = await kv.get(`become:wallet:${userId}`);
    if (!wallet) {
      return c.json({ starsBalance: 0, tonBalance: 0, starsReserved: 0, tonReserved: 0 });
    }

    return c.json({
      starsBalance: wallet.starsBalance || 0,
      tonBalance: wallet.tonBalance || 0,
      starsReserved: wallet.starsReserved || 0,
      tonReserved: wallet.tonReserved || 0,
    });
  } catch (err) {
    console.log("GET /admin/user-wallet error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /admin/upload-media ----
// Upload media file (photo/video) to Supabase Storage for broadcast/notifications
const ADMIN_MEDIA_BUCKET = "make-f366fb78-admin-media";

async function ensureAdminMediaBucket() {
  try {
    const supabase = getSupabaseAdmin();
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets?.some((b: any) => b.name === ADMIN_MEDIA_BUCKET);
    if (!exists) {
      await supabase.storage.createBucket(ADMIN_MEDIA_BUCKET, { public: false });
      console.log(`[Storage] Created bucket ${ADMIN_MEDIA_BUCKET}`);
    }
  } catch (err) {
    console.log(`[Storage] Error ensuring admin media bucket:`, err);
  }
}

app.post(`${PREFIX}/admin/upload-media`, async (c) => {
  try {
    const admin = await requireAdmin(c);
    if (!admin) return c.json({ message: "Forbidden: admin only", code: "FORBIDDEN", status: 403 }, 403);

    await ensureAdminMediaBucket();

    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return c.json({ message: "No file provided", code: "BAD_REQUEST", status: 400 }, 400);
    }

    // Validate file size (20MB max for video)
    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      return c.json({ message: "File too large (max 20MB)", code: "BAD_REQUEST", status: 400 }, 400);
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const fileName = `admin_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const arrayBuf = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);

    const supabase = getSupabaseAdmin();
    const { error: uploadError } = await supabase.storage
      .from(ADMIN_MEDIA_BUCKET)
      .upload(fileName, bytes.buffer, { contentType: file.type, upsert: true });

    if (uploadError) {
      console.log(`[Admin] Upload error:`, uploadError);
      return c.json({ message: `Upload error: ${uploadError.message}`, code: "STORAGE_ERROR", status: 500 }, 500);
    }

    // Create a long-lived signed URL (30 days)
    const { data: signedData, error: signError } = await supabase.storage
      .from(ADMIN_MEDIA_BUCKET)
      .createSignedUrl(fileName, 30 * 24 * 60 * 60);

    if (signError || !signedData?.signedUrl) {
      console.log(`[Admin] SignedUrl error:`, signError);
      return c.json({ message: "Failed to create signed URL", code: "STORAGE_ERROR", status: 500 }, 500);
    }

    console.log(`[Admin] Uploaded media: ${fileName} (${file.size} bytes, ${file.type})`);
    return c.json({ success: true, url: signedData.signedUrl, fileName, size: file.size, type: file.type });
  } catch (err) {
    console.log("POST /admin/upload-media error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- DELETE /admin/delete-user ----
// Completely remove a user and all their data from KV store
app.delete(`${PREFIX}/admin/delete-user`, async (c) => {
  try {
    const admin = await requireAdmin(c);
    if (!admin) return c.json({ message: "Forbidden: admin only", code: "FORBIDDEN", status: 403 }, 403);

    const { userId } = await c.req.json();
    if (!userId) {
      return c.json({ message: "userId is required", code: "BAD_REQUEST", status: 400 }, 400);
    }

    // Prevent admin from deleting themselves
    const user = await kv.get(`become:user:${userId}`);
    if (!user) {
      return c.json({ message: "User not found", code: "NOT_FOUND", status: 404 }, 404);
    }
    if (isAdminUser(String(user.telegramId))) {
      return c.json({ message: "Cannot delete admin user", code: "FORBIDDEN", status: 403 }, 403);
    }

    const deletedKeys: string[] = [];
    const errors: string[] = [];

    // Helper to safely delete a key
    const safeDelete = async (key: string) => {
      try {
        await kv.del(key);
        deletedKeys.push(key);
      } catch (e) {
        errors.push(`${key}: ${e}`);
      }
    };

    // Helper to delete all keys by prefix
    const deleteByPrefix = async (prefix: string) => {
      try {
        const items = await kv.getByPrefix(prefix);
        if (items && items.length > 0) {
          for (const item of items) {
            const itemKey = typeof item === 'object' && item !== null && 'key' in item ? (item as any).key : null;
            if (itemKey) {
              await safeDelete(itemKey);
            }
          }
        }
      } catch (e) {
        errors.push(`prefix:${prefix}: ${e}`);
      }
    };

    // 1. Core user data
    await safeDelete(`become:user:${userId}`);
    if (user.telegramId) {
      await safeDelete(`become:user:tg:${user.telegramId}`);
      await safeDelete(`become:lang:${user.telegramId}`);
    }

    // 2. Wallet
    await safeDelete(`become:wallet:${userId}`);

    // 3. Referral code mapping
    if (user.referralCode) {
      await safeDelete(`become:referral:${user.referralCode}`);
    }
    await safeDelete(`become:referral:log:${userId}`);

    // 4. Bonuses
    await safeDelete(`become:bonus:social:${userId}:telegram`);
    await safeDelete(`become:bonus:social:${userId}:instagram`);
    await safeDelete(`become:bonus:ref_rewards:${userId}`);

    // 5. Transactions
    const txIds: string[] = (await kv.get(`become:txs:${userId}`)) || [];
    for (const txId of txIds) {
      await safeDelete(`become:tx:${txId}`);
    }
    await safeDelete(`become:txs:${userId}`);

    // 6. Payments
    const paymentIds: string[] = (await kv.get(`become:payments:${userId}`)) || [];
    for (const payId of paymentIds) {
      await safeDelete(`become:payment:${payId}`);
    }
    await safeDelete(`become:payments:${userId}`);

    // 7. Progress (all programs)
    await deleteByPrefix(`become:progress:${userId}:`);

    // 8. Notes / Journal
    await deleteByPrefix(`become:note:${userId}:`);

    // 9. Goals
    await deleteByPrefix(`become:goal:${userId}:`);

    // 10. Tasks
    await deleteByPrefix(`become:task:${userId}:`);

    // 11. Focus sessions
    await deleteByPrefix(`become:focus:${userId}:`);

    // 12. AI Coach conversations & cache
    await deleteByPrefix(`become:coach_conv:${userId}:`);
    await deleteByPrefix(`become:coach:${userId}:`);

    // 13. Plan drafts
    await deleteByPrefix(`become:plan_draft:${userId}:`);

    // 14. Sessions — can't enumerate easily, but they expire via TTL.

    // 15. Remove user from challenges (set status to 'left')
    try {
      const allChallenges = await kv.getByPrefix("become:challenge:");
      for (const chItem of allChallenges) {
        const ch = typeof chItem === 'object' && chItem !== null && 'value' in chItem ? (chItem as any).value : chItem;
        if (!ch || !ch.members) continue;
        const memberIdx = ch.members.findIndex((m: any) => m.userId === userId);
        if (memberIdx >= 0) {
          ch.members[memberIdx].status = 'left';
          await kv.set(`become:challenge:${ch.id}`, ch);
          deletedKeys.push(`become:challenge:${ch.id}:member:${userId}:left`);
        }
      }
    } catch (e) {
      errors.push(`challenges: ${e}`);
    }

    console.log(`[Admin] Deleted user ${userId} (tg:${user.telegramId}). Keys removed: ${deletedKeys.length}, errors: ${errors.length}`);

    return c.json({
      success: true,
      deletedKeys: deletedKeys.length,
      errors: errors.length > 0 ? errors : undefined,
      user: {
        id: userId,
        telegramId: user.telegramId,
        displayName: user.displayName || user.firstName || 'Unknown',
      },
    });
  } catch (err) {
    console.log("DELETE /admin/delete-user error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ======================================================
// Challenge expiry reminder cron — 24h before endAt
// ======================================================
const CH_EXPIRY_LOCK_KEY = "become:cron:ch-expiry:lock";
const CH_EXPIRY_LOCK_TTL = 15 * 60 * 1000; // 15 min

async function runChallengeExpiryRemindersCron(): Promise<{ sent: number; timestamp: string; skipped?: boolean }> {
  const nowMs = Date.now();
  const nowISO = new Date(nowMs).toISOString();

  // ── Distributed lock via KV ──
  const existing = await kv.get(CH_EXPIRY_LOCK_KEY);
  if (existing && (nowMs - existing.ts) < CH_EXPIRY_LOCK_TTL) {
    console.log(`[ChExpiry] Skipped — lock held (age ${Math.round((nowMs - existing.ts) / 1000)}s)`);
    return { sent: 0, timestamp: nowISO, skipped: true };
  }
  const lockId = crypto.randomUUID();
  await kv.set(CH_EXPIRY_LOCK_KEY, { id: lockId, ts: nowMs });

  const verify = await kv.get(CH_EXPIRY_LOCK_KEY);
  if (verify?.id !== lockId) {
    console.log("[ChExpiry] Lost lock race, skipping");
    return { sent: 0, timestamp: nowISO, skipped: true };
  }

  let sent = 0;
  try {
    const challenges = await kv.getByPrefix("become:challenge:");
    const activeOnes = (challenges || []).filter((ch: any) => ch.status === "active" && ch.endAt);

    for (const ch of activeOnes) {
      const endMs = new Date(ch.endAt).getTime();
      const hoursLeft = (endMs - nowMs) / (1000 * 60 * 60);

      // Only notify if between 20-28 hours before end (to avoid duplicate sends with some buffer)
      if (hoursLeft < 20 || hoursLeft > 28) continue;

      // Check if we already sent expiry notification for this challenge
      const notifKey = `become:ch_expiry_notif:${ch.id}`;
      const alreadySent = await kv.get(notifKey);
      if (alreadySent) continue;

      // Mark as sent (before actually sending, to prevent duplicates)
      await kv.set(notifKey, { sentAt: nowISO });

      // Get all active members
      const members = await kv.getByPrefix(`become:ch_member:${ch.id}:`);
      const activeMembers = (members || []).filter((m: any) => m.status === "active");

      for (const member of activeMembers) {
        try {
          const user = await kv.get(`become:user:${member.userId}`);
          if (!user?.telegramId) continue;

          await notifyChallengeExpiring(
            member.userId,
            Number(user.telegramId),
            ch.title,
            hoursLeft,
            ch.id
          );
          sent++;
        } catch (e) {
          console.log(`[ChExpiry] Failed to notify user ${member.userId}:`, e);
        }
      }

      console.log(`[ChExpiry] Notified ${activeMembers.length} members for challenge ${ch.id} (${ch.title}), ${Math.round(hoursLeft)}h left`);
    }

    console.log(`[ChExpiry] Total expiry reminders sent: ${sent}`);
    return { sent, timestamp: nowISO };
  } finally {
    try { await kv.del(CH_EXPIRY_LOCK_KEY); } catch (_) {}
  }
}

// ---- POST /cron/challenge-expiry ----
app.post(`${PREFIX}/cron/challenge-expiry`, async (c) => {
  try {
    const result = await runChallengeExpiryRemindersCron();
    return c.json(result);
  } catch (err) {
    console.log("[ChExpiry] cron error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /user-profile ----
// Save nutrition onboarding data
app.post(`${PREFIX}/user-profile`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) {
      return c.json(
        { message: "Unauthorized", code: "UNAUTHORIZED", status: 401 },
        401
      );
    }

    const body = await c.req.json();
    const { gender, age, height, weight, activity_level, goal } = body;

    // Validate required fields
    if (!gender || !age || !height || !weight || !activity_level || !goal) {
      return c.json(
        { message: "Missing required fields", code: "VALIDATION_ERROR", status: 400 },
        400
      );
    }

    const profile = {
      telegram_id: auth.telegramId,
      gender,
      age: Number(age),
      height: Number(height),
      weight: Number(weight),
      activity_level,
      goal,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Store in kv with key pattern: become:user_profile:{telegramId}
    await kv.set(`become:user_profile:${auth.telegramId}`, profile);
    console.log(`[UserProfile] Saved profile for telegram_id: ${auth.telegramId}`);

    return c.json({ success: true });
  } catch (err) {
    console.log("POST /user-profile error:", err);
    return c.json(
      { message: `Error saving profile: ${err}`, code: "INTERNAL_ERROR", status: 500 },
      500
    );
  }
});

// ---- GET /user-profile ----
// Retrieve nutrition onboarding data
app.get(`${PREFIX}/user-profile`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) {
      return c.json(
        { message: "Unauthorized", code: "UNAUTHORIZED", status: 401 },
        401
      );
    }

    const profile = await kv.get(`become:user_profile:${auth.telegramId}`);
    if (!profile) {
      return c.json(
        { message: "Profile not found", code: "NOT_FOUND", status: 404 },
        404
      );
    }

    return c.json(profile);
  } catch (err) {
    console.log("GET /user-profile error:", err);
    return c.json(
      { message: `Error fetching profile: ${err}`, code: "INTERNAL_ERROR", status: 500 },
      500
    );
  }
});

// =============================================
// WEIGHT TRACKING
// =============================================

// ---- POST /weight-log ----
// Log a weight entry
app.post(`${PREFIX}/weight-log`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const body = await c.req.json();
    const { weight, note } = body;

    if (!weight || isNaN(Number(weight)) || Number(weight) < 20 || Number(weight) > 500) {
      return c.json({ message: "Invalid weight value", code: "VALIDATION_ERROR", status: 400 }, 400);
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const entryId = generateId("wt");

    const entry = {
      id: entryId,
      userId: auth.userId,
      weight: Number(weight),
      note: note || null,
      date: dateStr,
      created_at: now.toISOString(),
    };

    // Store individual entry
    await kv.set(`become:weight:${auth.userId}:${entryId}`, entry);

    // Update date index (one entry per day, latest wins)
    const dateIndexKey = `become:weight_idx:${auth.userId}`;
    const dateIndex: Array<{ date: string; entryId: string }> = (await kv.get(dateIndexKey)) || [];

    // Replace if same date, otherwise prepend
    const existingIdx = dateIndex.findIndex((d: any) => d.date === dateStr);
    if (existingIdx >= 0) {
      // Delete old entry for this date
      const oldEntryId = dateIndex[existingIdx].entryId;
      await kv.del(`become:weight:${auth.userId}:${oldEntryId}`);
      dateIndex[existingIdx] = { date: dateStr, entryId };
    } else {
      dateIndex.unshift({ date: dateStr, entryId });
    }

    // Keep max 365 entries
    if (dateIndex.length > 365) {
      const removed = dateIndex.splice(365);
      for (const r of removed) {
        kv.del(`become:weight:${auth.userId}:${r.entryId}`).catch(() => {});
      }
    }

    await kv.set(dateIndexKey, dateIndex);

    // Also update user profile weight
    try {
      const profile = await kv.get(`become:user_profile:${auth.telegramId}`);
      if (profile) {
        profile.weight = Number(weight);
        profile.updated_at = now.toISOString();
        await kv.set(`become:user_profile:${auth.telegramId}`, profile);
      }
    } catch (e) {
      console.log("[WeightLog] Profile update error (non-critical):", e);
    }

    // Invalidate weekly trends cache
    try {
      const cacheKey = `become:cache:weekly_trends:${auth.userId}:${dateStr}`;
      await kv.del(cacheKey);
    } catch (_) {}

    console.log(`[WeightLog] Saved entry ${entryId} for user ${auth.userId}: ${weight}kg`);
    return c.json({ success: true, entry });
  } catch (err) {
    console.log("POST /weight-log error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /weight-log/history ----
// Get weight history (last N entries)
app.get(`${PREFIX}/weight-log/history`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const limitParam = c.req.query("limit");
    const limit = Math.min(Number(limitParam) || 90, 365);

    const dateIndexKey = `become:weight_idx:${auth.userId}`;
    const dateIndex: Array<{ date: string; entryId: string }> = (await kv.get(dateIndexKey)) || [];

    if (dateIndex.length === 0) {
      return c.json({ entries: [], count: 0 });
    }

    const sliced = dateIndex.slice(0, limit);
    const keys = sliced.map((d: any) => `become:weight:${auth.userId}:${d.entryId}`);
    const entries = (await kv.mget(keys)).filter((e: any) => e && e.id);

    return c.json({ entries, count: entries.length });
  } catch (err) {
    console.log("GET /weight-log/history error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- DELETE /weight-log/:entryId ----
app.delete(`${PREFIX}/weight-log/:entryId`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const entryId = c.req.param("entryId");
    await kv.del(`become:weight:${auth.userId}:${entryId}`);

    // Remove from index
    const dateIndexKey = `become:weight_idx:${auth.userId}`;
    const dateIndex: Array<{ date: string; entryId: string }> = (await kv.get(dateIndexKey)) || [];
    const filtered = dateIndex.filter((d: any) => d.entryId !== entryId);
    await kv.set(dateIndexKey, filtered);

    return c.json({ success: true });
  } catch (err) {
    console.log("DELETE /weight-log/:entryId error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /weight-log/check-reminder ----
// Check if user needs a weigh-in reminder. Sends Telegram notification
// if they haven't logged weight today. Daily dedup via KV.
app.post(`${PREFIX}/weight-log/check-reminder`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const today = new Date().toISOString().slice(0, 10);
    const dedupKey = `become:weighin_reminder:${auth.userId}:${today}`;
    
    // Check if already sent today
    const alreadySent = await kv.get(dedupKey);
    if (alreadySent) {
      return c.json({ sent: false, reason: "already_sent_today" });
    }

    // Check if user has logged weight today
    const dateIndexKey = `become:weight_idx:${auth.userId}`;
    const dateIndex: Array<{ date: string; entryId: string }> = (await kv.get(dateIndexKey)) || [];
    const todayEntry = dateIndex.find((d: any) => d.date === today);
    
    if (todayEntry) {
      return c.json({ sent: false, reason: "already_logged_today" });
    }

    // Check if user has any weight entries at all (don't remind brand new users)
    if (dateIndex.length === 0) {
      return c.json({ sent: false, reason: "no_history" });
    }

    // Get user for telegram ID and language
    const user = await kv.get(`become:user:${auth.userId}`);
    if (!user?.telegramId) {
      return c.json({ sent: false, reason: "no_telegram_id" });
    }

    // Check notification preferences
    const prefs = await getNotificationPrefs(auth.userId);
    if (!prefs.enabled || !prefs.dailyReminder) {
      return c.json({ sent: false, reason: "notifications_disabled" });
    }

    // Determine last weigh-in date
    const lastDate = dateIndex.length > 0 ? dateIndex[0].date : null;
    const daysSinceLast = lastDate
      ? Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000)
      : 0;

    // Send reminder
    const lang = user.language || "en";
    const emoji = "\u2696\uFE0F";
    const text = lang === "ru"
      ? `${emoji} \u041D\u0435 \u0437\u0430\u0431\u0443\u0434\u044C\u0442\u0435 \u0432\u0437\u0432\u0435\u0441\u0438\u0442\u044C\u0441\u044F \u0441\u0435\u0433\u043E\u0434\u043D\u044F!\n\n${daysSinceLast > 1 ? `\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0435\u0435 \u0432\u0437\u0432\u0435\u0448\u0438\u0432\u0430\u043D\u0438\u0435: ${daysSinceLast} \u0434\u043D. \u043D\u0430\u0437\u0430\u0434.` : "\u0420\u0435\u0433\u0443\u043B\u044F\u0440\u043D\u043E\u0435 \u043E\u0442\u0441\u043B\u0435\u0436\u0438\u0432\u0430\u043D\u0438\u0435 \u043F\u043E\u043C\u043E\u0433\u0430\u0435\u0442 \u0432\u0438\u0434\u0435\u0442\u044C \u043F\u0440\u043E\u0433\u0440\u0435\u0441\u0441."}\n\n\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435, \u0447\u0442\u043E\u0431\u044B \u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u0432\u0435\u0441.`
      : `${emoji} Don't forget to weigh in today!\n\n${daysSinceLast > 1 ? `Last weigh-in: ${daysSinceLast} days ago.` : "Regular tracking helps you see your progress."}\n\nOpen the app to log your weight.`;

    const keyboard = [[{
      text: lang === "ru" ? "\uD83D\uDCCA \u0417\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u0432\u0435\u0441" : "\uD83D\uDCCA Log Weight",
      url: buildTgDeepLink('weight'),
    }]];

    await sendMessage(user.telegramId, text, keyboard);

    // Mark as sent today
    await kv.set(dedupKey, { sentAt: new Date().toISOString() });

    console.log(`[WeighIn Reminder] Sent to user ${auth.userId} (${daysSinceLast} days since last)`);
    return c.json({ sent: true, daysSinceLast });
  } catch (err) {
    console.log("POST /weight-log/check-reminder error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// =============================================
// AI NUTRITION COACH — RAG-enhanced nutrition chat
// =============================================

// ---- POST /ai/nutrition-coach/chat ----
app.post(`${PREFIX}/ai/nutrition-coach/chat`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const body = await c.req.json();
    const { message: userMessage, conversationId } = body;

    if (!userMessage || !userMessage.trim()) {
      return c.json({ message: "message is required", code: "BAD_REQUEST", status: 400 }, 400);
    }

    // Rate limiting
    const rateLimitKey = `become:rate:nutri_coach:${auth.userId}`;
    const rateData = await kv.get(rateLimitKey);
    const now = Date.now();
    if (rateData) {
      const windowStart = rateData.windowStart || 0;
      const count = rateData.count || 0;
      if (now - windowStart < COACH_RATE_WINDOW) {
        if (count >= COACH_RATE_LIMIT * 3) {
          const retryAfter = Math.ceil((COACH_RATE_WINDOW - (now - windowStart)) / 1000);
          return c.json({ message: `Too many requests. Try again in ${Math.ceil(retryAfter / 60)} min.`, code: "RATE_LIMITED", status: 429, retryAfterSeconds: retryAfter }, 429);
        }
        await kv.set(rateLimitKey, { windowStart, count: count + 1 });
      } else {
        await kv.set(rateLimitKey, { windowStart: now, count: 1 });
      }
    } else {
      await kv.set(rateLimitKey, { windowStart: now, count: 1 });
    }

    const user = await kv.get(`become:user:${auth.userId}`);
    const language = user?.language || "en";
    const firstName = user?.firstName || "";

    // ---- RAG: Gather all nutrition context ----
    let ragContext = "";

    // 1) User Profile
    try {
      const profile = await kv.get(`become:user_profile:${auth.telegramId}`);
      if (profile) {
        ragContext += `\n--- USER PROFILE ---`;
        ragContext += `\nGender: ${profile.gender || "unknown"}, Age: ${profile.age || "unknown"}, Height: ${profile.height || "unknown"} cm, Weight: ${profile.weight || "unknown"} kg`;
        ragContext += `\nActivity level: ${profile.activity_level || "unknown"}, Goal: ${profile.goal || "unknown"}`;
        ragContext += `\nDaily calorie target: ${profile.daily_calorie_target || "not set"} kcal, BMR: ${profile.bmr || "N/A"} kcal, Maintenance: ${profile.daily_maintenance_calories || "N/A"} kcal`;
      } else {
        ragContext += `\n--- USER PROFILE ---\nNo profile set up yet.`;
      }
    } catch (e) {
      console.log("[NutriCoach] Profile fetch error:", e);
    }

    // 2) Today's food entries + calorie balance
    try {
      const today = new Date().toISOString().slice(0, 10);
      const indexKey = `become:food_idx:${auth.userId}:${today}`;
      const foodIndex: string[] = (await kv.get(indexKey)) || [];

      if (foodIndex.length > 0) {
        const foodKeys = foodIndex.map((id: string) => `become:food:${auth.userId}:${id}`);
        const entries = (await kv.mget(foodKeys)).filter((e: any) => e && e.id);

        let totalCal = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0;
        const foodList: string[] = [];

        for (const e of entries) {
          totalCal += e.calories || 0;
          totalProtein += e.protein || 0;
          totalCarbs += e.carbs || 0;
          totalFat += e.fat || 0;
          foodList.push(`${e.food_name} (${e.calories}kcal, P${e.protein}g C${e.carbs}g F${e.fat}g) [${e.meal_type || "snack"}]`);
        }

        ragContext += `\n\n--- TODAY'S FOOD LOG (${today}) ---`;
        ragContext += `\nEntries:`;
        foodList.forEach((f, i) => { ragContext += `\n  ${i + 1}. ${f}`; });
        ragContext += `\nTotals: ${totalCal} kcal | P: ${totalProtein}g | C: ${totalCarbs}g | F: ${totalFat}g`;

        const profile = await kv.get(`become:user_profile:${auth.telegramId}`);
        const target = profile?.daily_calorie_target || 2000;
        const remaining = target - totalCal;
        ragContext += `\nTarget: ${target} kcal | Remaining: ${remaining} kcal | ${remaining > 0 ? "Under target" : "OVER by " + Math.abs(remaining) + " kcal"}`;
      } else {
        ragContext += `\n\n--- TODAY'S FOOD LOG ---\nNo food logged today.`;
      }
    } catch (e) {
      console.log("[NutriCoach] Food entries fetch error:", e);
    }

    // 3) Weekly food trends (last 7 days aggregate) — CACHED
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const trendsCacheKey = `become:cache:weekly_trends:${auth.userId}:${todayStr}`;
      let cachedTrends = await kv.get(trendsCacheKey);

      if (!cachedTrends) {
        // Compute fresh
        const weekDays: { date: string; cal: number; protein: number; carbs: number; fat: number; entries: number }[] = [];
        for (let d = 1; d <= 7; d++) {
          const dayDate = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
          const dayIdx: string[] = (await kv.get(`become:food_idx:${auth.userId}:${dayDate}`)) || [];
          if (dayIdx.length > 0) {
            const dayKeys = dayIdx.map((id: string) => `become:food:${auth.userId}:${id}`);
            const dayEntries = (await kv.mget(dayKeys)).filter((e: any) => e && e.id);
            let dC = 0, dP = 0, dCb = 0, dF = 0;
            for (const e of dayEntries) { dC += e.calories || 0; dP += e.protein || 0; dCb += e.carbs || 0; dF += e.fat || 0; }
            weekDays.push({ date: dayDate, cal: dC, protein: dP, carbs: dCb, fat: dF, entries: dayIdx.length });
          }
        }

        const profile = await kv.get(`become:user_profile:${auth.telegramId}`);
        const target = profile?.daily_calorie_target || 2000;

        cachedTrends = { weekDays, target, cachedAt: Date.now() };
        // Cache for current day (auto-invalidated by date key changing tomorrow)
        await kv.set(trendsCacheKey, cachedTrends);
        console.log(`[NutriCoach] Weekly trends computed & cached for ${auth.userId}, ${cachedTrends.weekDays.length} days`);
      } else {
        console.log(`[NutriCoach] Weekly trends cache HIT for ${auth.userId}`);
      }

      const { weekDays, target } = cachedTrends;

      if (weekDays.length > 0) {
        const totalDays = weekDays.length;
        const avgCal = Math.round(weekDays.reduce((s: number, d: any) => s + d.cal, 0) / totalDays);
        const avgProtein = Math.round(weekDays.reduce((s: number, d: any) => s + d.protein, 0) / totalDays);
        const avgCarbs = Math.round(weekDays.reduce((s: number, d: any) => s + d.carbs, 0) / totalDays);
        const avgFat = Math.round(weekDays.reduce((s: number, d: any) => s + d.fat, 0) / totalDays);
        const totalEntries = weekDays.reduce((s: number, d: any) => s + d.entries, 0);
        const highDay = weekDays.reduce((max: any, d: any) => d.cal > max.cal ? d : max);
        const lowDay = weekDays.reduce((min: any, d: any) => d.cal < min.cal ? d : min);

        ragContext += `\n\n--- WEEKLY FOOD TRENDS (last 7 days, cached) ---`;
        ragContext += `\nDays with data: ${totalDays}/7, Total entries: ${totalEntries}`;
        ragContext += `\nAvg daily: ${avgCal} kcal | P${avgProtein}g C${avgCarbs}g F${avgFat}g`;
        ragContext += `\nHighest day: ${highDay.date} (${highDay.cal} kcal) | Lowest: ${lowDay.date} (${lowDay.cal} kcal)`;

        const deficit = target - avgCal;
        ragContext += `\nAvg vs target (${target}): ${deficit > 0 ? "deficit " + deficit : "surplus +" + Math.abs(deficit)} kcal/day`;

        ragContext += `\nDaily breakdown:`;
        for (const d of weekDays) {
          ragContext += `\n  ${d.date}: ${d.cal}kcal P${d.protein}g C${d.carbs}g F${d.fat}g (${d.entries} entries)`;
        }
      } else {
        ragContext += `\n\n--- WEEKLY FOOD TRENDS ---\nNo food data in the last 7 days.`;
      }
    } catch (e) {
      console.log("[NutriCoach] Weekly trends error:", e);
    }

    // 4) Active meal plan
    try {
      const plansIndex: string[] = (await kv.get(`become:mealplans:${auth.userId}`)) || [];
      if (plansIndex.length > 0) {
        const latestPlan = await kv.get(`become:mealplan:${auth.userId}:${plansIndex[0]}`);
        if (latestPlan?.plan_data?.days) {
          ragContext += `\n\n--- ACTIVE MEAL PLAN ---`;
          ragContext += `\nLength: ${latestPlan.plan_length} days, created: ${latestPlan.created_at?.slice(0, 10) || "?"}`;
          const createdDate = new Date(latestPlan.created_at);
          const dayNum = Math.floor((Date.now() - createdDate.getTime()) / 86400000) + 1;
          const todayPlanDay = latestPlan.plan_data.days.find((d: any) => d.day === dayNum);
          if (todayPlanDay?.meals) {
            ragContext += `\nToday (day ${dayNum}) meals:`;
            for (const meal of todayPlanDay.meals) {
              const items = meal.items?.map((it: any) => `${it.food_name}(${it.calories}kcal)`).join(", ") || "none";
              ragContext += `\n  ${meal.meal_type}: ${items}`;
            }
          } else {
            ragContext += `\nDay ${dayNum}${dayNum > latestPlan.plan_length ? " (plan ended)" : " — no meals data"}`;
          }
        }
      }
    } catch (e) {}

    // 5) Active workout plan
    try {
      const workoutIndex: string[] = (await kv.get(`become:workout_plans_index:${auth.userId}`)) || [];
      if (workoutIndex.length > 0) {
        const latestWorkout = await kv.get(`become:workout_plans:${auth.userId}:${workoutIndex[0]}`);
        if (latestWorkout?.workout_data?.days) {
          ragContext += `\n\n--- ACTIVE WORKOUT PLAN ---`;
          ragContext += `\nType: ${latestWorkout.workout_type || "mixed"}, Length: ${latestWorkout.plan_length} days, created: ${latestWorkout.created_at?.slice(0, 10) || "?"}`;
          const createdDate = new Date(latestWorkout.created_at);
          const dayNum = Math.floor((Date.now() - createdDate.getTime()) / 86400000) + 1;
          const todayWorkoutDay = latestWorkout.workout_data.days.find((d: any) => d.day === dayNum);
          if (todayWorkoutDay) {
            ragContext += `\nToday (day ${dayNum}): ${todayWorkoutDay.workout_type || "workout"}`;
            if (todayWorkoutDay.workout_type === "rest") {
              ragContext += ` — REST DAY`;
            } else if (todayWorkoutDay.exercises?.length > 0) {
              ragContext += `, ${todayWorkoutDay.exercises.length} exercises`;
              const exList = todayWorkoutDay.exercises.slice(0, 6).map((ex: any) =>
                `${ex.name} (${ex.sets}x${ex.reps}${ex.duration ? ", " + ex.duration : ""})`
              ).join(", ");
              ragContext += `\n  Exercises: ${exList}`;
              if (todayWorkoutDay.exercises.length > 6) {
                ragContext += ` +${todayWorkoutDay.exercises.length - 6} more`;
              }
            }
          } else {
            ragContext += `\nDay ${dayNum}${dayNum > latestWorkout.plan_length ? " (plan ended)" : " — no workout data"}`;
          }

          // Weekly workout schedule summary
          const weekStart = Math.max(1, dayNum - (dayNum - 1) % 7);
          const weekEnd = Math.min(weekStart + 6, latestWorkout.plan_length);
          const weekDays = latestWorkout.workout_data.days.filter((d: any) => d.day >= weekStart && d.day <= weekEnd);
          if (weekDays.length > 0) {
            const restDays = weekDays.filter((d: any) => d.workout_type === "rest").length;
            const activeDays = weekDays.length - restDays;
            const workoutTypes = weekDays.filter((d: any) => d.workout_type !== "rest").map((d: any) => d.workout_type).join(", ");
            ragContext += `\nThis week (days ${weekStart}-${weekEnd}): ${activeDays} workout days, ${restDays} rest days`;
            ragContext += `\nWorkout types: ${workoutTypes || "varied"}`;
          }
        }
      }
    } catch (e) {
      console.log("[NutriCoach] Workout plan context error:", e);
    }

    // 6) Weight tracking history
    try {
      const weightIndexKey = `become:weight_idx:${auth.userId}`;
      const weightIndex: Array<{ date: string; entryId: string }> = (await kv.get(weightIndexKey)) || [];

      if (weightIndex.length > 0) {
        // Load last 30 entries for trend analysis
        const recentEntries = weightIndex.slice(0, 30);
        const weightKeys = recentEntries.map((d: any) => `become:weight:${auth.userId}:${d.entryId}`);
        const weights = (await kv.mget(weightKeys)).filter((e: any) => e && e.weight);

        if (weights.length > 0) {
          ragContext += `\n\n--- WEIGHT TRACKING HISTORY ---`;
          ragContext += `\nTotal entries: ${weightIndex.length}`;
          ragContext += `\nLatest weight: ${weights[0].weight} kg (${weights[0].date})`;

          if (weights.length >= 2) {
            const latest = weights[0].weight;
            const oldest = weights[weights.length - 1].weight;
            const change = (latest - oldest).toFixed(1);
            const daySpan = Math.round((new Date(weights[0].date).getTime() - new Date(weights[weights.length - 1].date).getTime()) / 86400000);
            ragContext += `\nOldest in window: ${oldest} kg (${weights[weights.length - 1].date})`;
            ragContext += `\nChange over ${daySpan} days: ${Number(change) > 0 ? "+" : ""}${change} kg`;

            // Weekly average if enough data
            if (weights.length >= 7) {
              const last7 = weights.slice(0, 7);
              const avg7 = (last7.reduce((s: number, w: any) => s + w.weight, 0) / last7.length).toFixed(1);
              ragContext += `\nLast 7 entries avg: ${avg7} kg`;
            }

            // Trend direction
            if (weights.length >= 3) {
              const recent3 = weights.slice(0, 3).map((w: any) => w.weight);
              const isDecreasing = recent3[0] < recent3[1] && recent3[1] < recent3[2];
              const isIncreasing = recent3[0] > recent3[1] && recent3[1] > recent3[2];
              const isFlat = Math.abs(recent3[0] - recent3[2]) < 0.3;
              ragContext += `\nRecent trend: ${isDecreasing ? "decreasing (good for weight loss)" : isIncreasing ? "increasing" : isFlat ? "stable/flat" : "fluctuating"}`;
            }

            // Rate of change per week
            if (daySpan >= 7) {
              const weeklyRate = ((Number(change)) / daySpan * 7).toFixed(2);
              ragContext += `\nWeekly rate: ${Number(weeklyRate) > 0 ? "+" : ""}${weeklyRate} kg/week`;
              if (Math.abs(Number(weeklyRate)) > 1.0) {
                ragContext += ` (${Number(weeklyRate) < 0 ? "rapid loss — may be too aggressive" : "rapid gain"})`;
              }
            }

            // Last 10 data points for detail
            ragContext += `\nRecent entries:`;
            const show = weights.slice(0, 10);
            for (const w of show) {
              ragContext += `\n  ${w.date}: ${w.weight} kg${w.note ? " (" + w.note + ")" : ""}`;
            }
          }
        }
      } else {
        ragContext += `\n\n--- WEIGHT TRACKING ---\nNo weight entries logged yet.`;
      }
    } catch (e) {
      console.log("[NutriCoach] Weight history error:", e);
    }

    // ---- Build conversation ----
    const convId = conversationId || generateId("nconv");
    const convKey = `become:nutri_conv:${auth.userId}:${convId}`;
    const existing = await kv.get(convKey);
    const messages: Array<{ role: string; content: string; ts: string }> = existing?.messages || [];
    messages.push({ role: "user", content: userMessage.trim(), ts: new Date().toISOString() });

    const langInstruction = language === "en" ? "Respond in English." : `Respond in the language with code "${language}". All output must be in that language.`;

    const systemPrompt = `You are a professional AI Nutrition & Fitness Coach inside the Proper Food AI app. You provide evidence-based, personalized nutrition and fitness advice.

RULES:
- ${langInstruction}
- User's name: "${firstName}".
- You have access to the user's REAL data below. Always reference it in answers.
- Keep responses 3-8 sentences, focused, actionable.
- Give specific food recommendations with approximate calories when relevant.
- When asked "what should I eat", check what they already ate today, remaining calorie budget, and their meal plan.
- For weight loss questions, reference BMR, maintenance calories, and current deficit/surplus.
- If no food logged today, encourage using the food scanner.
- If they have a meal plan, reference it and suggest following it.
- Use WEEKLY FOOD TRENDS to identify patterns: are they consistently hitting their target? Any macro imbalances over the week?
- If they have a workout plan, factor in today's workout when recommending food (more carbs before cardio, more protein on strength days).
- On rest days from workouts, suggest slightly lower calorie intake if the goal is weight loss.
- Use WEIGHT TRACKING HISTORY to analyze long-term progress: reference trend direction, rate of change, and whether the pace is healthy (0.5-1kg/week loss is ideal).
- If weight is stalling despite calorie deficit, suggest diet breaks, refeed days, or adjusting targets.
- Correlate weight trends with food intake trends to give holistic advice.
- If no weight data, encourage the user to log their weight regularly for better tracking.
- Use established nutrition science (protein ~1.6-2.2g/kg for active, balanced macros).
- Never recommend extreme diets, fasting for minors, or promote eating disorders.
- Be encouraging but honest about progress.
- If missing data (no profile, no food log), tell the user to set it up.

${ragContext}`;

    const historyForAi = messages.slice(-30).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    let assistantMessage = "";

    if (!apiKey) {
      assistantMessage = language === "ru"
        ? "AI сервис временно недоступен. Попробуй позже."
        : "AI service is temporarily unavailable. Try again later.";
    } else {
      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: systemPrompt }, ...historyForAi],
          temperature: 0.7,
          max_tokens: 700,
        }),
      });

      if (!openaiRes.ok) {
        const errText = await openaiRes.text();
        console.log(`[NutriCoach] OpenAI error ${openaiRes.status}: ${errText}`);
        return c.json({ message: `AI error: ${openaiRes.status}`, code: "AI_ERROR", status: 502 }, 502);
      }

      const data = await openaiRes.json();
      assistantMessage = data.choices?.[0]?.message?.content || "";
    }

    if (!assistantMessage) {
      return c.json({ message: "AI returned empty response", code: "AI_EMPTY", status: 502 }, 502);
    }

    messages.push({ role: "assistant", content: assistantMessage, ts: new Date().toISOString() });

    await kv.set(convKey, {
      id: convId,
      userId: auth.userId,
      messages: messages.slice(-80),
      updatedAt: new Date().toISOString(),
      createdAt: existing?.createdAt || new Date().toISOString(),
    });

    console.log(`[NutriCoach] User ${auth.userId}, conv ${convId}, msgs: ${messages.length}, ragLen: ${ragContext.length}`);
    return c.json({ conversationId: convId, response: assistantMessage, messageCount: messages.length });
  } catch (err) {
    console.log("POST /ai/nutrition-coach/chat error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /ai/nutrition-coach/chat/:conversationId ----
app.get(`${PREFIX}/ai/nutrition-coach/chat/:conversationId`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    const convId = c.req.param("conversationId");
    const conv = await kv.get(`become:nutri_conv:${auth.userId}:${convId}`);
    if (!conv) return c.json({ message: "Conversation not found", code: "NOT_FOUND", status: 404 }, 404);
    return c.json(conv);
  } catch (err) {
    console.log("GET /ai/nutrition-coach/chat/:id error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /ai/nutrition-coach/conversations ----
app.get(`${PREFIX}/ai/nutrition-coach/conversations`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    const convs = await kv.getByPrefix(`become:nutri_conv:${auth.userId}:`);
    const sorted = convs
      .filter((conv: any) => conv && conv.id && conv.messages?.length > 0)
      .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map((conv: any) => ({
        id: conv.id,
        messageCount: conv.messages.length,
        lastMessage: conv.messages[conv.messages.length - 1]?.content?.slice(0, 100) || "",
        lastRole: conv.messages[conv.messages.length - 1]?.role || "",
        updatedAt: conv.updatedAt,
        createdAt: conv.createdAt,
      }));
    return c.json({ conversations: sorted });
  } catch (err) {
    console.log("GET /ai/nutrition-coach/conversations error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- DELETE /ai/nutrition-coach/chat/:conversationId ----
app.delete(`${PREFIX}/ai/nutrition-coach/chat/:conversationId`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);
    const convId = c.req.param("conversationId");
    await kv.del(`become:nutri_conv:${auth.userId}:${convId}`);
    return c.json({ success: true });
  } catch (err) {
    console.log("DELETE /ai/nutrition-coach/chat/:id error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- GET /streak/nutrition ----
// Calculate consecutive days with food entries (nutrition tracking streak)
app.get(`${PREFIX}/streak/nutrition`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const today = new Date();
    let streak = 0;
    const maxLookback = 365;

    for (let i = 0; i < maxLookback; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const indexKey = `become:food_idx:${auth.userId}:${dateStr}`;
      const index: string[] = (await kv.get(indexKey)) || [];
      if (index.length > 0) {
        streak++;
      } else {
        // If today has no entries yet, skip and check from yesterday
        if (i === 0) continue;
        break;
      }
    }

    // Determine pending milestone (highest unshown among 7, 30, 100)
    const milestones = [100, 30, 7];
    let pendingMilestone: number | null = null;
    for (const m of milestones) {
      if (streak >= m) {
        const shownKey = `become:streak_milestone_shown:${auth.userId}:${m}`;
        const shown = await kv.get(shownKey);
        if (!shown) {
          pendingMilestone = m;
          break;
        }
      }
    }

    console.log(`[Streak] user=${auth.userId} streak=${streak} pendingMilestone=${pendingMilestone}`);
    return c.json({ streak, pending_milestone: pendingMilestone });
  } catch (err) {
    console.log("GET /streak/nutrition error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

// ---- POST /streak/milestone-shown ----
// Mark a milestone as shown so we don't show the share card again
app.post(`${PREFIX}/streak/milestone-shown`, async (c) => {
  try {
    const auth = await resolveUser(c);
    if (!auth) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 }, 401);

    const { milestone } = await c.req.json();
    if (![7, 30, 100].includes(milestone)) {
      return c.json({ message: "Invalid milestone", code: "BAD_REQUEST", status: 400 }, 400);
    }

    const shownKey = `become:streak_milestone_shown:${auth.userId}:${milestone}`;
    await kv.set(shownKey, { shown_at: new Date().toISOString() });

    console.log(`[Streak] Milestone ${milestone} marked as shown for user=${auth.userId}`);
    return c.json({ success: true });
  } catch (err) {
    console.log("POST /streak/milestone-shown error:", err);
    return c.json({ message: `Error: ${err}`, code: "INTERNAL_ERROR", status: 500 }, 500);
  }
});

Deno.serve(app.fetch);