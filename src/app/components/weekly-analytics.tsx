// =============================================
// Analytics Page — Week / Month / Quarter views
// =============================================
// Shows nutrition vs workout correlation data.
// Period tabs: Week (7d), Month (30d), Quarter (90d)
// Week view: daily bar chart + daily breakdown
// Month/Quarter view: weekly bucket AreaChart + trends
// =============================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Flame,
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  Calendar,
  ChevronRight,
  Loader2,
  BarChart3,
  Minus,
  Trophy,
  Utensils,
  Dumbbell,
  ArrowUp,
  ArrowDown,
  Activity,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
  AreaChart,
  Area,
  ComposedChart,
  Line,
} from 'recharts';
import { GlassCard } from './glass-card';
import { useAuth } from './auth-context';
import { api } from './api-client';
import { hapticFeedback } from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';

type Period = 'week' | 'month' | 'quarter';

// ---- Weekly interfaces ----
interface DayData {
  date: string;
  day: string;
  consumed: number;
  target: number;
  burned: number;
  burned_smartburn: number;
  burned_workout: number;
  burned_count: number;
  burned_duration: number;
  net_balance: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface WeeklySummary {
  total_consumed: number;
  total_burned: number;
  total_target: number;
  avg_consumed: number;
  avg_burned: number;
  days_over_target: number;
  days_under_target: number;
  best_burn_day: string;
  best_burn_calories: number;
  net_weekly: number;
  calorie_target: number;
}

// ---- Extended interfaces ----
interface WeekBucket {
  week: number;
  start: string;
  end: string;
  label: string;
  avg_consumed: number;
  avg_burned: number;
  total_consumed: number;
  total_burned: number;
  net_balance: number;
  days_tracked: number;
  days_with_workout: number;
  avg_protein: number;
  avg_carbs: number;
  avg_fat: number;
}

interface ExtendedTrends {
  consumed_change: number;
  burned_change: number;
  net_change: number;
  workout_frequency_change: number;
}

interface ExtendedSummary {
  period: number;
  active_days: number;
  total_consumed: number;
  total_burned: number;
  total_smartburn: number;
  total_workout: number;
  avg_daily_consumed: number;
  avg_daily_burned: number;
  calorie_target: number;
  net_total: number;
  workout_days: number;
}

export function WeeklyAnalyticsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [period, setPeriod] = useState<Period>('week');
  const [loading, setLoading] = useState(true);

  // Weekly data
  const [days, setDays] = useState<DayData[]>([]);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);

  // Extended data (month/quarter)
  const [weekBuckets, setWeekBuckets] = useState<WeekBucket[]>([]);
  const [trends, setTrends] = useState<ExtendedTrends | null>(null);
  const [extSummary, setExtSummary] = useState<ExtendedSummary | null>(null);

  const loadWeeklyData = useCallback(() => {
    if (!user) return;
    setLoading(true);
    api.getWeeklyAnalytics()
      .then((data) => {
        setDays(data.days);
        setWeeklySummary(data.summary);
      })
      .catch((err) => console.warn('[Analytics] Weekly load failed:', err))
      .finally(() => setLoading(false));
  }, [user]);

  const loadExtendedData = useCallback((p: 30 | 90) => {
    if (!user) return;
    setLoading(true);
    api.getExtendedAnalytics(p)
      .then((data) => {
        setWeekBuckets(data.weeks);
        setTrends(data.trends);
        setExtSummary(data.summary);
      })
      .catch((err) => console.warn('[Analytics] Extended load failed:', err))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (period === 'week') loadWeeklyData();
    else if (period === 'month') loadExtendedData(30);
    else loadExtendedData(90);
  }, [period, loadWeeklyData, loadExtendedData]);

  const handlePeriodChange = (p: Period) => {
    hapticFeedback('light');
    setPeriod(p);
    setSelectedDay(null);
  };

  // Chart data for weekly view
  const weeklyChartData = useMemo(() => {
    return days.map((d) => ({
      name: d.day,
      date: d.date,
      consumed: d.consumed,
      burned: d.burned,
      target: d.target,
      net: d.net_balance,
    }));
  }, [days]);

  // Chart data for monthly/quarterly view — weekly buckets as area chart
  const trendChartData = useMemo(() => {
    return weekBuckets.map((w) => ({
      name: w.label,
      consumed: w.avg_consumed,
      burned: w.avg_burned,
      target: extSummary?.calorie_target || 2000,
    }));
  }, [weekBuckets, extSummary]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const consumed = payload.find((p: any) => p.dataKey === 'consumed')?.value || 0;
    const burned = payload.find((p: any) => p.dataKey === 'burned')?.value || 0;
    return (
      <div className="rounded-xl p-3 border" style={{ background: 'var(--chart-tooltip-bg)', borderColor: 'var(--chart-tooltip-border)', backdropFilter: 'blur(12px)' }}>
        <p style={{ color: 'var(--chart-tooltip-sub)', fontSize: '0.6875rem', marginBottom: '4px' }}>{label}</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#fd79a8]" />
            <span style={{ color: 'var(--chart-tooltip-text)', fontSize: '0.75rem' }}>{t('wa_consumed')}: {consumed} {t('unit_kcal')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#00cec9]" />
            <span style={{ color: 'var(--chart-tooltip-text)', fontSize: '0.75rem' }}>{t('wa_burned')}: {burned} {t('unit_kcal')}</span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen pb-28">
        <PageHeader title={t('ea_title')} subtitle={t('ea_subtitle')} />
        {/* Period tabs */}
        <div className="px-4 mt-3 mb-4">
          <PeriodTabs period={period} onChange={handlePeriodChange} t={t} />
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-[#6c5ce7] animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28">
      <PageHeader title={t('ea_title')} subtitle={t('ea_subtitle')} />

      <div className="px-4 space-y-4 mt-3">
        {/* Period tabs */}
        <PeriodTabs period={period} onChange={handlePeriodChange} t={t} />

        {/* ========= WEEK VIEW ========= */}
        {period === 'week' && (
          <>
            {/* Summary Stats Row */}
            {weeklySummary && (
              <div className="grid grid-cols-3 gap-2.5">
                <SummaryCard icon={Utensils} label={t('wa_avg_consumed')} value={`${weeklySummary.avg_consumed}`} unit={t('unit_kcal')} color="#fd79a8" />
                <SummaryCard icon={Flame} label={t('wa_avg_burned')} value={`${weeklySummary.avg_burned}`} unit={t('unit_kcal')} color="#00cec9" />
                <SummaryCard icon={Target} label={t('wa_target_label')} value={`${weeklySummary.calorie_target}`} unit={t('unit_kcal')} color="#a29bfe" />
              </div>
            )}

            {/* Main Chart */}
            <GlassCard className="!p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[#a29bfe]" />
                  <p className="text-foreground" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{t('wa_chart_title')}</p>
                </div>
                <ChartLegend t={t} />
              </div>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={weeklyChartData} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis dataKey="name" tick={{ fill: 'var(--chart-axis-tick)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--chart-axis-tick-secondary)', fontSize: 9 }} axisLine={false} tickLine={false} width={35} />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine
                      y={weeklySummary?.calorie_target || 2000}
                      stroke="rgba(162,155,254,0.4)"
                      strokeDasharray="4 4"
                      label={{ value: t('wa_target'), position: 'right', fill: 'rgba(162,155,254,0.5)', fontSize: 9 }}
                    />
                    <Bar dataKey="consumed" radius={[4, 4, 0, 0]} maxBarSize={24}>
                      {weeklyChartData.map((entry, index) => (
                        <Cell key={`consumed-${index}`} fill={entry.consumed > (weeklySummary?.calorie_target || 2000) ? '#e17055' : '#fd79a8'} fillOpacity={0.7} />
                      ))}
                    </Bar>
                    <Bar dataKey="burned" radius={[4, 4, 0, 0]} fill="#00cec9" fillOpacity={0.6} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            {/* Weekly Score */}
            {weeklySummary && <WeeklyBalanceCard summary={weeklySummary} t={t} />}

            {/* Daily Breakdown */}
            <DailyBreakdown days={days} selectedDay={selectedDay} setSelectedDay={setSelectedDay} weeklySummary={weeklySummary} t={t} />
          </>
        )}

        {/* ========= MONTH / QUARTER VIEW ========= */}
        {(period === 'month' || period === 'quarter') && extSummary && (
          <>
            {/* Trend Cards */}
            {trends && (
              <div className="grid grid-cols-2 gap-2.5">
                <TrendCard
                  icon={Utensils}
                  label={t('ea_trend_consumed')}
                  value={extSummary.avg_daily_consumed}
                  change={trends.consumed_change}
                  unit={t('unit_kcal')}
                  color="#fd79a8"
                  t={t}
                />
                <TrendCard
                  icon={Flame}
                  label={t('ea_trend_burned')}
                  value={extSummary.avg_daily_burned}
                  change={trends.burned_change}
                  unit={t('unit_kcal')}
                  color="#00cec9"
                  t={t}
                />
              </div>
            )}

            {/* Weekly Trend Area Chart */}
            <GlassCard className="!p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#a29bfe]" />
                  <p className="text-foreground" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{t('ea_weekly_trend')}</p>
                </div>
                <ChartLegend t={t} />
              </div>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <ComposedChart data={trendChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis dataKey="name" tick={{ fill: 'var(--chart-axis-tick)', fontSize: 8 }} axisLine={false} tickLine={false} angle={-25} textAnchor="end" height={40} />
                    <YAxis tick={{ fill: 'var(--chart-axis-tick-secondary)', fontSize: 9 }} axisLine={false} tickLine={false} width={35} />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine
                      y={extSummary.calorie_target}
                      stroke="rgba(162,155,254,0.4)"
                      strokeDasharray="4 4"
                      label={{ value: t('ea_target_line'), position: 'right', fill: 'rgba(162,155,254,0.5)', fontSize: 9 }}
                    />
                    <Area type="monotone" dataKey="consumed" fill="#fd79a8" fillOpacity={0.15} stroke="#fd79a8" strokeWidth={2} />
                    <Area type="monotone" dataKey="burned" fill="#00cec9" fillOpacity={0.1} stroke="#00cec9" strokeWidth={2} />
                    <Line type="monotone" dataKey="target" stroke="rgba(162,155,254,0.35)" strokeDasharray="6 3" dot={false} strokeWidth={1} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            {/* Period Summary */}
            <GlassCard className="!p-4">
              <p className="text-foreground mb-3" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                {t('ea_summary_period', { n: extSummary.period })}
              </p>

              <div className="grid grid-cols-2 gap-2.5">
                <StatPill label={t('ea_active_days')} value={`${extSummary.active_days}`} color="#a29bfe" />
                <StatPill label={t('ea_workout_days')} value={`${extSummary.workout_days}`} color="#00cec9" />
                <StatPill label={t('ea_total_consumed')} value={extSummary.total_consumed.toLocaleString()} color="#fd79a8" />
                <StatPill label={t('ea_total_burned')} value={extSummary.total_burned.toLocaleString()} color="#00cec9" />
                <StatPill label={t('ea_avg_daily') + ' (' + t('ea_consumed_label') + ')'} value={`${extSummary.avg_daily_consumed}`} color="#fd79a8" />
                <StatPill label={t('ea_avg_daily') + ' (' + t('ea_burned_label') + ')'} value={`${extSummary.avg_daily_burned}`} color="#00cec9" />
              </div>

              {/* Burn Breakdown */}
              {(extSummary.total_smartburn > 0 || extSummary.total_workout > 0) && (
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--glass-border-subtle)' }}>
                  <p className="text-ui-tertiary mb-2" style={{ fontSize: '0.6875rem' }}>{t('ea_burned_breakdown')}</p>
                  <div className="flex gap-3">
                    <div className="flex-1 p-2.5 rounded-xl bg-[#00cec9]/6 border border-[#00cec9]/12 text-center">
                      <p className="text-[#00cec9]" style={{ fontSize: '0.875rem', fontWeight: 700 }}>{extSummary.total_smartburn.toLocaleString()}</p>
                      <p className="text-ui-tertiary" style={{ fontSize: '0.5625rem' }}>{t('ea_smartburn_label')}</p>
                    </div>
                    <div className="flex-1 p-2.5 rounded-xl bg-[#a29bfe]/6 border border-[#a29bfe]/12 text-center">
                      <p className="text-[#a29bfe]" style={{ fontSize: '0.875rem', fontWeight: 700 }}>{extSummary.total_workout.toLocaleString()}</p>
                      <p className="text-ui-tertiary" style={{ fontSize: '0.5625rem' }}>{t('ea_workout_label')}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Net total */}
              <div className="flex items-center justify-between mt-3 p-3 rounded-xl" style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}>
                <span className="text-ui-secondary" style={{ fontSize: '0.75rem' }}>{t('ea_net_total')}</span>
                <span style={{
                  fontSize: '1rem', fontWeight: 800,
                  color: extSummary.net_total <= 0 ? '#00cec9' : '#e17055',
                }}>
                  {extSummary.net_total > 0 ? '+' : ''}{extSummary.net_total.toLocaleString()} {t('unit_kcal')}
                </span>
              </div>
            </GlassCard>

            {/* Weekly Buckets Breakdown */}
            {weekBuckets.length > 1 && (
              <div>
                <p className="text-muted-foreground mb-3 px-1" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                  {t('ea_weekly_trend')}
                </p>
                <div className="space-y-2">
                  {[...weekBuckets].reverse().map((w) => (
                    <GlassCard key={w.week} className="!p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-muted-foreground" style={{ fontSize: '0.625rem' }}>{w.label}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[#fd79a8]" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                              {w.avg_consumed} <span className="text-ui-tertiary" style={{ fontSize: '0.5rem' }}>{t('unit_kcal')}/d</span>
                            </span>
                            <span className="text-[#00cec9]" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                              {w.avg_burned} <span className="text-ui-tertiary" style={{ fontSize: '0.5rem' }}>{t('unit_kcal')}/d</span>
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p style={{
                            fontSize: '0.875rem', fontWeight: 700,
                            color: w.net_balance <= 0 ? '#00cec9' : '#e17055',
                          }}>
                            {w.net_balance > 0 ? '+' : ''}{w.net_balance.toLocaleString()}
                          </p>
                          <p className="text-ui-tertiary" style={{ fontSize: '0.5rem' }}>
                            {w.days_tracked}d tracked / {w.days_with_workout}d workout
                          </p>
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              </div>
            )}

            {/* No data state */}
            {weekBuckets.length === 0 && (
              <GlassCard className="!p-6 text-center">
                <BarChart3 className="w-8 h-8 text-ui-tertiary mx-auto mb-3" />
                <p className="text-ui-secondary" style={{ fontSize: '0.875rem' }}>{t('ea_no_data')}</p>
              </GlassCard>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ========= Sub-components =========

function PeriodTabs({ period, onChange, t }: { period: Period; onChange: (p: Period) => void; t: (k: string) => string }) {
  const tabs: { key: Period; label: string }[] = [
    { key: 'week', label: t('ea_period_week') },
    { key: 'month', label: t('ea_period_month') },
    { key: 'quarter', label: t('ea_period_quarter') },
  ];
  return (
    <div className="flex gap-1.5 p-1 rounded-2xl bg-ui-button" style={{ border: '1px solid var(--glass-border-subtle)' }}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`flex-1 py-2 rounded-xl transition-all ${
            period === tab.key
              ? 'bg-[#6c5ce7]/20 border border-[#6c5ce7]/30 text-[#a29bfe]'
              : 'text-muted-foreground'
          }`}
          style={{ fontSize: '0.75rem', fontWeight: period === tab.key ? 600 : 400 }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, unit, color }: {
  icon: any; label: string; value: string; unit: string; color: string;
}) {
  return (
    <GlassCard className="!p-3 text-center">
      <Icon className="w-4 h-4 mx-auto mb-1.5" style={{ color }} />
      <p style={{ fontSize: '1rem', fontWeight: 800, color }}>{value}</p>
      <p className="text-ui-tertiary mt-0.5" style={{ fontSize: '0.5rem' }}>{unit}</p>
      <p className="text-ui-tertiary mt-1" style={{ fontSize: '0.5625rem' }}>{label}</p>
    </GlassCard>
  );
}

function TrendCard({ icon: Icon, label, value, change, unit, color, t }: {
  icon: any; label: string; value: number; change: number; unit: string; color: string; t: (k: string, v?: any) => string;
}) {
  const isUp = change > 0;
  const changeStr = change === 0
    ? t('ea_trend_same')
    : isUp
      ? t('ea_trend_up', { val: Math.abs(change) })
      : t('ea_trend_down', { val: change });

  return (
    <GlassCard className="!p-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-muted-foreground" style={{ fontSize: '0.625rem' }}>{label}</span>
      </div>
      <p style={{ fontSize: '1.25rem', fontWeight: 800, color }}>{value}</p>
      <p className="text-ui-tertiary mt-0.5" style={{ fontSize: '0.5rem' }}>{unit}</p>
      <div className="flex items-center gap-1 mt-1.5">
        {change !== 0 && (
          isUp
            ? <ArrowUp className="w-2.5 h-2.5 text-[#e17055]" />
            : <ArrowDown className="w-2.5 h-2.5 text-[#00cec9]" />
        )}
        <span className="text-ui-tertiary" style={{ fontSize: '0.5625rem' }}>{changeStr}</span>
      </div>
    </GlassCard>
  );
}

function ChartLegend({ t }: { t: (k: string) => string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-[#fd79a8]" />
        <span className="text-ui-tertiary" style={{ fontSize: '0.5625rem' }}>{t('wa_consumed')}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-[#00cec9]" />
        <span className="text-ui-tertiary" style={{ fontSize: '0.5625rem' }}>{t('wa_burned')}</span>
      </div>
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between p-2.5 rounded-xl" style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}>
      <span className="text-ui-tertiary" style={{ fontSize: '0.625rem' }}>{label}</span>
      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color }}>{value}</span>
    </div>
  );
}

function MacroPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg p-2 text-center" style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}>
      <p className="text-ui-tertiary" style={{ fontSize: '0.5625rem' }}>{label}</p>
      <p style={{ fontSize: '0.8125rem', fontWeight: 700, color }}>{value}g</p>
    </div>
  );
}

function WeeklyBalanceCard({ summary, t }: { summary: WeeklySummary; t: (k: string, v?: any) => string }) {
  return (
    <GlassCard className="!p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
          background: summary.net_weekly <= 0
            ? 'linear-gradient(135deg, rgba(0,206,201,0.2), rgba(85,239,196,0.15))'
            : 'linear-gradient(135deg, rgba(225,112,85,0.2), rgba(253,203,110,0.15))',
        }}>
          {summary.net_weekly <= 0
            ? <TrendingDown className="w-5 h-5 text-[#00cec9]" />
            : <TrendingUp className="w-5 h-5 text-[#e17055]" />
          }
        </div>
        <div className="flex-1">
          <p className="text-foreground" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{t('wa_weekly_balance')}</p>
          <p className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>{t('wa_net_description')}</p>
        </div>
        <div className="text-right">
          <p style={{ fontSize: '1.125rem', fontWeight: 800, color: summary.net_weekly <= 0 ? '#00cec9' : '#e17055' }}>
            {summary.net_weekly > 0 ? '+' : ''}{summary.net_weekly.toLocaleString()}
          </p>
          <p className="text-ui-tertiary" style={{ fontSize: '0.625rem' }}>{t('unit_kcal')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <StatPill label={t('wa_days_over')} value={`${summary.days_over_target}`} color="#e17055" />
        <StatPill label={t('wa_days_under')} value={`${summary.days_under_target}`} color="#00cec9" />
        <StatPill label={t('wa_total_consumed')} value={summary.total_consumed.toLocaleString()} color="#fd79a8" />
        <StatPill label={t('wa_total_burned')} value={summary.total_burned.toLocaleString()} color="#00cec9" />
      </div>

      {summary.best_burn_calories > 0 && (
        <div className="flex items-center gap-2.5 mt-3 p-2.5 rounded-xl bg-[#00cec9]/6 border border-[#00cec9]/15">
          <Trophy className="w-4 h-4 text-[#fdcb6e] flex-shrink-0" />
          <span className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>
            {t('wa_best_burn', { day: summary.best_burn_day, cal: summary.best_burn_calories })}
          </span>
        </div>
      )}
    </GlassCard>
  );
}

function DailyBreakdown({ days, selectedDay, setSelectedDay, weeklySummary, t }: {
  days: DayData[];
  selectedDay: DayData | null;
  setSelectedDay: (d: DayData | null) => void;
  weeklySummary: WeeklySummary | null;
  t: (k: string, v?: any) => string;
}) {
  return (
    <div>
      <p className="text-muted-foreground mb-3 px-1" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
        {t('wa_daily_breakdown')}
      </p>
      <div className="space-y-2">
        {[...days].reverse().map((d) => {
          const isSelected = selectedDay?.date === d.date;
          const isOver = d.consumed > d.target;
          const diff = d.consumed - d.target;
          const isToday = d.date === new Date().toISOString().slice(0, 10);

          return (
            <motion.div key={d.date} layout>
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  hapticFeedback('light');
                  setSelectedDay(isSelected ? null : d);
                }}
                className={`w-full p-3 rounded-xl text-left transition-all`}
                style={{
                  background: isSelected ? 'var(--glass-bg-card)' : 'var(--glass-bg-row)',
                  border: `1px solid ${isSelected ? 'var(--glass-border)' : 'var(--glass-border-subtle)'}`,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-center w-10">
                      <p className="text-muted-foreground" style={{ fontSize: '0.5625rem' }}>{d.day}</p>
                      <p className={`${isToday ? 'text-[#a29bfe]' : 'text-foreground'}`} style={{ fontSize: '0.875rem', fontWeight: 700 }}>
                        {d.date.slice(8)}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-foreground" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                          {d.consumed > 0 ? d.consumed.toLocaleString() : '\u2014'}
                        </span>
                        {d.consumed > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full" style={{
                            fontSize: '0.5625rem', fontWeight: 600,
                            backgroundColor: isOver ? '#e1705512' : '#00cec912',
                            color: isOver ? '#e17055' : '#00cec9',
                          }}>
                            {diff > 0 ? '+' : ''}{diff} {t('unit_kcal')}
                          </span>
                        )}
                      </div>
                      {d.burned > 0 && (
                        <span className="flex items-center gap-1 text-[#00cec9]" style={{ fontSize: '0.625rem' }}>
                          <Flame className="w-2.5 h-2.5" />
                          {t('wa_burned_label', { cal: d.burned })}
                          {d.burned_smartburn > 0 && d.burned_workout > 0 && (
                            <span className="text-ui-tertiary ml-1">
                              (SB:{d.burned_smartburn} + W:{d.burned_workout})
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-ui-tertiary transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                </div>
              </motion.button>

              <AnimatePresence>
                {isSelected && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pt-2 pb-3 space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        <MacroPill label={t('hn_protein')} value={d.protein} color="#a29bfe" />
                        <MacroPill label={t('hn_carbs')} value={d.carbs} color="#fdcb6e" />
                        <MacroPill label={t('hn_fats')} value={d.fat} color="#e17055" />
                      </div>

                      {d.burned > 0 && (
                        <div className="flex items-center gap-3 p-2.5 rounded-lg bg-[#00cec9]/6 border border-[#00cec9]/12">
                          <Dumbbell className="w-4 h-4 text-[#00cec9]" />
                          <span className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>
                            {t('wa_burn_detail', { count: d.burned_count, cal: d.burned, min: d.burned_duration })}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between p-2.5 rounded-xl" style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}>
                        <span className="text-ui-secondary" style={{ fontSize: '0.625rem' }}>{t('wa_net_balance')}</span>
                        <span style={{
                          fontSize: '0.8125rem', fontWeight: 700,
                          color: d.net_balance <= 0 ? '#00cec9' : '#e17055',
                        }}>
                          {d.net_balance > 0 ? '+' : ''}{d.net_balance}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}