// =============================================
// Activity Logger — AI-powered Calorie Burn Tracker
// =============================================
// Allows users to log any activity via:
//   1. Text description
//   2. Voice dictation (Whisper transcription)
//   3. Photo of smartwatch / fitness tracker screenshot
// AI estimates calories burned, including BMR for sedentary work.
// Shows unified daily burn summary (activity + smartburn + workout).
// =============================================

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Flame,
  Plus,
  Mic,
  Camera,
  Type,
  Loader2,
  Check,
  X,
  Trash2,
  ChevronDown,
  ImageIcon,
  Dumbbell,
  Footprints,
  Monitor,
  Home,
  Sparkles,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { api, getUserLang } from './api-client';
import { hapticFeedback, hapticSuccess, hapticError } from './telegram';
import { useTranslation } from './i18n';
import { VoiceInput } from './voice-input';
import { SwipeableBottomSheet } from './ui/swipeable-bottom-sheet';
import { CameraCapture } from './camera-capture';
import { PhotoSourcePicker } from './photo-source-picker';

// Type icons
const TYPE_ICONS: Record<string, React.ElementType> = {
  exercise: Dumbbell,
  walking: Footprints,
  work: Monitor,
  household: Home,
  other: Flame,
};

const TYPE_COLORS: Record<string, string> = {
  exercise: '#6c5ce7',
  walking: '#00cec9',
  work: '#74b9ff',
  household: '#ffeaa7',
  other: '#fd79a8',
};

interface ActivityEntry {
  id: string;
  activities: Array<{
    name: string;
    duration_minutes: number;
    calories_burned: number;
    type: string;
    emoji: string;
  }>;
  total_calories: number;
  summary: string;
  input_type: string;
  date: string;
  created_at: string;
}

interface SmartBurnEntry {
  id: string;
  exercise_name: string;
  calories_burned: number;
  duration_minutes: number;
  intensity: string;
  emoji: string;
  date: string;
}

interface ActivityLoggerProps {
  /** User profile data for AI context */
  profile?: {
    gender: string;
    age: number;
    weight: number;
    activityLevel: string;
  } | null;
  /** Calories consumed today */
  caloriesConsumed: number;
  /** Calorie target */
  calorieTarget: number;
  /** Callback when burns are updated */
  onBurnUpdate?: (totalBurned: number) => void;
}

export function ActivityLogger({
  profile,
  caloriesConsumed,
  calorieTarget,
  onBurnUpdate,
}: ActivityLoggerProps) {
  const { t } = useTranslation();
  const lang = getUserLang();

  // Data
  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>([]);
  const [smartburnEntries, setSmartburnEntries] = useState<SmartBurnEntry[]>([]);
  const [combinedBurned, setCombinedBurned] = useState(0);
  const [workoutCalories, setWorkoutCalories] = useState(0);
  const [activityTotals, setActivityTotals] = useState({ calories: 0, duration: 0, count: 0 });
  const [smartburnTotals, setSmartburnTotals] = useState({ calories: 0, duration: 0, count: 0 });

  // UI
  const [showSheet, setShowSheet] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  // Input sheet state
  const [inputMode, setInputMode] = useState<'text' | 'voice' | 'photo'>('text');
  const [textInput, setTextInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  // Camera/photo
  const [showCamera, setShowCamera] = useState(false);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Voice
  const [voiceBase64, setVoiceBase64] = useState<string | null>(null);
  const [voiceMime, setVoiceMime] = useState<string>('audio/webm');
  const [voiceTranscript, setVoiceTranscript] = useState('');

  // Load today's data
  const loadTodayData = useCallback(async () => {
    try {
      const data = await api.getActivityToday();
      setActivityEntries(data.activity_entries || []);
      setSmartburnEntries(data.smartburn_entries || []);
      setCombinedBurned(data.combined_burned || 0);
      setWorkoutCalories(data.workout_calories || 0);
      setActivityTotals(data.activity_totals || { calories: 0, duration: 0, count: 0 });
      setSmartburnTotals(data.smartburn_totals || { calories: 0, duration: 0, count: 0 });
      onBurnUpdate?.(data.combined_burned || 0);
    } catch (err) {
      console.warn('[ActivityLogger] Load error:', err);
    }
  }, [onBurnUpdate]);

  useEffect(() => {
    loadTodayData();
  }, [loadTodayData]);

  // Analyze activity
  const handleAnalyze = useCallback(async () => {
    if (analyzing) return;

    // Determine what to send
    let input: any = {
      language: lang,
      gender: profile?.gender,
      age: profile?.age,
      weight: profile?.weight,
      activity_level: profile?.activityLevel,
    };

    if (inputMode === 'text') {
      if (!textInput.trim()) return;
      input.text = textInput.trim();
    } else if (inputMode === 'voice') {
      if (voiceBase64) {
        input.voice_base64 = voiceBase64;
        input.voice_mime = voiceMime;
      } else if (voiceTranscript) {
        input.text = voiceTranscript;
      } else {
        return;
      }
    } else if (inputMode === 'photo') {
      if (!photoPreview) return;
      const match = photoPreview.match(/^data:(.+?);base64,(.+)$/);
      if (match) {
        input.image_base64 = match[2];
        input.image_mime = match[1];
      }
      if (textInput.trim()) input.text = textInput.trim();
    }

    setAnalyzing(true);
    setError('');
    hapticFeedback('medium');

    try {
      const res = await api.logActivity(input);
      setResult(res);
      hapticSuccess();

      // Update local state immediately
      setCombinedBurned((prev) => prev + (res.total_calories || 0));
      setActivityEntries((prev) => [{ ...res, created_at: new Date().toISOString() } as ActivityEntry, ...prev]);
      setActivityTotals(res.daily_totals);
      onBurnUpdate?.((combinedBurned || 0) + (res.total_calories || 0));

      // Reset input
      setTextInput('');
      setVoiceBase64(null);
      setVoiceTranscript('');
      setPhotoPreview(null);
    } catch (err: any) {
      console.error('[ActivityLogger] Analyze error:', err);
      setError(t('ab_error'));
      hapticError();
    } finally {
      setAnalyzing(false);
    }
  }, [inputMode, textInput, voiceBase64, voiceMime, voiceTranscript, photoPreview, analyzing, lang, profile, combinedBurned, onBurnUpdate, t]);

  // Delete entry
  const handleDelete = useCallback(async (id: string) => {
    hapticFeedback('medium');
    try {
      const res = await api.deleteActivity(id);
      setActivityEntries((prev) => prev.filter((e) => e.id !== id));
      setActivityTotals(res.daily_totals);
      await loadTodayData();
      hapticSuccess();
    } catch (err) {
      console.error('[ActivityLogger] Delete error:', err);
      hapticError();
    }
  }, [loadTodayData]);

  const netBalance = caloriesConsumed - combinedBurned;
  const hasEntries = activityEntries.length > 0 || smartburnEntries.length > 0 || workoutCalories > 0;

  const openSheet = () => {
    hapticFeedback('light');
    setShowSheet(true);
    setResult(null);
    setError('');
    setTextInput('');
    setPhotoPreview(null);
    setVoiceBase64(null);
    setVoiceTranscript('');
    setInputMode('text');
  };

  return (
    <>
      {/* ======== Burned Today Card ======== */}
      <GlassCard className="!p-0 overflow-hidden">
        {/* Header — always visible */}
        <button
          onClick={() => { hapticFeedback('light'); setExpanded((p) => !p); }}
          className="w-full px-4 py-3.5 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#e17055]/15 to-[#fd79a8]/10 flex items-center justify-center">
              <Flame className="w-5 h-5 text-[#e17055]" />
            </div>
            <div className="text-left">
              <p className="text-foreground text-sm font-medium">{t('ab_burned_today')}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[#e17055] text-lg font-bold">{combinedBurned}</span>
                <span className="text-muted-foreground text-xs">{t('ab_cal')}</span>
                {combinedBurned > 0 && (
                  <span className="text-muted-foreground/40 text-[0.625rem]">
                    {'\u00B7'} {hasEntries ? `${activityEntries.length + smartburnEntries.length + (workoutCalories > 0 ? 1 : 0)} entries` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={(e) => { e.stopPropagation(); openSheet(); }}
              className="w-9 h-9 rounded-xl bg-[#e17055]/15 border border-[#e17055]/20 flex items-center justify-center"
            >
              <Plus className="w-4.5 h-4.5 text-[#e17055]" />
            </motion.button>
            <motion.div
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="w-4 h-4 text-muted-foreground/40" />
            </motion.div>
          </div>
        </button>

        {/* Expanded: entries list */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 space-y-1.5" style={{ borderTop: '1px solid var(--glass-border-subtle)' }}>
                {/* Balance row */}
                <div className="grid grid-cols-3 gap-2 py-2.5">
                  <div className="text-center">
                    <p className="text-muted-foreground text-[0.5625rem]">{t('ab_consumed')}</p>
                    <p className="text-foreground text-sm font-semibold">{caloriesConsumed}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground text-[0.5625rem]">{t('ab_burned')}</p>
                    <p className="text-[#e17055] text-sm font-semibold">-{combinedBurned}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground text-[0.5625rem]">{t('ab_net_balance')}</p>
                    <p className={`text-sm font-semibold ${netBalance > calorieTarget ? 'text-[#ff6b6b]' : 'text-[#00cec9]'}`}>
                      {netBalance}
                    </p>
                  </div>
                </div>

                {/* Activity entries */}
                {activityEntries.map((entry) => (
                  <div key={entry.id} className="p-3 rounded-xl bg-white/[0.025] border border-white/[0.04]">
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground text-xs font-medium truncate">{entry.summary || t('ab_custom')}</p>
                        <p className="text-muted-foreground/50 text-[0.625rem]">
                          {entry.input_type === 'voice' ? '\uD83C\uDFA4' : entry.input_type === 'photo' ? '\uD83D\uDCF7' : '\u270D\uFE0F'} {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[#e17055] text-sm font-bold">{entry.total_calories}</span>
                        <span className="text-muted-foreground/30 text-[0.625rem]">{t('ab_cal')}</span>
                        <motion.button
                          whileTap={{ scale: 0.8 }}
                          onClick={() => handleDelete(entry.id)}
                          className="w-6 h-6 rounded-md bg-white/[0.04] flex items-center justify-center ml-1"
                        >
                          <Trash2 className="w-3 h-3 text-muted-foreground/30" />
                        </motion.button>
                      </div>
                    </div>
                    {/* Sub-activities */}
                    <div className="flex flex-wrap gap-1.5">
                      {entry.activities.map((act, i) => {
                        const color = TYPE_COLORS[act.type] || '#fd79a8';
                        return (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[0.625rem]"
                            style={{ background: `${color}12`, color, border: `1px solid ${color}25` }}
                          >
                            {act.emoji} {act.name} {'\u00B7'} {act.calories_burned}{t('ab_cal')}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* SmartBurn entries */}
                {smartburnEntries.map((entry) => (
                  <div key={entry.id} className="p-2.5 rounded-xl bg-white/[0.025] border border-white/[0.04] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: '1rem' }}>{entry.emoji}</span>
                      <div>
                        <p className="text-foreground text-xs font-medium">{entry.exercise_name}</p>
                        <p className="text-muted-foreground/40 text-[0.625rem]">{t('ab_smartburn')} {'\u00B7'} {entry.duration_minutes}{t('ab_min')}</p>
                      </div>
                    </div>
                    <span className="text-[#00cec9] text-sm font-bold">{entry.calories_burned}</span>
                  </div>
                ))}

                {/* Workout calories */}
                {workoutCalories > 0 && (
                  <div className="p-2.5 rounded-xl bg-white/[0.025] border border-white/[0.04] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Dumbbell className="w-4 h-4 text-[#6c5ce7]" />
                      <p className="text-foreground text-xs font-medium">{t('ab_workout')}</p>
                    </div>
                    <span className="text-[#6c5ce7] text-sm font-bold">{workoutCalories}</span>
                  </div>
                )}

                {/* Empty state */}
                {!hasEntries && (
                  <p className="text-muted-foreground/40 text-center py-4 text-xs">{t('ab_no_entries')}</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* ======== Log Activity Bottom Sheet ======== */}
      <SwipeableBottomSheet
        open={showSheet}
        onClose={() => setShowSheet(false)}
        title={t('ab_title')}
        maxHeight="92vh"
      >
        <div className="space-y-4 mt-1">
          {/* Subtitle */}
          <p className="text-muted-foreground text-xs">{t('ab_subtitle')}</p>

          {/* Input mode tabs */}
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-white/[0.04]">
            {([
              { id: 'text' as const, icon: Type, label: t('ab_text_tab') },
              { id: 'voice' as const, icon: Mic, label: t('ab_voice_tab') },
              { id: 'photo' as const, icon: Camera, label: t('ab_photo_tab') },
            ]).map((tab) => {
              const Icon = tab.icon;
              const active = inputMode === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => { hapticFeedback('light'); setInputMode(tab.id); setResult(null); setError(''); }}
                  className={`py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all text-xs font-medium ${
                    active
                      ? 'bg-[#e17055]/15 text-[#e17055] border border-[#e17055]/20'
                      : 'text-muted-foreground'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* ---- Text Input Mode ---- */}
          {inputMode === 'text' && !result && (
            <div className="space-y-3">
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={t('ab_text_placeholder')}
                rows={4}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-foreground text-sm outline-none focus:border-[#e17055]/30 resize-none placeholder:text-muted-foreground/30"
              />
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleAnalyze}
                disabled={!textInput.trim() || analyzing}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#e17055] to-[#fd79a8] text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {analyzing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {t('ab_analyzing')}</>
                ) : (
                  <><Sparkles className="w-4 h-4" /> {t('ab_analyze')}</>
                )}
              </motion.button>
            </div>
          )}

          {/* ---- Voice Input Mode ---- */}
          {inputMode === 'voice' && !result && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 py-4">
                <VoiceInput
                  onTranscript={(text) => {
                    setVoiceTranscript((prev) => (prev ? prev + ' ' : '') + text);
                  }}
                  onAudioBlob={(base64, mime) => {
                    setVoiceBase64(base64);
                    setVoiceMime(mime);
                  }}
                  language={lang}
                  size="md"
                />
                <p className="text-muted-foreground text-xs text-center max-w-[250px]">
                  {t('ab_voice_hint')}
                </p>
              </div>

              {/* Show transcript */}
              {voiceTranscript && (
                <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                  <p className="text-foreground text-sm">{voiceTranscript}</p>
                </div>
              )}

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleAnalyze}
                disabled={(!voiceBase64 && !voiceTranscript) || analyzing}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#e17055] to-[#fd79a8] text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {analyzing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {t('ab_analyzing')}</>
                ) : (
                  <><Sparkles className="w-4 h-4" /> {t('ab_analyze')}</>
                )}
              </motion.button>
            </div>
          )}

          {/* ---- Photo Input Mode ---- */}
          {inputMode === 'photo' && !result && (
            <div className="space-y-3">
              {photoPreview ? (
                <div className="relative">
                  <img
                    src={photoPreview}
                    alt="Activity"
                    className="w-full rounded-xl max-h-48 object-cover"
                  />
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() => setPhotoPreview(null)}
                    className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-black/60 flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-white" />
                  </motion.button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { hapticFeedback('light'); setShowPhotoPicker(true); }}
                    className="p-6 rounded-xl border-2 border-dashed border-white/10 flex flex-col items-center gap-2 bg-white/[0.02]"
                  >
                    <Camera className="w-6 h-6 text-[#e17055]" />
                    <span className="text-foreground/60 text-xs">{t('ab_take_photo')}</span>
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { hapticFeedback('light'); setShowPhotoPicker(true); }}
                    className="p-6 rounded-xl border-2 border-dashed border-white/10 flex flex-col items-center gap-2 bg-white/[0.02]"
                  >
                    <ImageIcon className="w-6 h-6 text-[#74b9ff]" />
                    <span className="text-foreground/60 text-xs">{t('ab_choose_gallery')}</span>
                  </motion.button>
                </div>
              )}

              <p className="text-muted-foreground text-xs text-center">{t('ab_photo_hint')}</p>

              {/* Optional text context */}
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={t('ab_text_placeholder')}
                rows={2}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-foreground text-sm outline-none focus:border-[#e17055]/30 resize-none placeholder:text-muted-foreground/30"
              />

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleAnalyze}
                disabled={!photoPreview || analyzing}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#e17055] to-[#fd79a8] text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {analyzing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {t('ab_analyzing')}</>
                ) : (
                  <><Sparkles className="w-4 h-4" /> {t('ab_analyze')}</>
                )}
              </motion.button>
            </div>
          )}

          {/* ---- Result Display ---- */}
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="flex items-center gap-2 mb-2">
                <Check className="w-5 h-5 text-[#00cec9]" />
                <p className="text-foreground font-semibold text-sm">{t('ab_result_title')}</p>
              </div>

              {/* Total calories */}
              <div className="text-center py-4 rounded-2xl" style={{ background: 'linear-gradient(135deg, rgba(225,112,85,0.08), rgba(253,121,168,0.05))', border: '1px solid rgba(225,112,85,0.15)' }}>
                <p className="text-[#e17055] text-3xl font-bold">{result.total_calories}</p>
                <p className="text-muted-foreground text-xs mt-1">{t('ab_cal')} {t('ab_burned').toLowerCase()}</p>
              </div>

              {/* Activities breakdown */}
              <div className="space-y-1.5">
                {(result.activities || []).map((act: any, i: number) => {
                  const color = TYPE_COLORS[act.type] || '#fd79a8';
                  const Icon = TYPE_ICONS[act.type] || Flame;
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 rounded-xl"
                      style={{ background: `${color}08`, border: `1px solid ${color}15` }}
                    >
                      <div className="flex items-center gap-2.5">
                        <span style={{ fontSize: '1.125rem' }}>{act.emoji}</span>
                        <div>
                          <p className="text-foreground text-sm font-medium">{act.name}</p>
                          <p className="text-muted-foreground text-[0.625rem]">
                            {act.duration_minutes > 0 && `${act.duration_minutes} ${t('ab_min')} \u00B7 `}{act.type}
                          </p>
                        </div>
                      </div>
                      <p style={{ color }} className="text-sm font-bold">{act.calories_burned}</p>
                    </div>
                  );
                })}
              </div>

              {/* Summary */}
              {result.summary && (
                <p className="text-muted-foreground text-xs leading-relaxed">{result.summary}</p>
              )}

              {/* Done button */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  hapticSuccess();
                  setResult(null);
                  setShowSheet(false);
                }}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#00cec9] to-[#74b9ff] text-white font-semibold text-sm flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                {t('ab_saved')}
              </motion.button>
            </motion.div>
          )}

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-3 rounded-xl bg-[#ff6b6b]/10 border border-[#ff6b6b]/20"
            >
              <p className="text-[#ff6b6b] text-sm text-center">{error}</p>
            </motion.div>
          )}
        </div>
      </SwipeableBottomSheet>

      {/* Photo source picker */}
      <PhotoSourcePicker
        open={showPhotoPicker}
        onClose={() => setShowPhotoPicker(false)}
        onPickCamera={() => { setShowPhotoPicker(false); setShowCamera(true); }}
        onPickGallery={(dataUrl) => { setPhotoPreview(dataUrl); setShowPhotoPicker(false); }}
      />

      {/* Camera */}
      <CameraCapture
        open={showCamera}
        onCapture={(dataUrl) => { setPhotoPreview(dataUrl); setShowCamera(false); }}
        onClose={() => setShowCamera(false)}
      />
    </>
  );
}