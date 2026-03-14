// =============================================
// AI Calorie Advisor — Body Analysis Bottom Sheet
// =============================================
// Analyzes user metrics + optional body photo via GPT-4o Vision
// to provide personalized calorie recommendations.
// =============================================

import React, { useState, useRef, useCallback } from 'react';
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
} from 'lucide-react';
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

type AdvisorState = 'idle' | 'analyzing' | 'result' | 'error';

interface AiCalorieAdvisorProps {
  profile: ProfileMetrics;
  currentTarget: number;
  language: string;
  onApply: (calories: number, protein: number, carbs: number, fat: number) => void;
  onClose: () => void;
}

export function AiCalorieAdvisor({
  profile,
  currentTarget,
  language,
  onApply,
  onClose,
}: AiCalorieAdvisorProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<AdvisorState>('idle');
  const [result, setResult] = useState<AiResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoMime, setPhotoMime] = useState<string>('image/jpeg');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useBottomSheetLifecycle(true);

  const bmi = (profile.weight / ((profile.height / 100) ** 2)).toFixed(1);

  const handlePhotoSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPhotoPreview(dataUrl);
      // Extract base64 without prefix
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
    } catch (err: any) {
      console.error('[AI Advisor] Error:', err);
      setErrorMsg(err?.message || 'Analysis failed');
      setState('error');
      hapticError();
    }
  }, [profile, photoBase64, photoMime, language]);

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

  const goalEmoji: Record<string, string> = {
    lose_weight: '🔥',
    maintain_weight: '⚖️',
    gain_muscle: '💪',
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

                {/* Analyze button */}
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
                          <span className="text-[#00cec9] text-xs mt-0.5">•</span>
                          <p className="text-white/60 text-sm leading-relaxed">{tip}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Apply button */}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleApply}
                  className="w-full h-13 rounded-2xl bg-gradient-to-r from-[#00cec9] to-[#74b9ff] flex items-center justify-center gap-2"
                  style={{ boxShadow: '0 6px 24px rgba(0,206,201,0.3)' }}
                >
                  <Check className="w-5 h-5 text-white" />
                  <span className="text-white" style={{ fontSize: '1rem', fontWeight: 600 }}>
                    {t('ai_advisor_apply', { calories: result.recommended_calories })}
                  </span>
                </motion.button>

                {/* Re-analyze */}
                <button
                  onClick={() => { setState('idle'); setResult(null); }}
                  className="w-full py-2 text-center text-white/30 text-xs"
                >
                  {t('ai_advisor_retry')}
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