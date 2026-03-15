// =============================================
// Body Measurements Tracking Screen
// =============================================
// - Multi-line Recharts chart with measurement trends
// - Body fat % trend line
// - Body fat category scale visualization
// - Quick log form + history list
// =============================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Ruler,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Check,
  Activity,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { GlassCard } from './glass-card';
import { useAuth } from './auth-context';
import { api } from './api-client';
import { hapticFeedback } from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';

interface MeasEntry {
  id: string;
  neck_cm: number;
  chest_cm: number;
  waist_cm: number;
  hips_cm: number;
  body_fat_percent: number | null;
  note: string | null;
  date: string;
  created_at: string;
}

type TimeRange = '7d' | '30d' | '90d' | 'all';

// ---- Body Fat Category helpers ----
interface BfCategory {
  key: string;
  color: string;
  bg: string;
}

function getBodyFatCategory(bf: number, gender: string): BfCategory {
  if (gender === 'male') {
    if (bf < 6) return { key: 'pn_bf_essential', color: '#e17055', bg: 'rgba(225,112,85,0.15)' };
    if (bf < 14) return { key: 'pn_bf_athletic', color: '#00cec9', bg: 'rgba(0,206,201,0.15)' };
    if (bf < 18) return { key: 'pn_bf_fitness', color: '#6c5ce7', bg: 'rgba(108,92,231,0.15)' };
    if (bf < 25) return { key: 'pn_bf_acceptable', color: '#fdcb6e', bg: 'rgba(253,203,110,0.15)' };
    return { key: 'pn_bf_obese', color: '#d63031', bg: 'rgba(214,48,49,0.15)' };
  } else {
    if (bf < 14) return { key: 'pn_bf_essential', color: '#e17055', bg: 'rgba(225,112,85,0.15)' };
    if (bf < 21) return { key: 'pn_bf_athletic', color: '#00cec9', bg: 'rgba(0,206,201,0.15)' };
    if (bf < 25) return { key: 'pn_bf_fitness', color: '#6c5ce7', bg: 'rgba(108,92,231,0.15)' };
    if (bf < 32) return { key: 'pn_bf_acceptable', color: '#fdcb6e', bg: 'rgba(253,203,110,0.15)' };
    return { key: 'pn_bf_obese', color: '#d63031', bg: 'rgba(214,48,49,0.15)' };
  }
}

// Body fat category scale ranges for visualization
function getBfScaleRanges(gender: string) {
  if (gender === 'male') {
    return [
      { key: 'pn_bf_essential', min: 2, max: 6, color: '#e17055' },
      { key: 'pn_bf_athletic', min: 6, max: 14, color: '#00cec9' },
      { key: 'pn_bf_fitness', min: 14, max: 18, color: '#6c5ce7' },
      { key: 'pn_bf_acceptable', min: 18, max: 25, color: '#fdcb6e' },
      { key: 'pn_bf_obese', min: 25, max: 40, color: '#d63031' },
    ];
  }
  return [
    { key: 'pn_bf_essential', min: 10, max: 14, color: '#e17055' },
    { key: 'pn_bf_athletic', min: 14, max: 21, color: '#00cec9' },
    { key: 'pn_bf_fitness', min: 21, max: 25, color: '#6c5ce7' },
    { key: 'pn_bf_acceptable', min: 25, max: 32, color: '#fdcb6e' },
    { key: 'pn_bf_obese', min: 32, max: 45, color: '#d63031' },
  ];
}

// ---- Custom Tooltip ----
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3 py-2 text-xs" style={{ background: 'var(--glass-bg-elevated)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(20px)' }}>
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <span className="font-semibold">{p.value}</span>
          {p.dataKey === 'body_fat' ? '%' : ' cm'}
        </p>
      ))}
    </div>
  );
}

export function MeasurementsTrackingPage() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const [entries, setEntries] = useState<MeasEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');

  // Input fields
  const [inputNeck, setInputNeck] = useState('');
  const [inputChest, setInputChest] = useState('');
  const [inputWaist, setInputWaist] = useState('');
  const [inputHips, setInputHips] = useState('');
  const [inputNote, setInputNote] = useState('');

  // Load profile for gender
  const [gender, setGender] = useState<string>('male');
  useEffect(() => {
    try {
      const cached = localStorage.getItem('nutrition_profile');
      if (cached) {
        const p = JSON.parse(cached);
        if (p.gender) setGender(p.gender);
      }
    } catch {}
  }, []);

  // Load history
  const loadHistory = useCallback(async () => {
    try {
      const data = await api.getMeasurementsHistory(365);
      setEntries(data.entries || []);
    } catch (err) {
      console.warn('[Measurements] Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Prefill inputs from latest entry
  useEffect(() => {
    if (entries.length > 0) {
      const latest = entries[0];
      if (!inputNeck) setInputNeck(String(latest.neck_cm));
      if (!inputChest) setInputChest(String(latest.chest_cm));
      if (!inputWaist) setInputWaist(String(latest.waist_cm));
      if (!inputHips) setInputHips(String(latest.hips_cm));
    }
  }, [entries.length]);

  // Save measurement
  const saveMeasurement = async () => {
    const neck = Number(inputNeck);
    const chest = Number(inputChest);
    const waist = Number(inputWaist);
    const hips = Number(inputHips);
    if (neck <= 0 || chest <= 0 || waist <= 0 || hips <= 0) return;

    setSaving(true);
    hapticFeedback('medium');
    try {
      const res = await api.logMeasurements({
        neck_cm: neck, chest_cm: chest, waist_cm: waist, hips_cm: hips,
        note: inputNote || undefined,
      });
      if (res.entry) {
        // Replace or prepend
        setEntries((prev) => {
          const existing = prev.findIndex(e => e.date === res.entry.date);
          if (existing >= 0) {
            const copy = [...prev];
            copy[existing] = res.entry;
            return copy;
          }
          return [res.entry, ...prev];
        });
      }
      setInputNote('');
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (err) {
      console.error('[Measurements] Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (entryId: string) => {
    hapticFeedback('light');
    try {
      await api.deleteMeasurementEntry(entryId);
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    } catch (err) {
      console.error('[Measurements] Delete error:', err);
    }
  };

  // Filter entries by time range
  const filteredEntries = useMemo(() => {
    const now = Date.now();
    const cutoffs: Record<TimeRange, number> = {
      '7d': now - 7 * 86400000,
      '30d': now - 30 * 86400000,
      '90d': now - 90 * 86400000,
      'all': 0,
    };
    return entries.filter((e) => new Date(e.date).getTime() >= cutoffs[timeRange]);
  }, [entries, timeRange]);

  // Chart data
  const chartData = useMemo(() => {
    return [...filteredEntries].reverse().map((e) => ({
      date: e.date,
      dateLabel: new Date(e.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      neck: e.neck_cm,
      chest: e.chest_cm,
      waist: e.waist_cm,
      hips: e.hips_cm,
      body_fat: e.body_fat_percent,
    }));
  }, [filteredEntries]);

  // Stats
  const latest = entries[0] || null;
  const previous = entries[1] || null;

  const getChange = (field: keyof MeasEntry) => {
    if (!latest || !previous) return null;
    const diff = (latest[field] as number) - (previous[field] as number);
    return diff;
  };

  const latestBf = latest?.body_fat_percent;
  const bfCategory = latestBf ? getBodyFatCategory(latestBf, gender) : null;
  const bfRanges = getBfScaleRanges(gender);
  const bfScaleTotal = bfRanges[bfRanges.length - 1].max - bfRanges[0].min;

  const timeRanges: { key: TimeRange; label: string }[] = [
    { key: '7d', label: t('meas_week') },
    { key: '30d', label: t('meas_month') },
    { key: '90d', label: t('meas_3month') },
    { key: 'all', label: t('meas_all') },
  ];

  return (
    <div className="min-h-screen pb-32">
      <PageHeader title={t('meas_title')} />

      <div className="px-4 space-y-3">

        {/* ======== Current Stats ======== */}
        {latest && (
          <GlassCard className="p-4">
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: t('pn_neck'), value: latest.neck_cm, change: getChange('neck_cm') },
                { label: t('pn_chest'), value: latest.chest_cm, change: getChange('chest_cm') },
                { label: t('pn_waist'), value: latest.waist_cm, change: getChange('waist_cm') },
                { label: t('pn_hips'), value: latest.hips_cm, change: getChange('hips_cm') },
              ].map((item) => (
                <div key={item.label} className="text-center">
                  <p className="text-lg text-foreground font-semibold">
                    {item.value}
                    <span className="text-xs text-muted-foreground ml-0.5">{t('unit_cm')}</span>
                  </p>
                  <p className="text-[0.625rem] text-muted-foreground">{item.label}</p>
                  {item.change !== null && item.change !== 0 && (
                    <p className={`text-[0.5625rem] font-medium mt-0.5 ${item.change < 0 ? 'text-[#00cec9]' : 'text-[#e17055]'}`}>
                      {item.change > 0 ? '+' : ''}{item.change.toFixed(1)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* ======== Body Fat Category Scale ======== */}
        {latestBf && bfCategory && (
          <GlassCard className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#6c5ce7]" />
                <span className="text-sm text-foreground font-medium">{t('pn_body_fat')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="px-2 py-0.5 rounded-full text-[0.625rem] font-semibold"
                  style={{ background: bfCategory.bg, color: bfCategory.color }}
                >
                  {t(bfCategory.key)}
                </span>
                <span className="text-lg text-foreground font-bold">{latestBf}%</span>
              </div>
            </div>

            {/* Visual scale bar */}
            <div className="relative h-5 rounded-full overflow-hidden flex" style={{ background: 'var(--glass-bg-row)' }}>
              {bfRanges.map((range) => {
                const width = ((range.max - range.min) / bfScaleTotal) * 100;
                return (
                  <div
                    key={range.key}
                    className="h-full relative"
                    style={{ width: `${width}%`, backgroundColor: `${range.color}30` }}
                  />
                );
              })}
              {/* Indicator dot */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow-lg"
                style={{
                  left: `${Math.min(Math.max(((latestBf - bfRanges[0].min) / bfScaleTotal) * 100, 2), 98)}%`,
                  backgroundColor: bfCategory.color,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            </div>

            {/* Scale labels */}
            <div className="flex justify-between mt-1.5">
              {bfRanges.map((range) => (
                <span key={range.key} className="text-[0.5rem] text-muted-foreground" style={{ color: range.color }}>
                  {t(range.key)}
                </span>
              ))}
            </div>

            {/* Body fat change */}
            {previous?.body_fat_percent && latestBf && (
              <div className="mt-2 pt-2 flex items-center justify-center gap-1" style={{ borderTop: '1px solid var(--glass-border-subtle)' }}>
                {latestBf < previous.body_fat_percent ? (
                  <TrendingDown className="w-3.5 h-3.5 text-[#00cec9]" />
                ) : latestBf > previous.body_fat_percent ? (
                  <TrendingUp className="w-3.5 h-3.5 text-[#e17055]" />
                ) : (
                  <Minus className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                <span className={`text-xs font-medium ${
                  latestBf < previous.body_fat_percent ? 'text-[#00cec9]' : latestBf > previous.body_fat_percent ? 'text-[#e17055]' : 'text-muted-foreground'
                }`}>
                  {(latestBf - previous.body_fat_percent) > 0 ? '+' : ''}{(latestBf - previous.body_fat_percent).toFixed(1)}% {t('meas_change').toLowerCase()}
                </span>
              </div>
            )}
          </GlassCard>
        )}

        {/* ======== Chart ======== */}
        {chartData.length >= 2 ? (
          <GlassCard className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-foreground font-medium">{t('meas_trend')}</p>
            </div>

            {/* Time range selector */}
            <div className="grid grid-cols-4 gap-1 mb-4 p-0.5 rounded-xl" style={{ background: 'var(--glass-bg-row)' }}>
              {timeRanges.map((r) => (
                <button
                  key={r.key}
                  onClick={() => { hapticFeedback('light'); setTimeRange(r.key); }}
                  className={`py-1.5 rounded-lg text-xs font-medium transition-all ${
                    timeRange === r.key
                      ? 'bg-[#6c5ce7]/15 text-foreground'
                      : 'text-muted-foreground'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border-subtle)" />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="chest" name={t('pn_chest')} stroke="#00cec9" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="waist" name={t('pn_waist')} stroke="#e17055" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="hips" name={t('pn_hips')} stroke="#fd79a8" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="neck" name={t('pn_neck')} stroke="#74b9ff" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap justify-center gap-3 mt-2">
              {[
                { label: t('pn_chest'), color: '#00cec9' },
                { label: t('pn_waist'), color: '#e17055' },
                { label: t('pn_hips'), color: '#fd79a8' },
                { label: t('pn_neck'), color: '#74b9ff' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-[0.625rem] text-muted-foreground">{item.label}</span>
                </div>
              ))}
            </div>

            {/* Body Fat Trend chart (if data available) */}
            {chartData.some(d => d.body_fat !== null) && (
              <>
                <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--glass-border-subtle)' }}>
                  <p className="text-sm text-foreground font-medium mb-2">{t('meas_body_fat_trend')}</p>
                </div>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData.filter(d => d.body_fat !== null)} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border-subtle)" />
                      <XAxis dataKey="dateLabel" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="body_fat" name={t('pn_body_fat')} stroke="#6c5ce7" strokeWidth={2.5} dot={{ r: 3, fill: '#6c5ce7' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </GlassCard>
        ) : entries.length > 0 && entries.length < 2 ? (
          <GlassCard className="p-5">
            <p className="text-sm text-muted-foreground text-center">{t('meas_need_more')}</p>
          </GlassCard>
        ) : null}

        {/* ======== Log Form ======== */}
        <GlassCard className="p-4">
          <p className="text-sm text-foreground font-medium mb-3">{t('meas_log_btn')}</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: t('pn_neck'), value: inputNeck, set: setInputNeck, color: '#74b9ff' },
              { label: t('pn_chest'), value: inputChest, set: setInputChest, color: '#00cec9' },
              { label: t('pn_waist'), value: inputWaist, set: setInputWaist, color: '#e17055' },
              { label: t('pn_hips'), value: inputHips, set: setInputHips, color: '#fd79a8' },
            ].map((field) => (
              <div key={field.label}>
                <label className="text-[0.625rem] text-muted-foreground mb-1 flex items-center gap-1">
                  <Ruler className="w-3 h-3" style={{ color: field.color }} />
                  {field.label}
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={field.value}
                    onChange={(e) => field.set(e.target.value)}
                    placeholder="0"
                    className="w-full bg-white/[0.06] border border-white/[0.1] rounded-xl px-3 py-2 text-foreground text-sm font-medium text-right outline-none focus:border-[#6c5ce7]/50"
                  />
                  <span className="text-xs text-muted-foreground w-6">{t('unit_cm')}</span>
                </div>
              </div>
            ))}
          </div>

          <input
            type="text"
            value={inputNote}
            onChange={(e) => setInputNote(e.target.value)}
            placeholder={t('meas_note_placeholder')}
            className="w-full mt-3 bg-white/[0.06] border border-white/[0.1] rounded-xl px-3 py-2.5 text-foreground text-sm outline-none focus:border-[#6c5ce7]/50"
          />

          <button
            onClick={saveMeasurement}
            disabled={saving || !inputNeck || !inputChest || !inputWaist || !inputHips}
            className="w-full mt-3 py-3 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : justSaved ? (
              <Check className="w-4 h-4" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            {justSaved ? t('meas_saved') : t('meas_log_btn')}
          </button>
        </GlassCard>

        {/* ======== History ======== */}
        {entries.length > 0 && (
          <div>
            <button
              onClick={() => { hapticFeedback('light'); setShowHistory(!showHistory); }}
              className="w-full py-3 flex items-center justify-center gap-1.5 text-muted-foreground"
            >
              <span className="text-sm font-medium">{t('meas_history')} ({entries.length})</span>
              {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            <AnimatePresence>
              {showHistory && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden space-y-1.5"
                >
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-3 rounded-xl flex items-center justify-between"
                      style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                          <span>{new Date(entry.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          {entry.body_fat_percent && (
                            <span className="px-1.5 py-0.5 rounded-full text-[0.5625rem] font-semibold" style={{
                              background: getBodyFatCategory(entry.body_fat_percent, gender).bg,
                              color: getBodyFatCategory(entry.body_fat_percent, gender).color,
                            }}>
                              BF {entry.body_fat_percent}%
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                          <span className="text-xs"><span className="text-muted-foreground">{t('pn_neck')}:</span> <span className="text-foreground font-medium">{entry.neck_cm}</span></span>
                          <span className="text-xs"><span className="text-muted-foreground">{t('pn_chest')}:</span> <span className="text-foreground font-medium">{entry.chest_cm}</span></span>
                          <span className="text-xs"><span className="text-muted-foreground">{t('pn_waist')}:</span> <span className="text-foreground font-medium">{entry.waist_cm}</span></span>
                          <span className="text-xs"><span className="text-muted-foreground">{t('pn_hips')}:</span> <span className="text-foreground font-medium">{entry.hips_cm}</span></span>
                        </div>
                        {entry.note && (
                          <p className="text-[0.625rem] text-muted-foreground mt-0.5 italic">{entry.note}</p>
                        )}
                      </div>
                      <button
                        onClick={() => deleteEntry(entry.id)}
                        className="ml-2 p-1.5 rounded-lg hover:bg-white/[0.05] flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground/50" />
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ======== Empty State ======== */}
        {!loading && entries.length === 0 && (
          <GlassCard className="p-6 text-center">
            <Ruler className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t('meas_no_data')}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{t('meas_log_first')}</p>
          </GlassCard>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}