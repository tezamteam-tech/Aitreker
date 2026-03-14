// =============================================
// Proper Food AI — Telegram Bot API Helper
// =============================================
// Wrapper around Telegram Bot API for sending
// messages, inline keyboards, callback answers,
// and webhook management. Supports i18n (en/ru).
// =============================================

import { t, detectLang, type Lang } from "./i18n.tsx";

const BOT_API = "https://api.telegram.org/bot";
const BOT_FILE_API = "https://api.telegram.org/file/bot";

function getBotToken(): string {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN_PROPER") || Deno.env.get("TELEGRAM_BOT_TOKEN_BECOME");
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN_PROPER not set");
  }
  return token;
}

function getMiniAppUrl(): string {
  return Deno.env.get("PROPERFOOD_MINIAPP_URL") || Deno.env.get("BECOME_MINIAPP_URL") || "";
}

// ---- Low-level API call ----

async function botApi(method: string, body: Record<string, unknown>): Promise<any> {
  const token = getBotToken();
  const url = `${BOT_API}${token}/${method}`;

  console.log(`[TG Bot] API call: ${method}`);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!data.ok) {
    console.log(`[TG Bot] API error in ${method}:`, JSON.stringify(data));
    throw new Error(`Telegram API error: ${data.description || "Unknown"}`);
  }

  return data.result;
}

// ---- Inline Keyboard Types ----

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
  web_app?: { url: string };
  switch_inline_query_current_chat?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface ReplyKeyboardButton {
  text: string;
  request_contact?: boolean;
  web_app?: { url: string };
}

export interface ReplyKeyboardMarkup {
  keyboard: ReplyKeyboardButton[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
  is_persistent?: boolean;
  input_field_placeholder?: string;
}

export interface ReplyKeyboardRemove {
  remove_keyboard: true;
  selective?: boolean;
}

// ---- Telegram Update Types ----

export interface TgUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TgContact {
  phone_number: string;
  first_name: string;
  last_name?: string;
  user_id?: number;
  vcard?: string;
}

export interface TgSuccessfulPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  provider_payment_charge_id: string;
}

export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  date: number;
  text?: string;
  contact?: TgContact;
  successful_payment?: TgSuccessfulPayment;
  entities?: Array<{
    type: string;
    offset: number;
    length: number;
  }>;
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  chat_instance: string;
  data?: string;
}

export interface TgPreCheckoutQuery {
  id: string;
  from: TgUser;
  currency: string;
  total_amount: number;
  invoice_payload: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
  pre_checkout_query?: TgPreCheckoutQuery;
}

// ---- High-level methods ----

/**
 * Send a text message with optional inline keyboard or reply keyboard
 */
export async function sendMessage(
  chatId: number,
  text: string,
  options?: {
    reply_markup?: InlineKeyboardMarkup | ReplyKeyboardMarkup | ReplyKeyboardRemove;
    parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
    disable_web_page_preview?: boolean;
  }
): Promise<any> {
  return botApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: options?.parse_mode || "HTML",
    disable_web_page_preview: options?.disable_web_page_preview ?? true,
    ...(options?.reply_markup ? { reply_markup: options.reply_markup } : {}),
  });
}

/**
 * Edit an existing message's text and keyboard
 */
export async function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
  options?: {
    reply_markup?: InlineKeyboardMarkup;
    parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
  }
): Promise<any> {
  return botApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: options?.parse_mode || "HTML",
    ...(options?.reply_markup ? { reply_markup: options.reply_markup } : {}),
  });
}

/**
 * Answer a callback query (removes "loading" spinner on button)
 */
export async function answerCallbackQuery(
  callbackQueryId: string,
  options?: {
    text?: string;
    show_alert?: boolean;
  }
): Promise<any> {
  return botApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: options?.text,
    show_alert: options?.show_alert ?? false,
  });
}

/**
 * Send a photo message
 */
export async function sendPhoto(
  chatId: number,
  photoUrl: string,
  caption?: string,
  options?: {
    reply_markup?: InlineKeyboardMarkup;
    parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
  }
): Promise<any> {
  return botApi("sendPhoto", {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: options?.parse_mode || "HTML",
    ...(options?.reply_markup ? { reply_markup: options.reply_markup } : {}),
  });
}

/**
 * Send a chat action (typing, upload_photo, etc.)
 */
export async function sendChatAction(
  chatId: number,
  action: "typing" | "upload_photo" | "upload_document" = "typing"
): Promise<any> {
  return botApi("sendChatAction", {
    chat_id: chatId,
    action,
  });
}

// ---- User Profile Photos ----

/**
 * Get a user's profile photos
 */
export async function getUserProfilePhotos(userId: number, limit = 1): Promise<any> {
  return botApi("getUserProfilePhotos", {
    user_id: userId,
    limit,
  });
}

/**
 * Get file info by file_id — returns file_path for download
 */
export async function getFile(fileId: string): Promise<any> {
  return botApi("getFile", { file_id: fileId });
}

/**
 * Fetch the user's avatar URL (permanent download link).
 * Returns null if user has no profile photo.
 */
export async function fetchUserAvatarUrl(userId: number): Promise<string | null> {
  try {
    const photos = await getUserProfilePhotos(userId, 1);
    if (!photos || !photos.photos || photos.photos.length === 0) {
      console.log(`[TG Bot] User ${userId} has no profile photos`);
      return null;
    }

    // photos.photos[0] is an array of PhotoSize for the first photo
    // Pick the largest available (last element)
    const photoSizes = photos.photos[0];
    const largest = photoSizes[photoSizes.length - 1]; // biggest resolution
    if (!largest?.file_id) return null;

    const fileInfo = await getFile(largest.file_id);
    if (!fileInfo?.file_path) return null;

    const token = Deno.env.get("TELEGRAM_BOT_TOKEN_PROPER") || Deno.env.get("TELEGRAM_BOT_TOKEN_BECOME") || "";
    const avatarUrl = `${BOT_FILE_API}${token}/${fileInfo.file_path}`;
    console.log(`[TG Bot] Fetched avatar for user ${userId}: ${fileInfo.file_path}`);
    return avatarUrl;
  } catch (err) {
    console.log(`[TG Bot] Error fetching avatar for user ${userId}:`, err);
    return null;
  }
}

/**
 * Set the bot's chat menu button to open the Mini App
 */
export async function setChatMenuButton(webAppUrl?: string): Promise<any> {
  const url = webAppUrl || getMiniAppUrl();
  if (!url) {
    console.log("[TG Bot] No MINIAPP_URL set, skipping menu button");
    return null;
  }

  return botApi("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "Open Proper Food AI",
      web_app: { url },
    },
  });
}

/**
 * Set the webhook URL for receiving updates
 */
export async function setWebhook(webhookUrl: string): Promise<any> {
  console.log(`[TG Bot] Setting webhook to: ${webhookUrl}`);
  return botApi("setWebhook", {
    url: webhookUrl,
    allowed_updates: ["message", "callback_query", "pre_checkout_query"],
    drop_pending_updates: true,
  });
}

/**
 * Delete the webhook
 */
export async function deleteWebhook(): Promise<any> {
  return botApi("deleteWebhook", { drop_pending_updates: true });
}

/**
 * Get current webhook info
 */
export async function getWebhookInfo(): Promise<any> {
  const token = getBotToken();
  const res = await fetch(`${BOT_API}${token}/getWebhookInfo`);
  const data = await res.json();
  return data.result;
}

/**
 * Set bot commands visible in the Telegram menu (with i18n)
 */
export async function setMyCommands(): Promise<any> {
  // Set English commands as default
  await botApi("setMyCommands", {
    commands: [
      { command: "start", description: "Start Proper Food AI & open the app" },
      { command: "progress", description: "View your current progress" },
      { command: "today", description: "See today's tasks" },
      { command: "coach", description: "Get AI coaching advice" },
      { command: "challenge", description: "View your challenges" },
      { command: "payment", description: "Subscribe or top up balance" },
      { command: "help", description: "How to use Proper Food AI" },
      { command: "settings", description: "Change language & tone" },
      { command: "paysupport", description: "Payment support & disputes" },
    ],
  });

  // Set Russian commands for ru language
  await botApi("setMyCommands", {
    commands: [
      { command: "start", description: "Запустить Proper Food AI" },
      { command: "progress", description: "Посмотреть прогресс" },
      { command: "today", description: "Задания на сегодня" },
      { command: "coach", description: "AI-коучинг" },
      { command: "challenge", description: "Челленджи" },
      { command: "payment", description: "Подписка или пополнение баланса" },
      { command: "help", description: "Как пользоваться Proper Food AI" },
      { command: "settings", description: "Язык и тон коучинга" },
      { command: "paysupport", description: "Поддержка по оплате" },
    ],
    language_code: "ru",
  });

  return true;
}

// ---- Message Builders ----

/**
 * Build the welcome message for NEW users.
 * Creates account from TG data — no contact sharing needed.
 * Shows a single "Open Proper Food" inline button (blue web_app).
 */
export function buildNewUserWelcomeMessage(user: TgUser, appUrl?: string): {
  text: string;
  reply_markup: InlineKeyboardMarkup;
} {
  const lang = detectLang(user.language_code);
  const name = user.first_name || "there";

  const text = [
    `👋 <b>${t("welcome_title", lang, { name })}</b>`,
    ``,
    t("welcome_subtitle", lang),
    t("welcome_desc", lang),
    ``,
    `<b>${t("welcome_how", lang)}</b>`,
    t("welcome_step1", lang),
    t("welcome_step2", lang),
    t("welcome_step3", lang),
    t("welcome_step4", lang),
    ``,
    lang === "ru"
      ? "👇 Всё готово — нажми кнопку и открой приложение!"
      : "👇 You're all set — tap the button to open the app!",
  ].join("\n");

  const keyboard: InlineKeyboardButton[][] = [];
  if (appUrl) {
    keyboard.push([{ text: t("btn_open_app", lang), web_app: { url: appUrl } }]);
  }

  return { text, reply_markup: { inline_keyboard: keyboard } };
}

/**
 * Build the welcome-back message for returning users (already registered).
 * appUrl: optional override for Mini App URL (e.g., with bot_auth token) — used by cmd_menu.
 * skipOpenButton: if true, omit the inline web_app "Open" button (reply keyboard handles it).
 */
export function buildReturningStartMessage(user: TgUser, deepLinkParam?: string, appUrl?: string, skipOpenButton?: boolean): {
  text: string;
  reply_markup: InlineKeyboardMarkup;
} {
  const lang = detectLang(user.language_code);
  const name = user.first_name || "there";
  const miniAppUrl = appUrl || getMiniAppUrl();

  const text = skipOpenButton
    ? [
        `\u{1F44B} <b>${t("welcome_returning", lang, { name })}</b>`,
        ``,
        lang === "ru"
          ? "\u{1F4F1} Нажми кнопку <b>«Открыть Proper Food»</b> на клавиатуре внизу \u{1F447} или кнопку <b>Меню</b> (\u2630) слева от поля ввода."
          : "\u{1F4F1} Tap <b>«Open Proper Food»</b> on the keyboard below \u{1F447} or the <b>Menu</b> button (\u2630) next to the text field.",
      ].join("\n")
    : [
        `\u{1F44B} <b>${t("welcome_returning", lang, { name })}</b>`,
        ``,
        lang === "ru"
          ? "\u{1F4F1} Нажми кнопку <b>Меню</b> (\u2630) слева от поля ввода."
          : "\u{1F4F1} Tap the <b>Menu</b> button (\u2630) next to the text field to launch the app.",
      ].join("\n");

  const keyboard: InlineKeyboardButton[][] = [];

  // Row 1: Open Mini App — only if not skipped (used by cmd_menu, cmd_sync etc.)
  // Re-enabled: Vercel deployment supports web_app buttons (Figma Sites limitation removed)
  if (!skipOpenButton && miniAppUrl) {
    const finalUrl = !appUrl && deepLinkParam
      ? `${miniAppUrl}?startapp=${deepLinkParam}`
      : miniAppUrl;
    keyboard.push([{ text: t("btn_open_app", lang), web_app: { url: finalUrl } }]);
  }

  // Row 2: Sync Data
  keyboard.push([
    { text: t("btn_sync_data", lang), callback_data: "cmd_sync" },
  ]);

  return {
    text,
    reply_markup: { inline_keyboard: keyboard },
  };
}

/**
 * Build the contact-received success message.
 * Clean inline keyboard: Open App (primary) + Sync Data.
 * Reply keyboard: ONLY "Open Proper Food AI" — NO contact sharing.
 * appUrl: optional override for Mini App URL (e.g., with bot_auth token)
 */
export function buildContactSuccessMessage(user: TgUser, appUrl?: string): {
  text: string;
  inline_markup: InlineKeyboardMarkup;
  reply_markup: ReplyKeyboardMarkup;
} {
  const lang = detectLang(user.language_code);
  const name = user.first_name || "there";
  const miniAppUrl = appUrl || getMiniAppUrl();

  const text = [
    `\u{2705} <b>${t("contact_success_title", lang, { name })}</b>`,
    ``,
    t("contact_success_body", lang),
    ``,
    `<b>${t("contact_features", lang)}</b>`,
    `\u{1F4CB} ${t("contact_f1", lang)}`,
    `\u{1F916} ${t("contact_f2", lang)}`,
    `\u{1F3C6} ${t("contact_f3", lang)}`,
    `\u{1F514} ${t("contact_f4", lang)}`,
  ].join("\n");

  // Inline keyboard: Open App + Sync Data
  const inline_keyboard: InlineKeyboardButton[][] = [];
  if (miniAppUrl) {
    inline_keyboard.push([
      { text: t("btn_open_app", lang), web_app: { url: miniAppUrl } },
    ]);
  }
  inline_keyboard.push([
    { text: t("btn_sync_data", lang), callback_data: "cmd_sync" },
  ]);

  // Persistent reply keyboard — ONLY "Open Proper Food AI" button, NO contact sharing
  // This is intentional: contact sharing is a legacy flow, the app creates accounts
  // automatically from Telegram initData, so contact sharing is unnecessary.
  const replyKb: ReplyKeyboardButton[][] = [];
  if (miniAppUrl) {
    replyKb.push([{ text: t("btn_open_app", lang), web_app: { url: miniAppUrl } }]);
  }

  return {
    text,
    inline_markup: { inline_keyboard },
    reply_markup: {
      keyboard: replyKb,
      resize_keyboard: true,
      is_persistent: true,
      input_field_placeholder: lang === "ru"
        ? "Нажми кнопку «Открыть Proper Food» ⬆️"
        : "Tap «Open Proper Food» above ⬆️",
    },
  };
}

// Legacy compatibility aliases
export function buildWelcomeMessage(user: TgUser, deepLinkParam?: string): {
  text: string;
  reply_markup: InlineKeyboardMarkup;
} {
  return buildReturningStartMessage(user, deepLinkParam);
}

/**
 * Build the reply keyboard (persistent at bottom of chat) for authenticated users.
 * Contains only the "Open Proper Food" button — no contact sharing.
 */
export function buildReplyKeyboard(lang: Lang = "en", appUrl?: string): ReplyKeyboardMarkup {
  const miniAppUrl = appUrl || getMiniAppUrl();
  const keyboard: ReplyKeyboardButton[][] = [];

  if (miniAppUrl) {
    // Single row: "Open Proper Food" web_app button
    keyboard.push([
      { text: t("btn_open_app", lang), web_app: { url: miniAppUrl } },
    ]);
  }

  return {
    keyboard,
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: lang === "ru"
      ? "Нажми «Открыть Proper Food» ⬆️"
      : "Tap «Open Proper Food» above ⬆️",
  };
}

/**
 * Build help message (i18n)
 */
export function buildHelpMessage(lang: Lang = "en"): { text: string; reply_markup: InlineKeyboardMarkup } {
  const miniAppUrl = getMiniAppUrl();

  const text = lang === "ru" ? [
    `<b>\u{2753} Помощь Proper Food AI</b>`,
    ``,
    `<b>\u041A\u043E\u043C\u0430\u043D\u0434\u044B:</b>`,
    `/start - \u041F\u0440\u0438\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u0435 \u0438 \u0433\u043B\u0430\u0432\u043D\u043E\u0435 \u043C\u0435\u043D\u044E`,
    `/progress - \u0422\u0432\u043E\u0439 \u0441\u0442\u0440\u0438\u043A, XP, \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D\u043D\u044B\u0435 \u0434\u043D\u0438`,
    `/today - \u0417\u0430\u0434\u0430\u043D\u0438\u044F \u043D\u0430 \u0441\u0435\u0433\u043E\u0434\u043D\u044F`,
    `/coach - AI-\u043A\u043E\u0443\u0447\u0438\u043D\u0433`,
    `/challenge - \u0422\u0432\u043E\u0438 \u0447\u0435\u043B\u043B\u0435\u043D\u0434\u0436\u0438`,
    `/payment - \u041E\u043F\u043B\u0430\u0442\u0430 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0438 \u0438 \u043F\u043E\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435`,
    `/settings - \u042F\u0437\u044B\u043A \u0438 \u0442\u043E\u043D \u043A\u043E\u0443\u0447\u0430`,
    `/paysupport - \u041F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0430 \u043F\u043E \u043E\u043F\u043B\u0430\u0442\u044B`,
    `/help - \u042D\u0442\u0430 \u043F\u043E\u043C\u043E\u0449\u044C`,
    ``,
    `<b>\u0422\u0438\u043F\u044B \u0447\u0435\u043B\u043B\u0435\u043D\u0434\u0436\u0435\u0439:</b>`,
    `\u2022 <b>\u0421\u043E\u043B\u043E</b> - \u041B\u0438\u0447\u043D\u043E\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u043E`,
    `\u2022 <b>\u041A\u043E\u043D\u0442\u0440\u0430\u043A\u0442</b> - \u0421\u0442\u0430\u0432\u043A\u0430 \u043D\u0430 \u0441\u0435\u0431\u044F`,
    `\u2022 <b>\u041E\u0431\u0449\u0438\u0439 \u043F\u0443\u0442\u044C</b> - \u041A\u043E\u043C\u0430\u043D\u0434\u043D\u0430\u044F \u0440\u0430\u0431\u043E\u0442\u0430`,
    ``,
    `<b>\u0421\u043E\u0432\u0435\u0442\u044B:</b>`,
    `\u2022 \u0412\u044B\u043F\u043E\u043B\u043D\u044F\u0439 \u0437\u0430\u0434\u0430\u043D\u0438\u044F \u0435\u0436\u0435\u0434\u043D\u0435\u0432\u043D\u043E \u0434\u043B\u044F \u0441\u0442\u0440\u0438\u043A\u0430`,
    `\u2022 \u041F\u0438\u0448\u0438 \u0440\u0435\u0444\u043B\u0435\u043A\u0441\u0438\u0438 \u0434\u043B\u044F \u0433\u043B\u0443\u0431\u0438\u043D\u044B`,
    `\u2022 \u0421\u043F\u0440\u0430\u0448\u0438\u0432\u0430\u0439 AI-\u043A\u043E\u0443\u0447\u0430 \u043F\u043E\u0441\u043B\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u044F \u0434\u043D\u044F`,
    `\u2022 \u0414\u0435\u043B\u0438\u0441\u044C \u0447\u0435\u043B\u043B\u0435\u043D\u0434\u0436\u0430\u043C\u0438 \u0441 \u0434\u0440\u0443\u0437\u044C\u044F\u043C\u0438`,
  ].join("\n") : [
    `<b>\u{2753} Proper Food AI Help</b>`,
    ``,
    `<b>Commands:</b>`,
    `/start - Welcome screen & main menu`,
    `/progress - Your streak, XP, completed days`,
    `/today - See what's on your list today`,
    `/coach - Get AI coaching advice`,
    `/challenge - View active challenges`,
    `/payment - Subscribe or top up balance`,
    `/settings - Change language & coaching tone`,
    `/paysupport - Payment support & disputes`,
    `/help - This help message`,
    ``,
    `<b>How challenges work:</b>`,
    `\u2022 <b>Solo</b> - Free personal commitment`,
    `\u2022 <b>Commitment Contract</b> - Stake a deposit`,
    `\u2022 <b>Shared Path</b> - Team up with others`,
    ``,
    `<b>Tips:</b>`,
    `\u2022 Complete tasks daily to build your streak`,
    `\u2022 Write reflections for deeper insights`,
    `\u2022 Ask the AI Coach after completing a day`,
    `\u2022 Share challenges with friends via link`,
  ].join("\n");

  const keyboard: InlineKeyboardButton[][] = [];
  // Re-enabled: Vercel deployment supports web_app buttons (Figma Sites limitation removed)
  if (miniAppUrl) {
    keyboard.push([{ text: t("btn_open_app", lang), web_app: { url: miniAppUrl } }]);
  }
  keyboard.push([{ text: t("btn_menu", lang), callback_data: "cmd_menu" }]);

  return { text, reply_markup: { inline_keyboard: keyboard } };
}

/**
 * Build settings message (i18n)
 */
export function buildSettingsMessage(
  language: string,
  tone: string
): { text: string; reply_markup: InlineKeyboardMarkup } {
  const lang: Lang = language === "ru" ? "ru" : "en";

  const langLabel = language === "ru" ? "\u{1F1F7}\u{1F1FA} \u0420\u0443\u0441\u0441\u043A\u0438\u0439" : language === "en" ? "\u{1F1EC}\u{1F1E7} English" : `\u{1F310} ${language}`;
  const toneLabels: Record<string, Record<Lang, string>> = {
    strict: { en: "\u{1F4AA} Strict", ru: "\u{1F4AA} \u0421\u0442\u0440\u043E\u0433\u0438\u0439" },
    hybrid: { en: "\u{2696}\u{FE0F} Balanced", ru: "\u{2696}\u{FE0F} \u0411\u0430\u043B\u0430\u043D\u0441" },
    supportive: { en: "\u{1F49A} Supportive", ru: "\u{1F49A} \u041F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u044E\u0449\u0438\u0439" },
  };
  const toneLabel = toneLabels[tone]?.[lang] || toneLabels.supportive[lang];

  const text = lang === "ru" ? [
    `<b>\u{2699}\u{FE0F} \u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438</b>`,
    ``,
    `<b>\u042F\u0437\u044B\u043A:</b> ${langLabel}`,
    `<b>\u0422\u043E\u043D \u043A\u043E\u0443\u0447\u0430:</b> ${toneLabel}`,
    ``,
    `\u041D\u0430\u0436\u043C\u0438 \u043A\u043D\u043E\u043F\u043A\u0443, \u0447\u0442\u043E\u0431\u044B \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C:`,
  ].join("\n") : [
    `<b>\u{2699}\u{FE0F} Settings</b>`,
    ``,
    `<b>Language:</b> ${langLabel}`,
    `<b>Coaching Tone:</b> ${toneLabel}`,
    ``,
    `Tap a button below to change:`,
  ].join("\n");

  const keyboard: InlineKeyboardButton[][] = [
    [
      { text: "\u{1F1EC}\u{1F1E7} English", callback_data: "set_lang_en" },
      { text: "\u{1F1F7}\u{1F1FA} \u0420\u0443\u0441\u0441\u043A\u0438\u0439", callback_data: "set_lang_ru" },
    ],
    [
      { text: lang === "ru" ? "\u{1F49A} \u041F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0430" : "\u{1F49A} Supportive", callback_data: "set_tone_support" },
      { text: lang === "ru" ? "\u{1F4AA} \u0421\u0442\u0440\u043E\u0433\u0438\u0439" : "\u{1F4AA} Strict", callback_data: "set_tone_strict" },
      { text: lang === "ru" ? "\u{2696}\u{FE0F} \u0411\u0430\u043B\u0430\u043D\u0441" : "\u{2696}\u{FE0F} Balanced", callback_data: "set_tone_hybrid" },
    ],
    [{ text: t("btn_menu", lang), callback_data: "cmd_menu" }],
  ];

  return { text, reply_markup: { inline_keyboard: keyboard } };
}

// ---- Payment & Media methods ----

/**
 * Send a video message
 */
export async function sendVideo(
  chatId: number,
  videoUrl: string,
  caption?: string,
  options?: {
    reply_markup?: InlineKeyboardMarkup;
    parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
  }
): Promise<any> {
  return botApi("sendVideo", {
    chat_id: chatId,
    video: videoUrl,
    caption,
    parse_mode: options?.parse_mode || "HTML",
    ...(options?.reply_markup ? { reply_markup: options.reply_markup } : {}),
  });
}

/**
 * Send a media group (multiple photos/videos)
 */
export async function sendMediaGroup(
  chatId: number,
  media: Array<{
    type: "photo" | "video";
    media: string;
    caption?: string;
    parse_mode?: string;
  }>
): Promise<any> {
  return botApi("sendMediaGroup", {
    chat_id: chatId,
    media,
  });
}

/**
 * Create an invoice link for Telegram Stars payment
 */
export async function createInvoiceLink(params: {
  title: string;
  description: string;
  payload: string;
  currency: string;
  prices: Array<{ label: string; amount: number }>;
}): Promise<string> {
  // For Telegram Stars (XTR), provider_token must be empty string
  const body: Record<string, unknown> = {
    title: params.title,
    description: params.description,
    payload: params.payload,
    currency: params.currency,
    prices: JSON.stringify(params.prices),
  };
  // Only include provider_token for non-Stars currencies
  if (params.currency !== "XTR") {
    body.provider_token = "";
  }
  const result = await botApi("createInvoiceLink", body);
  return result as string;
}

/**
 * Answer a pre-checkout query (must respond within 10 seconds)
 */
export async function answerPreCheckoutQuery(
  preCheckoutQueryId: string,
  ok: boolean,
  errorMessage?: string
): Promise<any> {
  return botApi("answerPreCheckoutQuery", {
    pre_checkout_query_id: preCheckoutQueryId,
    ok,
    ...(errorMessage ? { error_message: errorMessage } : {}),
  });
}

/**
 * Send an invoice directly to a chat (Stars payment).
 * The user pays right in the chat — no openInvoice needed in Mini App.
 */
export async function sendInvoice(params: {
  chatId: number;
  title: string;
  description: string;
  payload: string;
  currency: string;
  prices: Array<{ label: string; amount: number }>;
}): Promise<any> {
  const body: Record<string, unknown> = {
    chat_id: params.chatId,
    title: params.title,
    description: params.description,
    payload: params.payload,
    currency: params.currency,
    prices: JSON.stringify(params.prices),
  };
  if (params.currency !== "XTR") {
    body.provider_token = "";
  }
  return botApi("sendInvoice", body);
}