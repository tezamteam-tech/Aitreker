// =============================================
// Proper Food AI — Shared Types (packages/shared)
// These types mirror Prisma models and are used
// across frontend and backend.
// =============================================

// ---------- User ----------
export interface User {
  id: string;
  telegramId: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
  language: string;
  tone: string;
  selectedGoal: string | null;
  xp: number;
  dailyReminderTime: string | null; // HH:MM local time, default "09:00"
  utcOffset: number | null; // minutes, e.g. 180 for UTC+3
  weighInDay: number | null; // 0=Sun, 1=Mon(default), ..., 6=Sat
  activeProgramId: string | null;
  subscriptionExpiresAt: string | null;
  referralCode: string | null;
  referralCount: number;
  referredBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------- Program ----------
export interface Program {
  id: string;
  code: string;
  title: string;
  durationDays: number;
  isActive: boolean;
  days?: ProgramDay[];
}

// ---------- ProgramDay ----------
export interface Task {
  id: string;
  title: string;
  description: string;
  type: 'action' | 'reflection' | 'mindfulness';
  emoji: string;
}

export interface ProgramDay {
  id: string;
  programId: string;
  dayNumber: number;
  title: string;
  description: string;
  tasksJson: Task[];
}

// ---------- Progress ----------
export type ProgressStatus = 'done' | 'skip' | 'pending';

export interface ProgressMeta {
  completedTaskIds: string[];
  xpEarned: number;
  proofPhotos?: Record<string, string>; // taskId → signed URL
}

export interface Progress {
  id: string;
  userId: string;
  programId: string;
  dayNumber: number;
  status: ProgressStatus;
  reflectionText: string | null;
  metaJson: ProgressMeta | null;
  createdAt: string;
}

// ---------- Progress Summary ----------
export interface ProgressSummary {
  doneDays: number;
  skippedDays: number;
  streak: number;
  xp: number;
  totalDays: number;
}

// ---------- Wallet ----------
export interface Wallet {
  id: string;
  userId: string;
  starsBalance: number;
  tonBalance: number;
  starsReserved: number;
  tonReserved: number;
}

// ---------- Challenge ----------
export type ChallengeType = 'solo' | 'contract' | 'pool';
export type ChallengeCurrency = 'stars' | 'ton';
export type ChallengeStatus = 'active' | 'completed' | 'cancelled' | 'settled';
export type ChallengeVisibility = 'open' | 'private';

export interface Challenge {
  id: string;
  ownerId: string;
  ownerName: string;
  type: ChallengeType;
  title: string;
  depositAmount: number;
  currency: ChallengeCurrency;
  durationDays: number;
  startAt: string;
  endAt: string;
  rulesText: string;
  status: ChallengeStatus;
  visibility: ChallengeVisibility;
  inviteCode: string | null;
  programId: string;
  createdAt: string;
}

export interface ChallengeMember {
  id: string;
  challengeId: string;
  userId: string;
  userName: string;
  deposited: boolean;
  depositAmount?: number;
  depositCurrency?: ChallengeCurrency;
  status: 'active' | 'completed' | 'left' | 'failed';
  joinedAt: string;
  // Progress snapshot (populated on detail view)
  doneDays?: number;
  streak?: number;
  todayStatus?: ProgressStatus;
  // Settlement result
  depositReturned?: boolean;
  penaltyAmount?: number;
}

export interface ChallengeWithMembers extends Challenge {
  members: ChallengeMember[];
  isMember: boolean;
  memberCount: number;
}

export interface CreateChallengeInput {
  type: ChallengeType;
  title: string;
  depositAmount: number;
  currency: ChallengeCurrency;
  durationDays: number;
  rulesText: string;
  programId: string;
  visibility: ChallengeVisibility;
}

// ---------- API ----------
export interface AuthResponse {
  user: User;
  token: string;
  deviceToken?: string;
}

export interface ApiError {
  message: string;
  code: string;
  status: number;
}

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
  version: string;
}

// ---------- AI Coach ----------
export interface CoachRequest {
  dayNumber: number;
  userTone: 'support' | 'strict' | 'hybrid';
  userGoal: string;
  reflectionText: string;
  completionStatus: 'done' | 'skip';
  /** Optional follow-up question from the user */
  userQuestion?: string;
  /** Previous coach response for context (follow-up mode) */
  previousResponse?: CoachResponse;
}

export interface CoachResponse {
  shortMessage: string;
  nextStep: string;
  reframe?: string;
}