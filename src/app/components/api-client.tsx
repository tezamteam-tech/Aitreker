// =============================================
// Proper Food AI — API Client Layer (Production)
// =============================================
// Typed HTTP client connecting to Supabase Edge Function backend.
// No mocks, no dev mode — all calls hit the real API.
//
// Auth architecture:
//   Authorization: Bearer {supabase_anon_key}  (for Supabase gateway)
//   X-Proper-Token: {session_token}            (for app-level auth)
// =============================================

import type {
  User,
  Program,
  ProgramDay,
  Progress,
  ProgressStatus,
  ProgressMeta,
  ProgressSummary,
  Wallet,
  AuthResponse,
  HealthResponse,
  ApiError,
  Challenge,
  ChallengeWithMembers,
  CreateChallengeInput,
  CoachRequest,
  CoachResponse,
} from './types';
import { projectId, publicAnonKey } from '/utils/supabase/info';

// Backend URL — Supabase Edge Function
const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-fc549837`;

// ---- Token storage ----
let accessToken: string | null = null;

export function setToken(token: string): void {
  accessToken = token;
  localStorage.setItem('proper_token', token);
}

export function getToken(): string | null {
  if (!accessToken) {
    accessToken = localStorage.getItem('proper_token');
  }
  return accessToken;
}

export function clearToken(): void {
  accessToken = null;
  localStorage.removeItem('proper_token');
}

// ---- Device token (long-lived, for session refresh) ----
export function setDeviceToken(token: string): void {
  localStorage.setItem('proper_device_token', token);
}

export function getDeviceToken(): string | null {
  return localStorage.getItem('proper_device_token');
}

export function clearDeviceToken(): void {
  localStorage.removeItem('proper_device_token');
}

// ---- HTTP helpers ----
class ApiClientError extends Error {
  status: number;
  code: string;

  constructor(err: ApiError) {
    super(err.message);
    this.status = err.status;
    this.code = err.code;
    this.name = 'ApiClientError';
  }
}

// ---- User language for content localization ----
// Initialize from browser lang so pre-auth UI renders correctly
let _userLang: string = (typeof navigator !== 'undefined' && navigator.language?.startsWith('ru')) ? 'ru' : 'en';
let _langListeners: Set<() => void> = new Set();

export function setUserLang(lang: string): void {
  const next = lang || 'en';
  if (next === _userLang) return;
  _userLang = next;
  // Notify subscribers (useSyncExternalStore in useTranslation)
  _langListeners.forEach((fn) => fn());
}

export function getUserLang(): string {
  return _userLang;
}

/** Subscribe to language changes — used by useSyncExternalStore in i18n.tsx */
export function subscribeLang(listener: () => void): () => void {
  _langListeners.add(listener);
  return () => { _langListeners.delete(listener); };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Supabase gateway always requires anon key
    'Authorization': `Bearer ${publicAnonKey}`,
  };

  // Pass our app session token as a custom header
  const token = getToken();
  if (token) {
    headers['X-Proper-Token'] = token;
  }

  // Guard: if no token and the endpoint requires auth, reject early
  // This prevents noisy 401 errors when auth hasn't completed yet
  const isAuthEndpoint = path.startsWith('/auth/') || path === '/health';
  if (!token && !isAuthEndpoint) {
    throw new ApiClientError({
      message: 'Not authenticated',
      code: 'NO_TOKEN',
      status: 401,
    });
  }

  const url = `${API_BASE}${path}`;
  console.log(`[API] ${method} ${url}`);

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({
      message: res.statusText,
      code: 'UNKNOWN',
      status: res.status,
    }));
    console.error(`[API] Error ${res.status}:`, err);
    throw new ApiClientError(err as ApiError);
  }

  return res.json();
}

// ---- API methods ----
export const api = {
  // Health check
  async health(): Promise<HealthResponse> {
    return request('GET', '/health');
  },

  // Telegram auth
  async authTelegram(initData: string, startParam?: string): Promise<AuthResponse> {
    const res = await request<AuthResponse>('POST', '/auth/telegram', { initData, startParam: startParam || undefined });
    setToken(res.token);
    return res;
  },

  // Bot-token auth — for environments without Telegram initData
  async authBotToken(botToken: string): Promise<AuthResponse> {
    const res = await request<AuthResponse>('POST', '/auth/bot-token', { token: botToken });
    setToken(res.token);
    return res;
  },

  // Get current user
  async me(): Promise<User> {
    return request('GET', '/me');
  },

  // Programs
  async getPrograms(): Promise<Program[]> {
    return request('GET', `/programs?lang=${_userLang}`);
  },

  // GET /programs/active — first active program with days
  async getActiveProgram(): Promise<Program | null> {
    try {
      return await request<Program>('GET', `/programs/active?lang=${_userLang}`);
    } catch (err: any) {
      // 404 means no active program — not an error
      if (err?.status === 404) return null;
      throw err;
    }
  },

  async getProgramDays(programId: string): Promise<ProgramDay[]> {
    return request('GET', `/programs/${programId}/days?lang=${_userLang}`);
  },

  // GET /programs/:id/days/:dayNumber — single day
  async getProgramDay(programId: string, dayNumber: number): Promise<ProgramDay | null> {
    try {
      return await request<ProgramDay>('GET', `/programs/${programId}/days/${dayNumber}?lang=${_userLang}`);
    } catch (err: any) {
      if (err?.status === 404) return null;
      throw err;
    }
  },

  // Progress
  async getProgress(): Promise<Progress[]> {
    return request('GET', '/progress');
  },

  // GET /progress/summary — computed stats
  async getProgressSummary(): Promise<ProgressSummary> {
    return request('GET', '/progress/summary');
  },

  // POST /progress — upsert by userId+programId+dayNumber
  async updateProgress(
    programId: string,
    dayNumber: number,
    status: ProgressStatus,
    reflectionText?: string,
    metaJson?: ProgressMeta
  ): Promise<{ progress: Progress; xpEarned: number; totalXp: number }> {
    return request('POST', '/progress', { programId, dayNumber, status, reflectionText, metaJson });
  },

  // Update reflection only
  async saveReflection(
    programId: string,
    dayNumber: number,
    reflectionText: string
  ): Promise<Progress> {
    return request('POST', '/progress/reflection', { programId, dayNumber, reflectionText });
  },

  // Wallet
  async getWallet(): Promise<Wallet> {
    return request('GET', '/wallet');
  },

  // Bonuses
  async getBonuses(): Promise<{
    subscription: { isActive: boolean; expiresAt: string | null; daysLeft: number };
    social: { telegram: { claimed: boolean }; instagram: { claimed: boolean } };
    referral: { code: string | null; count: number; rewardsGiven: number; nextRewardAt: number };
  }> {
    return request('GET', '/bonuses');
  },

  async claimSocialBonus(platform: 'telegram' | 'instagram'): Promise<{ success: boolean; newExpiresAt: string }> {
    return request('POST', '/bonuses/social-claim', { platform });
  },

  async registerReferral(referralCode: string): Promise<{ success: boolean }> {
    return request('POST', '/bonuses/referral-register', { referralCode });
  },

  // ---- Referrals ----

  /** Get full referral data: code, invited users, bonus days */
  async getReferrals(): Promise<{
    referral_code: string;
    referral_count: number;
    bonus_days_earned: number;
    invited_users: Array<{
      user_id: string;
      first_name: string;
      username: string | null;
      joined_at: string;
      is_subscribed: boolean;
      bonus_days_granted: number;
    }>;
  }> {
    return request('GET', '/referrals');
  },

  /** Grant bonus premium days when invited user subscribes */
  async grantReferralBonus(invitedUserId: string): Promise<{ success: boolean; bonus_days: number }> {
    return request('POST', '/referrals/grant-bonus', { invited_user_id: invitedUserId });
  },

  /** Get referral leaderboard (top referrers) */
  async getReferralLeaderboard(): Promise<{
    leaderboard: Array<{
      user_id: string;
      first_name: string;
      username: string | null;
      referral_count: number;
      bonus_days_earned: number;
      rank: number;
    }>;
    total_referrers: number;
    my_rank: number | null;
    my_stats: {
      user_id: string;
      first_name: string;
      username: string | null;
      referral_count: number;
      bonus_days_earned: number;
      rank: number;
    } | null;
  }> {
    return request('GET', '/referrals/leaderboard');
  },

  // Update user preferences
  async updateUser(partial: Partial<User>): Promise<User> {
    return request('PUT', '/me', partial);
  },

  // ---- Challenges ----

  async getChallenges(): Promise<ChallengeWithMembers[]> {
    return request('GET', '/challenges');
  },

  async getChallenge(challengeId: string): Promise<ChallengeWithMembers> {
    return request('GET', `/challenges/${challengeId}`);
  },

  async createChallenge(input: CreateChallengeInput): Promise<ChallengeWithMembers> {
    return request('POST', '/challenges', input);
  },

  async joinChallenge(challengeId: string, inviteCode?: string): Promise<ChallengeWithMembers> {
    return request('POST', `/challenges/${challengeId}/join`, inviteCode ? { inviteCode } : undefined);
  },

  async leaveChallenge(challengeId: string): Promise<ChallengeWithMembers> {
    return request('POST', `/challenges/${challengeId}/leave`);
  },

  async settleChallenge(challengeId: string): Promise<ChallengeWithMembers> {
    return request('POST', `/challenges/${challengeId}/settle`);
  },

  // AI Coach
  async askCoach(req: CoachRequest): Promise<CoachResponse> {
    return request('POST', '/ai/coach', req);
  },

  async getCoachHistory(): Promise<Array<CoachResponse & { dayNumber: number; completionStatus: string; createdAt: string }>> {
    return request('GET', '/ai/coach/history');
  },

  async askCoachFollowup(req: {
    dayNumber: number;
    userQuestion: string;
    previousResponse: CoachResponse;
  }): Promise<CoachResponse> {
    return request('POST', '/ai/coach/followup', req);
  },

  // Plan Builder
  async generatePlan(input: {
    userText: string;
    timePerDay: number;
    preferredTime: string;
    schedule: string;
  }): Promise<{ draftId: string; plan: any }> {
    return request('POST', '/ai/generate-plan', input);
  },

  async activatePlan(draftId: string): Promise<{ programId: string; program: any }> {
    return request('POST', '/ai/activate-plan', { draftId });
  },

  // Coach check-in: proactive motivational message based on progress
  async coachCheckin(): Promise<{ message: string; doneDays: number; skippedDays: number; streak: number; currentDay: number; totalDays: number }> {
    return request('POST', '/ai/coach-checkin');
  },

  // ---- Multi-step plan builder ----

  async planStep(input: {
    userText?: string;
    timePerDay?: number;
    preferredTime?: string;
    schedule?: string;
    durationDays?: number;
    draftId?: string;
    userResponse?: string;
  }): Promise<{
    draftId: string;
    type: 'questions' | 'plan';
    coachResponse?: string;
    questions?: string[];
    plan?: any;
    stepNumber: number;
    totalSteps: number;
  }> {
    return request('POST', '/ai/plan-step', input);
  },

  // Program history
  async getProgramHistory(): Promise<{ programs: any[]; activeProgramId: string }> {
    return request('GET', `/programs/history?lang=${_userLang}`);
  },

  // Plan drafts
  async getPlanDrafts(): Promise<{ drafts: any[] }> {
    return request('GET', '/ai/plan-drafts');
  },

  async getPlanDraft(draftId: string): Promise<{ draft: any }> {
    return request('GET', `/ai/plan-drafts/${draftId}`);
  },

  async deletePlanDraft(draftId: string): Promise<{ ok: boolean }> {
    return request('DELETE', `/ai/plan-drafts/${draftId}`);
  },

  // Switch active program
  async switchProgram(programId: string): Promise<{ success: boolean }> {
    return request('POST', '/programs/switch', { programId });
  },

  // Update task reminder time
  async updateTaskReminder(programId: string, dayNumber: number, taskId: string, reminderTime: string | null): Promise<{ success: boolean; taskId: string; reminderTime: string | null }> {
    return request('PUT', `/days/${programId}/${dayNumber}/task-reminder`, { taskId, reminderTime });
  },

  // Generate next 20-day block for 100-day plans (lazy generation)
  async generateNextBlock(programId: string): Promise<{ success: boolean; blockNumber: number; daysGenerated: number; fromDay: number; toDay: number; alreadyComplete?: boolean }> {
    return request('POST', '/ai/generate-next-block', { programId });
  },

  // ---- Task Proof Photos ----

  async uploadProof(
    programId: string,
    dayNumber: number,
    taskId: string,
    imageBase64: string,
    mimeType?: string
  ): Promise<{ success: boolean; taskId: string; signedUrl: string; filePath: string }> {
    return request('POST', '/progress/upload-proof', { programId, dayNumber, taskId, imageBase64, mimeType });
  },

  async getProofs(programId: string, dayNumber: number): Promise<{ proofs: Record<string, string> }> {
    return request('GET', `/progress/proofs/${programId}/${dayNumber}`);
  },

  // ---- Voice Transcription ----

  async transcribeAudio(
    audioBase64: string,
    language?: string,
    mimeType?: string
  ): Promise<{ text: string; language: string }> {
    return request('POST', '/ai/transcribe', { audioBase64, language, mimeType });
  },

  // ---- Telegram Bot Setup ----

  async setupTelegramBot(): Promise<{
    success: boolean;
    webhookUrl?: string;
    miniAppUrl?: string;
    message?: string;
  }> {
    return request('POST', '/telegram/setup');
  },

  async getWebhookInfo(): Promise<{
    success: boolean;
    url?: string;
    has_custom_certificate?: boolean;
    pending_update_count?: number;
    last_error_date?: number;
    last_error_message?: string;
    miniAppUrl?: string;
  }> {
    return request('GET', '/telegram/webhook-info');
  },

  async deleteWebhook(): Promise<{ success: boolean }> {
    return request('DELETE', '/telegram/webhook');
  },

  async forceResetWebhook(): Promise<{ success: boolean; webhookUrl?: string; message?: string }> {
    return request('POST', '/telegram/webhook/force-reset');
  },

  async sendBotNotification(
    telegramId: number,
    text: string,
    keyboard?: Array<Array<{ text: string; callback_data?: string; url?: string }>>
  ): Promise<{ success: boolean; messageId?: number }> {
    return request('POST', '/telegram/send-notification', { telegramId, text, keyboard });
  },

  // ---- Notification Preferences ----

  async getNotificationPrefs(): Promise<NotificationPrefs> {
    return request('GET', '/notifications/preferences');
  },

  async updateNotificationPrefs(prefs: Partial<NotificationPrefs>): Promise<NotificationPrefs> {
    return request('PUT', '/notifications/preferences', prefs);
  },

  async sendTestNotification(): Promise<{ success: boolean; type?: string }> {
    return request('POST', '/notifications/test');
  },

  // ---- Focus Timer ----

  async focusStart(durationMinutes: number, tag?: string): Promise<FocusSession> {
    return request('POST', '/focus/start', { durationMinutes, tag });
  },

  async focusStop(sessionId: string, completed: boolean): Promise<FocusSession> {
    return request('POST', '/focus/stop', { sessionId, completed });
  },

  async focusStopWithResult(sessionId: string, completed: boolean, resultText?: string): Promise<FocusStopResponse> {
    return request('POST', '/focus/stop', { sessionId, completed, resultText });
  },

  async focusUploadPhoto(sessionId: string, imageBase64: string, mimeType?: string): Promise<{ success: boolean; signedUrl: string; filePath: string }> {
    return request('POST', '/focus/upload-photo', { sessionId, imageBase64, mimeType });
  },

  async focusStats(): Promise<FocusStats> {
    return request('GET', '/focus/stats');
  },

  // ---- Notes / Journal ----

  async createNote(note: { type: 'quick' | 'reflection' | 'journal' | 'voice'; contentText?: string; contentAudioUrl?: string; relatedProgramId?: string; relatedDayNumber?: number }): Promise<Note> {
    return request('POST', '/notes', note);
  },

  async getNotes(params?: { type?: string; search?: string; limit?: number; offset?: number }): Promise<{ notes: Note[]; total: number }> {
    const q = new URLSearchParams();
    if (params?.type) q.set('type', params.type);
    if (params?.search) q.set('search', params.search);
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.offset) q.set('offset', String(params.offset));
    const qs = q.toString();
    return request('GET', `/notes${qs ? `?${qs}` : ''}`);
  },

  async deleteNote(noteId: string): Promise<{ success: boolean }> {
    return request('DELETE', `/notes/${noteId}`);
  },

  async uploadNoteAudio(audioBase64: string, mimeType?: string): Promise<{ success: boolean; signedUrl: string; filePath: string }> {
    return request('POST', '/notes/upload-audio', { audioBase64, mimeType });
  },

  // ---- Goals ----

  async createGoal(goal: { title: string; description?: string; targetDate?: string }): Promise<UserGoal> {
    return request('POST', '/goals', goal);
  },

  async getGoals(params?: { status?: string }): Promise<{ goals: UserGoal[] }> {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    const qs = q.toString();
    return request('GET', `/goals${qs ? `?${qs}` : ''}`);
  },

  async updateGoal(goalId: string, data: Partial<{ title: string; description: string; targetDate: string; status: string }>): Promise<UserGoal> {
    return request('PATCH', `/goals/${goalId}`, data);
  },

  // ---- Tasks ----

  async createTask(task: {
    title: string; description?: string; goalId?: string; dueDate?: string;
    estimatedMinutes?: number; reminderEnabled?: boolean; reminderTime?: string;
    reminderFrequency?: ReminderFrequency; reminderStartDate?: string;
    sourceNoteId?: string;
  }): Promise<UserTask> {
    return request('POST', '/tasks', task);
  },

  async getTasks(params?: { goalId?: string; status?: string }): Promise<{ tasks: UserTask[] }> {
    const q = new URLSearchParams();
    if (params?.goalId) q.set('goalId', params.goalId);
    if (params?.status) q.set('status', params.status);
    const qs = q.toString();
    return request('GET', `/tasks${qs ? `?${qs}` : ''}`);
  },

  async updateTask(taskId: string, data: Partial<{
    title: string; description: string; dueDate: string; estimatedMinutes: number;
    status: string; goalId: string; reminderEnabled: boolean; reminderTime: string;
    reminderFrequency: ReminderFrequency; reminderStartDate: string;
  }>): Promise<UserTask> {
    return request('PATCH', `/tasks/${taskId}`, data);
  },

  async deleteTask(taskId: string): Promise<{ success: boolean }> {
    return request('DELETE', `/tasks/${taskId}`);
  },

  async sendTaskReminder(taskId: string): Promise<{ success: boolean; sentAt: string }> {
    return request('POST', `/tasks/${taskId}/send-reminder`);
  },

  // ---- Strategic Goal Engine ----

  async strategicGoalInitiate(goalText: string, category?: string, imagePaths?: { visionImagePath?: string; selfieImagePath?: string }): Promise<StrategicInitiateResponse> {
    return request('POST', '/strategic-goals/initiate', { goalText, category, ...imagePaths });
  },

  async strategicGoalGeneratePlan(draftId: string, answers: Record<string, string>): Promise<StrategicPlanResponse> {
    return request('POST', '/strategic-goals/generate-plan', { draftId, answers });
  },

  async strategicGoalActivate(draftId: string): Promise<{ goal: StrategicGoal; tasks: StrategicTask[] }> {
    return request('POST', '/strategic-goals/activate', { draftId });
  },

  async getStrategicGoals(status?: string): Promise<{ goals: StrategicGoal[] }> {
    const q = status ? `?status=${status}` : '';
    return request('GET', `/strategic-goals${q}`);
  },

  async getStrategicGoal(id: string): Promise<{ goal: StrategicGoal; tasks: StrategicTask[] }> {
    return request('GET', `/strategic-goals/${id}`);
  },

  async updateStrategicGoal(id: string, data: { status?: string; title?: string }): Promise<StrategicGoal> {
    return request('PATCH', `/strategic-goals/${id}`, data);
  },

  async completeStrategicTask(taskId: string): Promise<StrategicTask> {
    return request('POST', `/strategic-tasks/${taskId}/complete`);
  },

  async requestStrategicReview(goalId: string): Promise<{ review: StrategicReview }> {
    return request('POST', `/strategic-goals/${goalId}/ai-review`);
  },

  async getStrategicReviews(goalId: string): Promise<{ reviews: StrategicReview[] }> {
    return request('GET', `/strategic-goals/${goalId}/reviews`);
  },

  async reorderStrategicTasks(goalId: string, taskIds: string[]): Promise<{ success: boolean }> {
    return request('POST', '/strategic-tasks/reorder', { goalId, taskIds });
  },

  async analyzeGoalImage(imageBase64: string, mode: 'vision' | 'selfie'): Promise<ImageAnalysisResponse> {
    return request('POST', '/strategic-goals/analyze-image', { imageBase64, mode });
  },

  async getGoalVisionImage(goalId: string): Promise<{ url: string | null }> {
    return request('GET', `/strategic-goals/${goalId}/vision-image`);
  },

  async selfieCheckin(goalId: string, imageBase64: string): Promise<SelfieCheckinResponse> {
    return request('POST', `/strategic-goals/${goalId}/selfie-checkin`, { imageBase64 });
  },

  async getGoalSelfies(goalId: string): Promise<{ selfies: SelfieRecord[] }> {
    return request('GET', `/strategic-goals/${goalId}/selfies`);
  },

  // ---- AI Coach Chat ----

  async coachChatSend(message: string, conversationId?: string): Promise<CoachChatResponse> {
    return request('POST', '/ai/coach/chat', { message, conversationId });
  },

  async coachChatGet(conversationId: string): Promise<CoachConversation> {
    return request('GET', `/ai/coach/chat/${conversationId}`);
  },

  async coachChatList(): Promise<{ conversations: CoachConversationSummary[] }> {
    return request('GET', '/ai/coach/conversations');
  },

  async coachChatDelete(conversationId: string): Promise<{ success: boolean }> {
    return request('DELETE', `/ai/coach/chat/${conversationId}`);
  },

  // ---- AI Nutrition Coach (RAG-enhanced) ----

  async nutriCoachSend(message: string, conversationId?: string): Promise<CoachChatResponse> {
    return request('POST', '/ai/nutrition-coach/chat', { message, conversationId });
  },

  async nutriCoachGet(conversationId: string): Promise<CoachConversation> {
    return request('GET', `/ai/nutrition-coach/chat/${conversationId}`);
  },

  async nutriCoachList(): Promise<{ conversations: CoachConversationSummary[] }> {
    return request('GET', '/ai/nutrition-coach/conversations');
  },

  async nutriCoachDelete(conversationId: string): Promise<{ success: boolean }> {
    return request('DELETE', `/ai/nutrition-coach/chat/${conversationId}`);
  },

  // ---- Weight Tracking ----

  async logWeight(weight: number, note?: string): Promise<{ success: boolean; entry: any }> {
    return request('POST', '/weight-log', { weight, note });
  },

  async getWeightHistory(limit?: number): Promise<{ entries: Array<{ id: string; weight: number; note: string | null; date: string; created_at: string }>; count: number }> {
    const q = limit ? `?limit=${limit}` : '';
    return request('GET', `/weight-log/history${q}`);
  },

  async deleteWeightEntry(entryId: string): Promise<{ success: boolean }> {
    return request('DELETE', `/weight-log/${entryId}`);
  },

  /** Check if user needs a weigh-in reminder (daily dedup, sends Telegram notification) */
  async checkWeighInReminder(): Promise<{ sent: boolean; reason?: string; daysSinceLast?: number }> {
    return request('POST', '/weight-log/check-reminder');
  },

  // ---- Journal Insights ----

  async generateJournalInsights(period?: string): Promise<{ insights: string }> {
    return request('POST', '/ai/journal-insights', { period });
  },

  // ---- Nutrition Onboarding Profile ----

  async saveUserProfile(profile: {
    gender: string;
    age: number;
    height: number;
    weight: number;
    activity_level: string;
    goal: string;
    daily_calorie_target?: number;
    bmr?: number;
    daily_maintenance_calories?: number;
    target_protein?: number;
    target_carbs?: number;
    target_fat?: number;
  }): Promise<{ success: boolean }> {
    return request('POST', '/user-profile', profile);
  },

  async getUserProfile(): Promise<{
    gender: string;
    age: number;
    height: number;
    weight: number;
    activity_level: string;
    goal: string;
    daily_calorie_target?: number;
    bmr?: number;
    daily_maintenance_calories?: number;
    target_protein?: number;
    target_carbs?: number;
    target_fat?: number;
    created_at: string;
  } | null> {
    try {
      return await request('GET', '/user-profile');
    } catch (err: any) {
      if (err?.status === 404) return null;
      throw err;
    }
  },

  // ---- Food Scanning & Entries ----

  /** AI body composition analysis — returns personalized calorie recommendation */
  async aiBodyAnalysis(params: {
    gender: string;
    age: number;
    height: number;
    weight: number;
    activityLevel: string;
    goal: string;
    imageBase64?: string;
    mimeType?: string;
    language?: string;
  }): Promise<{
    recommended_calories: number;
    recommended_protein: number;
    recommended_carbs: number;
    recommended_fat: number;
    bmr_estimate: number;
    tdee_estimate: number;
    body_fat_estimate: string | null;
    body_assessment: string;
    recommendation_reason: string;
    tips: string[];
  }> {
    return request('POST', '/nutrition/ai-body-analysis', params);
  },

  /** Get AI analysis history with usage info */
  async getAiAnalysisHistory(): Promise<{
    analyses: Array<{
      recommended_calories: number;
      recommended_protein: number;
      recommended_carbs: number;
      recommended_fat: number;
      bmr_estimate: number;
      tdee_estimate: number;
      body_fat_estimate: string | null;
      body_assessment: string;
      recommendation_reason: string;
      tips: string[];
      input: { gender: string; age: number; height: number; weight: number; activityLevel: string; goal: string; had_photo: boolean };
      created_at: string;
    }>;
    usage: {
      is_premium: boolean;
      used_this_week: number;
      limit: number | null;
      remaining: number | null;
    };
  }> {
    return request('GET', '/nutrition/ai-analysis-history');
  },

  /** Send food photo to AI for recognition (Edge Function → OpenAI Vision) */
  async scanFood(imageBase64: string, mimeType?: string): Promise<{
    food_name: string;
    estimated_calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }> {
    return request('POST', '/food/scan', { imageBase64, mimeType });
  },

  /** Save recognized food entry to food_entries table */
  async addFoodEntry(entry: {
    food_name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    meal_type?: string;
    image_base64?: string;
  }): Promise<{
    id: string;
    food_name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    image_url: string | null;
    meal_type: string;
    created_at: string;
  }> {
    return request('POST', '/food/entries', entry);
  },

  /** Get food entries for a date (default: today) */
  async getFoodEntries(date?: string): Promise<{
    entries: Array<{
      id: string;
      food_name: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      image_url: string | null;
      meal_type: string;
      created_at: string;
    }>;
    totals: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    };
  }> {
    const q = date ? `?date=${date}` : '';
    return request('GET', `/food/entries${q}`);
  },

  /** Delete a food entry */
  async deleteFoodEntry(entryId: string): Promise<{ success: boolean }> {
    return request('DELETE', `/food/entries/${entryId}`);
  },

  // ---- Meal Plan Generation ----

  /** Generate AI meal plan for N days */
  async generateMealPlan(input: {
    plan_length: 7 | 30 | 100;
    goal: string;
    daily_calories: number;
    gender: string;
    activity_level: string;
  }): Promise<{
    id: string;
    plan_length: number;
    plan_data: MealPlanData;
    created_at: string;
  }> {
    return request('POST', '/meal-plans/generate', input);
  },

  /** Get all saved meal plans */
  async getMealPlans(): Promise<{
    plans: Array<{
      id: string;
      plan_length: number;
      created_at: string;
      preview: string;
    }>;
  }> {
    return request('GET', '/meal-plans');
  },

  /** Get a single meal plan with full data */
  async getMealPlan(planId: string): Promise<{
    id: string;
    plan_length: number;
    plan_data: MealPlanData;
    created_at: string;
  }> {
    return request('GET', `/meal-plans/${planId}`);
  },

  /** Delete a meal plan */
  async deleteMealPlan(planId: string): Promise<{ success: boolean }> {
    return request('DELETE', `/meal-plans/${planId}`);
  },

  // ---- Workout Plan Generation ----

  /** Generate AI workout plan — with nutrition & body context */
  async generateWorkoutPlan(input: {
    plan_length: 7 | 30 | 100;
    workout_type: 'home' | 'gym';
    goal: string;
    gender: string;
    activity_level: string;
    // Body metrics (optional — enhances AI context)
    age?: number;
    height?: number;
    weight?: number;
    body_fat_estimate?: string;
    // Photo for AI body analysis (optional)
    imageBase64?: string;
    mimeType?: string;
    // Nutrition context (optional — links nutrition to workout)
    daily_calorie_target?: number;
    calories_consumed_today?: number;
    target_protein?: number;
    target_carbs?: number;
    target_fat?: number;
    has_meal_plan?: boolean;
    meal_plan_summary?: string;
    language?: string;
  }): Promise<{
    id: string;
    plan_length: number;
    workout_type: 'home' | 'gym';
    workout_data: WorkoutPlanData;
    created_at: string;
    nutrition_tips?: string[];
  }> {
    return request('POST', '/workout-plans/generate', input);
  },

  /** Get all saved workout plans */
  async getWorkoutPlans(): Promise<{
    plans: Array<{
      id: string;
      plan_length: number;
      workout_type: 'home' | 'gym';
      created_at: string;
      preview: string;
    }>;
  }> {
    return request('GET', '/workout-plans');
  },

  /** Get a single workout plan with full data */
  async getWorkoutPlan(planId: string): Promise<{
    id: string;
    plan_length: number;
    workout_type: 'home' | 'gym';
    workout_data: WorkoutPlanData;
    created_at: string;
  }> {
    return request('GET', `/workout-plans/${planId}`);
  },

  /** Delete a workout plan */
  async deleteWorkoutPlan(planId: string): Promise<{ success: boolean }> {
    return request('DELETE', `/workout-plans/${planId}`);
  },

  /** Get smart burn suggestions based on today's calorie surplus */
  async getSmartBurnSuggestions(input: {
    calories_surplus: number;
    gender: string;
    age: number;
    weight: number;
    activity_level: string;
    workout_type: 'home' | 'gym';
    language?: string;
  }): Promise<{
    surplus: number;
    suggestions: Array<{
      exercise_name: string;
      duration_minutes: number;
      estimated_calories_burn: number;
      intensity: 'light' | 'moderate' | 'high';
      emoji: string;
      description: string;
    }>;
    motivational_message: string;
  }> {
    return request('POST', '/workout/smart-burn', input);
  },

  // ---- SmartBurn Tracking ----

  /** Save a completed SmartBurn exercise */
  async completeSmartBurn(input: {
    exercise_name: string;
    calories_burned: number;
    duration_minutes: number;
    intensity: string;
    emoji: string;
  }): Promise<{
    id: string;
    daily_totals: { calories: number; duration: number; count: number };
  }> {
    return request('POST', '/smartburn/complete', input);
  },

  /** Get today's SmartBurn completions & totals */
  async getSmartBurnToday(): Promise<{
    entries: Array<{
      id: string;
      exercise_name: string;
      calories_burned: number;
      duration_minutes: number;
      intensity: string;
      emoji: string;
      date: string;
    }>;
    totals: { calories: number; duration: number; count: number };
    date: string;
  }> {
    return request('GET', '/smartburn/today');
  },

  /** Get SmartBurn history for the last N days */
  async getSmartBurnHistory(days: number = 7): Promise<{
    history: Array<{
      date: string;
      calories: number;
      duration: number;
      count: number;
    }>;
  }> {
    return request('GET', `/smartburn/history?days=${days}`);
  },

  // ---- Weekly Analytics ----

  /** Get 7-day nutrition + workout + smartburn correlation data */
  async getWeeklyAnalytics(): Promise<{
    days: Array<{
      date: string;
      day: string;
      consumed: number;
      target: number;
      burned: number;
      burned_smartburn: number;
      burned_workout: number;
      burned_count: number;
      burned_duration: number;
      net_balance: number;
      protein: number;
      carbs: number;
      fat: number;
    }>;
    summary: {
      total_consumed: number;
      total_burned: number;
      total_target: number;
      avg_consumed: number;
      avg_burned: number;
      days_over_target: number;
      days_under_target: number;
      best_burn_day: string;
      best_burn_calories: number;
      net_weekly: number;
      calorie_target: number;
    };
  }> {
    return request('GET', '/analytics/weekly');
  },

  /** Get extended analytics for 30 or 90 day periods */
  async getExtendedAnalytics(period: 30 | 90 = 30): Promise<{
    daily: Array<{
      date: string;
      consumed: number;
      target: number;
      burned_smartburn: number;
      burned_workout: number;
      burned_total: number;
      net_balance: number;
      protein: number;
      carbs: number;
      fat: number;
      has_food: boolean;
      has_workout: boolean;
    }>;
    weeks: Array<{
      week: number;
      start: string;
      end: string;
      label: string;
      avg_consumed: number;
      avg_burned: number;
      total_consumed: number;
      total_burned: number;
      net_balance: number;
      days_tracked: number;
      days_with_workout: number;
      avg_protein: number;
      avg_carbs: number;
      avg_fat: number;
    }>;
    trends: {
      consumed_change: number;
      burned_change: number;
      net_change: number;
      workout_frequency_change: number;
    };
    summary: {
      period: number;
      active_days: number;
      total_consumed: number;
      total_burned: number;
      total_smartburn: number;
      total_workout: number;
      avg_daily_consumed: number;
      avg_daily_burned: number;
      calorie_target: number;
      net_total: number;
      workout_days: number;
    };
  }> {
    return request('GET', `/analytics/extended?period=${period}`);
  },

  /** Log a completed workout day */
  async logWorkoutCompletion(input: {
    plan_id: string;
    day_number: number;
    workout_name?: string;
    duration_minutes?: number;
    calories_burned?: number;
    exercises_completed?: number;
  }): Promise<{ success: boolean; log: any }> {
    return request('POST', '/workout/log-completion', input);
  },

  /** Get recent workout completions */
  async getWorkoutCompletions(days: number = 7): Promise<{
    completions: Array<{
      date: string;
      calories: number;
      duration: number;
      count: number;
    }>;
  }> {
    return request('GET', `/workout/completions?days=${days}`);
  },

  // ---- Subscription / Payment ----

  async getSubscriptionStatus(): Promise<{
    isActive: boolean;
    expiresAt: string | null;
    daysLeft: number;
    isAdmin: boolean;
  }> {
    return request('GET', '/subscription/status');
  },

  /** Get freemium usage limits and current counts */
  async getUsage(): Promise<{
    is_premium: boolean;
    scans: { used: number; limit: number | null; remaining: number | null };
    meal_plans: { used: number; limit: number | null; remaining: number | null };
    workout_plans: { advanced: boolean };
  }> {
    return request('GET', '/subscription/usage');
  },

  async createInvoice(plan: '30' | '60' | '90'): Promise<{
    success: boolean;
    sentToChat: boolean;
    plan: string;
    stars: number;
    days: number;
  }> {
    return request('POST', '/subscription/create-invoice', { plan });
  },

  async createInvoiceLink(plan: '30' | '60' | '90'): Promise<{
    success: boolean;
    invoiceLink: string;
    plan: string;
    stars: number;
    days: number;
  }> {
    return request('POST', '/subscription/create-invoice-link', { plan });
  },

  async activateSubscription(plan: '30' | '60' | '90', stars: number): Promise<{
    success: boolean;
    alreadyActive: boolean;
    expiresAt: string;
    daysAdded: number;
  }> {
    return request('POST', '/subscription/activate', { plan, stars });
  },

  /** Restore purchase — re-activate subscription if valid payment exists but sub is inactive */
  async restorePurchase(): Promise<{
    success: boolean;
    restored: boolean;
    expiresAt: string | null;
    daysLeft: number;
    message: string;
  }> {
    return request('POST', '/subscription/restore');
  },

  /** Check subscription expiry and send Telegram reminder if ≤3 days left (deduped daily) */
  async checkExpiryReminder(): Promise<{
    sent: boolean;
    daysLeft: number;
  }> {
    return request('POST', '/subscription/check-expiry-reminder');
  },

  async createTonInvoice(plan: '30' | '60' | '90'): Promise<{
    invoiceUrl: string;
    plan: string;
    tonAmount: number;
    days: number;
  }> {
    return request('POST', '/subscription/create-ton-invoice', { plan });
  },

  async getPaymentHistory(): Promise<{
    payments: Array<{
      id: string;
      currency: string;
      amount: number;
      daysAdded: number;
      createdAt: string;
      payload?: string;
      type?: string;
    }>;
  }> {
    return request('GET', '/wallet/payments');
  },

  async getTransactions(): Promise<{
    transactions: Array<{
      id: string;
      userId: string;
      type: string;
      amount: number;
      currency: string;
      challengeId?: string;
      challengeTitle?: string;
      description?: string;
      createdAt: string;
    }>;
  }> {
    return request('GET', '/wallet/transactions');
  },

  // ---- Wallet Top-Up & Balance Payment ----

  async topupStars(amount: number): Promise<{ success: boolean; sentToChat: boolean; amount: number }> {
    return request('POST', '/wallet/topup-stars', { amount });
  },

  async topupTon(amount: number): Promise<{ success: boolean; sentToChat: boolean; amount: number }> {
    return request('POST', '/wallet/topup-ton', { amount });
  },

  async getTonAddress(): Promise<{ address: string }> {
    return request('GET', '/wallet/ton-address');
  },

  async paySubscriptionFromBalance(plan: '30' | '60' | '90', currency: 'stars' | 'ton'): Promise<{
    success: boolean;
    daysAdded: number;
    newExpiry: string;
    newBalance: number;
  }> {
    return request('POST', '/wallet/pay-subscription', { plan, currency });
  },

  // ---- Admin ----

  async adminGetUsers(params?: { search?: string; page?: number; limit?: number; filter?: string }): Promise<{
    users: AdminUser[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.filter) q.set('filter', params.filter);
    const qs = q.toString();
    return request('GET', `/admin/users${qs ? `?${qs}` : ''}`);
  },

  async adminUpdateSubscription(userId: string, action: 'grant' | 'revoke', days?: number): Promise<{
    success: boolean;
    subscriptionExpiresAt: string;
    action: string;
    days?: number;
  }> {
    return request('POST', '/admin/subscription', { userId, action, days });
  },

  async adminBroadcast(params: {
    text: string;
    audience: 'all' | 'subscribers' | 'non_subscribers';
    mediaType?: 'photo' | 'photos' | 'video' | null;
    mediaUrls?: string[];
  }): Promise<{
    success: boolean;
    broadcastId: string;
    sent: number;
    failed: number;
    total: number;
    errors: string[];
  }> {
    return request('POST', '/admin/broadcast', params);
  },

  async adminGetStats(): Promise<{
    totalUsers: number;
    activeSubscribers: number;
    expiredSubscribers: number;
    newToday: number;
    totalReferrals: number;
  }> {
    return request('GET', '/admin/stats');
  },

  // ---- Admin: Send notification to a user ----
  async adminSendNotification(userId: string, text: string): Promise<{ success: boolean; messageId?: number; error?: string }> {
    // Get user telegramId first, then send via bot
    return request('POST', '/telegram/send-notification', { userId, text });
  },

  // ---- Admin: Credit wallet ----
  async adminCreditWallet(userId: string, currency: 'stars' | 'ton', amount: number): Promise<{
    success: boolean;
    starsBalance: number;
    tonBalance: number;
  }> {
    return request('POST', '/admin/credit-wallet', { userId, currency, amount });
  },

  // ---- Admin: Get user wallet ----
  async adminGetUserWallet(userId: string): Promise<{
    starsBalance: number;
    tonBalance: number;
    starsReserved: number;
    tonReserved: number;
  }> {
    return request('GET', `/admin/user-wallet?userId=${encodeURIComponent(userId)}`);
  },

  // ---- Admin: Delete user completely ----
  async adminDeleteUser(userId: string): Promise<{
    success: boolean;
    deletedKeys: number;
    errors?: string[];
    user: { id: string; telegramId: string; displayName: string };
  }> {
    return request('DELETE', '/admin/delete-user', { userId });
  },

  // ---- Phone Auth: Request code ----
  async authPhoneRequest(phone: string): Promise<{ success: boolean }> {
    return request('POST', '/auth/phone-request', { phone });
  },

  // ---- Phone Auth: Verify code ----
  async authPhoneVerify(phone: string, code: string): Promise<AuthResponse> {
    const res = await request<AuthResponse>('POST', '/auth/phone-verify', { phone, code });
    setToken(res.token);
    return res;
  },

  // ---- Nutrition Streak ----

  /** Get current nutrition tracking streak and pending milestone */
  async getNutritionStreak(): Promise<{ streak: number; pending_milestone: number | null }> {
    return request('GET', '/streak/nutrition');
  },

  /** Mark a streak milestone as shown (so share card won't appear again) */
  async markMilestoneShown(milestone: number): Promise<{ success: boolean }> {
    return request('POST', '/streak/milestone-shown', { milestone });
  },

  // ---- Auth: Refresh session via device token ----
  async authRefresh(deviceToken: string): Promise<AuthResponse> {
    const res = await request<AuthResponse>('POST', '/auth/refresh', { deviceToken });
    setToken(res.token);
    return res;
  },

  // ---- Web Auth: Login via Telegram Bot (for web users) ----
  async webAuthInit(): Promise<{ code: string; botLink: string }> {
    return request('POST', '/auth/web-init', {});
  },

  async webAuthCheck(code: string): Promise<{
    status: 'pending' | 'confirmed' | 'expired' | 'error';
    token?: string;
    deviceToken?: string;
    user?: any;
  }> {
    // This is an auth endpoint — needs to bypass the token guard
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    };
    const url = `${API_BASE}/auth/web-check/${encodeURIComponent(code)}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      return { status: 'error' };
    }
    const data = await res.json();
    if (data.status === 'confirmed' && data.token) {
      setToken(data.token);
      if (data.deviceToken) setDeviceToken(data.deviceToken);
    }
    return data;
  },
};

// ---- Notification Preferences type ----
export interface NotificationPrefs {
  enabled: boolean;
  dayComplete: boolean;
  streakMilestones: boolean;
  challengeUpdates: boolean;
  dailyReminder: boolean;
  coachTips: boolean;
}

export interface FocusSession {
  id: string;
  userId: string;
  durationMinutes: number;
  startedAt: string;
  endedAt: string | null;
  status: 'active' | 'completed' | 'stopped';
  tag: string | null;
  resultText?: string;
  photoPath?: string;
  createdAt: string;
}

export interface FocusStopResponse extends FocusSession {
  xpEarned: number;
  totalXp: number;
  streak: number;
}

export interface FocusStats {
  totalSessions: number;
  totalMinutes: number;
  last7days: { sessions: number; minutes: number };
  last30days: { sessions: number; minutes: number };
  streak: number;
  totalXpEarned: number;
}

export interface Note {
  id: string;
  userId: string;
  type: 'quick' | 'reflection' | 'journal' | 'voice';
  contentText: string;
  contentAudioUrl: string | null;
  relatedProgramId: string | null;
  relatedDayNumber: number | null;
  createdAt: string;
}

export interface UserGoal {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  targetDate: string | null;
  status: 'active' | 'done' | 'archived';
  taskCount: number;
  tasksDone: number;
  createdAt: string;
  updatedAt: string;
}

export type ReminderFrequency = 'once' | 'daily' | 'weekdays';

export interface UserTask {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  goalId: string | null;
  dueDate: string | null;
  estimatedMinutes: number | null;
  status: 'todo' | 'done';
  reminderEnabled: boolean;
  reminderTime: string | null;        // "HH:mm"
  reminderFrequency: ReminderFrequency; // "once" | "daily" | "weekdays"
  reminderStartDate: string | null;   // "YYYY-MM-DD"
  nextReminderAt: string | null;      // ISO — when next notification fires
  lastReminderSentAt: string | null;
  sourceNoteId: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StrategicInitiateResponse {
  draftId: string;
  coachIntro: string;
  questions: Array<{ id: string; text: string; type: string; options?: string[] }>;
}

export interface StrategicPlanResponse {
  draftId: string;
  plan: {
    strategySummary: string;
    timelineWeeks: number;
    phases: Array<{ title: string; description: string; weekStart: number; weekEnd: number }>;
    tasks: Array<{ title: string; description: string; frequency: string; firstDueDate: string }>;
  };
}

export interface StrategicGoal {
  id: string;
  userId: string;
  title: string;
  category: string;
  timelineWeeks: number;
  structuredDataJson: {
    strategySummary: string;
    phases: Array<{ title: string; description: string; weekStart: number; weekEnd: number }>;
    answers?: Record<string, string>;
    coachIntro?: string;
  };
  status: 'draft' | 'active' | 'completed' | 'archived';
  taskCount: number;
  totalCompleted: number;
  dueSoon: number;
  visionImagePath?: string;
  selfieImagePath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StrategicTask {
  id: string;
  userId: string;
  goalId: string;
  title: string;
  description: string;
  frequency: 'weekly' | 'monthly';
  nextDueDate: string;
  autoGenerated: boolean;
  completedCount: number;
  lastCompletedAt?: string;
  sortOrder?: number;
  createdAt: string;
}

export interface ImageAnalysisResponse {
  analysis: string;
  suggestedGoals: string[];
  followUpQuestion: string;
  mode: 'vision' | 'selfie';
  imagePath: string | null;
  imageSignedUrl: string | null;
}

export interface SelfieCheckinAnalysis {
  progressSummary: string;
  score: number;
  positiveChanges: string[];
  areasToFocus: string[];
  motivationalMessage: string;
  recommendation: string;
}

export interface SelfieRecord {
  id: string;
  userId: string;
  goalId: string;
  imagePath: string;
  imageUrl: string | null;
  analysis: SelfieCheckinAnalysis;
  hasOriginalComparison: boolean;
  daysSinceStart: number;
  createdAt: string;
}

export interface SelfieCheckinResponse {
  selfie: SelfieRecord;
  newSelfieUrl: string | null;
  originalUrl: string | null;
  analysis: SelfieCheckinAnalysis;
}

export interface StrategicReview {
  id: string;
  userId: string;
  goalId: string;
  overallScore: number;
  scoreLabel: string;
  summary: string;
  wins: string[];
  concerns: string[];
  recommendations: string[];
  motivationalMessage: string;
  adjustments: string[];
  createdAt: string;
}

export interface CoachChatResponse {
  conversationId: string;
  response: string;
  messageCount: number;
}

export interface CoachChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: string;
}

export interface CoachConversation {
  id: string;
  userId: string;
  messages: CoachChatMessage[];
  updatedAt: string;
  createdAt: string;
}

export interface CoachConversationSummary {
  id: string;
  messageCount: number;
  lastMessage: string;
  lastRole: string;
  updatedAt: string;
  createdAt: string;
}

export interface JournalInsightsTheme {
  name: string;
  count: number;
  emoji: string;
  description: string;
}

export interface JournalInsightsAdvice {
  title: string;
  description: string;
}

export interface JournalInsightsResponse {
  summary: string;
  themes: JournalInsightsTheme[];
  patterns: string[];
  moodTrend: 'improving' | 'stable' | 'declining' | 'fluctuating';
  strengths: string[];
  areasToWork: string[];
  advice: JournalInsightsAdvice[];
  keyQuote: string;
  noteCount: number;
  period: string;
}

export interface AdminUser {
  id: string;
  displayName: string;
  telegramId: string;
  telegramUsername: string | null;
  phoneNumber: string | null;
  language: string;
  subscriptionExpiresAt: string | null;
  isSubscriptionActive: boolean;
  referralCode: string | null;
  referralCount: number;
  xp: number;
  totalPaid: number;
  createdAt: string;
}

export interface MealPlanData {
  days: Array<{
    day: number;
    meals: Array<{
      meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
      items: Array<{
        food_name: string;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        quantity: number;
        unit: 'g' | 'ml' | 'piece';
      }>;
    }>;
  }>;
}

export interface WorkoutPlanData {
  days: Array<{
    day: number;
    focus: string;
    workout_type: 'strength' | 'cardio' | 'flexibility' | 'hiit' | 'rest';
    duration_minutes: number;
    exercises: Array<{
      exercise_name: string;
      sets: number;
      reps: string;
      duration_seconds?: number;
      rest_seconds: number;
      muscle_group: string;
      notes?: string;
    }>;
  }>;
}