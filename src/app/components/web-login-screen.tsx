// =============================================
// Proper Food AI — Web Login Screen
// =============================================
// Shown when the app is opened in a regular browser (not Telegram).
// Flow:
//   1. Call POST /auth/web-init → get code + botLink
//   2. User taps botLink → opens Telegram bot → /start webauth_CODE
//   3. Poll GET /auth/web-check/:code every 2.5s
//   4. When confirmed → receive session token → redirect to app
// =============================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, CheckCircle2, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { useTranslation } from './i18n';
import { api } from './api-client';

type WebAuthState = 'init' | 'loading' | 'waiting' | 'confirmed' | 'expired' | 'error';

interface WebLoginScreenProps {
  /** Called when auth is confirmed — triggers re-login in AuthContext */
  onAuthConfirmed: () => void;
  /** Called when user wants to retry standard auth */
  onRetry: () => void;
}

export function WebLoginScreen({ onAuthConfirmed, onRetry }: WebLoginScreenProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<WebAuthState>('init');
  const [botLink, setBotLink] = useState('');
  const [code, setCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Initialize web auth session
  const initWebAuth = useCallback(async () => {
    setState('loading');
    setErrorMsg('');
    try {
      const result = await api.webAuthInit();
      if (!mountedRef.current) return;
      setCode(result.code);
      setBotLink(result.botLink);
      setState('waiting');
      console.log('[WebAuth] Initialized, code:', result.code);

      // Start polling
      if (pollRef.current) clearInterval(pollRef.current);
      let pollCount = 0;
      const maxPolls = 120; // 5 min at 2.5s intervals
      pollRef.current = setInterval(async () => {
        pollCount++;
        if (pollCount > maxPolls) {
          if (pollRef.current) clearInterval(pollRef.current);
          if (mountedRef.current) setState('expired');
          return;
        }
        try {
          const check = await api.webAuthCheck(result.code);
          if (!mountedRef.current) return;
          if (check.status === 'confirmed') {
            if (pollRef.current) clearInterval(pollRef.current);
            setState('confirmed');
            console.log('[WebAuth] Confirmed!');
            // Small delay for visual feedback, then trigger auth
            setTimeout(() => {
              if (mountedRef.current) onAuthConfirmed();
            }, 1200);
          } else if (check.status === 'expired') {
            if (pollRef.current) clearInterval(pollRef.current);
            setState('expired');
          }
        } catch (err) {
          console.warn('[WebAuth] Poll error:', err);
        }
      }, 2500);
    } catch (err: any) {
      console.error('[WebAuth] Init error:', err);
      if (!mountedRef.current) return;
      setErrorMsg(err?.message || 'Failed to initialize');
      setState('error');
    }
  }, [onAuthConfirmed]);

  // Auto-init on mount
  useEffect(() => {
    initWebAuth();
  }, [initWebAuth]);

  return (
    <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-background px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center gap-5 max-w-sm text-center"
      >
        {/* Logo / Icon */}
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#0088cc]/20 to-[#0088cc]/5 flex items-center justify-center border border-[#0088cc]/20">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="#0088cc">
            <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.94 8.13l-1.97 9.3c-.15.67-.54.83-1.1.52l-3.03-2.24-1.46 1.41c-.16.16-.3.3-.61.3l.22-3.07 5.57-5.03c.24-.22-.05-.33-.38-.13l-6.88 4.33-2.97-.93c-.64-.2-.66-.64.14-.95l11.6-4.47c.54-.2 1.01.13.87.96z" />
          </svg>
        </div>

        {/* Title */}
        <h1 className="text-foreground text-xl font-bold">
          {t('web_auth_title')}
        </h1>

        {/* State-dependent content */}
        <AnimatePresence mode="wait">
          {(state === 'init' || state === 'loading') && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3"
            >
              <Loader2 className="w-8 h-8 text-[#0088cc] animate-spin" />
              <p className="text-muted-foreground text-sm">
                {t('splash_loading')}
              </p>
            </motion.div>
          )}

          {state === 'waiting' && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4 w-full"
            >
              {/* Steps */}
              <div className="text-left text-sm text-muted-foreground space-y-2 w-full px-2">
                <p>{t('web_auth_step1')}</p>
                <p>{t('web_auth_step2')}</p>
                <p>{t('web_auth_step3')}</p>
              </div>

              {/* Open Bot button */}
              <a
                href={botLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-[#0088cc] text-white font-semibold text-sm transition-all active:scale-[0.97]"
                style={{ boxShadow: '0 4px 16px rgba(0,136,204,0.3)' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.94 8.13l-1.97 9.3c-.15.67-.54.83-1.1.52l-3.03-2.24-1.46 1.41c-.16.16-.3.3-.61.3l.22-3.07 5.57-5.03c.24-.22-.05-.33-.38-.13l-6.88 4.33-2.97-.93c-.64-.2-.66-.64.14-.95l11.6-4.47c.54-.2 1.01.13.87.96z" />
                </svg>
                {t('web_auth_btn')}
                <ExternalLink className="w-4 h-4 opacity-60" />
              </a>

              {/* Polling indicator */}
              <div className="flex items-center gap-2 text-muted-foreground text-xs mt-2">
                <div className="relative w-2 h-2">
                  <div className="absolute inset-0 rounded-full bg-[#0088cc] animate-ping opacity-75" />
                  <div className="relative rounded-full w-2 h-2 bg-[#0088cc]" />
                </div>
                {t('web_auth_waiting')}
              </div>
            </motion.div>
          )}

          {state === 'confirmed' && (
            <motion.div
              key="confirmed"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-3"
            >
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
              <p className="text-foreground font-semibold">
                {t('web_auth_success')}
              </p>
            </motion.div>
          )}

          {state === 'expired' && (
            <motion.div
              key="expired"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3"
            >
              <AlertCircle className="w-10 h-10 text-amber-500" />
              <p className="text-muted-foreground text-sm">
                {t('web_auth_expired')}
              </p>
              <button
                onClick={initWebAuth}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0088cc] text-white font-medium text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                {t('web_auth_retry')}
              </button>
            </motion.div>
          )}

          {state === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3"
            >
              <AlertCircle className="w-10 h-10 text-red-500" />
              <p className="text-muted-foreground text-sm">
                {t('web_auth_error')}
              </p>
              {errorMsg && (
                <p className="text-red-400/80 text-xs px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
                  {errorMsg}
                </p>
              )}
              <button
                onClick={initWebAuth}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0088cc] text-white font-medium text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                {t('web_auth_retry')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Retry standard auth link */}
        <button
          onClick={onRetry}
          className="mt-2 text-muted-foreground text-xs underline underline-offset-2"
        >
          {t('splash_retry_btn')}
        </button>
      </motion.div>
    </div>
  );
}
