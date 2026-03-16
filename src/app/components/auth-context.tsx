// =============================================
// Proper Food AI — Auth Context (Telegram Mini App only)
// =============================================
// Production auth flow (Vercel deployment):
//   1. bot_auth token from URL (Telegram bot link)
//   2. Telegram initData (via window.Telegram.WebApp)
//   3. Device token refresh (session continuity)
//
// If none work: show "Open from @ProperFoodAI_bot" screen.
// No web login / phone auth — Telegram only.
//
// NOTE: On Vercel (unlike Figma Sites), initData is
// properly passed by the Telegram client. The bot_auth
// fallback remains for reply keyboard links.
// =============================================

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { User } from './types';
import {
  api,
  setToken,
  getToken,
  clearToken,
  setDeviceToken,
  getDeviceToken,
  clearDeviceToken,
  setUserLang,
} from './api-client';
import {
  getInitData,
  getBotAuthToken,
  getStartParam,
  isTelegramClient,
  isTelegramEnvironment,
  getTelegramUser,
} from './telegram';
import { sdkReadyPromise } from '../init';

// ---- Offline-first user cache (with 24h TTL per doc spec) ----
const USER_CACHE_KEY = 'pfai_cached_user';
const SUB_CACHE_KEY = 'pfai_cached_sub';
const SESSION_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedSession {
  user: User;
  timestamp: number;
}

function getCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    const parsed: CachedSession = JSON.parse(raw);
    // Check TTL — expire after 24h
    if (!parsed.timestamp || Date.now() - parsed.timestamp > SESSION_CACHE_TTL_MS) {
      console.log('[Auth] Cached session expired (>24h) — clearing');
      localStorage.removeItem(USER_CACHE_KEY);
      localStorage.removeItem(SUB_CACHE_KEY);
      return null;
    }
    const user = parsed.user;
    if (user && typeof user.id === 'string' && typeof user.telegramId === 'number') {
      return user;
    }
  } catch {}
  return null;
}

function setCachedUser(user: User): void {
  try {
    const session: CachedSession = { user, timestamp: Date.now() };
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(session));
  } catch {}
}

function clearCachedUser(): void {
  try {
    localStorage.removeItem(USER_CACHE_KEY);
    localStorage.removeItem(SUB_CACHE_KEY);
  } catch {}
}

interface CachedSubData {
  active: boolean;
  daysLeft: number;
  isTrial: boolean;
  trialDaysLeft: number;
  trialExpired: boolean;
}

function getCachedSub(): CachedSubData | null {
  try {
    const raw = localStorage.getItem(SUB_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setCachedSub(data: CachedSubData): void {
  try {
    localStorage.setItem(SUB_CACHE_KEY, JSON.stringify(data));
  } catch {}
}

// ---- Fast-path: parse user from initData for instant display (no network) ----
// Creates a temporary AppUser from Telegram launch params.
// ID prefixed with `lp-` signals data hasn't been server-verified yet.
function buildFastPathUser(): User | null {
  try {
    const tgUser = getTelegramUser();
    if (!tgUser || !tgUser.id) return null;

    return {
      id: `lp-${tgUser.id}`,           // temporary — replaced after server verification
      telegramId: tgUser.id,
      firstName: tgUser.first_name || 'User',
      lastName: tgUser.last_name || null,
      username: tgUser.username || null,
      photoUrl: tgUser.photo_url || null,
      language: tgUser.language_code || 'en',
      tone: 'supportive',
      selectedGoal: null,
      xp: 0,
      dailyReminderTime: null,
      utcOffset: null,
      weighInDay: null,
      activeProgramId: null,
      subscriptionExpiresAt: null,
      referralCode: null,
      referralCount: 0,
      referredBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as User;
  } catch {
    return null;
  }
}

// ---- Auth phase tracking (for splash progress indicator) ----
export type AuthPhase =
  | 'restoring'       // loading cached session
  | 'connecting'      // first auth attempt in progress
  | 'retrying'        // retry attempt after failure
  | 'authenticating'  // auth succeeded, fetching user profile
  | null;             // auth complete (success or failure)

// ---- Retry with exponential backoff ----
const MAX_LOGIN_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 800; // 800ms, 2400ms, 7200ms

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  onRetry?: (attempt: number, maxRetries: number) => void,
  maxRetries = MAX_LOGIN_RETRIES,
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      // Don't retry on 4xx auth errors — only on network / 5xx
      const status = err?.status || err?.response?.status;
      if (status && status >= 400 && status < 500) {
        throw err; // auth error, don't retry
      }
      if (attempt < maxRetries) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(3, attempt); // 800, 2400, 7200
        console.warn(`[Auth] ${label} attempt ${attempt + 1} failed, retrying in ${delay}ms...`, err);
        onRetry?.(attempt + 1, maxRetries);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ---- ADMIN Telegram IDs ----
// These users get isAdmin=true (your own Telegram ID + testers)
const ADMIN_TELEGRAM_IDS: number[] = [
  7879078497, // Main admin (matches server ADMIN_TG_ID)
  5772448919, // @dozorir — Super Admin
];

// ---- Auth Context Shape ----

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: string | null;
  noInitDataWarning: boolean;
  isAdmin: boolean;
  isDevMode: boolean;
  subscriptionActive: boolean;
  subscriptionDaysLeft: number;
  isTrial: boolean;
  trialDaysLeft: number;
  trialExpired: boolean;
  authPhase: AuthPhase;
  retryAttempt: number;
  isCachedSession: boolean;
  login: () => Promise<void>;
  logout: () => void;
  updateUser: (partial: Partial<User>) => void;
  refreshSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ---- Safe default for when useAuth is called outside AuthProvider ----
// This prevents crashes during HMR, error boundary rendering, etc.
const AUTH_DEFAULT: AuthContextValue = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  authError: null,
  noInitDataWarning: false,
  isAdmin: false,
  isDevMode: false,
  subscriptionActive: false,
  subscriptionDaysLeft: 0,
  isTrial: false,
  trialDaysLeft: 0,
  trialExpired: false,
  authPhase: 'connecting',
  retryAttempt: 0,
  isCachedSession: false,
  login: async () => {},
  logout: () => {},
  updateUser: () => {},
  refreshSubscription: async () => {},
};

// ---- Hook ----

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Return safe default instead of throwing — handles HMR transitions,
    // React Router error boundaries rendering above AuthProvider, etc.
    console.warn('[Auth] useAuth called outside AuthProvider — returning defaults');
    return AUTH_DEFAULT;
  }
  return ctx;
}

// ---- Provider ----

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [noInitDataWarning, setNoInitDataWarning] = useState(false);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [subscriptionDaysLeft, setSubscriptionDaysLeft] = useState(0);
  const [isTrial, setIsTrial] = useState(false);
  const [trialDaysLeft, setTrialDaysLeft] = useState(0);
  const [trialExpired, setTrialExpired] = useState(false);
  const [authPhase, setAuthPhase] = useState<AuthPhase>('restoring');
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [isCachedSession, setIsCachedSession] = useState(false);
  const loginAttempted = useRef(false);

  const isAuthenticated = !!user;

  // ---- Determine admin status ----
  const isAdmin = !!user && ADMIN_TELEGRAM_IDS.includes(user.telegramId);

  // ---- Dev mode: only via explicit URL param ----
  const isDevMode = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('tgWebAppStartParam') === 'debug';

  // ---- Subscription check ----
  const refreshSubscription = useCallback(async () => {
    try {
      const status = await api.getSubscriptionStatus();
      const active = status.isActive || status.isAdmin;
      setSubscriptionActive(active);
      setSubscriptionDaysLeft(status.daysLeft);
      setIsTrial(status.isTrial || false);
      setTrialDaysLeft(status.trialDaysLeft || 0);
      setTrialExpired(status.trialExpired || false);
      // Cache subscription status
      setCachedSub({
        active,
        daysLeft: status.daysLeft,
        isTrial: status.isTrial || false,
        trialDaysLeft: status.trialDaysLeft || 0,
        trialExpired: status.trialExpired || false,
      });
      
      // Fire-and-forget: if subscription is expiring within 3 days, trigger server-side
      // Telegram notification (deduped daily on the server)
      if ((status.isActive || status.isAdmin) && status.daysLeft > 0 && status.daysLeft <= 3) {
        api.checkExpiryReminder().catch(() => {});
      }
    } catch (err) {
      console.warn('[Auth] Failed to refresh subscription:', err);
    }
  }, []);

  // ---- Fetch current user ----
  const fetchMe = useCallback(async (): Promise<User | null> => {
    try {
      const me = await api.me();
      setUser(me);
      setCachedUser(me); // Persist for offline-first next launch
      setIsCachedSession(false); // We have a fresh server response
      setUserLang(me.language || 'en');
      refreshSubscription();
      return me;
    } catch (err) {
      console.warn('[Auth] fetchMe failed:', err);
      return null;
    }
  }, [refreshSubscription]);

  // ---- Retry state callback for withRetry ----
  const handleRetry = useCallback((attempt: number, _max: number) => {
    setAuthPhase('retrying');
    setRetryAttempt(attempt);
  }, []);

  // ---- Login flow ----
  const login = useCallback(async () => {
    setIsLoading(true);
    setAuthError(null);
    setNoInitDataWarning(false);
    setAuthPhase('connecting');
    setRetryAttempt(0);

    try {
      // ★ CRITICAL: Wait for Telegram SDK to be loaded before checking initData.
      // Without this, getInitData() may return '' even inside Telegram because
      // the SDK script hasn't finished loading yet (race condition).
      console.log('[Auth] Waiting for Telegram SDK readiness...');
      await sdkReadyPromise;
      console.log('[Auth] SDK ready. Checking auth sources...');

      // Diagnostic: log what's available
      const wa = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;
      console.log(`[Auth] Diagnostics: TG.WebApp=${!!wa}, initData.length=${wa?.initData?.length || 0}, platform=${wa?.platform || 'N/A'}, version=${wa?.version || 'N/A'}`);
      if (wa?.initDataUnsafe?.user) {
        console.log(`[Auth] TG User: id=${wa.initDataUnsafe.user.id}, name=${wa.initDataUnsafe.user.first_name}`);
      }

      // 1. Try bot_auth token from URL
      const botAuth = getBotAuthToken();
      if (botAuth) {
        console.log('[Auth] Attempting bot_auth login');
        try {
          const res = await withRetry(() => api.authBotToken(botAuth), 'bot_auth', handleRetry);
          if (res.token) {
            setAuthPhase('authenticating');
            if (res.deviceToken) setDeviceToken(res.deviceToken);
            await fetchMe();
            setAuthPhase(null);
            return;
          }
        } catch (err) {
          console.warn('[Auth] bot_auth failed:', err);
        }
      }

      // 2. Try Telegram initData (primary auth for Mini App inside Telegram)
      setAuthPhase('connecting');
      setRetryAttempt(0);
      const initData = getInitData();
      if (initData) {
        console.log(`[Auth] Attempting initData login (length=${initData.length})`);
        try {
          const startParam = getStartParam();
          const res = await withRetry(
            () => api.authTelegram(initData, startParam || undefined),
            'initData',
            handleRetry,
          );
          if (res.token) {
            setAuthPhase('authenticating');
            if (res.deviceToken) setDeviceToken(res.deviceToken);
            await fetchMe();
            setAuthPhase(null);
            return;
          }
        } catch (err) {
          console.warn('[Auth] initData login failed:', err);
        }
      } else {
        console.warn('[Auth] No initData available — Mini App may not be opened through Telegram');
      }

      // 3. Try device token refresh
      setAuthPhase('connecting');
      setRetryAttempt(0);
      const deviceToken = getDeviceToken();
      if (deviceToken) {
        console.log('[Auth] Attempting device token refresh');
        try {
          const res = await withRetry(() => api.authRefresh(deviceToken), 'device_token', handleRetry);
          if (res.token) {
            setAuthPhase('authenticating');
            if (res.deviceToken) setDeviceToken(res.deviceToken);
            await fetchMe();
            setAuthPhase(null);
            return;
          }
        } catch (err) {
          console.warn('[Auth] Device token refresh failed:', err);
          clearDeviceToken();
        }
      }

      // 4. Try existing session token
      const existingToken = getToken();
      if (existingToken) {
        console.log('[Auth] Attempting existing token');
        setAuthPhase('authenticating');
        const me = await fetchMe();
        if (me) {
          setAuthPhase(null);
          return;
        }
        clearToken();
      }

      // No auth method worked
      setAuthPhase(null);
      const hasInitData = !!initData;
      const hasTgSdk = !!wa;
      if (!hasInitData && hasTgSdk) {
        // SDK loaded but initData is empty — might be wrong URL or not opened as Mini App
        setNoInitDataWarning(true);
        console.warn('[Auth] TG SDK present but initData is EMPTY. Possible causes:\n  1. App URL not registered in BotFather as web_app_url\n  2. App opened in TG in-app browser (not as Mini App)\n  3. URL mismatch between registered and current URL');
      }

      const errMsg = !hasTgSdk
        ? 'Telegram SDK not available — open via @ProperFoodAI_bot'
        : !hasInitData
        ? 'Telegram SDK loaded but no initData — check bot configuration'
        : 'Authentication failed';
      setAuthError(errMsg);
      console.log(`[Auth] No auth method succeeded. SDK=${hasTgSdk}, initData=${hasInitData}, botAuth=${!!botAuth}, deviceToken=${!!deviceToken}, sessionToken=${!!existingToken}`);
    } catch (err: any) {
      console.error('[Auth] Login error:', err);
      setAuthError(err?.message || 'Authentication failed');
      setAuthPhase(null);
    } finally {
      setIsLoading(false);
    }
  }, [fetchMe, handleRetry]);

  // ---- Logout ----
  const logout = useCallback(() => {
    setUser(null);
    clearToken();
    clearDeviceToken();
    clearCachedUser();
    setIsCachedSession(false);
    setSubscriptionActive(false);
    setSubscriptionDaysLeft(0);
    setIsTrial(false);
    setTrialDaysLeft(0);
    setTrialExpired(false);
    localStorage.removeItem('become_onboarded');
    localStorage.removeItem('proper_onboarded');
  }, []);

  // ---- Update user (optimistic) ----
  const updateUser = useCallback((partial: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...partial };
      if (partial.language) setUserLang(partial.language);
      setCachedUser(updated); // Keep cache in sync
      return updated;
    });

    api.updateUser(partial).catch((err) => {
      console.warn('[Auth] updateUser API failed:', err);
    });
  }, []);

  // ---- Auto-login on mount ----
  useEffect(() => {
    if (loginAttempted.current) return;
    loginAttempted.current = true;

    // ============================================================
    // 3-Strategy auth (per Telegram Mini App auth architecture):
    //
    // Strategy 1: localStorage cache (24h TTL) — instant UI
    // Strategy 2: Fast-path from initData (no network) — instant UI
    // Strategy 3: Full server verification (background)
    //
    // Strategies 1 & 2 show UI immediately; Strategy 3 runs in
    // background and replaces temporary data with server-verified data.
    // ============================================================

    let hasInstantUser = false;

    // Strategy 1: Restore cached user (with 24h TTL)
    const cached = getCachedUser();
    if (cached) {
      console.log('[Auth] Strategy 1: Restored cached user:', cached.id);
      setUser(cached);
      setIsCachedSession(true);
      setUserLang(cached.language || 'en');
      hasInstantUser = true;
      // Restore cached subscription status
      const cachedSub = getCachedSub();
      if (cachedSub) {
        setSubscriptionActive(cachedSub.active);
        setSubscriptionDaysLeft(cachedSub.daysLeft);
        setIsTrial(cachedSub.isTrial || false);
        setTrialDaysLeft(cachedSub.trialDaysLeft || 0);
        setTrialExpired(cachedSub.trialExpired || false);
      }
    }

    // Strategy 2: Fast-path — parse user from Telegram launch params (no network)
    // Only if no cache available. Creates optimistic user with id `lp-{tgId}`.
    if (!hasInstantUser) {
      const fastUser = buildFastPathUser();
      if (fastUser) {
        console.log('[Auth] Strategy 2: Fast-path user from initData:', fastUser.id);
        setUser(fastUser);
        setIsCachedSession(true); // treat as cached — not server-verified yet
        setUserLang(fastUser.language || 'en');
        hasInstantUser = true;
      }
    }

    // Strategy 3: Full server verification (always runs, in background if we have instant user)
    setAuthPhase(hasInstantUser ? 'restoring' : 'connecting');
    login().catch((err) => {
      console.warn('[Auth] Auto-login failed:', err);

      // Graceful degradation: if server fails but we have an instant user
      // (from cache or fast-path), keep showing it. User sees UI but some
      // server operations may not work. IDs with `lp-` prefix indicate
      // data hasn't been server-verified.
      if (hasInstantUser) {
        console.log('[Auth] Graceful degradation: keeping instant user despite auth failure');
        setIsLoading(false);
      }

      setAuthPhase(null);
    });
  }, [login]);

  const value: AuthContextValue = {
    user,
    isAuthenticated,
    isLoading,
    authError,
    noInitDataWarning,
    isAdmin,
    isDevMode,
    subscriptionActive,
    subscriptionDaysLeft,
    isTrial,
    trialDaysLeft,
    trialExpired,
    authPhase,
    retryAttempt,
    isCachedSession,
    login,
    logout,
    updateUser,
    refreshSubscription,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}