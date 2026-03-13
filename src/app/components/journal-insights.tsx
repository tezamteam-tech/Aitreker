// =============================================
// Proper Food AI — Journal AI Insights
// =============================================
// AI-powered analysis of journal entries.
// Shows themes, patterns, strengths, areas
// to work on, and actionable advice.
// =============================================

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Sparkles,
  Target,
  Lightbulb,
  Quote,
  Loader2,
  BarChart3,
  AlertCircle,
  Zap,
  Bot,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { api } from './api-client';
import { hapticFeedback } from './telegram';
import { useTranslation } from './i18n';
import { PremiumGate } from './premium-gate';
import { PageHeader } from './page-header';

interface Theme {
  name: string;
  count: number;
  emoji: string;
  description: string;
}

interface Advice {
  title: string;
  description: string;
}

interface InsightsData {
  summary: string;
  themes: Theme[];
  patterns: string[];
  moodTrend: 'improving' | 'stable' | 'declining' | 'fluctuating';
  strengths: string[];
  areasToWork: string[];
  advice: Advice[];
  keyQuote: string;
  noteCount: number;
  period: string;
}

const MOOD_CONFIG = {
  improving: { icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-400/10', key: 'insights_mood_improving' },
  stable: { icon: Minus, color: 'text-blue-400', bg: 'bg-blue-400/10', key: 'insights_mood_stable' },
  declining: { icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-400/10', key: 'insights_mood_declining' },
  fluctuating: { icon: Activity, color: 'text-yellow-400', bg: 'bg-yellow-400/10', key: 'insights_mood_fluctuating' },
};

export function JournalInsightsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<InsightsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = useCallback(async () => {
    setLoading(true);
    setError(null);
    hapticFeedback('medium');
    try {
      const res = await api.journalInsights(period);
      setData(res as any);
    } catch (err: any) {
      console.error('[Insights] Error:', err);
      if (err?.code === 'INSUFFICIENT_DATA') {
        setError(t('insights_not_enough'));
      } else if (err?.code === 'RATE_LIMITED') {
        setError(err.message);
      } else {
        setError(err?.message || 'Error generating insights');
      }
    } finally {
      setLoading(false);
    }
  }, [period, t]);

  const moodConfig = data?.moodTrend ? MOOD_CONFIG[data.moodTrend] || MOOD_CONFIG.stable : null;
  const MoodIcon = moodConfig?.icon || Minus;

  return (
    <PremiumGate feature="insights">
    <div className="min-h-screen pb-28">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-[#6c5ce7]/10 blur-[100px]" />
        <div className="absolute bottom-1/4 -left-16 w-48 h-48 rounded-full bg-[#00cec9]/8 blur-[80px]" />
      </div>

      <div className="relative z-10 px-5 pb-6" style={{ paddingTop: 'var(--safe-area-top, 56px)' }}>
        {/* Header */}
        <PageHeader title={t('insights_title')} />

        {/* Period toggle + analyze button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex items-center gap-3 mb-6"
        >
          <div className="flex bg-white/[0.04] rounded-xl border border-white/[0.06] p-1 flex-1">
            {(['week', 'month'] as const).map((p) => (
              <button
                key={p}
                onClick={() => { hapticFeedback('light'); setPeriod(p); setData(null); setError(null); }}
                className={`flex-1 py-2 rounded-lg transition-all ${
                  period === p
                    ? 'bg-[#6c5ce7]/20 border border-[#6c5ce7]/30 text-white'
                    : 'text-white/40'
                }`}
                style={{ fontSize: '0.875rem', fontWeight: period === p ? 600 : 400 }}
              >
                {t(`insights_${p}`)}
              </button>
            ))}
          </div>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleAnalyze}
            disabled={loading}
            className="h-10 px-5 rounded-xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white flex items-center gap-2 disabled:opacity-40"
            style={{ fontSize: '0.875rem', fontWeight: 600 }}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {loading ? t('insights_generating') : t('insights_generate')}
          </motion.button>
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <GlassCard padding="md" className="mb-4 border-red-500/20">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-red-400/80" style={{ fontSize: '0.875rem' }}>{error}</p>
                </div>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty state */}
        {!data && !loading && !error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <BarChart3 className="w-12 h-12 text-white/10 mx-auto mb-4" />
            <p className="text-white/30 mb-2" style={{ fontSize: '1rem', fontWeight: 500 }}>
              {t('insights_title')}
            </p>
            <p className="text-white/15 max-w-xs mx-auto" style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>
              {t('insights_not_enough')}
            </p>
          </motion.div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-[#6c5ce7]/10 flex items-center justify-center">
                <Brain className="w-8 h-8 text-[#a29bfe] animate-pulse" />
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-[#6c5ce7]/20 animate-spin" style={{ borderTopColor: '#6c5ce7' }} />
            </div>
            <p className="text-white/40" style={{ fontSize: '0.875rem' }}>{t('insights_generating')}</p>
          </div>
        )}

        {/* Results */}
        {data && !loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            {/* Note count badge */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-center"
            >
              <span className="px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-white/40" style={{ fontSize: '0.75rem' }}>
                {t('insights_entries', { count: data.noteCount })}
              </span>
            </motion.div>

            {/* Summary */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
              <GlassCard padding="md">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-[#6c5ce7]/15 flex items-center justify-center">
                    <BarChart3 className="w-4 h-4 text-[#a29bfe]" />
                  </div>
                  <span className="text-white" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{t('insights_summary')}</span>
                </div>
                <p className="text-white/70" style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>{data.summary}</p>
              </GlassCard>
            </motion.div>

            {/* Mood Trend */}
            {moodConfig && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <GlassCard padding="md">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${moodConfig.bg} flex items-center justify-center`}>
                      <MoodIcon className={`w-5 h-5 ${moodConfig.color}`} />
                    </div>
                    <div>
                      <p className="text-white/40" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>{t('insights_mood')}</p>
                      <p className={`${moodConfig.color}`} style={{ fontSize: '1rem', fontWeight: 700 }}>
                        {t(moodConfig.key)}
                      </p>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            )}

            {/* Key Themes */}
            {data.themes && data.themes.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                <GlassCard padding="md">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-[#fd79a8]/15 flex items-center justify-center">
                      <Zap className="w-4 h-4 text-[#fd79a8]" />
                    </div>
                    <span className="text-white" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{t('insights_themes')}</span>
                  </div>
                  <div className="space-y-2.5">
                    {data.themes.map((theme, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <span style={{ fontSize: '1.25rem' }}>{theme.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-white" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{theme.name}</span>
                            <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-white/30" style={{ fontSize: '0.625rem' }}>
                              x{theme.count}
                            </span>
                          </div>
                          <p className="text-white/40" style={{ fontSize: '0.75rem', lineHeight: 1.4 }}>{theme.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              </motion.div>
            )}

            {/* Patterns */}
            {data.patterns && data.patterns.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <GlassCard padding="md">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-[#00cec9]/15 flex items-center justify-center">
                      <Activity className="w-4 h-4 text-[#00cec9]" />
                    </div>
                    <span className="text-white" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{t('insights_patterns')}</span>
                  </div>
                  <ul className="space-y-2">
                    {data.patterns.map((p, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-[#00cec9] mt-1.5" style={{ fontSize: '0.5rem' }}>&#9679;</span>
                        <span className="text-white/60" style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>{p}</span>
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              </motion.div>
            )}

            {/* Strengths */}
            {data.strengths && data.strengths.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                <GlassCard padding="md">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-emerald-400/15 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                    </div>
                    <span className="text-white" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{t('insights_strengths')}</span>
                  </div>
                  <ul className="space-y-2">
                    {data.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-emerald-400 mt-1.5" style={{ fontSize: '0.5rem' }}>&#9679;</span>
                        <span className="text-white/60" style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>{s}</span>
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              </motion.div>
            )}

            {/* Areas to work on */}
            {data.areasToWork && data.areasToWork.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                <GlassCard padding="md">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-yellow-400/15 flex items-center justify-center">
                      <Target className="w-4 h-4 text-yellow-400" />
                    </div>
                    <span className="text-white" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{t('insights_areas')}</span>
                  </div>
                  <ul className="space-y-2">
                    {data.areasToWork.map((a, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-yellow-400 mt-1.5" style={{ fontSize: '0.5rem' }}>&#9679;</span>
                        <span className="text-white/60" style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>{a}</span>
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              </motion.div>
            )}

            {/* Coach Advice */}
            {data.advice && data.advice.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                <GlassCard padding="md">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-[#a29bfe]/15 flex items-center justify-center">
                      <Lightbulb className="w-4 h-4 text-[#a29bfe]" />
                    </div>
                    <span className="text-white" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{t('insights_advice')}</span>
                  </div>
                  <div className="space-y-3">
                    {data.advice.map((adv, i) => (
                      <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                        <p className="text-white mb-1" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{adv.title}</p>
                        <p className="text-white/50" style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>{adv.description}</p>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              </motion.div>
            )}

            {/* Key Quote */}
            {data.keyQuote && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                <GlassCard padding="md" className="border-[#6c5ce7]/20">
                  <div className="flex gap-3">
                    <Quote className="w-5 h-5 text-[#a29bfe]/40 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-white/40 mb-1" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>{t('insights_quote')}</p>
                      <p className="text-white/70 italic" style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
                        "{data.keyQuote}"
                      </p>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            )}

            {/* Discuss with Coach button */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  hapticFeedback('medium');
                  // Compose a summary message to send to the coach
                  const insightsSummary = [
                    data.summary,
                    data.moodTrend ? `Mood trend: ${t(MOOD_CONFIG[data.moodTrend]?.key || 'insights_mood_stable')}` : '',
                    data.themes?.length ? `Key themes: ${data.themes.map(th => `${th.emoji} ${th.name}`).join(', ')}` : '',
                    data.strengths?.length ? `Strengths: ${data.strengths.join('; ')}` : '',
                    data.areasToWork?.length ? `Areas to work on: ${data.areasToWork.join('; ')}` : '',
                  ].filter(Boolean).join('\n\n');
                  navigate('/coach', { state: { insightsContext: insightsSummary, period } });
                }}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-[#6c5ce7]/20 to-[#00cec9]/20 border border-[#6c5ce7]/30 text-white flex items-center justify-center gap-2.5"
                style={{ fontSize: '0.9375rem', fontWeight: 600 }}
              >
                <Bot className="w-5 h-5 text-[#a29bfe]" />
                {t('insights_discuss_coach')}
              </motion.button>
              <p className="text-center text-white/20 mt-2" style={{ fontSize: '0.75rem' }}>
                {t('insights_discuss_desc')}
              </p>
            </motion.div>
          </motion.div>
        )}
      </div>
    </div>
    </PremiumGate>
  );
}