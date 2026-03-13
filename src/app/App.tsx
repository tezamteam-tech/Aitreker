// =============================================
// Proper Food AI — Main Application Entry Point
// =============================================
// Production entry point for Vercel deployment.
// Telegram SDK is loaded natively by the TG client.
// Debug mode: only via explicit URL parameter.
// =============================================

import { init } from './init';

// Debug mode — ONLY via explicit URL parameter.
// On production (Vercel), import.meta.env.DEV is always false.
// To enable debug: open the app with ?tgWebAppStartParam=debug
// or send /start debug to the bot.
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
