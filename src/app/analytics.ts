import telegramAnalytics from '@telegram-apps/analytics';
import { retrieveRawInitData } from '@tma.js/sdk';

let _analyticsInitPromise: Promise<void> | null = null;
let _analyticsInitialized = false;

function loadTgAnalyticsScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') return reject(new Error('No document'));

    // If already loaded
    if ((window as any).telegramAnalytics?.init) return resolve();

    const existing = document.querySelector('script[data-tg-analytics="1"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('TG analytics script load failed')), { once: true });
      return;
    }

    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://tganalytics.xyz/index.js';
    s.type = 'text/javascript';
    s.dataset.tgAnalytics = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('TG analytics script load failed'));
    document.head.appendChild(s);
  });
}

export function isAnalyticsInitialized(): boolean {
  return _analyticsInitialized;
}

export function initTelegramAnalytics(): void {
  if (_analyticsInitialized) return;
  if (_analyticsInitPromise) return;

  const token = import.meta.env.VITE_TG_ANALYTICS_TOKEN as string | undefined;
  const appName = import.meta.env.VITE_TG_ANALYTICS_APP_NAME as string | undefined;
  if (!token || !appName) {
    if (import.meta.env.DEV) {
      console.info(
        '[ProperFood] Telegram Analytics skipped: set VITE_TG_ANALYTICS_TOKEN and VITE_TG_ANALYTICS_APP_NAME in .env',
      );
    }
    return;
  }

  // Same signals as auth: native WebApp and/or launch init from URL (#tgWebAppData / bridge).
  // Do not require "Telegram" in User-Agent — Chrome DevTools + tgWebAppData hash is valid for dev.
  let wa: any = null;
  try {
    wa = (window as any)?.Telegram?.WebApp;
  } catch {}

  let rawFromLaunch = '';
  try {
    rawFromLaunch = retrieveRawInitData() || '';
  } catch {}

  const hasWebInitData = !!(wa && typeof wa.initData === 'string' && wa.initData.length > 0);
  const hasWebInitDataUnsafe = !!(wa && wa.initDataUnsafe && typeof wa.initDataUnsafe === 'object');
  const hasLaunchInitData = rawFromLaunch.length > 0;

  if (!hasWebInitData && !hasWebInitDataUnsafe && !hasLaunchInitData) {
    if (import.meta.env.DEV) {
      console.info(
        '[ProperFood] Telegram Analytics skipped: no initData (open as Mini App or use #tgWebAppData in URL for local test)',
      );
    }
    return;
  }

  // Run once, don't block render; SDK will send "app-init" automatically.
  try {
    _analyticsInitPromise = telegramAnalytics
      .init({ token, appName, env: 'PROD' })
      .then(() => {
        _analyticsInitialized = true;
        console.log('[ProperFood] Telegram Analytics initialized');
      })
      .catch((err) => {
        console.warn('[ProperFood] Telegram Analytics init failed:', err);
        // Fallback to script-tag version (more compatible with some TG environments)
        _analyticsInitPromise = loadTgAnalyticsScript()
          .then(() => {
            const w = window as any;
            if (!w.telegramAnalytics?.init) throw new Error('window.telegramAnalytics missing after load');
            return w.telegramAnalytics.init({ token, appName });
          })
          .then(() => {
            _analyticsInitialized = true;
            console.log('[ProperFood] Telegram Analytics initialized (script fallback)');
          })
          .catch((e) => {
            console.warn('[ProperFood] Telegram Analytics script fallback failed:', e);
          });
      });
  } catch (err) {
    // Some SDK failures can throw synchronously before returning a Promise.
    console.warn('[ProperFood] Telegram Analytics init threw:', err);
    _analyticsInitPromise = loadTgAnalyticsScript()
      .then(() => {
        const w = window as any;
        if (!w.telegramAnalytics?.init) throw new Error('window.telegramAnalytics missing after load');
        return w.telegramAnalytics.init({ token, appName });
      })
      .then(() => {
        _analyticsInitialized = true;
        console.log('[ProperFood] Telegram Analytics initialized (script fallback)');
      })
      .catch((e) => {
        console.warn('[ProperFood] Telegram Analytics script fallback failed:', e);
      });
  }
}

