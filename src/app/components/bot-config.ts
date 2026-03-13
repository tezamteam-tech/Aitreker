// =============================================
// Proper Food AI — Bot Configuration
// =============================================
// Central config for Telegram bot references.
// Update BOT_USERNAME to match your @BotFather bot.
// =============================================

/** Bot username WITHOUT the @ symbol */
export const BOT_USERNAME = 'ProperFoodAI_bot';

/** Mini App short name (set via @BotFather → Edit Mini App) */
export const MINIAPP_SHORT_NAME = 'app';

/** App display name */
export const APP_NAME = 'Proper Food AI';

/** App version */
export const APP_VERSION = '1.0.0';

/** Build a t.me deep link for the Mini App */
export function buildBotLink(startapp?: string): string {
  const base = `https://t.me/${BOT_USERNAME}/${MINIAPP_SHORT_NAME}`;
  if (startapp) {
    return `${base}?startapp=${encodeURIComponent(startapp)}`;
  }
  return base;
}

/** Build a t.me/BOT?start=PARAM link (for /start command deep links) */
export function buildStartLink(param: string): string {
  return `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(param)}`;
}

/** @username format for display */
export const BOT_MENTION = `@${BOT_USERNAME}`;
