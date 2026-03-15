// =============================================
// Proper Food AI — Goal Detail (/goals/:id)
// =============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  Target,
  CheckCircle2,
  Circle,
  Trash2,
  Calendar,
  Clock,
  X,
  Loader2,
  Archive,
  RotateCcw,
  Check,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useBottomSheetLifecycle } from './bottom-sheet-context';
import { api } from './api-client';
import type { UserGoal, UserTask } from './api-client';
import { hapticFeedback, hapticSuccess } from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';

export function GoalDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useTranslation();

  const [goal, setGoal] = useState<UserGoal | null>(null);
  const [tasks, setTasks] = useState<UserTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddTask, setShowAddTask] = useState(false);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);

  // Hide tab bar when bottom sheet is open
  useBottomSheetLifecycle(showAddTask);

  // Add task form
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [taskMin, setTaskMin] = useState('');
  const [taskSaving, setTaskSaving] = useState(false);

  // Load goal + tasks
  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const [goalsRes, tasksRes] = await Promise.all([
        api.getGoals(),
        api.getTasks({ goalId: id }),
      ]);
      const found = goalsRes.goals.find((g) => g.id === id);
      if (found) setGoal(found);
      setTasks(tasksRes.tasks);
    } catch (err) {
      console.error('[GoalDetail] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Toggle task status
  const toggleTask = async (task: UserTask) => {
    hapticFeedback('light');
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    try {
      const updated = await api.updateTask(task.id, { status: newStatus });
      setTasks((prev) => prev.map((t) => t.id === task.id ? updated : t));
      if (newStatus === 'done') hapticSuccess();
      // Refresh goal counts
      const goalsRes = await api.getGoals();
      const found = goalsRes.goals.find((g) => g.id === id);
      if (found) setGoal(found);
    } catch (err) {
      console.error('[GoalDetail] Toggle task error:', err);
    }
  };

  // Delete task
  const handleDeleteTask = async (taskId: string) => {
    hapticFeedback('medium');
    try {
      await api.deleteTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setDeleteTaskId(null);
      // Refresh goal counts
      const goalsRes = await api.getGoals();
      const found = goalsRes.goals.find((g) => g.id === id);
      if (found) setGoal(found);
    } catch (err) {
      console.error('[GoalDetail] Delete task error:', err);
    }
  };

  // Create task
  const handleAddTask = async () => {
    if (!taskTitle.trim() || !id) return;
    setTaskSaving(true);
    hapticFeedback('light');
    try {
      await api.createTask({
        title: taskTitle.trim(),
        description: taskDesc.trim() || undefined,
        goalId: id,
        dueDate: taskDue || undefined,
        estimatedMinutes: taskMin ? Number(taskMin) : undefined,
      });
      hapticSuccess();
      setTaskTitle('');
      setTaskDesc('');
      setTaskDue('');
      setTaskMin('');
      setShowAddTask(false);
      loadData();
    } catch (err) {
      console.error('[GoalDetail] Add task error:', err);
    } finally {
      setTaskSaving(false);
    }
  };

  // Goal actions
  const handleGoalStatusChange = async (newStatus: string) => {
    if (!id) return;
    hapticFeedback('medium');
    try {
      const updated = await api.updateGoal(id, { status: newStatus });
      setGoal(updated);
      if (newStatus === 'done') hapticSuccess();
    } catch (err) {
      console.error('[GoalDetail] Status change error:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-ui-tertiary animate-spin" />
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <Target className="w-10 h-10 text-ui-tertiary mb-3" />
        <p className="text-ui-secondary" style={{ fontSize: '0.9375rem' }}>Goal not found</p>
        <button
          onClick={() => navigate('/goals')}
          className="mt-4 text-[#00cec9]"
          style={{ fontSize: '0.9375rem' }}
        >
          Back to Goals
        </button>
      </div>
    );
  }

  const todoTasks = tasks.filter((t) => t.status === 'todo');
  const doneTasks = tasks.filter((t) => t.status === 'done');
  const progress = goal.taskCount > 0 ? Math.round((goal.tasksDone / goal.taskCount) * 100) : 0;

  return (
    <div className="min-h-screen pb-28">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-[#00cec9]/10 blur-[100px]" />
        <div className="absolute bottom-1/4 -left-16 w-48 h-48 rounded-full bg-[#6c5ce7]/8 blur-[80px]" />
      </div>

      <div className="relative z-10 px-5 pb-6" >
        {/* Header */}
        <PageHeader
          title={goal.title}
          subtitle={goal.targetDate ? new Date(goal.targetDate).toLocaleDateString(t('locale_code'), { day: 'numeric', month: 'long', year: 'numeric' }) : undefined}
        />

        {/* Progress */}
        {goal.taskCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="mb-6"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-ui-secondary" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                {t('goal_tasks_count', { done: goal.tasksDone, total: goal.taskCount })}
              </span>
              <span className="text-[#00cec9]" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                {progress}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-ui-progress overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
                className={`h-full rounded-full ${goal.status === 'done' ? 'bg-emerald-400/70' : 'bg-gradient-to-r from-[#00cec9] to-[#6c5ce7]'}`}
              />
            </div>
          </motion.div>
        )}

        {/* Goal actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex gap-2 mb-6"
        >
          {goal.status === 'active' && (
            <>
              <button
                onClick={() => handleGoalStatusChange('done')}
                className="flex-1 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center gap-2"
                style={{ fontSize: '0.8125rem', fontWeight: 600 }}
              >
                <Check className="w-4 h-4" />
                {t('goal_mark_done')}
              </button>
              <button
                onClick={() => handleGoalStatusChange('archived')}
                className="h-10 px-4 rounded-xl bg-ui-button border border-ui-button text-muted-foreground flex items-center justify-center gap-2"
                style={{ fontSize: '0.8125rem', fontWeight: 500 }}
              >
                <Archive className="w-3.5 h-3.5" />
                {t('goal_archive')}
              </button>
            </>
          )}
          {goal.status === 'done' && (
            <button
              onClick={() => handleGoalStatusChange('active')}
              className="flex-1 h-10 rounded-xl bg-[#00cec9]/10 border border-[#00cec9]/20 text-[#00cec9] flex items-center justify-center gap-2"
              style={{ fontSize: '0.8125rem', fontWeight: 600 }}
            >
              <RotateCcw className="w-4 h-4" />
              {t('goal_reopen')}
            </button>
          )}
          {goal.status === 'archived' && (
            <button
              onClick={() => handleGoalStatusChange('active')}
              className="flex-1 h-10 rounded-xl bg-[#00cec9]/10 border border-[#00cec9]/20 text-[#00cec9] flex items-center justify-center gap-2"
              style={{ fontSize: '0.8125rem', fontWeight: 600 }}
            >
              <RotateCcw className="w-4 h-4" />
              {t('goal_reopen')}
            </button>
          )}
        </motion.div>

        {/* Add task button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="flex items-center justify-between mb-4"
        >
          <h3 className="text-muted-foreground" style={{ fontSize: '0.8125rem', fontWeight: 600, letterSpacing: '0.05em' }}>
            TASKS
          </h3>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => { hapticFeedback('light'); setShowAddTask(true); }}
            className="h-8 px-3.5 rounded-lg bg-[#00cec9]/15 border border-[#00cec9]/25 text-[#00cec9] flex items-center gap-1.5"
            style={{ fontSize: '0.75rem', fontWeight: 600 }}
          >
            <Plus className="w-3.5 h-3.5" />
            {t('task_add')}
          </motion.button>
        </motion.div>

        {/* Tasks list */}
        {tasks.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-10">
            <Circle className="w-8 h-8 text-ui-tertiary mx-auto mb-2" />
            <p className="text-ui-tertiary" style={{ fontSize: '0.875rem' }}>{t('goal_no_tasks')}</p>
          </motion.div>
        ) : (
          <div className="space-y-1.5">
            {/* Todo tasks */}
            {todoTasks.map((task, idx) => (
              <TaskRow
                key={task.id}
                task={task}
                idx={idx}
                t={t}
                lang={lang}
                deleteTaskId={deleteTaskId}
                onToggle={() => toggleTask(task)}
                onDeleteToggle={(id) => {
                  hapticFeedback('light');
                  if (deleteTaskId === id) handleDeleteTask(id);
                  else setDeleteTaskId(id);
                }}
              />
            ))}

            {/* Done separator */}
            {doneTasks.length > 0 && todoTasks.length > 0 && (
              <div className="flex items-center gap-3 py-2 px-1">
                <div className="flex-1 h-px" style={{ background: 'var(--ui-separator)' }} />
                <span className="text-ui-tertiary" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>
                  {t('goals_done').toUpperCase()}
                </span>
                <div className="flex-1 h-px" style={{ background: 'var(--ui-separator)' }} />
              </div>
            )}

            {/* Done tasks */}
            {doneTasks.map((task, idx) => (
              <TaskRow
                key={task.id}
                task={task}
                idx={idx}
                t={t}
                lang={lang}
                deleteTaskId={deleteTaskId}
                onToggle={() => toggleTask(task)}
                onDeleteToggle={(id) => {
                  hapticFeedback('light');
                  if (deleteTaskId === id) handleDeleteTask(id);
                  else setDeleteTaskId(id);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add Task Bottom Sheet */}
      <AnimatePresence>
        {showAddTask && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center"
            onClick={(e) => { if (e.target === e.currentTarget) setShowAddTask(false); }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-lg rounded-t-3xl bg-liquid-glass glass-sheet glass-sheet-bottom p-6 pb-10"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-foreground" style={{ fontSize: '1.25rem', fontWeight: 700 }}>{t('task_add')}</h2>
                <button onClick={() => setShowAddTask(false)} className="w-8 h-8 rounded-lg bg-ui-close flex items-center justify-center">
                  <X className="w-4 h-4 text-ui-icon-secondary" />
                </button>
              </div>

              {/* Title */}
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder={t('task_title_placeholder')}
                autoFocus
                className="w-full h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] px-4 text-white placeholder:text-white/20 outline-none focus:border-[#00cec9]/40 transition-colors mb-3"
                style={{ fontSize: '0.9375rem' }}
              />

              {/* Description */}
              <textarea
                value={taskDesc}
                onChange={(e) => setTaskDesc(e.target.value)}
                placeholder={t('task_desc_placeholder')}
                rows={2}
                className="w-full rounded-xl bg-ui-button border border-ui-button p-4 text-foreground placeholder:text-ui-tertiary outline-none focus:border-[#00cec9]/40 transition-colors resize-none mb-3"
                style={{ fontSize: '0.875rem', lineHeight: 1.5 }}
              />

              {/* Due date + Est. minutes */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div>
                  <label className="text-ui-tertiary mb-1.5 block" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>
                    {t('task_due_date')}
                  </label>
                  <input
                    type="date"
                    value={taskDue}
                    onChange={(e) => setTaskDue(e.target.value)}
                    className="w-full h-10 rounded-xl bg-ui-button border border-ui-button px-3 text-muted-foreground outline-none focus:border-[#00cec9]/40 transition-colors"
                    style={{ fontSize: '0.8125rem', colorScheme: 'dark' }}
                  />
                </div>
                <div>
                  <label className="text-ui-tertiary mb-1.5 block" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>
                    {t('task_est_minutes')}
                  </label>
                  <input
                    type="number"
                    value={taskMin}
                    onChange={(e) => setTaskMin(e.target.value)}
                    placeholder="30"
                    min={1}
                    max={480}
                    className="w-full h-10 rounded-xl bg-ui-button border border-ui-button px-3 text-muted-foreground placeholder:text-ui-tertiary outline-none focus:border-[#00cec9]/40 transition-colors"
                    style={{ fontSize: '0.8125rem' }}
                  />
                </div>
              </div>

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleAddTask}
                disabled={taskSaving || !taskTitle.trim()}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-[#00cec9] to-[#6c5ce7] text-white disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ fontSize: '0.9375rem', fontWeight: 600 }}
              >
                {taskSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('task_add')}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- Task Row Component ----

function TaskRow({
  task,
  idx,
  t,
  lang,
  deleteTaskId,
  onToggle,
  onDeleteToggle,
}: {
  task: UserTask;
  idx: number;
  t: (key: string, params?: Record<string, string | number>) => string;
  lang: string;
  deleteTaskId: string | null;
  onToggle: () => void;
  onDeleteToggle: (id: string) => void;
}) {
  const isDone = task.status === 'done';

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.03 }}
    >
      <GlassCard padding="sm" className="relative group">
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <button onClick={onToggle} className="mt-0.5 shrink-0">
            {isDone ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <Circle className="w-5 h-5 text-ui-tertiary hover:text-ui-secondary transition-colors" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <p className={`${isDone ? 'line-through text-ui-tertiary' : 'text-ui-icon-primary'}`}
              style={{ fontSize: '0.9375rem', fontWeight: 500 }}>
              {task.title}
            </p>

            {task.description && (
              <p className="text-ui-tertiary mt-0.5" style={{ fontSize: '0.8125rem', lineHeight: 1.4 }}>
                {task.description.length > 100 ? task.description.slice(0, 100) + '...' : task.description}
              </p>
            )}

            <div className="flex items-center gap-3 mt-1">
              {task.dueDate && (
                <span className="flex items-center gap-1 text-ui-tertiary" style={{ fontSize: '0.6875rem' }}>
                  <Calendar className="w-3 h-3" />
                  {new Date(task.dueDate).toLocaleDateString(t('locale_code'), {
                    day: 'numeric', month: 'short',
                  })}
                </span>
              )}
              {task.estimatedMinutes && (
                <span className="flex items-center gap-1 text-ui-tertiary" style={{ fontSize: '0.6875rem' }}>
                  <Clock className="w-3 h-3" />
                  {task.estimatedMinutes}m
                </span>
              )}
            </div>
          </div>

          {/* Delete */}
          <button
            onClick={() => onDeleteToggle(task.id)}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all shrink-0 ${
              deleteTaskId === task.id
                ? 'bg-red-500/20 border border-red-500/30'
                : 'bg-white/[0.02] opacity-0 group-hover:opacity-100'
            }`}
          >
            <Trash2 className={`w-3.5 h-3.5 ${deleteTaskId === task.id ? 'text-red-400' : 'text-ui-tertiary'}`} />
          </button>
        </div>
      </GlassCard>
    </motion.div>
  );
}