// =============================================
// Proper Food AI — Seed Data for "7-Day Focus" Program
// Bilingual (EN/RU). Stored in KV on first request.
// =============================================

import * as kv from "./kv_store.tsx";

const PROGRAM = {
  id: "prog_7day_focus",
  code: "7DAY_FOCUS",
  title: { en: "7-Day Focus", ru: "7 дней фокуса" },
  durationDays: 7,
  isActive: true,
};

const DAYS = [
  {
    id: "day_1",
    programId: "prog_7day_focus",
    dayNumber: 1,
    title: { en: "Set Your Intention", ru: "Задай намерение" },
    description: {
      en: "Begin with clarity. Define what focus means to you and set a powerful intention for the week ahead.",
      ru: "Начни с ясности. Определи, что значит фокус для тебя, и задай мощное намерение на неделю вперёд.",
    },
    tasksJson: [
      {
        id: "t1_1",
        title: { en: "Morning Breath Work", ru: "Утренняя дыхательная практика" },
        description: {
          en: "Take 5 minutes of box breathing (4-4-4-4) to center yourself.",
          ru: "Удели 5 минут дыханию по квадрату (4-4-4-4), чтобы сосредоточиться.",
        },
        type: "mindfulness",
        emoji: "\u{1FAC1}",
      },
      {
        id: "t1_2",
        title: { en: "Write Your Focus Statement", ru: "Напиши свою установку на фокус" },
        description: {
          en: "In 1-2 sentences, write what you want to achieve this week and why it matters.",
          ru: "В 1-2 предложениях напиши, чего ты хочешь достичь на этой неделе и почему это важно.",
        },
        type: "action",
        emoji: "\u270D\uFE0F",
      },
      {
        id: "t1_3",
        title: { en: "Evening Reflection", ru: "Вечерняя рефлексия" },
        description: {
          en: "How did it feel to set an intention? What resistance came up?",
          ru: "Каково это — задать намерение? Какое сопротивление возникло?",
        },
        type: "reflection",
        emoji: "\u{1F319}",
      },
    ],
  },
  {
    id: "day_2",
    programId: "prog_7day_focus",
    dayNumber: 2,
    title: { en: "Eliminate Noise", ru: "Убери шум" },
    description: {
      en: "Identify your top 3 distractions and create barriers against them.",
      ru: "Определи 3 главных отвлекающих фактора и создай барьеры против них.",
    },
    tasksJson: [
      {
        id: "t2_1",
        title: { en: "Digital Detox Hour", ru: "Час цифрового детокса" },
        description: {
          en: "Turn off all non-essential notifications for 1 hour and observe what happens.",
          ru: "Выключи все несущественные уведомления на 1 час и понаблюдай, что произойдёт.",
        },
        type: "action",
        emoji: "\u{1F4F5}",
      },
      {
        id: "t2_2",
        title: { en: "List Your Distractions", ru: "Составь список отвлечений" },
        description: {
          en: "Write down the top 3 things that pull your attention away from what matters.",
          ru: "Запиши 3 главные вещи, которые отвлекают твоё внимание от важного.",
        },
        type: "action",
        emoji: "\u{1F4DD}",
      },
      {
        id: "t2_3",
        title: { en: "Silence Meditation", ru: "Медитация тишины" },
        description: {
          en: "Sit in complete silence for 10 minutes. No music, no apps.",
          ru: "Посиди в полной тишине 10 минут. Без музыки, без приложений.",
        },
        type: "mindfulness",
        emoji: "\u{1F9D8}",
      },
    ],
  },
  {
    id: "day_3",
    programId: "prog_7day_focus",
    dayNumber: 3,
    title: { en: "Deep Work Sprint", ru: "Спринт глубокой работы" },
    description: {
      en: "Practice sustained attention with a 90-minute deep work block.",
      ru: "Практикуй устойчивое внимание в 90-минутном блоке глубокой работы.",
    },
    tasksJson: [
      {
        id: "t3_1",
        title: { en: "90-Minute Focus Block", ru: "90-минутный блок фокуса" },
        description: {
          en: "Choose your most important task and work on it uninterrupted for 90 minutes.",
          ru: "Выбери самую важную задачу и работай над ней без перерывов 90 минут.",
        },
        type: "action",
        emoji: "\u26A1",
      },
      {
        id: "t3_2",
        title: { en: "Body Scan Break", ru: "Перерыв: сканирование тела" },
        description: {
          en: "After the sprint, do a 5-minute body scan to release accumulated tension.",
          ru: "После спринта проведи 5-минутное сканирование тела, чтобы снять накопившееся напряжение.",
        },
        type: "mindfulness",
        emoji: "\u{1FAC0}",
      },
      {
        id: "t3_3",
        title: { en: "Rate Your Flow", ru: "Оцени свой поток" },
        description: {
          en: "On a scale of 1-10, how deeply did you enter flow? What helped or hindered?",
          ru: "По шкале 1-10, насколько глубоко ты вошёл в поток? Что помогло, а что помешало?",
        },
        type: "reflection",
        emoji: "\u{1F4CA}",
      },
    ],
  },
  {
    id: "day_4",
    programId: "prog_7day_focus",
    dayNumber: 4,
    title: { en: "Mindful Transitions", ru: "Осознанные переходы" },
    description: {
      en: "Learn to be present between tasks, not just during them.",
      ru: "Научись быть присутствующим между задачами, а не только во время них.",
    },
    tasksJson: [
      {
        id: "t4_1",
        title: { en: "Transition Ritual", ru: "Ритуал перехода" },
        description: {
          en: "Before switching tasks, take 3 deep breaths and state what you're moving to.",
          ru: "Перед сменой задач сделай 3 глубоких вдоха и скажи, к чему переходишь.",
        },
        type: "action",
        emoji: "\u{1F504}",
      },
      {
        id: "t4_2",
        title: { en: "Walking Meditation", ru: "Ходячая медитация" },
        description: {
          en: "Take a 15-minute walk with full attention on each step and breath.",
          ru: "Соверши 15-минутную прогулку с полным вниманием к каждому шагу и дыханию.",
        },
        type: "mindfulness",
        emoji: "\u{1F6B6}",
      },
    ],
  },
  {
    id: "day_5",
    programId: "prog_7day_focus",
    dayNumber: 5,
    title: { en: "Energy Management", ru: "Управление энергией" },
    description: {
      en: "Map your energy throughout the day and align tasks with peak states.",
      ru: "Отслеживай свою энергию в течение дня и выполняй задачи на пике.",
    },
    tasksJson: [
      {
        id: "t5_1",
        title: { en: "Energy Audit", ru: "Аудит энергии" },
        description: {
          en: "Track your energy level every 2 hours today. Note what fuels and drains you.",
          ru: "Отслеживай уровень энергии каждые 2 часа. Записывай, что заряжает и что истощает.",
        },
        type: "action",
        emoji: "\u{1F50B}",
      },
      {
        id: "t5_2",
        title: { en: "Power Nap or Rest", ru: "Сон или отдых" },
        description: {
          en: "Take a deliberate 20-minute rest in the afternoon. No screens.",
          ru: "Устрой осознанный 20-минутный отдых днём. Без экранов.",
        },
        type: "mindfulness",
        emoji: "\u{1F634}",
      },
      {
        id: "t5_3",
        title: { en: "Optimize Tomorrow", ru: "Оптимизируй завтра" },
        description: {
          en: "Based on today's audit, plan tomorrow with your hardest task at peak energy.",
          ru: "На основе сегодняшнего аудита спланируй завтрашний день: сложную задачу — на пик энергии.",
        },
        type: "reflection",
        emoji: "\u{1F5D3}\uFE0F",
      },
    ],
  },
  {
    id: "day_6",
    programId: "prog_7day_focus",
    dayNumber: 6,
    title: { en: "Resist Multitasking", ru: "Откажись от многозадачности" },
    description: {
      en: "Practice single-tasking as an intentional discipline.",
      ru: "Практикуй работу над одной задачей как осознанную дисциплину.",
    },
    tasksJson: [
      {
        id: "t6_1",
        title: { en: "Single-Tab Challenge", ru: "Челлендж одной вкладки" },
        description: {
          en: "Work with only one browser tab open at a time for the entire morning.",
          ru: "Работай только с одной вкладкой браузера всё утро.",
        },
        type: "action",
        emoji: "\u{1F5A5}\uFE0F",
      },
      {
        id: "t6_2",
        title: { en: "Gratitude Pause", ru: "Пауза благодарности" },
        description: {
          en: "Stop 3 times today to appreciate one thing in your immediate environment.",
          ru: "Останавливайся 3 раза за день, чтобы оценить что-то в окружении.",
        },
        type: "mindfulness",
        emoji: "\u{1F64F}",
      },
    ],
  },
  {
    id: "day_7",
    programId: "prog_7day_focus",
    dayNumber: 7,
    title: { en: "Integration & Commitment", ru: "Интеграция и обязательство" },
    description: {
      en: "Review the week, celebrate wins, and commit to carrying your focus forward.",
      ru: "Подведи итоги недели, отпразднуй победы и возьми обязательство сохранять фокус.",
    },
    tasksJson: [
      {
        id: "t7_1",
        title: { en: "Week Review Journal", ru: "Дневник итогов недели" },
        description: {
          en: "Write a page reflecting on what changed this week. What was hardest? What surprised you?",
          ru: "Напиши страницу о том, что изменилось за неделю. Что было сложнее всего? Что удивило?",
        },
        type: "reflection",
        emoji: "\u{1F4D6}",
      },
      {
        id: "t7_2",
        title: { en: "Commit to One Habit", ru: "Выбери одну привычку" },
        description: {
          en: "Choose one practice from this week to continue daily for the next 30 days.",
          ru: "Выбери одну практику из этой недели и продолжай её ежедневно следующие 30 дней.",
        },
        type: "action",
        emoji: "\u{1F48E}",
      },
      {
        id: "t7_3",
        title: { en: "Closing Meditation", ru: "Завершающая медитация" },
        description: {
          en: "End with a 10-minute gratitude meditation for the effort you put in this week.",
          ru: "Заверши 10-минутной медитацией благодарности за усилия, вложенные на этой неделе.",
        },
        type: "mindfulness",
        emoji: "\u2728",
      },
    ],
  },
];

// ---- Localization helper ----

type Translatable = string | { en: string; ru: string };

/**
 * Resolve a bilingual field to the correct language string.
 * If the field is already a plain string, return as-is (backward compat).
 */
function resolveField(field: Translatable, lang: string): string {
  if (typeof field === "string") return field;
  return field[lang as keyof typeof field] || field.en || "";
}

/**
 * Localize a full program object: resolves all bilingual title/description fields
 * to a single language, including nested tasks.
 */
export function localizeProgram(program: any, lang: string): any {
  return {
    ...program,
    title: resolveField(program.title, lang),
    days: program.days?.map((day: any) => localizeDay(day, lang)),
  };
}

/**
 * Localize a single day object.
 */
export function localizeDay(day: any, lang: string): any {
  return {
    ...day,
    title: resolveField(day.title, lang),
    description: resolveField(day.description, lang),
    tasksJson: day.tasksJson?.map((task: any) => ({
      ...task,
      title: resolveField(task.title, lang),
      description: resolveField(task.description, lang),
    })),
  };
}

/**
 * Idempotently seeds the 7-Day Focus program into KV store.
 * Checks a flag key before writing so it runs only once.
 * 
 * NOTE: After updating translations, bump the seed version to force re-seed.
 */
const SEED_VERSION = "v2_bilingual";

export async function ensureSeedData(): Promise<void> {
  try {
    const alreadySeeded = await kv.get("become:seeded");
    if (alreadySeeded === SEED_VERSION) {
      return;
    }

    console.log(`Seeding Proper Food AI program data (${SEED_VERSION})...`);

    // Store program
    await kv.set(`become:program:${PROGRAM.id}`, PROGRAM);

    // Store days
    const dayKeys: string[] = [];
    const dayValues: any[] = [];
    for (const day of DAYS) {
      dayKeys.push(`become:day:${day.programId}:${day.dayNumber}`);
      dayValues.push(day);
    }
    await kv.mset(dayKeys, dayValues);

    // Set seeded flag with version
    await kv.set("become:seeded", SEED_VERSION);

    console.log(`Seed complete (${SEED_VERSION}): 1 program, 7 days, bilingual EN/RU`);
  } catch (err) {
    console.log("Error seeding data:", err);
    // Don't throw — allow server to start even if seed fails
  }
}