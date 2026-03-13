// =============================================
// BECOME — useTelegramFullscreen Hook
// =============================================
// Handles fullscreen, swipe-to-close protection, and closing
// confirmation on mobile TG clients.
//
// KEY INSIGHT (Android first-load):
//   On Android, requestFullscreen() only succeeds AFTER the
//   viewport has stabilised (wa.isExpanded === true AND the
//   viewportChanged event fires with isStateStable === true).
//   Calling it too early results in a silent no-op.
//
//   Additionally, safeAreaInset / contentSafeAreaInset are
//   populated by TG with an UNPREDICTABLE delay AFTER fullscreen
//   is granted — often 300-1500 ms later. We therefore run an
//   independent "safe-area pump" for the first 6 s on Android,
//   calling setupSafeArea() at increasing intervals so that
//   whenever the insets finally arrive, we catch them immediately.
//
// Strategy:
//   1. init.ts calls requestFullscreen() before ready().
//   2. viewportChanged(isStateStable=true) is the most reliable
//      trigger for requesting fullscreen on Android.
//   3. A short interval loop retries fullscreen as a safety net.
//   4. An independent timer cascade refreshes safe-area for 6 s.
// =============================================

import { useEffect, useRef } from 'react';
import {
  isMobilePlatform,
  isAndroidPlatform,
  isIOSPlatform,
  requestFullscreen,
  disableVerticalSwipes,
  enableClosingConfirmation,
  onFullscreenChanged,
  onFullscreenFailed,
  isFullscreen,
  setupSafeArea,
  expandApp,
} from './telegram';

const MAX_FS_ATTEMPTS = 15;
const FS_INTERVAL_MS  = 800;

// Progressive schedule (ms) for the safe-area pump on Android.
// Covers: fast inset updates (100-600 ms) AND slow ones (up to 6 s).
const ANDROID_SAFE_AREA_SCHEDULE = [
  100, 250, 500, 800, 1200, 1700, 2400, 3300, 4500, 6000,
];

// Schedule for re-applying swipe protection on Android (ms).
// Some TG Android builds reset disableVerticalSwipes() silently after
// fullscreen transitions or viewport changes.
const ANDROID_SWIPE_PROTECT_SCHEDULE = [
  200, 600, 1200, 2500, 5000,
];

function hasTelegramWebApp(): boolean {
  return typeof window !== 'undefined' && !!window.Telegram?.WebApp;
}

function logPlatformInfo(): void {
  try {
    const wa = window.Telegram?.WebApp;
    console.log(
      [
        '[TG Fullscreen] === PLATFORM INFO ===',
        `  platform    : "${wa?.platform ?? 'N/A'}"`,
        `  version     : "${wa?.version ?? 'N/A'}"`,
        `  isFullscreen: ${wa?.isFullscreen ?? 'N/A'}`,
        `  isExpanded  : ${wa?.isExpanded ?? 'N/A'}`,
        `  android     : ${isAndroidPlatform()}`,
        `  ios         : ${isIOSPlatform()}`,
        `  mobile      : ${isMobilePlatform()}`,
        `  UA          : ${navigator?.userAgent ?? 'N/A'}`,
      ].join('\n'),
    );
  } catch {}
}

function applySwipeProtection(): boolean {
  const swipe = disableVerticalSwipes();
  const close = enableClosingConfirmation();
  return swipe && close;
}

/**
 * Apply CSS-level overscroll and touch prevention.
 * Belt-and-suspenders on top of TG's disableVerticalSwipes().
 */
function applyCssSwipePrevention(): void {
  try {
    const html = document.documentElement;
    const body = document.body;

    // Prevent overscroll bounce at document level
    html.style.overscrollBehavior = 'none';
    body.style.overscrollBehavior = 'none';

    // Make html/body non-scrollable — all scrolling happens inside
    // the React scroll container (.overflow-y-auto in AppLayout).
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    html.style.height = '100%';
    body.style.height = '100%';

    // The #root container should also be protected
    const root = document.getElementById('root');
    if (root) {
      root.style.overscrollBehavior = 'none';
      root.style.height = '100%';
      root.style.overflow = 'hidden';
    }
  } catch {}
}

// ---- hook ----

export function useTelegramFullscreen(): void {
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!hasTelegramWebApp()) return;
    if (!isMobilePlatform()) return;

    // Prevent double-init in React StrictMode
    if (attemptedRef.current) return;
    attemptedRef.current = true;

    logPlatformInfo();

    const android = isAndroidPlatform();

    // ── CSS-level swipe prevention (belt-and-suspenders) ──────────
    applyCssSwipePrevention();

    // ── Swipe + closing protection ────────────────────────────────
    applySwipeProtection();

    let swipeIntervalId: ReturnType<typeof setInterval> | null = null;
    if (android) {
      let swipeTicks = 0;
      swipeIntervalId = setInterval(() => {
        swipeTicks++;
        applySwipeProtection();
        applyCssSwipePrevention();
        if (swipeTicks >= 12) {
          if (swipeIntervalId) clearInterval(swipeIntervalId);
        }
      }, 500);
    }

    // ── Safe-area pump (Android only) ────────────────────────────
    // Runs setupSafeArea() on a cascade of increasing delays so that
    // whenever TG finally populates safeAreaInset / contentSafeAreaInset
    // (which can happen anywhere from 100 ms to several seconds after
    // fullscreen is granted), we pick up the correct values immediately.
    const safeAreaTimers: ReturnType<typeof setTimeout>[] = [];
    if (android) {
      ANDROID_SAFE_AREA_SCHEDULE.forEach((ms) => {
        safeAreaTimers.push(setTimeout(() => {
          setupSafeArea();
        }, ms));
      });
    }

    // ── Core fullscreen request ───────────────────────────────────
    const tryFullscreen = async (label: string): Promise<boolean> => {
      if (isFullscreen()) {
        console.log(`[TG Fullscreen] Already fullscreen (${label})`);
        setupSafeArea();
        return true;
      }

      try { expandApp(); } catch {}

      try {
        const ok = await requestFullscreen();
        if (ok) {
          console.log(`[TG Fullscreen] requestFullscreen OK (${label})`);
          // Immediate safe-area refresh — pump schedule above covers the rest
          setupSafeArea();
          return true;
        }
        console.warn(`[TG Fullscreen] returned false (${label})`);
      } catch (err) {
        console.warn(`[TG Fullscreen] threw (${label}):`, err);
      }
      return false;
    };

    let fsIntervalId: ReturnType<typeof setInterval> | null = null;
    let fsTick = 0;

    const stopInterval = () => {
      if (fsIntervalId) { clearInterval(fsIntervalId); fsIntervalId = null; }
    };

    if (android) {
      // ── Android: immediate attempt, then interval ─────────────
      tryFullscreen('android-init-0');

      fsIntervalId = setInterval(async () => {
        fsTick++;
        if (isFullscreen()) { stopInterval(); return; }
        if (fsTick > MAX_FS_ATTEMPTS) {
          console.warn(`[TG Fullscreen] gave up after ${MAX_FS_ATTEMPTS} attempts`);
          stopInterval();
          return;
        }
        console.log(`[TG Fullscreen] retry ${fsTick}/${MAX_FS_ATTEMPTS}`);
        await tryFullscreen(`tick-${fsTick}`);
      }, FS_INTERVAL_MS);

    } else if (isIOSPlatform()) {
      tryFullscreen('ios-init');
    }

    // ── viewportChanged — THE KEY TRIGGER on Android ─────────────
    let vpUnsub: (() => void) | null = null;
    try {
      const wa = window.Telegram?.WebApp;
      if (wa?.onEvent) {
        const vpHandler = (params?: { isStateStable?: boolean }) => {
          const stable = params?.isStateStable ?? true;
          const expanded = wa.isExpanded ?? false;
          console.log(`[TG Fullscreen] viewportChanged stable=${stable} expanded=${expanded} fs=${isFullscreen()}`);

          applySwipeProtection();
          applyCssSwipePrevention();
          setupSafeArea();

          if (!isFullscreen() && stable && (expanded || android)) {
            tryFullscreen('viewportChanged-stable');
            if (stable && android) stopInterval();
          }
        };
        wa.onEvent('viewportChanged', vpHandler as any);
        vpUnsub = () => { try { wa.offEvent?.('viewportChanged', vpHandler as any); } catch {} };
      }
    } catch {}

    // ── fullscreenChanged / fullscreenFailed ──────────────────────
    const unsubChanged = onFullscreenChanged(() => {
      const fs = isFullscreen();
      console.log(`[TG Fullscreen] fullscreenChanged → ${fs}`);
      if (fs) stopInterval();
      // Refresh immediately; the pump schedule above handles delayed insets
      setupSafeArea();
      // Re-apply swipe protection — some TG builds reset it on FS transition
      applySwipeProtection();
      applyCssSwipePrevention();
      if (!fs && android) {
        setTimeout(() => tryFullscreen('re-enter'), 600);
      }
    });

    const unsubFailed = onFullscreenFailed((error) => {
      console.warn('[TG Fullscreen] fullscreenFailed:', error);
      setupSafeArea();
      if (!android) setTimeout(() => tryFullscreen('ios-failed-retry'), 800);
    });

    // ── Cleanup ───────────────────────────────────────────────────
    return () => {
      stopInterval();
      if (swipeIntervalId) clearInterval(swipeIntervalId);
      safeAreaTimers.forEach(clearTimeout);
      vpUnsub?.();
      unsubChanged();
      unsubFailed();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}