// =============================================
// BECOME — Auth Context (Telegram Mini App only)
// =============================================
// Production auth flow (Vercel deployment):
//   1. bot_auth token from URL (Telegram bot link)
//   2. Telegram initData (via window.Telegram.WebApp)
//   3. Device token refresh (session continuity)
//
// If none work: show "Open from @BECOMEAI_BOT" screen.
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
  isTelegramClient,
} from './telegram';

// ---- ADMIN Telegram IDs ----
// These users get isAdmin=true (your own Telegram ID + testers)
const ADMIN_TELEGRAM_IDS: number[] = [
  7879078497, // Main admin (matches server ADMIN_TG_ID)
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
  login: () => Promise<void>;
  logout: () => void;
  updateUser: (partial: Partial<User>) => void;
  refreshSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ---- Hook ----

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
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
      setSubscriptionActive(status.isActive || status.isAdmin);
      setSubscriptionDaysLeft(status.daysLeft);
    } catch (err) {
      console.warn('[Auth] Failed to refresh subscription:', err);
    }
  }, []);

  // ---- Fetch current user ----
  const fetchMe = useCallback(async (): Promise<User | null> => {
    try {
      const me = await api.me();
      setUser(me);
      setUserLang(me.language || 'en');
      refreshSubscription();
      return me;
    } catch (err) {
      console.warn('[Auth] fetchMe failed:', err);
      return null;
    }
  }, [refreshSubscription]);

  // ---- Login flow ----
  const login = useCallback(async () => {
    setIsLoading(true);
    setAuthError(null);
    setNoInitDataWarning(false);

    try {
      // 1. Try bot_auth token from URL
      const botAuth = getBotAuthToken();
      if (botAuth) {
        console.log('[Auth] Attempting bot_auth login');
        try {
          const res = await api.authBotToken(botAuth);
          if (res.token) {
            if (res.deviceToken) setDeviceToken(res.deviceToken);
            await fetchMe();
            return;
          }
        } catch (err) {
          console.warn('[Auth] bot_auth failed:', err);
        }
      }

      // 2. Try Telegram initData
      const initData = getInitData();
      if (initData) {
        console.log('[Auth] Attempting initData login');
        try {
          const res = await api.authTelegram(initData);
          if (res.token) {
            if (res.deviceToken) setDeviceToken(res.deviceToken);
            await fetchMe();
            return;
          }
        } catch (err) {
          console.warn('[Auth] initData login failed:', err);
        }
      }

      // 3. Try device token refresh
      const deviceToken = getDeviceToken();
      if (deviceToken) {
        console.log('[Auth] Attempting device token refresh');
        try {
          const res = await api.authRefresh(deviceToken);
          if (res.token) {
            if (res.deviceToken) setDeviceToken(res.deviceToken);
            await fetchMe();
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
        const me = await fetchMe();
        if (me) return;
        clearToken();
      }

      // No auth method worked
      if (!initData && isTelegramClient()) {
        setNoInitDataWarning(true);
      }

      console.log('[Auth] No auth method succeeded');
    } catch (err: any) {
      console.error('[Auth] Login error:', err);
      setAuthError(err?.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  }, [fetchMe]);

  // ---- Logout ----
  const logout = useCallback(() => {
    setUser(null);
    clearToken();
    clearDeviceToken();
    setSubscriptionActive(false);
    setSubscriptionDaysLeft(0);
    localStorage.removeItem('become_onboarded');
  }, []);

  // ---- Update user (optimistic) ----
  const updateUser = useCallback((partial: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...partial };
      if (partial.language) setUserLang(partial.language);
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

    const timer = setTimeout(() => {
      login().catch((err) => {
        console.warn('[Auth] Auto-login failed:', err);
        setIsLoading(false);
      });
    }, 100);

    return () => clearTimeout(timer);
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