// =============================================
// BECOME — Internationalization (i18n)
// =============================================
// Centralized translations for bot messages,
// notifications, and inline keyboards.
// Supports: en, ru. Fallback: en.
// =============================================

export type Lang = "en" | "ru";

export function detectLang(languageCode?: string | null): Lang {
  if (!languageCode) return "en";
  return languageCode.startsWith("ru") ? "ru" : "en";
}

// ---- Translation dictionary ----

const translations: Record<string, Record<Lang, string>> = {
  // === /start welcome ===
  welcome_title: {
    en: "Welcome to BECOME, {name}!",
    ru: "\u0414\u043E\u0431\u0440\u043E \u043F\u043E\u0436\u0430\u043B\u043E\u0432\u0430\u0442\u044C \u0432 BECOME, {name}!",
  },
  welcome_subtitle: {
    en: "Your personal development companion.",
    ru: "\u0422\u0432\u043E\u0439 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0439 \u043F\u043E\u043C\u043E\u0449\u043D\u0438\u043A \u0432 \u0441\u0430\u043C\u043E\u0440\u0430\u0437\u0432\u0438\u0442\u0438\u0438.",
  },
  welcome_desc: {
    en: "Build lasting habits through AI-powered programs from 7 to 100 days.",
    ru: "\u0421\u043E\u0437\u0434\u0430\u0432\u0430\u0439 \u0443\u0441\u0442\u043E\u0439\u0447\u0438\u0432\u044B\u0435 \u043F\u0440\u0438\u0432\u044B\u0447\u043A\u0438 \u0447\u0435\u0440\u0435\u0437 \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u044B \u043E\u0442 7 \u0434\u043D\u0435\u0439 \u0434\u043E 100 \u0434\u043D\u0435\u0439 \u0441 AI-\u043A\u043E\u0443\u0447\u0435\u043C.",
  },
  welcome_how: {
    en: "How it works:",
    ru: "\u041A\u0430\u043A \u044D\u0442\u043E \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442:",
  },
  welcome_step1: {
    en: "1. Share your contact to get started",
    ru: "1. \u041F\u043E\u0434\u0435\u043B\u0438\u0441\u044C \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u043E\u043C \u0434\u043B\u044F \u043D\u0430\u0447\u0430\u043B\u0430",
  },
  welcome_step2: {
    en: "2. Complete daily tasks in your program",
    ru: "2. \u0412\u044B\u043F\u043E\u043B\u043D\u044F\u0439 \u0435\u0436\u0435\u0434\u043D\u0435\u0432\u043D\u044B\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u044F",
  },
  welcome_step3: {
    en: "3. Get personalized AI coaching",
    ru: "3. \u041F\u043E\u043B\u0443\u0447\u0430\u0439 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0439 AI-\u043A\u043E\u0443\u0447\u0438\u043D\u0433",
  },
  welcome_step4: {
    en: "4. Join challenges with others",
    ru: "4. \u0423\u0447\u0430\u0441\u0442\u0432\u0443\u0439 \u0432 \u0447\u0435\u043B\u043B\u0435\u043D\u0434\u0436\u0430\u0445 \u0441 \u0434\u0440\u0443\u0437\u044C\u044F\u043C\u0438",
  },
  welcome_cta: {
    en: "Tap the button below to share your contact and get started!",
    ru: "\u041D\u0430\u0436\u043C\u0438 \u043A\u043D\u043E\u043F\u043A\u0443 \u043D\u0438\u0436\u0435, \u0447\u0442\u043E\u0431\u044B \u043F\u043E\u0434\u0435\u043B\u0438\u0442\u044C\u0441\u044F \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u043E\u043C \u0438 \u043D\u0430\u0447\u0430\u0442\u044C!",
  },
  welcome_returning: {
    en: "Welcome back, {name}! Open the app to continue your journey.",
    ru: "\u0421 \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0435\u043D\u0438\u0435\u043C, {name}! \u041E\u0442\u043A\u0440\u043E\u0439 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C.",
  },

  // === Contact shared ===
  contact_success_title: {
    en: "You're all set, {name}!",
    ru: "\u0413\u043E\u0442\u043E\u0432\u043E, {name}!",
  },
  contact_success_body: {
    en: "Your account has been created. Open the app to start your first program!",
    ru: "\u0410\u043A\u043A\u0430\u0443\u043D\u0442 \u0441\u043E\u0437\u0434\u0430\u043D. \u041E\u0442\u043A\u0440\u043E\u0439 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435, \u0447\u0442\u043E\u0431\u044B \u043D\u0430\u0447\u0430\u0442\u044C \u0441\u0432\u043E\u044E \u043F\u0435\u0440\u0432\u0443\u044E \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u0443!",
  },
  contact_features: {
    en: "What awaits you:",
    ru: "\u0427\u0442\u043E \u0442\u0435\u0431\u044F \u0436\u0434\u0451\u0442:",
  },
  contact_f1: {
    en: "Programs from 7 to 100 days with daily tasks",
    ru: "\u041F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u044B \u043E\u0442 7 \u0434\u043D\u0435\u0439 \u0434\u043E 100 \u0434\u043D\u0435\u0439 \u0441 \u0435\u0436\u0435\u0434\u043D\u0435\u0432\u043D\u044B\u043C\u0438 \u0437\u0430\u0434\u0430\u043D\u0438\u044F\u043C\u0438",
  },
  contact_f2: {
    en: "AI Coach for personalized guidance",
    ru: "AI-\u043A\u043E\u0443\u0447 \u0434\u043B\u044F \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0445 \u0440\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0430\u0446\u0438\u0439",
  },
  contact_f3: {
    en: "Challenges & competitions with friends",
    ru: "\u0427\u0435\u043B\u043B\u0435\u043D\u0434\u0436\u0438 \u0438 \u0441\u043E\u0440\u0435\u0432\u043D\u043E\u0432\u0430\u043D\u0438\u044F \u0441 \u0434\u0440\u0443\u0437\u044C\u044F\u043C\u0438",
  },
  contact_f4: {
    en: "Push notifications & progress tracking",
    ru: "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F \u0438 \u043E\u0442\u0441\u043B\u0435\u0436\u0438\u0432\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0433\u0440\u0435\u0441\u0441\u0430",
  },

  // === Reply keyboard buttons ===
  btn_share_contact: {
    en: "\u{1F4F2} Share Contact",
    ru: "\u{1F4F2} \u041F\u043E\u0434\u0435\u043B\u0438\u0441\u044C \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u043E\u043C",
  },
  btn_open_app: {
    en: "\u{1F3AF} Open BECOME",
    ru: "\u{1F3AF} \u041E\u0442\u043A\u0440\u044B\u0442\u044C BECOME",
  },
  btn_progress: {
    en: "\u{1F4CA} My Progress",
    ru: "\u{1F4CA} \u041C\u043E\u0439 \u043F\u0440\u043E\u0433\u0440\u0435\u0441\u0441",
  },
  btn_today_tasks: {
    en: "\u{1F4CB} Today's Tasks",
    ru: "\u{1F4CB} \u0417\u0430\u0434\u0430\u043D\u0438\u044F \u043D\u0430 \u0441\u0435\u0433\u043E\u0434\u043D\u044F",
  },
  btn_coach: {
    en: "\u{1F916} Ask Coach",
    ru: "\u{1F916} AI-\u043A\u043E\u0443\u0447",
  },
  btn_challenges: {
    en: "\u{1F3C6} Challenges",
    ru: "\u{1F3C6} \u0427\u0435\u043B\u043B\u0435\u043D\u0434\u0436\u0438",
  },
  btn_settings: {
    en: "\u{2699}\u{FE0F} Settings",
    ru: "\u{2699}\u{FE0F} \u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438",
  },
  btn_help: {
    en: "\u{2753} Help",
    ru: "\u{2753} \u041F\u043E\u043C\u043E\u0449\u044C",
  },
  btn_menu: {
    en: "\u{25C0}\u{FE0F} Back to Menu",
    ru: "\u{25C0}\u{FE0F} Назад в меню",
  },
  btn_sync_data: {
    en: "\u{1F504} Update Data",
    ru: "\u{1F504} Обновить данные",
  },
  btn_share_phone: {
    en: "\u{1F4F2} Share Phone Number",
    ru: "\u{1F4F2} Поделиться номером",
  },
  btn_continue: {
    en: "\u{1F3AF} Continue",
    ru: "\u{1F3AF} \u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C",
  },
  btn_start_day: {
    en: "\u{1F3AF} Start Day {n}",
    ru: "\u{1F3AF} \u041D\u0430\u0447\u0430\u0442\u044C \u0434\u0435\u043D\u044C {n}",
  },
  btn_view_tasks: {
    en: "\u{1F4CB} View Tasks",
    ru: "\u{1F4CB} \u0417\u0430\u0434\u0430\u043D\u0438\u044F",
  },
  btn_start_now: {
    en: "\u{1F3AF} Start Now",
    ru: "\u{1F3AF} \u041D\u0430\u0447\u0430\u0442\u044C",
  },
  btn_keep_going: {
    en: "\u{1F3AF} Keep Going",
    ru: "\u{1F3AF} \u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0430\u0439",
  },
  btn_next_program: {
    en: "\u{1F680} Start Next Program",
    ru: "\u{1F680} \u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0430\u044F \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u0430",
  },
  btn_view_challenge: {
    en: "\u{1F3C6} View Challenge",
    ru: "\u{1F3C6} \u0421\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u0447\u0435\u043B\u043B\u0435\u043D\u0434\u0436",
  },
  btn_join_challenge: {
    en: "\u{1F3C6} Join a Challenge",
    ru: "\u{1F3C6} \u041F\u0440\u0438\u0441\u043E\u0435\u0434\u0438\u043D\u0438\u0442\u044C\u0441\u044F \u043A \u0447\u0435\u043B\u043B\u0435\u043D\u0434\u0436\u0443",
  },
  btn_try_tomorrow: {
    en: "\u{1F3AF} Try Again Tomorrow",
    ru: "\u{1F3AF} \u041F\u043E\u043F\u0440\u043E\u0431\u043E\u0432\u0430\u0442\u044C \u0437\u0430\u0432\u0442\u0440\u0430",
  },
  btn_tomorrow_tasks: {
    en: "\u{1F4CB} Tomorrow's Tasks",
    ru: "\u{1F4CB} \u0417\u0430\u0434\u0430\u043D\u0438\u044F \u043D\u0430 \u0437\u0430\u0432\u0442\u0440\u0430",
  },

  // === Notifications ===
  notif_day_done: {
    en: "Day {n} completed!",
    ru: "\u0414\u0435\u043D\u044C {n} \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D!",
  },
  notif_day_skip: {
    en: "Day {n} skipped",
    ru: "\u0414\u0435\u043D\u044C {n} \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D",
  },
  notif_xp: {
    en: "+{xp} XP (total: {total})",
    ru: "+{xp} XP (\u0432\u0441\u0435\u0433\u043E: {total})",
  },
  notif_streak: {
    en: "{n}-day streak!",
    ru: "{n} \u0434\u043D\u0435\u0439 \u043F\u043E\u0434\u0440\u044F\u0434!",
  },
  notif_skip_ok: {
    en: "It's okay to take a break. Come back tomorrow!",
    ru: "\u041D\u0438\u0447\u0435\u0433\u043E \u0441\u0442\u0440\u0430\u0448\u043D\u043E\u0433\u043E. \u0412\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0439\u0441\u044F \u0437\u0430\u0432\u0442\u0440\u0430!",
  },
  notif_program_done: {
    en: "Program complete! Congratulations!",
    ru: "\u041F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430! \u041F\u043E\u0437\u0434\u0440\u0430\u0432\u043B\u044F\u0435\u043C!",
  },
  notif_streak_title: {
    en: "{n}-Day Streak!",
    ru: "\u0421\u0435\u0440\u0438\u044F {n} \u0434\u043D\u0435\u0439!",
  },
  notif_streak_body: {
    en: "You've been consistent for {n} days straight.\nThat's not luck \u2014 that's discipline becoming identity.",
    ru: "\u0422\u044B \u0431\u044B\u043B \u043F\u043E\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u043D {n} \u0434\u043D\u0435\u0439 \u043F\u043E\u0434\u0440\u044F\u0434.\n\u042D\u0442\u043E \u043D\u0435 \u0443\u0434\u0430\u0447\u0430 \u2014 \u044D\u0442\u043E \u0434\u0438\u0441\u0446\u0438\u043F\u043B\u0438\u043D\u0430, \u0441\u0442\u0430\u043D\u043E\u0432\u044F\u0449\u0430\u044F\u0441\u044F \u0438\u0434\u0435\u043D\u0442\u0438\u0447\u043D\u043E\u0441\u0442\u044C\u044E.",
  },
  notif_program_complete_title: {
    en: "Program Complete!",
    ru: "\u041F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430!",
  },
  notif_program_complete_body: {
    en: "You finished \"{title}\"",
    ru: "\u0422\u044B \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043B \u00AB{title}\u00BB",
  },
  notif_program_results: {
    en: "Results:",
    ru: "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B:",
  },
  notif_program_completed_days: {
    en: "{done}/{total} days completed ({pct}%)",
    ru: "{done}/{total} \u0434\u043D\u0435\u0439 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E ({pct}%)",
  },
  notif_program_xp: {
    en: "{xp} total XP earned",
    ru: "{xp} XP \u0437\u0430\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u043E",
  },
  notif_program_outro: {
    en: "What you've built in {n} days is real.\nReady for the next program?",
    ru: "\u0422\u043E, \u0447\u0442\u043E \u0442\u044B \u0441\u043E\u0437\u0434\u0430\u043B \u0437\u0430 {n} \u0434\u043D\u0435\u0439 \u2014 \u0440\u0435\u0430\u043B\u044C\u043D\u043E.\n\u0413\u043E\u0442\u043E\u0432 \u043A \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0439 \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u0435?",
  },
  notif_challenge_new_member: {
    en: "New challenger!",
    ru: "\u041D\u043E\u0432\u044B\u0439 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A!",
  },
  notif_challenge_member_body: {
    en: "<b>{name}</b> joined your challenge\n\"{title}\"",
    ru: "<b>{name}</b> \u043F\u0440\u0438\u0441\u043E\u0435\u0434\u0438\u043D\u0438\u043B\u0441\u044F \u043A \u0442\u0432\u043E\u0435\u043C\u0443 \u0447\u0435\u043B\u043B\u0435\u043D\u0434\u0436\u0443\n\u00AB{title}\u00BB",
  },
  notif_challenge_members_count: {
    en: "{n} members now competing.",
    ru: "{n} \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432 \u0441\u043E\u0440\u0435\u0432\u043D\u0443\u044E\u0442\u0441\u044F.",
  },
  notif_challenge_accepted: {
    en: "Challenge Accepted!",
    ru: "\u0412\u044B\u0437\u043E\u0432 \u043F\u0440\u0438\u043D\u044F\u0442!",
  },
  notif_challenge_joined_body: {
    en: "You joined \"{title}\"\nType: {type} \u2022 {days} days",
    ru: "\u0422\u044B \u043F\u0440\u0438\u0441\u043E\u0435\u0434\u0438\u043D\u0438\u043B\u0441\u044F \u043A \u00AB{title}\u00BB\n\u0422\u0438\u043F: {type} \u2022 {days} \u0434\u043D\u0435\u0439",
  },
  notif_challenge_stay: {
    en: "Stay consistent and show up every day.\nYour progress will be visible to other members.",
    ru: "\u0411\u0443\u0434\u044C \u043F\u043E\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u043D \u2014 \u043F\u043E\u044F\u0432\u043B\u044F\u0439\u0441\u044F \u043A\u0430\u0436\u0434\u044B\u0439 \u0434\u0435\u043D\u044C.\n\u0422\u0432\u043E\u0439 \u043F\u0440\u043E\u0433\u0440\u0435\u0441\u0441 \u0432\u0438\u0434\u0435\u043D \u0434\u0440\u0443\u0433\u0438\u043C \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0430\u043C.",
  },
  notif_daily_greetings: {
    en: "Rise and build.|New day, new chance.|Your future self is watching.|Small steps, big change.|Show up for yourself today.",
    ru: "\u0412\u0441\u0442\u0430\u0432\u0430\u0439 \u0438 \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u0439.|\u041D\u043E\u0432\u044B\u0439 \u0434\u0435\u043D\u044C \u2014 \u043D\u043E\u0432\u044B\u0439 \u0448\u0430\u043D\u0441.|\u0422\u0432\u043E\u0451 \u0431\u0443\u0434\u0443\u0449\u0435\u0435 \u00AB\u044F\u00BB \u043D\u0430\u0431\u043B\u044E\u0434\u0430\u0435\u0442.|\u041C\u0430\u043B\u0435\u043D\u044C\u043A\u0438\u0435 \u0448\u0430\u0433\u0438 \u2014 \u0431\u043E\u043B\u044C\u0448\u0438\u0435 \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u044B.|\u0421\u0435\u0433\u043E\u0434\u043D\u044F \u2014 \u0440\u0430\u0434\u0438 \u0441\u0435\u0431\u044F.",
  },
  notif_daily_tasks_waiting: {
    en: "{n} tasks waiting for you.",
    ru: "{n} \u0437\u0430\u0434\u0430\u043D\u0438\u0439 \u0436\u0434\u0443\u0442 \u0442\u0435\u0431\u044F.",
  },
  notif_daily_open_app: {
    en: "Open the app to get started.",
    ru: "\u041E\u0442\u043A\u0440\u043E\u0439 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435, \u0447\u0442\u043E\u0431\u044B \u043D\u0430\u0447\u0430\u0442\u044C.",
  },

  // === Welcome notification (from Mini App auth) ===
  notif_welcome_title: {
    en: "Welcome to BECOME, {name}!",
    ru: "\u0414\u043E\u0431\u0440\u043E \u043F\u043E\u0436\u0430\u043B\u043E\u0432\u0430\u0442\u044C \u0432 BECOME, {name}!",
  },
  notif_welcome_body: {
    en: "Your personal development journey starts now.",
    ru: "\u0422\u0432\u043E\u0439 \u043F\u0443\u0442\u044C \u0441\u0430\u043C\u043E\u0440\u0430\u0437\u0432\u0438\u0442\u0438\u044F \u043D\u0430\u0447\u0438\u043D\u0430\u0435\u0442\u0441\u044F \u0441\u0435\u0439\u0447\u0430\u0441.",
  },
  notif_welcome_f1: {
    en: "Your first program is ready",
    ru: "\u0422\u0432\u043E\u044F \u043F\u0435\u0440\u0432\u0430\u044F \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u0430 \u0433\u043E\u0442\u043E\u0432\u0430",
  },
  notif_welcome_f2: {
    en: "AI Coach will guide you after each day",
    ru: "AI-\u043A\u043E\u0443\u0447 \u043F\u043E\u043C\u043E\u0436\u0435\u0442 \u043F\u043E\u0441\u043B\u0435 \u043A\u0430\u0436\u0434\u043E\u0433\u043E \u0434\u043D\u044F",
  },
  notif_welcome_f3: {
    en: "Create or join challenges with friends",
    ru: "\u0421\u043E\u0437\u0434\u0430\u0432\u0430\u0439 \u0438\u043B\u0438 \u043F\u0440\u0438\u0441\u043E\u0435\u0434\u0438\u043D\u044F\u0439\u0441\u044F \u043A \u0447\u0435\u043B\u043B\u0435\u043D\u0434\u0436\u0430\u043C",
  },
  notif_welcome_f4: {
    en: "I'll send you reminders & progress updates",
    ru: "\u0411\u0443\u0434\u0443 \u043F\u0440\u0438\u0441\u044B\u043B\u0430\u0442\u044C \u043D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u044F \u0438 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F",
  },
  notif_welcome_open: {
    en: "Open the app to start Day 1!",
    ru: "\u041E\u0442\u043A\u0440\u043E\u0439 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0434\u043B\u044F \u043D\u0430\u0447\u0430\u043B\u0430!",
  },

  // === Challenge type labels ===
  challenge_solo: { en: "Solo", ru: "\u0421\u043E\u043B\u043E" },
  challenge_contract: { en: "Commitment Contract", ru: "\u041A\u043E\u043D\u0442\u0440\u0430\u043A\u0442" },
  challenge_pool: { en: "Shared Path", ru: "\u041E\u0431\u0449\u0438\u0439 \u043F\u0443\u0442\u044C" },

  // === Challenge member day complete notifications ===
  notif_ch_member_day_title: {
    en: "{name} completed a day!",
    ru: "{name} \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043B(\u0430) \u0434\u0435\u043D\u044C!",
  },
  notif_ch_member_day_body: {
    en: "{name} completed day {day} in \"{title}\" ({pct}% done)",
    ru: "{name} \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043B(\u0430) \u0434\u0435\u043D\u044C {day} \u0432 \u00AB{title}\u00BB ({pct}%)",
  },
  notif_ch_member_streak: {
    en: "{name} is on a {n}-day streak!",
    ru: "{name} \u0434\u0435\u0440\u0436\u0438\u0442 \u0441\u0435\u0440\u0438\u044E {n} \u0434\u043D\u0435\u0439!",
  },
  notif_ch_member_cta: {
    en: "Don't fall behind \u2014 complete your day too!",
    ru: "\u041D\u0435 \u043E\u0442\u0441\u0442\u0430\u0432\u0430\u0439 \u2014 \u0437\u0430\u0432\u0435\u0440\u0448\u0438 \u0441\u0432\u043E\u0439 \u0434\u0435\u043D\u044C!",
  },

  // === Misc ===
  not_started: {
    en: "You haven't started yet. Send /start to begin!",
    ru: "\u0422\u044B \u0435\u0449\u0451 \u043D\u0435 \u043D\u0430\u0447\u0430\u043B. \u041E\u0442\u043F\u0440\u0430\u0432\u044C /start!",
  },
  unknown_bot: {
    en: "I'm your BECOME bot! Use the buttons below or try /start, /progress, /today, /help.",
    ru: "\u042F \u0442\u0432\u043E\u0439 BECOME-\u0431\u043E\u0442! \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439 \u043A\u043D\u043E\u043F\u043A\u0438 \u043D\u0438\u0436\u0435 \u0438\u043B\u0438 \u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439 /start, /progress, /today, /help.",
  },
  day_of: {
    en: "Day {cur} of {total}",
    ru: "\u0414\u0435\u043D\u044C {cur} \u0438\u0437 {total}",
  },
  completed_days: {
    en: "Completed: <b>{n}/{total}</b> days",
    ru: "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E: <b>{n}/{total}</b> \u0434\u043D\u0435\u0439",
  },
  streak_label: {
    en: "Streak: <b>{n}</b> days",
    ru: "\u0421\u0435\u0440\u0438\u044F: <b>{n}</b> \u0434\u043D\u0435\u0439",
  },
  skipped_label: {
    en: "Skipped: <b>{n}</b>",
    ru: "\u041F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E: <b>{n}</b>",
  },
  open_app_complete: {
    en: "Open the app to complete your tasks and earn XP!",
    ru: "\u041E\u0442\u043A\u0440\u043E\u0439 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435, \u0447\u0442\u043E\u0431\u044B \u0432\u044B\u043F\u043E\u043B\u043D\u0438\u0442\u044C \u0437\u0430\u0434\u0430\u043D\u0438\u044F!",
  },
  todays_tasks: {
    en: "Today's tasks:",
    ru: "\u0417\u0430\u0434\u0430\u043D\u0438\u044F \u043D\u0430 \u0441\u0435\u0433\u043E\u0434\u043D\u044F:",
  },

  // === Challenge expiring notifications ===
  notif_challenge_expiring_title: {
    en: "Challenge Ending Soon!",
    ru: "\u0427\u0435\u043B\u043B\u0435\u043D\u0434\u0436 \u0441\u043A\u043E\u0440\u043E \u0437\u0430\u043A\u0430\u043D\u0447\u0438\u0432\u0430\u0435\u0442\u0441\u044F!",
  },
  notif_challenge_expiring_body: {
    en: "Your challenge \"{title}\" ends in ~{hours}h. Make sure to complete today\u2019s tasks!",
    ru: "\u0422\u0432\u043E\u0439 \u0447\u0435\u043B\u043B\u0435\u043D\u0434\u0436 \u00AB{title}\u00BB \u0437\u0430\u043A\u043E\u043D\u0447\u0438\u0442\u0441\u044F \u0447\u0435\u0440\u0435\u0437 ~{hours}\u0447. \u0423\u0441\u043F\u0435\u0439 \u0432\u044B\u043F\u043E\u043B\u043D\u0438\u0442\u044C \u0437\u0430\u0434\u0430\u043D\u0438\u044F!",
  },
  notif_challenge_expiring_action: {
    en: "Complete your tasks now to secure your deposit!",
    ru: "\u0412\u044B\u043F\u043E\u043B\u043D\u0438 \u0437\u0430\u0434\u0430\u043D\u0438\u044F, \u0447\u0442\u043E\u0431\u044B \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0434\u0435\u043F\u043E\u0437\u0438\u0442!",
  },
  notif_challenge_expiring_btn: {
    en: "\u{1F3C3} Complete Tasks",
    ru: "\u{1F3C3} Выполнить",
  },
};

/**
 * Translate a key into the given language, with optional {placeholder} interpolation.
 * Falls back to English, then to the raw key if not found.
 */
export function t(key: string, lang: Lang, vars?: Record<string, string | number>): string {
  const entry = translations[key];
  let str = entry?.[lang] ?? entry?.["en"] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}

/**
 * Resolve the user's preferred language from KV store.
 * Looks up `become:user:{userId}` → `.language`, falls back to "en".
 * Accepts a KV-like object with a `get` method.
 */
export async function getUserLang(
  userId: string,
  kvStore: { get: (key: string) => Promise<any> },
): Promise<Lang> {
  try {
    const user = await kvStore.get(`become:user:${userId}`);
    if (user?.language) return detectLang(user.language);
  } catch {
    // fallback
  }
  return "en";
}