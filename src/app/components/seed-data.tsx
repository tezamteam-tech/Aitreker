// =============================================
// Proper Food AI — Seed Data: "7-day Focus" Program
// This mirrors what prisma/seed.ts would insert.
// =============================================

import type { Program, ProgramDay, User, Progress, Wallet, Challenge, ChallengeMember } from './types';

export const SEED_PROGRAM: Program = {
  id: 'prog_7day_focus',
  code: '7DAY_FOCUS',
  title: '7-Day Focus',
  durationDays: 7,
  isActive: true,
};

export const SEED_DAYS: ProgramDay[] = [
  {
    id: 'day_1',
    programId: 'prog_7day_focus',
    dayNumber: 1,
    title: 'Set Your Intention',
    description: 'Begin with clarity. Define what focus means to you and set a powerful intention for the week ahead.',
    tasksJson: [
      { id: 't1_1', title: 'Morning Breath Work', description: 'Take 5 minutes of box breathing (4-4-4-4) to center yourself.', type: 'mindfulness', emoji: '\uD83E\uDEC1' },
      { id: 't1_2', title: 'Write Your Focus Statement', description: 'In 1-2 sentences, write what you want to achieve this week and why it matters.', type: 'action', emoji: '\u270D\uFE0F' },
      { id: 't1_3', title: 'Evening Reflection', description: 'How did it feel to set an intention? What resistance came up?', type: 'reflection', emoji: '\uD83C\uDF19' },
    ],
  },
  {
    id: 'day_2',
    programId: 'prog_7day_focus',
    dayNumber: 2,
    title: 'Eliminate Noise',
    description: 'Identify your top 3 distractions and create barriers against them.',
    tasksJson: [
      { id: 't2_1', title: 'Digital Detox Hour', description: 'Turn off all non-essential notifications for 1 hour and observe what happens.', type: 'action', emoji: '\uD83D\uDCF5' },
      { id: 't2_2', title: 'List Your Distractions', description: 'Write down the top 3 things that pull your attention away from what matters.', type: 'action', emoji: '\uD83D\uDCDD' },
      { id: 't2_3', title: 'Silence Meditation', description: 'Sit in complete silence for 10 minutes. No music, no apps.', type: 'mindfulness', emoji: '\uD83E\uDDD8' },
    ],
  },
  {
    id: 'day_3',
    programId: 'prog_7day_focus',
    dayNumber: 3,
    title: 'Deep Work Sprint',
    description: 'Practice sustained attention with a 90-minute deep work block.',
    tasksJson: [
      { id: 't3_1', title: '90-Minute Focus Block', description: 'Choose your most important task and work on it uninterrupted for 90 minutes.', type: 'action', emoji: '\u26A1' },
      { id: 't3_2', title: 'Body Scan Break', description: 'After the sprint, do a 5-minute body scan to release accumulated tension.', type: 'mindfulness', emoji: '\uD83E\uDEC0' },
      { id: 't3_3', title: 'Rate Your Flow', description: 'On a scale of 1-10, how deeply did you enter flow? What helped or hindered?', type: 'reflection', emoji: '\uD83D\uDCCA' },
    ],
  },
  {
    id: 'day_4',
    programId: 'prog_7day_focus',
    dayNumber: 4,
    title: 'Mindful Transitions',
    description: 'Learn to be present between tasks, not just during them.',
    tasksJson: [
      { id: 't4_1', title: 'Transition Ritual', description: 'Before switching tasks, take 3 deep breaths and state what you\'re moving to.', type: 'action', emoji: '\uD83D\uDD04' },
      { id: 't4_2', title: 'Walking Meditation', description: 'Take a 15-minute walk with full attention on each step and breath.', type: 'mindfulness', emoji: '\uD83D\uDEB6' },
    ],
  },
  {
    id: 'day_5',
    programId: 'prog_7day_focus',
    dayNumber: 5,
    title: 'Energy Management',
    description: 'Map your energy throughout the day and align tasks with peak states.',
    tasksJson: [
      { id: 't5_1', title: 'Energy Audit', description: 'Track your energy level every 2 hours today. Note what fuels and drains you.', type: 'action', emoji: '\uD83D\uDD0B' },
      { id: 't5_2', title: 'Power Nap or Rest', description: 'Take a deliberate 20-minute rest in the afternoon. No screens.', type: 'mindfulness', emoji: '\uD83D\uDE34' },
      { id: 't5_3', title: 'Optimize Tomorrow', description: 'Based on today\'s audit, plan tomorrow with your hardest task at peak energy.', type: 'reflection', emoji: '\uD83D\uDCC6\uFE0F' },
    ],
  },
  {
    id: 'day_6',
    programId: 'prog_7day_focus',
    dayNumber: 6,
    title: 'Resist Multitasking',
    description: 'Practice single-tasking as an intentional discipline.',
    tasksJson: [
      { id: 't6_1', title: 'Single-Tab Challenge', description: 'Work with only one browser tab open at a time for the entire morning.', type: 'action', emoji: '\uD83D\uDDA5\uFE0F' },
      { id: 't6_2', title: 'Gratitude Pause', description: 'Stop 3 times today to appreciate one thing in your immediate environment.', type: 'mindfulness', emoji: '\uD83D\uDE4F' },
    ],
  },
  {
    id: 'day_7',
    programId: 'prog_7day_focus',
    dayNumber: 7,
    title: 'Integration & Commitment',
    description: 'Review the week, celebrate wins, and commit to carrying your focus forward.',
    tasksJson: [
      { id: 't7_1', title: 'Week Review Journal', description: 'Write a page reflecting on what changed this week. What was hardest? What surprised you?', type: 'reflection', emoji: '\uD83D\uDCD6' },
      { id: 't7_2', title: 'Commit to One Habit', description: 'Choose one practice from this week to continue daily for the next 30 days.', type: 'action', emoji: '\uD83D\uDC8E' },
      { id: 't7_3', title: 'Closing Meditation', description: 'End with a 10-minute gratitude meditation for the effort you put in this week.', type: 'mindfulness', emoji: '\u2728' },
    ],
  },
];

export const SEED_USER: User = {
  id: 'user_demo',
  telegramId: 123456789,
  firstName: 'Alex',
  lastName: 'K.',
  username: 'alexk_become',
  photoUrl: null,
  language: 'en',
  tone: 'supportive',
  selectedGoal: 'focus',
  xp: 42,
  dailyReminderTime: null,
  utcOffset: null,
  weighInDay: null,
  activeProgramId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const SEED_WALLET: Wallet = {
  id: 'wallet_demo',
  userId: 'user_demo',
  starsBalance: 150,
  tonBalance: 2.5,
};

export const SEED_PROGRESS: Progress[] = [
  { id: 'p1', userId: 'user_demo', programId: 'prog_7day_focus', dayNumber: 1, status: 'done', reflectionText: 'Great start!', metaJson: { completedTaskIds: ['t1_1','t1_2','t1_3'], xpEarned: 10 }, createdAt: new Date(Date.now() - 6 * 86400000).toISOString() },
  { id: 'p2', userId: 'user_demo', programId: 'prog_7day_focus', dayNumber: 2, status: 'done', reflectionText: 'Hard but worth it.', metaJson: { completedTaskIds: ['t2_1','t2_2','t2_3'], xpEarned: 10 }, createdAt: new Date(Date.now() - 5 * 86400000).toISOString() },
  { id: 'p3', userId: 'user_demo', programId: 'prog_7day_focus', dayNumber: 3, status: 'done', reflectionText: null, metaJson: { completedTaskIds: ['t3_1','t3_2','t3_3'], xpEarned: 10 }, createdAt: new Date(Date.now() - 4 * 86400000).toISOString() },
  { id: 'p4', userId: 'user_demo', programId: 'prog_7day_focus', dayNumber: 4, status: 'skip', reflectionText: null, metaJson: { completedTaskIds: [], xpEarned: 2 }, createdAt: new Date(Date.now() - 3 * 86400000).toISOString() },
  { id: 'p5', userId: 'user_demo', programId: 'prog_7day_focus', dayNumber: 5, status: 'done', reflectionText: 'Energy mapping changed everything.', metaJson: { completedTaskIds: ['t5_1','t5_2','t5_3'], xpEarned: 10 }, createdAt: new Date(Date.now() - 2 * 86400000).toISOString() },
];

export const SEED_CHALLENGES: Challenge[] = [
  {
    id: 'ch_contract_1',
    ownerId: 'user_demo',
    ownerName: 'Alex K.',
    type: 'contract',
    title: '7-Day Focus Contract',
    depositAmount: 50,
    currency: 'stars',
    durationDays: 7,
    startAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    endAt: new Date(Date.now() + 4 * 86400000).toISOString(),
    rulesText: 'Complete at least 5 out of 7 days to get your deposit back.',
    status: 'active',
    programId: 'prog_7day_focus',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: 'ch_pool_1',
    ownerId: 'user_other',
    ownerName: 'Sam L.',
    type: 'pool',
    title: 'Team Focus Sprint',
    depositAmount: 100,
    currency: 'stars',
    durationDays: 7,
    startAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    endAt: new Date(Date.now() + 6 * 86400000).toISOString(),
    rulesText: 'Everyone commits 100 Stars. Those who finish 7/7 days split the pool.',
    status: 'active',
    programId: 'prog_7day_focus',
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
];

export const SEED_CHALLENGE_MEMBERS: ChallengeMember[] = [
  { id: 'cm_1', challengeId: 'ch_contract_1', userId: 'user_demo', userName: 'Alex K.', deposited: true, status: 'active', joinedAt: new Date(Date.now() - 3 * 86400000).toISOString(), doneDays: 3, streak: 2, todayStatus: 'done' },
  { id: 'cm_2', challengeId: 'ch_pool_1', userId: 'user_other', userName: 'Sam L.', deposited: true, status: 'active', joinedAt: new Date(Date.now() - 1 * 86400000).toISOString(), doneDays: 1, streak: 1, todayStatus: 'done' },
  { id: 'cm_3', challengeId: 'ch_pool_1', userId: 'user_third', userName: 'Mia R.', deposited: true, status: 'active', joinedAt: new Date(Date.now() - 1 * 86400000).toISOString(), doneDays: 1, streak: 1, todayStatus: 'pending' },
];