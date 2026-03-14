// =============================================
// Proper Food AI — Notification Service (i18n)
// =============================================
// Sends proactive messages to users via Telegram Bot.
// All notifications are fire-and-forget: failures are
// logged but never block the main flow.
// Supports en/ru based on user's language setting.
// =============================================

import { sendMessage, buildTgDeepLink, type InlineKeyboardButton } from "./telegram-bot.tsx";
import * as kv from "./kv.tsx";
import { t, getUserLang, type Lang } from "./i18n.tsx";

// ---- Notification Types ----

export type NotificationType =
  | "day_completed"
  | "day_skipped"
  | "streak_milestone"
  | "program_completed"
  | "challenge_joined"
  | "challenge_member_joined"
  | "challenge_completed"
  | "coach_tip"
  | "daily_reminder";

// ---- Notification Preferences ----

export interface NotificationPrefs {
  enabled: boolean; // master switch
  dayComplete: boolean; // after completing/skipping a day
  streakMilestones: boolean; // 3, 5, 7 day streaks
  challengeUpdates: boolean; // someone joined your challenge, etc.
  dailyReminder: boolean; // morning reminder
  coachTips: boolean; // periodic coach tips
}

const DEFAULT_PREFS: NotificationPrefs = {
  enabled: true,
  dayComplete: true,
  streakMilestones: true,
  challengeUpdates: true,
  dailyReminder: true,
  coachTips: true,
};

export async function getNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  try {
    const prefs = await kv.get(`become:notif_prefs:${userId}`);
    if (prefs) return { ...DEFAULT_PREFS, ...prefs };
    return { ...DEFAULT_PREFS };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export async function setNotificationPrefs(
  userId: string,
  prefs: Partial<NotificationPrefs>
): Promise<NotificationPrefs> {
  const current = await getNotificationPrefs(userId);
  const updated = { ...current, ...prefs };
  await kv.set(`become:notif_prefs:${userId}`, updated);
  return updated;
}

// ---- Send helper (fire-and-forget, never throws) ----

async function safeSend(
  chatId: number,
  text: string,
  keyboard?: InlineKeyboardButton[][]
): Promise<boolean> {
  try {
    const options: any = {};
    if (keyboard && keyboard.length > 0) {
      options.reply_markup = { inline_keyboard: keyboard };
    }
    await sendMessage(chatId, text, options);
    return true;
  } catch (err) {
    console.log(`[Notifications] Failed to send to chat ${chatId}: ${err}`);
    return false;
  }
}

// ---- Mini App URL helpers ----

function miniAppUrl(): string {
  return Deno.env.get("PROPERFOOD_MINIAPP_URL") || Deno.env.get("BECOME_MINIAPP_URL") || "";
}

/**
 * Build an inline keyboard button that opens the Mini App.
 * Uses web_app: { url } — opens Mini App directly in Telegram WebView.
 * This is the correct approach per Telegram Bot API docs.
 */
function appButton(label: string, startapp?: string): InlineKeyboardButton[] {
  const url = miniAppUrl();
  if (!url) return [];
  const finalUrl = startapp
    ? `${url}${url.includes("?") ? "&" : "?"}startapp=${encodeURIComponent(startapp)}`
    : url;
  return [{ text: label, web_app: { url: finalUrl } }];
}

// ---- Notification senders ----

/**
 * Day completed / skipped notification (i18n)
 */
export async function notifyDayComplete(
  userId: string,
  telegramId: number,
  dayNumber: number,
  totalDays: number,
  status: "done" | "skip",
  xpEarned: number,
  totalXp: number,
  streak: number
): Promise<void> {
  const prefs = await getNotificationPrefs(userId);
  if (!prefs.enabled || !prefs.dayComplete) return;

  const lang = await getUserLang(userId, kv);
  const isDone = status === "done";
  const emoji = isDone ? "\u2705" : "\u23ED\uFE0F";

  const progressBar = Array.from({ length: totalDays }, (_, i) => {
    if (i < dayNumber) return i === dayNumber - 1 ? emoji : "\u2705";
    return "\u2B1C";
  }).join("");

  const title = isDone
    ? t("notif_day_done", lang, { n: dayNumber })
    : t("notif_day_skip", lang, { n: dayNumber });

  const lines = [
    `${emoji} <b>${title}</b>`,
    ``,
    progressBar,
    ``,
  ];

  if (isDone) {
    lines.push(`\u{2B50} ${t("notif_xp", lang, { xp: xpEarned, total: totalXp })}`);
    if (streak >= 2) {
      lines.push(`\u{1F525} ${t("notif_streak", lang, { n: streak })}`);
    }
    if (dayNumber === totalDays) {
      lines.push(``);
      lines.push(`\u{1F389} <b>${t("notif_program_done", lang)}</b>`);
    }
  } else {
    lines.push(t("notif_skip_ok", lang));
  }

  const keyboard: InlineKeyboardButton[][] = [];
  const btnLabel = isDone ? t("btn_continue", lang) : t("btn_try_tomorrow", lang);
  const btn = appButton(btnLabel);
  if (btn.length) keyboard.push(btn);

  if (dayNumber < totalDays) {
    keyboard.push([
      { text: t("btn_tomorrow_tasks", lang), callback_data: "cmd_today" },
      { text: t("btn_progress", lang), callback_data: "cmd_progress" },
    ]);
  }

  console.log(`[Notifications] Sending day_${status} to user ${userId} (tg:${telegramId}), lang=${lang}`);
  await safeSend(telegramId, lines.join("\n"), keyboard);
}

/**
 * Streak milestone notification (i18n)
 */
export async function notifyStreakMilestone(
  userId: string,
  telegramId: number,
  streak: number
): Promise<void> {
  const prefs = await getNotificationPrefs(userId);
  if (!prefs.enabled || !prefs.streakMilestones) return;

  const milestones = [3, 5, 7, 10, 14, 21, 30];
  if (!milestones.includes(streak)) return;

  const lang = await getUserLang(userId, kv);

  const medalMap: Record<number, string> = {
    3: "\u{1F949}", 5: "\u{1F948}", 7: "\u{1F947}",
    10: "\u{1F48E}", 14: "\u{1F451}", 21: "\u{1F680}", 30: "\u{2B50}",
  };
  const medal = medalMap[streak] || "\u{1F525}";

  const text = [
    `${medal} <b>${t("notif_streak_title", lang, { n: streak })}</b>`,
    ``,
    t("notif_streak_body", lang, { n: streak }),
    ``,
    `\u{1F525}`.repeat(Math.min(streak, 10)),
  ].join("\n");

  const keyboard: InlineKeyboardButton[][] = [];
  const btn = appButton(t("btn_keep_going", lang));
  if (btn.length) keyboard.push(btn);

  console.log(`[Notifications] Streak milestone ${streak} for user ${userId}, lang=${lang}`);
  await safeSend(telegramId, text, keyboard);
}

/**
 * Program completed notification (i18n)
 */
export async function notifyProgramCompleted(
  userId: string,
  telegramId: number,
  programTitle: string,
  totalXp: number,
  doneDays: number,
  totalDays: number
): Promise<void> {
  const prefs = await getNotificationPrefs(userId);
  if (!prefs.enabled) return;

  const lang = await getUserLang(userId, kv);
  const completionRate = Math.round((doneDays / totalDays) * 100);

  const text = [
    `\u{1F389} <b>${t("notif_program_complete_title", lang)}</b>`,
    ``,
    t("notif_program_complete_body", lang, { title: programTitle }),
    ``,
    `\u{1F4CA} ${t("notif_program_results", lang)}`,
    `  \u2705 ${t("notif_program_completed_days", lang, { done: doneDays, total: totalDays, pct: completionRate })}`,
    `  \u{2B50} ${t("notif_program_xp", lang, { xp: totalXp })}`,
    ``,
    t("notif_program_outro", lang, { n: totalDays }),
  ].join("\n");

  const keyboard: InlineKeyboardButton[][] = [];
  const btn = appButton(t("btn_next_program", lang));
  if (btn.length) keyboard.push(btn);
  keyboard.push([
    { text: t("btn_join_challenge", lang), callback_data: "cmd_challenges" },
  ]);

  console.log(`[Notifications] Program completed for user ${userId}, lang=${lang}`);
  await safeSend(telegramId, text, keyboard);
}

/**
 * New member joined your challenge (i18n)
 */
export async function notifyChallengeNewMember(
  ownerUserId: string,
  ownerTelegramId: number,
  memberName: string,
  challengeTitle: string,
  memberCount: number
): Promise<void> {
  const prefs = await getNotificationPrefs(ownerUserId);
  if (!prefs.enabled || !prefs.challengeUpdates) return;

  const lang = await getUserLang(ownerUserId, kv);

  const text = [
    `\u{1F465} <b>${t("notif_challenge_new_member", lang)}</b>`,
    ``,
    t("notif_challenge_member_body", lang, { name: memberName, title: challengeTitle }),
    ``,
    `\u{1F4CA} ${t("notif_challenge_members_count", lang, { n: memberCount })}`,
  ].join("\n");

  const keyboard: InlineKeyboardButton[][] = [];
  const btn = appButton(t("btn_view_challenge", lang));
  if (btn.length) keyboard.push(btn);

  console.log(`[Notifications] Challenge new member -> owner ${ownerUserId}, lang=${lang}`);
  await safeSend(ownerTelegramId, text, keyboard);
}

/**
 * You joined a challenge confirmation (i18n)
 */
export async function notifyChallengeJoined(
  userId: string,
  telegramId: number,
  challengeTitle: string,
  challengeType: string,
  durationDays: number
): Promise<void> {
  const prefs = await getNotificationPrefs(userId);
  if (!prefs.enabled || !prefs.challengeUpdates) return;

  const lang = await getUserLang(userId, kv);

  const typeKey = challengeType === "solo" ? "challenge_solo"
    : challengeType === "contract" ? "challenge_contract"
    : "challenge_pool";
  const typeLabel = t(typeKey, lang);

  const text = [
    `\u{1F3C6} <b>${t("notif_challenge_accepted", lang)}</b>`,
    ``,
    t("notif_challenge_joined_body", lang, { title: challengeTitle, type: typeLabel, days: durationDays }),
    ``,
    t("notif_challenge_stay", lang),
  ].join("\n");

  const keyboard: InlineKeyboardButton[][] = [];
  const btn = appButton(t("btn_start_now", lang));
  if (btn.length) keyboard.push(btn);

  console.log(`[Notifications] Challenge joined for user ${userId}, lang=${lang}`);
  await safeSend(telegramId, text, keyboard);
}

/**
 * Daily reminder — generic (legacy, i18n)
 */
export async function notifyDailyReminder(
  userId: string,
  telegramId: number,
  dayNumber: number,
  dayTitle: string,
  taskCount: number
): Promise<void> {
  const prefs = await getNotificationPrefs(userId);
  if (!prefs.enabled || !prefs.dailyReminder) return;

  const lang = await getUserLang(userId, kv);

  const greetings = t("notif_daily_greetings", lang).split("|");
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];

  const text = [
    `\u{2600}\uFE0F <b>${greeting}</b>`,
    ``,
    `\u{1F4CB} <b>${lang === "ru" ? "\u0414\u0435\u043D\u044C" : "Day"} ${dayNumber}: ${dayTitle}</b>`,
    t("notif_daily_tasks_waiting", lang, { n: taskCount }),
    ``,
    t("notif_daily_open_app", lang),
  ].join("\n");

  const keyboard: InlineKeyboardButton[][] = [];
  const btn = appButton(t("btn_start_day", lang, { n: dayNumber }));
  if (btn.length) keyboard.push(btn);
  keyboard.push([
    { text: t("btn_view_tasks", lang), callback_data: "cmd_today" },
  ]);

  console.log(`[Notifications] Daily reminder for user ${userId}, day ${dayNumber}, lang=${lang}`);
  await safeSend(telegramId, text, keyboard);
}

/**
 * Personalized daily digest — sends the user's actual tasks for today
 * with progress info, streak, XP and motivational message.
 */
export interface DailyDigestTask {
  emoji: string;
  title: string;
  description?: string;
  estimatedMinutes?: number;
  type?: string;
}

export async function notifyDailyDigest(
  userId: string,
  telegramId: number,
  opts: {
    firstName: string;
    dayNumber: number;
    totalDays: number;
    dayTitle: string;
    programTitle: string;
    tasks: DailyDigestTask[];
    streak: number;
    xp: number;
    strategicGoals?: Array<{ title: string; dueTasks: number; totalTasks: number; completedTasks: number }>;
  }
): Promise<void> {
  const prefs = await getNotificationPrefs(userId);
  if (!prefs.enabled || !prefs.dailyReminder) return;

  const lang = await getUserLang(userId, kv);
  const { firstName, dayNumber, totalDays, dayTitle, programTitle, tasks, streak, xp, strategicGoals } = opts;

  // Random motivational greeting
  const greetings = t("notif_daily_greetings", lang).split("|");
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];

  // Build task list with numbering
  const taskLines = tasks.map((tk, i) => {
    const mins = tk.estimatedMinutes ? ` (~${tk.estimatedMinutes} ${lang === "ru" ? "\u043C\u0438\u043D" : "min"})` : "";
    return `  ${i + 1}. ${tk.emoji} ${tk.title}${mins}`;
  }).join("\n");

  // Total estimated time
  const totalMins = tasks.reduce((s, tk) => s + (tk.estimatedMinutes || 0), 0);
  const timeStr = totalMins > 0
    ? `\u{23F1} ~${totalMins} ${lang === "ru" ? "\u043C\u0438\u043D \u0441\u0435\u0433\u043E\u0434\u043D\u044F" : "min today"}`
    : "";

  // Progress bar: compact fraction
  const progressStr = `${lang === "ru" ? "\u0414\u0435\u043D\u044C" : "Day"} ${dayNumber}/${totalDays}`;

  // Stats line
  const statsItems: string[] = [];
  if (streak >= 2) statsItems.push(`\u{1F525} ${lang === "ru" ? "\u0421\u0435\u0440\u0438\u044F" : "Streak"}: ${streak}`);
  if (xp > 0) statsItems.push(`\u{2B50} XP: ${xp}`);
  const statsLine = statsItems.length > 0 ? statsItems.join("  \u2022  ") : "";

  const lines: string[] = [
    `\u{2600}\uFE0F <b>${greeting}, ${firstName}!</b>`,
    ``,
    `\u{1F4CB} <b>${progressStr}: ${dayTitle}</b>`,
    `<i>${programTitle}</i>`,
    ``,
    lang === "ru" ? "\u{1F4DD} <b>\u0422\u0432\u043E\u0438 \u0437\u0430\u0434\u0430\u0447\u0438 \u043D\u0430 \u0441\u0435\u0433\u043E\u0434\u043D\u044F:</b>" : "\u{1F4DD} <b>Your tasks for today:</b>",
    taskLines,
  ];

  if (timeStr) {
    lines.push(``, timeStr);
  }

  // Strategic goals section — appended to daily digest if user has active goals with due tasks
  if (strategicGoals && strategicGoals.length > 0) {
    const goalsWithDue = strategicGoals.filter(g => g.dueTasks > 0);
    if (goalsWithDue.length > 0) {
      lines.push(``);
      lines.push(lang === "ru"
        ? `\u{1F3AF} <b>\u0421\u0442\u0440\u0430\u0442. \u0446\u0435\u043B\u0438:</b>`
        : `\u{1F3AF} <b>Strategic goals:</b>`);
      for (const sg of goalsWithDue.slice(0, 3)) {
        const pctDone = sg.totalTasks > 0 ? Math.round((sg.completedTasks / sg.totalTasks) * 100) : 0;
        lines.push(`  \u2022 ${sg.title} \u2014 ${sg.dueTasks} ${lang === "ru" ? "\u0437\u0430\u0434\u0430\u0447" : "due"} (${pctDone}%)`);
      }
    }
  }

  if (statsLine) {
    lines.push(``, statsLine);
  }

  const text = lines.join("\n");

  const keyboard: InlineKeyboardButton[][] = [];
  const btn = appButton(t("btn_start_day", lang, { n: dayNumber }));
  if (btn.length) keyboard.push(btn);
  keyboard.push([
    { text: t("btn_view_tasks", lang), callback_data: "cmd_today" },
    { text: lang === "ru" ? "\u{1F4CA} \u041F\u0440\u043E\u0433\u0440\u0435\u0441\u0441" : "\u{1F4CA} Progress", callback_data: "cmd_progress" },
  ]);

  console.log(`[Notifications] Daily digest for user ${userId} (${firstName}), day ${dayNumber}/${totalDays}, ${tasks.length} tasks, ${strategicGoals?.length || 0} strategic goals, lang=${lang}`);
  await safeSend(telegramId, text, keyboard);
}

/**
 * Compute streak from progress entries
 */
export function computeStreak(
  progressList: Array<{ dayNumber: number; status: string }>
): number {
  const doneEntries = progressList
    .filter((p) => p.status === "done")
    .sort((a, b) => b.dayNumber - a.dayNumber);

  let streak = 0;
  if (doneEntries.length > 0) {
    for (let i = 0; i < doneEntries.length; i++) {
      if (doneEntries[i].dayNumber === doneEntries[0].dayNumber - i) streak++;
      else break;
    }
  }
  return streak;
}

/**
 * Notify challenge members when a fellow member completes a day.
 * Fire-and-forget, used for both private and pool challenges.
 */
export async function notifyChallengeMemberDayComplete(
  memberUserId: string,
  memberName: string,
  challengeTitle: string,
  dayNumber: number,
  doneDays: number,
  durationDays: number,
  streak: number,
  otherMembers: Array<{ userId: string; telegramId?: number }>
): Promise<void> {
  for (const other of otherMembers) {
    if (other.userId === memberUserId) continue;
    if (!other.telegramId) continue;

    const prefs = await getNotificationPrefs(other.userId);
    if (!prefs.enabled || !prefs.challengeUpdates) continue;

    const lang = await getUserLang(other.userId, kv);
    const progressPct = durationDays > 0 ? Math.round((doneDays / durationDays) * 100) : 0;

    const lines = [
      `\u{1F3C3} <b>${t("notif_ch_member_day_title", lang, { name: memberName })}</b>`,
      ``,
      t("notif_ch_member_day_body", lang, {
        name: memberName,
        title: challengeTitle,
        day: dayNumber,
        pct: progressPct,
      }),
    ];

    if (streak >= 2) {
      lines.push(`\u{1F525} ${t("notif_ch_member_streak", lang, { name: memberName, n: streak })}`);
    }

    lines.push(``);
    lines.push(t("notif_ch_member_cta", lang));

    const keyboard: InlineKeyboardButton[][] = [];
    const btn = appButton(t("btn_view_challenge", lang));
    if (btn.length) keyboard.push(btn);

    console.log(`[Notifications] Challenge day complete: ${memberName} -> user ${other.userId}, lang=${lang}`);
    await safeSend(other.telegramId, lines.join("\n"), keyboard);
  }
}

/**
 * Task reminder notification — sent periodically until task is completed or reminder disabled.
 */
export async function notifyTaskReminder(
  userId: string,
  telegramId: number,
  taskTitle: string,
  taskDescription: string | null,
  taskId: string
): Promise<void> {
  const prefs = await getNotificationPrefs(userId);
  if (!prefs.enabled) return;

  const lang = await getUserLang(userId, kv);

  const lines = [
    `\u{1F514} <b>${lang === "ru" ? "\u041D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u0435" : "Task Reminder"}</b>`,
    ``,
    `\u{1F4CC} <b>${taskTitle}</b>`,
  ];

  if (taskDescription) {
    lines.push(`<i>${taskDescription}</i>`);
  }

  lines.push(``);
  lines.push(lang === "ru"
    ? "\u041E\u0442\u043A\u0440\u043E\u0439 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435, \u0447\u0442\u043E\u0431\u044B \u043E\u0442\u043C\u0435\u0442\u0438\u0442\u044C \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435."
    : "Open the app to mark it complete.");

  const keyboard: InlineKeyboardButton[][] = [];
  const btn = appButton(lang === "ru" ? "\u041E\u0442\u043A\u0440\u044B\u0442\u044C" : "Open App");
  if (btn.length) keyboard.push(btn);

  console.log(`[Notifications] Task reminder for user ${userId}: ${taskTitle}`);
  await safeSend(telegramId, lines.join("\n"), keyboard);
}

/**
 * Welcome notification — sent when user first registers via Mini App (i18n)
 */
export async function notifyWelcome(
  userId: string,
  telegramId: number,
  firstName: string
): Promise<void> {
  const lang = await getUserLang(userId, kv);

  const text = [
    `\u{1F44B} <b>${t("notif_welcome_title", lang, { name: firstName })}</b>`,
    ``,
    t("notif_welcome_body", lang),
    ``,
    `\u{1F4CB} ${t("notif_welcome_f1", lang)}`,
    `\u{1F916} ${t("notif_welcome_f2", lang)}`,
    `\u{1F3C6} ${t("notif_welcome_f3", lang)}`,
    `\u{1F514} ${t("notif_welcome_f4", lang)}`,
    ``,
    t("notif_welcome_open", lang),
  ].join("\n");

  const keyboard: InlineKeyboardButton[][] = [];
  const btn = appButton(t("btn_start_day", lang, { n: 1 }));
  if (btn.length) keyboard.push(btn);
  keyboard.push([
    { text: t("btn_help", lang), callback_data: "cmd_help" },
    { text: t("btn_settings", lang), callback_data: "cmd_settings" },
  ]);

  console.log(`[Notifications] Welcome for user ${userId} (tg:${telegramId}), lang=${lang}`);
  await safeSend(telegramId, text, keyboard);
}

/**
 * Challenge expiring soon notification — sent 24h before challenge ends (i18n)
 */
export async function notifyChallengeExpiring(
  userId: string,
  telegramId: number,
  challengeTitle: string,
  hoursLeft: number,
  challengeId: string
): Promise<void> {
  const lang = await getUserLang(userId, kv);

  const text = [
    `\u{23F3} <b>${t("notif_challenge_expiring_title", lang)}</b>`,
    ``,
    t("notif_challenge_expiring_body", lang, { title: challengeTitle, hours: Math.round(hoursLeft) }),
    ``,
    t("notif_challenge_expiring_action", lang),
  ].join("\n");

  const keyboard: InlineKeyboardButton[][] = [];
  const btn = appButton(t("notif_challenge_expiring_btn", lang));
  if (btn.length) keyboard.push(btn);

  console.log(`[Notifications] ChallengeExpiring for user ${userId} (tg:${telegramId}), ch:${challengeId}, hours:${Math.round(hoursLeft)}`);
  await safeSend(telegramId, text, keyboard);
}