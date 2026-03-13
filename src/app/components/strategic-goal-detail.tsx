// =============================================
// Proper Food AI — Strategic Goal Detail (/strategic-goal/:id)
// AI Check-in, review history, tap-to-reorder tasks
// =============================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Target,
  Repeat,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  Check,
  Sparkles,
  ChevronUp,
  ChevronDown as ChevronDownIcon,
  TrendingUp,
  Trophy,
  AlertTriangle,
  Lightbulb,
  X,
  ArrowUpDown,
  Camera,
  UserCircle,
  Eye,
  Image as ImageIcon,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useBottomSheetLifecycle } from './bottom-sheet-context';
import { api } from './api-client';
import type { StrategicGoal, StrategicTask, StrategicReview, SelfieCheckinResponse, SelfieRecord } from './api-client';
import { hapticFeedback, hapticSuccess } from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';

export function StrategicGoalDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useTranslation();

  const [goal, setGoal] = useState<StrategicGoal | null>(null);
  const [tasks, setTasks] = useState<StrategicTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);

  // Reorder mode
  const [reorderMode, setReorderMode] = useState(false);

  // AI Review state
  const [reviewing, setReviewing] = useState(false);
  const [latestReview, setLatestReview] = useState<StrategicReview | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [reviewHistory, setReviewHistory] = useState<StrategicReview[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Vision board & Selfie check-in
  const [visionImageUrl, setVisionImageUrl] = useState<string | null>(null);
  const [selfieChecking, setSelfieChecking] = useState(false);
  const [selfieResult, setSelfieResult] = useState<SelfieCheckinResponse | null>(null);
  const [showSelfieResult, setShowSelfieResult] = useState(false);
  const [selfieHistory, setSelfieHistory] = useState<SelfieRecord[]>([]);
  const [showSelfieHistory, setShowSelfieHistory] = useState(false);
  const selfieInputRef = useRef<HTMLInputElement>(null);

  const reorderTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hide tab bar when any bottom sheet is open
  useBottomSheetLifecycle(showReview || showHistory || showSelfieResult || showSelfieHistory);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const [goalRes, reviewsRes] = await Promise.all([
        api.getStrategicGoal(id),
        api.getStrategicReviews(id).catch(() => ({ reviews: [] })),
      ]);
      setGoal(goalRes.goal);
      setTasks(goalRes.tasks);
      if (reviewsRes.reviews.length > 0) {
        setLatestReview(reviewsRes.reviews[0]);
        setReviewHistory(reviewsRes.reviews);
      }

      // Load vision image and selfie history
      if (goalRes.goal.visionImagePath) {
        api.getGoalVisionImage(id).then((r) => { if (r.url) setVisionImageUrl(r.url); }).catch(() => {});
      }
      if (goalRes.goal.selfieImagePath) {
        api.getGoalSelfies(id).then((r) => setSelfieHistory(r.selfies || [])).catch(() => {});
      }
    } catch (err) {
      console.error('[StrategicGoalDetail] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleComplete = async (task: StrategicTask) => {
    hapticFeedback('medium');
    setCompletingId(task.id);
    try {
      const updated = await api.completeStrategicTask(task.id);
      setTasks((prev) => prev.map((t) => t.id === task.id ? updated : t));
      hapticSuccess();
    } catch (err) {
      console.error('[StrategicGoalDetail] Complete error:', err);
    } finally {
      setCompletingId(null);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!id) return;
    hapticFeedback('medium');
    try {
      const updated = await api.updateStrategicGoal(id, { status });
      setGoal(updated);
      if (status === 'completed') hapticSuccess();
    } catch (err) {
      console.error('[StrategicGoalDetail] Status change error:', err);
    }
  };

  // AI Check-in
  const handleAIReview = async () => {
    if (!id || reviewing) return;
    hapticFeedback('medium');
    setReviewing(true);
    try {
      const res = await api.requestStrategicReview(id);
      setLatestReview(res.review);
      setReviewHistory((prev) => [res.review, ...prev]);
      setShowReview(true);
      hapticSuccess();
    } catch (err) {
      console.error('[StrategicGoalDetail] AI Review error:', err);
    } finally {
      setReviewing(false);
    }
  };

  // Reorder
  const moveTask = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= tasks.length) return;
    hapticFeedback('light');
    const newTasks = [...tasks];
    [newTasks[index], newTasks[newIndex]] = [newTasks[newIndex], newTasks[index]];
    setTasks(newTasks);

    // Debounce save
    if (reorderTimeout.current) clearTimeout(reorderTimeout.current);
    reorderTimeout.current = setTimeout(async () => {
      if (!id) return;
      try {
        await api.reorderStrategicTasks(id, newTasks.map((t) => t.id));
      } catch (err) {
        console.error('[Reorder] Save error:', err);
      }
    }, 600);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-white/20 animate-spin" />
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <Target className="w-10 h-10 text-white/10 mb-3" />
        <p className="text-white/30" style={{ fontSize: '0.9375rem' }}>Goal not found</p>
        <button onClick={() => navigate('/goals')} className="mt-4 text-[#00cec9]" style={{ fontSize: '0.9375rem' }}>Back</button>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const phases = goal.structuredDataJson?.phases || [];

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-[#00cec9]';
    if (score >= 40) return 'text-yellow-400';
    return 'text-[#e17055]';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'from-emerald-500/20 to-emerald-500/5';
    if (score >= 60) return 'from-[#00cec9]/20 to-[#00cec9]/5';
    if (score >= 40) return 'from-yellow-400/20 to-yellow-400/5';
    return 'from-[#e17055]/20 to-[#e17055]/5';
  };

  return (
    <div className="min-h-screen pb-28">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-[#6c5ce7]/10 blur-[120px]" />
        <div className="absolute bottom-1/4 -left-20 w-56 h-56 rounded-full bg-[#00cec9]/8 blur-[100px]" />
      </div>

      <div className="relative z-10 px-5 pb-6" >
        {/* Header */}
        <PageHeader
          title={goal.title}
          subtitle={`${t('sg_weeks', { n: goal.timelineWeeks })} · ${goal.category}`}
        />

        {/* Strategy summary */}
        {goal.structuredDataJson?.strategySummary && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <GlassCard variant="accent" padding="md" className="mb-5">
              <h3 className="text-[#a29bfe]/70 mb-2" style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em' }}>
                {t('sg_strategy').toUpperCase()}
              </h3>
              <p className="text-white/60" style={{ fontSize: '0.8125rem', lineHeight: 1.6 }}>
                {goal.structuredDataJson.strategySummary}
              </p>
            </GlassCard>
          </motion.div>
        )}

        {/* Phases */}
        {phases.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="mb-5">
            <h3 className="text-white/30 mb-3 px-1" style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em' }}>
              {t('sg_phases').toUpperCase()}
            </h3>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {phases.map((ph, idx) => (
                <div key={idx} className="shrink-0 px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]" style={{ minWidth: 120 }}>
                  <p className="text-white/60" style={{ fontSize: '0.75rem', fontWeight: 600 }}>{ph.title}</p>
                  <p className="text-white/20 mt-0.5" style={{ fontSize: '0.625rem' }}>{t('sg_w')}. {ph.weekStart}–{ph.weekEnd}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* AI Check-in */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }} className="mb-5">
          <GlassCard variant="interactive" padding="md" className="relative overflow-hidden" onClick={handleAIReview}>
            <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-[#6c5ce7]/5 blur-[30px] pointer-events-none" />
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6c5ce7]/25 to-[#00cec9]/25 flex items-center justify-center shrink-0">
                {reviewing ? <Loader2 className="w-5 h-5 text-[#a29bfe] animate-spin" /> : <Sparkles className="w-5 h-5 text-[#a29bfe]" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                  {reviewing ? t('sg_reviewing') : t('sg_ai_checkin')}
                </p>
                <p className="text-white/30" style={{ fontSize: '0.75rem' }}>{t('sg_ai_checkin_desc')}</p>
              </div>
              {latestReview && !reviewing && (
                <div className={`px-2.5 py-1 rounded-lg bg-gradient-to-br ${getScoreBg(latestReview.overallScore)}`}>
                  <span className={getScoreColor(latestReview.overallScore)} style={{ fontSize: '0.875rem', fontWeight: 700 }}>
                    {latestReview.overallScore}
                  </span>
                </div>
              )}
            </div>
          </GlassCard>
        </motion.div>

        {/* Vision Board Image */}
        {visionImageUrl && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.095 }} className="mb-5">
            <h3 className="text-white/30 mb-3 px-1" style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em' }}>
              {t('sg_vision_board').toUpperCase()}
            </h3>
            <div className="rounded-2xl overflow-hidden border border-white/[0.08] relative">
              <img src={visionImageUrl} alt="Vision" className="w-full h-40 object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-3 left-3 flex items-center gap-2">
                <ImageIcon className="w-3.5 h-3.5 text-white/60" />
                <span className="text-white/60" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>{t('sg_vision_board')}</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Selfie Check-in */}
        {goal.selfieImagePath && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.097 }} className="mb-5">
            <input
              ref={selfieInputRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !id) return;
                e.target.value = '';
                setSelfieChecking(true);
                hapticFeedback('medium');
                try {
                  const base64 = await resizeAndEncodeDetail(file, 800, 0.7);
                  const result = await api.selfieCheckin(id, base64);
                  setSelfieResult(result);
                  setShowSelfieResult(true);
                  hapticSuccess();
                  // Reload selfie history
                  api.getGoalSelfies(id).then((r) => setSelfieHistory(r.selfies || [])).catch(() => {});
                } catch (err) {
                  console.error('[SelfieCheckin] Error:', err);
                } finally {
                  setSelfieChecking(false);
                }
              }}
            />
            <GlassCard
              variant="interactive"
              padding="md"
              className="relative overflow-hidden"
              onClick={() => {
                if (!selfieChecking) {
                  hapticFeedback('medium');
                  selfieInputRef.current?.click();
                }
              }}
            >
              <div className="absolute top-0 right-0 w-20 h-20 rounded-full bg-[#fd79a8]/5 blur-[25px] pointer-events-none" />
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#fd79a8]/25 to-[#a29bfe]/25 flex items-center justify-center shrink-0">
                  {selfieChecking ? <Loader2 className="w-5 h-5 text-[#fd79a8] animate-spin" /> : <Camera className="w-5 h-5 text-[#fd79a8]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                    {selfieChecking ? t('sg_selfie_analyzing') : t('sg_selfie_checkin')}
                  </p>
                  <p className="text-white/30" style={{ fontSize: '0.75rem' }}>{t('sg_selfie_checkin_desc')}</p>
                </div>
                {selfieHistory.length > 0 && !selfieChecking && (
                  <span className="px-2 py-0.5 rounded-lg bg-[#fd79a8]/10 text-[#fd79a8]/70" style={{ fontSize: '0.6875rem', fontWeight: 700 }}>
                    {selfieHistory.length}
                  </span>
                )}
              </div>
            </GlassCard>

            {/* Selfie history accordion */}
            {selfieHistory.length > 0 && (
              <div className="mt-3">
                <button
                  onClick={() => { hapticFeedback('light'); setShowSelfieHistory(!showSelfieHistory); }}
                  className="flex items-center gap-2 text-white/25 mb-2 px-1"
                >
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em' }}>
                    {t('sg_selfie_history').toUpperCase()} ({selfieHistory.length})
                  </span>
                  <ChevronDownIcon className={`w-3 h-3 transition-transform ${showSelfieHistory ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {showSelfieHistory && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {selfieHistory.map((s) => (
                          <div
                            key={s.id}
                            className="shrink-0 w-20 cursor-pointer"
                            onClick={() => {
                              setSelfieResult({ selfie: s, newSelfieUrl: s.imageUrl, originalUrl: null, analysis: s.analysis });
                              setShowSelfieResult(true);
                            }}
                          >
                            <div className="w-20 h-20 rounded-xl overflow-hidden border border-white/10 mb-1">
                              {s.imageUrl ? (
                                <img src={s.imageUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-white/[0.03] flex items-center justify-center">
                                  <UserCircle className="w-6 h-6 text-white/10" />
                                </div>
                              )}
                            </div>
                            <p className="text-white/30 text-center" style={{ fontSize: '0.5625rem' }}>
                              {t('sg_selfie_days', { n: s.daysSinceStart })}
                            </p>
                            <p className={`text-center ${getScoreColor(s.analysis?.score || 50)}`} style={{ fontSize: '0.625rem', fontWeight: 700 }}>
                              {s.analysis?.score || '—'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}

        {/* Goal status */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex gap-2 mb-5">
          {goal.status === 'active' && (
            <button onClick={() => handleStatusChange('completed')}
              className="flex-1 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center gap-1.5"
              style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
              <Check className="w-3.5 h-3.5" /> {t('goal_mark_done')}
            </button>
          )}
          {goal.status === 'completed' && (
            <button onClick={() => handleStatusChange('active')}
              className="flex-1 h-9 rounded-xl bg-[#00cec9]/10 border border-[#00cec9]/20 text-[#00cec9] flex items-center justify-center gap-1.5"
              style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
              {t('goal_reopen')}
            </button>
          )}
        </motion.div>

        {/* Tasks */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-white/30" style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em' }}>
              {t('sg_tasks').toUpperCase()}
            </h3>
            {tasks.length > 1 && (
              <button
                onClick={() => { hapticFeedback('light'); setReorderMode(!reorderMode); }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all ${
                  reorderMode ? 'bg-[#6c5ce7]/15 border border-[#6c5ce7]/30 text-[#a29bfe]' : 'bg-white/[0.03] text-white/20'
                }`}
              >
                <ArrowUpDown className="w-3 h-3" />
                <span style={{ fontSize: '0.625rem', fontWeight: 600 }}>
                  {reorderMode ? 'Done' : t('sg_drag_hint')}
                </span>
              </button>
            )}
          </div>

          {tasks.length === 0 ? (
            <p className="text-center text-white/15 py-8" style={{ fontSize: '0.875rem' }}>{t('goal_no_tasks')}</p>
          ) : (
            <div className="space-y-1.5">
              <AnimatePresence>
                {tasks.map((task, idx) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    index={idx}
                    total={tasks.length}
                    today={today}
                    t={t}
                    lang={lang}
                    completing={completingId === task.id}
                    reorderMode={reorderMode}
                    onComplete={() => handleComplete(task)}
                    onMoveUp={() => moveTask(idx, -1)}
                    onMoveDown={() => moveTask(idx, 1)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </motion.div>

        {/* Review history */}
        {reviewHistory.length > 1 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mt-6">
            <button
              onClick={() => { hapticFeedback('light'); setShowHistory(!showHistory); }}
              className="flex items-center gap-2 text-white/25 mb-3 px-1"
            >
              <span style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em' }}>
                {t('sg_review_history').toUpperCase()} ({reviewHistory.length})
              </span>
              <ChevronDownIcon className={`w-3 h-3 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showHistory && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden space-y-2">
                  {reviewHistory.slice(1).map((rev) => (
                    <GlassCard key={rev.id} padding="sm" className="flex items-center gap-3 cursor-pointer" onClick={() => { setLatestReview(rev); setShowReview(true); }}>
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${getScoreBg(rev.overallScore)} flex items-center justify-center shrink-0`}>
                        <span className={getScoreColor(rev.overallScore)} style={{ fontSize: '0.75rem', fontWeight: 700 }}>{rev.overallScore}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white/50 truncate" style={{ fontSize: '0.8125rem' }}>{rev.summary}</p>
                        <p className="text-white/20" style={{ fontSize: '0.625rem' }}>{fmtFull(rev.createdAt, t('locale_code'))}</p>
                      </div>
                    </GlassCard>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* AI Review Modal */}
      <AnimatePresence>
        {showReview && latestReview && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center"
            onClick={(e) => { if (e.target === e.currentTarget) setShowReview(false); }}>
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-lg rounded-t-3xl bg-liquid-glass-panel border-t border-white/[0.1] p-6 pb-10 max-h-[85vh] overflow-y-auto">

              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${getScoreBg(latestReview.overallScore)} flex items-center justify-center`}>
                    <span className={getScoreColor(latestReview.overallScore)} style={{ fontSize: '1.25rem', fontWeight: 800 }}>{latestReview.overallScore}</span>
                  </div>
                  <div>
                    <p className="text-white" style={{ fontSize: '1.125rem', fontWeight: 700 }}>{t('sg_ai_checkin')}</p>
                    <p className={getScoreColor(latestReview.overallScore)} style={{ fontSize: '0.75rem', fontWeight: 600 }}>{latestReview.scoreLabel}</p>
                  </div>
                </div>
                <button onClick={() => setShowReview(false)} className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center">
                  <X className="w-4 h-4 text-white/40" />
                </button>
              </div>

              <p className="text-white/60 mb-5" style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>{latestReview.summary}</p>

              {latestReview.wins.length > 0 && (
                <ReviewSection icon={Trophy} color="emerald-400" label={t('sg_review_wins')} items={latestReview.wins} bgClass="bg-emerald-500/5 border-emerald-500/10" />
              )}
              {latestReview.concerns.length > 0 && (
                <ReviewSection icon={AlertTriangle} color="yellow-400" label={t('sg_review_concerns')} items={latestReview.concerns} bgClass="bg-yellow-400/5 border-yellow-400/10" />
              )}
              {latestReview.recommendations.length > 0 && (
                <ReviewSection icon={Lightbulb} color="[#a29bfe]" label={t('sg_review_recs')} items={latestReview.recommendations} bgClass="bg-[#6c5ce7]/5 border-[#6c5ce7]/10" />
              )}
              {latestReview.adjustments && latestReview.adjustments.length > 0 && (
                <ReviewSection icon={Repeat} color="[#00cec9]" label={t('sg_review_adjustments')} items={latestReview.adjustments} bgClass="bg-[#00cec9]/5 border-[#00cec9]/10" />
              )}

              {latestReview.motivationalMessage && (
                <GlassCard variant="accent" padding="md" className="mt-4">
                  <p className="text-white/70 text-center italic" style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
                    &ldquo;{latestReview.motivationalMessage}&rdquo;
                  </p>
                </GlassCard>
              )}

              <p className="text-white/15 text-center mt-4" style={{ fontSize: '0.625rem' }}>{fmtFull(latestReview.createdAt, t('locale_code'))}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selfie Check-in Result Modal */}
      <AnimatePresence>
        {showSelfieResult && selfieResult && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center"
            onClick={(e) => { if (e.target === e.currentTarget) setShowSelfieResult(false); }}>
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-lg rounded-t-3xl bg-liquid-glass-panel border-t border-white/[0.1] p-6 pb-10 max-h-[85vh] overflow-y-auto">

              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${getScoreBg(selfieResult.analysis.score)} flex items-center justify-center`}>
                    <span className={getScoreColor(selfieResult.analysis.score)} style={{ fontSize: '1.25rem', fontWeight: 800 }}>{selfieResult.analysis.score}</span>
                  </div>
                  <div>
                    <p className="text-white" style={{ fontSize: '1.125rem', fontWeight: 700 }}>{t('sg_selfie_checkin')}</p>
                    <p className="text-white/40" style={{ fontSize: '0.75rem' }}>{t('sg_selfie_progress')}</p>
                  </div>
                </div>
                <button onClick={() => setShowSelfieResult(false)} className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center">
                  <X className="w-4 h-4 text-white/40" />
                </button>
              </div>

              {/* Before / After photos */}
              {(selfieResult.originalUrl || selfieResult.newSelfieUrl) && (
                <div className="flex gap-3 mb-5">
                  {selfieResult.originalUrl && (
                    <div className="flex-1">
                      <p className="text-white/30 text-center mb-1.5" style={{ fontSize: '0.625rem', fontWeight: 700 }}>{t('sg_selfie_before').toUpperCase()}</p>
                      <div className="rounded-xl overflow-hidden border border-white/10 aspect-square">
                        <img src={selfieResult.originalUrl} alt="Before" className="w-full h-full object-cover" />
                      </div>
                    </div>
                  )}
                  {selfieResult.newSelfieUrl && (
                    <div className="flex-1">
                      <p className="text-[#00cec9]/60 text-center mb-1.5" style={{ fontSize: '0.625rem', fontWeight: 700 }}>{t('sg_selfie_after').toUpperCase()}</p>
                      <div className="rounded-xl overflow-hidden border border-[#00cec9]/20 aspect-square">
                        <img src={selfieResult.newSelfieUrl} alt="Now" className="w-full h-full object-cover" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <p className="text-white/60 mb-5" style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>{selfieResult.analysis.progressSummary}</p>

              {selfieResult.analysis.positiveChanges.length > 0 && (
                <ReviewSection icon={Trophy} color="emerald-400" label={t('sg_selfie_changes')} items={selfieResult.analysis.positiveChanges} bgClass="bg-emerald-500/5 border-emerald-500/10" />
              )}

              {selfieResult.analysis.areasToFocus.length > 0 && (
                <ReviewSection icon={Target} color="yellow-400" label={t('sg_selfie_focus')} items={selfieResult.analysis.areasToFocus} bgClass="bg-yellow-400/5 border-yellow-400/10" />
              )}

              {selfieResult.analysis.recommendation && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="w-3.5 h-3.5 text-[#a29bfe]" />
                    <span className="text-[#a29bfe]/70" style={{ fontSize: '0.6875rem', fontWeight: 700 }}>{t('sg_selfie_tip').toUpperCase()}</span>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-[#6c5ce7]/5 border border-[#6c5ce7]/10">
                    <p className="text-white/60" style={{ fontSize: '0.8125rem' }}>{selfieResult.analysis.recommendation}</p>
                  </div>
                </div>
              )}

              {selfieResult.analysis.motivationalMessage && (
                <GlassCard variant="accent" padding="md" className="mt-4">
                  <p className="text-white/70 text-center italic" style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
                    &ldquo;{selfieResult.analysis.motivationalMessage}&rdquo;
                  </p>
                </GlassCard>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- Review Section ----

function ReviewSection({ icon: Icon, color, label, items, bgClass }: {
  icon: React.ElementType; color: string; label: string; items: string[]; bgClass: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-3.5 h-3.5 text-${color}`} />
        <span className={`text-${color}/70`} style={{ fontSize: '0.6875rem', fontWeight: 700 }}>{label.toUpperCase()}</span>
      </div>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className={`px-3 py-2 rounded-lg ${bgClass} border`}>
            <p className="text-white/60" style={{ fontSize: '0.8125rem' }}>{item}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Task Row ----

function TaskRow({ task, index, total, today, t, lang, completing, reorderMode, onComplete, onMoveUp, onMoveDown }: {
  task: StrategicTask; index: number; total: number; today: string;
  t: (k: string, p?: Record<string, string | number>) => string; lang: string;
  completing: boolean; reorderMode: boolean; onComplete: () => void; onMoveUp: () => void; onMoveDown: () => void;
}) {
  const urgency: 'overdue' | 'today' | 'upcoming' =
    task.nextDueDate < today ? 'overdue' : task.nextDueDate === today ? 'today' : 'upcoming';

  const borderColor = urgency === 'overdue' ? 'border-[#e17055]/15' : urgency === 'today' ? 'border-yellow-400/15' : 'border-white/[0.05]';

  return (
    <motion.div layout transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
      <GlassCard padding="sm" className={`flex items-start gap-2 ${borderColor}`}>
        {/* Reorder controls */}
        {reorderMode && (
          <div className="flex flex-col gap-0.5 shrink-0 mt-0.5">
            <button
              onClick={onMoveUp}
              disabled={index === 0}
              className={`w-6 h-6 rounded flex items-center justify-center transition-all ${
                index === 0 ? 'opacity-20' : 'bg-white/[0.04] active:bg-[#6c5ce7]/20'
              }`}
            >
              <ChevronUp className="w-3.5 h-3.5 text-white/40" />
            </button>
            <button
              onClick={onMoveDown}
              disabled={index === total - 1}
              className={`w-6 h-6 rounded flex items-center justify-center transition-all ${
                index === total - 1 ? 'opacity-20' : 'bg-white/[0.04] active:bg-[#6c5ce7]/20'
              }`}
            >
              <ChevronDownIcon className="w-3.5 h-3.5 text-white/40" />
            </button>
          </div>
        )}

        {/* Complete */}
        {!reorderMode && (
          <motion.button whileTap={{ scale: 0.8 }} onClick={onComplete} disabled={completing}
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-all ${
              urgency === 'overdue' ? 'bg-[#e17055]/10 border border-[#e17055]/20'
              : urgency === 'today' ? 'bg-yellow-400/10 border border-yellow-400/20'
              : 'bg-white/[0.04] border border-white/[0.06]'
            }`}>
            {completing
              ? <Loader2 className="w-3.5 h-3.5 text-white/30 animate-spin" />
              : <CheckCircle2 className={`w-3.5 h-3.5 ${urgency === 'overdue' ? 'text-[#e17055]' : urgency === 'today' ? 'text-yellow-400' : 'text-white/20'}`} />
            }
          </motion.button>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-white/80 flex-1 truncate" style={{ fontSize: '0.875rem', fontWeight: 500 }}>{task.title}</p>
            {urgency === 'overdue' && (
              <span className="px-1.5 py-0.5 rounded bg-[#e17055]/10 text-[#e17055]" style={{ fontSize: '0.5625rem', fontWeight: 700 }}>{t('sg_overdue')}</span>
            )}
            {urgency === 'today' && (
              <span className="px-1.5 py-0.5 rounded bg-yellow-400/10 text-yellow-400" style={{ fontSize: '0.5625rem', fontWeight: 700 }}>{t('sg_due_today')}</span>
            )}
          </div>
          {task.description && (
            <p className="text-white/25 mt-0.5" style={{ fontSize: '0.75rem', lineHeight: 1.4 }}>
              {task.description.length > 70 ? task.description.slice(0, 70) + '...' : task.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            <span className={`px-2 py-0.5 rounded-md ${task.frequency === 'monthly' ? 'bg-[#fd79a8]/10 text-[#fd79a8]/60' : 'bg-[#00cec9]/10 text-[#00cec9]/60'}`}
              style={{ fontSize: '0.625rem', fontWeight: 700 }}>
              {t(task.frequency === 'monthly' ? 'sg_monthly' : 'sg_weekly')}
            </span>
            <span className="text-white/20" style={{ fontSize: '0.6875rem' }}>
              {t('sg_next_due', { date: fmtShort(task.nextDueDate, t('locale_code')) })}
            </span>
            {task.completedCount > 0 && (
              <span className="text-emerald-400/40" style={{ fontSize: '0.6875rem' }}>✓ {task.completedCount}</span>
            )}
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}

function fmtShort(iso: string, locale: string): string {
  try { return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' }); }
  catch { return iso; }
}

function fmtFull(iso: string, locale: string): string {
  try { return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

// ---- Helper: Resize image and convert to base64 data URL ----
function resizeAndEncodeDetail(file: File, maxSize: number, quality: number): Promise<string> {
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