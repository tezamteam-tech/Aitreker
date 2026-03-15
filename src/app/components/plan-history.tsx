// =============================================
// Proper Food AI — Plan History & Drafts
// =============================================
// Shows: (1) unsaved drafts (generated plans not yet
// activated), (2) activated program history.
// Drafts can be opened in plan-builder or deleted.
// =============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles, CheckCircle2, Circle, Plus, Loader2, Calendar,
  FileText, Trash2, Rocket, Clock, Timer,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useAuth } from './auth-context';
import { api } from './api-client';
import { hapticFeedback, hapticSuccess } from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';

export function PlanHistoryPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, lang } = useTranslation();

  const [programs, setPrograms] = useState<any[]>([]);
  const [activeProgramId, setActiveProgramId] = useState<string>('');
  const [drafts, setDrafts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => {
    Promise.all([
      api.getProgramHistory().catch(() => ({ programs: [], activeProgramId: '' })),
      api.getPlanDrafts().catch(() => ({ drafts: [] })),
    ]).then(([histRes, draftRes]) => {
      setPrograms(histRes.programs || []);
      setActiveProgramId(histRes.activeProgramId || '');
      setDrafts(draftRes.drafts || []);
    }).finally(() => setIsLoading(false));
  }, []);

  const handleSwitch = useCallback(async (programId: string) => {
    if (programId === activeProgramId || switchingId) return;
    hapticFeedback('medium');
    setSwitchingId(programId);
    try {
      await api.switchProgram(programId);
      setActiveProgramId(programId);
      hapticSuccess();
      navigate('/home', { replace: true });
    } catch (err) {
      console.error('[PlanHistory] Switch error:', err);
    } finally {
      setSwitchingId(null);
    }
  }, [activeProgramId, switchingId, navigate]);

  const handleOpenDraft = useCallback((draftId: string) => {
    hapticFeedback('medium');
    navigate('/plan-builder', { state: { draftId } });
  }, [navigate]);

  const handleDeleteDraft = useCallback(async (draftId: string) => {
    hapticFeedback('light');
    setDeletingDraftId(draftId);
    try {
      await api.deletePlanDraft(draftId);
      setDrafts((prev) => prev.filter((d) => d.draftId !== draftId));
      showToast(t('pb_draft_deleted'));
      hapticSuccess();
    } catch (err) {
      console.error('[PlanHistory] Delete draft error:', err);
    } finally {
      setDeletingDraftId(null);
    }
  }, [showToast, t]);

  const totalItems = drafts.length + programs.length;

  // Safely resolve bilingual {en,ru} fields to plain string
  const safeStr = (val: any): string => {
    if (typeof val === 'string') return val;
    if (val && typeof val === 'object') return val[lang] || val.en || '';
    return '';
  };

  const formatDate = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const day = d.getDate();
    const month = d.toLocaleDateString(t('locale_code'), { month: 'short' });
    return `${day} ${month}`;
  };

  return (
    <div className="min-h-screen pb-28">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-[#6c5ce7]/15 blur-[100px]" />
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="fixed top-12 left-1/2 -translate-x-1/2 z-[60] px-5 py-2.5 rounded-2xl bg-liquid-glass-toast border border-white/[0.1] shadow-2xl"
            style={{ boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}
          >
            <p className="text-foreground/80" style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{toast}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 px-5 pb-6" >
        {/* Header */}
        <PageHeader
          title={t('pb_plan_history')}
          actions={
            <button onClick={() => { hapticFeedback('light'); navigate('/plan-builder'); }} className="w-10 h-10 rounded-xl bg-[#6c5ce7]/15 flex items-center justify-center">
              <Plus className="w-5 h-5 text-[#a29bfe]" />
            </button>
          }
        />
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-[#6c5ce7] animate-spin" />
          </div>
        ) : totalItems === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-[var(--ui-input-bg)] flex items-center justify-center mb-4">
              <Calendar className="w-8 h-8 text-ui-tertiary" />
            </div>
            <p className="text-ui-tertiary text-center" style={{ fontSize: '0.9375rem' }}>{t('pb_no_programs')}</p>
            <button onClick={() => navigate('/plan-builder')} className="mt-4 px-6 py-2.5 rounded-xl bg-[#6c5ce7]/15 border border-[#6c5ce7]/30 text-[#a29bfe] flex items-center gap-2" style={{ fontSize: '0.875rem', fontWeight: 500 }}>
              <Sparkles className="w-4 h-4" />
              {t('pb_title')}
            </button>
          </motion.div>
        ) : (
          <div className="space-y-6">
            {/* ===== DRAFTS SECTION ===== */}
            {drafts.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  <p className="text-amber-400/80" style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                    {t('pb_drafts_section').toUpperCase()}
                  </p>
                  <span className="ml-auto px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400/70" style={{ fontSize: '0.625rem', fontWeight: 600 }}>
                    {drafts.length}
                  </span>
                </div>
                <p className="text-ui-tertiary mb-3 px-1" style={{ fontSize: '0.6875rem' }}>
                  {t('pb_drafts_subtitle')}
                </p>

                <div className="space-y-2.5">
                  {drafts.map((draft, i) => (
                    <motion.div
                      key={draft.draftId}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.04 * i }}
                    >
                      <GlassCard variant="elevated" padding="md" className="relative overflow-hidden">
                        {/* Amber accent for drafts */}
                        <div className="absolute -top-6 -right-6 w-16 h-16 rounded-full bg-amber-500/8 blur-[30px] pointer-events-none" />

                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-500/12 flex items-center justify-center shrink-0">
                            {draft.hasPlan ? (
                              <Rocket className="w-5 h-5 text-amber-400" />
                            ) : (
                              <FileText className="w-5 h-5 text-amber-400/60" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            {/* Title / summary */}
                            <p className="text-foreground truncate" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                              {draft.planTitle || draft.inputSummary?.slice(0, 60) || 'Draft plan'}
                            </p>
                            {draft.planSubtitle && (
                              <p className="text-ui-tertiary truncate" style={{ fontSize: '0.75rem' }}>{draft.planSubtitle}</p>
                            )}

                            {/* Meta badges */}
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[var(--ui-input-bg)] text-ui-tertiary" style={{ fontSize: '0.625rem', fontWeight: 500 }}>
                                <Timer className="w-2.5 h-2.5" /> {draft.durationDays}{t('unit_days_short')}
                              </span>
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md ${
                                draft.hasPlan
                                  ? 'bg-emerald-500/10 text-emerald-400/70'
                                  : 'bg-amber-500/10 text-amber-400/70'
                              }`} style={{ fontSize: '0.625rem', fontWeight: 600 }}>
                                {draft.hasPlan
                                  ? t('pb_draft_ready')
                                  : t('pb_draft_in_progress', { n: draft.currentStep, total: draft.totalSteps })}
                              </span>
                              {draft.createdAt && (
                                <span className="text-ui-tertiary" style={{ fontSize: '0.625rem' }}>
                                  {formatDate(draft.createdAt)}
                                </span>
                              )}
                            </div>

                            {/* Input summary preview */}
                            {draft.inputSummary && !draft.planTitle && (
                              <p className="text-ui-tertiary mt-1.5 line-clamp-2" style={{ fontSize: '0.6875rem', lineHeight: 1.4 }}>
                                {draft.inputSummary}
                              </p>
                            )}
                            {draft.inputSummary && draft.planTitle && (
                              <p className="text-ui-tertiary mt-1.5 line-clamp-1" style={{ fontSize: '0.6875rem', lineHeight: 1.4 }}>
                                {draft.inputSummary.slice(0, 80)}{draft.inputSummary.length > 80 ? '...' : ''}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--ui-separator)]">
                          <motion.button
                            whileTap={{ scale: 0.97 }}
                            onClick={() => handleOpenDraft(draft.draftId)}
                            className="flex-1 h-9 rounded-lg bg-[#6c5ce7]/15 border border-[#6c5ce7]/30 text-[#a29bfe] flex items-center justify-center gap-1.5"
                            style={{ fontSize: '0.8125rem', fontWeight: 600 }}
                          >
                            <Rocket className="w-3.5 h-3.5" />
                            {t('pb_draft_open')}
                          </motion.button>
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleDeleteDraft(draft.draftId)}
                            disabled={deletingDraftId === draft.draftId}
                            className="w-9 h-9 rounded-lg bg-[var(--ui-input-bg)] border border-[var(--glass-border-subtle)] flex items-center justify-center text-ui-tertiary active:text-red-400 active:bg-red-500/10 transition-colors"
                          >
                            {deletingDraftId === draft.draftId ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </motion.button>
                        </div>
                      </GlassCard>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ===== ACTIVATED PROGRAMS SECTION ===== */}
            {programs.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: drafts.length > 0 ? 0.15 : 0 }}>
                {drafts.length > 0 && (
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#a29bfe]" />
                    <p className="text-[#a29bfe]/70" style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                      {t('pb_plan_history').toUpperCase()}
                    </p>
                    <span className="ml-auto px-2 py-0.5 rounded-md bg-[#6c5ce7]/10 text-[#a29bfe]/60" style={{ fontSize: '0.625rem', fontWeight: 600 }}>
                      {programs.length}
                    </span>
                  </div>
                )}

                <div className="space-y-3">
                  {programs.map((prog, i) => {
                    const isActive = prog.id === activeProgramId;
                    const progress = prog.durationDays ? Math.round((prog.doneDays / prog.durationDays) * 100) : 0;

                    return (
                      <motion.div key={prog.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}>
                        <GlassCard variant={isActive ? 'elevated' : 'default'} padding="md">
                          <div className="flex items-start gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isActive ? 'bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe]' : 'bg-[var(--glass-bg-card)]'}`}>
                              {isActive ? <CheckCircle2 className="w-5 h-5 text-white" /> : <Circle className="w-5 h-5 text-ui-tertiary" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="text-foreground truncate" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{safeStr(prog.title) || safeStr(prog.subtitle) || 'Program'}</p>
                                {isActive && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-[#6c5ce7]/20 text-[#a29bfe]" style={{ fontSize: '0.6rem', fontWeight: 600 }}>
                                    {t('pb_active')}
                                  </span>
                                )}
                              </div>
                              {prog.subtitle && <p className="text-ui-tertiary truncate mb-1.5" style={{ fontSize: '0.75rem' }}>{safeStr(prog.subtitle)}</p>}

                              {/* Progress bar */}
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 rounded-full bg-ui-progress overflow-hidden">
                                  <div className="h-full rounded-full bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] transition-all" style={{ width: `${progress}%` }} />
                                </div>
                                <span className="text-ui-tertiary shrink-0" style={{ fontSize: '0.6875rem' }}>
                                  {t('pb_days_done', { n: prog.doneDays || 0, total: prog.durationDays || 7 })}
                                </span>
                              </div>

                              {prog.inputSummary && (
                                <p className="text-ui-tertiary mt-2 line-clamp-2" style={{ fontSize: '0.75rem', lineHeight: 1.4 }}>{prog.inputSummary}</p>
                              )}
                            </div>

                            {/* Switch button */}
                            {!isActive && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleSwitch(prog.id); }}
                                disabled={switchingId === prog.id}
                                className="px-3 py-1.5 rounded-lg bg-[var(--glass-bg-card)] border border-[var(--glass-border)] text-ui-secondary shrink-0 mt-1"
                                style={{ fontSize: '0.75rem', fontWeight: 500 }}
                              >
                                {switchingId === prog.id ? <Loader2 className="w-3 h-3 animate-spin" /> : t('pb_switch')}
                              </button>
                            )}
                          </div>
                        </GlassCard>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}