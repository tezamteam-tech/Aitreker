import telegramAnalytics from '@telegram-apps/analytics';

let _analyticsInitPromise: Promise<void> | null = null;
let _analyticsInitialized = false;

export function isAnalyticsInitialized(): boolean {
  return _analyticsInitialized;
}

export function initTelegramAnalytics(): void {
  if (_analyticsInitialized) return;
  if (_analyticsInitPromise) return;

  const token = import.meta.env.VITE_TG_ANALYTICS_TOKEN as string | undefined;
  const appName = import.meta.env.VITE_TG_ANALYTICS_APP_NAME as string | undefined;
  if (!token || !appName) return;

  // SDK expects Telegram WebApp context. In regular browsers it may throw internally.
  // We enable analytics only when Telegram context is present.
  try {
    const wa = (window as any)?.Telegram?.WebApp;
    const hasWebApp = !!wa;
    const hasTgHash = typeof window !== 'undefined'
      && typeof window.location?.hash === 'string'
      && window.location.hash.includes('tgWebAppData=');
    if (!hasWebApp && !hasTgHash) return;
  } catch {
    return;
  }

  // Run once, don't block render; SDK will send "app-init" automatically.
  _analyticsInitPromise = telegramAnalytics
    .init({ token, appName })
    .then(() => {
      _analyticsInitialized = true;
      console.log('[ProperFood] Telegram Analytics initialized');
    })
    .catch((err) => {
      console.warn('[ProperFood] Telegram Analytics init failed:', err);
    });
}

