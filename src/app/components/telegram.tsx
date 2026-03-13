// =============================================
// Proper Food AI — Telegram WebApp SDK Integration
// =============================================
// Production (Vercel): Telegram SDK is injected by TG
// client automatically. initData is available via
// window.Telegram.WebApp.initData.
//
// bot_auth fallback remains for reply keyboard links
// (user taps "Open Proper Food" in chat → URL with bot_auth).
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
 * Check if the current Telegram WebApp version is at least `minVersion`.
 * Returns false if the SDK is not available or version check fails.
 * This MUST be called before invoking version-gated methods to prevent
 * "[Telegram.WebApp] X is not supported in version Y.Z" console warnings.
 */
function isVersionAtLeast(minVersion: string): boolean {
  try {
    const wa = getTelegramWebApp();
    if (!wa || typeof wa.isVersionAtLeast !== 'function') return false;
    return wa.isVersionAtLeast(minVersion);
  } catch {
    return false;
  }
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
 * Show the Telegram back button (Bot API 6.1+).
 */
export function showBackButton(): void {
  try {
    if (!isVersionAtLeast('6.1')) return;
    getTelegramWebApp()?.BackButton?.show();
  } catch {}
}

/**
 * Hide the Telegram back button (Bot API 6.1+).
 */
export function hideBackButton(): void {
  try {
    if (!isVersionAtLeast('6.1')) return;
    getTelegramWebApp()?.BackButton?.hide();
  } catch {}
}

/**
 * Subscribe to back button press. Returns unsubscribe function (Bot API 6.1+).
 */
export function onBackButtonPressed(callback: () => void): () => void {
  try {
    if (!isVersionAtLeast('6.1')) return () => {};
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

    // TG provides two inset values:
    //   safeAreaInset    – device-level (notch, Dynamic Island, status bar)
    //   contentSafeAreaInset – TG-level (header bar rendered by Telegram)
    // They can overlap on some builds. Use max() to avoid doubling.
    const saiTop = sai?.top || 0;
    const csaiTop = csai?.top || 0;
    const topInset = Math.max(saiTop, csaiTop, saiTop + csaiTop > 120 ? Math.max(saiTop, csaiTop) : saiTop + csaiTop);
    const inFullscreen = wa.isFullscreen === true;
    const android = isAndroidPlatform();
    const ios = isIOSPlatform();

    let safeTop: number;

    if ((inFullscreen || _fullscreenRequested) && android) {
      // Android fullscreen: WebView extends behind status bar + TG header.
      // SDK often reports 0 initially. Enforce minimum:
      //   status bar ≈ 28px + TG close-button row ≈ 44px + buffer → 88px
      safeTop = Math.max(topInset, 88);
    } else if (inFullscreen && ios) {
      // iOS fullscreen: Dynamic Island/notch (≈59px) + TG header overlay.
      // Enforce at least 54px.
      safeTop = Math.max(topInset, 54);
    } else {
      // Non-fullscreen: TG renders its native header ABOVE the WebView,
      // so the WebView content area is already below TG chrome.
      // A small padding (12px) provides breathing room.
      // If TG reports a non-zero inset, respect it.
      safeTop = topInset > 0 ? topInset : 12;
    }

    document.documentElement.style.setProperty('--safe-area-top', `${safeTop}px`);
    document.documentElement.style.setProperty('--tg-is-fullscreen', inFullscreen ? '1' : '0');

    console.log(`[TG SafeArea] sai.top=${saiTop} csai.top=${csaiTop} topInset=${topInset} fullscreen=${inFullscreen} fsRequested=${_fullscreenRequested} android=${android} ios=${ios} → safeTop=${safeTop}px`);
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

    // setHeaderColor requires 6.1+, setBottomBarColor requires 7.10+
    if (isVersionAtLeast('6.1')) {
      try { wa.setHeaderColor('bg_color'); } catch {}
      try { wa.setBackgroundColor('bg_color'); } catch {}
    }
    if (isVersionAtLeast('7.10')) {
      try { wa.setBottomBarColor?.('bg_color'); } catch {}
    }

    // Enable closing confirmation (6.2+)
    if (isVersionAtLeast('6.2')) {
      try { wa.enableClosingConfirmation(); } catch {}
    }
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

    // Version gate: don't even touch the method on <8.0 to avoid SDK warnings
    if (!isVersionAtLeast('8.0')) {
      return false;
    }

    if (typeof wa.requestFullscreen === 'function') {
      _fullscreenRequested = true;
      wa.requestFullscreen();
      console.log('[TG] requestFullscreen() called');
      return true;
    }

    console.warn('[TG] requestFullscreen: version OK but method not found');
  } catch (err) {
    console.warn('[TG] requestFullscreen error:', err);
    return false;
  }
  return false;
}

// ---- Vertical Swipes ----

/**
 * Disable vertical swipes to prevent accidental mini app closing (Bot API 7.7+).
 */
export function disableVerticalSwipes(): boolean {
  try {
    const wa = getTelegramWebApp();
    if (!wa) return false;

    // Version gate: don't touch on <7.7 to avoid SDK warnings
    if (!isVersionAtLeast('7.7')) {
      return false;
    }

    if (typeof wa.disableVerticalSwipes === 'function') {
      wa.disableVerticalSwipes();
      console.log('[TG] disableVerticalSwipes() called');
      return true;
    }
  } catch (err) {
    console.warn('[TG] disableVerticalSwipes error:', err);
  }
  return false;
}

// ---- Closing Confirmation ----

/**
 * Enable closing confirmation dialog (Bot API 6.2+).
 */
export function enableClosingConfirmation(): boolean {
  try {
    const wa = getTelegramWebApp();
    if (!wa) return false;

    // Version gate: don't touch on <6.2 to avoid SDK warnings
    if (!isVersionAtLeast('6.2')) {
      return false;
    }

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