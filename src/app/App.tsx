// =============================================
// Proper Food AI — Main Application Entry Point
// =============================================
// Production entry point for Vercel deployment.
// Telegram SDK is loaded natively by the TG client.
// Debug mode: only via explicit URL parameter.
// v2 — cache bust
// =============================================

// ── FOUC Prevention ──────────────────────────────────────
// Executed SYNCHRONOUSLY before React renders.
// Sets .dark class based on Telegram color scheme or system preference.
// ThemeSync will later refine this, but initial render is correct.
(() => {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;

  // 1. Check Telegram color scheme first
  try {
    const wa = (window as any).Telegram?.WebApp;
    if (wa?.colorScheme) {
      if (wa.colorScheme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
      return;
    }
  } catch {}

  // 2. Fallback: system preference
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
})();

import { init } from './init';

// Debug mode — ONLY via explicit URL parameter.
const isDebugMode = (() => {
  if (typeof window === 'undefined') return false;
  const urlParams = new URLSearchParams(window.location.search);
  const startParam = urlParams.get('tgWebAppStartParam') || '';
  return startParam === 'debug';
})();

// Initialize BEFORE React loads (Eruda debugger, Telegram SDK)
init(isDebugMode);

import { RouterProvider } from 'react-router';
import { router } from './routes';

export default function App() {
  return <RouterProvider router={router} />;
}