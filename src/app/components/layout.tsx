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
import svgPaths from '../../imports/svg-hg8um85cbx';
import patternSvgPaths from '../../imports/svg-769x92ozth';

// ---- Custom SVG nav icons from Figma ----

function NavIcon({ pathData, active, clipPaths }: { pathData: string | string[]; active: boolean; clipPaths?: boolean }) {
  const paths = Array.isArray(pathData) ? pathData : [pathData];
  // Use CSS variables for theme-aware colors
  const color = active ? 'var(--tab-active)' : 'var(--tab-inactive)';
  return (
    <svg width="20" height="20" viewBox="0 0 19.9816 19.9816" fill="none">
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.66513"
        />
      ))}
    </svg>
  );
}

// Tab definitions
interface TabDef {
  key: string;
  path: string;
  labelKey: string;
  iconPaths: string | string[];
}

const TABS: TabDef[] = [
  { key: 'home', path: '/home', labelKey: 'nav_home', iconPaths: svgPaths.p302a0a00 },
  { key: 'calories', path: '/calories', labelKey: 'nav_calories', iconPaths: svgPaths.p4765360 },
  { key: 'meal-plan', path: '/meal-plan', labelKey: 'nav_meal_plan', iconPaths: [svgPaths.pd3bcef0, svgPaths.p989f700, svgPaths.p2287a480] },
  { key: 'workout', path: '/workout-plan', labelKey: 'nav_workout', iconPaths: svgPaths.p12d14866 },
  { key: 'profile', path: '/profile', labelKey: 'nav_profile', iconPaths: svgPaths.p1a7a4780 },
];

// Pages where the tab bar should be hidden
const HIDE_TAB_PAGES = [
  '/', // onboarding
  '/coach',
  '/nutrition-coach',
  '/upgrade',
  '/weight',
];

// Pages where the Telegram BackButton should be shown (deeper/non-tab pages)
const BACK_BUTTON_PAGES = [
  '/day/',
  '/challenges/',
  '/challenge/',
  '/plan-builder',
  '/plan-history',
  '/journal/insights',
  '/coach',
  '/nutrition-coach',
  '/goals',
  '/goal/',
  '/strategic-goal/',
  '/bonuses',
  '/wallet',
  '/admin',
  '/referrals',
  '/calories/scan',
  '/calories/add',
  '/profile/',
  '/upgrade',
  '/weight',
];

function shouldShowBackButton(pathname: string): boolean {
  return BACK_BUTTON_PAGES.some(p => pathname.startsWith(p));
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
  const hideTabBar = HIDE_TAB_PAGES.includes(location.pathname);
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
          <div className="mx-auto max-w-md px-4 pb-2">

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
                <span className="text-white text-[0.6875rem] font-medium">Go Premium</span>
              </motion.button>
            )}

            <div
              className="bg-liquid-glass relative rounded-[28px] overflow-hidden"
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

              <div className="relative flex items-center justify-around px-3 py-2">
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
                      className="relative flex flex-col items-center justify-center w-[46px] h-[46px] transition-all"
                      aria-label={t(tab.labelKey)}
                    >
                      {/* Active indicator pill */}
                      {isActive && (
                        <motion.div
                          layoutId="tab-indicator"
                          className="absolute -top-[8px] w-6 h-[2px] rounded-full"
                          style={{ background: 'var(--tab-indicator)' }}
                          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                        />
                      )}
                      <div className="relative">
                        <NavIcon pathData={tab.iconPaths} active={isActive} />
                        {/* Premium crown badge on profile tab */}
                        {tab.key === 'profile' && subscriptionActive && (
                          <div
                            className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                            style={{ background: 'var(--tab-crown-bg)' }}
                          >
                            <Crown className="w-2.5 h-2.5 text-[#ffd700] fill-[#ffd700]" />
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
  const lang = typeof navigator !== 'undefined' && navigator.language?.startsWith('ru') ? 'ru' : 'en';

  // Use Telegram themeParams as inline overrides for instant color match,
  // falling back to CSS variables (bg-background, text-foreground) once theme.css loads.
  const bgStyle = tgColors?.bg ? { backgroundColor: tgColors.bg } : undefined;
  const hintStyle = tgColors?.hint ? { color: tgColors.hint } : undefined;

  // Progress label based on auth phase
  const getProgressLabel = (): string => {
    if (isCachedSession) {
      return lang === 'ru' ? 'Синхронизация...' : 'Syncing...';
    }
    switch (authPhase) {
      case 'restoring':
        return lang === 'ru' ? 'Восстановление...' : 'Restoring session...';
      case 'connecting':
        return lang === 'ru' ? 'Подключение...' : 'Connecting...';
      case 'retrying':
        return lang === 'ru'
          ? `Повторная попытка ${retryAttempt}/3...`
          : `Retrying ${retryAttempt}/3...`;
      case 'authenticating':
        return lang === 'ru' ? 'Авторизация...' : 'Authenticating...';
      default:
        return lang === 'ru' ? 'Загрузка...' : 'Loading...';
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
          <div
            className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
            style={{
              borderTopColor: isRetrying ? '#f0a500' : '#00b894',
              borderRightColor: isRetrying ? 'rgba(240,165,0,0.3)' : 'rgba(0,184,148,0.3)',
              animationDuration: isRetrying ? '0.5s' : '0.8s',
            }}
          />
        </div>

        {/* Progress label with animated transition */}
        <AnimatePresence mode="wait">
          <motion.p
            key={authPhase ?? 'done'}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="text-muted-foreground text-sm mt-1 flex items-center gap-1.5"
            style={hintStyle}
          >
            {isRetrying && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            )}
            {getProgressLabel()}
          </motion.p>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// ---- "Open from Telegram" Error Screen ----

function TelegramRequiredScreen({ onRetry }: { onRetry: () => void }) {
  const { authError } = useAuth();
  const lang = typeof navigator !== 'undefined' && navigator.language?.startsWith('ru') ? 'ru' : 'en';

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
          {lang === 'ru' ? 'Откройте через Telegram' : 'Open via Telegram'}
        </h1>

        <p className="text-muted-foreground text-sm leading-relaxed">
          {lang === 'ru'
            ? 'Proper Food AI — это Telegram Mini App. Откройте бота @ProperFoodAI_bot в Telegram и нажмите кнопку меню.'
            : 'Proper Food AI is a Telegram Mini App. Open @ProperFoodAI_bot in Telegram and tap the menu button.'}
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
          {lang === 'ru' ? 'Открыть в Telegram' : 'Open in Telegram'}
        </a>

        <button
          onClick={onRetry}
          className="mt-2 text-muted-foreground text-xs underline underline-offset-2"
        >
          {lang === 'ru' ? 'Повторить попытку' : 'Retry authentication'}
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
      const wasOnboarded = localStorage.getItem('nutrition_onboarded') === 'true';
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
      return <TelegramRequiredScreen onRetry={login} />;
    }

    // In Telegram but auth failed — show error with retry
    if (authError || noInitDataWarning) {
      return <TelegramRequiredScreen onRetry={login} />;
    }
  }

  return <>{children}</>;
}

// ---- App Layout (root route component) ----

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keyboard detection — hides tab bar when keyboard is open
  const keyboardVisible = useKeyboardVisible();

  // Fullscreen + swipe protection on mobile TG clients
  useTelegramFullscreen();

  // Setup Telegram safe areas on mount
  useEffect(() => {
    setupSafeArea();
    listenSafeAreaChanges();
  }, []);

  // Scroll to top on every route change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo(0, 0);
    }
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // Telegram Back Button integration
  useEffect(() => {
    const showBack = shouldShowBackButton(location.pathname);

    if (showBack) {
      showBackButton();
      const unsub = onBackButtonPressed(() => {
        hapticFeedback('light');
        navigate(-1);
      });
      return () => {
        unsub();
        hideBackButton();
      };
    } else {
      hideBackButton();
    }
  }, [location.pathname, navigate]);

  // Determine if tab bar should have extra bottom padding
  const hasTabBar = !HIDE_TAB_PAGES.includes(location.pathname);

  return (
    <AuthProvider>
      <BottomSheetProvider>
        {/* ThemeSync — manages .dark class + Telegram color mapping */}
        <ThemeSync />

        <div
          className="fixed inset-0 overflow-hidden bg-background text-foreground"
        >
          {/* Global SVG displacement filter for liquid glass effect */}
          <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
            <filter id="liquidGlassFilter" x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.012 0.018"
                numOctaves={3}
                seed={2}
                result="noise"
              />
              <feColorMatrix
                in="noise"
                type="matrix"
                values="0.866 0.5 0 0 0
                        -0.5 0.866 0 0 0
                        0 0 1 0 0
                        0 0 0 1 0"
                result="rotatedNoise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="rotatedNoise"
                scale={18}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </svg>

          {/* Scrollable content container */}
          <div
            ref={scrollRef}
            className="h-full overflow-y-auto relative"
            style={{
              paddingBottom: hasTabBar && !keyboardVisible ? '90px' : '0px',
              overscrollBehaviorY: 'contain',
            }}
          >
            {/* Pattern background — mesh gradient + SVG pattern */}
            <div
              className="pointer-events-none sticky top-0 left-0 right-0 h-0 z-0"
              aria-hidden="true"
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100vh',
                  overflow: 'hidden',
                }}
              >
                {/* Mesh gradient layer */}
                <div className="absolute inset-0 bg-mesh-gradient" />

                {/* SVG pattern overlay */}
                <svg
                  viewBox="0 0 1928.01 1081.02"
                  fill="none"
                  preserveAspectRatio="xMidYMid slice"
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: 'auto',
                    height: '100%',
                    minWidth: '100%',
                    transform: 'translate(-50%, -50%) rotate(-90deg)',
                    opacity: 'var(--pattern-opacity)',
                  }}
                >
                  <path
                    d={patternSvgPaths.p28240000}
                    fill="currentColor"
                    fillOpacity="0.2"
                    fillRule="evenodd"
                    clipRule="evenodd"
                    className="text-muted-foreground"
                  />
                </svg>
              </div>
            </div>

            <div className="relative z-[1]">
              <AuthGate>
                <Outlet />
              </AuthGate>
            </div>
          </div>

          {/* Glass morphism tab bar — hides when keyboard is open */}
          <GlassTabBar keyboardVisible={keyboardVisible} />
        </div>
      </BottomSheetProvider>
    </AuthProvider>
  );
}