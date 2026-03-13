import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bot,
  Webhook,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  ExternalLink,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { api } from './api-client';
import { hapticFeedback } from './telegram';
import { useTranslation } from './i18n';

interface WebhookStatus {
  url?: string;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
  miniAppUrl?: string;
}

export function BotSetupSection() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [webhookInfo, setWebhookInfo] = useState<WebhookStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [setupResult, setSetupResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  const fetchStatus = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const info = await api.getWebhookInfo();
      setWebhookInfo(info);
    } catch (err: any) {
      console.error('[BotSetup] Failed to fetch webhook info:', err);
      setError(err?.message || 'Failed to fetch webhook status');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isExpanded && !webhookInfo) {
      fetchStatus();
    }
  }, [isExpanded]);

  const handleSetup = async () => {
    hapticFeedback('medium');
    setIsLoading(true);
    setSetupResult(null);
    setError(null);

    try {
      const result = await api.setupTelegramBot();
      if (result.success) {
        setSetupResult(t('bot_success'));
        // Refresh status
        const info = await api.getWebhookInfo();
        setWebhookInfo(info);
      } else {
        setError(result.message || 'Setup failed');
      }
    } catch (err: any) {
      console.error('[BotSetup] Setup error:', err);
      setError(err?.message || 'Setup failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForceReset = async () => {
    hapticFeedback('heavy');
    setIsLoading(true);
    setSetupResult(null);
    setError(null);

    try {
      const result = await api.forceResetWebhook();
      if (result.success) {
        setSetupResult(`Webhook force-reset! URL: ${result.webhookUrl || 'set'}`);
        const info = await api.getWebhookInfo();
        setWebhookInfo(info);
      } else {
        setError(result.message || 'Force reset failed');
      }
    } catch (err: any) {
      console.error('[BotSetup] Force reset error:', err);
      setError(err?.message || 'Force reset failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteWebhook = async () => {
    hapticFeedback('medium');
    setIsLoading(true);
    try {
      await api.deleteWebhook();
      setSetupResult(t('bot_webhook_removed'));
      setWebhookInfo(null);
      setTimeout(() => fetchStatus(), 500);
    } catch (err: any) {
      setError(err?.message || 'Failed to remove webhook');
    } finally {
      setIsLoading(false);
    }
  };

  const isWebhookActive = webhookInfo?.url && webhookInfo.url.length > 0;
  const hasError = webhookInfo?.last_error_message;

  return (
    <GlassCard padding="sm" className="overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => {
          hapticFeedback('light');
          setIsExpanded(!isExpanded);
        }}
        className="w-full flex items-center gap-3 px-2 py-3"
      >
        <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
          <Bot className="w-5 h-5 text-blue-400" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
            {t('bot_title')}
          </p>
          <p className="text-white/40" style={{ fontSize: '0.75rem' }}>
            {isWebhookActive ? t('bot_active') : t('bot_not_configured')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isWebhookActive && !hasError && (
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
          )}
          {isWebhookActive && hasError && (
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
          )}
          {!isWebhookActive && webhookInfo && (
            <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-white/20" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white/20" />
          )}
        </div>
      </button>

      {/* Expandable content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-3 space-y-3">
              {/* Status details */}
              {isLoading && !webhookInfo && (
                <div className="flex items-center justify-center py-4 gap-2 text-white/40">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span style={{ fontSize: '0.8125rem' }}>{t('bot_loading')}</span>
                </div>
              )}

              {webhookInfo && (
                <div className="rounded-xl bg-white/[0.03] p-3 space-y-2">
                  {/* Webhook URL */}
                  <div className="flex items-start gap-2">
                    <Webhook className="w-4 h-4 text-white/30 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-white/40" style={{ fontSize: '0.6875rem' }}>Webhook</p>
                      <p
                        className="text-white/70 truncate"
                        style={{ fontSize: '0.75rem' }}
                        title={webhookInfo.url || 'Not set'}
                      >
                        {webhookInfo.url || t('bot_not_set')}
                      </p>
                    </div>
                    {isWebhookActive ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-white/20 flex-shrink-0" />
                    )}
                  </div>

                  {/* Mini App URL */}
                  <div className="flex items-start gap-2">
                    <ExternalLink className="w-4 h-4 text-white/30 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-white/40" style={{ fontSize: '0.6875rem' }}>Mini App URL</p>
                      <p
                        className="text-white/70 truncate"
                        style={{ fontSize: '0.75rem' }}
                        title={webhookInfo.miniAppUrl || 'Not set'}
                      >
                        {webhookInfo.miniAppUrl || `(${t('bot_not_set')})`}
                      </p>
                    </div>
                  </div>

                  {/* Pending updates */}
                  {(webhookInfo.pending_update_count ?? 0) > 0 && (
                    <p className="text-amber-400/80" style={{ fontSize: '0.75rem' }}>
                      {webhookInfo.pending_update_count} {t('bot_pending', { count: webhookInfo.pending_update_count ?? 0 }).split(' ').slice(1).join(' ')}
                    </p>
                  )}

                  {/* Last error */}
                  {hasError && (
                    <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2">
                      <p className="text-red-400" style={{ fontSize: '0.75rem' }}>
                        {t('bot_last_error')}: {webhookInfo.last_error_message}
                      </p>
                      {webhookInfo.last_error_date && (
                        <p className="text-red-400/50 mt-0.5" style={{ fontSize: '0.6875rem' }}>
                          {new Date(webhookInfo.last_error_date * 1000).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Success message */}
              {setupResult && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2"
                >
                  <p className="text-emerald-400 text-center" style={{ fontSize: '0.8125rem' }}>
                    {setupResult}
                  </p>
                </motion.div>
              )}

              {/* Error message */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg bg-red-500/10 border border-red-500/20 p-2"
                >
                  <p className="text-red-400 text-center" style={{ fontSize: '0.8125rem' }}>
                    {error}
                  </p>
                </motion.div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleSetup}
                  disabled={isLoading}
                  className="flex-1 h-10 rounded-xl bg-[#6c5ce7]/20 border border-[#6c5ce7]/30 text-[#a29bfe] flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ fontSize: '0.8125rem', fontWeight: 500 }}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Bot className="w-4 h-4" />
                  )}
                  {isWebhookActive ? t('bot_reconfigure') : t('bot_setup')}
                </button>

                <button
                  onClick={handleForceReset}
                  disabled={isLoading}
                  className="h-10 px-3 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-400 flex items-center justify-center gap-1.5 disabled:opacity-40"
                  style={{ fontSize: '0.75rem', fontWeight: 500 }}
                  title="Force re-register webhook even if it looks correct"
                >
                  <Webhook className="w-3.5 h-3.5" />
                  {t('bot_fix')}
                </button>

                <button
                  onClick={fetchStatus}
                  disabled={isLoading}
                  className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center disabled:opacity-40"
                >
                  <RefreshCw className={`w-4 h-4 text-white/40 ${isLoading ? 'animate-spin' : ''}`} />
                </button>

                {isWebhookActive && (
                  <button
                    onClick={handleDeleteWebhook}
                    disabled={isLoading}
                    className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center disabled:opacity-40"
                  >
                    <Trash2 className="w-4 h-4 text-red-400/60" />
                  </button>
                )}
              </div>

              {/* Instructions */}
              <div className="rounded-xl bg-white/[0.02] p-3">
                <p className="text-white/30" style={{ fontSize: '0.6875rem', lineHeight: 1.5 }}>
                  {t('bot_info')}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}