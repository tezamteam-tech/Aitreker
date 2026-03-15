// =============================================
// Proper Food AI — Strategic Goal Create (multi-step wizard)
// =============================================
// Phase 1: Goal input (Text / Voice / Photo) → Phase 2: AI thinking
// → Phase 3: Questions → Phase 4: Plan building
// → Phase 5: Plan review → Phase 6: Success
// =============================================

import React, { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Loader2,
  Target,
  ArrowRight,
  Calendar,
  Repeat,
  Check,
  Rocket,
  Type,
  Mic,
  Camera,
  Image as ImageIcon,
  UserCircle,
  Eye,
  X,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { api } from './api-client';
import type { StrategicInitiateResponse, StrategicPlanResponse, ImageAnalysisResponse } from './api-client';
import { hapticFeedback, hapticSuccess } from './telegram';
import { useTranslation } from './i18n';
import { VoiceInput } from './voice-input';
import { PremiumGate } from './premium-gate';
import { PageHeader } from './page-header';

type Phase = 'input' | 'analyzing' | 'suggestions' | 'thinking' | 'questions' | 'building' | 'review' | 'success';
type InputMode = 'text' | 'voice' | 'photo';

export function StrategicGoalCreatePage() {
  const navigate = useNavigate();
  const { t, lang } = useTranslation();

  const [phase, setPhase] = useState<Phase>('input');
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [goalText, setGoalText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Photo mode state
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [photoMode, setPhotoMode] = useState<'vision' | 'selfie'>('vision');
  const [imagePath, setImagePath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);

  // Image analysis results
  const [analysisResult, setAnalysisResult] = useState<ImageAnalysisResponse | null>(null);

  // Phase 2-3: Questions
  const [draftId, setDraftId] = useState('');
  const [coachIntro, setCoachIntro] = useState('');
  const [questions, setQuestions] = useState<StrategicInitiateResponse['questions']>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // Phase 5: Plan
  const [plan, setPlan] = useState<StrategicPlanResponse['plan'] | null>(null);

  // Phase 6: Activated goal ID
  const [activatedGoalId, setActivatedGoalId] = useState('');

  // ---- Image handling ----
  const handleImageSelect = useCallback(async (file: File, mode: 'vision' | 'selfie') => {
    setError(null);
    setPhotoMode(mode);

    // Resize image for upload (max 800px, JPEG quality 0.7)
    try {
      const base64 = await resizeAndEncode(file, 800, 0.7);
      setImagePreview(base64);
      setPhase('analyzing');
      hapticFeedback('medium');

      const result = await api.analyzeGoalImage(base64, mode);
      setAnalysisResult(result);
      // Store the image path returned from the server
      if (result.imagePath) {
        setImagePath(result.imagePath);
      }
      setPhase('suggestions');
      hapticSuccess();
    } catch (err: any) {
      console.error('[StrategicGoal] Image analysis error:', err);
      setError(err.message || 'Error analyzing image');
      setPhase('input');
    }
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>, mode: 'vision' | 'selfie') => {
    const file = e.target.files?.[0];
    if (file) handleImageSelect(file, mode);
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [handleImageSelect]);

  const handleSelectSuggestion = useCallback((goal: string) => {
    setGoalText(goal);
    hapticFeedback('light');
  }, []);

  // Step 1 -> 2 -> 3: Initiate
  const handleInitiate = useCallback(async () => {
    if (!goalText.trim() || goalText.trim().length < 5) return;
    setError(null);
    setPhase('thinking');
    hapticFeedback('medium');

    try {
      // Pass image paths if we have them from photo analysis
      const imgPaths: { visionImagePath?: string; selfieImagePath?: string } = {};
      if (imagePath && photoMode === 'vision') imgPaths.visionImagePath = imagePath;
      if (imagePath && photoMode === 'selfie') imgPaths.selfieImagePath = imagePath;

      const res = await api.strategicGoalInitiate(
        goalText.trim(),
        undefined,
        Object.keys(imgPaths).length > 0 ? imgPaths : undefined,
      );
      setDraftId(res.draftId);
      setCoachIntro(res.coachIntro);
      setQuestions(res.questions || []);
      const initial: Record<string, string> = {};
      (res.questions || []).forEach((q) => { initial[q.id] = ''; });
      setAnswers(initial);
      setPhase('questions');
    } catch (err: any) {
      console.error('[StrategicGoal] Initiate error:', err);
      setError(err.message || 'Error');
      setPhase('input');
    }
  }, [goalText, imagePath, photoMode]);

  // Step 3 -> 4 -> 5: Generate plan
  const handleBuildPlan = useCallback(async () => {
    setError(null);
    setPhase('building');
    hapticFeedback('medium');

    try {
      const res = await api.strategicGoalGeneratePlan(draftId, answers);
      setPlan(res.plan);
      setPhase('review');
    } catch (err: any) {
      console.error('[StrategicGoal] Plan generation error:', err);
      setError(err.message || 'Error');
      setPhase('questions');
    }
  }, [draftId, answers]);

  // Step 5 -> 6: Activate
  const handleActivate = useCallback(async () => {
    hapticFeedback('medium');
    setPhase('success');
    try {
      const res = await api.strategicGoalActivate(draftId);
      setActivatedGoalId(res.goal.id);
      hapticSuccess();
    } catch (err: any) {
      console.error('[StrategicGoal] Activate error:', err);
      setError(err.message || 'Error');
      setPhase('review');
    }
  }, [draftId]);

  // Mode tabs config
  const modes: { key: InputMode; icon: React.ReactNode; label: string }[] = [
    { key: 'text', icon: <Type className="w-4 h-4" />, label: t('sg_input_text') },
    { key: 'voice', icon: <Mic className="w-4 h-4" />, label: t('sg_input_voice') },
    { key: 'photo', icon: <Camera className="w-4 h-4" />, label: t('sg_input_photo') },
  ];

  return (
    <PremiumGate feature="strategic-goal">
    <div className="min-h-screen pb-16">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-[#6c5ce7]/10 blur-[120px]" />
        <div className="absolute bottom-1/3 -left-20 w-56 h-56 rounded-full bg-[#00cec9]/8 blur-[100px]" />
      </div>

      <div className="relative z-10 px-5 pb-6" >
        {/* Header */}
        <PageHeader title={t('sg_create')} />

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileChange(e, 'vision')}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFileChange(e, 'vision')}
        />
        <input
          ref={selfieInputRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={(e) => handleFileChange(e, 'selfie')}
        />

        <AnimatePresence mode="wait">
          {/* ========== PHASE 1: Goal Input (3 modes) ========== */}
          {phase === 'input' && (
            <motion.div key="input" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              {/* Hero */}
              <div className="mb-5">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#6c5ce7]/20 to-[#00cec9]/20 flex items-center justify-center mx-auto mb-4">
                  <Target className="w-7 h-7 text-[#a29bfe]" />
                </div>
                <p className="text-center text-ui-secondary" style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
                  {t('sg_choose_input')}
                </p>
              </div>

              {/* Input mode tabs */}
              <div className="flex gap-1.5 p-1 rounded-2xl bg-[var(--glass-bg-row)] border border-[var(--glass-border-subtle)] mb-5">
                {modes.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => { hapticFeedback('light'); setInputMode(m.key); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all ${
                      inputMode === m.key
                        ? 'bg-[#6c5ce7]/20 border border-[#6c5ce7]/30 text-foreground'
                        : 'text-ui-secondary'
                    }`}
                    style={{ fontSize: '0.8125rem', fontWeight: inputMode === m.key ? 600 : 400 }}
                  >
                    {m.icon}
                    {m.label}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {/* ---- TEXT MODE ---- */}
                {inputMode === 'text' && (
                  <motion.div key="text-mode" initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 15 }} transition={{ duration: 0.2 }}>
                    <textarea
                      value={goalText}
                      onChange={(e) => setGoalText(e.target.value)}
                      placeholder={t('sg_input_placeholder')}
                      rows={4}
                      autoFocus
                      className="w-full rounded-2xl bg-[var(--ui-input-bg)] border border-[var(--glass-border-subtle)] p-5 text-foreground placeholder:text-[var(--ui-text-tertiary)] outline-none focus:border-[#6c5ce7]/40 transition-colors resize-none mb-4"
                      style={{ fontSize: '1rem', lineHeight: 1.6 }}
                    />
                  </motion.div>
                )}

                {/* ---- VOICE MODE ---- */}
                {inputMode === 'voice' && (
                  <motion.div key="voice-mode" initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 15 }} transition={{ duration: 0.2 }}>
                    <GlassCard variant="elevated" padding="lg" className="mb-4">
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#6c5ce7]/20 to-[#fd79a8]/20 flex items-center justify-center">
                          <Mic className="w-6 h-6 text-[#a29bfe]" />
                        </div>
                        <p className="text-ui-secondary text-center" style={{ fontSize: '0.8125rem', lineHeight: 1.6 }}>
                          {t('sg_voice_hint')}
                        </p>
                        <VoiceInput
                          onTranscript={(text) => {
                            setGoalText((prev) => prev ? `${prev} ${text}` : text);
                          }}
                          language={lang}
                          size="md"
                        />
                      </div>
                    </GlassCard>

                    {/* Show transcribed text */}
                    <textarea
                      value={goalText}
                      onChange={(e) => setGoalText(e.target.value)}
                      placeholder={t('sg_or_type')}
                      rows={3}
                      className="w-full rounded-2xl bg-[var(--ui-input-bg)] border border-[var(--glass-border-subtle)] p-4 text-foreground placeholder:text-[var(--ui-text-tertiary)] outline-none focus:border-[#6c5ce7]/40 transition-colors resize-none mb-4"
                      style={{ fontSize: '0.9375rem', lineHeight: 1.5 }}
                    />
                  </motion.div>
                )}

                {/* ---- PHOTO MODE ---- */}
                {inputMode === 'photo' && (
                  <motion.div key="photo-mode" initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 15 }} transition={{ duration: 0.2 }}>
                    <div className="space-y-3 mb-5">
                      {/* Dream Photo option — gallery picker */}
                      <GlassCard
                        variant="interactive"
                        padding="md"
                        className="cursor-pointer relative overflow-hidden"
                      >
                        <input
                          type="file"
                          accept="image/*"
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          onChange={(e) => { hapticFeedback('medium'); handleFileChange(e, 'vision'); }}
                        />
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#fdcb6e]/20 to-[#e17055]/20 flex items-center justify-center shrink-0">
                            <ImageIcon className="w-6 h-6 text-[#fdcb6e]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-foreground" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                              {t('sg_photo_dream')}
                            </p>
                            <p className="text-ui-secondary mt-0.5" style={{ fontSize: '0.75rem', lineHeight: 1.4 }}>
                              {t('sg_photo_dream_desc')}
                            </p>
                          </div>
                          <ArrowRight className="w-4 h-4 text-ui-tertiary shrink-0" />
                        </div>
                      </GlassCard>

                      {/* Camera option — rear camera (capture=environment) */}
                      <GlassCard
                        variant="interactive"
                        padding="md"
                        className="cursor-pointer relative overflow-hidden"
                      >
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          onChange={(e) => { hapticFeedback('medium'); handleFileChange(e, 'vision'); }}
                        />
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#00cec9]/20 to-[#55efc4]/20 flex items-center justify-center shrink-0">
                            <Camera className="w-6 h-6 text-[#00cec9]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-foreground" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                              {t('sg_photo_camera')}
                            </p>
                            <p className="text-ui-secondary mt-0.5" style={{ fontSize: '0.75rem', lineHeight: 1.4 }}>
                              {t('sg_photo_camera_desc')}
                            </p>
                          </div>
                          <ArrowRight className="w-4 h-4 text-ui-tertiary shrink-0" />
                        </div>
                      </GlassCard>

                      {/* Selfie option — front camera (capture=user) */}
                      <GlassCard
                        variant="interactive"
                        padding="md"
                        className="cursor-pointer relative overflow-hidden"
                      >
                        <input
                          type="file"
                          accept="image/*"
                          capture="user"
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          onChange={(e) => { hapticFeedback('medium'); handleFileChange(e, 'selfie'); }}
                        />
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#fd79a8]/20 to-[#e84393]/20 flex items-center justify-center shrink-0">
                            <UserCircle className="w-6 h-6 text-[#fd79a8]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-foreground" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                              {t('sg_photo_selfie')}
                            </p>
                            <p className="text-ui-secondary mt-0.5" style={{ fontSize: '0.75rem', lineHeight: 1.4 }}>
                              {t('sg_photo_selfie_desc')}
                            </p>
                          </div>
                          <ArrowRight className="w-4 h-4 text-ui-tertiary shrink-0" />
                        </div>
                      </GlassCard>
                    </div>

                    {/* Or type below */}
                    <p className="text-ui-tertiary text-center mb-3" style={{ fontSize: '0.75rem' }}>
                      {t('sg_or_type')}
                    </p>
                    <textarea
                      value={goalText}
                      onChange={(e) => setGoalText(e.target.value)}
                      placeholder={t('sg_input_placeholder')}
                      rows={2}
                      className="w-full rounded-2xl bg-[var(--ui-input-bg)] border border-[var(--glass-border-subtle)] p-4 text-foreground placeholder:text-[var(--ui-text-tertiary)] outline-none focus:border-[#6c5ce7]/40 transition-colors resize-none mb-4"
                      style={{ fontSize: '0.9375rem', lineHeight: 1.5 }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {error && (
                <p className="text-red-400/70 text-center mb-3" style={{ fontSize: '0.8125rem' }}>{error}</p>
              )}

              {/* Continue button (visible when there's goal text) */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleInitiate}
                disabled={goalText.trim().length < 5}
                className="w-full h-13 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#00cec9] text-white disabled:opacity-30 flex items-center justify-center gap-2.5"
                style={{ fontSize: '1rem', fontWeight: 600, height: 52 }}
              >
                <Sparkles className="w-5 h-5" />
                {t('sg_continue_ai')}
              </motion.button>
            </motion.div>
          )}

          {/* ========== PHASE: Analyzing Image ========== */}
          {phase === 'analyzing' && (
            <motion.div key="analyzing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-16">
              {/* Show image preview */}
              {imagePreview && (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-32 h-32 rounded-3xl overflow-hidden mb-6 border-2 border-[#6c5ce7]/30"
                >
                  <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                </motion.div>
              )}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#6c5ce7]/20 to-[#00cec9]/20 flex items-center justify-center mb-5"
              >
                <Eye className="w-6 h-6 text-[#a29bfe]" />
              </motion.div>
              <p className="text-ui-secondary" style={{ fontSize: '0.9375rem', fontWeight: 500 }}>{t('sg_analyzing_image')}</p>
              <Loader2 className="w-5 h-5 text-[#a29bfe]/50 animate-spin mt-4" />
            </motion.div>
          )}

          {/* ========== PHASE: AI Suggestions from Image ========== */}
          {phase === 'suggestions' && analysisResult && (
            <motion.div key="suggestions" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              {/* Image preview + analysis */}
              <div className="flex gap-4 mb-5">
                {imagePreview && (
                  <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 border border-[var(--glass-border)]">
                    <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <GlassCard variant="accent" padding="sm" className="flex-1">
                  <div className="flex gap-2">
                    <Sparkles className="w-4 h-4 text-[#a29bfe] shrink-0 mt-0.5" />
                    <p className="text-foreground/70" style={{ fontSize: '0.8125rem', lineHeight: 1.6 }}>
                      {analysisResult.analysis}
                    </p>
                  </div>
                </GlassCard>
              </div>

              {/* Follow-up question */}
              {analysisResult.followUpQuestion && (
                <p className="text-ui-secondary mb-4 px-1" style={{ fontSize: '0.875rem', lineHeight: 1.6, fontStyle: 'italic' }}>
                  {analysisResult.followUpQuestion}
                </p>
              )}

              {/* Suggested goals */}
              <p className="text-ui-secondary mb-3 px-1" style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em' }}>
                {t('sg_ai_suggests').toUpperCase()}
              </p>

              <div className="space-y-2 mb-5">
                {analysisResult.suggestedGoals.map((goal, idx) => {
                  const isSelected = goalText === goal;
                  return (
                    <motion.button
                      key={idx}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.08 }}
                      onClick={() => handleSelectSuggestion(goal)}
                      className={`w-full text-left p-4 rounded-2xl border transition-all ${
                        isSelected
                          ? 'bg-[#6c5ce7]/15 border-[#6c5ce7]/40'
                          : 'bg-[var(--glass-bg-row)] border-[var(--glass-border-subtle)]'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          isSelected ? 'bg-[#6c5ce7]/30' : 'bg-[var(--glass-bg-card)]'
                        }`}>
                          {isSelected ? (
                            <Check className="w-3.5 h-3.5 text-[#a29bfe]" />
                          ) : (
                            <span className="text-ui-tertiary" style={{ fontSize: '0.6875rem', fontWeight: 700 }}>{idx + 1}</span>
                          )}
                        </div>
                        <p className={`${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}
                          style={{ fontSize: '0.875rem', fontWeight: isSelected ? 600 : 400, lineHeight: 1.5 }}>
                          {goal}
                        </p>
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              {/* Or type custom goal */}
              <p className="text-ui-tertiary text-center mb-2" style={{ fontSize: '0.75rem' }}>
                {t('sg_pick_goal')}
              </p>
              <textarea
                value={goalText}
                onChange={(e) => setGoalText(e.target.value)}
                placeholder={t('sg_input_placeholder')}
                rows={2}
                className="w-full rounded-2xl bg-[var(--ui-input-bg)] border border-[var(--glass-border-subtle)] p-4 text-foreground placeholder:text-[var(--ui-text-tertiary)] outline-none focus:border-[#6c5ce7]/40 transition-colors resize-none mb-4"
                style={{ fontSize: '0.9375rem', lineHeight: 1.5 }}
              />

              {error && (
                <p className="text-red-400/70 text-center mb-3" style={{ fontSize: '0.8125rem' }}>{error}</p>
              )}

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleInitiate}
                disabled={goalText.trim().length < 5}
                className="w-full h-13 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#00cec9] text-white disabled:opacity-30 flex items-center justify-center gap-2.5"
                style={{ fontSize: '1rem', fontWeight: 600, height: 52 }}
              >
                <Sparkles className="w-5 h-5" />
                {t('sg_continue_ai')}
              </motion.button>
            </motion.div>
          )}

          {/* ========== PHASE 2: AI Thinking ========== */}
          {phase === 'thinking' && (
            <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-24">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#6c5ce7]/20 to-[#00cec9]/20 flex items-center justify-center mb-6"
              >
                <Sparkles className="w-7 h-7 text-[#a29bfe]" />
              </motion.div>
              <p className="text-ui-secondary" style={{ fontSize: '0.9375rem', fontWeight: 500 }}>{t('sg_ai_thinking')}</p>
              <Loader2 className="w-5 h-5 text-[#a29bfe]/50 animate-spin mt-4" />
            </motion.div>
          )}

          {/* ========== PHASE 3: Questions ========== */}
          {phase === 'questions' && (
            <motion.div key="questions" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              {coachIntro && (
                <GlassCard variant="accent" padding="md" className="mb-6">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#6c5ce7]/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles className="w-4 h-4 text-[#a29bfe]" />
                    </div>
                    <p className="text-foreground/70" style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
                      {coachIntro}
                    </p>
                  </div>
                </GlassCard>
              )}

              <h2 className="text-foreground mb-4" style={{ fontSize: '1.125rem', fontWeight: 700 }}>
                {t('sg_questions_title')}
              </h2>

              <div className="space-y-4 mb-6">
                {questions.map((q, idx) => (
                  <motion.div
                    key={q.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.08 }}
                  >
                    <label className="text-muted-foreground mb-2 block" style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                      {q.text}
                    </label>
                    {q.type === 'select' && q.options ? (
                      <div className="flex flex-wrap gap-2">
                        {q.options.map((opt) => {
                          const isSelected = answers[q.id] === opt;
                          return (
                            <button
                              key={opt}
                              onClick={() => { hapticFeedback('light'); setAnswers((a) => ({ ...a, [q.id]: opt })); }}
                              className={`px-4 py-2 rounded-xl border transition-all ${
                                isSelected
                                  ? 'bg-[#6c5ce7]/20 border-[#6c5ce7]/40 text-foreground'
                                  : 'bg-[var(--glass-bg-row)] border-[var(--glass-border-subtle)] text-ui-secondary'
                              }`}
                              style={{ fontSize: '0.8125rem', fontWeight: isSelected ? 600 : 400 }}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    ) : q.type === 'number' ? (
                      <input
                        type="number"
                        value={answers[q.id] || ''}
                        onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                        className="w-full h-11 rounded-xl bg-[var(--ui-input-bg)] border border-[var(--glass-border-subtle)] px-4 text-foreground placeholder:text-[var(--ui-text-tertiary)] outline-none focus:border-[#6c5ce7]/40 transition-colors"
                        style={{ fontSize: '0.9375rem' }}
                      />
                    ) : (
                      <textarea
                        value={answers[q.id] || ''}
                        onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                        rows={2}
                        className="w-full rounded-xl bg-[var(--ui-input-bg)] border border-[var(--glass-border-subtle)] p-3.5 text-foreground placeholder:text-[var(--ui-text-tertiary)] outline-none focus:border-[#6c5ce7]/40 transition-colors resize-none"
                        style={{ fontSize: '0.9375rem', lineHeight: 1.5 }}
                      />
                    )}
                  </motion.div>
                ))}
              </div>

              {error && (
                <p className="text-red-400/70 text-center mb-3" style={{ fontSize: '0.8125rem' }}>{error}</p>
              )}

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleBuildPlan}
                disabled={questions.some((q) => !answers[q.id]?.trim())}
                className="w-full h-13 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#00cec9] text-white disabled:opacity-30 flex items-center justify-center gap-2.5"
                style={{ fontSize: '1rem', fontWeight: 600, height: 52 }}
              >
                <Sparkles className="w-5 h-5" />
                {t('sg_build_plan')}
              </motion.button>
            </motion.div>
          )}

          {/* ========== PHASE 4: Building Plan ========== */}
          {phase === 'building' && (
            <motion.div key="building" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-24">
              <motion.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#6c5ce7]/20 to-[#00cec9]/20 flex items-center justify-center mb-6"
              >
                <Sparkles className="w-7 h-7 text-[#a29bfe]" />
              </motion.div>
              <p className="text-ui-secondary" style={{ fontSize: '0.9375rem', fontWeight: 500 }}>{t('sg_building_plan')}</p>
              <div className="flex items-center gap-1.5 mt-4">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 rounded-full bg-[#a29bfe]/50"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.3 }}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {/* ========== PHASE 5: Plan Review ========== */}
          {phase === 'review' && plan && (
            <motion.div key="review" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <GlassCard variant="elevated" padding="lg" className="mb-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6c5ce7]/30 to-[#00cec9]/30 flex items-center justify-center">
                    <Target className="w-5 h-5 text-[#a29bfe]" />
                  </div>
                  <div>
                    <p className="text-[#00cec9]" style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em' }}>
                      {t('sg_plan_ready').toUpperCase()}
                    </p>
                    <p className="text-white/40" style={{ fontSize: '0.75rem' }}>
                      {t('sg_weeks', { n: plan.timelineWeeks })}
                    </p>
                  </div>
                </div>
                <p className="text-white/70" style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
                  {plan.strategySummary}
                </p>
              </GlassCard>

              {plan.phases && plan.phases.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-ui-secondary mb-3 px-1" style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em' }}>
                    {t('sg_phases').toUpperCase()}
                  </h3>
                  <div className="space-y-2">
                    {plan.phases.map((ph, idx) => (
                      <GlassCard key={idx} padding="sm" className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded-lg bg-[#6c5ce7]/10 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[#a29bfe]" style={{ fontSize: '0.6875rem', fontWeight: 700 }}>{idx + 1}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-foreground" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{ph.title}</p>
                          <p className="text-ui-secondary mt-0.5" style={{ fontSize: '0.75rem' }}>
                            {ph.description} &middot; {t('sg_w')}. {ph.weekStart}–{ph.weekEnd}
                          </p>
                        </div>
                      </GlassCard>
                    ))}
                  </div>
                </div>
              )}

              {plan.tasks && plan.tasks.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-ui-secondary mb-3 px-1" style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em' }}>
                    {t('sg_tasks').toUpperCase()}
                  </h3>
                  <div className="space-y-2">
                    {plan.tasks.map((task, idx) => (
                      <GlassCard key={idx} padding="sm" className="flex items-start gap-3">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          task.frequency === 'monthly' ? 'bg-[#fd79a8]/10' : 'bg-[#00cec9]/10'
                        }`}>
                          <Repeat className={`w-3.5 h-3.5 ${task.frequency === 'monthly' ? 'text-[#fd79a8]' : 'text-[#00cec9]'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-foreground" style={{ fontSize: '0.875rem', fontWeight: 500 }}>{task.title}</p>
                          <p className="text-ui-tertiary mt-0.5" style={{ fontSize: '0.75rem' }}>
                            {task.description?.slice(0, 100)}
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className={`${task.frequency === 'monthly' ? 'text-[#fd79a8]/50' : 'text-[#00cec9]/50'}`}
                              style={{ fontSize: '0.6875rem', fontWeight: 600 }}>
                              {t(task.frequency === 'monthly' ? 'sg_monthly' : 'sg_weekly')}
                            </span>
                            <span className="flex items-center gap-1 text-ui-tertiary" style={{ fontSize: '0.6875rem' }}>
                              <Calendar className="w-3 h-3" />
                              {task.firstDueDate}
                            </span>
                          </div>
                        </div>
                      </GlassCard>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <p className="text-red-400/70 text-center mb-3" style={{ fontSize: '0.8125rem' }}>{error}</p>
              )}

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleActivate}
                className="w-full h-13 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#00cec9] text-white flex items-center justify-center gap-2.5"
                style={{ fontSize: '1rem', fontWeight: 600, height: 52 }}
              >
                <Rocket className="w-5 h-5" />
                {t('sg_start')}
              </motion.button>
            </motion.div>
          )}

          {/* ========== PHASE 6: Success ========== */}
          {phase === 'success' && (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-20">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.1 }}
                className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-500/20 to-[#00cec9]/20 border border-emerald-500/20 flex items-center justify-center mb-6"
              >
                <Check className="w-9 h-9 text-emerald-400" />
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-white text-center mb-2"
                style={{ fontSize: '1.5rem', fontWeight: 700 }}
              >
                {t('sg_plan_ready')}
              </motion.h2>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-ui-secondary text-center mb-10"
                style={{ fontSize: '0.9375rem' }}
              >
                {t('sg_subtitle')}
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="flex gap-3 w-full"
              >
                <button
                  onClick={() => navigate('/goals')}
                  className="flex-1 h-12 rounded-xl bg-[var(--glass-bg-card)] border border-[var(--glass-border)] text-muted-foreground flex items-center justify-center"
                  style={{ fontSize: '0.9375rem', fontWeight: 500 }}
                >
                  {t('goals_title')}
                </button>
                <button
                  onClick={() => activatedGoalId ? navigate(`/strategic-goal/${activatedGoalId}`) : navigate('/home')}
                  className="flex-1 h-12 rounded-xl bg-gradient-to-r from-[#6c5ce7] to-[#00cec9] text-white flex items-center justify-center gap-2"
                  style={{ fontSize: '0.9375rem', fontWeight: 600 }}
                >
                  {t('sg_start')}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
    </PremiumGate>
  );
}

// ---- Helper: Resize image and convert to base64 data URL ----
function resizeAndEncode(file: File, maxSize: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height / width) * maxSize);
          width = maxSize;
        } else {
          width = Math.round((width / height) * maxSize);
          height = maxSize;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(dataUrl);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load error')); };
    img.src = url;
  });
}