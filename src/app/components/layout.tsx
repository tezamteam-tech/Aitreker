// =============================================
// Proper Food AI — Main Layout
// =============================================
// Root layout component with:
//   - AuthGate (auth check, loading splash, onboarding redirect)
//   - GlassTabBar (bottom navigation with Figma SVG icons)
//   - Safe area handling (Telegram fullscreen)
//   - Keyboard detection (hide tab bar)
//   - Back button handling (Telegram system back)
// =============================================

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth, AuthProvider } from './auth-context';
import { useNavigate, useLocation, Outlet } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Smartphone } from 'lucide-react';
import { useTranslation } from './i18n';
import { hapticFeedback, getStartParam, showBackButton, hideBackButton, onBackButtonPressed, isTelegramEnvironment, setupSafeArea, listenSafeAreaChanges } from './telegram';
import { useTelegramFullscreen } from './use-telegram-fullscreen';
import { BottomSheetProvider, useAnyBottomSheetOpen } from './bottom-sheet-context';
import { ThemeSync } from './theme-sync';
import { WebLoginScreen } from './web-login-screen';
import { PatternBackground } from './pattern-background';
import tabIconPaths from '../../imports/svg-cjzrxu9257';
import { Toaster } from 'sonner';

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
  path: string;
  labelKey: string;
  iconPaths: string[];
  matchPaths?: string[];
}

const TABS: TabDef[] = [
  {
    path: '/home',
    labelKey: 'nav_home',
    iconPaths: [tabIconPaths.pf7e9c00],
    matchPaths: ['/home'],
  },
  {
    path: '/calories',
    labelKey: 'nav_calories',
    iconPaths: [tabIconPaths.p2cfae00, tabIconPaths.p7e81180],
    matchPaths: ['/calories', '/calories/scan'],
  },
  {
    path: '/workout-plan',
    labelKey: 'nav_workout',
    iconPaths: [tabIconPaths.p2d04c4f0, tabIconPaths.p2db24580, tabIconPaths.p36aa1780, tabIconPaths.p3c35e500],
    matchPaths: ['/workout-plan'],
  },
  {
    path: '/profile',
    labelKey: 'nav_profile',
    iconPaths: [tabIconPaths.p1c48e200, tabIconPaths.p2cb3a980],
    matchPaths: ['/profile', '/profile/notifications'],
  },
];

// Pages where the tab bar should be hidden
const HIDE_TAB_BAR_PATHS = [
  '/', // onboarding
  '/onboarding-legacy',
  '/coach',
  '/nutrition-coach',
  '/calories/scan',
  '/plan-builder',
  '/plan-history',
  '/focus',
  '/journal',
  '/journal/insights',
  '/challenges/create',
  '/upgrade',
  '/admin',
  '/weight',
  '/measurements',
  '/analytics',
  '/goals',
  '/strategic-goal/create',
  '/bonuses',
  '/wallet',
  '/referrals',
];

// ---- GlassTabBar ----

function GlassTabBar({ keyboardVisible }: { keyboardVisible: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { subscriptionActive } = useAuth();
  const anySheetOpen = useAnyBottomSheetOpen();

  // Check if tab bar should be hidden for current route
  const currentPath = location.pathname;
  const shouldHide =
    keyboardVisible ||
    anySheetOpen ||
    HIDE_TAB_BAR_PATHS.includes(currentPath) ||
    currentPath.startsWith('/challenges/') ||
    currentPath.startsWith('/goals/') ||
    currentPath.startsWith('/strategic-goal/') ||
    currentPath.startsWith('/day/');

  return (
    <AnimatePresence>
      {!shouldHide && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-50"
          style={{
            paddingBottom: 'var(--safe-area-bottom, 0px)',
          }}
        >
          <div
            className="mx-3 mb-2 rounded-[22px] border border-[var(--glass-border)] overflow-hidden"
            style={{
              background: 'var(--glass-tab-bg, rgba(28, 28, 30, 0.75))',
              backdropFilter: 'blur(40px) saturate(180%)',
              WebkitBackdropFilter: 'blur(40px) saturate(180%)',
              boxShadow: '0 -2px 20px rgba(0,0,0,0.15), inset 0 0.5px 0 rgba(255,255,255,0.05)',
            }}
          >
            <div className="flex items-center justify-around py-1.5 px-1">
              {TABS.map((tab) => {
                const active = tab.matchPaths
                  ? tab.matchPaths.some((p) => currentPath === p)
                  : currentPath === tab.path;

                return (
                  <button
                    key={tab.path}
                    onClick={() => {
                      if (!active) {
                        hapticFeedback('light');
                        navigate(tab.path);
                      }
                    }}
                    className="flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 min-w-[60px] relative"
                  >
                    {/* Active indicator dot */}
                    {active && (
                      <motion.div
                        layoutId="tab-indicator"
                        className="absolute -top-0.5 w-5 h-0.5 rounded-full bg-[#566DD6]"
                        transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                      />
                    )}

                    <BoldNavIcon pathData={tab.iconPaths} active={active} />

                    <span
                      className="transition-colors duration-200"
                      style={{
                        fontSize: '0.625rem',
                        fontWeight: active ? 600 : 500,
                        color: active ? '#566DD6' : '#8E8E93',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {t(tab.labelKey)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---- AuthGate ----
// Shows loading splash while authenticating, redirects to onboarding if needed.

function AuthGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const {
    user,
    isAuthenticated,
    isLoading,
    authError,
    noInitDataWarning,
    authPhase,
    retryAttempt,
    isCachedSession,
    login,
    subscriptionActive,
  } = useAuth();

  const hasRedirectedRef = useRef(false);
  const [showWebLogin, setShowWebLogin] = useState(false);

  // Detect non-Telegram browser → show web login
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isTelegramEnvironment()) {
      const timer = setTimeout(() => setShowWebLogin(true), 800);
      return () => clearTimeout(timer);
    }
  }, [isLoading, isAuthenticated]);

  // Auto-redirect to /home after auth if on root or onboarding-related page
  useEffect(() => {
    if (!isAuthenticated || !user || hasRedirectedRef.current) return;

    // If user has completed nutrition onboarding, redirect from root to home
    if (location.pathname === '/' && user.selectedGoal) {
      hasRedirectedRef.current = true;
      navigate('/home', { replace: true });
      return;
    }

    // Handle startParam deep links
    const startParam = getStartParam();
    if (startParam && startParam !== 'debug') {
      hasRedirectedRef.current = true;
      if (startParam === 'upgrade' || startParam === 'premium') {
        navigate('/upgrade?plan=60', { replace: true });
      } else if (startParam === 'referral' || startParam.startsWith('ref_')) {
        navigate('/referrals', { replace: true });
      } else if (startParam === 'coach') {
        navigate('/coach', { replace: true });
      } else if (startParam === 'scan') {
        navigate('/calories/scan', { replace: true });
      } else if (user.selectedGoal) {
        navigate('/home', { replace: true });
      }
    }
  }, [isAuthenticated, user, location.pathname, navigate]);

  // ---- Loading state: splash screen ----
  if (isLoading) {
    const phaseText =
      authPhase === 'restoring'
        ? t('splash_restoring')
        : authPhase === 'connecting'
        ? t('splash_connecting')
        : authPhase === 'retrying'
        ? t('splash_retrying', { attempt: retryAttempt })
        : authPhase === 'authenticating'
        ? t('splash_auth')
        : t('splash_loading');

    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        {/* Animated spinner */}
        <div className="relative w-14 h-14 mb-6">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-0 rounded-full border-2 border-transparent"
            style={{ borderTopColor: '#6c5ce7', borderRightColor: 'rgba(108,92,231,0.3)' }}
          />
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-2 rounded-full border-2 border-transparent"
            style={{ borderBottomColor: '#a29bfe', borderLeftColor: 'rgba(162,155,254,0.3)' }}
          />
        </div>

        {/* Phase text */}
        <motion.p
          key={phaseText}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-muted-foreground text-sm text-center"
        >
          {phaseText}
        </motion.p>

        {/* Cached session indicator */}
        {isCachedSession && (
          <p className="text-muted-foreground/30 text-xs mt-3">{t('splash_syncing')}</p>
        )}
      </div>
    );
  }

  // ---- Not authenticated ----
  if (!isAuthenticated) {
    // Web browser → show web login screen
    if (showWebLogin) {
      return (
        <WebLoginScreen
          onAuthConfirmed={() => {
            setShowWebLogin(false);
            login();
          }}
          onRetry={() => login()}
        />
      );
    }

    // Telegram but auth failed → show error with retry
    if (authError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#ff6b6b]/10 flex items-center justify-center mb-4">
            <Smartphone className="w-7 h-7 text-[#ff6b6b]" />
          </div>
          <h2 className="text-foreground text-lg font-bold mb-2">{t('splash_open_tg')}</h2>
          <p className="text-muted-foreground text-sm max-w-[280px] mb-6">{t('splash_open_tg_desc')}</p>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => login()}
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white font-semibold text-sm"
          >
            {t('splash_retry_btn')}
          </motion.button>

          {noInitDataWarning && (
            <p className="text-muted-foreground/30 text-xs mt-4 max-w-[260px]">
              No Telegram initData found. Please open via @ProperFoodAI_bot.
            </p>
          )}
        </div>
      );
    }

    // Still waiting → brief loading
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="relative w-10 h-10">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-0 rounded-full border-2 border-transparent"
            style={{ borderTopColor: '#6c5ce7' }}
          />
        </div>
      </div>
    );
  }

  // ---- Authenticated: render children ----
  return <>{children}</>;
}

// ---- LayoutInner ----
// The main app shell with safe areas, keyboard detection, back button.

function LayoutInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Telegram fullscreen, swipe protection, safe areas
  useTelegramFullscreen();

  // ---- Keyboard detection ----
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Method 1: visualViewport API (most reliable)
    const vv = window.visualViewport;
    if (vv) {
      const handleResize = () => {
        const heightDiff = window.innerHeight - vv.height;
        setKeyboardVisible(heightDiff > 150);
      };
      vv.addEventListener('resize', handleResize);
      return () => vv.removeEventListener('resize', handleResize);
    }

    // Method 2: focus/blur on inputs
    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) {
        setKeyboardVisible(true);
      }
    };
    const handleBlur = () => {
      setTimeout(() => setKeyboardVisible(false), 100);
    };

    document.addEventListener('focusin', handleFocus);
    document.addEventListener('focusout', handleBlur);
    return () => {
      document.removeEventListener('focusin', handleFocus);
      document.removeEventListener('focusout', handleBlur);
    };
  }, []);

  // ---- Telegram back button ----
  useEffect(() => {
    // Show back button on non-root pages
    const rootPaths = ['/home', '/'];
    const isRoot = rootPaths.includes(location.pathname);

    if (isRoot) {
      hideBackButton();
    } else {
      showBackButton();
    }

    const unsub = onBackButtonPressed(() => {
      hapticFeedback('light');
      navigate(-1);
    });

    return () => {
      unsub();
    };
  }, [location.pathname, navigate]);

  // ---- Safe area refresh on route changes ----
  useEffect(() => {
    setupSafeArea();
  }, [location.pathname]);

  // Listen for safe area changes
  useEffect(() => {
    listenSafeAreaChanges();
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-y-auto overflow-x-hidden"
      style={{
        paddingTop: 'var(--safe-area-top, 0px)',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {/* Pattern background — z-[-1], must be first for glass backdrop-filter to work */}
      <PatternBackground />

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
        <Toaster
          position="top-center"
          theme="dark"
          toastOptions={{
            style: {
              background: 'rgba(30, 30, 40, 0.92)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              color: '#fff',
              fontSize: '0.8125rem',
              borderRadius: '14px',
            },
          }}
          offset={60}
        />
      </BottomSheetProvider>
    </AuthProvider>
  );
}