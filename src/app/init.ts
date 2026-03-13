// =============================================
// BECOME — Application Bootstrap & Initialization
// =============================================
// This module MUST be imported FIRST in App.tsx.
//
// Production (Vercel) initialization:
//   1. App.tsx imports this file FIRST
//   2. App.tsx calls init(debug) before React renders
//   3. init() loads Eruda if debug=true
//   4. init() ensures Telegram WebApp SDK is available
//   5. CRITICAL ORDER: requestFullscreen() → expand() → ready()
//      Calling ready() before requestFullscreen() causes TG to show
//      the app in normal mode first (TG Bot API restriction).
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
 * Initializes the application and configures its dependencies.
 *
 * @param debug - Enable debug mode (Eruda console for mobile)
 */
export function init(debug: boolean): void {
  console.log('[BECOME] Initialization started (production)');

  // 1. Ensure Telegram WebApp SDK is loaded
  //    On TG client it's already there; on web it loads dynamically.
  ensureTelegramSdk().then(() => {
    console.log('[BECOME] Telegram SDK ready');

    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      const wa = window.Telegram.WebApp;

      // ⚠️ CRITICAL ORDER — per Telegram Bot API docs:
      //   requestFullscreen() MUST be called BEFORE ready().
      //   Calling ready() first causes the app to appear in normal mode.

      // Step 1: expand to full height
      try { wa.expand(); } catch {}

      // Step 2: disable vertical swipes ASAP (prevents swipe-to-close)
      try {
        if (typeof wa.disableVerticalSwipes === 'function') {
          wa.disableVerticalSwipes();
          console.log('[BECOME] disableVerticalSwipes() called in init');
        }
      } catch {}

      // Step 3: enable closing confirmation
      try {
        if (typeof wa.enableClosingConfirmation === 'function') {
          wa.enableClosingConfirmation();
        }
      } catch {}

      // Step 4: request fullscreen (must precede ready())
      // Use our wrapper so _fullscreenRequested flag is set for setupSafeArea()
      try {
        requestFullscreen();
        console.log('[BECOME] requestFullscreen() called BEFORE ready()');
      } catch (err) {
        console.warn('[BECOME] requestFullscreen() error:', err);
      }

      // Step 5: signal app is ready to TG
      try { wa.ready(); } catch {};

      // Step 6: initial safe-area setup — must run AFTER requestFullscreen()
      // so that _fullscreenRequested flag is set and the 96px minimum applies.
      setupSafeArea();

      // Android boot pump: TG populates safeAreaInset asynchronously on cold start.
      // Re-run setupSafeArea() on a cascade of delays to catch the values.
      const ua = (navigator?.userAgent || '').toLowerCase();
      const isAndroid = (wa.platform || '').toLowerCase().includes('android') || /android/i.test(ua);
      if (isAndroid) {
        [50, 150, 400, 800, 1500, 3000].forEach(ms =>
          setTimeout(() => setupSafeArea(), ms)
        );
      }

      console.log(`[BECOME] WebApp.ready() called. Platform: ${wa.platform}, Version: ${wa.version}`);
    }
  });

  // 2. Eruda debugger (if requested)
  if (debug) {
    import('eruda')
      .then((lib) => {
        lib.default.init();
        console.log('[BECOME] Eruda debugger initialized');
      })
      .catch((err) => {
        console.error('[BECOME] Failed to load Eruda:', err);
      });
  }

  console.log('[BECOME] Initialization complete');
}