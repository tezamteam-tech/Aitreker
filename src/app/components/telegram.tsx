// =============================================
// BECOME — Telegram WebApp SDK Integration
// =============================================
// Production (Vercel): Telegram SDK is injected by TG
// client automatically. initData is available via
// window.Telegram.WebApp.initData.
//
// bot_auth fallback remains for reply keyboard links
// (user taps "Open BECOME" in chat → URL with bot_auth).
//
// Performance API capture of bot_auth is kept as safety
// net but is rarely needed on Vercel (no URL rewriting).
// =============================================

// ---- Captured bot_auth token (from redirect URLs) ----
let capturedBotAuth: string | null = null;

// On page load, capture bot_auth from URL before any SPA redirect strips it
if (typeof window !== 'undefined') {
  try {
    const url = new URL(window.location.href);
    const ba = url.searchParams.get('bot_auth') || url.hash?.match(/bot_auth=([^&]+)/)?.[1];
    if (ba) {
      capturedBotAuth = ba;
      console.log('[TG] Captured bot_auth from URL');
    }
  } catch {}

  // Safety net: capture from Performance API (navigation entries may contain original URL)
  if (!capturedBotAuth) {
    try {
      const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      if (entries.length > 0) {
        const navUrl = new URL(entries[0].name);
        const ba = navUrl.searchParams.get('bot_auth');
        if (ba) {
          capturedBotAuth = ba;
          console.log('[TG] Captured bot_auth from Performance API');
        }
      }
    } catch {}
  }
}

/**
 * Get the captured bot_auth token (from URL or Performance API).
 */
export function getBotAuthToken(): string | null {
  return capturedBotAuth;
}

// ---- Telegram WebApp SDK access ----

/**
 * Get the Telegram WebApp object if available.
 */
function getTelegramWebApp(): WebApp | null {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
    return window.Telegram.WebApp;
  }
  return null;
}

/**
 * Ensures Telegram SDK script is loaded.
 * On TG client it's already there; in browser we load it dynamically.
 */
export async function ensureTelegramSdk(): Promise<void> {
  if (typeof window === 'undefined') return;

  // Already loaded
  if (window.Telegram?.WebApp) {
    console.log('[TG] SDK already available');
    return;
  }

  // Load dynamically (for browser/dev testing)
  return new Promise<void>((resolve) => {
    const existing = document.querySelector('script[src*="telegram-web-app.js"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      // If already loaded
      if (window.Telegram?.WebApp) resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-web-app.js';
    script.onload = () => {
      console.log('[TG] SDK loaded dynamically');
      resolve();
    };
    script.onerror = () => {
      console.warn('[TG] Failed to load SDK dynamically');
      resolve(); // Resolve anyway so the app doesn't hang
    };
    document.head.appendChild(script);
  });
}

// ---- Telegram environment checks ----

/**
 * Check if running inside a Telegram client (WebApp SDK available with initData).
 */
export function isTelegramClient(): boolean {
  const wa = getTelegramWebApp();
  return !!wa && typeof wa.initData === 'string';
}

/**
 * Check if the app has valid Telegram initData (non-empty).
 */
export function isTelegramEnvironment(): boolean {
  const wa = getTelegramWebApp();
  return !!wa && typeof wa.initData === 'string' && wa.initData.length > 0;
}

/**
 * Get raw initData string for auth.
 */
export function getInitData(): string {
  return getTelegramWebApp()?.initData || '';
}

/**
 * Get parsed user info from initDataUnsafe.
 */
export function getTelegramUser(): TelegramUser | null {
  return getTelegramWebApp()?.initDataUnsafe?.user || null;
}

/**
 * Get start_param from Telegram deep link.
 *
 * Checks two sources:
 * 1. Telegram SDK `initDataUnsafe.start_param` — set when Mini App is opened
 *    via `t.me/BOT/APP?startapp=PARAM` deep link.
 * 2. URL query param `?startapp=PARAM` — set when Mini App is opened via a
 *    `web_app: { url }` button that includes startapp in the URL.
 */
export function getStartParam(): string {
  // Primary: Telegram SDK start_param
  const sdkParam = getTelegramWebApp()?.initDataUnsafe?.start_param;
  if (sdkParam) return sdkParam;

  // Fallback: startapp query param from URL (web_app buttons with startapp in URL)
  if (typeof window !== 'undefined') {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('startapp') || '';
    } catch {}
  }
  return '';
}

// ---- Lifecycle ----

/**
 * Signal to Telegram client that the app is ready.
 */
export function readyApp(): void {
  getTelegramWebApp()?.ready();
}

/**
 * Expand the mini app to full height.
 */
export function expandApp(): void {
  getTelegramWebApp()?.expand();
}

/**
 * Close the mini app.
 */
export function closeMiniApp(): void {
  getTelegramWebApp()?.close();
}

// ---- Haptic Feedback ----

/**
 * Trigger haptic impact feedback.
 */
export function hapticFeedback(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light'): void {
  try {
    getTelegramWebApp()?.HapticFeedback?.impactOccurred(style);
  } catch {}
}

/**
 * Trigger haptic selection feedback.
 */
export function hapticSelection(): void {
  try {
    getTelegramWebApp()?.HapticFeedback?.selectionChanged();
  } catch {}
}

/**
 * Trigger haptic success notification.
 */
export function hapticSuccess(): void {
  try {
    getTelegramWebApp()?.HapticFeedback?.notificationOccurred('success');
  } catch {}
}

/**
 * Trigger haptic error notification.
 */
export function hapticError(): void {
  try {
    getTelegramWebApp()?.HapticFeedback?.notificationOccurred('error');
  } catch {}
}

// ---- Back Button ----

/**
 * Show the Telegram back button.
 */
export function showBackButton(): void {
  try {
    getTelegramWebApp()?.BackButton?.show();
  } catch {}
}

/**
 * Hide the Telegram back button.
 */
export function hideBackButton(): void {
  try {
    getTelegramWebApp()?.BackButton?.hide();
  } catch {}
}

/**
 * Subscribe to back button press. Returns unsubscribe function.
 */
export function onBackButtonPressed(callback: () => void): () => void {
  try {
    const wa = getTelegramWebApp();
    wa?.BackButton?.onClick(callback);
    return () => {
      try {
        wa?.BackButton?.offClick(callback);
      } catch {}
    };
  } catch {
    return () => {};
  }
}

// ---- Share ----

/**
 * Share a link via Telegram (inline query or fallback to openTelegramLink).
 */
export function shareTelegram(url: string, text?: string): void {
  try {
    const wa = getTelegramWebApp();
    if (!wa) return;

    // Use Telegram's native share dialog via t.me/share/url
    // This opens a chat picker where the user can forward the link.
    // NOTE: switchInlineQuery requires inline mode on the bot and is NOT
    // suitable for sharing links — it pre-fills an inline query, not a message.
    const shareUrl = encodeURIComponent(url);
    const tgShareLink = `https://t.me/share/url?url=${shareUrl}&text=${encodeURIComponent(text || '')}`;

    if (wa.openTelegramLink) {
      wa.openTelegramLink(tgShareLink);
    } else {
      // Ultimate fallback — open in browser
      window.open(tgShareLink, '_blank');
    }
  } catch (err) {
    console.warn('[TG] Share failed:', err);
  }
}

// ---- Safe Area ----

/**
 * Set CSS custom properties for safe areas from Telegram SDK.
 *
 * ANDROID FULLSCREEN FIX:
 *   In fullscreen mode, Android TG often reports safeAreaInset and
 *   contentSafeAreaInset as {top:0} even though the status bar +
 *   TG header overlay are covering content. We enforce a minimum.
 *
 * NON-FULLSCREEN:
 *   The WebView viewport already starts BELOW the TG header, so we
 *   do NOT apply a large artificial minimum — only the actual insets.
 *   A small fallback (16px) is kept for edge cases.
 */
export function setupSafeArea(): void {
  try {
    const wa = getTelegramWebApp();
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

    // Combined raw inset reported by TG
    const topInset = (sai?.top || 0) + (csai?.top || 0);
    const inFullscreen = wa.isFullscreen === true;
    const android = isAndroidPlatform();
    const ios = isIOSPlatform();

    let safeTop: number;

    if ((inFullscreen || _fullscreenRequested) && android) {
      // Android fullscreen (or fullscreen requested but wa.isFullscreen hasn't
      // flipped yet — common on cold start where the SDK lags behind the visual state):
      // TG overlays status bar + close-button row on the WebView.
      // SDK often reports 0, so we enforce a safe minimum:
      //   status bar ≈ 28px + TG header row ≈ 56px + buffer ≈ 12px → 96px
      safeTop = Math.max(topInset, 96);
    } else if (inFullscreen && ios) {
      // iOS: insets are reported correctly. Keep at least 44px (Dynamic Island / notch).
      safeTop = Math.max(topInset, 44);
    } else {
      // Non-fullscreen: on most Android TG builds the close-button is a separate
      // UI layer ABOVE the WebView, but contentSafeAreaInset may still report
      // an overlap. Use the actual inset if non-zero, otherwise 56px fallback
      // so the PageHeader title is comfortably below any TG chrome.
      safeTop = topInset > 0 ? topInset : 56;
    }

    // TG reports inflated insets on both platforms — trim 48px to match visual reality
    safeTop = Math.max(safeTop - 48, 0);

    document.documentElement.style.setProperty('--safe-area-top', `${safeTop}px`);
    document.documentElement.style.setProperty('--tg-is-fullscreen', inFullscreen ? '1' : '0');

    console.log(`[TG SafeArea] sai.top=${sai?.top ?? '?'} csai.top=${csai?.top ?? '?'} topInset=${topInset} fullscreen=${inFullscreen} fsRequested=${_fullscreenRequested} android=${android} ios=${ios} → safeTop=${safeTop}px`);
  } catch (err) {
    console.warn('[TG SafeArea] Error:', err);
  }
}

/**
 * Listen for safe area changes via Telegram events.
 * Also listens for fullscreenChanged to recalculate.
 */
export function listenSafeAreaChanges(): void {
  try {
    const wa = getTelegramWebApp();
    if (!wa?.onEvent) return;

    wa.onEvent('safeAreaChanged', () => {
      setupSafeArea();
      // Secondary read after a tick — some TG builds update both fields asynchronously
      setTimeout(() => setupSafeArea(), 150);
    });
    wa.onEvent('contentSafeAreaChanged', () => {
      setupSafeArea();
      setTimeout(() => setupSafeArea(), 150);
    });
    wa.onEvent('fullscreenChanged', () => {
      // TG fires fullscreenChanged before updating safeAreaInset on Android.
      // We refresh at 0, 300, 800, 1500, 3000 ms to catch any delayed writes.
      setupSafeArea();
      [300, 800, 1500, 3000].forEach((ms) => setTimeout(() => setupSafeArea(), ms));
    });
  } catch {}
}

// ---- Theme ----

/**
 * Apply Telegram theme colors to the app.
 */
export function applyTelegramTheme(): void {
  try {
    const wa = getTelegramWebApp();
    if (!wa) return;

    // Set header and background colors to match our dark theme
    try { wa.setHeaderColor('#0a0a0f'); } catch {}
    try { wa.setBackgroundColor('#0a0a0f'); } catch {}

    // Enable closing confirmation for safety
    try { wa.enableClosingConfirmation(); } catch {}
  } catch {}
}

// ---- Request Contact ----

/**
 * Request phone contact from the user (Telegram requestContact API).
 * Returns the contact or null if denied / unavailable.
 */
export function requestContact(): Promise<TelegramContact | null> {
  return new Promise((resolve) => {
    try {
      const wa = getTelegramWebApp();
      if (!wa?.requestContact) {
        resolve(null);
        return;
      }

      wa.requestContact((sent, event) => {
        if (sent && event?.responseUnsafe?.contact) {
          resolve(event.responseUnsafe.contact);
        } else {
          resolve(null);
        }
      });
    } catch {
      resolve(null);
    }
  });
}

// ---- Open Links ----

/**
 * Open a URL in the Telegram browser.
 */
export function openTelegramLink(url: string): void {
  try {
    getTelegramWebApp()?.openTelegramLink(url);
  } catch {
    window.open(url, '_blank');
  }
}

/**
 * Open an external URL.
 */
export function openLink(url: string): void {
  try {
    getTelegramWebApp()?.openLink(url);
  } catch {
    window.open(url, '_blank');
  }
}

// ---- Platform Detection ----

/**
 * Check if running on a mobile Telegram client (Android or iOS).
 *
 * ANDROID FIX: Some Telegram Android clients report wa.platform as 'unknown'
 * or an empty string. We fall back to navigator.userAgent when the platform
 * field is ambiguous but the WebApp SDK is present.
 */
export function isMobilePlatform(): boolean {
  const wa = getTelegramWebApp();
  if (!wa) return false;
  const p = (wa.platform || '').toLowerCase();
  // Known mobile platforms
  if (p === 'android' || p === 'android_x' || p === 'ios') return true;
  // Fallback: if platform is empty / unknown but SDK is present, use UA
  if (!p || p === 'unknown') {
    const ua = (navigator?.userAgent || '').toLowerCase();
    return /android|iphone|ipad|ipod/.test(ua);
  }
  return false;
}

/**
 * Check if running on Android Telegram client.
 *
 * ANDROID FIX: Falls back to navigator.userAgent when wa.platform is
 * empty or 'unknown'.
 */
export function isAndroidPlatform(): boolean {
  const wa = getTelegramWebApp();
  if (!wa) return false;
  const p = (wa.platform || '').toLowerCase();
  if (p === 'android' || p === 'android_x') return true;
  // Fallback: if platform is empty / unknown, use UA
  if (!p || p === 'unknown') {
    return /android/i.test(navigator?.userAgent || '');
  }
  return false;
}

/**
 * Check if running on iOS Telegram client.
 */
export function isIOSPlatform(): boolean {
  const wa = getTelegramWebApp();
  if (!wa) return false;
  const p = (wa.platform || '').toLowerCase();
  if (p === 'ios') return true;
  if (!p || p === 'unknown') {
    return /iphone|ipad|ipod/i.test(navigator?.userAgent || '');
  }
  return false;
}

// ---- Fullscreen ----

// Module-level flag: set once requestFullscreen() is called.
// On Android, wa.isFullscreen can stay `false` for seconds even though the
// WebView is already rendered behind the TG header + status bar.
// setupSafeArea() uses this flag to apply the fullscreen minimum immediately.
let _fullscreenRequested = false;

/**
 * Request fullscreen mode (Bot API 8.0+).
 *
 * ANDROID FIX: We try the method directly (existence check) instead of
 * relying solely on isVersionAtLeast, which sometimes reports stale/wrong
 * version strings on certain Android Telegram builds.
 */
export async function requestFullscreen(): Promise<boolean> {
  try {
    const wa = getTelegramWebApp();
    if (!wa) return false;

    // Prefer direct method check — more reliable than version string on Android
    if (typeof wa.requestFullscreen === 'function') {
      _fullscreenRequested = true;
      wa.requestFullscreen();
      console.log('[TG] requestFullscreen() called');
      return true;
    }

    // Secondary: version check (keeps compatibility for future API changes)
    if (typeof wa.isVersionAtLeast === 'function' && wa.isVersionAtLeast('8.0')) {
      // Method should exist per spec but didn't pass the typeof check above — bail
      console.warn('[TG] requestFullscreen: version OK but method not found');
    }
  } catch (err) {
    console.warn('[TG] requestFullscreen error:', err);
    return false;
  }
  return false;
}

// ---- Vertical Swipes ----

/**
 * Disable vertical swipes to prevent accidental mini app closing (Bot API 7.7+).
 *
 * ANDROID FIX: The isVersionAtLeast version check was blocking this call on
 * some Android builds that report incorrect version strings. We now rely on
 * method existence rather than the version string.
 */
export function disableVerticalSwipes(): boolean {
  try {
    const wa = getTelegramWebApp();
    if (!wa) return false;
    if (typeof wa.disableVerticalSwipes === 'function') {
      wa.disableVerticalSwipes();
      console.log('[TG] disableVerticalSwipes() called');
      return true;
    }
    // Older SDK: method not yet available
    console.warn('[TG] disableVerticalSwipes: method not available on this client');
  } catch (err) {
    console.warn('[TG] disableVerticalSwipes error:', err);
  }
  return false;
}

// ---- Closing Confirmation ----

/**
 * Enable closing confirmation dialog (Bot API 7.6+).
 */
export function enableClosingConfirmation(): boolean {
  try {
    const wa = getTelegramWebApp();
    if (!wa) return false;
    if (typeof wa.enableClosingConfirmation === 'function') {
      wa.enableClosingConfirmation();
      return true;
    }
  } catch {}
  return false;
}

// ---- Fullscreen Events ----

/**
 * Listen for fullscreen changes from Telegram.
 */
export function onFullscreenChanged(callback: () => void): () => void {
  try {
    const wa = getTelegramWebApp();
    if (wa?.onEvent) {
      wa.onEvent('fullscreenChanged', callback);
      return () => {
        try { wa.offEvent('fullscreenChanged', callback); } catch {}
      };
    }
  } catch {}
  return () => {};
}

/**
 * Listen for fullscreen failed event from Telegram.
 */
export function onFullscreenFailed(callback: (error: { error: string }) => void): () => void {
  try {
    const wa = getTelegramWebApp();
    if (wa?.onEvent) {
      wa.onEvent('fullscreenFailed', callback);
      return () => {
        try { wa.offEvent('fullscreenFailed', callback); } catch {}
      };
    }
  } catch {}
  return () => {};
}

/**
 * Check if currently in fullscreen mode.
 */
export function isFullscreen(): boolean {
  try {
    const wa = getTelegramWebApp();
    return wa?.isFullscreen === true;
  } catch {}
  return false;
}