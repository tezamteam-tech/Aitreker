import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth, AuthProvider } from './auth-context';
import { useNavigate, useLocation, Outlet } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Crown, Smartphone } from 'lucide-react';
import { useTranslation } from './i18n';
import { hapticFeedback, getStartParam, showBackButton, hideBackButton, onBackButtonPressed, isTelegramClient, isTelegramEnvironment, setupSafeArea, listenSafeAreaChanges } from './telegram';
import { useTelegramFullscreen } from './use-telegram-fullscreen';
import { BottomSheetProvider, useAnyBottomSheetOpen } from './bottom-sheet-context';
import { ThemeSync } from './theme-sync';
import { api } from './api-client';
import { WebLoginScreen } from './web-login-screen';
import tabIconPaths from '../../imports/svg-cjzrxu9257';

// ---- Custom SVG nav icons from Figma (Bold/Filled style) ----

function BoldNavIcon({ pathData, active }: { pathData: string | string[]; active: boolean }) {
  const paths = Array.isArray(pathData) ? pathData : [pathData];
  const color = active ? '#566DD6' : '#8E8E93';
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      {paths.map((d, i) => (
        <path key={i} d={d} fill={color} />
      ))}
    </svg>
  );
}

// Tab definitions with bold Figma icons
interface TabDef {
  key: string;
  path: string;
  labelKey: string;
  iconPaths: string[];
}

const TABS: TabDef[] = [
  { key: 'home', path: '/home', labelKey: 'nav_home', iconPaths: [tabIconPaths.pf7e9c00] },
  { key: 'calories', path: '/calories', labelKey: 'nav_calories', iconPaths: [tabIconPaths.p7e81180, tabIconPaths.p2cfae00] },
  { key: 'meal-plan', path: '/meal-plan', labelKey: 'nav_meal_plan', iconPaths: [tabIconPaths.p2d04c4f0, tabIconPaths.p36aa1780, tabIconPaths.p2db24580, tabIconPaths.p3c35e500] },
  { key: 'workout', path: '/workout-plan', labelKey: 'nav_workout', iconPaths: [tabIconPaths.p296c4c80, tabIconPaths.p16ddeaf0, tabIconPaths.p1ab15c00] },
  { key: 'profile', path: '/profile', labelKey: 'nav_profile', iconPaths: [tabIconPaths.p2cb3a980, tabIconPaths.p1c48e200] },
];

// Main tab paths — tab bar is ONLY shown on these
const TAB_PATHS = new Set([
  '/home',
  '/calories',
  '/meal-plan',
  '/workout-plan',
  '/profile',
]);

// Pages where we explicitly don't show tab bar or back button (onboarding flow)
const ONBOARDING_PATHS = new Set(['/', '/onboarding-legacy']);

function isTabPage(pathname: string): boolean {
  return TAB_PATHS.has(pathname);
}

function shouldShowBackButton(pathname: string): boolean {
  // Show back button on all pages that are NOT tabs and NOT onboarding
  if (ONBOARDING_PATHS.has(pathname)) return false;
  if (isTabPage(pathname)) return false;
  return true;
}

function getActiveTab(pathname: string): string | null {
  if (pathname === '/home' || pathname.startsWith('/home')) return 'home';
  if (pathname === '/calories' || pathname.startsWith('/calories')) return 'calories';
  if (pathname === '/meal-plan' || pathname.startsWith('/meal-plan')) return 'meal-plan';
  if (pathname === '/workout-plan' || pathname.startsWith('/workout-plan')) return 'workout';
  if (pathname === '/profile' || pathname.startsWith('/profile') || pathname === '/referrals') return 'profile';
  return null;
}

// ---- Hook: detect keyboard visibility ----
function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

    const show = () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      setVisible(true);
    };

    const hide = () => {
      hideTimerRef.current = setTimeout(() => {
        const active = document.activeElement;
        if (!active || !INPUT_TAGS.has(active.tagName)) {
          setVisible(false);
        }
      }, 150);
    };

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (INPUT_TAGS.has(target.tagName)) show();
    };

    const onFocusOut = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (INPUT_TAGS.has(target.tagName)) hide();
    };

    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);

    // visualViewport fallback (Android Chrome, Telegram WebView)
    const vv = window.visualViewport;
    let baseHeight = vv?.height ?? window.innerHeight;

    const onVvResize = () => {
      if (!vv) return;
      const current = vv.height;
      if (baseHeight - current > 120) {
        show();
      } else {
        const active = document.activeElement;
        if (!active || !INPUT_TAGS.has(active.tagName)) {
          hide();
        }
        baseHeight = current;
      }
    };

    vv?.addEventListener('resize', onVvResize);

    return () => {
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      vv?.removeEventListener('resize', onVvResize);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  return visible;
}

// ---- Liquid Glass Tab Bar ----

function GlassTabBar({ keyboardVisible }: { keyboardVisible: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { subscriptionActive } = useAuth();
  const activeTab = getActiveTab(location.pathname);
  const isTelegram = isTelegramEnvironment();

  // Hide when any bottom sheet is open
  const anySheetOpen = useAnyBottomSheetOpen();

  // Hide tab bar on certain pages
  const hideTabBar = !isTabPage(location.pathname);
  if (hideTabBar) return null;

  return (
    <AnimatePresence>
      {!keyboardVisible && !anySheetOpen && (
        <motion.div
          key="tabbar"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
          className="fixed bottom-0 left-0 right-0 z-50"
          style={{
            paddingBottom: isTelegram
              ? 'calc(max(var(--tg-safe-area-inset-bottom, 0px), 8px) + 8px)'
              : 'calc(max(env(safe-area-inset-bottom, 0px), 8px) + 8px)',
          }}
        >
          <div className="flex flex-col items-center px-4 pb-2">

            {/* Premium upgrade pill for free users — above tab bar */}
            {!subscriptionActive && location.pathname !== '/upgrade' && (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  hapticFeedback('light');
                  navigate('/upgrade');
                }}
                className="mx-auto mb-2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-[#6c5ce7]/80 to-[#a29bfe]/80 border border-border"
                style={{ boxShadow: '0 4px 16px rgba(108,92,231,0.3)' }}
              >
                <Crown className="w-3 h-3 text-[#ffd700]" />
                <span className="text-white text-[0.6875rem] font-medium">{t('hn_go_premium')}</span>
              </motion.button>
            )}

            <div
              className="bg-liquid-glass relative rounded-[28px] overflow-hidden inline-flex"
              style={{
                border: '1px solid var(--glass-border)',
                boxShadow: 'var(--glass-shadow-card)',
              }}
            >
              {/* Top specular highlight */}
              <div
                className="pointer-events-none absolute top-0 left-[8%] right-[8%] h-px"
                style={{
                  background: `linear-gradient(90deg, transparent, var(--glass-highlight) 30%, var(--glass-highlight-strong) 50%, var(--glass-highlight) 70%, transparent)`,
                }}
              />

              <div className="relative flex items-center gap-2 px-4 py-3">
                {TABS.map((tab) => {
                  const isActive = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => {
                        if (!isActive) {
                          hapticFeedback('light');
                          navigate(tab.path);
                        }
                      }}
                      className="relative flex flex-col items-center justify-center p-1 transition-all"
                      aria-label={t(tab.labelKey)}
                    >
                      {/* Active background + indicator */}
                      {isActive && (
                        <>
                          <motion.div
                            layoutId="tab-active-bg"
                            className="absolute inset-0 rounded-[12px]"
                            style={{ background: 'rgba(86, 109, 214, 0.08)' }}
                            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                          />
                          <motion.div
                            layoutId="tab-indicator"
                            className="absolute -top-[12px] w-5 h-[2px] rounded-full"
                            style={{ background: '#566DD6' }}
                            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                          />
                        </>
                      )}
                      <div className="relative">
                        <BoldNavIcon pathData={tab.iconPaths} active={isActive} />
                        {/* Premium crown badge on profile tab */}
                        {tab.key === 'profile' && subscriptionActive && (
                          <div
                            className="absolute -top-0.5 -right-0.5 rounded-full flex items-center justify-center"
                            style={{ background: 'var(--background, #0a0a0f)' }}
                          >
                            <div className="p-[2px]">
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                <g clipPath="url(#crownClip)">
                                  <path d="M4.8175 1.36083C4.83548 1.32817 4.86191 1.30093 4.89401 1.28196C4.92611 1.26299 4.96271 1.25298 5 1.25298C5.03729 1.25298 5.07389 1.26299 5.10599 1.28196C5.13809 1.30093 5.16452 1.32817 5.1825 1.36083L6.4125 3.69583C6.44183 3.7499 6.48277 3.7968 6.53238 3.83317C6.58199 3.86955 6.63903 3.89448 6.69942 3.90619C6.7598 3.9179 6.82203 3.9161 6.88164 3.90091C6.94125 3.88572 6.99675 3.85752 7.04417 3.81833L8.82625 2.29167C8.86046 2.26384 8.90262 2.24759 8.94665 2.24525C8.99068 2.24291 9.03433 2.2546 9.07129 2.27864C9.10826 2.30269 9.13664 2.33784 9.15236 2.37904C9.16807 2.42024 9.17031 2.46536 9.15875 2.50792L7.97792 6.77708C7.95381 6.86444 7.90189 6.94157 7.83 6.99676C7.75812 7.05194 7.67021 7.08219 7.57958 7.08292H2.42083C2.33014 7.08228 2.24213 7.05208 2.17016 6.99688C2.0982 6.94168 2.04621 6.86451 2.02208 6.77708L0.841667 2.50833C0.830104 2.46578 0.832342 2.42066 0.848059 2.37945C0.863775 2.33825 0.892159 2.3031 0.929125 2.27906C0.966091 2.25502 1.00973 2.24333 1.05377 2.24567C1.0978 2.24801 1.13996 2.26426 1.17417 2.29208L2.95583 3.81875C3.00325 3.85793 3.05875 3.88613 3.11836 3.90132C3.17797 3.91651 3.2402 3.91832 3.30058 3.90661C3.36097 3.8949 3.41801 3.86996 3.46762 3.83359C3.51723 3.79722 3.55817 3.75032 3.5875 3.69625L4.8175 1.36083Z" fill="#FFD700" stroke="#FFD700" strokeLinecap="round" strokeLinejoin="round" strokeWidth="0.833333" />
                                  <path d="M2.08333 8.75H7.91667" fill="#FFD700" />
                                  <path d="M2.08333 8.75H7.91667" stroke="#FFD700" strokeLinecap="round" strokeLinejoin="round" strokeWidth="0.833333" />
                                </g>
                                <defs>
                                  <clipPath id="crownClip">
                                    <rect fill="white" height="10" width="10" />
                                  </clipPath>
                                </defs>
                              </svg>
                            </div>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---- Splash / Loading Screen ----
// Reads Telegram themeParams for instant color-matched splash before CSS vars load.

function useTelegramSplashColors() {
  const [colors, setColors] = useState<{ bg: string; text: string; hint: string } | null>(null);

  useEffect(() => {
    try {
      const wa = (window as any).Telegram?.WebApp;
      const tp = wa?.themeParams;
      if (tp) {
        setColors({
          bg: tp.bg_color || tp.secondary_bg_color || '',
          text: tp.text_color || '',
          hint: tp.hint_color || tp.subtitle_text_color || '',
        });
      }
    } catch {}
  }, []);

  return colors;
}

function AuthSplash() {
  const tgColors = useTelegramSplashColors();
  const { authPhase, retryAttempt, isCachedSession } = useAuth();
  const { t } = useTranslation();

  const bgStyle = tgColors?.bg ? { backgroundColor: tgColors.bg } : undefined;
  const textStyle = tgColors?.text ? { color: tgColors.text } : undefined;
  const hintStyle = tgColors?.hint ? { color: tgColors.hint } : undefined;

  // Progress label based on auth phase
  const getProgressLabel = (): string => {
    if (isCachedSession) {
      return t('splash_syncing');
    }
    switch (authPhase) {
      case 'restoring':
        return t('splash_restoring');
      case 'connecting':
        return t('splash_connecting');
      case 'retrying':
        return t('splash_retrying', { attempt: retryAttempt });
      case 'authenticating':
        return t('splash_auth');
      default:
        return t('splash_loading');
    }
  };

  // Show warning dot for retrying phase
  const isRetrying = authPhase === 'retrying';

  return (
    <div
      className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-background"
      style={bgStyle}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center gap-4"
      >
        {/* App icon / logo */}
        <div className="relative w-16 h-16">
          <div
            className="absolute inset-0 rounded-[22px] bg-gradient-to-br from-[#00b894] to-[#00cec9]"
            style={{ boxShadow: '0 8px 32px rgba(0,184,148,0.3)' }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white text-2xl">🥗</span>
          </div>
        </div>

        {/* Spinner — color shifts to amber during retries */}
        <div className="relative w-8 h-8 mt-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            className="w-full h-full rounded-full"
            style={{
              border: `2px solid ${isRetrying ? 'rgba(251,191,36,0.15)' : 'rgba(108,92,231,0.15)'}`,
              borderTopColor: isRetrying ? '#fbbf24' : '#6c5ce7',
            }}
          />
          {isRetrying && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-500"
            />
          )}
        </div>

        {/* Progress label */}
        <p className="text-muted-foreground text-xs font-medium" style={hintStyle}>
          {getProgressLabel()}
        </p>
      </motion.div>
    </div>
  );
}

// ---- "Open from Telegram" Error Screen ----

function TelegramRequiredScreen({ onRetry }: { onRetry: () => void }) {
  const { authError } = useAuth();
  const { t } = useTranslation();

  // Diagnostic info for debugging
  const wa = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;
  const diagInfo = {
    sdk: !!wa,
    initDataLen: wa?.initData?.length || 0,
    platform: wa?.platform || 'N/A',
    version: wa?.version || 'N/A',
    url: typeof window !== 'undefined' ? window.location.href.substring(0, 80) : 'N/A',
  };

  return (
    <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-background px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-4 max-w-sm text-center"
      >
        <div
          className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#0088cc]/20 to-[#0088cc]/5 flex items-center justify-center border border-[#0088cc]/20"
        >
          <Smartphone className="w-10 h-10 text-[#0088cc]" />
        </div>

        <h1 className="text-foreground text-xl font-bold mt-2">
          {t('splash_open_tg')}
        </h1>

        <p className="text-muted-foreground text-sm leading-relaxed">
          {t('splash_open_tg_desc')}
        </p>

        {/* Auth error detail */}
        {authError && (
          <p className="text-red-400/80 text-xs mt-1 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
            {authError}
          </p>
        )}

        <a
          href="https://t.me/ProperFoodAI_bot"
          className="mt-4 inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#0088cc] text-white font-semibold text-sm"
          style={{ boxShadow: '0 4px 16px rgba(0,136,204,0.3)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.94 8.13l-1.97 9.3c-.15.67-.54.83-1.1.52l-3.03-2.24-1.46 1.41c-.16.16-.3.3-.61.3l.22-3.07 5.57-5.03c.24-.22-.05-.33-.38-.13l-6.88 4.33-2.97-.93c-.64-.2-.66-.64.14-.95l11.6-4.47c.54-.2 1.01.13.87.96z" />
          </svg>
          {t('splash_open_tg_btn')}
        </a>

        <button
          onClick={onRetry}
          className="mt-2 text-muted-foreground text-xs underline underline-offset-2"
        >
          {t('splash_retry_btn')}
        </button>

        {/* Diagnostics (always visible for debugging) */}
        <div className="mt-4 text-left text-[0.625rem] text-muted-foreground/50 font-mono leading-relaxed">
          <p>SDK: {diagInfo.sdk ? '✓' : '✗'} | initData: {diagInfo.initDataLen} chars</p>
          <p>Platform: {diagInfo.platform} | Version: {diagInfo.version}</p>
          <p className="break-all">URL: {diagInfo.url}</p>
        </div>
      </motion.div>
    </div>
  );
}

// ---- Auth Gate: renders splash → error → or children ----

function AuthGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, authError, noInitDataWarning, login, isCachedSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const deepLinkProcessed = useRef(false);

  // After auth completes, process deep links and onboarding redirect
  useEffect(() => {
    if (deepLinkProcessed.current) return;
    // Wait for auth to complete, OR proceed immediately if we have a cached session
    const authReady = !isLoading || (isCachedSession && isAuthenticated);
    if (!authReady) return;
    if (!isAuthenticated) return;

    deepLinkProcessed.current = true;

    // Process start_param deep link
    const startParam = getStartParam();
    if (startParam) {
      const isInitialPage = location.pathname === '/' || location.pathname === '/home';
      if (isInitialPage) {
        let target = '';
        if (startParam.startsWith('challenge_')) {
          target = `/challenges/${startParam.replace('challenge_', '')}`;
        } else if (startParam === 'strategic_goals' || startParam === 'goals') {
          target = '/goals';
        } else if (startParam.startsWith('strategic_goal_')) {
          target = `/strategic-goal/${startParam.replace('strategic_goal_', '')}`;
        } else if (startParam === 'coach') {
          target = '/coach';
        } else if (startParam === 'nutrition_coach' || startParam === 'nutri_coach') {
          target = '/nutrition-coach';
        } else if (startParam === 'journal') {
          target = '/journal';
        } else if (startParam === 'focus') {
          target = '/focus';
        } else if (startParam === 'bonuses') {
          target = '/bonuses';
        } else if (startParam === 'wallet') {
          target = '/wallet';
        } else if (startParam === 'profile') {
          target = '/profile';
        } else if (startParam === 'challenges') {
          target = '/challenges';
        } else if (startParam === 'upgrade' || startParam === 'premium') {
          target = '/upgrade';
        } else if (startParam === 'weight' || startParam === 'weight_tracking') {
          target = '/weight';
        } else if (startParam === 'referrals') {
          target = '/referrals';
        } else if (startParam === 'home') {
          target = '/home';
        }
        // Handle referral deep links: startapp=ref_XXXXXX
        // Note: referral is already processed server-side during /auth/telegram,
        // but we keep a client-side fallback for bot_auth / device_token sessions.
        else if (startParam.startsWith('ref_')) {
          const refCode = startParam.replace('ref_', '');
          if (refCode) {
            api.registerReferral(refCode).catch((err) => {
              // Expected to return 409 "Already referred" when server already processed it
              const status = (err as any)?.status;
              if (status !== 409) {
                console.warn('[AuthGate] Referral fallback failed (non-critical):', err);
              }
            });
          }
          target = '/home';
        }

        if (target) {
          navigate(target, { replace: true });
          return;
        }
      }
    }

    // If on the onboarding page and already onboarded → redirect to /home
    if (location.pathname === '/') {
      const wasOnboarded = localStorage.getItem('nutrition_onboarded') === 'true' || localStorage.getItem('proper_onboarded') === 'true';
      if (wasOnboarded) {
        navigate('/home', { replace: true });
      }
    }
  }, [isLoading, isAuthenticated, navigate, location.pathname]);

  // Show splash while authenticating — but skip if we have a cached session
  // (user sees the app immediately with cached data, auth refreshes in background)
  if (isLoading && !isCachedSession) {
    return <AuthSplash />;
  }

  // Auth failed and not in Telegram — show "Open from Telegram" screen
  // But allow onboarding page to render (it handles its own auth attempt)
  if (!isAuthenticated && location.pathname !== '/') {
    // Not on onboarding and not authenticated — check if we should show TG required screen
    const inTelegram = isTelegramClient() || isTelegramEnvironment();
    if (!inTelegram) {
      // Web user: show interactive "Login via Telegram Bot" screen with polling
      return (
        <WebLoginScreen
          onAuthConfirmed={() => {
            // Re-trigger the full login flow — it will pick up the new token from localStorage
            login();
          }}
          onRetry={login}
        />
      );
    }

    // In Telegram but auth failed — show error with retry
    if (authError || noInitDataWarning) {
      return <TelegramRequiredScreen onRetry={login} />;
    }
  }

  // Web users on onboarding page also need to authenticate first
  if (!isAuthenticated && location.pathname === '/') {
    const inTelegram = isTelegramClient() || isTelegramEnvironment();
    if (!inTelegram && !isLoading) {
      return (
        <WebLoginScreen
          onAuthConfirmed={() => login()}
          onRetry={login}
        />
      );
    }
  }

  return <>{children}</>;
}

// ---- Main Layout with safe area, back button, tab bar ----

function LayoutInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const keyboardVisible = useKeyboardVisible();

  // Fullscreen handling for Telegram
  useTelegramFullscreen();

  // ---- Safe area setup with retry cascade ----
  const safeAreaApplied = useRef(false);
  useEffect(() => {
    const delays = [100, 300, 600, 1000, 2000, 4000];
    const timers: ReturnType<typeof setTimeout>[] = [];

    const tryApply = () => {
      try {
        setupSafeArea();
        safeAreaApplied.current = true;
      } catch (e) {
        console.warn('[Layout] Safe area setup attempt failed:', e);
      }
    };

    tryApply();
    for (const delay of delays) {
      timers.push(setTimeout(tryApply, delay));
    }

    const unsub = listenSafeAreaChanges();

    return () => {
      timers.forEach(clearTimeout);
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  // ---- Back button logic ----
  const navDepthRef = useRef(0);

  useEffect(() => {
    navDepthRef.current += 1;
  }, [location.pathname]);

  useEffect(() => {
    const show = shouldShowBackButton(location.pathname);
    if (show) {
      showBackButton();
      const cleanup = onBackButtonPressed(() => {
        if (navDepthRef.current <= 1) {
          // Deep-linked into a sub-page — go to /home instead of leaving app
          navigate('/home', { replace: true });
        } else {
          navigate(-1);
        }
      });
      return () => {
        hideBackButton();
        if (typeof cleanup === 'function') cleanup();
      };
    } else {
      hideBackButton();
    }
  }, [location.pathname, navigate]);

  return (
    <div
      className="relative h-screen bg-background text-foreground overflow-y-auto overscroll-none"
      style={{
        paddingTop: 'var(--safe-area-top, 0px)',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <AuthGate>
        <Outlet />
        <GlassTabBar keyboardVisible={keyboardVisible} />
      </AuthGate>
    </div>
  );
}

export function AppLayout() {
  return (
    <AuthProvider>
      <BottomSheetProvider>
        <ThemeSync />
        <LayoutInner />
      </BottomSheetProvider>
    </AuthProvider>
  );
}