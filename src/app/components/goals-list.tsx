// =============================================
// Proper Food AI — Unified Goals Hub (/goals)
// =============================================
// Shows ALL goals in one place:
//   0. Overview card with total progress
//   1. Active program (from plan-builder)
//   2. Strategic goals (AI strategy engine) + inline due tasks
//   3. Personal goals (simple goals & tasks)
//   4. Completed programs history
// =============================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  Target,
  CheckCircle2,
  Archive,
  ChevronRight,
  Loader2,
  X,
  Calendar,
  Sparkles,
  Rocket,
  Flame,
  Check,
  Clock,
  Trophy,
  Zap,
  Bell,
  BellOff,
  ListTodo,
  CircleCheck,
  Trash2,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useBottomSheetLifecycle } from './bottom-sheet-context';
import { api } from './api-client';
import type { UserGoal, UserTask, StrategicGoal, StrategicTask } from './api-client';
import { hapticFeedback, hapticSuccess } from './telegram';
import { SwipeableTask, XpBurst } from './swipeable-task';
import { playXpCoinSound } from './xp-sound';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';
import { isCompactCards } from './local-settings';
import { PremiumBadge } from './premium-gate';

const STATUS_FILTERS = ['active', '', 'done', 'archived'] as const;

const STATUS_STYLES: Record<string, { text: string; bg: string; icon: React.ElementType }> = {
  active: { text: 'text-[#00cec9]', bg: 'bg-[#00cec9]/10', icon: Target },
  done: { text: 'text-emerald-400', bg: 'bg-emerald-400/10', icon: CheckCircle2 },
  archived: { text: 'text-muted-foreground', bg: 'bg-ui-button', icon: Archive },
};

export function GoalsListPage() {
  const navigate = useNavigate();
  const { t, lang } = useTranslation();

  // Personal goals — load ALL once, filter client-side
  const [allGoals, setAllGoals] = useState<UserGoal[]>([]);
  const [statusFilter, setStatusFilter] = useState('active');
  const goals = useMemo(() => {
    if (!statusFilter) return allGoals;
    return allGoals.filter(g => g.status === statusFilter);
  }, [allGoals, statusFilter]);

  // Strategic goals
  const [strategicGoals, setStrategicGoals] = useState<StrategicGoal[]>([]);

  // Strategic due tasks (inline swipe-to-complete)
  const [sgDueTasks, setSgDueTasks] = useState<Record<string, StrategicTask[]>>({});
  const [sgCompletingId, setSgCompletingId] = useState<string | null>(null);
  const [sgCompletedIds, setSgCompletedIds] = useState<Set<string>>(new Set());
  const [sgXpBurstId, setSgXpBurstId] = useState<string | null>(null);
  const [sgXpAmount, setSgXpAmount] = useState(5);
  const [sgToast, setSgToast] = useState<string | null>(null);
  const sgToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Active program
  const [activeProgram, setActiveProgram] = useState<any>(null);
  const [programProgress, setProgramProgress] = useState({ doneDays: 0, totalDays: 7, currentDay: 1, streak: 0 });

  // Completed programs (history)
  const [completedPrograms, setCompletedPrograms] = useState<any[]>([]);
  const [activeProgramId, setActiveProgramId] = useState('');

  // UI
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // User tasks (standalone, not tied to strategic goals)
  const [userTasks, setUserTasks] = useState<UserTask[]>([]);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskReminder, setNewTaskReminder] = useState(false);
  const [newTaskReminderTime, setNewTaskReminderTime] = useState('09:00');
  const [newTaskFrequency, setNewTaskFrequency] = useState<'once' | 'daily' | 'weekdays'>('daily');
  const [newTaskStartDate, setNewTaskStartDate] = useState('');
  const [savingTask, setSavingTask] = useState(false);
  const [taskToast, setTaskToast] = useState<string | null>(null);
  const taskToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create form
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDate, setNewDate] = useState('');
  const [saving, setSaving] = useState(false);

  // Hide tab bar when any bottom sheet is open
  useBottomSheetLifecycle(showCreate || showCreateTask);

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

  // Load all data
  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getGoals().catch(() => ({ goals: [] })),
      api.getStrategicGoals('active').catch(() => ({ goals: [] })),
      api.getActiveProgram().catch(() => null),
      api.getProgressSummary().catch(() => null),
      api.getProgramHistory().catch(() => ({ programs: [], activeProgramId: '' })),
      api.getTasks().catch(() => ({ tasks: [] })),
    ]).then(([goalsRes, sgRes, prog, summary, histRes, tasksRes]) => {
      setUserTasks((tasksRes as any).tasks || []);
      setAllGoals(goalsRes.goals);

      const sGoals = sgRes.goals;
      setStrategicGoals(sGoals);

      // Load due tasks for strategic goals with dueSoon > 0
      const goalsWithDue = sGoals.filter((g: StrategicGoal) => g.dueSoon > 0);
      goalsWithDue.forEach((g: StrategicGoal) => {
        api.getStrategicGoal(g.id)
          .then(r => {
            const today = new Date().toISOString().slice(0, 10);
            const due = r.tasks.filter((t: StrategicTask) => t.nextDueDate && t.nextDueDate <= today);
            if (due.length > 0) {
              setSgDueTasks(prev => ({ ...prev, [g.id]: due }));
            }
          })
          .catch(() => {});
      });

      setActiveProgram(prog);
      if (summary) {
        const currentDay = Math.min((summary.doneDays ?? 0) + (summary.skippedDays ?? 0) + 1, summary.totalDays ?? 7);
        setProgramProgress({
          doneDays: summary.doneDays ?? 0,
          totalDays: summary.totalDays ?? 7,
          currentDay,
          streak: summary.streak ?? 0,
        });
      } else if (prog) {
        setProgramProgress({ doneDays: 0, totalDays: prog.durationDays || 7, currentDay: 1, streak: 0 });
      }

      // Completed programs — exclude the currently active one
      const activeId = histRes.activeProgramId || '';
      setActiveProgramId(activeId);
      const completed = (histRes.programs || []).filter((p: any) => p.id !== activeId);
      setCompletedPrograms(completed);
    }).finally(() => setLoading(false));
  }, []);

  const loadGoals = useCallback(async () => {
    try {
      const res = await api.getGoals();
      setAllGoals(res.goals);
    } catch (err) {
      console.error('[Goals] Load error:', err);
    }
  }, []);

  // Auto-compute default start date when reminder is toggled on
  const computeDefaultStartDate = (time: string) => {
    const now = new Date();
    const [h, m] = time.split(':').map(Number);
    const todayStr = now.toISOString().slice(0, 10);
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const targetMins = h * 60 + m;
    // If the time hasn't passed today, start today; otherwise tomorrow
    if (targetMins > currentMins + 15) return todayStr;
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  };

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim()) return;
    setSavingTask(true);
    hapticFeedback('light');
    try {
      const startDate = newTaskReminder
        ? (newTaskStartDate || computeDefaultStartDate(newTaskReminderTime))
        : undefined;
      const created = await api.createTask({
        title: newTaskTitle.trim(),
        description: newTaskDesc.trim() || undefined,
        reminderEnabled: newTaskReminder,
        reminderTime: newTaskReminder ? newTaskReminderTime : undefined,
        reminderFrequency: newTaskReminder ? newTaskFrequency : undefined,
        reminderStartDate: startDate,
      });
      hapticSuccess();
      setUserTasks(prev => [created, ...prev]);
      setNewTaskTitle('');
      setNewTaskDesc('');
      setNewTaskReminder(false);
      setNewTaskReminderTime('09:00');
      setNewTaskFrequency('daily');
      setNewTaskStartDate('');
      setShowCreateTask(false);
      if (taskToastTimer.current) clearTimeout(taskToastTimer.current);
      setTaskToast(t('task_saved'));
      taskToastTimer.current = setTimeout(() => setTaskToast(null), 2500);
    } catch (err) {
      console.error('[Goals] Create task error:', err);
    } finally {
      setSavingTask(false);
    }
  };

  const handleToggleTask = async (task: UserTask) => {
    const newStatus = task.status === 'todo' ? 'done' : 'todo';
    hapticFeedback('medium');
    try {
      const updated = await api.updateTask(task.id, { status: newStatus });
      hapticSuccess();
      setUserTasks(prev => prev.map(t => t.id === task.id ? updated : t));
      if (newStatus === 'done') {
        if (taskToastTimer.current) clearTimeout(taskToastTimer.current);
        setTaskToast(t('task_completed'));
        taskToastTimer.current = setTimeout(() => setTaskToast(null), 2500);
        playXpCoinSound();
      }
    } catch (err) {
      console.error('[Goals] Toggle task error:', err);
    }
  };

  const handleToggleTaskReminder = async (task: UserTask) => {
    const newEnabled = !task.reminderEnabled;
    hapticFeedback('light');
    try {
      const startDate = newEnabled
        ? (task.reminderStartDate || computeDefaultStartDate(task.reminderTime || '09:00'))
        : undefined;
      const updated = await api.updateTask(task.id, {
        reminderEnabled: newEnabled,
        reminderTime: newEnabled ? (task.reminderTime || '09:00') : task.reminderTime || undefined,
        reminderStartDate: startDate,
        reminderFrequency: task.reminderFrequency || 'daily',
      });
      setUserTasks(prev => prev.map(t => t.id === task.id ? updated : t));
    } catch (err) {
      console.error('[Goals] Toggle reminder error:', err);
    }
  };

  const handleSendTestReminder = async (task: UserTask) => {
    hapticFeedback('medium');
    try {
      await api.sendTaskReminder(task.id);
      hapticSuccess();
      if (taskToastTimer.current) clearTimeout(taskToastTimer.current);
      setTaskToast(t('task_send_now') + ' \u2713');
      taskToastTimer.current = setTimeout(() => setTaskToast(null), 2500);
    } catch (err) {
      console.error('[Goals] Send test reminder error:', err);
    }
  };

  const handleDeleteTask = async (task: UserTask) => {
    hapticFeedback('medium');
    try {
      await api.deleteTask(task.id);
      hapticSuccess();
      setUserTasks(prev => prev.filter(t => t.id !== task.id));
      if (taskToastTimer.current) clearTimeout(taskToastTimer.current);
      setTaskToast(t('task_deleted'));
      taskToastTimer.current = setTimeout(() => setTaskToast(null), 2500);
    } catch (err) {
      console.error('[Goals] Delete task error:', err);
    }
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    hapticFeedback('light');
    try {
      await api.createGoal({
        title: newTitle.trim(),
        description: newDesc.trim() || undefined,
        targetDate: newDate || undefined,
      });
      hapticSuccess();
      setNewTitle('');
      setNewDesc('');
      setNewDate('');
      setShowCreate(false);
      loadGoals();
    } catch (err) {
      console.error('[Goals] Create error:', err);
    } finally {
      setSaving(false);
    }
  };

  // Strategic task completion (same as dashboard)
  const handleSgTaskComplete = async (taskId: string, goalId: string) => {
    if (sgCompletingId || sgCompletedIds.has(taskId)) return;
    setSgCompletingId(taskId);
    hapticFeedback('medium');
    try {
      const updated = await api.completeStrategicTask(taskId);
      const xp = (updated as any).xpAwarded || 5;
      hapticSuccess();
      setSgCompletedIds(prev => new Set(prev).add(taskId));
      setSgDueTasks(prev => {
        const goalTasks = prev[goalId] || [];
        return { ...prev, [goalId]: goalTasks.map(t => t.id === taskId ? { ...t, completedCount: updated.completedCount, nextDueDate: updated.nextDueDate } : t) };
      });
      setStrategicGoals(prev => prev.map(g => g.id === goalId ? { ...g, totalCompleted: g.totalCompleted + 1, dueSoon: Math.max(0, g.dueSoon - 1) } : g));
      setSgXpAmount(xp);
      setSgXpBurstId(taskId);
      setTimeout(() => setSgXpBurstId(null), 2000);
      if (sgToastTimer.current) clearTimeout(sgToastTimer.current);
      setSgToast(`${t('sg_task_completed')}  +${xp} XP`);
      sgToastTimer.current = setTimeout(() => setSgToast(null), 2500);
      playXpCoinSound();
    } catch (err) {
      console.error('[Goals] Strategic task complete error:', err);
    } finally {
      setSgCompletingId(null);
    }
  };

  // Close add menu on outside click
  useEffect(() => {
    if (!showAddMenu) return;
    function handleClick(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showAddMenu]);

  // Computed overview stats
  const pendingTasks = userTasks.filter(ut => ut.status === 'todo').length;
  const doneTasks = userTasks.filter(ut => ut.status === 'done').length;
  const totalActive = (activeProgram ? 1 : 0) + strategicGoals.length + allGoals.filter(g => g.status === 'active').length + pendingTasks;
  const totalDueSg = strategicGoals.reduce((s, g) => s + g.dueSoon, 0) + pendingTasks;
  const totalCompletedCount = completedPrograms.length + allGoals.filter(g => g.status === 'done').length + doneTasks;

  // Overall progress across all goal types
  const overallProgressParts: { done: number; total: number }[] = [];
  if (activeProgram) overallProgressParts.push({ done: programProgress.doneDays, total: programProgress.totalDays });
  strategicGoals.forEach(sg => { if (sg.taskCount > 0) overallProgressParts.push({ done: sg.totalCompleted, total: sg.taskCount }); });
  allGoals.forEach(g => { if (g.taskCount > 0) overallProgressParts.push({ done: g.tasksDone, total: g.taskCount }); });
  if (userTasks.length > 0) overallProgressParts.push({ done: doneTasks, total: userTasks.length });
  const overallDone = overallProgressParts.reduce((s, p) => s + p.done, 0);
  const overallTotal = overallProgressParts.reduce((s, p) => s + p.total, 0);
  const overallPercent = overallTotal > 0 ? Math.round((overallDone / overallTotal) * 100) : 0;

  const progPercent = programProgress.totalDays > 0
    ? Math.round((programProgress.doneDays / programProgress.totalDays) * 100)
    : 0;
  const progComplete = programProgress.doneDays >= programProgress.totalDays;

  return (
    <div className="min-h-screen pb-28">
      {/* Background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-[#00cec9]/10 blur-[100px]" />
        <div className="absolute bottom-1/3 -left-16 w-48 h-48 rounded-full bg-[#6c5ce7]/8 blur-[80px]" />
      </div>

      <div className="relative z-10 px-5 pb-6" >
        {/* Header */}
        <PageHeader
          title={t('goals_title')}
          actions={
            <div className="relative" ref={addMenuRef}>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => { hapticFeedback('light'); setShowAddMenu(!showAddMenu); }}
                className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6c5ce7]/30 to-[#00cec9]/30 flex items-center justify-center"
                style={{ border: '1px solid var(--glass-border)' }}
              >
                <Plus className="w-5 h-5 text-ui-icon-primary" />
              </motion.button>

            <AnimatePresence>
              {showAddMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -8 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full right-0 mt-2 w-56 rounded-2xl bg-liquid-glass-dropdown border border-[var(--glass-border)] p-2 z-50"
                  style={{ boxShadow: '0 16px 48px rgba(0,0,0,0.6)' }}
                >
                  <button
                    onClick={() => { hapticFeedback('light'); setShowAddMenu(false); setShowCreateTask(true); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--ui-button-bg)] active:bg-[var(--ui-button-active)] transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[#e17055]/15 flex items-center justify-center">
                      <ListTodo className="w-4 h-4 text-[#e17055]" />
                    </div>
                    <p className="text-foreground text-left" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{t('task_create')}</p>
                  </button>
                  <button
                    onClick={() => { hapticFeedback('light'); setShowAddMenu(false); setShowCreate(true); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--ui-button-bg)] active:bg-[var(--ui-button-active)] transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[#00cec9]/15 flex items-center justify-center">
                      <Target className="w-4 h-4 text-[#00cec9]" />
                    </div>
                    <p className="text-foreground text-left" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{t('goals_create_simple')}</p>
                  </button>
                  <button
                    onClick={() => { hapticFeedback('medium'); setShowAddMenu(false); navigate('/strategic-goal/create'); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--ui-button-bg)] active:bg-[var(--ui-button-active)] transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[#6c5ce7]/15 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-[#a29bfe]" />
                    </div>
                    <p className="text-foreground text-left flex items-center gap-2" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{t('goals_create_strategic')} <PremiumBadge /></p>
                  </button>
                  <button
                    onClick={() => { hapticFeedback('medium'); setShowAddMenu(false); navigate('/plan-builder'); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--ui-button-bg)] active:bg-[var(--ui-button-active)] transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6c5ce7]/15 to-[#a29bfe]/15 flex items-center justify-center">
                      <Rocket className="w-4 h-4 text-[#a29bfe]" />
                    </div>
                    <p className="text-foreground text-left flex items-center gap-2" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{t('goals_create_path')} <PremiumBadge /></p>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          }
        />

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-[#6c5ce7] animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">

            {/* ===== 0. OVERVIEW CARD ===== */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 }}>
              <GlassCard variant="elevated" padding="md" className="relative overflow-hidden">
                <div className="absolute -top-10 -left-10 w-32 h-32 rounded-full bg-gradient-to-br from-[#6c5ce7]/15 to-[#00cec9]/10 blur-[50px] pointer-events-none" />
                <div className="absolute bottom-0 right-0 w-24 h-24 rounded-full bg-[#00cec9]/8 blur-[40px] pointer-events-none" />

                {/* Progress ring + percentage */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="relative w-16 h-16 shrink-0">
                    <svg viewBox="0 0 56 56" className="w-16 h-16 -rotate-90">
                      <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="4" />
                      <circle
                        cx="28" cy="28" r="24" fill="none"
                        stroke="url(#overallGrad)"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray={`${overallPercent * 1.508} 150.8`}
                        className="transition-all duration-1000"
                      />
                      <defs>
                        <linearGradient id="overallGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#6c5ce7" />
                          <stop offset="100%" stopColor="#00cec9" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-foreground" style={{ fontSize: '1.125rem', fontWeight: 800 }}>
                        {overallPercent}
                        <span className="text-ui-tertiary" style={{ fontSize: '0.625rem' }}>%</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-muted-foreground" style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.04em' }}>
                      {t('goals_overview_progress').toUpperCase()}
                    </p>
                    <p className="text-foreground mt-0.5" style={{ fontSize: '0.8125rem' }}>
                      <span style={{ fontWeight: 700 }}>{overallDone}</span>
                      <span className="text-ui-tertiary">/{overallTotal}</span>
                      <span className="text-ui-tertiary ml-1" style={{ fontSize: '0.6875rem' }}>
                        {t('gl_tasks')}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Quick stats row */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl p-2.5 text-center" style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}>
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Zap className="w-3 h-3 text-[#00cec9]" />
                      <span className="text-foreground" style={{ fontSize: '1.125rem', fontWeight: 800 }}>{totalActive}</span>
                    </div>
                    <p className="text-ui-tertiary" style={{ fontSize: '0.5625rem', fontWeight: 600 }}>{t('goals_overview_active')}</p>
                  </div>
                  <div className="rounded-xl p-2.5 text-center" style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}>
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Clock className="w-3 h-3 text-[#e17055]" />
                      <span className={`${totalDueSg > 0 ? 'text-[#e17055]' : 'text-foreground'}`} style={{ fontSize: '1.125rem', fontWeight: 800 }}>{totalDueSg}</span>
                    </div>
                    <p className="text-ui-tertiary" style={{ fontSize: '0.5625rem', fontWeight: 600 }}>{t('goals_overview_due')}</p>
                  </div>
                  <div className="rounded-xl p-2.5 text-center" style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}>
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Trophy className="w-3 h-3 text-emerald-400" />
                      <span className="text-foreground" style={{ fontSize: '1.125rem', fontWeight: 800 }}>{totalCompletedCount}</span>
                    </div>
                    <p className="text-ui-tertiary" style={{ fontSize: '0.5625rem', fontWeight: 600 }}>{t('goals_overview_completed')}</p>
                  </div>
                </div>
              </GlassCard>
            </motion.div>

            {/* ===== 1. ACTIVE PROGRAM — My Path ===== */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
              <div className="flex items-center gap-2 mb-2.5 px-1">
                <Rocket className="w-3.5 h-3.5 text-[#a29bfe]" />
                <p className="text-[#a29bfe]/70" style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                  {t('goals_my_path')}
                </p>
              </div>

              {activeProgram ? (
                <GlassCard
                  variant="elevated"
                  padding="md"
                  className="relative overflow-hidden"
                  onClick={() => { hapticFeedback('light'); navigate(`/day/${programProgress.currentDay}`); }}
                >
                  <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-[#6c5ce7]/10 blur-[40px] pointer-events-none" />
                  <div className="flex items-start gap-3.5">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                      progComplete
                        ? 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/20'
                        : 'bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe]'
                    }`}>
                      {progComplete ? (
                        <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                      ) : (
                        <Flame className="w-6 h-6 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground truncate" style={{ fontSize: '1rem', fontWeight: 700 }}>
                        {safeStr(activeProgram.title)}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {!progComplete ? (
                          <span className="text-muted-foreground" style={{ fontSize: '0.75rem' }}>
                            {t('goals_day_n', { n: programProgress.currentDay, total: programProgress.totalDays })}
                          </span>
                        ) : (
                          <span className="text-emerald-400/70" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                            {t('goals_completed_badge')}
                          </span>
                        )}
                        {programProgress.doneDays > 0 && !progComplete && (
                          <>
                            <span className="text-ui-tertiary">&middot;</span>
                            <span className="text-ui-tertiary" style={{ fontSize: '0.75rem' }}>
                              {progPercent}%
                            </span>
                          </>
                        )}
                      </div>
                      <div className="mt-2.5 h-1.5 rounded-full bg-ui-progress overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${progPercent}%` }}
                          transition={{ duration: 0.8, delay: 0.2 }}
                          className={`h-full rounded-full ${
                            progComplete
                              ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                              : 'bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe]'
                          }`}
                        />
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-ui-tertiary shrink-0 mt-1.5" />
                  </div>
                </GlassCard>
              ) : (
                <GlassCard
                  variant="interactive"
                  padding="md"
                  className="flex items-center gap-3.5 relative overflow-hidden"
                  onClick={() => { hapticFeedback('medium'); navigate('/plan-builder'); }}
                >
                  <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-[#6c5ce7]/6 blur-[30px] pointer-events-none" />
                  <div className="absolute top-2.5 right-2.5"><PremiumBadge /></div>
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6c5ce7]/20 to-[#a29bfe]/20 flex items-center justify-center shrink-0">
                    <Rocket className="w-5 h-5 text-[#a29bfe]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{t('goals_create_path')}</p>
                    <p className="text-muted-foreground" style={{ fontSize: '0.75rem' }}>{t('goals_start_program')}</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-ui-tertiary shrink-0" />
                </GlassCard>
              )}
            </motion.div>

            {/* ===== 1.5 MY TASKS ===== */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.055 }}>
              <div className="flex items-center justify-between mb-2.5 px-1">
                <div className="flex items-center gap-2">
                  <ListTodo className="w-3.5 h-3.5 text-[#e17055]" />
                  <p className="text-[#e17055]/70" style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                    {t('task_my_tasks')}
                  </p>
                  {userTasks.filter(t => t.status === 'todo').length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-md bg-[#e17055]/10 text-[#e17055]/60" style={{ fontSize: '0.625rem', fontWeight: 600 }}>
                      {t('task_pending', { n: userTasks.filter(t => t.status === 'todo').length })}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => { hapticFeedback('light'); setShowCreateTask(true); }}
                  className="text-[#e17055]/50 flex items-center gap-1"
                  style={{ fontSize: '0.75rem', fontWeight: 600 }}
                >
                  + {t('task_create')}
                </button>
              </div>

              {userTasks.length > 0 ? (
                <div className={isCompactCards() ? 'space-y-1' : 'space-y-1.5'}>
                  {userTasks.map((task, idx) => {
                    const isDone = task.status === 'done';
                    const compact = isCompactCards();
                    return (
                      <motion.div
                        key={task.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.06 + idx * 0.03 }}
                      >
                        <GlassCard variant="interactive" padding="sm" className="relative overflow-hidden">
                          <div className="flex items-center gap-3">
                            <motion.button
                              whileTap={{ scale: 0.8 }}
                              onClick={() => handleToggleTask(task)}
                              className={`${compact ? 'w-6 h-6' : 'w-7 h-7'} rounded-lg shrink-0 flex items-center justify-center border transition-all ${
                                isDone
                                  ? 'bg-emerald-500/20 border-emerald-500/40'
                                  : 'border-[#e17055]/30 bg-[#e17055]/10 active:bg-[#e17055]/20'
                              }`}
                            >
                              {isDone ? (
                                <CircleCheck className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-emerald-400`} />
                              ) : (
                                <div className={`${compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} rounded-sm border border-foreground/20`} />
                              )}
                            </motion.button>
                            <div className="flex-1 min-w-0">
                              <p className={`truncate ${isDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                                style={{ fontSize: compact ? '0.8125rem' : '0.875rem', fontWeight: 500 }}>
                                {task.title}
                              </p>
                              {!compact && task.description && (
                                <p className="text-ui-tertiary truncate mt-0.5" style={{ fontSize: '0.75rem' }}>
                                  {task.description}
                                </p>
                              )}
                            </div>
                            {!isDone && (
                              <motion.button
                                whileTap={{ scale: 0.85 }}
                                onClick={(e) => { e.stopPropagation(); handleToggleTaskReminder(task); }}
                                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                                  task.reminderEnabled
                                    ? 'bg-[#e17055]/15 border border-[#e17055]/25'
                                    : 'bg-ui-button'
                                }`}
                              >
                                {task.reminderEnabled ? (
                                  <Bell className="w-3.5 h-3.5 text-[#e17055]" />
                                ) : (
                                  <BellOff className="w-3.5 h-3.5 text-ui-tertiary" />
                                )}
                              </motion.button>
                            )}
                            <motion.button
                              whileTap={{ scale: 0.85 }}
                              onClick={(e) => { e.stopPropagation(); handleDeleteTask(task); }}
                              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-ui-button active:bg-red-500/15 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-ui-tertiary active:text-red-400" />
                            </motion.button>
                          </div>
                          {!compact && task.reminderEnabled && !isDone && task.reminderTime && (
                            <div className="mt-1.5 ml-10 flex items-center gap-1.5">
                              <Clock className="w-2.5 h-2.5 text-[#e17055]/50" />
                              <span className="text-[#e17055]/50" style={{ fontSize: '0.625rem', fontWeight: 600 }}>
                                {(() => {
                                  const today = new Date().toISOString().slice(0, 10);
                                  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
                                  const nextDate = task.nextReminderAt?.slice(0, 10) || task.reminderStartDate || today;
                                  const freqLabel = task.reminderFrequency === 'once' ? t('task_freq_once')
                                    : task.reminderFrequency === 'weekdays' ? t('task_freq_weekdays')
                                    : t('task_freq_daily');
                                  if (nextDate === today) return `${t('task_reminder_today', { time: task.reminderTime })} · ${freqLabel}`;
                                  if (nextDate === tomorrow) return `${t('task_reminder_tomorrow', { time: task.reminderTime })} · ${freqLabel}`;
                                  return `${t('task_next_reminder', { date: formatDate(nextDate), time: task.reminderTime })} · ${freqLabel}`;
                                })()}
                              </span>
                              <motion.button
                                whileTap={{ scale: 0.85 }}
                                onClick={(e) => { e.stopPropagation(); handleSendTestReminder(task); }}
                                className="ml-auto px-2 py-0.5 rounded-md bg-[#e17055]/10 border border-[#e17055]/20 text-[#e17055]/60 shrink-0"
                                style={{ fontSize: '0.5625rem', fontWeight: 600 }}
                              >
                                {t('task_send_now')}
                              </motion.button>
                            </div>
                          )}
                        </GlassCard>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <GlassCard variant="interactive" padding="md" className="flex items-center gap-3" onClick={() => { hapticFeedback('light'); setShowCreateTask(true); }}>
                  <div className="w-8 h-8 rounded-lg bg-[#e17055]/10 flex items-center justify-center shrink-0">
                    <ListTodo className="w-4 h-4 text-[#e17055]/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-muted-foreground" style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{t('task_no_tasks')}</p>
                    <p className="text-ui-tertiary" style={{ fontSize: '0.6875rem' }}>{t('task_from_note_hint')}</p>
                  </div>
                  <Plus className="w-3.5 h-3.5 text-ui-tertiary shrink-0" />
                </GlassCard>
              )}
            </motion.div>

            {/* ===== 2. STRATEGIC GOALS with inline due tasks ===== */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}>
              <div className="flex items-center justify-between mb-2.5 px-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-[#a29bfe]" />
                  <p className="text-[#a29bfe]/70" style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                    {t('goals_strategic')}
                  </p>
                  {strategicGoals.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-md bg-[#6c5ce7]/10 text-[#a29bfe]/60" style={{ fontSize: '0.625rem', fontWeight: 600 }}>
                      {strategicGoals.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => { hapticFeedback('light'); navigate('/strategic-goal/create'); }}
                  className="text-[#a29bfe]/50 flex items-center gap-1"
                  style={{ fontSize: '0.75rem', fontWeight: 600 }}
                >
                  + {t('sg_new_goal')}
                </button>
              </div>

              {strategicGoals.length > 0 ? (
                <div className={isCompactCards() ? 'space-y-1.5' : 'space-y-2'}>
                  {strategicGoals.map((sg, idx) => {
                    const pct = sg.taskCount > 0 ? Math.round((sg.totalCompleted / sg.taskCount) * 100) : 0;
                    const weeksElapsed = Math.max(1, Math.round((Date.now() - new Date(sg.createdAt).getTime()) / (7 * 86400000)));
                    const hasDue = sg.dueSoon > 0;
                    const dueTasks = sgDueTasks[sg.id] || [];
                    const compact = isCompactCards();

                    return (
                      <motion.div
                        key={sg.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.09 + idx * 0.04 }}
                      >
                        <GlassCard
                          variant={hasDue ? 'accent' : 'interactive'}
                          padding={compact ? 'sm' : 'md'}
                          className="relative overflow-hidden"
                          onClick={() => { hapticFeedback('light'); navigate(`/strategic-goal/${sg.id}`); }}
                        >
                          {hasDue && !compact && (
                            <div className="absolute top-0 right-0 w-20 h-20 rounded-full bg-[#e17055]/5 blur-[30px] pointer-events-none" />
                          )}
                          <div className={compact ? 'flex items-center gap-3' : 'flex items-start gap-3'}>
                            <div className={compact ? 'w-8 h-8 rounded-lg bg-gradient-to-br from-[#6c5ce7]/20 to-[#a29bfe]/20 flex items-center justify-center shrink-0' : 'w-10 h-10 rounded-xl bg-gradient-to-br from-[#6c5ce7]/20 to-[#a29bfe]/20 flex items-center justify-center shrink-0 mt-0.5'}>
                              <Sparkles className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-[#a29bfe]`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="text-foreground truncate flex-1" style={{ fontSize: compact ? '0.875rem' : '0.9375rem', fontWeight: 600 }}>
                                  {sg.title}
                                </p>
                                {hasDue && (
                                  <span className="shrink-0 px-2 py-0.5 rounded-full bg-[#e17055]/15 text-[#e17055]" style={{ fontSize: '0.625rem', fontWeight: 700 }}>
                                    {sg.dueSoon} {t('gl_due')}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-ui-tertiary" style={{ fontSize: '0.75rem' }}>
                                <span>{t('sg_progress_label', { done: sg.totalCompleted, total: sg.taskCount })}</span>
                                {!compact && <span className="text-ui-tertiary">&middot;</span>}
                                {!compact && <span>{t('sg_week_n', { n: weeksElapsed, total: sg.timelineWeeks })}</span>}
                              </div>
                              {!compact && sg.taskCount > 0 && (
                                <div className="mt-2 h-1.5 rounded-full bg-ui-progress overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${pct}%` }}
                                    transition={{ duration: 0.6, delay: 0.3 + idx * 0.1 }}
                                    className="h-full rounded-full bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe]"
                                  />
                                </div>
                              )}
                            </div>
                            <ChevronRight className="w-4 h-4 text-ui-tertiary shrink-0 mt-1.5" />
                          </div>

                          {/* Inline due tasks — swipe-to-complete */}
                          {dueTasks.length > 0 && (
                            <div className="mt-3 pt-2.5 border-t border-[var(--glass-border-subtle)]" onClick={(e) => e.stopPropagation()}>
                              <p className="text-[#e17055]/70 mb-2" style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                                {t('sg_due_tasks_today').toUpperCase()}
                              </p>
                              <div className="space-y-1.5">
                                {dueTasks.slice(0, 3).map(task => {
                                  const isDone = sgCompletedIds.has(task.id);
                                  const isCompleting = sgCompletingId === task.id;
                                  return (
                                    <SwipeableTask
                                      key={task.id}
                                      taskId={task.id}
                                      isDone={isDone}
                                      isCompleting={isCompleting}
                                      onComplete={() => handleSgTaskComplete(task.id, sg.id)}
                                      xpAmount={sgXpAmount}
                                      compact
                                    >
                                      <div className="flex items-center gap-2.5 py-1.5 px-1 bg-[#0a0a0f]/60 rounded-xl relative">
                                        <motion.button
                                          whileTap={{ scale: 0.85 }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSgTaskComplete(task.id, sg.id);
                                          }}
                                          disabled={isDone || isCompleting}
                                          className={`w-6 h-6 rounded-md shrink-0 flex items-center justify-center border transition-all ${
                                            isDone
                                              ? 'bg-emerald-500/20 border-emerald-500/40'
                                              : 'border-[#a29bfe]/30 bg-[#6c5ce7]/10 active:bg-[#6c5ce7]/25'
                                          }`}
                                        >
                                          {isCompleting ? (
                                            <Loader2 className="w-3 h-3 text-[#a29bfe] animate-spin" />
                                          ) : isDone ? (
                                            <Check className="w-3 h-3 text-emerald-400" />
                                          ) : (
                                            <Check className="w-3 h-3 text-[#a29bfe]/40" />
                                          )}
                                        </motion.button>
                                        <p className={`flex-1 min-w-0 truncate ${isDone ? 'text-ui-tertiary line-through' : 'text-muted-foreground'}`}
                                          style={{ fontSize: '0.8125rem' }}>
                                          {task.title}
                                        </p>
                                        <span className="text-ui-tertiary shrink-0 pr-1" style={{ fontSize: '0.5625rem' }}>
                                          {task.frequency === 'weekly' ? t('sg_weekly') : t('sg_monthly')}
                                        </span>
                                        <XpBurst show={sgXpBurstId === task.id} amount={sgXpAmount} />
                                      </div>
                                    </SwipeableTask>
                                  );
                                })}
                                {dueTasks.length > 3 && (
                                  <p className="text-ui-tertiary pl-8" style={{ fontSize: '0.6875rem' }}>
                                    +{dueTasks.length - 3} more...
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </GlassCard>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <GlassCard
                  variant="interactive"
                  padding="md"
                  className="flex items-center gap-3 relative overflow-hidden"
                  onClick={() => { hapticFeedback('medium'); navigate('/strategic-goal/create'); }}
                >
                  <div className="absolute top-0 right-0 w-20 h-20 rounded-full bg-[#6c5ce7]/5 blur-[30px] pointer-events-none" />
                  <div className="absolute top-2.5 right-2.5"><PremiumBadge /></div>
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6c5ce7]/20 to-[#00cec9]/20 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-[#a29bfe]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{t('sg_title')}</p>
                    <p className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>{t('sg_empty_desc')}</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-ui-tertiary shrink-0" />
                </GlassCard>
              )}
            </motion.div>

            {/* ===== 3. PERSONAL GOALS ===== */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <div className="flex items-center justify-between mb-2.5 px-1">
                <div className="flex items-center gap-2">
                  <Target className="w-3.5 h-3.5 text-[#00cec9]" />
                  <p className="text-[#00cec9]/70" style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                    {t('goals_personal')}
                  </p>
                  {goals.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-md bg-[#00cec9]/10 text-[#00cec9]/60" style={{ fontSize: '0.625rem', fontWeight: 600 }}>
                      {goals.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => { hapticFeedback('light'); setShowCreate(true); }}
                  className="text-[#00cec9]/50 flex items-center gap-1"
                  style={{ fontSize: '0.75rem', fontWeight: 600 }}
                >
                  + {t('goals_create')}
                </button>
              </div>

              {/* Status filters */}
              <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
                {STATUS_FILTERS.map((f) => {
                  const isActive = statusFilter === f;
                  const label = f === '' ? t('goals_all')
                    : f === 'active' ? t('goals_active')
                    : f === 'done' ? t('goals_done')
                    : t('goals_archived');
                  return (
                    <button
                      key={f || 'all'}
                      onClick={() => { hapticFeedback('light'); setStatusFilter(f); }}
                      className={`shrink-0 px-3 py-1 rounded-full transition-all ${
                        isActive
                          ? 'bg-[#00cec9]/20 border border-[#00cec9]/40 text-foreground'
                          : 'bg-ui-button border border-[var(--glass-border)] text-muted-foreground'
                      }`}
                      style={{ fontSize: '0.75rem', fontWeight: isActive ? 600 : 400 }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={statusFilter || '__all__'}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                >
                  {goals.length > 0 ? (
                    <div className={isCompactCards() ? 'space-y-1.5' : 'space-y-2'}>
                      {goals.map((goal, idx) => {
                        const style = STATUS_STYLES[goal.status] || STATUS_STYLES.active;
                        const Icon = style.icon;
                        const progress = goal.taskCount > 0
                          ? Math.round((goal.tasksDone / goal.taskCount) * 100)
                          : 0;
                        const compact = isCompactCards();

                        return (
                          <motion.div
                            key={goal.id}
                            initial={{ opacity: 0, x: -12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.04 }}
                          >
                            <GlassCard
                              variant="interactive"
                              padding={compact ? 'sm' : 'md'}
                              className={`flex items-center ${compact ? 'gap-3' : 'gap-3.5'}`}
                              onClick={() => { hapticFeedback('light'); navigate(`/goals/${goal.id}`); }}
                            >
                              <div className={`${compact ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl'} ${style.bg} flex items-center justify-center shrink-0`}>
                                <Icon className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} ${style.text}`} />
                              </div>

                              <div className="flex-1 min-w-0">
                                <p className={`truncate ${goal.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                                  style={{ fontSize: compact ? '0.875rem' : '0.9375rem', fontWeight: 600 }}>
                                  {goal.title}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {goal.taskCount > 0 && (
                                    <span className="text-ui-tertiary" style={{ fontSize: '0.75rem' }}>
                                      {t('goal_tasks_count', { done: goal.tasksDone, total: goal.taskCount })}
                                    </span>
                                  )}
                                  {!compact && goal.targetDate && (
                                    <span className="flex items-center gap-1 text-ui-tertiary" style={{ fontSize: '0.6875rem' }}>
                                      <Calendar className="w-3 h-3" />
                                      {new Date(goal.targetDate).toLocaleDateString(t('locale_code'))}
                                    </span>
                                  )}
                                </div>
                                {!compact && goal.taskCount > 0 && (
                                  <div className="mt-1.5 h-1 rounded-full bg-ui-progress overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-500 ${
                                        goal.status === 'done' ? 'bg-emerald-400/60' : 'bg-[#00cec9]/50'
                                      }`}
                                      style={{ width: `${progress}%` }}
                                    />
                                  </div>
                                )}
                              </div>

                              <ChevronRight className="w-4 h-4 text-ui-tertiary shrink-0" />
                            </GlassCard>
                          </motion.div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Target className="w-8 h-8 text-ui-tertiary mx-auto mb-2" />
                      <p className="text-ui-tertiary" style={{ fontSize: '0.8125rem' }}>{t('goals_empty')}</p>
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => { hapticFeedback('light'); setShowCreate(true); }}
                        className="mt-3 h-9 px-5 rounded-xl bg-[#00cec9]/15 border border-[#00cec9]/30 text-[#00cec9] flex items-center gap-1.5 mx-auto"
                        style={{ fontSize: '0.8125rem', fontWeight: 600 }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {t('goals_create')}
                      </motion.button>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </motion.div>

            {/* ===== 4. COMPLETED PROGRAMS HISTORY ===== */}
            {completedPrograms.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.13 }}>
                <div className="flex items-center justify-between mb-2.5 px-1">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-3.5 h-3.5 text-emerald-400/70" />
                    <p className="text-emerald-400/50" style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                      {t('goals_program_history')}
                    </p>
                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400/50" style={{ fontSize: '0.625rem', fontWeight: 600 }}>
                      {completedPrograms.length}
                    </span>
                  </div>
                  <button
                    onClick={() => { hapticFeedback('light'); navigate('/plan-history'); }}
                    className="text-emerald-400/40 flex items-center gap-1"
                    style={{ fontSize: '0.75rem', fontWeight: 600 }}
                  >
                    {t('goals_view_all_programs')} →
                  </button>
                </div>

                <div className="space-y-1.5">
                  {completedPrograms.slice(0, 4).map((prog, idx) => (
                    <motion.div
                      key={prog.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.16 + idx * 0.03 }}
                    >
                      <GlassCard
                        variant="interactive"
                        padding="sm"
                        className="flex items-center gap-3"
                        onClick={() => { hapticFeedback('light'); navigate('/plan-history'); }}
                      >
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400/60" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-muted-foreground truncate" style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                            {safeStr(prog.title)}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-ui-tertiary" style={{ fontSize: '0.6875rem' }}>
                              {t('goals_program_days', { n: prog.durationDays || '?' })}
                            </span>
                            {prog.createdAt && (
                              <>
                                <span className="text-ui-tertiary">&middot;</span>
                                <span className="text-ui-tertiary" style={{ fontSize: '0.6875rem' }}>
                                  {formatDate(prog.createdAt)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-ui-tertiary shrink-0" />
                      </GlassCard>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

          </div>
        )}
      </div>

      {/* Create Goal Bottom Sheet */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center"
            onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-lg rounded-t-3xl bg-liquid-glass glass-sheet glass-sheet-bottom p-6 pb-10"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-foreground" style={{ fontSize: '1.25rem', fontWeight: 700 }}>{t('goals_create')}</h2>
                <button onClick={() => setShowCreate(false)} className="w-8 h-8 rounded-lg bg-ui-button flex items-center justify-center">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={t('goal_title_placeholder')}
                autoFocus
                className="w-full h-12 rounded-xl bg-ui-button border border-[var(--glass-border)] px-4 text-foreground placeholder:text-ui-tertiary outline-none focus:border-[#00cec9]/40 transition-colors mb-3"
                style={{ fontSize: '0.9375rem' }}
              />

              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder={t('goal_desc_placeholder')}
                rows={3}
                className="w-full rounded-xl bg-ui-button border border-[var(--glass-border)] p-4 text-foreground placeholder:text-ui-tertiary outline-none focus:border-[#00cec9]/40 transition-colors resize-none mb-3"
                style={{ fontSize: '0.875rem', lineHeight: 1.5 }}
              />

              <div className="flex items-center gap-3 mb-5">
                <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="flex-1 h-10 rounded-xl bg-ui-button border border-[var(--glass-border)] px-3 text-muted-foreground outline-none focus:border-[#00cec9]/40 transition-colors"
                  style={{ fontSize: '0.8125rem', colorScheme: 'dark' }}
                />
              </div>

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleCreate}
                disabled={saving || !newTitle.trim()}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-[#00cec9] to-[#6c5ce7] text-white disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ fontSize: '0.9375rem', fontWeight: 600 }}
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('goals_create')}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Task Bottom Sheet */}
      <AnimatePresence>
        {showCreateTask && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center"
            onClick={(e) => { if (e.target === e.currentTarget) setShowCreateTask(false); }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-lg rounded-t-3xl bg-liquid-glass glass-sheet glass-sheet-bottom p-6 pb-10 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-foreground" style={{ fontSize: '1.25rem', fontWeight: 700 }}>{t('task_create_title')}</h2>
                <button onClick={() => setShowCreateTask(false)} className="w-8 h-8 rounded-lg bg-ui-button flex items-center justify-center">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder={t('task_title_placeholder')}
                autoFocus
                className="w-full h-12 rounded-xl bg-ui-button border border-[var(--glass-border)] px-4 text-foreground placeholder:text-ui-tertiary outline-none focus:border-[#e17055]/40 transition-colors mb-3"
                style={{ fontSize: '0.9375rem' }}
              />

              <textarea
                value={newTaskDesc}
                onChange={(e) => setNewTaskDesc(e.target.value)}
                placeholder={t('task_desc_placeholder')}
                rows={2}
                className="w-full rounded-xl bg-ui-button border border-[var(--glass-border)] p-4 text-foreground placeholder:text-ui-tertiary outline-none focus:border-[#e17055]/40 transition-colors resize-none mb-4"
                style={{ fontSize: '0.875rem', lineHeight: 1.5 }}
              />

              {/* Reminder section */}
              <div className="rounded-xl bg-[var(--glass-bg-row)] border border-[var(--glass-border)] p-4 mb-5">
                {/* Toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Bell className={newTaskReminder ? 'text-[#e17055]' : 'text-ui-tertiary'} style={{ width: 18, height: 18 }} />
                    <div>
                      <p className="text-foreground" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{t('task_reminder')}</p>
                      <p className="text-muted-foreground" style={{ fontSize: '0.6875rem' }}>
                        {newTaskReminder ? t('task_reminder_on') : t('task_reminder_off')}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      hapticFeedback('light');
                      const next = !newTaskReminder;
                      setNewTaskReminder(next);
                      if (next && !newTaskStartDate) {
                        setNewTaskStartDate(computeDefaultStartDate(newTaskReminderTime));
                      }
                    }}
                    className={`w-12 h-7 rounded-full transition-colors flex items-center px-0.5 ${
                      newTaskReminder ? 'bg-[#e17055]' : 'bg-ui-button'
                    }`}
                  >
                    <motion.div
                      animate={{ x: newTaskReminder ? 20 : 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className="w-6 h-6 rounded-full bg-white shadow-md"
                    />
                  </button>
                </div>

                <AnimatePresence>
                  {newTaskReminder && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-4 mt-3 border-t border-[var(--glass-border)] space-y-3">
                        {/* Time picker */}
                        <div className="flex items-center gap-3">
                          <Clock className="w-4 h-4 text-[#e17055]/60 shrink-0" />
                          <p className="text-muted-foreground flex-1" style={{ fontSize: '0.8125rem' }}>{t('task_reminder_time')}</p>
                          <input
                            type="time"
                            value={newTaskReminderTime}
                            onChange={(e) => {
                              setNewTaskReminderTime(e.target.value);
                              if (!newTaskStartDate || newTaskStartDate === computeDefaultStartDate(newTaskReminderTime)) {
                                setNewTaskStartDate(computeDefaultStartDate(e.target.value));
                              }
                            }}
                            className="h-9 px-3 rounded-lg bg-ui-button border border-[var(--glass-border)] text-foreground outline-none focus:border-[#e17055]/40"
                            style={{ fontSize: '0.875rem', colorScheme: 'dark' }}
                          />
                        </div>

                        {/* Start date */}
                        <div className="flex items-center gap-3">
                          <Calendar className="w-4 h-4 text-[#e17055]/60 shrink-0" />
                          <p className="text-muted-foreground flex-1" style={{ fontSize: '0.8125rem' }}>{t('task_start_date')}</p>
                          <input
                            type="date"
                            value={newTaskStartDate || computeDefaultStartDate(newTaskReminderTime)}
                            onChange={(e) => setNewTaskStartDate(e.target.value)}
                            min={new Date().toISOString().slice(0, 10)}
                            className="h-9 px-3 rounded-lg bg-ui-button border border-[var(--glass-border)] text-muted-foreground outline-none focus:border-[#e17055]/40"
                            style={{ fontSize: '0.8125rem', colorScheme: 'dark' }}
                          />
                        </div>

                        {/* Frequency pills */}
                        <div>
                          <p className="text-muted-foreground mb-2" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>{t('task_reminder_freq')}</p>
                          <div className="flex gap-2">
                            {(['daily', 'weekdays', 'once'] as const).map(f => (
                              <button
                                key={f}
                                onClick={() => { hapticFeedback('light'); setNewTaskFrequency(f); }}
                                className={`px-3.5 py-1.5 rounded-full transition-all ${
                                  newTaskFrequency === f
                                    ? 'bg-[#e17055]/20 border border-[#e17055]/40 text-foreground'
                                    : 'bg-ui-button border border-[var(--glass-border)] text-muted-foreground'
                                }`}
                                style={{ fontSize: '0.75rem', fontWeight: newTaskFrequency === f ? 600 : 400 }}
                              >
                                {f === 'daily' ? t('task_freq_daily') : f === 'weekdays' ? t('task_freq_weekdays') : t('task_freq_once')}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Preview: when first notification will come */}
                        <div className="rounded-lg bg-[#e17055]/5 border border-[#e17055]/10 px-3 py-2">
                          <p className="text-[#e17055]/70" style={{ fontSize: '0.6875rem', fontWeight: 500 }}>
                            🔔 {(() => {
                              const today = new Date().toISOString().slice(0, 10);
                              const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
                              const sd = newTaskStartDate || computeDefaultStartDate(newTaskReminderTime);
                              const base = sd === today
                                ? t('task_reminder_today', { time: newTaskReminderTime })
                                : sd === tomorrow
                                ? t('task_reminder_tomorrow', { time: newTaskReminderTime })
                                : t('task_next_reminder', { date: formatDate(sd), time: newTaskReminderTime });
                              const freqNote = newTaskFrequency === 'once'
                                ? ''
                                : newTaskFrequency === 'weekdays'
                                ? ` · ${t('task_freq_weekdays')}`
                                : ` · ${t('task_freq_daily')}`;
                              return base + freqNote;
                            })()}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleCreateTask}
                disabled={savingTask || !newTaskTitle.trim()}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-[#e17055] to-[#fab1a0] text-white disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ fontSize: '0.9375rem', fontWeight: 600 }}
              >
                {savingTask && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('task_create_title')}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task completion toast */}
      <AnimatePresence>
        {taskToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-2xl bg-liquid-glass-toast border border-emerald-500/25 flex items-center gap-2.5 shadow-2xl"
            style={{ boxShadow: '0 8px 32px rgba(16, 185, 129, 0.15)' }}
          >
            <CircleCheck className="text-emerald-400" style={{ width: 18, height: 18 }} />
            <span className="text-emerald-300 whitespace-nowrap" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{taskToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Strategic task completion toast */}
      <AnimatePresence>
        {sgToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-2xl bg-liquid-glass-toast border border-emerald-500/25 flex items-center gap-2.5 shadow-2xl"
            style={{ boxShadow: '0 8px 32px rgba(16, 185, 129, 0.15)' }}
          >
            <motion.div
              animate={{ scale: [1, 1.3, 1], rotate: [0, 10, -10, 0] }}
              transition={{ duration: 0.5 }}
            >
              <CheckCircle2 className="text-emerald-400" style={{ width: 18, height: 18 }} />
            </motion.div>
            <span className="text-emerald-300 whitespace-nowrap" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{sgToast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}