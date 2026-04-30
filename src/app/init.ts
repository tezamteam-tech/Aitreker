/// <reference types="vite/client" />

// =============================================
// Proper Food AI — Application Bootstrap & Initialization
// =============================================
// This module MUST be imported FIRST in App.tsx.
//
// Uses @tma.js/sdk for Telegram Mini App initialization.
// The SDK handles:
//   - Launch params parsing (from URL hash + window.Telegram)
//   - postEvent bridge setup
//   - Feature singletons (miniApp, viewport, backButton, etc.)
//
// After init(), components can use SDK singletons or hooks
// from @tma.js/sdk-react (useSignal, useLaunchParams, etc.).
//
// IMPORTANT:
//   All components access Telegram features through helper functions
//   in telegram.tsx, which uses SDK singletons where possible
//   with window.Telegram.WebApp fallback.
//
// DEBUG MODE:
//   - Only via explicit URL param: ?tgWebAppStartParam=debug
//   - Loads Eruda for mobile DevTools
// =============================================

import {
  init as initSDK,
  miniApp,
  viewport,
  closingBehavior,
  swipeBehavior,
} from '@tma.js/sdk-react';
import telegramAnalytics from '@telegram-apps/analytics';

const TG_ANALYTICS_TOKEN = import.meta.env.VITE_TG_ANALYTICS_TOKEN as string | undefined;
const TG_ANALYTICS_APP_NAME = import.meta.env.VITE_TG_ANALYTICS_APP_NAME as string | undefined;

let _analyticsInitialized = false;
let _analyticsInitPromise: Promise<void> | null = null;

function initTelegramAnalytics(): void {
  if (_analyticsInitialized) return;
  if (!TG_ANALYTICS_TOKEN || !TG_ANALYTICS_APP_NAME) return;
  if (_analyticsInitPromise) return;

  // init() is async; run once, don't block app bootstrap
  _analyticsInitPromise = telegramAnalytics
    .init({
      token: TG_ANALYTICS_TOKEN,
      appName: TG_ANALYTICS_APP_NAME,
      env: 'PROD',
    })
    .then(() => {
      _analyticsInitialized = true;
      console.log('[ProperFood] Telegram Analytics initialized');
    })
    .catch((err) => {
      console.warn('[ProperFood] Telegram Analytics init failed:', err);
    });
}

// ---- SDK state ----
let _sdkCleanup: VoidFunction | null = null;
let _sdkInitialized = false;

// ---- SDK Readiness Signal ----
// AuthProvider MUST await this before attempting login.
// Resolves when TMA.js SDK is initialized (or fails gracefully).
let _sdkReadyResolve: (() => void) | null = null;
let _sdkReady = false;

export const sdkReadyPromise: Promise<void> = new Promise((resolve) => {
  _sdkReadyResolve = resolve;
});

export function isSdkReady(): boolean {
  return _sdkReady;
}

/** Check if @tma.js/sdk was successfully initialized */
export function isSdkInitialized(): boolean {
  return _sdkInitialized;
}

/**
 * Compute and set --app-tg-header-offset CSS variable.
 */
function computeAndSetHeaderOffset(): void {
  try {
    const wa = (window as any).Telegram?.WebApp;
    if (!wa) return;

    const root = document.documentElement;
    const style = getComputedStyle(root);

    const safeTop = parseFloat(style.getPropertyValue('--tg-safe-area-inset-top')) || 0;
    const contentTop = parseFloat(style.getPropertyValue('--tg-content-safe-area-inset-top')) || 0;
    const tgTotal = safeTop + contentTop;

    if (tgTotal > 10) {
      root.style.setProperty('--app-tg-header-offset', `${tgTotal}px`);
      return;
    }

    const platform = (wa.platform || '').toLowerCase();
    const ua = (navigator?.userAgent || '').toLowerCase();
    let fallback = 56;
    if (platform === 'android' || platform === 'android_x' || (!platform && /android/i.test(ua))) {
      fallback = 68;
    } else if (platform === 'ios' || (!platform && /iphone|ipad|ipod/i.test(ua))) {
      fallback = 90;
    }

    root.style.setProperty('--app-tg-header-offset', `${fallback}px`);
  } catch {}
}

/**
 * Basic safe area setup directly from window.Telegram.WebApp.
 * Full setup is in telegram.tsx — this is a minimal bootstrap version.
 */
function bootstrapSafeArea(): void {
  try {
    const wa = (window as any).Telegram?.WebApp;
    if (!wa) return;

    const sai = wa.safeAreaInset;
    const csai = wa.contentSafeAreaInset;

    if (sai) {
      document.documentElement.style.setProperty('--tg-safe-area-inset-top', `${sai.top}px`);
      document.documentElement.style.setProperty('--tg-safe-area-inset-bottom', `${sai.bottom}px`);
      document.documentElement.style.setProperty('--tg-safe-area-inset-left', `${sai.left}px`);
      document.documentElement.style.setProperty('--tg-safe-area-inset-right', `${sai.right}px`);
    }

    if (csai) {
      document.documentElement.style.setProperty('--tg-content-safe-area-inset-top', `${csai.top}px`);
      document.documentElement.style.setProperty('--tg-content-safe-area-inset-bottom', `${csai.bottom}px`);
    }

    const saiTop = sai?.top || 0;
    const csaiTop = csai?.top || 0;
    const topInset = Math.max(saiTop, csaiTop, saiTop + csaiTop > 120 ? Math.max(saiTop, csaiTop) : saiTop + csaiTop);
    const inFullscreen = wa.isFullscreen === true;

    const platform = (wa.platform || '').toLowerCase();
    const ua = (navigator?.userAgent || '').toLowerCase();
    const android = platform.includes('android') || /android/i.test(ua);
    const ios = platform === 'ios' || /iphone|ipad|ipod/i.test(ua);

    let safeTop: number;
    if (inFullscreen && android) {
      safeTop = Math.max(topInset, 88);
    } else if (inFullscreen && ios) {
      // iOS fullscreen: Dynamic Island/notch + TG header overlay → min 88px
      safeTop = Math.max(topInset, 88);
    } else {
      // Non-fullscreen: TG header chrome overlays the WebView on many versions.
      // Enforce minimum of 56px (standard ~44px TG header + breathing room).
      safeTop = Math.max(topInset, 56);
    }

    document.documentElement.style.setProperty('--safe-area-top', `${safeTop}px`);
    document.documentElement.style.setProperty('--tg-is-fullscreen', inFullscreen ? '1' : '0');
  } catch {}
}

/**
 * Initializes the application and configures its dependencies.
 * Works with @tma.js/sdk for Telegram Mini App.
 *
 * @param debug - Enable debug mode (Eruda console for mobile)
 */
export function init(debug: boolean): void {
  console.log('[ProperFood] Initialization started');

  // 0. Fix iOS input zoom: ensure viewport has maximum-scale=1, user-scalable=no
  try {
    let vpMeta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
    if (!vpMeta) {
      vpMeta = document.createElement('meta');
      vpMeta.name = 'viewport';
      document.head.appendChild(vpMeta);
    }
    vpMeta.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
  } catch {}

  // 0.5 Initialize Telegram Mini Apps Analytics (if configured)
  initTelegramAnalytics();

  // 1. Initialize TMA.js SDK (synchronous — handles postEvent bridge, signals, etc.)
  try {
    _sdkCleanup = initSDK();
    _sdkInitialized = true;
    console.log('[ProperFood] @tma.js/sdk initialized successfully');
  } catch (err) {
    console.warn('[ProperFood] @tma.js/sdk init failed (not in Telegram?):', err);
    _sdkInitialized = false;
  }

  // 2. Configure Telegram features via SDK singletons (if initialized)
  if (_sdkInitialized) {
    try {
      // Step 1: expand to full height
      try { viewport.expand(); } catch {}

      // Step 2: disable vertical swipes (prevents swipe-to-close, v7.7+)
      try {
        if (swipeBehavior.isSupported()) {
          swipeBehavior.mount();
          swipeBehavior.disableVertical();
          console.log('[ProperFood] swipeBehavior.disableVertical() called');
        }
      } catch {}

      // Step 3: enable closing confirmation (v6.2+)
      try {
        closingBehavior.mount();
        closingBehavior.enableConfirmation();
      } catch {}

      // Step 4: request fullscreen (must precede ready())
      try {
        viewport.requestFullscreen().then(() => {
          console.log('[ProperFood] viewport.requestFullscreen() succeeded');
        }).catch(() => {
          console.log('[ProperFood] viewport.requestFullscreen() not supported or failed');
        });
      } catch {}

      // Step 5: signal app is ready to Telegram
      try { miniApp.ready(); } catch {}

      // Step 6: set header/bottom bar colors
      try { miniApp.setHeaderColor('bg_color'); } catch {}
      try { miniApp.setBottomBarColor('bg_color'); } catch {}

      console.log('[ProperFood] SDK features configured');
    } catch (err) {
      console.warn('[ProperFood] Error configuring SDK features:', err);
    }
  }

  // 3. Fallback: try window.Telegram.WebApp if SDK init failed
  if (!_sdkInitialized && typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
    const wa = (window as any).Telegram.WebApp;
    console.log(`[ProperFood] Fallback to window.Telegram.WebApp: platform=${wa.platform}, version=${wa.version}`);

    try { wa.expand(); } catch {}

    try {
      if (typeof wa.isVersionAtLeast === 'function') {
        if (wa.isVersionAtLeast('7.7') && typeof wa.disableVerticalSwipes === 'function') {
          wa.disableVerticalSwipes();
        }
        if (wa.isVersionAtLeast('6.2') && typeof wa.enableClosingConfirmation === 'function') {
          wa.enableClosingConfirmation();
        }
        if (wa.isVersionAtLeast('8.0') && typeof wa.requestFullscreen === 'function') {
          wa.requestFullscreen();
        }
      }
    } catch {}

    try { wa.ready(); } catch {}

    try {
      if (typeof wa.isVersionAtLeast === 'function') {
        if (wa.isVersionAtLeast('6.1')) wa.setHeaderColor?.('bg_color');
        if (wa.isVersionAtLeast('7.10')) wa.setBottomBarColor?.('bg_color');
      }
    } catch {}
  }

  // 4. Bootstrap safe area (minimal — full setup in telegram.tsx setupSafeArea())
  bootstrapSafeArea();
  computeAndSetHeaderOffset();

  // Boot pump: TG populates safeAreaInset asynchronously on both platforms
  const ua = (navigator?.userAgent || '').toLowerCase();
  const wa = (window as any).Telegram?.WebApp;
  const isAndroid = (wa?.platform || '').toLowerCase().includes('android') || /android/i.test(ua);
  const isIOS = (wa?.platform || '').toLowerCase() === 'ios' || /iphone|ipad|ipod/i.test(ua);
  if (isAndroid || isIOS) {
    [50, 150, 400, 800, 1500, 3000].forEach(ms =>
      setTimeout(() => {
        bootstrapSafeArea();
        computeAndSetHeaderOffset();
      }, ms)
    );
  } else {
    [300, 1000, 3000].forEach(ms =>
      setTimeout(() => {
        bootstrapSafeArea();
        computeAndSetHeaderOffset();
      }, ms)
    );
  }

  // 5. Signal SDK readiness immediately (init() is synchronous in @tma.js/sdk)
  _sdkReady = true;
  _sdkReadyResolve?.();

  // 6. Eruda debugger (if requested)
  if (debug) {
    import('eruda')
      .then((lib) => {
        lib.default.init();
        console.log('[ProperFood] Eruda debugger initialized');
      })
      .catch((err) => {
        console.error('[ProperFood] Failed to load Eruda:', err);
      });
  }

  console.log('[ProperFood] Initialization complete');
}