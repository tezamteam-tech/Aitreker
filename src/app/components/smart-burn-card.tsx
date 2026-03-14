// =============================================
// Smart Burn Card — Calorie Surplus Exercise Suggestions
// =============================================
// Shows on home page when user has consumed more calories than target.
// Suggests quick exercises to burn the excess.
// NOW: persists completed exercises to backend, shows burn progress.
// =============================================

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Flame, Clock, X, Loader2, CheckCircle2, TrendingDown } from 'lucide-react';
import { GlassCard } from './glass-card';
import { api } from './api-client';
import { hapticFeedback, hapticSuccess } from './telegram';
import { useTranslation } from './i18n';

interface SmartBurnSuggestion {
  exercise_name: string;
  duration_minutes: number;
  estimated_calories_burn: number;
  intensity: 'light' | 'moderate' | 'high';
  emoji: string;
  description: string;
}

interface SmartBurnCardProps {
  caloriesConsumed: number;
  caloriesTarget: number;
  gender: string;
  age: number;
  weight: number;
  activityLevel: string;
  onBurnUpdate?: (totalBurned: number) => void;
}

export function SmartBurnCard({
  caloriesConsumed,
  caloriesTarget,
  gender,
  age,
  weight,
  activityLevel,
  onBurnUpdate,
}: SmartBurnCardProps) {
  const { t } = useTranslation();
  const [suggestions, setSuggestions] = useState<SmartBurnSuggestion[]>([]);
  const [motivationalMessage, setMotivationalMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [completedExercises, setCompletedExercises] = useState<Set<number>>(new Set());
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [totalBurnedToday, setTotalBurnedToday] = useState(0);

  const surplus = caloriesConsumed - caloriesTarget;
  const shouldShow = surplus > 50 && !dismissed;

  // Load today's existing burns on mount
  useEffect(() => {
    api.getSmartBurnToday().then((data) => {
      setTotalBurnedToday(data.totals.calories);
      onBurnUpdate?.(data.totals.calories);
    }).catch(() => {});
  }, []);

  const loadSuggestions = useCallback(async () => {
    if (surplus <= 50) return;
    setLoading(true);
    setError(false);
    try {
      const result = await api.getSmartBurnSuggestions({
        calories_surplus: Math.max(0, surplus - totalBurnedToday),
        gender,
        age,
        weight,
        activity_level: activityLevel,
        workout_type: 'home',
        language: t('locale_code').startsWith('ru') ? 'ru' : 'en',
      });
      setSuggestions(result.suggestions || []);
      setMotivationalMessage(result.motivational_message || '');
    } catch (err) {
      console.warn('[SmartBurn] Failed to load suggestions:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [surplus, totalBurnedToday, gender, age, weight, activityLevel, t]);

  useEffect(() => {
    if (shouldShow && suggestions.length === 0 && !loading && !error) {
      const timer = setTimeout(loadSuggestions, 1500);
      return () => clearTimeout(timer);
    }
  }, [shouldShow, suggestions.length, loading, error, loadSuggestions]);

  const markComplete = async (idx: number) => {
    if (completedExercises.has(idx) || savingIdx !== null) return;
    const s = suggestions[idx];
    if (!s) return;

    hapticSuccess();
    setSavingIdx(idx);
    setCompletedExercises((prev) => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });

    try {
      const result = await api.completeSmartBurn({
        exercise_name: s.exercise_name,
        calories_burned: s.estimated_calories_burn,
        duration_minutes: s.duration_minutes,
        intensity: s.intensity,
        emoji: s.emoji,
      });
      const newTotal = result.daily_totals?.calories || (totalBurnedToday + s.estimated_calories_burn);
      setTotalBurnedToday(newTotal);
      onBurnUpdate?.(newTotal);
    } catch (err) {
      console.warn('[SmartBurn] Failed to save completion:', err);
      // Still keep it checked locally for UX
    } finally {
      setSavingIdx(null);
    }
  };

  const intensityColor = (intensity: string) => {
    switch (intensity) {
      case 'light': return '#74b9ff';
      case 'moderate': return '#fdcb6e';
      case 'high': return '#e17055';
      default: return '#a29bfe';
    }
  };

  const intensityLabel = (intensity: string) => {
    switch (intensity) {
      case 'light': return t('sb_intensity_light');
      case 'moderate': return t('sb_intensity_moderate');
      case 'high': return t('sb_intensity_high');
      default: return intensity;
    }
  };

  // Effective surplus after burns
  const effectiveSurplus = Math.max(0, surplus - totalBurnedToday);
  const burnProgress = surplus > 0 ? Math.min(100, Math.round((totalBurnedToday / surplus) * 100)) : 0;

  if (!shouldShow) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        <GlassCard className="!p-0 overflow-hidden" variant="elevated">
          {/* Header gradient strip */}
          <div
            className="px-4 pt-4 pb-3"
            style={{
              background: 'linear-gradient(135deg, rgba(225,112,85,0.12) 0%, rgba(253,203,110,0.08) 100%)',
            }}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(225,112,85,0.15)' }}
                >
                  <Flame className="w-5 h-5 text-[#e17055]" />
                </div>
                <div>
                  <p className="text-foreground" style={{ fontSize: '0.9375rem', fontWeight: 700 }}>
                    {t('sb_title')}
                  </p>
                  <p className="text-muted-foreground" style={{ fontSize: '0.75rem' }}>
                    {totalBurnedToday > 0
                      ? t('sb_subtitle_progress', { burned: totalBurnedToday, remaining: effectiveSurplus })
                      : t('sb_subtitle', { surplus: Math.round(surplus) })
                    }
                  </p>
                </div>
              </div>
              <button
                onClick={() => { hapticFeedback('light'); setDismissed(true); }}
                className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>

            {/* Burn progress bar */}
            {totalBurnedToday > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1 text-[#00cec9]" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>
                    <TrendingDown className="w-3 h-3" />
                    {t('sb_burned_today', { cal: totalBurnedToday })}
                  </span>
                  <span className="text-white/30" style={{ fontSize: '0.625rem' }}>
                    {burnProgress}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${burnProgress}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{
                      background: burnProgress >= 100
                        ? 'linear-gradient(90deg, #00cec9, #55efc4)'
                        : 'linear-gradient(90deg, #e17055, #fdcb6e)',
                    }}
                  />
                </div>
                {burnProgress >= 100 && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-[#00cec9] text-center mt-1.5"
                    style={{ fontSize: '0.6875rem', fontWeight: 600 }}
                  >
                    {t('sb_surplus_cleared')}
                  </motion.p>
                )}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="px-4 pb-4">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-6">
                <Loader2 className="w-4 h-4 text-[#e17055] animate-spin" />
                <span className="text-muted-foreground" style={{ fontSize: '0.8125rem' }}>
                  {t('sb_loading')}
                </span>
              </div>
            )}

            {error && (
              <p className="text-muted-foreground text-center py-4" style={{ fontSize: '0.8125rem' }}>
                {t('sb_error')}
              </p>
            )}

            {!loading && !error && suggestions.length > 0 && (
              <div className="space-y-2 mt-2">
                {suggestions.map((s, idx) => {
                  const isCompleted = completedExercises.has(idx);
                  const isSaving = savingIdx === idx;
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.08 }}
                      className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                        isCompleted
                          ? 'bg-[#00cec9]/8 border border-[#00cec9]/20'
                          : 'bg-white/[0.03] border border-white/[0.06]'
                      }`}
                    >
                      <span style={{ fontSize: '1.25rem' }}>{s.emoji}</span>

                      <div className="flex-1 min-w-0">
                        <p className={`truncate ${isCompleted ? 'text-muted-foreground line-through' : 'text-foreground'}`}
                          style={{ fontSize: '0.875rem', fontWeight: 600 }}
                        >
                          {s.exercise_name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="flex items-center gap-0.5 text-muted-foreground" style={{ fontSize: '0.6875rem' }}>
                            <Clock className="w-2.5 h-2.5" />
                            {t('sb_duration', { min: s.duration_minutes })}
                          </span>
                          <span className="text-muted-foreground/30">&middot;</span>
                          <span className="flex items-center gap-0.5 text-[#e17055]" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>
                            <Flame className="w-2.5 h-2.5" />
                            {t('sb_calories', { cal: s.estimated_calories_burn })}
                          </span>
                          <span className="text-muted-foreground/30">&middot;</span>
                          <span
                            className="px-1.5 py-0.5 rounded-full"
                            style={{
                              fontSize: '0.5625rem',
                              fontWeight: 600,
                              backgroundColor: `${intensityColor(s.intensity)}15`,
                              color: intensityColor(s.intensity),
                            }}
                          >
                            {intensityLabel(s.intensity)}
                          </span>
                        </div>
                      </div>

                      {isCompleted ? (
                        <CheckCircle2 className="w-6 h-6 text-[#00cec9] flex-shrink-0" />
                      ) : (
                        <motion.button
                          whileTap={{ scale: 0.85 }}
                          onClick={() => markComplete(idx)}
                          disabled={isSaving}
                          className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-[#e17055]/15 border border-[#e17055]/25 disabled:opacity-50"
                        >
                          {isSaving ? (
                            <Loader2 className="w-3.5 h-3.5 text-[#e17055] animate-spin" />
                          ) : (
                            <span className="text-[#e17055]" style={{ fontSize: '0.6875rem', fontWeight: 700 }}>
                              {t('sb_do_it')}
                            </span>
                          )}
                        </motion.button>
                      )}
                    </motion.div>
                  );
                })}

                {motivationalMessage && (
                  <p className="text-muted-foreground text-center mt-2 px-4" style={{ fontSize: '0.75rem', lineHeight: 1.5, fontStyle: 'italic' }}>
                    "{motivationalMessage}"
                  </p>
                )}
              </div>
            )}
          </div>
        </GlassCard>
      </motion.div>
    </AnimatePresence>
  );
}
