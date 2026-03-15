// =============================================
// Proper Food AI — AI Plan Builder (multi-step, 7/30/100d)
// =============================================

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles, Clock, Sun, Moon, Sunrise, ChevronDown, ChevronUp,
  RefreshCw, Rocket, Loader2, AlertCircle, Bell, MessageCircle,
  ThumbsDown, ThumbsUp, Brain, Lightbulb, Timer, Send, History,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useAuth } from './auth-context';
import { api } from './api-client';
import { hapticFeedback, hapticSuccess } from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';
import { VoiceInput } from './voice-input';
import { PremiumGate } from './premium-gate';

type Phase = 'form' | 'loading' | 'conversation' | 'preview';

const TIME_OPTIONS = [5, 10, 20, 30, 60];
const PREFERRED_TIMES = ['morning', 'day', 'evening', 'any'] as const;
const SCHEDULES = ['everyday', 'weekdays', 'weekends'] as const;
const DURATIONS = [7, 30, 100] as const;

const PREFERRED_TIME_ICONS: Record<string, typeof Sun> = { morning: Sunrise, day: Sun, evening: Moon, any: Clock };
const TASK_TYPE_COLORS: Record<string, string> = { mindfulness: 'bg-purple-500/15 text-purple-300', action: 'bg-blue-500/15 text-blue-300', reflection: 'bg-amber-500/15 text-amber-300' };
const TASK_TYPE_EMOJI: Record<string, string> = { mindfulness: '\uD83E\uDDD8', action: '\u26A1', reflection: '\uD83C\uDF19' };

// Loading step keys resolved via t() at render time
const LOADING_KEYS = ['pb_load_1', 'pb_load_2', 'pb_load_3', 'pb_load_4', 'pb_load_5', 'pb_load_6'];

export function PlanBuilderPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, lang } = useTranslation();

  // Form
  const [userText, setUserText] = useState('');
  const [timePerDay, setTimePerDay] = useState(20);
  const [preferredTime, setPreferredTime] = useState<string>('any');
  const [schedule, setSchedule] = useState<string>('everyday');
  const [durationDays, setDurationDays] = useState<number>(7);

  // Flow
  const [phase, setPhase] = useState<Phase>('form');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [plan, setPlan] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [isActivating, setIsActivating] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);

  // Conversation (multi-step)
  const [coachResponse, setCoachResponse] = useState<string>('');
  const [questions, setQuestions] = useState<string[]>([]);
  const [answerText, setAnswerText] = useState('');
  const [stepNumber, setStepNumber] = useState(1);
  const [totalSteps, setTotalSteps] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Drafts badge count
  const [draftsCount, setDraftsCount] = useState(0);

  const canGenerate = userText.trim().length >= 10;
  const draftLoadedRef = useRef(false);
  const location = useLocation();

  // ---- Load drafts count for badge ----
  useEffect(() => {
    api.getPlanDrafts()
      .then((res) => setDraftsCount(res.drafts?.length || 0))
      .catch(() => {});
  }, []);

  // ---- Load draft from navigation state ----
  useEffect(() => {
    const state = location.state as { draftId?: string } | null;
    if (!state?.draftId || draftLoadedRef.current) return;
    draftLoadedRef.current = true;

    const loadDraft = async () => {
      setPhase('loading');
      setLoadingStep(0);
      try {
        const { draft } = await api.getPlanDraft(state.draftId!);
        if (!draft) {
          setPhase('form');
          return;
        }

        setDraftId(draft.id);
        setUserText(draft.inputSummary || '');
        setDurationDays(draft.durationDays || 7);
        setTimePerDay(draft.timePerDay || 20);
        setPreferredTime(draft.preferredTime || 'any');
        setSchedule(draft.schedule || 'everyday');
        setStepNumber(draft.currentStep || 1);
        setTotalSteps(draft.totalSteps || 1);

        if (draft.plan) {
          // Draft has a finished plan — go straight to preview
          setPlan(draft.plan);
          setPhase('preview');
        } else if (draft.questions?.length) {
          // Draft is mid-conversation — resume
          setCoachResponse(
            draft.conversationHistory?.filter((h: any) => h.role === 'assistant').pop()?.content || ''
          );
          setQuestions(draft.questions);
          setPhase('conversation');
        } else {
          // Draft has only input — pre-fill form
          setPhase('form');
        }
      } catch (err) {
        console.error('[PlanBuilder] Error loading draft:', err);
        setPhase('form');
      }
    };
    loadDraft();
    // Clear the state so refresh doesn't reload
    window.history.replaceState({}, '');
  }, [location.state]);

  // ---- Generate / Start ----
  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;
    hapticFeedback('medium');
    setPhase('loading');
    setError(null);
    setLoadingStep(0);

    const steps = LOADING_KEYS;
    let step = 0;
    const si = setInterval(() => { step = Math.min(step + 1, steps.length - 1); setLoadingStep(step); }, 2500);

    try {
      const result = await api.planStep({
        userText: userText.trim(), timePerDay, preferredTime, schedule, durationDays,
      });
      clearInterval(si);
      setDraftId(result.draftId);
      setStepNumber(result.stepNumber);
      setTotalSteps(result.totalSteps);

      if (result.type === 'plan') {
        setPlan(result.plan);
        setPhase('preview');
        setExpandedDay(null);
      } else {
        setCoachResponse(result.coachResponse || '');
        setQuestions(result.questions || []);
        setPhase('conversation');
      }
      hapticSuccess();
    } catch (err: any) {
      clearInterval(si);
      console.error('[PlanBuilder] Error:', err);
      setError(t('pb_error'));
      setPhase('form');
    }
  }, [canGenerate, userText, timePerDay, preferredTime, schedule, durationDays, t]);

  // ---- Continue conversation ----
  const handleContinue = useCallback(async () => {
    if (!draftId || answerText.trim().length < 5) return;
    hapticFeedback('medium');
    setIsSubmitting(true);
    setError(null);

    try {
      const isLast = stepNumber + 1 >= totalSteps;
      if (isLast) {
        setPhase('loading');
        setLoadingStep(0);
        const steps = LOADING_KEYS;
        let step = 0;
        const si = setInterval(() => { step = Math.min(step + 1, steps.length - 1); setLoadingStep(step); }, 2500);

        const result = await api.planStep({ draftId, userResponse: answerText.trim() });
        clearInterval(si);
        setStepNumber(result.stepNumber);

        if (result.type === 'plan') {
          setPlan(result.plan);
          setPhase('preview');
          setExpandedDay(null);
        } else {
          setCoachResponse(result.coachResponse || '');
          setQuestions(result.questions || []);
          setPhase('conversation');
        }
      } else {
        const result = await api.planStep({ draftId, userResponse: answerText.trim() });
        setStepNumber(result.stepNumber);
        setCoachResponse(result.coachResponse || '');
        setQuestions(result.questions || []);
        setAnswerText('');
      }
      hapticSuccess();
    } catch (err: any) {
      console.error('[PlanBuilder] Continue error:', err);
      setError(t('pb_error'));
    } finally {
      setIsSubmitting(false);
    }
  }, [draftId, answerText, stepNumber, totalSteps, t]);

  const handleRegenerate = useCallback(() => {
    hapticFeedback('light');
    setPhase('form');
    setPlan(null);
    setDraftId(null);
    setExpandedDay(null);
    setCoachResponse('');
    setQuestions([]);
    setAnswerText('');
    setStepNumber(1);
    setTotalSteps(1);
  }, []);

  const handleActivate = useCallback(async () => {
    if (!draftId) return;
    hapticFeedback('heavy');
    setIsActivating(true);
    try {
      await api.activatePlan(draftId);
      hapticSuccess();
      navigate('/home', { replace: true });
    } catch (err: any) {
      console.error('[PlanBuilder] Activate error:', err);
      setError(t('pb_error'));
      setIsActivating(false);
    }
  }, [draftId, navigate, t]);

  const loadingSteps = LOADING_KEYS.map(k => t(k));

  return (
    <PremiumGate feature="plan-builder">
    <div className="min-h-screen pb-28">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-[#6c5ce7]/15 blur-[100px]" />
        <div className="absolute top-1/2 -left-20 w-40 h-40 rounded-full bg-[#00cec9]/10 blur-[80px]" />
      </div>

      <div className="relative z-10 px-5 pb-6" >
        {/* Header */}
        <PageHeader
          title={t('pb_title')}
          actions={
            <button onClick={() => { hapticFeedback('light'); navigate('/plan-history'); }} className="relative w-10 h-10 rounded-xl bg-ui-button border border-ui-button flex items-center justify-center">
              <History className="w-5 h-5 text-ui-icon-secondary" />
              {draftsCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#e17055] text-white flex items-center justify-center" style={{ fontSize: '0.625rem', fontWeight: 700 }}>
                  {draftsCount}
                </span>
              )}
            </button>
          }
        />

        <AnimatePresence mode="wait">
          {/* ==== FORM ==== */}
          {phase === 'form' && (
            <motion.div key="form" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-5">
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" /><p className="text-red-300 text-sm">{error}</p>
                </div>
              )}

              {/* Duration selector */}
              <div>
                <label className="block text-muted-foreground mb-2" style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.08em' }}>{t('pb_duration_label')}</label>
                <div className="grid grid-cols-3 gap-2">
                  {DURATIONS.map((d) => (
                    <button key={d} onClick={() => { hapticFeedback('light'); setDurationDays(d); }}
                      className={`py-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${durationDays === d ? 'bg-[#6c5ce7]/15 border-[#6c5ce7]/40 text-foreground' : 'bg-ui-button border-ui-button text-ui-text-secondary'}`}>
                      <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>{d}</span>
                      <span style={{ fontSize: '0.6875rem' }}>{t(`pb_${d}d_desc`)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Situation */}
              <div>
                <label className="block text-muted-foreground mb-2" style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.08em' }}>{t('pb_situation_label')}</label>
                <textarea value={userText} onChange={(e) => setUserText(e.target.value)} placeholder={t('pb_situation_placeholder')} rows={5} maxLength={2000}
                  className="w-full rounded-2xl ui-input border px-4 py-3 resize-none focus:outline-none focus:border-[#6c5ce7]/40 transition-colors" style={{ fontSize: '0.9375rem', lineHeight: 1.6 }} />
                <div className="flex items-center justify-between mt-1">
                  <VoiceInput
                    onTranscript={(text) => setUserText((prev) => prev ? prev + ' ' + text : text)}
                    language={lang}
                    size="sm"
                  />
                  <p className="text-ui-text-tertiary" style={{ fontSize: '0.6875rem' }}>{userText.length}/2000</p>
                </div>
              </div>

              {/* Time per day */}
              <div>
                <label className="block text-muted-foreground mb-2" style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.08em' }}>{t('pb_time_label')}</label>
                <div className="flex gap-2">
                  {TIME_OPTIONS.map((m) => (
                    <button key={m} onClick={() => { hapticFeedback('light'); setTimePerDay(m); }}
                      className={`flex-1 py-2.5 rounded-xl border text-center transition-all ${timePerDay === m ? 'bg-[#6c5ce7]/15 border-[#6c5ce7]/40 text-foreground' : 'bg-ui-button border-ui-button text-ui-text-secondary'}`} style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                      {t(`pb_time_${m}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preferred time */}
              <div>
                <label className="block text-muted-foreground mb-2" style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.08em' }}>{t('pb_preferred_time_label')}</label>
                <div className="grid grid-cols-4 gap-2">
                  {PREFERRED_TIMES.map((pt) => {
                    const Icon = PREFERRED_TIME_ICONS[pt];
                    return (
                      <button key={pt} onClick={() => { hapticFeedback('light'); setPreferredTime(pt); }}
                        className={`py-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${preferredTime === pt ? 'bg-[#6c5ce7]/15 border-[#6c5ce7]/40 text-foreground' : 'bg-ui-button border-ui-button text-ui-text-secondary'}`}>
                        <Icon className="w-4 h-4" />
                        <span style={{ fontSize: '0.6875rem', fontWeight: 500 }}>{t(`pb_${pt === 'day' ? 'day' : pt === 'morning' ? 'morning' : pt === 'evening' ? 'evening' : 'any_time'}`)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Schedule */}
              <div>
                <label className="block text-muted-foreground mb-2" style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.08em' }}>{t('pb_schedule_label')}</label>
                <div className="flex gap-2">
                  {SCHEDULES.map((s) => (
                    <button key={s} onClick={() => { hapticFeedback('light'); setSchedule(s); }}
                      className={`flex-1 py-2.5 rounded-xl border text-center transition-all ${schedule === s ? 'bg-[#6c5ce7]/15 border-[#6c5ce7]/40 text-foreground' : 'bg-ui-button border-ui-button text-ui-text-secondary'}`} style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                      {t(`pb_${s}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate */}
              <motion.button whileTap={{ scale: 0.97 }} onClick={handleGenerate} disabled={!canGenerate}
                className={`w-full h-14 rounded-2xl flex items-center justify-center gap-2.5 transition-all ${canGenerate ? 'bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white shadow-lg' : 'bg-ui-button text-ui-text-tertiary'}`}
                style={{ fontSize: '1.0625rem', fontWeight: 600, boxShadow: canGenerate ? '0 8px 32px rgba(108,92,231,0.3)' : 'none' }}>
                <Sparkles className="w-5 h-5" />{t('pb_generate')}
              </motion.button>
              {!canGenerate && userText.length > 0 && <p className="text-center text-ui-text-tertiary" style={{ fontSize: '0.75rem' }}>{t('pb_min_text')}</p>}
            </motion.div>
          )}

          {/* ==== LOADING ==== */}
          {phase === 'loading' && (
            <motion.div key="loading" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="flex flex-col items-center justify-center py-16">
              <motion.div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#6c5ce7]/20 to-[#a29bfe]/20 flex items-center justify-center mb-6"
                animate={{ scale: [1, 1.08, 1], boxShadow: ['0 0 0 0 rgba(108,92,231,0)', '0 0 40px 8px rgba(108,92,231,0.15)', '0 0 0 0 rgba(108,92,231,0)'] }}
                transition={{ duration: 2, repeat: Infinity }}>
                <Brain className="w-10 h-10 text-[#a29bfe]" />
              </motion.div>
              <h2 className="text-foreground text-lg font-semibold mb-3">{t('pb_generating')}</h2>
              <AnimatePresence mode="wait">
                <motion.p key={loadingStep} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="text-muted-foreground text-sm text-center">
                  {loadingSteps[loadingStep]}
                </motion.p>
              </AnimatePresence>
              <div className="flex gap-2 mt-6">
                {loadingSteps.map((_, i) => (
                  <motion.div key={i} className={`w-2 h-2 rounded-full ${i <= loadingStep ? 'bg-[#6c5ce7]' : 'bg-ui-progress'}`}
                    animate={i === loadingStep ? { scale: [1, 1.4, 1] } : {}} transition={{ duration: 0.6, repeat: i === loadingStep ? Infinity : 0 }} />
                ))}
              </div>
            </motion.div>
          )}

          {/* ==== CONVERSATION (multi-step) ==== */}
          {phase === 'conversation' && (
            <motion.div key="conversation" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-4">
              {/* Step progress */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-[#a29bfe]/70" style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                  {t('pb_step_n', { n: stepNumber, total: totalSteps })}
                </span>
                <div className="flex gap-1">
                  {Array.from({ length: totalSteps }, (_, i) => (
                    <div key={i} className={`h-1.5 rounded-full transition-all ${i < stepNumber ? 'w-5 bg-[#6c5ce7]' : i === stepNumber ? 'w-5 bg-[#6c5ce7]/40' : 'w-3 bg-white/10'}`} />
                  ))}
                </div>
              </div>

              {/* Coach message */}
              <GlassCard variant="elevated" padding="md" className="relative overflow-hidden">
                <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-[#6c5ce7]/10 blur-[30px] pointer-events-none" />
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="w-7 h-7 rounded-lg bg-[#6c5ce7]/15 flex items-center justify-center">
                    <MessageCircle className="w-3.5 h-3.5 text-[#a29bfe]" />
                  </div>
                  <p className="text-[#a29bfe]" style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.05em' }}>{t('pb_coach_intro')}</p>
                </div>
                <p className="text-white/65" style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>{coachResponse}</p>
              </GlassCard>

              {/* Questions list */}
              <div className="space-y-2">
                {questions.map((q, i) => (
                  <div key={i} className="flex items-start gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                    <span className="w-5 h-5 rounded-md bg-[#6c5ce7]/15 flex items-center justify-center shrink-0 mt-0.5" style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#a29bfe' }}>{i + 1}</span>
                    <p className="text-white/50" style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>{q}</p>
                  </div>
                ))}
              </div>

              {/* Answer textarea */}
              <textarea
                value={answerText} onChange={(e) => setAnswerText(e.target.value)}
                placeholder={t('pb_answer_hint')} rows={4} maxLength={2000}
                className="w-full rounded-2xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-white placeholder-white/20 resize-none focus:outline-none focus:border-[#6c5ce7]/40 transition-colors"
                style={{ fontSize: '0.9375rem', lineHeight: 1.6 }}
              />
              <div className="flex items-center justify-end -mt-1">
                <VoiceInput
                  onTranscript={(text) => setAnswerText((prev) => prev ? prev + ' ' + text : text)}
                  language={lang}
                  size="sm"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" /><p className="text-red-300 text-sm">{error}</p>
                </div>
              )}

              {/* Continue / Generate button */}
              <motion.button whileTap={{ scale: 0.97 }} onClick={handleContinue} disabled={answerText.trim().length < 5 || isSubmitting}
                className={`w-full h-14 rounded-2xl flex items-center justify-center gap-2.5 transition-all ${answerText.trim().length >= 5 ? 'bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white shadow-lg' : 'bg-white/[0.04] text-white/20'}`}
                style={{ fontSize: '1.0625rem', fontWeight: 600, boxShadow: answerText.trim().length >= 5 ? '0 8px 32px rgba(108,92,231,0.3)' : 'none' }}>
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                {stepNumber + 1 >= totalSteps ? t('pb_last_step') : t('pb_continue')}
              </motion.button>
            </motion.div>
          )}

          {/* ==== PREVIEW ==== */}
          {phase === 'preview' && plan && (
            <motion.div key="preview" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-4">
              {/* Plan header */}
              <GlassCard variant="elevated">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] flex items-center justify-center shrink-0">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[#a29bfe] mb-0.5" style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.08em' }}>{t('pb_preview_title').toUpperCase()}</p>
                    <h2 className="text-white" style={{ fontSize: '1.25rem', fontWeight: 700 }}>{plan.programTitle}</h2>
                    {plan.programSubtitle && <p className="text-white/40 mt-0.5" style={{ fontSize: '0.8125rem' }}>{plan.programSubtitle}</p>}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#6c5ce7]/10 text-[#a29bfe]" style={{ fontSize: '0.6875rem', fontWeight: 500 }}>
                        <Timer className="w-3 h-3" /> {plan.durationDays || 7} {t('shared_days_unit')}
                      </span>
                    </div>
                  </div>
                </div>
              </GlassCard>

              {/* Coach intro */}
              {plan.coachIntro && (
                <GlassCard variant="elevated" padding="md" className="relative overflow-hidden">
                  <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-[#6c5ce7]/10 blur-[40px] pointer-events-none" />
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className="w-7 h-7 rounded-lg bg-[#6c5ce7]/15 flex items-center justify-center"><MessageCircle className="w-3.5 h-3.5 text-[#a29bfe]" /></div>
                    <p className="text-[#a29bfe]" style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.05em' }}>{t('pb_coach_intro')}</p>
                  </div>
                  <p className="text-white/70" style={{ fontSize: '0.875rem', lineHeight: 1.6, fontStyle: 'italic' }}>&ldquo;{plan.coachIntro}&rdquo;</p>
                </GlassCard>
              )}

              {/* Days list */}
              <div className="space-y-2">
                {(plan.days || []).map((day: any, dayIdx: number) => {
                  const isExpanded = expandedDay === day.dayNumber;
                  return (
                    <motion.div key={day.dayNumber} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * Math.min(dayIdx, 10) }}>
                      <GlassCard variant={isExpanded ? 'elevated' : 'interactive'} padding="sm" onClick={() => { hapticFeedback('light'); setExpandedDay(isExpanded ? null : day.dayNumber); }}>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-[#6c5ce7]/15 flex items-center justify-center shrink-0">
                            <span className="text-[#a29bfe]" style={{ fontSize: '0.8125rem', fontWeight: 700 }}>{day.dayNumber}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white truncate" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{day.title}</p>
                            <p className="text-white/30 truncate" style={{ fontSize: '0.75rem' }}>{t('pb_tasks_n', { n: day.tasks?.length || 0 })}</p>
                          </div>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-white/30 shrink-0" /> : <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />}
                        </div>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                              <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-3">
                                {day.description && <p className="text-white/40" style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>{day.description}</p>}
                                {day.coachMessage && (
                                  <div className="p-3 rounded-xl bg-[#6c5ce7]/[0.06] border border-[#6c5ce7]/10">
                                    <p className="text-[#a29bfe]/70 mb-1" style={{ fontSize: '0.6275rem', fontWeight: 600, letterSpacing: '0.05em' }}>{t('pb_morning_msg')}</p>
                                    <p className="text-white/55" style={{ fontSize: '0.8125rem', lineHeight: 1.5, fontStyle: 'italic' }}>&ldquo;{day.coachMessage}&rdquo;</p>
                                  </div>
                                )}
                                <div className="space-y-2">
                                  {(day.tasks || []).map((task: any, idx: number) => (
                                    <div key={idx} className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3">
                                      <div className="flex items-start gap-2.5">
                                        <span style={{ fontSize: '1rem' }}>{TASK_TYPE_EMOJI[task.type] || '\u2728'}</span>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 mb-1">
                                            <p className="text-white" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{task.title}</p>
                                            <span className={`px-1.5 py-0 rounded text-[0.6rem] font-medium ${TASK_TYPE_COLORS[task.type] || TASK_TYPE_COLORS.action}`}>{task.type}</span>
                                          </div>
                                          <p className="text-white/35" style={{ fontSize: '0.8125rem', lineHeight: 1.45 }}>{task.description}</p>
                                          <div className="flex items-center gap-3 mt-2">
                                            {task.estimatedMinutes && <span className="inline-flex items-center gap-1 text-white/25" style={{ fontSize: '0.6875rem' }}><Clock className="w-3 h-3" /> {t('pb_est_time', { min: task.estimatedMinutes })}</span>}
                                            {task.reminderTime && <span className="inline-flex items-center gap-1 text-[#a29bfe]/50" style={{ fontSize: '0.6875rem' }}><Bell className="w-3 h-3" /> {t('pb_reminder_at', { time: task.reminderTime })}</span>}
                                          </div>
                                          {task.whyItMatters && (
                                            <div className="mt-2 flex items-start gap-1.5">
                                              <Lightbulb className="w-3 h-3 text-amber-400/50 shrink-0 mt-0.5" />
                                              <p className="text-amber-300/40" style={{ fontSize: '0.75rem', lineHeight: 1.4 }}>{task.whyItMatters}</p>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                {(day.doneReaction || day.skipReaction) && (
                                  <div className="grid grid-cols-2 gap-2">
                                    {day.doneReaction && (
                                      <div className="p-2.5 rounded-xl bg-emerald-500/[0.05] border border-emerald-500/10">
                                        <div className="flex items-center gap-1 mb-1"><ThumbsUp className="w-3 h-3 text-emerald-400/60" /><p className="text-emerald-400/60" style={{ fontSize: '0.6rem', fontWeight: 600 }}>{t('pb_if_done')}</p></div>
                                        <p className="text-white/35" style={{ fontSize: '0.75rem', fontStyle: 'italic' }}>&ldquo;{day.doneReaction}&rdquo;</p>
                                      </div>
                                    )}
                                    {day.skipReaction && (
                                      <div className="p-2.5 rounded-xl bg-red-500/[0.05] border border-red-500/10">
                                        <div className="flex items-center gap-1 mb-1"><ThumbsDown className="w-3 h-3 text-red-400/60" /><p className="text-red-400/60" style={{ fontSize: '0.6rem', fontWeight: 600 }}>{t('pb_if_skip')}</p></div>
                                        <p className="text-white/35" style={{ fontSize: '0.75rem', fontStyle: 'italic' }}>&ldquo;{day.skipReaction}&rdquo;</p>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {day.reflectionPrompt && (
                                  <div className="p-2.5 rounded-xl bg-amber-500/[0.06] border border-amber-500/10">
                                    <p className="text-amber-300/60" style={{ fontSize: '0.6275rem', fontWeight: 600, letterSpacing: '0.05em' }}>{t('pb_reflection')}</p>
                                    <p className="text-white/35 mt-1" style={{ fontSize: '0.8125rem', fontStyle: 'italic' }}>{day.reflectionPrompt}</p>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </GlassCard>
                    </motion.div>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="space-y-3 pt-2">
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleActivate} disabled={isActivating}
                  className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white flex items-center justify-center gap-2.5 shadow-lg"
                  style={{ fontSize: '1.0625rem', fontWeight: 600, boxShadow: '0 8px 32px rgba(108,92,231,0.3)' }}>
                  {isActivating ? <><Loader2 className="w-5 h-5 animate-spin" /> {t('pb_activating')}</> : <><Rocket className="w-5 h-5" /> {t('pb_start_plan')}</>}
                </motion.button>
                <button onClick={handleRegenerate} disabled={isActivating} className="w-full h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white/50 flex items-center justify-center gap-2" style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                  <RefreshCw className="w-4 h-4" />{t('pb_regenerate')}
                </button>
              </div>
              {error && <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20"><AlertCircle className="w-4 h-4 text-red-400 shrink-0" /><p className="text-red-300 text-sm">{error}</p></div>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
    </PremiumGate>
  );
}