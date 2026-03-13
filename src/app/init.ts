// =============================================
// Proper Food AI — Application Bootstrap & Initialization
// =============================================
// This module MUST be imported FIRST in App.tsx.
//
// Production (Vercel) initialization:
//   1. App.tsx imports this file FIRST
//   2. App.tsx calls init(debug) before React renders
//   3. init() loads Eruda if debug=true
//   4. init() ensures Telegram WebApp SDK is available
//   5. CRITICAL ORDER: requestFullscreen() → expand() → ready()
//
// TELEGRAM SDK:
//   - When opened from Telegram, the SDK script is injected
//     automatically by the TG client. window.Telegram.WebApp
//     is available immediately.
//   - We also call ensureTelegramSdk() as a safety net.
//   - All TG API access is via /src/app/components/telegram.tsx
//
// DEBUG MODE:
//   - Only via explicit URL param: ?tgWebAppStartParam=debug
//   - Loads Eruda for mobile DevTools
// =============================================

import { ensureTelegramSdk, requestFullscreen, setupSafeArea } from './components/telegram';

/**
 * Compute and set --app-tg-header-offset CSS variable.
 * This is the combined safe area top + content safe area top.
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

    // Fallback — CSS vars not set yet (old client)
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
 * Initializes the application and configures its dependencies.
 *
 * @param debug - Enable debug mode (Eruda console for mobile)
 */
export function init(debug: boolean): void {
  console.log('[ProperFood] Initialization started');

  // 1. Ensure Telegram WebApp SDK is loaded
  ensureTelegramSdk().then(() => {
    console.log('[ProperFood] Telegram SDK ready');

    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      const wa = window.Telegram.WebApp;

      // CRITICAL ORDER — per Telegram Bot API docs:
      // requestFullscreen() MUST be called BEFORE ready().

      // Step 1: expand to full height
      try { wa.expand(); } catch {}

      // Step 2: disable vertical swipes ASAP (prevents swipe-to-close, requires 7.7+)
      try {
        if (typeof wa.isVersionAtLeast === 'function' && wa.isVersionAtLeast('7.7') &&
            typeof wa.disableVerticalSwipes === 'function') {
          wa.disableVerticalSwipes();
          console.log('[ProperFood] disableVerticalSwipes() called');
        }
      } catch {}

      // Step 3: enable closing confirmation (requires 6.2+)
      try {
        if (typeof wa.isVersionAtLeast === 'function' && wa.isVersionAtLeast('6.2') &&
            typeof wa.enableClosingConfirmation === 'function') {
          wa.enableClosingConfirmation();
        }
      } catch {}

      // Step 4: request fullscreen (must precede ready())
      try {
        requestFullscreen();
        console.log('[ProperFood] requestFullscreen() called BEFORE ready()');
      } catch (err) {
        console.warn('[ProperFood] requestFullscreen() error:', err);
      }

      // Step 5: signal app is ready to TG
      try { wa.ready(); } catch {};

      // Step 6: set header color to match current theme (bg_color adapts)
      // Version-gated: setHeaderColor requires 6.1+, setBottomBarColor requires 7.10+
      if (typeof wa.isVersionAtLeast === 'function') {
        if (wa.isVersionAtLeast('6.1')) {
          try { wa.setHeaderColor?.('bg_color'); } catch {}
        }
        if (wa.isVersionAtLeast('7.10')) {
          try { wa.setBottomBarColor?.('bg_color'); } catch {}
        }
      }

      // Step 7: initial safe-area setup
      setupSafeArea();

      // Step 8: compute header offset for pt-safe
      computeAndSetHeaderOffset();

      // Android boot pump: TG populates safeAreaInset asynchronously
      const ua = (navigator?.userAgent || '').toLowerCase();
      const isAndroid = (wa.platform || '').toLowerCase().includes('android') || /android/i.test(ua);
      if (isAndroid) {
        [50, 150, 400, 800, 1500, 3000].forEach(ms =>
          setTimeout(() => {
            setupSafeArea();
            computeAndSetHeaderOffset();
          }, ms)
        );
      } else {
        // iOS / other: fewer retries
        [300, 1000, 3000].forEach(ms =>
          setTimeout(() => computeAndSetHeaderOffset(), ms)
        );
      }

      console.log(`[ProperFood] WebApp.ready() called. Platform: ${wa.platform}, Version: ${wa.version}`);
    }
  });

  // 2. Eruda debugger (if requested)
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