// =============================================
// Proper Food AI — Day View (/day/:dayNumber)
// =============================================
// Full day experience: tasks, done/skip, reflection
// modal, XP gain, toast feedback, back to home.
// =============================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Check,
  SkipForward,
  Sparkles,
  Brain,
  Zap,
  MessageCircle,
  Home,
  X,
  Star,
  Flame,
  Send,
  ChevronUp,
  Bell,
  Clock,
  Loader2,
  Camera,
  Image as ImageIcon,
  RefreshCw,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useBottomSheetLifecycle } from './bottom-sheet-context';
import { useAuth } from './auth-context';
import { api } from './api-client';
import type { StrategicTask } from './api-client';
import type { ProgramDay, Task, Progress, ProgressMeta, CoachResponse } from './types';
import { hapticFeedback, hapticSuccess } from './telegram';
import { SwipeableTask, XpBurst } from './swipeable-task';
import { playXpCoinSound } from './xp-sound';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';
import { VoiceInput } from './voice-input';
import { CameraCapture } from './camera-capture';

// ---- Constants ----
const TASK_ICONS: Record<string, React.ElementType> = {
  action: Zap,
  reflection: MessageCircle,
  mindfulness: Brain,
};

const TASK_COLORS: Record<string, { text: string; bg: string }> = {
  action: { text: 'text-[#6c5ce7]', bg: 'bg-[#6c5ce7]/15' },
  reflection: { text: 'text-[#fd79a8]', bg: 'bg-[#fd79a8]/15' },
  mindfulness: { text: 'text-[#00cec9]', bg: 'bg-[#00cec9]/15' },
};

// ---- Phase types ----
type Phase = 'tasks' | 'reflection' | 'complete';

// ---- Photo compression utility ----
function compressImage(file: File, maxWidth = 1200, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round(h * (maxWidth / w));
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('No canvas context')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const base64 = canvas.toDataURL('image/jpeg', quality);
        resolve(base64);
      };
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

export function DayViewPage() {
  const { dayNumber } = useParams<{ dayNumber: string }>();
  const navigate = useNavigate();
  const dayNum = parseInt(dayNumber || '1', 10);

  const { user, updateUser } = useAuth();
  const { t, lang } = useTranslation();
  const tone = user?.tone || 'supportive';

  // ---- State ----
  const [day, setDay] = useState<ProgramDay | null>(null);
  const [isLoadingDay, setIsLoadingDay] = useState(true);
  const [programId, setProgramId] = useState<string>('prog_7day_focus');
  const [totalDays, setTotalDays] = useState<number>(7);
  const [checkedTasks, setCheckedTasks] = useState<Set<string>>(new Set());
  const [existingProgress, setExistingProgress] = useState<Progress | null>(null);
  const [phase, setPhase] = useState<Phase>('tasks');
  const [completionStatus, setCompletionStatus] = useState<'done' | 'skip' | null>(null);
  const [xpEarned, setXpEarned] = useState(0);
  const [totalXp, setTotalXp] = useState(user?.xp || 0);
  const [reflectionText, setReflectionText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- AI Coach state ----
  const [coachResponse, setCoachResponse] = useState<CoachResponse | null>(null);
  const [isCoachLoading, setIsCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  // Follow-up chat
  const [followupText, setFollowupText] = useState('');
  const [followupResponse, setFollowupResponse] = useState<CoachResponse | null>(null);
  const [isFollowupLoading, setIsFollowupLoading] = useState(false);

  // ---- Block generation state (100-day plans) ----
  const [isGeneratingBlock, setIsGeneratingBlock] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);

  // ---- Reminder time editing state ----
  const [editingReminder, setEditingReminder] = useState<string | null>(null); // taskId
  const [reminderInput, setReminderInput] = useState('');
  const [savingReminder, setSavingReminder] = useState(false);

  // ---- Strategic tasks due today ----
  const [sgTasks, setSgTasks] = useState<(StrategicTask & { goalTitle: string })[]>([]);
  const [sgCompletingId, setSgCompletingId] = useState<string | null>(null);
  const [sgCompletedIds, setSgCompletedIds] = useState<Set<string>>(new Set());
  const [sgXpBurstId, setSgXpBurstId] = useState<string | null>(null);

  // ---- Photo proof state ----
  const [proofPhotos, setProofPhotos] = useState<Record<string, string>>({}); // taskId → signedUrl
  const [uploadingTask, setUploadingTask] = useState<string | null>(null); // taskId being uploaded
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null); // URL of photo being viewed fullscreen
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingTaskRef = useRef<string | null>(null); // which task triggered the file picker
  const [cameraOpen, setCameraOpen] = useState(false);

  // Hide tab bar when bottom sheet / modal is open
  useBottomSheetLifecycle(phase === 'reflection' || phase === 'celebration' || !!viewingPhoto);

  // ---- Load day data ----
  useEffect(() => {
    setIsLoadingDay(true);
    // First resolve the active program ID, then load day data
    api.getActiveProgram()
      .then((prog) => {
        const pid = prog?.id || 'prog_7day_focus';
        setProgramId(pid);
        setTotalDays(prog?.durationDays || 7);
        return Promise.all([
          api.getProgramDay(pid, dayNum),
          api.getProgress(),
        ]);
      })
      .then(([dayData, progressList]) => {
        // Find existing progress for this day
        const dayProgress = (progressList as Progress[])?.find(
          (p) => p.dayNumber === dayNum
        );
        if (dayProgress) {
          setExistingProgress(dayProgress);
          // Restore checked tasks from saved progress
          const savedIds = dayProgress.metaJson?.completedTaskIds || [];
          if (savedIds.length > 0) {
            setCheckedTasks(new Set(savedIds));
          }
        }

        if (dayData) {
          setDay(dayData);
        } else {
          // Day not found via API — try lazy block generation for 100-day plans
          api.getActiveProgram().then((prog) => {
            if (prog && (prog as any).durationDays >= 100 && dayNum <= 100) {
              setIsGeneratingBlock(true);
              api.generateNextBlock(prog.id).then((res) => {
                if (res.success && !res.alreadyComplete) {
                  // Reload the day
                  api.getProgramDay(prog.id, dayNum).then((d) => {
                    if (d) setDay(d);
                    setIsGeneratingBlock(false);
                  });
                } else {
                  setIsGeneratingBlock(false);
                  setBlockError(t('dv_block_error'));
                }
              }).catch(() => { setIsGeneratingBlock(false); setBlockError(t('dv_gen_error')); });
            }
          });
        }
      })
      .catch((err) => {
        console.error('[DayView] Error loading data:', err);
        setDay(null);
      })
      .finally(() => setIsLoadingDay(false));

    // Load existing proof photos (separate call, non-blocking)
    api.getActiveProgram().then((prog) => {
      const pid = prog?.id || 'prog_7day_focus';
      api.getProofs(pid, dayNum).then((res) => {
        if (res.proofs && Object.keys(res.proofs).length > 0) {
          setProofPhotos(res.proofs);
          // Also mark these tasks as checked
          setCheckedTasks((prev) => {
            const next = new Set(prev);
            Object.keys(res.proofs).forEach((tid) => next.add(tid));
            return next;
          });
        }
      }).catch(() => { /* proofs may not exist yet */ });
    });
  }, [dayNum]);

  // ---- Load strategic tasks due today ----
  useEffect(() => {
    api.getStrategicGoals('active')
      .then(async (res) => {
        const goalsWithDue = res.goals.filter(g => g.dueSoon > 0);
        if (goalsWithDue.length === 0) return;
        const today = new Date().toISOString().slice(0, 10);
        const allDueTasks: (StrategicTask & { goalTitle: string })[] = [];
        await Promise.all(goalsWithDue.map(async (g) => {
          try {
            const r = await api.getStrategicGoal(g.id);
            const due = r.tasks.filter(t => t.nextDueDate && t.nextDueDate <= today);
            due.forEach(t => allDueTasks.push({ ...t, goalTitle: g.title }));
          } catch {}
        }));
        if (allDueTasks.length > 0) setSgTasks(allDueTasks);
      })
      .catch(() => {});
  }, []);

  const handleSgComplete = async (taskId: string) => {
    if (sgCompletingId || sgCompletedIds.has(taskId)) return;
    setSgCompletingId(taskId);
    hapticFeedback('medium');
    try {
      const result = await api.completeStrategicTask(taskId);
      const xp = (result as any).xpAwarded || 5;
      hapticSuccess();
      setSgCompletedIds(prev => new Set(prev).add(taskId));
      // Update user XP locally
      if (user) updateUser({ xp: (user.xp || 0) + xp });
      setTotalXp(prev => prev + xp);
      // Show XP burst
      setSgXpBurstId(taskId);
      setTimeout(() => setSgXpBurstId(null), 2000);
      // Play XP coin sound
      playXpCoinSound();
      showToast(`\u2705 ${t('dv_task_completed', { xp })}`);
    } catch (err) {
      console.error('[DayView] Strategic task complete error:', err);
    } finally {
      setSgCompletingId(null);
    }
  };

  // ---- Toast helper ----
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  // ---- Toggle task ----
  const toggleTask = useCallback((taskId: string) => {
    if (existingProgress?.status === 'done') return; // already completed
    hapticFeedback('light');
    setCheckedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, [existingProgress]);

  // ---- Photo proof upload handler ----
  const handlePhotoSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const taskId = pendingTaskRef.current;
    if (!file || !taskId || !day) return;

    // Reset input so same file can be re-selected
    e.target.value = '';

    hapticFeedback('medium');
    setUploadingTask(taskId);

    try {
      const compressed = await compressImage(file);
      const result = await api.uploadProof(programId, dayNum, taskId, compressed, 'image/jpeg');

      if (result.success) {
        setProofPhotos((prev) => ({ ...prev, [taskId]: result.signedUrl }));
        setCheckedTasks((prev) => {
          const next = new Set(prev);
          next.add(taskId);
          return next;
        });
        hapticSuccess();
        showToast(t('proof_photo_sent'));
      }
    } catch (err) {
      console.error('[DayView] Photo upload error:', err);
      showToast(t('proof_upload_error'));
    } finally {
      setUploadingTask(null);
      pendingTaskRef.current = null;
    }
  }, [day, programId, dayNum, showToast, t]);

  const triggerPhotoUpload = useCallback((taskId: string) => {
    if (existingProgress?.status === 'done') return;
    pendingTaskRef.current = taskId;
    // Use getUserMedia camera (reliable on Android), fallback to file input
    if (navigator.mediaDevices?.getUserMedia) {
      setCameraOpen(true);
    } else {
      fileInputRef.current?.click();
    }
  }, [existingProgress]);

  // Handle photo from getUserMedia camera overlay
  const handleCameraCapture = useCallback(async (dataUrl: string) => {
    setCameraOpen(false);
    const taskId = pendingTaskRef.current;
    if (!taskId || !day) return;

    hapticFeedback('medium');
    setUploadingTask(taskId);

    try {
      // Convert dataUrl to blob for compression
      const resp = await fetch(dataUrl);
      const blob = await resp.blob();
      const file = new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' });
      const compressed = await compressImage(file);
      const result = await api.uploadProof(programId, dayNum, taskId, compressed, 'image/jpeg');

      if (result.success) {
        setProofPhotos((prev) => ({ ...prev, [taskId]: result.signedUrl }));
        setCheckedTasks((prev) => {
          const next = new Set(prev);
          next.add(taskId);
          return next;
        });
        hapticSuccess();
        showToast(t('proof_photo_sent'));
      }
    } catch (err) {
      console.error('[DayView] Camera photo upload error:', err);
      showToast(t('proof_upload_error'));
    } finally {
      setUploadingTask(null);
      pendingTaskRef.current = null;
    }
  }, [day, programId, dayNum, showToast, t]);

  // ---- Done handler ----
  const handleDone = useCallback(async () => {
    if (!day) return;
    hapticFeedback('medium');
    setIsSaving(true);
    try {
      const meta: ProgressMeta = {
        completedTaskIds: Array.from(checkedTasks),
        xpEarned: 10,
        proofPhotos: Object.keys(proofPhotos).length > 0 ? proofPhotos : undefined,
      };
      const result = await api.updateProgress(programId, dayNum, 'done', undefined, meta);
      setXpEarned(result.xpEarned);
      setTotalXp(result.totalXp);
      setCompletionStatus('done');
      setPhase('reflection');
      updateUser({ xp: result.totalXp });
      hapticSuccess();
    } catch (err) {
      console.error('[DayView] Error saving done:', err);
      showToast('Error saving progress');
    } finally {
      setIsSaving(false);
    }
  }, [day, dayNum, checkedTasks, proofPhotos, updateUser, showToast, programId]);

  // ---- Skip handler ----
  const handleSkip = useCallback(async () => {
    if (!day) return;
    hapticFeedback('light');
    setIsSaving(true);
    try {
      const meta: ProgressMeta = {
        completedTaskIds: Array.from(checkedTasks),
        xpEarned: 2,
      };
      const result = await api.updateProgress(programId, dayNum, 'skip', undefined, meta);
      setXpEarned(result.xpEarned);
      setTotalXp(result.totalXp);
      setCompletionStatus('skip');
      setPhase('reflection');
      updateUser({ xp: result.totalXp });
    } catch (err) {
      console.error('[DayView] Error saving skip:', err);
      showToast('Error saving progress');
    } finally {
      setIsSaving(false);
    }
  }, [day, dayNum, checkedTasks, updateUser, showToast, programId]);

  // ---- Save reflection ----
  const handleSaveReflection = useCallback(async () => {
    hapticFeedback('light');
    setIsSaving(true);
    try {
      await api.saveReflection(programId, dayNum, reflectionText);
      showToast('Reflection saved');
      hapticSuccess();
      setPhase('complete');
    } catch (err) {
      console.error('[DayView] Error saving reflection:', err);
      showToast('Error saving reflection');
    } finally {
      setIsSaving(false);
    }
  }, [dayNum, reflectionText, showToast, programId]);

  // ---- Skip reflection ----
  const handleSkipReflection = useCallback(() => {
    hapticFeedback('light');
    setPhase('complete');
    showToast('Saved');
  }, [showToast]);

  // ---- Ask Coach handler ----
  const handleAskCoach = useCallback(async () => {
    if (isCoachLoading || !existingProgress) return;
    hapticFeedback('medium');
    setIsCoachLoading(true);
    setCoachError(null);
    setCoachResponse(null);

    // Map tone names: user.tone is 'supportive'|'strict'|'hybrid' but API expects 'support'|'strict'|'hybrid'
    const toneMap: Record<string, 'support' | 'strict' | 'hybrid'> = {
      supportive: 'support',
      strict: 'strict',
      hybrid: 'hybrid',
    };
    const mappedTone = toneMap[tone] || 'support';

    try {
      const rawGoal = user?.selectedGoal || '';
      const cleanGoal = rawGoal.startsWith('custom:') ? rawGoal.replace('custom:', '') : rawGoal;
      const response = await api.askCoach({
        dayNumber: dayNum,
        userTone: mappedTone,
        userGoal: cleanGoal,
        reflectionText: existingProgress.reflectionText || '',
        completionStatus: existingProgress.status === 'done' ? 'done' : 'skip',
      });
      setCoachResponse(response);
      hapticSuccess();
    } catch (err) {
      console.error('[DayView] Error asking coach:', err);
      setCoachError('Could not reach the coach right now. Try again.');
      showToast('Coach unavailable');
    } finally {
      setIsCoachLoading(false);
    }
  }, [isCoachLoading, existingProgress, tone, dayNum, user, showToast]);

  // ---- Follow-up chat handler ----
  const handleFollowupChat = useCallback(async () => {
    if (isFollowupLoading || !coachResponse || !followupText.trim()) return;
    hapticFeedback('medium');
    setIsFollowupLoading(true);
    setFollowupResponse(null);

    try {
      const response = await api.askCoachFollowup({
        dayNumber: dayNum,
        userQuestion: followupText.trim(),
        previousResponse: coachResponse,
      });
      setFollowupResponse(response);
      setFollowupText('');
      hapticSuccess();
    } catch (err) {
      console.error('[DayView] Error asking coach followup:', err);
      showToast(t('coach_unavailable'));
    } finally {
      setIsFollowupLoading(false);
    }
  }, [isFollowupLoading, coachResponse, followupText, dayNum, showToast, t]);

  // ---- Derived ----
  const allDone = day ? checkedTasks.size === day.tasksJson.length : false;
  const tasksCount = day?.tasksJson.length || 0;
  const checkedCount = checkedTasks.size;
  const isAlreadyDone = existingProgress?.status === 'done' || existingProgress?.status === 'skip';

  // ---- Loading state ----
  if (isLoadingDay) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 border-2 border-ui-button border-t-[#6c5ce7] rounded-full"
        />
      </div>
    );
  }

  if (!day) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        {isGeneratingBlock ? (
          <>
            <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 1.5, repeat: Infinity }} className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#6c5ce7]/20 to-[#a29bfe]/20 flex items-center justify-center mb-4">
              <Brain className="w-8 h-8 text-[#a29bfe]" />
            </motion.div>
            <p className="text-muted-foreground mb-2" style={{ fontSize: '1rem', fontWeight: 600 }}>{t('dv_generating_block')}</p>
            <p className="text-ui-tertiary" style={{ fontSize: '0.8125rem' }}>{t('dv_generating_block_desc')}</p>
            <Loader2 className="w-5 h-5 text-[#6c5ce7] animate-spin mt-4" />
          </>
        ) : blockError ? (
          <>
            <p className="text-red-400 mb-4" style={{ fontSize: '0.9375rem' }}>{blockError}</p>
            <button onClick={() => navigate('/home')} className="text-[#a29bfe]" style={{ fontSize: '0.9375rem' }}>{t('back_to_home')}</button>
          </>
        ) : (
          <>
            <p className="text-ui-secondary mb-4" style={{ fontSize: '1rem' }}>{t('day_not_found')}</p>
            <button onClick={() => navigate('/home')} className="text-[#a29bfe]" style={{ fontSize: '0.9375rem' }}>{t('back_to_home')}</button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 right-0 w-72 h-72 rounded-full bg-[#6c5ce7]/12 blur-[120px]" />
        <div className="absolute bottom-0 -left-20 w-60 h-60 rounded-full bg-[#00cec9]/8 blur-[100px]" />
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
            <p className="text-foreground" style={{ fontSize: '0.875rem', fontWeight: 500 }}>{toast}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reflection Modal Overlay */}
      <AnimatePresence>
        {phase === 'reflection' && (
          <ReflectionModal
            tone={tone}
            status={completionStatus!}
            xpEarned={xpEarned}
            dayNum={dayNum}
            reflectionText={reflectionText}
            setReflectionText={setReflectionText}
            onSave={handleSaveReflection}
            onSkip={handleSkipReflection}
            isSaving={isSaving}
          />
        )}
      </AnimatePresence>

      {/* Completion Overlay */}
      <AnimatePresence>
        {phase === 'complete' && (
          <CompletionOverlay
            status={completionStatus!}
            xpEarned={xpEarned}
            totalXp={totalXp}
            dayNum={dayNum}
            onGoHome={() => navigate('/home')}
            onAskCoach={handleAskCoach}
            coachResponse={coachResponse}
            isCoachLoading={isCoachLoading}
            coachError={coachError}
            followupText={followupText}
            setFollowupText={setFollowupText}
            followupResponse={followupResponse}
            isFollowupLoading={isFollowupLoading}
            onFollowup={handleFollowupChat}
          />
        )}
      </AnimatePresence>

      {/* Main content — visible during "tasks" phase */}
      <div className={`relative z-10 px-5 pb-8 ${phase !== 'tasks' ? 'opacity-0 pointer-events-none' : ''}`} >
        {/* Top bar */}
        <PageHeader
          title={day.title}
          subtitle={t('day_x_of_total', { day: dayNum, total: totalDays })}
          actions={
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-400/10 border border-yellow-400/20">
              <Star className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-yellow-400" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                +{allDone ? 10 : 2} XP
              </span>
            </div>
          }
        />

        {/* Description card */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.05 }}
        >
          <GlassCard variant="elevated" className="mb-6">
            <p className="text-muted-foreground" style={{ fontSize: '0.9375rem', lineHeight: 1.65 }}>
              {day.description}
            </p>
          </GlassCard>
        </motion.div>

        {/* Task progress indicator */}
        <div className="flex items-center justify-between mb-3 px-1">
          <h3 className="text-muted-foreground" style={{ fontSize: '0.8125rem', fontWeight: 600, letterSpacing: '0.05em' }}>
            {t('tasks_label')}
          </h3>
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5">
              {day.tasksJson.map((task) => (
                <div
                  key={task.id}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    proofPhotos[task.id]
                      ? 'bg-emerald-500'
                      : checkedTasks.has(task.id)
                        ? 'bg-[#6c5ce7]'
                        : 'bg-ui-progress'
                  }`}
                />
              ))}
            </div>
            <span className="text-ui-tertiary" style={{ fontSize: '0.75rem', fontWeight: 500 }}>
              {checkedCount}/{tasksCount}
            </span>
          </div>
        </div>

        {/* Hidden file input for photo proofs (fallback) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePhotoSelect}
        />

        {/* getUserMedia camera overlay (reliable on Android) */}
        <CameraCapture
          open={cameraOpen}
          onCapture={handleCameraCapture}
          onClose={() => { setCameraOpen(false); pendingTaskRef.current = null; }}
        />

        {/* Fullscreen photo viewer */}
        <AnimatePresence>
          {viewingPhoto && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4"
              onClick={() => setViewingPhoto(null)}
            >
              <button className="absolute top-12 right-5 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center" onClick={() => setViewingPhoto(null)}>
                <X className="w-5 h-5 text-foreground" />
              </button>
              <img src={viewingPhoto} alt="Proof" className="max-w-full max-h-[80vh] rounded-2xl object-contain" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tasks list */}
        <div className="space-y-2.5 mb-8">
          {day.tasksJson.map((task: Task, i: number) => {
            const Icon = TASK_ICONS[task.type] || Zap;
            const colors = TASK_COLORS[task.type] || TASK_COLORS.action;
            const isChecked = checkedTasks.has(task.id);
            const hasProof = !!proofPhotos[task.id];
            const isUploading = uploadingTask === task.id;

            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * i }}
              >
                <GlassCard
                  variant="interactive"
                  padding="md"
                  className={`${isAlreadyDone ? 'pointer-events-none' : ''}`}
                >
                  <div className="flex gap-3">
                    {/* Checkbox / Photo indicator */}
                    <motion.div
                      animate={isChecked ? { scale: [1, 1.2, 1] } : {}}
                      transition={{ duration: 0.2 }}
                      onClick={() => toggleTask(task.id)}
                      className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center border-2 transition-all mt-0.5 cursor-pointer ${
                        hasProof
                          ? 'bg-emerald-500 border-emerald-500'
                          : isChecked
                            ? 'bg-[#6c5ce7] border-[#6c5ce7]'
                            : 'border-white/15 bg-transparent'
                      }`}
                    >
                      {(isChecked || hasProof) && <Check className="w-4 h-4 text-white" />}
                    </motion.div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span style={{ fontSize: '1.125rem' }}>{task.emoji}</span>
                        <p
                          className={`text-foreground transition-all ${isChecked ? 'opacity-60' : ''} ${hasProof ? 'opacity-50' : ''}`}
                          style={{ fontSize: '0.9375rem', fontWeight: 500 }}
                        >
                          {task.title}
                        </p>
                      </div>
                      <p className="text-muted-foreground" style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>
                        {task.description}
                      </p>

                      {/* Photo proof area */}
                      {hasProof ? (
                        <div className="mt-2.5 flex items-center gap-2.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); setViewingPhoto(proofPhotos[task.id]); }}
                            className="relative w-14 h-14 rounded-xl overflow-hidden border border-emerald-500/30 shrink-0"
                          >
                            <img src={proofPhotos[task.id]} alt="" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                              <ImageIcon className="w-4 h-4 text-foreground/80" />
                            </div>
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400" style={{ fontSize: '0.75rem', fontWeight: 600 }}>{t('proof_confirmed')}</span>
                            </div>
                            {!isAlreadyDone && (
                              <button
                                onClick={(e) => { e.stopPropagation(); triggerPhotoUpload(task.id); }}
                                className="text-muted-foreground flex items-center gap-1"
                                style={{ fontSize: '0.6875rem' }}
                              >
                                <RefreshCw className="w-3 h-3" />
                                {t('proof_retake')}
                              </button>
                            )}
                          </div>
                        </div>
                      ) : !isAlreadyDone && (
                        <div className="mt-2.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); triggerPhotoUpload(task.id); }}
                            disabled={isUploading}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#6c5ce7]/10 border border-[#6c5ce7]/20 text-[#a29bfe] active:bg-[#6c5ce7]/20 transition-colors"
                            style={{ fontSize: '0.8125rem', fontWeight: 500 }}
                          >
                            {isUploading ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {t('proof_uploading')}
                              </>
                            ) : (
                              <>
                                <Camera className="w-4 h-4" />
                                {t('proof_add_photo')}
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <div
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}
                          style={{ fontSize: '0.6875rem', fontWeight: 500 }}
                        >
                          <Icon className="w-3 h-3" />
                          {t(`task_${task.type}`)}
                        </div>
                        {/* Reminder time badge (editable) */}
                        {editingReminder === task.id ? (
                          <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="time"
                              value={reminderInput}
                              onChange={(e) => setReminderInput(e.target.value)}
                              className="w-[90px] h-6 px-1.5 rounded-md bg-ui-button border border-[#6c5ce7]/40 text-foreground text-center"
                              style={{ fontSize: '0.6875rem' }}
                              autoFocus
                            />
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!reminderInput) return;
                                setSavingReminder(true);
                                try {
                                  await api.updateTaskReminder(programId, dayNum, task.id, reminderInput);
                                  if (day) {
                                    const updated = { ...day, tasksJson: day.tasksJson.map((t: Task) => t.id === task.id ? { ...t, reminderTime: reminderInput } : t) };
                                    setDay(updated);
                                  }
                                  showToast(`\u23F0 ${t('dv_reminder_updated')}`);
                                  hapticSuccess();
                                } catch { showToast('Error'); }
                                setSavingReminder(false);
                                setEditingReminder(null);
                              }}
                              className="w-6 h-6 rounded-md bg-[#6c5ce7]/20 flex items-center justify-center"
                            >
                              {savingReminder ? <Loader2 className="w-3 h-3 text-[#a29bfe] animate-spin" /> : <Check className="w-3 h-3 text-[#a29bfe]" />}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingReminder(null); }}
                              className="w-6 h-6 rounded-md bg-ui-button flex items-center justify-center"
                            >
                              <X className="w-3 h-3 text-muted-foreground" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              hapticFeedback('light');
                              setEditingReminder(task.id);
                              setReminderInput((task as any).reminderTime || '08:00');
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#6c5ce7]/8 text-[#a29bfe]/60 hover:bg-[#6c5ce7]/15 transition-colors"
                            style={{ fontSize: '0.6875rem', fontWeight: 500 }}
                          >
                            <Bell className="w-3 h-3" />
                            {(task as any).reminderTime || '--:--'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            );
          })}
        </div>

        {/* Strategic tasks due today — swipe to complete */}
        {sgTasks.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mb-8"
          >
            <div className="flex items-center justify-between mb-2.5 px-1">
              <h3 className="text-[#a29bfe]/60" style={{ fontSize: '0.8125rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                {t('sg_dayview_title')}
              </h3>
              <span className="text-ui-tertiary" style={{ fontSize: '0.6875rem' }}>{t('sg_dayview_subtitle')}</span>
            </div>
            <div className="space-y-2.5">
              {sgTasks.map((task, i) => {
                const isDone = sgCompletedIds.has(task.id);
                const isCompleting = sgCompletingId === task.id;
                return (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.28 + i * 0.04 }}
                  >
                    <SwipeableTask
                      taskId={task.id}
                      isDone={isDone}
                      isCompleting={isCompleting}
                      onComplete={() => handleSgComplete(task.id)}
                      xpAmount={5}
                    >
                      <GlassCard
                        variant="interactive"
                        padding="sm"
                      >
                        <div className="flex items-center gap-3 relative">
                          <motion.button
                            whileTap={{ scale: 0.85 }}
                            onClick={() => handleSgComplete(task.id)}
                            disabled={isDone || !!isCompleting}
                            className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center border-2 transition-all ${
                              isDone
                                ? 'bg-emerald-500 border-emerald-500'
                                : 'border-[#a29bfe]/30 bg-transparent active:bg-[#6c5ce7]/20'
                            }`}
                          >
                            {isCompleting ? (
                              <Loader2 className="w-3.5 h-3.5 text-[#a29bfe] animate-spin" />
                            ) : isDone ? (
                              <Check className="w-4 h-4 text-white" />
                            ) : null}
                          </motion.button>
                          <div className="flex-1 min-w-0">
                            <p className={`truncate ${isDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                              style={{ fontSize: '0.9375rem', fontWeight: 500 }}>
                              {task.title}
                            </p>
                            <p className="text-[#a29bfe]/40 truncate" style={{ fontSize: '0.6875rem' }}>
                              {t('sg_from_goal', { name: task.goalTitle })} &middot; {task.frequency === 'weekly' ? t('sg_weekly') : t('sg_monthly')}
                            </p>
                          </div>
                          {/* XP burst */}
                          <XpBurst show={sgXpBurstId === task.id} amount={5} />
                        </div>
                      </GlassCard>
                    </SwipeableTask>
                  </motion.div>
                );
              })}
            </div>
            {/* Swipe hint (shown only if there are uncompleted tasks) */}
            {sgTasks.some(t => !sgCompletedIds.has(t.id)) && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="text-center text-ui-tertiary mt-2"
                style={{ fontSize: '0.6875rem' }}
              >
                {t('dv_swipe_hint')}
              </motion.p>
            )}
          </motion.div>
        )}

        {/* Action buttons */}
        {!isAlreadyDone && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-3"
          >
            {/* Done button */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleDone}
              disabled={!allDone || isSaving}
              className={`w-full h-14 rounded-2xl flex items-center justify-center gap-2.5 transition-all duration-300 ${
                allDone
                  ? 'bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white shadow-lg'
                  : 'bg-ui-button text-ui-tertiary border border-[var(--glass-border)]'
              }`}
              style={{
                fontSize: '1.0625rem',
                fontWeight: 600,
                boxShadow: allDone ? '0 8px 32px rgba(108,92,231,0.3)' : 'none',
              }}
            >
              {isSaving ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                />
              ) : allDone ? (
                <>
                  <Sparkles className="w-5 h-5" />
                  {t('done_earn_xp', { xp: 10 })}
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  {t('complete_all_tasks', { count: tasksCount })}
                </>
              )}
            </motion.button>

            {/* Skip button */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleSkip}
              disabled={isSaving}
              className="w-full h-12 rounded-xl bg-ui-button border border-[var(--glass-border)] text-muted-foreground flex items-center justify-center gap-2 active:bg-ui-button-active transition-colors"
              style={{ fontSize: '0.9375rem', fontWeight: 500 }}
            >
              <SkipForward className="w-4 h-4" />
              {t('skip_day_earn_xp', { xp: 2 })}
            </motion.button>
          </motion.div>
        )}

        {/* Already completed banner */}
        {isAlreadyDone && phase === 'tasks' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-3"
          >
            <div className={`w-full h-14 rounded-2xl flex items-center justify-center gap-2 ${
              existingProgress?.status === 'done'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
            }`}
              style={{ fontSize: '1rem', fontWeight: 600 }}
            >
              {existingProgress?.status === 'done' ? (
                <><Check className="w-5 h-5" /> {t('completed')}</>
              ) : (
                <><SkipForward className="w-5 h-5" /> {t('skipped')}</>
              )}
            </div>

            {/* Ask Coach button */}
            {!coachResponse && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleAskCoach}
                disabled={isCoachLoading}
                className="w-full h-12 rounded-xl bg-[#00cec9]/10 border border-[#00cec9]/20 text-[#00cec9] flex items-center justify-center gap-2.5 active:bg-[#00cec9]/15 transition-all"
                style={{ fontSize: '0.9375rem', fontWeight: 600 }}
              >
                {isCoachLoading ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-4.5 h-4.5 border-2 border-[#00cec9]/30 border-t-[#00cec9] rounded-full"
                      style={{ width: 18, height: 18 }}
                    />
                    {t('thinking')}
                  </>
                ) : (
                  <>
                    <Brain className="w-5 h-5" />
                    {t('ask_coach')}
                  </>
                )}
              </motion.button>
            )}

            {/* Coach error */}
            {coachError && !coachResponse && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <GlassCard variant="elevated" padding="md">
                  <div className="flex items-center gap-2 mb-2">
                    <X className="w-4 h-4 text-red-400" />
                    <p className="text-red-400" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                      {t('coach_unavailable')}
                    </p>
                  </div>
                  <p className="text-muted-foreground" style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>
                    {coachError}
                  </p>
                  <button
                    onClick={handleAskCoach}
                    className="mt-3 text-[#00cec9] flex items-center gap-1"
                    style={{ fontSize: '0.8125rem', fontWeight: 500 }}
                  >
                    {t('try_again')}
                  </button>
                </GlassCard>
              </motion.div>
            )}

            {/* Coach response card */}
            <AnimatePresence>
              {coachResponse && (
                <motion.div
                  initial={{ opacity: 0, y: 12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={{ type: 'spring', damping: 22, stiffness: 280 }}
                >
                  <GlassCard variant="elevated" padding="md" className="relative overflow-hidden">
                    {/* Accent glow */}
                    <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-[#00cec9]/10 blur-[40px] pointer-events-none" />

                    {/* Header */}
                    <div className="flex items-center gap-2 mb-3.5">
                      <div className="w-8 h-8 rounded-lg bg-[#00cec9]/15 flex items-center justify-center">
                        <Brain className="w-4.5 h-4.5 text-[#00cec9]" style={{ width: 18, height: 18 }} />
                      </div>
                      <div>
                        <p className="text-[#00cec9]" style={{ fontSize: '0.8125rem', fontWeight: 700 }}>
                          {t('ai_coach_title')}
                        </p>
                        <p className="text-ui-tertiary" style={{ fontSize: '0.625rem', fontWeight: 500 }}>
                          {t('personalized_insight')}
                        </p>
                      </div>
                    </div>

                    {/* Short message */}
                    <p className="text-foreground/75 mb-4" style={{ fontSize: '0.9375rem', lineHeight: 1.65 }}>
                      {coachResponse.shortMessage}
                    </p>

                    {/* Next step */}
                    <div className="bg-[#6c5ce7]/8 border border-[#6c5ce7]/15 rounded-xl px-3.5 py-3 mb-3">
                      <p className="text-[#a29bfe] mb-1" style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                        {t('next_step')}
                      </p>
                      <p className="text-foreground/65" style={{ fontSize: '0.875rem', lineHeight: 1.55 }}>
                        {coachResponse.nextStep}
                      </p>
                    </div>

                    {/* Reframe (optional) */}
                    {coachResponse.reframe && (
                      <div className="bg-amber-500/6 border border-amber-500/12 rounded-xl px-3.5 py-3">
                        <p className="text-amber-400/80 mb-1" style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                          {t('reframe')}
                        </p>
                        <p className="text-muted-foreground" style={{ fontSize: '0.8125rem', lineHeight: 1.55, fontStyle: 'italic' }}>
                          {coachResponse.reframe}
                        </p>
                      </div>
                    )}

                    {/* Follow-up chat */}
                    <div className="bg-[#00cec9]/5 border border-[#00cec9]/12 rounded-xl px-3.5 py-3 mt-3">
                      <p className="text-[#00cec9]/70 mb-2" style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                        {t('coach_followup_title')}
                      </p>
                      <textarea
                        value={followupText}
                        onChange={(e) => setFollowupText(e.target.value)}
                        placeholder={t('coach_followup_placeholder')}
                        rows={2}
                        maxLength={500}
                        className="w-full bg-ui-button rounded-xl px-3.5 py-2.5 text-foreground resize-none outline-none border border-[var(--glass-border)] focus:border-[#00cec9]/30 transition-colors"
                        style={{ fontSize: '0.875rem', lineHeight: 1.5 }}
                      />
                      <div className="flex items-center justify-between mt-2">
                        <VoiceInput
                          onTranscript={(text) => setFollowupText((prev) => prev ? prev + ' ' + text : text)}
                          size="sm"
                        />
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={handleFollowupChat}
                          disabled={!followupText.trim() || isFollowupLoading}
                          className={`h-9 px-4 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                            followupText.trim()
                              ? 'bg-[#00cec9]/15 border border-[#00cec9]/30 text-[#00cec9]'
                              : 'bg-ui-button text-ui-tertiary'
                          }`}
                          style={{ fontSize: '0.8125rem', fontWeight: 600 }}
                        >
                          {isFollowupLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5" />
                              {t('coach_followup_send')}
                            </>
                          )}
                        </motion.button>
                      </div>
                    </div>

                    {/* Follow-up response */}
                    <AnimatePresence>
                      {followupResponse && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 8 }}
                          className="mt-3 bg-[#00cec9]/5 border border-[#00cec9]/12 rounded-xl px-3.5 py-3"
                        >
                          <div className="flex items-center gap-1.5 mb-2">
                            <Brain className="w-3.5 h-3.5 text-[#00cec9]" />
                            <p className="text-[#00cec9]/70" style={{ fontSize: '0.6875rem', fontWeight: 700 }}>
                              {t('coach_followup_title')}
                            </p>
                          </div>
                          <p className="text-foreground/70 mb-2.5" style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
                            {followupResponse.shortMessage}
                          </p>
                          <div className="bg-[#6c5ce7]/8 border border-[#6c5ce7]/15 rounded-lg px-3 py-2.5">
                            <p className="text-[#a29bfe] mb-0.5" style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                              {t('next_step')}
                            </p>
                            <p className="text-muted-foreground" style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>
                              {followupResponse.nextStep}
                            </p>
                          </div>
                          {followupResponse.reframe && (
                            <p className="text-muted-foreground mt-2" style={{ fontSize: '0.8125rem', lineHeight: 1.5, fontStyle: 'italic' }}>
                              {followupResponse.reframe}
                            </p>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </GlassCard>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={() => navigate('/home')}
              className="w-full h-12 rounded-xl bg-ui-button text-muted-foreground flex items-center justify-center gap-2"
              style={{ fontSize: '0.9375rem', fontWeight: 500 }}
            >
              <Home className="w-4 h-4" />
              {t('back_to_home')}
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// =============================================
// Reflection Modal
// =============================================
function ReflectionModal({
  tone,
  status,
  xpEarned,
  dayNum,
  reflectionText,
  setReflectionText,
  onSave,
  onSkip,
  isSaving,
}: {
  tone: string;
  status: 'done' | 'skip';
  xpEarned: number;
  dayNum: number;
  reflectionText: string;
  setReflectionText: (v: string) => void;
  onSave: () => void;
  onSkip: () => void;
  isSaving: boolean;
}) {
  const { t } = useTranslation();
  const question = t(`reflect_q_${tone}`);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
    >
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onSkip}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full max-w-lg rounded-t-3xl bg-liquid-glass glass-sheet glass-sheet-bottom px-6 pb-10 pt-4"
      >
        {/* Handle */}
        <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-6" />

        {/* XP earned badge */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, type: 'spring' }}
          className="flex items-center justify-center gap-2 mb-5"
        >
          <div className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full ${
            status === 'done' ? 'bg-[#6c5ce7]/15 border border-[#6c5ce7]/30' : 'bg-amber-500/15 border border-amber-500/30'
          }`}>
            <Star className={`w-4 h-4 ${status === 'done' ? 'text-[#a29bfe]' : 'text-amber-400'}`} />
            <span className={`${status === 'done' ? 'text-[#a29bfe]' : 'text-amber-400'}`} style={{ fontSize: '0.875rem', fontWeight: 600 }}>
              +{xpEarned} {t('xp_earned')}
            </span>
          </div>
        </motion.div>

        {/* Title */}
        <h3 className="text-foreground text-center mb-2" style={{ fontSize: '1.25rem', fontWeight: 700 }}>
          {status === 'done' ? t('day_done_title', { day: dayNum }) : t('skipping_day_title', { day: dayNum })}
        </h3>
        <p className="text-muted-foreground text-center mb-6" style={{ fontSize: '0.8125rem' }}>
          {status === 'skip' ? t('reflect_skip') : t('reflect_done')}
        </p>

        {/* Reflection question */}
        <GlassCard variant="elevated" padding="md" className="mb-4">
          <p className="text-foreground/70 mb-3" style={{ fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.5 }}>
            {question}
          </p>
          <textarea
            value={reflectionText}
            onChange={(e) => setReflectionText(e.target.value)}
            placeholder={t('reflection_placeholder')}
            rows={3}
            className="w-full bg-ui-button rounded-xl px-3.5 py-3 text-foreground resize-none outline-none border border-[var(--glass-border)] focus:border-[#6c5ce7]/40 transition-colors"
            style={{ fontSize: '0.9375rem', lineHeight: 1.6 }}
          />
          <div className="flex items-center justify-end mt-1.5">
            <VoiceInput
              onTranscript={(text) => setReflectionText(reflectionText ? reflectionText + ' ' + text : text)}
              size="sm"
            />
          </div>
        </GlassCard>

        {/* Buttons */}
        <div className="space-y-2.5">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onSave}
            disabled={!reflectionText.trim() || isSaving}
            className={`w-full h-13 rounded-xl flex items-center justify-center gap-2 transition-all ${
              reflectionText.trim()
                ? 'bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white'
                : 'bg-ui-button text-ui-tertiary'
            }`}
            style={{ fontSize: '0.9375rem', fontWeight: 600, height: '52px' }}
          >
            {isSaving ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
              />
            ) : (
              <>
                <Send className="w-4 h-4" />
                {t('save_reflection')}
              </>
            )}
          </motion.button>

          <button
            onClick={onSkip}
            className="w-full h-11 text-muted-foreground flex items-center justify-center"
            style={{ fontSize: '0.875rem' }}
          >
            {t('skip_for_now')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// =============================================
// Completion Overlay
// =============================================
function CompletionOverlay({
  status,
  xpEarned,
  totalXp,
  dayNum,
  onGoHome,
  onAskCoach,
  coachResponse,
  isCoachLoading,
  coachError,
  followupText,
  setFollowupText,
  followupResponse,
  isFollowupLoading,
  onFollowup,
}: {
  status: 'done' | 'skip';
  xpEarned: number;
  totalXp: number;
  dayNum: number;
  onGoHome: () => void;
  onAskCoach: () => void;
  coachResponse: CoachResponse | null;
  isCoachLoading: boolean;
  coachError: string | null;
  followupText: string;
  setFollowupText: (text: string) => void;
  followupResponse: CoachResponse | null;
  isFollowupLoading: boolean;
  onFollowup: () => void;
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-liquid-glass glass-sheet flex flex-col items-center px-8 overflow-y-auto py-12"
      style={{ justifyContent: coachResponse ? 'flex-start' : 'center' }}
    >
      {/* Icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.1 }}
        className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 shrink-0 ${
          status === 'done'
            ? 'bg-gradient-to-br from-emerald-400 to-[#00cec9]'
            : 'bg-gradient-to-br from-amber-400 to-orange-400'
        }`}
        style={{ boxShadow: status === 'done' ? '0 12px 40px rgba(0,206,201,0.3)' : '0 12px 40px rgba(245,166,35,0.3)' }}
      >
        {status === 'done' ? (
          <Sparkles className="w-12 h-12 text-foreground" />
        ) : (
          <SkipForward className="w-12 h-12 text-foreground" />
        )}
      </motion.div>

      {/* Title */}
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-foreground text-center mb-2"
        style={{ fontSize: '1.5rem', fontWeight: 700 }}
      >
        {status === 'done' ? t('day_complete_title', { day: dayNum }) : t('day_skipped_title', { day: dayNum })}
      </motion.h2>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45 }}
        className="text-muted-foreground text-center mb-8"
        style={{ fontSize: '0.9375rem' }}
      >
        {status === 'done' ? t('momentum_msg') : t('rest_msg')}
      </motion.p>

      {/* XP summary */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
        className="flex items-center gap-6 mb-10"
      >
        <div className="text-center">
          <div className="flex items-center gap-1.5 mb-1">
            <Star className="w-5 h-5 text-yellow-400" />
            <span className="text-yellow-400" style={{ fontSize: '1.375rem', fontWeight: 700 }}>+{xpEarned}</span>
          </div>
          <p className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>{t('xp_earned')}</p>
        </div>
        <div className="w-px h-10" style={{ background: 'var(--glass-border)' }} />
        <div className="text-center">
          <div className="flex items-center gap-1.5 mb-1">
            <Flame className="w-5 h-5 text-orange-400" />
            <span className="text-foreground" style={{ fontSize: '1.375rem', fontWeight: 700 }}>{totalXp}</span>
          </div>
          <p className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>{t('total_xp')}</p>
        </div>
      </motion.div>

      {/* Back to Home */}
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.65 }}
        whileTap={{ scale: 0.97 }}
        onClick={onGoHome}
        className="w-full max-w-xs h-14 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white flex items-center justify-center gap-2.5 shadow-lg"
        style={{ fontSize: '1.0625rem', fontWeight: 600, boxShadow: '0 8px 32px rgba(108,92,231,0.3)' }}
      >
        <Home className="w-5 h-5" />
        {t('back_to_home')}
      </motion.button>

      {/* Ask Coach button */}
      {!coachResponse && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onAskCoach}
          disabled={isCoachLoading}
          className="w-full max-w-xs h-12 rounded-xl bg-[#00cec9]/10 border border-[#00cec9]/20 text-[#00cec9] flex items-center justify-center gap-2.5 active:bg-[#00cec9]/15 transition-all mt-3"
          style={{ fontSize: '0.9375rem', fontWeight: 600 }}
        >
          {isCoachLoading ? (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-4.5 h-4.5 border-2 border-[#00cec9]/30 border-t-[#00cec9] rounded-full"
                style={{ width: 18, height: 18 }}
              />
              {t('thinking')}
            </>
          ) : (
            <>
              <Brain className="w-5 h-5" />
              {t('ask_coach')}
            </>
          )}
        </motion.button>
      )}

      {/* Coach error */}
      {coachError && !coachResponse && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <GlassCard variant="elevated" padding="md">
            <div className="flex items-center gap-2 mb-2">
              <X className="w-4 h-4 text-red-400" />
              <p className="text-red-400" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                {t('coach_unavailable')}
              </p>
            </div>
            <p className="text-muted-foreground" style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>
              {coachError}
            </p>
            <button
              onClick={onAskCoach}
              className="mt-3 text-[#00cec9] flex items-center gap-1"
              style={{ fontSize: '0.8125rem', fontWeight: 500 }}
            >
              {t('try_again')}
            </button>
          </GlassCard>
        </motion.div>
      )}

      {/* Coach response card */}
      <AnimatePresence>
        {coachResponse && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
          >
            <GlassCard variant="elevated" padding="md" className="relative overflow-hidden">
              {/* Accent glow */}
              <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-[#00cec9]/10 blur-[40px] pointer-events-none" />

              {/* Header */}
              <div className="flex items-center gap-2 mb-3.5">
                <div className="w-8 h-8 rounded-lg bg-[#00cec9]/15 flex items-center justify-center">
                  <Brain className="w-4.5 h-4.5 text-[#00cec9]" style={{ width: 18, height: 18 }} />
                </div>
                <div>
                  <p className="text-[#00cec9]" style={{ fontSize: '0.8125rem', fontWeight: 700 }}>
                    {t('ai_coach_title')}
                  </p>
                  <p className="text-ui-tertiary" style={{ fontSize: '0.625rem', fontWeight: 500 }}>
                    {t('personalized_insight')}
                  </p>
                </div>
              </div>

              {/* Short message */}
              <p className="text-foreground/75 mb-4" style={{ fontSize: '0.9375rem', lineHeight: 1.65 }}>
                {coachResponse.shortMessage}
              </p>

              {/* Next step */}
              <div className="bg-[#6c5ce7]/8 border border-[#6c5ce7]/15 rounded-xl px-3.5 py-3 mb-3">
                <p className="text-[#a29bfe] mb-1" style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                  {t('next_step')}
                </p>
                <p className="text-foreground/65" style={{ fontSize: '0.875rem', lineHeight: 1.55 }}>
                  {coachResponse.nextStep}
                </p>
              </div>

              {/* Reframe (optional) */}
              {coachResponse.reframe && (
                <div className="bg-amber-500/6 border border-amber-500/12 rounded-xl px-3.5 py-3">
                  <p className="text-amber-400/80 mb-1" style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                    {t('reframe')}
                  </p>
                  <p className="text-muted-foreground" style={{ fontSize: '0.8125rem', lineHeight: 1.55, fontStyle: 'italic' }}>
                    {coachResponse.reframe}
                  </p>
                </div>
              )}

              {/* Follow-up chat (CompletionOverlay) */}
              <div className="bg-[#00cec9]/5 border border-[#00cec9]/12 rounded-xl px-3.5 py-3 mt-3">
                <p className="text-[#00cec9]/70 mb-2" style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                  {t('coach_followup_title')}
                </p>
                <textarea
                  value={followupText}
                  onChange={(e) => setFollowupText(e.target.value)}
                  placeholder={t('coach_followup_placeholder')}
                  rows={2}
                  maxLength={500}
                  className="w-full bg-ui-button rounded-xl px-3.5 py-2.5 text-foreground resize-none outline-none border border-[var(--glass-border)] focus:border-[#00cec9]/30 transition-colors"
                  style={{ fontSize: '0.875rem', lineHeight: 1.5 }}
                />
                <div className="flex items-center justify-between mt-2">
                  <VoiceInput
                    onTranscript={(text) => setFollowupText(followupText ? followupText + ' ' + text : text)}
                    size="sm"
                  />
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={onFollowup}
                    disabled={!followupText.trim() || isFollowupLoading}
                    className={`h-9 px-4 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                      followupText.trim()
                        ? 'bg-[#00cec9]/15 border border-[#00cec9]/30 text-[#00cec9]'
                        : 'bg-ui-button text-ui-tertiary'
                    }`}
                    style={{ fontSize: '0.8125rem', fontWeight: 600 }}
                  >
                    {isFollowupLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        {t('coach_followup_send')}
                      </>
                    )}
                  </motion.button>
                </div>
              </div>

              {/* Follow-up response (CompletionOverlay) */}
              <AnimatePresence>
                {followupResponse && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="mt-3 bg-[#00cec9]/5 border border-[#00cec9]/12 rounded-xl px-3.5 py-3"
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <Brain className="w-3.5 h-3.5 text-[#00cec9]" />
                      <p className="text-[#00cec9]/70" style={{ fontSize: '0.6875rem', fontWeight: 700 }}>
                        {t('coach_followup_title')}
                      </p>
                    </div>
                    <p className="text-foreground/70 mb-2.5" style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
                      {followupResponse.shortMessage}
                    </p>
                    <div className="bg-[#6c5ce7]/8 border border-[#6c5ce7]/15 rounded-lg px-3 py-2.5">
                      <p className="text-[#a29bfe] mb-0.5" style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                        {t('next_step')}
                      </p>
                      <p className="text-muted-foreground" style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>
                        {followupResponse.nextStep}
                      </p>
                    </div>
                    {followupResponse.reframe && (
                      <p className="text-muted-foreground mt-2" style={{ fontSize: '0.8125rem', lineHeight: 1.5, fontStyle: 'italic' }}>
                        {followupResponse.reframe}
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}