// =============================================
// Weight Tracking Screen — Full UI with Chart
// =============================================
// - Recharts line chart with weight trend over time
// - Quick log form with weight input + optional note
// - Weight history list with delete capability
// - Stats: current, goal, weekly change, trend
// =============================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Scale,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Target,
  Activity,
  Calendar,
  ArrowLeft,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Area,
  AreaChart,
  ReferenceLine,
} from 'recharts';
import { GlassCard } from './glass-card';
import { useAuth } from './auth-context';
import { api } from './api-client';
import { hapticFeedback } from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';

interface WeightEntry {
  id: string;
  weight: number;
  note: string | null;
  date: string;
  created_at: string;
}

interface ChartDataPoint {
  date: string;
  dateLabel: string;
  weight: number;
}

// ---- Custom Tooltip ----
function CustomTooltip({ active, payload, label }: any) {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  return (
    <div
      className="px-3 py-2 rounded-xl border border-white/10"
      style={{
        background: 'rgba(10, 10, 15, 0.9)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <p className="text-white/50 text-xs mb-0.5">{payload[0]?.payload?.dateLabel}</p>
      <p className="text-white font-semibold text-sm">{payload[0]?.value} {t('unit_kg')}</p>
    </div>
  );
}

// ---- Time range selector ----
type TimeRange = '7d' | '30d' | '90d' | 'all';

export function WeightTrackingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [showHistory, setShowHistory] = useState(false);

  // Log form state
  const [logWeight, setLogWeight] = useState('');
  const [logNote, setLogNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Goal weight (could come from profile in future)
  const [goalWeight, setGoalWeight] = useState<number | null>(null);

  // Load weight history
  const loadHistory = useCallback(async () => {
    try {
      const data = await api.getWeightHistory(365);
      setEntries(data.entries || []);
    } catch (err) {
      console.warn('[WeightTracking] Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadHistory();

    // Load profile for goal weight
    api.getUserProfile().then((profile) => {
      if (profile?.goal === 'lose_weight' && profile.weight) {
        // Estimate goal as ~5kg less for lose weight goal
        setGoalWeight(Math.round(profile.weight - 5));
      } else if (profile?.goal === 'gain_muscle' && profile.weight) {
        setGoalWeight(Math.round(profile.weight + 5));
      }
    }).catch(() => {});
  }, [user, loadHistory]);

  // Pre-fill with latest weight
  useEffect(() => {
    if (entries.length > 0 && !logWeight) {
      setLogWeight(String(entries[0].weight));
    }
  }, [entries]);

  // Handle save
  const handleSave = async () => {
    const w = parseFloat(logWeight);
    if (isNaN(w) || w < 20 || w > 500) return;

    setSaving(true);
    hapticFeedback('medium');
    try {
      await api.logWeight(w, logNote || undefined);
      setJustSaved(true);
      setLogNote('');
      await loadHistory();
      setTimeout(() => setJustSaved(false), 2000);
    } catch (err) {
      console.error('[WeightTracking] Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async (entryId: string) => {
    hapticFeedback('light');
    try {
      await api.deleteWeightEntry(entryId);
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    } catch (err) {
      console.error('[WeightTracking] Delete error:', err);
    }
  };

  // Adjust weight with +/- buttons
  const adjustWeight = (delta: number) => {
    hapticFeedback('light');
    const current = parseFloat(logWeight) || 0;
    const next = Math.max(20, Math.min(500, current + delta));
    setLogWeight(next.toFixed(1));
  };

  // Chart data based on time range
  const chartData = useMemo<ChartDataPoint[]>(() => {
    if (entries.length === 0) return [];

    const now = new Date();
    let cutoff: Date;
    switch (timeRange) {
      case '7d':
        cutoff = new Date(now.getTime() - 7 * 86400000);
        break;
      case '30d':
        cutoff = new Date(now.getTime() - 30 * 86400000);
        break;
      case '90d':
        cutoff = new Date(now.getTime() - 90 * 86400000);
        break;
      default:
        cutoff = new Date(0);
    }

    const locale = t('locale_code');
    return entries
      .filter((e) => new Date(e.date) >= cutoff)
      .reverse()
      .map((e) => {
        const d = new Date(e.date);
        return {
          date: e.date,
          dateLabel: d.toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
          weight: e.weight,
        };
      });
  }, [entries, timeRange, t]);

  // Stats
  const stats = useMemo(() => {
    if (entries.length === 0) return null;

    const latest = entries[0];
    const oldest = entries[entries.length - 1];
    const totalChange = latest.weight - oldest.weight;

    // Weekly change
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const weekOldEntry = entries.find((e) => e.date <= weekAgo);
    const weeklyChange = weekOldEntry ? latest.weight - weekOldEntry.weight : null;

    // Trend direction (last 3 entries)
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (entries.length >= 2) {
      const diff = entries[0].weight - entries[1].weight;
      if (diff > 0.2) trend = 'up';
      else if (diff < -0.2) trend = 'down';
    }

    // Average (last 7 entries)
    const last7 = entries.slice(0, 7);
    const avg = last7.reduce((sum, e) => sum + e.weight, 0) / last7.length;

    // Min/max in current range
    const rangeEntries = chartData.map((d) => d.weight);
    const min = rangeEntries.length > 0 ? Math.min(...rangeEntries) : latest.weight;
    const max = rangeEntries.length > 0 ? Math.max(...rangeEntries) : latest.weight;

    return {
      current: latest.weight,
      totalChange,
      weeklyChange,
      trend,
      avg: Math.round(avg * 10) / 10,
      min,
      max,
      entryCount: entries.length,
      firstDate: oldest.date,
    };
  }, [entries, chartData]);

  // Y-axis domain with padding
  const yDomain = useMemo(() => {
    if (chartData.length === 0) return [60, 90];
    const weights = chartData.map((d) => d.weight);
    const min = Math.min(...weights);
    const max = Math.max(...weights);
    const padding = Math.max((max - min) * 0.15, 1);
    return [Math.floor(min - padding), Math.ceil(max + padding)];
  }, [chartData]);

  const TIME_RANGES: { key: TimeRange; label: string }[] = [
    { key: '7d', label: '7D' },
    { key: '30d', label: '30D' },
    { key: '90d', label: '90D' },
    { key: 'all', label: t('wt_all') },
  ];

  return (
    <div className="min-h-screen pb-6">
      <PageHeader title={t('weight_title')} />

      <div className="px-4 space-y-4">

        {/* Current Weight + Trend */}
        {stats && (
          <GlassCard className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-muted-foreground text-xs mb-1">{t('weight_current')}</p>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-3xl text-foreground font-semibold">{stats.current}</h2>
                  <span className="text-lg text-muted-foreground">{t('unit_kg')}</span>
                </div>
              </div>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${
                stats.trend === 'down'
                  ? 'bg-[#00cec9]/10 border border-[#00cec9]/20'
                  : stats.trend === 'up'
                  ? 'bg-[#ff6b6b]/10 border border-[#ff6b6b]/20'
                  : 'bg-white/5 border border-white/10'
              }`}>
                {stats.trend === 'down' ? (
                  <TrendingDown className="w-4 h-4 text-[#00cec9]" />
                ) : stats.trend === 'up' ? (
                  <TrendingUp className="w-4 h-4 text-[#ff6b6b]" />
                ) : (
                  <Minus className="w-4 h-4 text-white/40" />
                )}
                <span className={`text-sm font-medium ${
                  stats.trend === 'down'
                    ? 'text-[#00cec9]'
                    : stats.trend === 'up'
                    ? 'text-[#ff6b6b]'
                    : 'text-white/40'
                }`}>
                  {stats.trend === 'down' ? t('wt_trend_losing') : stats.trend === 'up' ? t('wt_trend_gaining') : t('wt_trend_stable')}
                </span>
              </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2.5 rounded-xl" style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}>
                <p className="text-xs text-muted-foreground mb-1">{t('weight_week')}</p>
                <p className={`font-semibold text-sm ${
                  stats.weeklyChange !== null
                    ? stats.weeklyChange < 0 ? 'text-[#00cec9]' : stats.weeklyChange > 0 ? 'text-[#ff6b6b]' : 'text-foreground/60'
                    : 'text-muted-foreground'
                }`}>
                  {stats.weeklyChange !== null
                    ? `${stats.weeklyChange > 0 ? '+' : ''}${stats.weeklyChange.toFixed(1)} ${t('unit_kg')}`
                    : '—'}
                </p>
              </div>
              <div className="text-center p-2.5 rounded-xl" style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}>
                <p className="text-xs text-muted-foreground mb-1">{t('weight_avg')}</p>
                <p className="text-foreground/80 font-semibold text-sm">{stats.avg} {t('unit_kg')}</p>
              </div>
              <div className="text-center p-2.5 rounded-xl" style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}>
                <p className="text-xs text-muted-foreground mb-1">{t('weight_entries')}</p>
                <p className="text-foreground/80 font-semibold text-sm">{stats.entryCount}</p>
              </div>
            </div>
          </GlassCard>
        )}

        {/* Weight Chart */}
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#a29bfe]" />
              <h3 className="text-foreground font-medium text-sm">{t('weight_trend')}</h3>
            </div>

            {/* Time Range Selector */}
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/5 border border-white/[0.06]">
              {TIME_RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => { hapticFeedback('light'); setTimeRange(r.key); }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    timeRange === r.key
                      ? 'bg-[#6c5ce7]/30 text-[#a29bfe] border border-[#6c5ce7]/30'
                      : 'text-white/40 border border-transparent'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Chart */}
          {chartData.length > 1 ? (
            <div className="h-[200px] -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                  <defs>
                    <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6c5ce7" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#6c5ce7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.04)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={yDomain}
                    tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    tickFormatter={(v: number) => `${v}`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  {goalWeight && (
                    <ReferenceLine
                      y={goalWeight}
                      stroke="#00cec9"
                      strokeDasharray="6 4"
                      strokeWidth={1}
                      label={{
                        value: `${t('wt_goal_label')}: ${goalWeight}${t('unit_kg')}`,
                        position: 'right',
                        fill: 'rgba(0,206,201,0.6)',
                        fontSize: 10,
                      }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="weight"
                    stroke="#6c5ce7"
                    strokeWidth={2}
                    fill="url(#weightGradient)"
                    dot={chartData.length <= 30 ? { fill: '#6c5ce7', r: 3, strokeWidth: 0 } : false}
                    activeDot={{ fill: '#a29bfe', r: 5, strokeWidth: 2, stroke: '#0a0a0f' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : chartData.length === 1 ? (
            <div className="h-[200px] flex items-center justify-center">
              <div className="text-center">
                <Scale className="w-10 h-10 text-[#6c5ce7]/30 mx-auto mb-3" />
                <p className="text-white/40 text-sm">{chartData[0].weight} {t('unit_kg')}</p>
                <p className="text-white/20 text-xs mt-1">
                  {t('weight_need_more')}
                </p>
              </div>
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center">
              <div className="text-center">
                <Scale className="w-10 h-10 text-white/10 mx-auto mb-3" />
                <p className="text-white/30 text-sm">
                  {t('weight_no_data')}
                </p>
                <p className="text-white/20 text-xs mt-1">
                  {t('weight_log_first')}
                </p>
              </div>
            </div>
          )}

          {/* Min/Max range indicator */}
          {stats && chartData.length > 1 && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[#00cec9]" />
                <span className="text-xs text-white/40">{t('wt_min')}: {stats.min} {t('unit_kg')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[#ff6b6b]" />
                <span className="text-xs text-white/40">{t('wt_max')}: {stats.max} {t('unit_kg')}</span>
              </div>
            </div>
          )}
        </GlassCard>

        {/* Log Weight Form */}
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Scale className="w-5 h-5 text-[#6c5ce7]" />
            <h3 className="text-white font-medium">{t('weight_log_title')}</h3>
          </div>

          {/* Weight Input with +/- buttons */}
          <div className="flex items-center justify-center gap-4 mb-4">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => adjustWeight(-0.1)}
              className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center"
            >
              <Minus className="w-5 h-5 text-white/60" />
            </motion.button>

            <div className="relative">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min="20"
                max="500"
                value={logWeight}
                onChange={(e) => setLogWeight(e.target.value)}
                className="w-32 text-center text-3xl font-semibold text-white bg-transparent border-none outline-none"
                style={{ appearance: 'textfield' }}
                placeholder="0.0"
              />
              <p className="text-center text-white/30 text-xs mt-0.5">{t('unit_kg')}</p>
            </div>

            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => adjustWeight(0.1)}
              className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center"
            >
              <Plus className="w-5 h-5 text-white/60" />
            </motion.button>
          </div>

          {/* Optional Note */}
          <input
            type="text"
            value={logNote}
            onChange={(e) => setLogNote(e.target.value)}
            placeholder={t('weight_note_placeholder')}
            className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/[0.08] text-white/80 text-sm placeholder:text-white/20 outline-none focus:border-[#6c5ce7]/40 mb-4"
          />

          {/* Save Button */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            disabled={saving || !logWeight || parseFloat(logWeight) < 20}
            className={`w-full py-3 rounded-xl font-medium text-sm transition-all ${
              justSaved
                ? 'bg-[#00cec9]/20 text-[#00cec9] border border-[#00cec9]/30'
                : 'bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white'
            } disabled:opacity-40`}
          >
            {saving
              ? t('saving')
              : justSaved
              ? t('weight_saved')
              : t('weight_log_btn')}
          </motion.button>
        </GlassCard>

        {/* Weight History */}
        {entries.length > 0 && (
          <GlassCard className="p-4">
            <button
              onClick={() => { hapticFeedback('light'); setShowHistory(!showHistory); }}
              className="w-full flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#fd79a8]" />
                <h3 className="text-white font-medium text-sm">
                  {t('weight_history')}
                </h3>
                <span className="text-white/30 text-xs">({entries.length})</span>
              </div>
              {showHistory ? (
                <ChevronUp className="w-4 h-4 text-white/30" />
              ) : (
                <ChevronDown className="w-4 h-4 text-white/30" />
              )}
            </button>

            <AnimatePresence>
              {showHistory && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-2 mt-3 pt-3 border-t border-white/[0.06] max-h-[300px] overflow-y-auto">
                    {entries.slice(0, 30).map((entry, idx) => {
                      const d = new Date(entry.date);
                      const prevEntry = entries[idx + 1];
                      const diff = prevEntry ? entry.weight - prevEntry.weight : null;

                      return (
                        <motion.div
                          key={entry.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.03 }}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.04]"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-[#6c5ce7]/10 flex items-center justify-center">
                              <Scale className="w-4 h-4 text-[#a29bfe]" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-white text-sm font-medium">{entry.weight} {t('unit_kg')}</p>
                                {diff !== null && diff !== 0 && (
                                  <span className={`text-xs ${diff < 0 ? 'text-[#00cec9]' : 'text-[#ff6b6b]'}`}>
                                    {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                                  </span>
                                )}
                              </div>
                              <p className="text-white/30 text-xs">
                                {d.toLocaleDateString(t('locale_code'), { month: 'short', day: 'numeric', year: 'numeric' })}
                                {entry.note ? ` - ${entry.note}` : ''}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(entry.id);
                            }}
                            className="p-1.5 rounded-lg hover:bg-white/5"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-white/20" />
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </GlassCard>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div
              className="w-8 h-8 rounded-full border-2 border-transparent animate-spin"
              style={{
                borderTopColor: '#6c5ce7',
                borderRightColor: 'rgba(108, 92, 231, 0.3)',
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}