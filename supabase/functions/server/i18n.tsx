// =============================================
// Proper Food AI — Internationalization (i18n)
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
    en: "Welcome to Proper Food AI, {name}!",
    ru: "Добро пожаловать в Proper Food AI, {name}!",
  },
  welcome_subtitle: {
    en: "Your personal development companion.",
    ru: "Твой личный помощник в развитии.",
  },
  welcome_desc: {
    en: "Build lasting habits through AI-powered programs from 7 to 100 days.",
    ru: "Создавай устойчивые привычки с помощью AI-программ от 7 до 100 дней.",
  },
  welcome_how: {
    en: "How it works:",
    ru: "Как это работает:",
  },
  welcome_step1: {
    en: "1. Share your contact to get started",
    ru: "1. Поделись контактом, чтобы начать",
  },
  welcome_step2: {
    en: "2. Complete daily tasks in your program",
    ru: "2. Выполняй ежедневные задания в программе",
  },
  welcome_step3: {
    en: "3. Get personalized AI coaching",
    ru: "3. Получай персонализированный AI-коучинг",
  },
  welcome_step4: {
    en: "4. Join challenges with others",
    ru: "4. Участвуй в челленджах с другими",
  },
  welcome_cta: {
    en: "Tap the button below to share your contact and get started!",
    ru: "Нажми кнопку ниже, чтобы поделиться контактом и начать!",
  },
  welcome_returning: {
    en: "Welcome back, {name}! Open the app to continue your journey.",
    ru: "С возвращением, {name}! Открой приложение, чтобы продолжить.",
  },

  // === Contact shared ===
  contact_success_title: {
    en: "You're all set, {name}!",
    ru: "Всё готово, {name}!",
  },
  contact_success_body: {
    en: "Your account has been created. Open the app to start your first program!",
    ru: "Твой аккаунт создан. Открой приложение, чтобы начать первую программу!",
  },
  contact_features: {
    en: "What awaits you:",
    ru: "Что тебя ждёт:",
  },
  contact_f1: {
    en: "Programs from 7 to 100 days with daily tasks",
    ru: "Программы от 7 до 100 дней с ежедневными заданиями",
  },
  contact_f2: {
    en: "AI Coach for personalized guidance",
    ru: "AI-коуч для персонализированного руководства",
  },
  contact_f3: {
    en: "Challenges & competitions with friends",
    ru: "Челленджи и соревнования с друзьями",
  },
  contact_f4: {
    en: "Push notifications & progress tracking",
    ru: "Уведомления и отслеживание прогресса",
  },

  // === Reply keyboard buttons ===
  btn_share_contact: {
    en: "\u{1F4F2} Share Contact",
    ru: "\u{1F4F2} Поделиться контактом",
  },
  btn_open_app: {
    en: "\u{1F3AF} Open Proper Food",
    ru: "\u{1F3AF} Открыть Proper Food",
  },
  btn_progress: {
    en: "\u{1F4CA} My Progress",
    ru: "\u{1F4CA} Мой прогресс",
  },
  btn_today_tasks: {
    en: "\u{1F4CB} Today's Tasks",
    ru: "\u{1F4CB} Задания на сегодня",
  },
  btn_coach: {
    en: "\u{1F916} Ask Coach",
    ru: "\u{1F916} AI-коуч",
  },
  btn_challenges: {
    en: "\u{1F3C6} Challenges",
    ru: "\u{1F3C6} Челленджи",
  },
  btn_settings: {
    en: "\u{2699}\u{FE0F} Settings",
    ru: "\u{2699}\u{FE0F} Настройки",
  },
  btn_help: {
    en: "\u{2753} Help",
    ru: "\u{2753} Помощь",
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
    ru: "\u{1F3AF} Продолжить",
  },
  btn_start_day: {
    en: "\u{1F3AF} Start Day {n}",
    ru: "\u{1F3AF} Начать день {n}",
  },
  btn_view_tasks: {
    en: "\u{1F4CB} View Tasks",
    ru: "\u{1F4CB} Задания",
  },
  btn_start_now: {
    en: "\u{1F3AF} Start Now",
    ru: "\u{1F3AF} Начать сейчас",
  },
  btn_keep_going: {
    en: "\u{1F3AF} Keep Going",
    ru: "\u{1F3AF} Продолжай",
  },
  btn_next_program: {
    en: "\u{1F680} Start Next Program",
    ru: "\u{1F680} Следующая программа",
  },
  btn_view_challenge: {
    en: "\u{1F3C6} View Challenge",
    ru: "\u{1F3C6} Просмотреть челлендж",
  },
  btn_join_challenge: {
    en: "\u{1F3C6} Join a Challenge",
    ru: "\u{1F3C6} Присоединиться к челленджу",
  },
  btn_try_tomorrow: {
    en: "\u{1F3AF} Try Again Tomorrow",
    ru: "\u{1F3AF} Попробовать завтра",
  },
  btn_tomorrow_tasks: {
    en: "\u{1F4CB} Tomorrow's Tasks",
    ru: "\u{1F4CB} Задания на завтра",
  },

  // === Notifications ===
  notif_day_done: {
    en: "Day {n} completed!",
    ru: "День {n} завершён!",
  },
  notif_day_skip: {
    en: "Day {n} skipped",
    ru: "День {n} пропущен",
  },
  notif_xp: {
    en: "+{xp} XP (total: {total})",
    ru: "+{xp} XP (всего: {total})",
  },
  notif_streak: {
    en: "{n}-day streak!",
    ru: "{n} дней подряд!",
  },
  notif_skip_ok: {
    en: "It's okay to take a break. Come back tomorrow!",
    ru: "Ничего, если пропустишь. Возвращайся завтра!",
  },
  notif_program_done: {
    en: "Program complete! Congratulations!",
    ru: "Программа завершена! Поздравляем!",
  },
  notif_streak_title: {
    en: "{n}-Day Streak!",
    ru: "Серия {n} дней!",
  },
  notif_streak_body: {
    en: "You've been consistent for {n} days straight.\nThat's not luck \u2014 that's discipline becoming identity.",
    ru: "Ты был последователен {n} дней подряд.\nЭто не удача \u2014 это дисциплина, становящаяся частью тебя.",
  },
  notif_program_complete_title: {
    en: "Program Complete!",
    ru: "Программа завершена!",
  },
  notif_program_complete_body: {
    en: "You finished \"{title}\"",
    ru: "Ты завершил \"{title}\"",
  },
  notif_program_results: {
    en: "Results:",
    ru: "Результаты:",
  },
  notif_program_completed_days: {
    en: "{done}/{total} days completed ({pct}%)",
    ru: "{done}/{total} дней завершено ({pct}%)",
  },
  notif_program_xp: {
    en: "{xp} total XP earned",
    ru: "{xp} XP заработано",
  },
  notif_program_outro: {
    en: "What you've built in {n} days is real.\nReady for the next program?",
    ru: "То, что ты построил за {n} дней, реальность.\nГотов к следующей программе?",
  },
  notif_challenge_new_member: {
    en: "New challenger!",
    ru: "Новый участник!",
  },
  notif_challenge_member_body: {
    en: "<b>{name}</b> joined your challenge\n\"{title}\"",
    ru: "<b>{name}</b> присоединился к твоему челленджу\n\"{title}\"",
  },
  notif_challenge_members_count: {
    en: "{n} members now competing.",
    ru: "{n} участников сейчас соревнуются.",
  },
  notif_challenge_accepted: {
    en: "Challenge Accepted!",
    ru: "Челлендж принят!",
  },
  notif_challenge_joined_body: {
    en: "You joined \"{title}\"\nType: {type} \u2022 {days} days",
    ru: "Ты присоединился к \"{title}\"\nТип: {type} \u2022 {days} дней",
  },
  notif_challenge_stay: {
    en: "Stay consistent and show up every day.\nYour progress will be visible to other members.",
    ru: "Будь последователен и появляйся каждый день.\nТвой прогресс будет виден другим участникам.",
  },
  notif_daily_greetings: {
    en: "Rise and build.|New day, new chance.|Your future self is watching.|Small steps, big change.|Show up for yourself today.",
    ru: "Вставай и строй.|Новый день, новая возможность.|Твоя будущая версия наблюдает.|Маленькие шаги, большие изменения.|Появляйся для себя сегодня.",
  },
  notif_daily_tasks_waiting: {
    en: "{n} tasks waiting for you.",
    ru: "{n} заданий ждут тебя.",
  },
  notif_daily_open_app: {
    en: "Open the app to get started.",
    ru: "Открой приложение, чтобы начать.",
  },

  // === Welcome notification (from Mini App auth) ===
  notif_welcome_title: {
    en: "Welcome to Proper Food AI, {name}!",
    ru: "Добро пожаловать в Proper Food AI, {name}!",
  },
  notif_welcome_body: {
    en: "Your personal development journey starts now.",
    ru: "Твоя путь к развитию начинается сейчас.",
  },
  notif_welcome_f1: {
    en: "Your first program is ready",
    ru: "Твоя первая программа готова",
  },
  notif_welcome_f2: {
    en: "AI Coach will guide you after each day",
    ru: "AI-коуч будет помогать тебе после каждого дня",
  },
  notif_welcome_f3: {
    en: "Create or join challenges with friends",
    ru: "Создай или присоединись к челленджам с друзьями",
  },
  notif_welcome_f4: {
    en: "I'll send you reminders & progress updates",
    ru: "Я буду отправлять напоминания и обновления о прогрессе",
  },
  notif_welcome_open: {
    en: "Open the app to start Day 1!",
    ru: "Открой приложение, чтобы начать первый день!",
  },

  // === Challenge type labels ===
  challenge_solo: { en: "Solo", ru: "Соло" },
  challenge_contract: { en: "Commitment Contract", ru: "Контракт обязательств" },
  challenge_pool: { en: "Shared Path", ru: "Общий путь" },

  // === Challenge member day complete notifications ===
  notif_ch_member_day_title: {
    en: "{name} completed a day!",
    ru: "{name} завершил день!",
  },
  notif_ch_member_day_body: {
    en: "{name} completed day {day} in \"{title}\" ({pct}% done)",
    ru: "{name} завершил день {day} в \"{title}\" ({pct}%)",
  },
  notif_ch_member_streak: {
    en: "{name} is on a {n}-day streak!",
    ru: "{name} на серии {n} дней!",
  },
  notif_ch_member_cta: {
    en: "Don't fall behind \u2014 complete your day too!",
    ru: "Не отставайся \u2014 заверши свой день тоже!",
  },

  // === Misc ===
  not_started: {
    en: "You haven't started yet. Send /start to begin!",
    ru: "Ты ещё не начал. Отправь /start, чтобы начать!",
  },
  unknown_bot: {
    en: "I'm your Proper Food AI bot! Use the buttons below or try /start, /progress, /today, /help.",
    ru: "Я твой Proper Food AI бот! Используй кнопки ниже или попробуй /start, /progress, /today, /help.",
  },
  day_of: {
    en: "Day {cur} of {total}",
    ru: "День {cur} из {total}",
  },
  completed_days: {
    en: "Completed: <b>{n}/{total}</b> days",
    ru: "Завершено: <b>{n}/{total}</b> дней",
  },
  streak_label: {
    en: "Streak: <b>{n}</b> days",
    ru: "Серия: <b>{n}</b> дней",
  },
  skipped_label: {
    en: "Skipped: <b>{n}</b>",
    ru: "Пропущено: <b>{n}</b>",
  },
  open_app_complete: {
    en: "Open the app to complete your tasks and earn XP!",
    ru: "Открой приложение, чтобы завершить задания и заработать XP!",
  },
  todays_tasks: {
    en: "Today's tasks:",
    ru: "Задания на сегодня:",
  },

  // === Challenge expiring notifications ===
  notif_challenge_expiring_title: {
    en: "Challenge Ending Soon!",
    ru: "Челлендж скоро заканчивается!",
  },
  notif_challenge_expiring_body: {
    en: "Your challenge \"{title}\" ends in ~{hours}h. Make sure to complete today\u2019s tasks!",
    ru: "Твой челлендж \"{title}\" заканчивается через ~{hours} ч. Убедись, что завершишь задания на сегодня!",
  },
  notif_challenge_expiring_action: {
    en: "Complete your tasks now to secure your deposit!",
    ru: "Заверши задания сейчас, чтобы сохранить депозит!",
  },
  notif_challenge_expiring_btn: {
    en: "\u{1F3C3} Complete Tasks",
    ru: "\u{1F3C3} Выполнить",
  },

  // === Nutrition-specific notifications ===
  notif_food_logged: {
    en: "Food logged: {food} ({calories} cal)",
    ru: "Еда записана: {food} ({calories} ккал)",
  },
  notif_daily_calories_title: {
    en: "Daily Nutrition Summary",
    ru: "Итоги питания за день",
  },
  notif_daily_calories_body: {
    en: "You consumed {consumed} / {target} cal today.",
    ru: "Ты потребил {consumed} / {target} ккал сегодня.",
  },
  notif_daily_calories_over: {
    en: "You're {amount} cal over your target. Consider a lighter dinner!",
    ru: "Ты превысил норму на {amount} ккал. Подумай о лёгком ужине!",
  },
  notif_daily_calories_under: {
    en: "You're {amount} cal under your target. Don't forget to eat!",
    ru: "До нормы ещё {amount} ккал. Не забудь поесть!",
  },
  notif_daily_calories_perfect: {
    en: "Great job! You hit your calorie target today!",
    ru: "Отлично! Ты уложился в норму калорий сегодня!",
  },
  notif_meal_reminder_title: {
    en: "Time to eat!",
    ru: "Время поесть!",
  },
  notif_meal_reminder_breakfast: {
    en: "Don't skip breakfast — it's the most important meal!",
    ru: "Не пропускай завтрак — это самый важный приём пищи!",
  },
  notif_meal_reminder_lunch: {
    en: "Lunch time! Fuel up for the rest of the day.",
    ru: "Время обеда! Зарядись на остаток дня.",
  },
  notif_meal_reminder_dinner: {
    en: "Dinner time! Keep it balanced.",
    ru: "Время ужина! Ешь сбалансированно.",
  },
  notif_weight_logged: {
    en: "Weight logged: {weight} kg",
    ru: "Вес записан: {weight} кг",
  },
  notif_weight_trend: {
    en: "Your weight trend this week: {trend}",
    ru: "Динамика веса за неделю: {trend}",
  },
  notif_weight_trend_down: {
    en: "down {amount} kg — great progress!",
    ru: "минус {amount} кг — отличный прогресс!",
  },
  notif_weight_trend_up: {
    en: "up {amount} kg — stay on track!",
    ru: "плюс {amount} кг — держись курса!",
  },
  notif_weight_trend_stable: {
    en: "stable — consistency is key!",
    ru: "стабильно — постоянство это главное!",
  },
  notif_workout_reminder_title: {
    en: "Workout Time!",
    ru: "Время тренировки!",
  },
  notif_workout_reminder_body: {
    en: "Your workout plan for today is ready. Let's go!",
    ru: "План тренировки на сегодня готов. Вперёд!",
  },
  notif_scan_food_tip: {
    en: "Tip: Scan your meals with AI to track calories automatically!",
    ru: "Совет: Сканируй еду через AI для автоматического подсчёта калорий!",
  },

  // === Nutrition daily digest additions ===
  notif_nutrition_digest_title: {
    en: "Your Nutrition Digest",
    ru: "Дайджест по питанию",
  },
  notif_nutrition_digest_greeting: {
    en: "Good morning, {name}! Here's your nutrition plan for today.",
    ru: "Доброе утро, {name}! Вот твой план питания на сегодня.",
  },
  notif_nutrition_digest_target: {
    en: "Daily target: {calories} cal | P: {protein}g | C: {carbs}g | F: {fat}g",
    ru: "Норма на день: {calories} ккал | Б: {protein}г | У: {carbs}г | Ж: {fat}г",
  },

  // === Bot command responses ===
  cmd_today_nutrition: {
    en: "Today's nutrition:\nConsumed: {consumed} / {target} cal\nProtein: {protein}g | Carbs: {carbs}g | Fat: {fat}g",
    ru: "Питание на сегодня:\nПотреблено: {consumed} / {target} ккал\nБелки: {protein}г | Углеводы: {carbs}г | Жиры: {fat}г",
  },
  cmd_weight_status: {
    en: "Current weight: {weight} kg\nGoal: {goal}\nTrend: {trend}",
    ru: "Текущий вес: {weight} кг\nЦель: {goal}\nТренд: {trend}",
  },
  btn_scan_food: {
    en: "\u{1F4F7} Scan Food",
    ru: "\u{1F4F7} Сканировать еду",
  },
  btn_log_weight: {
    en: "\u{2696}\u{FE0F} Log Weight",
    ru: "\u{2696}\u{FE0F} Записать вес",
  },
  btn_meal_plan: {
    en: "\u{1F37D}\u{FE0F} Meal Plan",
    ru: "\u{1F37D}\u{FE0F} План питания",
  },
  btn_nutrition: {
    en: "\u{1F34E} Nutrition",
    ru: "\u{1F34E} Питание",
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