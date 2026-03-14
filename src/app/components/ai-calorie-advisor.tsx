// =============================================
// AI Calorie Advisor — Body Analysis Bottom Sheet
// =============================================
// Analyzes user metrics + optional body photo via GPT-4o Vision
// to provide personalized calorie recommendations.
// Features: macronutrient saving, analysis history, rate limiting.
// =============================================

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Camera,
  Sparkles,
  Check,
  Target,
  TrendingDown,
  Zap,
  AlertTriangle,
  Clock,
  Crown,
  ChevronDown,
  ChevronUp,
  ImageIcon,
  Lock,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { useTranslation } from './i18n';
import { api } from './api-client';
import { hapticFeedback, hapticSuccess, hapticError } from './telegram';
import { useBottomSheetLifecycle } from './bottom-sheet-context';

interface ProfileMetrics {
  gender: string;
  age: number;
  height: number;
  weight: number;
  activity_level: string;
  goal: string;
}

interface AiResult {
  recommended_calories: number;
  recommended_protein: number;
  recommended_carbs: number;
  recommended_fat: number;
  bmr_estimate: number;
  tdee_estimate: number;
  body_fat_estimate: string | null;
  body_assessment: string;
  recommendation_reason: string;
  tips: string[];
}

interface HistoryEntry extends AiResult {
  input: { gender: string; age: number; height: number; weight: number; activityLevel: string; goal: string; had_photo: boolean };
  created_at: string;
}

interface UsageInfo {
  is_premium: boolean;
  used_this_week: number;
  limit: number | null;
  remaining: number | null;
}

type AdvisorState = 'idle' | 'analyzing' | 'result' | 'error' | 'rate_limited';

interface AiCalorieAdvisorProps {
  profile: ProfileMetrics;
  currentTarget: number;
  currentMacros?: { protein?: number; carbs?: number; fat?: number };
  language: string;
  isPremium: boolean;
  onApply: (calories: number, protein: number, carbs: number, fat: number) => void;
  onClose: () => void;
}

export function AiCalorieAdvisor({
  profile,
  currentTarget,
  currentMacros,
  language,
  isPremium: isPremiumProp,
  onApply,
  onClose,
}: AiCalorieAdvisorProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [state, setState] = useState<AdvisorState>('idle');
  const [result, setResult] = useState<AiResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoMime, setPhotoMime] = useState<string>('image/jpeg');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // History & usage
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useBottomSheetLifecycle(true);

  const bmi = (profile.weight / ((profile.height / 100) ** 2)).toFixed(1);

  // Load history & usage on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getAiAnalysisHistory();
        if (cancelled) return;
        setHistory(data.analyses || []);
        setUsage(data.usage);
      } catch (err) {
        console.error('[AI Advisor] Failed to load history:', err);
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const canAnalyze = usage
    ? (usage.is_premium || (usage.remaining !== null && usage.remaining > 0))
    : true; // optimistic while loading

  const handlePhotoSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPhotoPreview(dataUrl);
      const base64 = dataUrl.split(',')[1];
      setPhotoBase64(base64);
      setPhotoMime(file.type || 'image/jpeg');
    };
    reader.readAsDataURL(file);
    hapticFeedback('light');
  }, []);

  const removePhoto = () => {
    setPhotoPreview(null);
    setPhotoBase64(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const analyze = useCallback(async () => {
    // Pre-check rate limit
    if (usage && !usage.is_premium && usage.remaining !== null && usage.remaining <= 0) {
      setState('rate_limited');
      hapticError();
      return;
    }

    setState('analyzing');
    setErrorMsg('');
    hapticFeedback('medium');

    try {
      const res = await api.aiBodyAnalysis({
        gender: profile.gender,
        age: profile.age,
        height: profile.height,
        weight: profile.weight,
        activityLevel: profile.activity_level,
        goal: profile.goal,
        imageBase64: photoBase64 || undefined,
        mimeType: photoMime,
        language,
      });
      setResult(res);
      setState('result');
      hapticSuccess();

      // Update local usage count
      if (usage) {
        setUsage({
          ...usage,
          used_this_week: usage.used_this_week + 1,
          remaining: usage.remaining !== null ? Math.max(0, usage.remaining - 1) : null,
        });
      }

      // Add to local history
      const newEntry: HistoryEntry = {
        ...res,
        input: {
          gender: profile.gender,
          age: profile.age,
          height: profile.height,
          weight: profile.weight,
          activityLevel: profile.activity_level,
          goal: profile.goal,
          had_photo: !!photoBase64,
        },
        created_at: new Date().toISOString(),
      };
      setHistory(prev => [newEntry, ...prev]);
    } catch (err: any) {
      console.error('[AI Advisor] Error:', err);
      // Check for rate limit error
      if (err?.code === 'LIMIT_REACHED' || err?.status === 429) {
        setState('rate_limited');
        hapticError();
        return;
      }
      setErrorMsg(err?.message || 'Analysis failed');
      setState('error');
      hapticError();
    }
  }, [profile, photoBase64, photoMime, language, usage]);

  const handleApply = () => {
    if (!result) return;
    hapticSuccess();
    onApply(
      result.recommended_calories,
      result.recommended_protein,
      result.recommended_carbs,
      result.recommended_fat
    );
  };

  const handleApplyFromHistory = (entry: HistoryEntry) => {
    hapticSuccess();
    onApply(
      entry.recommended_calories,
      entry.recommended_protein,
      entry.recommended_carbs,
      entry.recommended_fat
    );
  };

  const goalEmoji: Record<string, string> = {
    lose_weight: '\u{1F525}',
    maintain_weight: '\u2696\uFE0F',
    gain_muscle: '\u{1F4AA}',
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <>
      {/* Overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="fixed left-0 right-0 bottom-0 z-50 rounded-t-[1.5rem] max-h-[92vh] overflow-auto"
        style={{
          paddingBottom: 'calc(1.5rem + var(--safe-area-bottom, 0px))',
          background: 'rgba(18,18,30,0.98)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>

        <div className="px-5 pt-2 pb-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6c5ce7]/20 to-[#a29bfe]/20 flex items-center justify-center">
                <Sparkles className="w-4.5 h-4.5 text-[#a29bfe]" />
              </div>
              <h2 className="text-white" style={{ fontSize: '1.125rem', fontWeight: 700 }}>
                {t('ai_advisor_title')}
              </h2>
            </div>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center"
            >
              <X className="w-4 h-4 text-white/50" />
            </motion.button>
          </div>

          {/* Usage badge */}
          {usage && !loadingHistory && (
            <div className="mb-4">
              {usage.is_premium ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#ffd700]/10 border border-[#ffd700]/20 w-fit">
                  <Crown className="w-3.5 h-3.5 text-[#ffd700]" />
                  <span className="text-[#ffd700]/80 text-xs font-medium">{t('ai_advisor_premium_unlimited')}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] w-fit">
                  <Clock className="w-3.5 h-3.5 text-white/40" />
                  <span className="text-white/50 text-xs">
                    {t('ai_advisor_rate_limit', { used: usage.used_this_week, limit: usage.limit || 1 })}
                  </span>
                </div>
              )}
            </div>
          )}

          <AnimatePresence mode="wait">
            {/* ====== IDLE: show metrics + photo upload ====== */}
            {state === 'idle' && (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {/* Current metrics summary */}
                <div
                  className="rounded-2xl p-4 space-y-2"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <p className="text-white/40 text-xs font-medium mb-2">{t('ai_advisor_your_metrics')}</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <MetricLine label={t('pn_gender')} value={profile.gender === 'male' ? t('pn_male') : t('pn_female')} />
                    <MetricLine label={t('pn_age')} value={`${profile.age}`} />
                    <MetricLine label={t('pn_height')} value={`${profile.height} ${t('unit_cm')}`} />
                    <MetricLine label={t('pn_weight')} value={`${profile.weight} ${t('unit_kg')}`} />
                    <MetricLine label="BMI" value={bmi} />
                    <MetricLine label={t('pn_goal_label')} value={`${goalEmoji[profile.goal] || ''} ${t(`pn_goal_${profile.goal.replace('_weight', '').replace('_muscle', '')}` as any) || profile.goal}`} />
                  </div>
                  <div className="pt-2 mt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <MetricLine label={t('ai_advisor_current_target')} value={`${currentTarget} ${t('cal_unit')}`} highlight />
                  </div>

                  {/* Current macro targets */}
                  {(currentMacros?.protein || currentMacros?.carbs || currentMacros?.fat) ? (
                    <div className="pt-2 mt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <p className="text-white/30 text-xs mb-1.5">{t('ai_advisor_current_macros')}</p>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-[#6c5ce7]/80">P: {currentMacros.protein || '—'}g</span>
                        <span className="text-xs text-[#00cec9]/80">C: {currentMacros.carbs || '—'}g</span>
                        <span className="text-xs text-[#e17055]/80">F: {currentMacros.fat || '—'}g</span>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-2 mt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <p className="text-white/20 text-xs italic">{t('ai_advisor_no_macros')}</p>
                    </div>
                  )}
                </div>

                {/* Body photo upload */}
                <div>
                  <p className="text-white/40 text-xs font-medium mb-2">{t('ai_advisor_photo_label')}</p>
                  <p className="text-white/25 text-xs mb-3 leading-relaxed">{t('ai_advisor_photo_desc')}</p>

                  {photoPreview ? (
                    <div className="relative rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                      <img
                        src={photoPreview}
                        alt="Body"
                        className="w-full max-h-[200px] object-cover"
                      />
                      <button
                        onClick={removePhoto}
                        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center"
                      >
                        <X className="w-4 h-4 text-white" />
                      </button>
                      <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm">
                        <span className="text-white/70 text-xs">{t('ai_advisor_photo_attached')}</span>
                      </div>
                    </div>
                  ) : (
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-6 rounded-2xl flex flex-col items-center gap-2.5"
                      style={{ background: 'rgba(108,92,231,0.06)', border: '1px dashed rgba(108,92,231,0.3)' }}
                    >
                      <div className="w-12 h-12 rounded-full bg-[#6c5ce7]/15 flex items-center justify-center">
                        <Camera className="w-5 h-5 text-[#a29bfe]" />
                      </div>
                      <span className="text-[#a29bfe] text-sm font-medium">{t('ai_advisor_upload_photo')}</span>
                      <span className="text-white/20 text-xs">{t('ai_advisor_photo_optional')}</span>
                    </motion.button>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handlePhotoSelect}
                  />
                </div>

                {/* Analyze button or rate limit block */}
                {canAnalyze ? (
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={analyze}
                    className="w-full h-13 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] flex items-center justify-center gap-2"
                    style={{ boxShadow: '0 6px 24px rgba(108,92,231,0.3)' }}
                  >
                    <Sparkles className="w-5 h-5 text-white" />
                    <span className="text-white" style={{ fontSize: '1rem', fontWeight: 600 }}>
                      {photoBase64 ? t('ai_advisor_analyze_with_photo') : t('ai_advisor_analyze')}
                    </span>
                  </motion.button>
                ) : (
                  <RateLimitBlock t={t} onUpgrade={() => { onClose(); navigate('/upgrade'); }} />
                )}

                {/* History section */}
                {history.length > 0 && (
                  <HistorySection
                    history={history}
                    showHistory={showHistory}
                    onToggle={() => setShowHistory(v => !v)}
                    onApply={handleApplyFromHistory}
                    formatDate={formatDate}
                    t={t}
                  />
                )}
              </motion.div>
            )}

            {/* ====== ANALYZING ====== */}
            {state === 'analyzing' && (
              <motion.div
                key="analyzing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4 py-12"
              >
                <div className="relative">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                    className="w-16 h-16 rounded-full"
                    style={{
                      border: '3px solid rgba(108,92,231,0.15)',
                      borderTopColor: '#6c5ce7',
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-[#a29bfe]" />
                  </div>
                </div>
                <p className="text-white/60 text-sm font-medium">{t('ai_advisor_analyzing')}</p>
                <p className="text-white/25 text-xs">{t('ai_advisor_analyzing_desc')}</p>
              </motion.div>
            )}

            {/* ====== RESULT ====== */}
            {state === 'result' && result && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {/* Recommended calories — hero number */}
                <div
                  className="rounded-2xl p-5 text-center relative overflow-hidden"
                  style={{ background: 'linear-gradient(135deg, rgba(108,92,231,0.12), rgba(0,206,201,0.08))', border: '1px solid rgba(108,92,231,0.2)' }}
                >
                  <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-[#6c5ce7]/5 -translate-y-1/2 translate-x-1/2" />
                  <p className="text-white/50 text-xs font-medium mb-1">{t('ai_advisor_recommended')}</p>
                  <p className="text-white text-4xl font-bold mb-0.5">
                    {result.recommended_calories.toLocaleString()}
                  </p>
                  <p className="text-white/40 text-sm">{t('cal_unit')} / {t('ai_advisor_per_day')}</p>

                  {/* Difference from current */}
                  {currentTarget > 0 && (
                    <div className="mt-3 flex items-center justify-center gap-1.5">
                      {result.recommended_calories < currentTarget ? (
                        <TrendingDown className="w-3.5 h-3.5 text-[#00cec9]" />
                      ) : (
                        <Zap className="w-3.5 h-3.5 text-[#ffeaa7]" />
                      )}
                      <span className="text-white/50 text-xs">
                        {result.recommended_calories < currentTarget
                          ? `${(currentTarget - result.recommended_calories).toLocaleString()} ${t('ai_advisor_less_than_current')}`
                          : result.recommended_calories > currentTarget
                          ? `+${(result.recommended_calories - currentTarget).toLocaleString()} ${t('ai_advisor_more_than_current')}`
                          : t('ai_advisor_matches_current')}
                      </span>
                    </div>
                  )}
                </div>

                {/* Macro breakdown */}
                <div className="grid grid-cols-3 gap-2">
                  <MacroPill label={t('cal_protein')} value={result.recommended_protein} color="#6c5ce7" />
                  <MacroPill label={t('cal_carbs')} value={result.recommended_carbs} color="#00cec9" />
                  <MacroPill label={t('cal_fat')} value={result.recommended_fat} color="#e17055" />
                </div>

                {/* BMR / TDEE row */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-white/30 text-xs mb-0.5">BMR</p>
                    <p className="text-white font-semibold text-sm">{result.bmr_estimate}</p>
                  </div>
                  <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-white/30 text-xs mb-0.5">TDEE</p>
                    <p className="text-white font-semibold text-sm">{result.tdee_estimate}</p>
                  </div>
                </div>

                {/* Body fat estimate (if photo) */}
                {result.body_fat_estimate && result.body_fat_estimate !== 'null' && (
                  <div
                    className="rounded-xl p-3 flex items-center gap-3"
                    style={{ background: 'rgba(253,121,168,0.08)', border: '1px solid rgba(253,121,168,0.15)' }}
                  >
                    <Target className="w-5 h-5 text-[#fd79a8] flex-shrink-0" />
                    <div>
                      <p className="text-white/40 text-xs">{t('ai_advisor_body_fat')}</p>
                      <p className="text-white text-sm font-medium">{result.body_fat_estimate}</p>
                    </div>
                  </div>
                )}

                {/* Body assessment */}
                {result.body_assessment && (
                  <div
                    className="rounded-xl p-4"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <p className="text-white/40 text-xs font-medium mb-1.5">{t('ai_advisor_assessment')}</p>
                    <p className="text-white/70 text-sm leading-relaxed">{result.body_assessment}</p>
                  </div>
                )}

                {/* Recommendation reason */}
                <div
                  className="rounded-xl p-4"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <p className="text-white/40 text-xs font-medium mb-1.5">{t('ai_advisor_reason')}</p>
                  <p className="text-white/70 text-sm leading-relaxed">{result.recommendation_reason}</p>
                </div>

                {/* Tips */}
                {result.tips && result.tips.length > 0 && (
                  <div
                    className="rounded-xl p-4"
                    style={{ background: 'rgba(0,206,201,0.04)', border: '1px solid rgba(0,206,201,0.12)' }}
                  >
                    <p className="text-white/40 text-xs font-medium mb-2">{t('ai_advisor_tips')}</p>
                    <div className="space-y-2">
                      {result.tips.map((tip, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-[#00cec9] text-xs mt-0.5">{'\u2022'}</span>
                          <p className="text-white/60 text-sm leading-relaxed">{tip}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Apply button — now saves calories + macros */}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleApply}
                  className="w-full h-13 rounded-2xl bg-gradient-to-r from-[#00cec9] to-[#74b9ff] flex items-center justify-center gap-2"
                  style={{ boxShadow: '0 6px 24px rgba(0,206,201,0.3)' }}
                >
                  <Check className="w-5 h-5 text-white" />
                  <span className="text-white" style={{ fontSize: '1rem', fontWeight: 600 }}>
                    {t('ai_advisor_apply_macros', { calories: result.recommended_calories })}
                  </span>
                </motion.button>
                <p className="text-white/20 text-xs text-center -mt-2">
                  {t('ai_advisor_macros_saved')}
                </p>

                {/* Re-analyze */}
                <button
                  onClick={() => { setState('idle'); setResult(null); }}
                  className="w-full py-2 text-center text-white/30 text-xs"
                >
                  {t('ai_advisor_retry')}
                </button>
              </motion.div>
            )}

            {/* ====== RATE LIMITED ====== */}
            {state === 'rate_limited' && (
              <motion.div
                key="rate_limited"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4 py-6"
              >
                <RateLimitBlock t={t} onUpgrade={() => { onClose(); navigate('/upgrade'); }} />

                {/* Still show history so user can apply previous results */}
                {history.length > 0 && (
                  <HistorySection
                    history={history}
                    showHistory={true}
                    onToggle={() => {}}
                    onApply={handleApplyFromHistory}
                    formatDate={formatDate}
                    t={t}
                  />
                )}

                <button
                  onClick={() => setState('idle')}
                  className="w-full py-2 text-center text-white/30 text-xs"
                >
                  {t('ai_advisor_try_again')}
                </button>
              </motion.div>
            )}

            {/* ====== ERROR ====== */}
            {state === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4 py-10"
              >
                <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle className="w-7 h-7 text-red-400" />
                </div>
                <p className="text-white/60 text-sm">{t('ai_advisor_error')}</p>
                {errorMsg && (
                  <p className="text-red-400/60 text-xs px-4 py-2 rounded-xl bg-red-500/8 border border-red-500/15">
                    {errorMsg}
                  </p>
                )}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { setState('idle'); setErrorMsg(''); }}
                  className="px-6 py-2.5 rounded-xl bg-[#6c5ce7]/15 border border-[#6c5ce7]/25 text-sm text-[#a29bfe] font-medium"
                >
                  {t('ai_advisor_try_again')}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
}

// ---- Sub-components ----

function MetricLine({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/30 text-xs">{label}</span>
      <span className={`text-xs font-medium ${highlight ? 'text-[#a29bfe]' : 'text-white/70'}`}>{value}</span>
    </div>
  );
}

function MacroPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="rounded-xl py-3 px-2 text-center"
      style={{ background: `${color}08`, border: `1px solid ${color}18` }}
    >
      <div className="flex items-center justify-center gap-1 mb-1">
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-white/40 text-xs">{label}</span>
      </div>
      <p className="text-white font-bold text-base">
        {value}<span className="text-white/30 text-xs font-normal ml-0.5">g</span>
      </p>
    </div>
  );
}

function RateLimitBlock({ t, onUpgrade }: { t: (k: string, p?: Record<string, string | number>) => string; onUpgrade: () => void }) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col items-center gap-3 text-center"
      style={{
        background: 'linear-gradient(135deg, rgba(108,92,231,0.06), rgba(255,215,0,0.04))',
        border: '1px solid rgba(108,92,231,0.15)',
      }}
    >
      <div className="w-14 h-14 rounded-full bg-[#6c5ce7]/10 flex items-center justify-center">
        <Lock className="w-6 h-6 text-[#a29bfe]" />
      </div>
      <p className="text-white/70 text-sm font-medium">{t('ai_advisor_rate_limit_reached')}</p>
      <p className="text-white/35 text-xs leading-relaxed">{t('ai_advisor_upgrade_for_unlimited')}</p>
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={onUpgrade}
        className="w-full h-12 rounded-xl bg-gradient-to-r from-[#ffd700] to-[#ffa500] flex items-center justify-center gap-2 mt-1"
        style={{ boxShadow: '0 4px 16px rgba(255,215,0,0.25)' }}
      >
        <Crown className="w-5 h-5 text-black/70" />
        <span className="text-black/80 text-sm font-semibold">{t('ai_advisor_upgrade_btn')}</span>
      </motion.button>
    </div>
  );
}

function HistorySection({
  history,
  showHistory,
  onToggle,
  onApply,
  formatDate,
  t,
}: {
  history: HistoryEntry[];
  showHistory: boolean;
  onToggle: () => void;
  onApply: (entry: HistoryEntry) => void;
  formatDate: (iso: string) => string;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <button
        onClick={onToggle}
        className="w-full p-3.5 flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-white/30" />
          <span className="text-white/50 text-xs font-medium">{t('ai_advisor_history')}</span>
          <span className="text-white/20 text-xs">({history.length})</span>
        </div>
        {showHistory
          ? <ChevronUp className="w-4 h-4 text-white/25" />
          : <ChevronDown className="w-4 h-4 text-white/25" />
        }
      </button>

      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pb-3 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              {history.slice(0, 10).map((entry, i) => (
                <div
                  key={`${entry.created_at}-${i}`}
                  className="rounded-xl p-3 flex items-center justify-between gap-2"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-white/70 text-sm font-semibold">
                        {entry.recommended_calories.toLocaleString()} {t('cal_unit')}
                      </span>
                      {entry.input?.had_photo && (
                        <ImageIcon className="w-3 h-3 text-[#a29bfe]/60" />
                      )}
                    </div>
                    <p className="text-white/30 text-xs truncate">
                      P:{entry.recommended_protein}g C:{entry.recommended_carbs}g F:{entry.recommended_fat}g
                    </p>
                    <p className="text-white/20 text-[0.6rem] mt-0.5">{formatDate(entry.created_at)}</p>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => onApply(entry)}
                    className="px-3 py-1.5 rounded-lg bg-[#00cec9]/10 border border-[#00cec9]/20 text-[#00cec9] text-xs font-medium flex-shrink-0"
                  >
                    {t('pn_apply') || 'Apply'}
                  </motion.button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}