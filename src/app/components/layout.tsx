import { hapticFeedback, getStartParam, showBackButton, hideBackButton, onBackButtonPressed, isTelegramClient, isTelegramEnvironment } from './telegram';
import { useAuth, AuthProvider } from './auth-context';
import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Crown } from 'lucide-react';
import { useTranslation } from './i18n';
import { setupSafeArea, listenSafeAreaChanges } from './telegram';
import { useTelegramFullscreen } from './use-telegram-fullscreen';
import { BottomSheetProvider, useAnyBottomSheetOpen } from './bottom-sheet-context';
import { ThemeSync } from './theme-sync';
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

// ---- App Layout (root route component) ----

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const prevLocation = useRef(location.pathname);
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

  // Handle start_param deep links
  useEffect(() => {
    const startParam = getStartParam();
    if (!startParam) return;

    const isInitialPage = location.pathname === '/' || location.pathname === '/home';
    if (!isInitialPage) return;

    if (startParam.startsWith('challenge_')) {
      const id = startParam.replace('challenge_', '');
      navigate(`/challenges/${id}`, { replace: true });
    } else if (startParam === 'strategic_goals' || startParam === 'goals') {
      navigate('/goals', { replace: true });
    } else if (startParam.startsWith('strategic_goal_')) {
      const id = startParam.replace('strategic_goal_', '');
      navigate(`/strategic-goal/${id}`, { replace: true });
    } else if (startParam === 'coach') {
      navigate('/coach', { replace: true });
    } else if (startParam === 'nutrition_coach' || startParam === 'nutri_coach') {
      navigate('/nutrition-coach', { replace: true });
    } else if (startParam === 'journal') {
      navigate('/journal', { replace: true });
    } else if (startParam === 'focus') {
      navigate('/focus', { replace: true });
    } else if (startParam === 'bonuses') {
      navigate('/bonuses', { replace: true });
    } else if (startParam === 'wallet') {
      navigate('/wallet', { replace: true });
    } else if (startParam === 'profile') {
      navigate('/profile', { replace: true });
    } else if (startParam === 'challenges') {
      navigate('/challenges', { replace: true });
    } else if (startParam === 'upgrade' || startParam === 'premium') {
      navigate('/upgrade', { replace: true });
    } else if (startParam === 'weight' || startParam === 'weight_tracking') {
      navigate('/weight', { replace: true });
    }
  }, []);

  // Track previous location for transitions
  useEffect(() => {
    prevLocation.current = location.pathname;
  }, [location.pathname]);

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
              <Outlet />
            </div>
          </div>

          {/* Glass morphism tab bar — hides when keyboard is open */}
          <GlassTabBar keyboardVisible={keyboardVisible} />
        </div>
      </BottomSheetProvider>
    </AuthProvider>
  );
}