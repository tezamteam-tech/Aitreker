// =============================================
// BECOME — Dashboard Hub (/home)
// =============================================
// Quick entry point into all sections:
//   1. Quick access grid (goals, coach, path, journal)
//   2. Quick actions (focus, note, voice)
//   3. Current program summary (compact)
//   4. My Tasks
//   5. Active challenges preview
//   6. Stats (streak, XP, done)
//   7. Journal insights teaser
//   8. Coach check-in / tip of the day
//   9. AI Coach tone
//   10. Wallet
// =============================================

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  CheckCircle2,
  Flame,
  ChevronRight,
  Wallet,
  Trophy,
  Volume2,
  Heart,
  Shield,
  Zap,
  Check,
  X,
  Sparkles,
  MessageCircle,
  Timer,
  PenLine,
  BookOpen,
  Loader2,
  Mic,
  Target,
  Bot,
  Brain,
  Swords,
  Rocket,
  Users,
  ListTodo,
  Bell,
  BellOff,
  Clock as ClockIcon,
  Calendar,
  Plus,
  CircleCheck,
  Trash2,
  ExternalLink,
  Share2,
  Pencil,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useBottomSheetLifecycle } from './bottom-sheet-context';
import { useAuth } from './auth-context';
import { api } from './api-client';
import type { Program, Progress } from './types';
import type { ChallengeWithMembers } from './types';
import type { UserTask } from './api-client';
import { playXpCoinSound } from './xp-sound';
import { hapticFeedback, hapticSelection, hapticSuccess } from './telegram';
import { useTranslation } from './i18n';
import { VoiceInput } from './voice-input';
import { AudioPlayer } from './audio-player';
import { VoiceNoteRecorder } from './voice-note-recorder';
import { XpStatsCard } from './animated-counter';
import { PremiumBadge } from './premium-gate';
import { PageHeader } from './page-header';

// Helper: find current user's member entry in challenge
function findMyMember(ch: ChallengeWithMembers, userId?: string) {
  if (!userId || !ch.members) return null;
  return ch.members.find(m => m.userId === userId) || null;
}

// ---- Tone config ----
const TONE_CONFIG: Record<string, { labelKey: string; emoji: string; icon: typeof Heart; color: string }> = {
  supportive: { labelKey: 'tone_supportive', emoji: '\uD83D\uDC9C', icon: Heart, color: 'text-[#a29bfe]' },
  strict: { labelKey: 'tone_strict', emoji: '\uD83D\uDD25', icon: Shield, color: 'text-[#e17055]' },
  hybrid: { labelKey: 'tone_hybrid', emoji: '\u26A1', icon: Zap, color: 'text-[#00cec9]' },
};

const GOAL_LABEL_KEYS: Record<string, string> = {
  focus: 'goal_focus',
  discipline: 'goal_discipline',
  confidence: 'goal_confidence',
  energy: 'goal_energy',
};

export function DashboardPage() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const { t, lang } = useTranslation();
  const [program, setProgram] = useState<Program | null>(null);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [wallet, setWallet] = useState({ starsBalance: 0, tonBalance: 0, starsReserved: 0, tonReserved: 0 });
  const [showToneMenu, setShowToneMenu] = useState(false);
  const toneRef = useRef<HTMLDivElement>(null);
  const [coachMsg, setCoachMsg] = useState<string | null>(null);
  const [weeklyNoteCount, setWeeklyNoteCount] = useState(0);

  // Challenges preview
  const [activeChallenges, setActiveChallenges] = useState<ChallengeWithMembers[]>([]);

  // Quick Note modal state
  const [showQuickNote, setShowQuickNote] = useState(false);
  const [quickNoteText, setQuickNoteText] = useState('');
  const [quickNoteSaving, setQuickNoteSaving] = useState(false);
  const [quickNoteAudioUrl, setQuickNoteAudioUrl] = useState<string | null>(null);
  const [quickNoteAudioUploading, setQuickNoteAudioUploading] = useState(false);

  // Voice note recorder modal
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);

  // "Create task from note" state
  const [savedNoteText, setSavedNoteText] = useState('');
  const [savedNoteId, setSavedNoteId] = useState<string | null>(null);
  const [showTaskFromNote, setShowTaskFromNote] = useState(false);
  const [taskFromNoteReminder, setTaskFromNoteReminder] = useState(true);
  const [taskFromNoteTime, setTaskFromNoteTime] = useState('09:00');
  const [taskFromNoteFrequency, setTaskFromNoteFrequency] = useState<'once' | 'daily' | 'weekdays'>('daily');
  const [taskFromNoteStartDate, setTaskFromNoteStartDate] = useState('');
  const [taskFromNoteSaving, setTaskFromNoteSaving] = useState(false);

  // ---- Standalone tasks on dashboard ----
  const [dashTasks, setDashTasks] = useState<UserTask[]>([]);
  const [showDashCreateTask, setShowDashCreateTask] = useState(false);
  const [dashNewTitle, setDashNewTitle] = useState('');
  const [dashNewDesc, setDashNewDesc] = useState('');
  const [dashNewReminder, setDashNewReminder] = useState(false);
  const [dashNewReminderTime, setDashNewReminderTime] = useState('09:00');
  const [dashNewFreq, setDashNewFreq] = useState<'once' | 'daily' | 'weekdays'>('daily');
  const [dashNewStartDate, setDashNewStartDate] = useState('');
  const [dashSavingTask, setDashSavingTask] = useState(false);
  const [dashTaskToast, setDashTaskToast] = useState<string | null>(null);
  const dashTaskToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Edit task modal state ----
  const [showDashEditTask, setShowDashEditTask] = useState(false);
  const [editingTask, setEditingTask] = useState<UserTask | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editReminder, setEditReminder] = useState(false);
  const [editReminderTime, setEditReminderTime] = useState('09:00');
  const [editFreq, setEditFreq] = useState<'once' | 'daily' | 'weekdays'>('daily');
  const [editStartDate, setEditStartDate] = useState('');
  const [dashEditSaving, setDashEditSaving] = useState(false);

  // Hide tab bar when any bottom sheet is open
  useBottomSheetLifecycle(showQuickNote || showVoiceRecorder || showTaskFromNote || showDashCreateTask || showDashEditTask);

  // Support banner dismiss state
  const [supportDismissed, setSupportDismissed] = useState(() => {
    try { return localStorage.getItem('become_support_dismissed') === '1'; } catch { return false; }
  });
  const dismissSupport = () => {
    setSupportDismissed(true);
    try { localStorage.setItem('become_support_dismissed', '1'); } catch {}
  };

  // Auto-compute default start date
  const computeDefaultStartDate = (time: string) => {
    const now = new Date();
    const [h, m] = time.split(':').map(Number);
    const todayStr = now.toISOString().slice(0, 10);
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const targetMins = h * 60 + m;
    if (targetMins > currentMins + 15) return todayStr;
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  };

  useEffect(() => {
    if (!user) return;
    Promise.all([api.getActiveProgram(), api.getProgress(), api.getWallet(), api.getTasks().catch(() => ({ tasks: [] }))])
      .then(([activeProgram, prog, w, tasksRes]) => {
        if (activeProgram) {
          setProgram(activeProgram);
        }
        setProgress(prog);
        setWallet(w);
        setDashTasks((tasksRes as any).tasks || []);
      })
      .catch((err) => {
        console.error('[Dashboard] Error loading data:', err);
      });
  }, [user?.language]);

  // Load challenges preview
  useEffect(() => {
    if (!user) return;
    api.getChallenges()
      .then((res) => {
        const active = (res || []).filter((c: ChallengeWithMembers) => c.status === 'active' && c.isMember);
        setActiveChallenges(active.slice(0, 3));
      })
      .catch(() => {});
  }, []);

  // Load coach check-in message
  useEffect(() => {
    api.coachCheckin()
      .then((res: any) => {
        if (res.message) setCoachMsg(res.message);
      })
      .catch(() => {});
  }, []);

  // Weekly journal note count
  useEffect(() => {
    api.getNotes({ limit: 20 })
      .then((res: any) => {
        const notes = res.notes || [];
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const recent = notes.filter((n: any) => new Date(n.createdAt).getTime() > weekAgo);
        setWeeklyNoteCount(recent.length);
      })
      .catch(() => {});
  }, []);

  // Close tone picker on outside click
  useEffect(() => {
    if (!showToneMenu) return;
    function handleClick(e: MouseEvent) {
      if (toneRef.current && !toneRef.current.contains(e.target as Node)) {
        setShowToneMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showToneMenu]);

  const handleToneChange = async (tone: string) => {
    hapticSelection();
    setShowToneMenu(false);
    try {
      await api.updateUser({ tone: tone as any });
      updateUser({ tone: tone as any });
      hapticSuccess();
    } catch (err) {
      console.error('[Dashboard] Tone update error:', err);
    }
  };

  // Safely resolve bilingual fields
  const safeStr = (val: any): string => {
    if (typeof val === 'string') return val;
    if (val && typeof val === 'object') return val[lang] || val.en || '';
    return '';
  };

  // Quick note handlers
  const handleQuickNoteSave = async () => {
    if (!quickNoteText.trim() && !quickNoteAudioUrl) return;
    setQuickNoteSaving(true);
    hapticFeedback('light');
    try {
      const note = await api.createNote({
        type: 'quick',
        contentText: quickNoteText.trim() || undefined,
        contentAudioUrl: quickNoteAudioUrl || undefined,
      });
      hapticSuccess();
      // Store note text for potential task creation
      const noteText = quickNoteText.trim();
      setSavedNoteText(noteText);
      setSavedNoteId(note?.id || null);
      setQuickNoteText('');
      setQuickNoteAudioUrl(null);
      setShowQuickNote(false);
      // Show "create task from note" prompt
      if (noteText) {
        setShowTaskFromNote(true);
      }
    } catch (err) {
      console.error('[Dashboard] Quick note error:', err);
    } finally {
      setQuickNoteSaving(false);
    }
  };

  const handleCreateTaskFromNote = async () => {
    if (!savedNoteText.trim()) return;
    setTaskFromNoteSaving(true);
    hapticFeedback('light');
    try {
      const startDate = taskFromNoteReminder
        ? (taskFromNoteStartDate || computeDefaultStartDate(taskFromNoteTime))
        : undefined;
      await api.createTask({
        title: savedNoteText.slice(0, 100),
        description: savedNoteText.length > 100 ? savedNoteText : undefined,
        reminderEnabled: taskFromNoteReminder,
        reminderTime: taskFromNoteReminder ? taskFromNoteTime : undefined,
        reminderFrequency: taskFromNoteReminder ? taskFromNoteFrequency : undefined,
        reminderStartDate: startDate,
        sourceNoteId: savedNoteId || undefined,
      });
      hapticSuccess();
      setShowTaskFromNote(false);
      setSavedNoteText('');
      setSavedNoteId(null);
      setTaskFromNoteFrequency('daily');
      setTaskFromNoteStartDate('');
    } catch (err) {
      console.error('[Dashboard] Task from note error:', err);
    } finally {
      setTaskFromNoteSaving(false);
    }
  };

  const handleQuickNoteAudioBlob = async (base64: string, mimeType: string) => {
    setQuickNoteAudioUploading(true);
    try {
      const res = await api.uploadNoteAudio(base64, mimeType);
      if (res.success && res.signedUrl) {
        setQuickNoteAudioUrl(res.signedUrl);
      }
    } catch (err) {
      console.error('[Dashboard] Audio upload error:', err);
    } finally {
      setQuickNoteAudioUploading(false);
    }
  };

  // ---- Dashboard task handlers ----
  const handleDashCreateTask = async () => {
    if (!dashNewTitle.trim()) return;
    setDashSavingTask(true);
    hapticFeedback('light');
    try {
      const startDate = dashNewReminder
        ? (dashNewStartDate || computeDefaultStartDate(dashNewReminderTime))
        : undefined;
      const created = await api.createTask({
        title: dashNewTitle.trim(),
        description: dashNewDesc.trim() || undefined,
        reminderEnabled: dashNewReminder,
        reminderTime: dashNewReminder ? dashNewReminderTime : undefined,
        reminderFrequency: dashNewReminder ? dashNewFreq : undefined,
        reminderStartDate: startDate,
      });
      hapticSuccess();
      setDashTasks(prev => [created, ...prev]);
      setDashNewTitle('');
      setDashNewDesc('');
      setDashNewReminder(false);
      setDashNewReminderTime('09:00');
      setDashNewFreq('daily');
      setDashNewStartDate('');
      setShowDashCreateTask(false);
      if (dashTaskToastTimer.current) clearTimeout(dashTaskToastTimer.current);
      setDashTaskToast(t('task_saved'));
      dashTaskToastTimer.current = setTimeout(() => setDashTaskToast(null), 2500);
    } catch (err) {
      console.error('[Dashboard] Create task error:', err);
    } finally {
      setDashSavingTask(false);
    }
  };

  const handleDashToggleTask = async (task: UserTask) => {
    const newStatus = task.status === 'todo' ? 'done' : 'todo';
    hapticFeedback('medium');
    try {
      const updated = await api.updateTask(task.id, { status: newStatus });
      hapticSuccess();
      setDashTasks(prev => prev.map(t => t.id === task.id ? updated : t));
      if (newStatus === 'done') {
        playXpCoinSound();
        if (dashTaskToastTimer.current) clearTimeout(dashTaskToastTimer.current);
        setDashTaskToast(t('task_completed'));
        dashTaskToastTimer.current = setTimeout(() => setDashTaskToast(null), 2500);
      }
    } catch (err) {
      console.error('[Dashboard] Toggle task error:', err);
    }
  };

  const handleDashDeleteTask = async (task: UserTask) => {
    hapticFeedback('medium');
    try {
      await api.deleteTask(task.id);
      hapticSuccess();
      setDashTasks(prev => prev.filter(t => t.id !== task.id));
      if (dashTaskToastTimer.current) clearTimeout(dashTaskToastTimer.current);
      setDashTaskToast(t('task_deleted'));
      dashTaskToastTimer.current = setTimeout(() => setDashTaskToast(null), 2500);
    } catch (err) {
      console.error('[Dashboard] Delete task error:', err);
    }
  };

  const openEditTask = (task: UserTask) => {
    hapticFeedback('light');
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDesc(task.description || '');
    setEditReminder(task.reminderEnabled);
    setEditReminderTime(task.reminderTime || '09:00');
    setEditFreq(task.reminderFrequency || 'daily');
    setEditStartDate(task.reminderStartDate || '');
    setShowDashEditTask(true);
  };

  const handleDashSaveEditTask = async () => {
    if (!editingTask || !editTitle.trim()) return;
    setDashEditSaving(true);
    hapticFeedback('light');
    try {
      const startDate = editReminder
        ? (editStartDate || computeDefaultStartDate(editReminderTime))
        : undefined;
      const updated = await api.updateTask(editingTask.id, {
        title: editTitle.trim(),
        description: editDesc.trim() || '',
        reminderEnabled: editReminder,
        reminderTime: editReminderTime,
        reminderFrequency: editFreq,
        reminderStartDate: startDate || '',
      } as any);
      hapticSuccess();
      setDashTasks(prev => prev.map(tk => tk.id === editingTask.id ? updated : tk));
      setShowDashEditTask(false);
      setEditingTask(null);
      if (dashTaskToastTimer.current) clearTimeout(dashTaskToastTimer.current);
      setDashTaskToast(t('task_updated'));
      dashTaskToastTimer.current = setTimeout(() => setDashTaskToast(null), 2500);
    } catch (err) {
      console.error('[Dashboard] Edit task error:', err);
    } finally {
      setDashEditSaving(false);
    }
  };

  const handleDeleteFromEdit = async () => {
    if (!editingTask) return;
    setShowDashEditTask(false);
    setEditingTask(null);
    await handleDashDeleteTask(editingTask);
  };

  // Computed stats
  const totalDays = program?.durationDays ?? 7;
  const completedDays = progress.filter((p) => p.status === 'done').length;
  const streakDays = progress.reduce((max, p, _, arr) => {
    let streak = 0;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].status === 'done') streak++;
      else break;
    }
    return Math.max(max, streak);
  }, 0);
  const progressPercent = totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;
  const currentDay = Math.min(completedDays + progress.filter(p => p.status === 'skip').length + 1, totalDays);
  const isComplete = completedDays >= totalDays;

  const currentTone = TONE_CONFIG[user?.tone || 'supportive'] || TONE_CONFIG.supportive;

  return (
    <div className="min-h-screen pb-28">
      {/* Background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-[#6c5ce7]/15 blur-[100px]" />
        <div className="absolute top-1/3 -left-20 w-40 h-40 rounded-full bg-[#00cec9]/10 blur-[80px]" />
      </div>

      <div className="relative z-10 px-5 pb-6" style={{ paddingTop: 'var(--safe-area-top, 56px)' }}>
        {/* Header */}
        <PageHeader
          title={user?.firstName ?? t('explorer')}
          subtitle={t(`greeting_${getGreeting()}`)}
        />

        {/* 🎉 Support the project banner — dismissible */}
        <AnimatePresence>
          {!supportDismissed && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: 'hidden' }}
              transition={{ duration: 0.3 }}
              className="mb-5"
            >
              <div className="relative rounded-2xl border border-[#fd79a8]/20 bg-liquid-glass p-4 overflow-hidden">
                {/* Glow */}
                <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-[#fd79a8]/10 blur-[40px] pointer-events-none" />
                <div className="absolute -bottom-8 -left-8 w-20 h-20 rounded-full bg-[#6c5ce7]/10 blur-[30px] pointer-events-none" />

                {/* Dismiss X */}
                <button
                  onClick={(e) => { e.stopPropagation(); hapticFeedback('light'); dismissSupport(); }}
                  className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center z-10"
                >
                  <X className="w-3 h-3 text-white/30" />
                </button>

                <div className="relative z-[1]">
                  <p className="text-white pr-6" style={{ fontSize: '0.9375rem', fontWeight: 700 }}>
                    {t('support_title')}
                  </p>
                  <p className="text-white/40 mt-1.5 leading-relaxed" style={{ fontSize: '0.8125rem' }}>
                    {t('support_desc')}
                  </p>
                  <div className="flex items-center gap-2.5 mt-3.5">
                    <a
                      href={`https://t.me/dozorir?text=${encodeURIComponent('Спасибо за BECOME как можно поддержать проект?')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        hapticFeedback('medium');
                        try {
                          const tgApp = (window as any).Telegram?.WebApp;
                          if (tgApp?.openTelegramLink) {
                            tgApp.openTelegramLink(`https://t.me/dozorir?text=${encodeURIComponent('Спасибо за BECOME как можно поддержать проект?')}`);
                          }
                        } catch (_) {}
                      }}
                      className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-gradient-to-r from-[#fd79a8] to-[#6c5ce7] text-white active:scale-[0.97] transition-transform"
                      style={{ fontSize: '0.8125rem', fontWeight: 600, boxShadow: '0 4px 20px rgba(253,121,168,0.25), 0 2px 8px rgba(108,92,231,0.2)' }}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {t('support_btn')}
                    </a>
                    <button
                      onClick={() => {
                        hapticFeedback('medium');
                        const referralLink = user?.referralCode
                          ? `https://t.me/BECOMEAI_BOT?start=ref_${user.referralCode}`
                          : '';
                        if (!referralLink) return;
                        const shareText = `${t('bonus_share_text')}\n\n${referralLink}`;
                        const tgShareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(t('bonus_share_text'))}`;
                        try {
                          const tgApp = (window as any).Telegram?.WebApp;
                          if (tgApp?.openTelegramLink) {
                            tgApp.openTelegramLink(tgShareUrl);
                            return;
                          }
                        } catch (_) {}
                        if (navigator.share) {
                          navigator.share({ text: shareText }).catch(() => {});
                        } else {
                          navigator.clipboard?.writeText(shareText).catch(() => {});
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white/50 active:bg-white/[0.1] active:scale-[0.97] transition-all"
                      style={{ fontSize: '0.8125rem', fontWeight: 600 }}
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      {t('support_share_btn')}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 1. Quick access grid — entry points to sections */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }} className="mb-4">
          <div className="flex items-center gap-2 mb-2.5 px-1">
            <Zap className="w-3 h-3 text-white/25" />
            <p className="text-white/25" style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.06em' }}>{t('home_quick_access')}</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <GlassCard variant="interactive" padding="md" className="relative overflow-hidden" onClick={() => { hapticFeedback('medium'); navigate('/goals'); }}>
              <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-[#00cec9]/8 blur-[25px] pointer-events-none" />
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00cec9]/20 to-[#6c5ce7]/20 flex items-center justify-center mb-2.5"><Target style={{ width: 18, height: 18 }} className="text-[#00cec9]" /></div>
              <p className="text-white" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{t('home_goals_entry')}</p>
              <p className="text-white/25 mt-0.5" style={{ fontSize: '0.6875rem' }}>{t('home_goals_desc')}</p>
            </GlassCard>
            <GlassCard variant="interactive" padding="md" className="relative overflow-hidden" onClick={() => { hapticFeedback('medium'); navigate('/coach'); }}>
              <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-[#6c5ce7]/8 blur-[25px] pointer-events-none" />
              <div className="absolute top-2.5 right-2.5"><PremiumBadge /></div>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6c5ce7]/25 to-[#00cec9]/20 flex items-center justify-center mb-2.5"><Bot style={{ width: 18, height: 18 }} className="text-[#a29bfe]" /></div>
              <p className="text-white" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{t('coach_chat_title')}</p>
              <p className="text-white/25 mt-0.5" style={{ fontSize: '0.6875rem' }}>{t('coach_chat_subtitle')}</p>
            </GlassCard>
            <GlassCard variant="interactive" padding="md" className="relative overflow-hidden" onClick={() => { hapticFeedback('medium'); navigate('/plan-builder'); }}>
              <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-[#a29bfe]/8 blur-[25px] pointer-events-none" />
              <div className="absolute top-2.5 right-2.5"><PremiumBadge /></div>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6c5ce7]/20 to-[#a29bfe]/20 flex items-center justify-center mb-2.5"><Sparkles style={{ width: 18, height: 18 }} className="text-[#a29bfe]" /></div>
              <p className="text-white" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{t('home_create_path')}</p>
              <p className="text-white/25 mt-0.5" style={{ fontSize: '0.6875rem' }}>{t('home_create_path_desc')}</p>
            </GlassCard>
            <GlassCard variant="interactive" padding="md" className="relative overflow-hidden" onClick={() => { hapticFeedback('medium'); navigate('/journal'); }}>
              <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-[#fd79a8]/6 blur-[25px] pointer-events-none" />
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#a29bfe]/20 to-[#fd79a8]/20 flex items-center justify-center mb-2.5"><BookOpen style={{ width: 18, height: 18 }} className="text-[#a29bfe]" /></div>
              <p className="text-white" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{t('journal_title')}</p>
              <p className="text-white/25 mt-0.5" style={{ fontSize: '0.6875rem' }}>{t('journal_subtitle')}</p>
            </GlassCard>
          </div>
        </motion.div>

        {/* 2. Quick actions row: Focus Timer + Quick Note + Voice Note */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.07 }}
          className="grid grid-cols-3 gap-2.5 mb-5"
        >
          <GlassCard
            variant="interactive"
            padding="sm"
            className="flex flex-col items-center gap-1.5 py-3.5"
            onClick={() => { hapticFeedback('medium'); navigate('/focus'); }}
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00cec9]/20 to-[#6c5ce7]/20 flex items-center justify-center">
              <Timer className="text-[#00cec9]" style={{ width: 18, height: 18 }} />
            </div>
            <p className="text-white text-center" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
              {t('focus_dashboard_btn')}
            </p>
          </GlassCard>

          <GlassCard
            variant="interactive"
            padding="sm"
            className="flex flex-col items-center gap-1.5 py-3.5"
            onClick={() => { hapticFeedback('medium'); setShowQuickNote(true); }}
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-yellow-400/20 to-[#fd79a8]/20 flex items-center justify-center">
              <PenLine className="text-yellow-400" style={{ width: 18, height: 18 }} />
            </div>
            <p className="text-white text-center" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
              {t('note_quick_btn')}
            </p>
          </GlassCard>

          <GlassCard
            variant="interactive"
            padding="sm"
            className="flex flex-col items-center gap-1.5 py-3.5"
            onClick={() => { hapticFeedback('medium'); setShowVoiceRecorder(true); }}
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00cec9]/20 to-[#fd79a8]/20 flex items-center justify-center">
              <Mic className="text-[#00cec9]" style={{ width: 18, height: 18 }} />
            </div>
            <p className="text-white text-center" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
              {t('voice_note_btn')}
            </p>
          </GlassCard>
        </motion.div>

        {/* 3. Current program — compact card OR "no program" CTA */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-4"
        >
          <div className="flex items-center gap-2 mb-2 px-1">
            <Rocket className="w-3 h-3 text-[#a29bfe]/60" />
            <p className="text-[#a29bfe]/50" style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.06em' }}>
              {t('home_your_program')}
            </p>
          </div>

          {program ? (
            <GlassCard
              variant="elevated"
              padding="md"
              className="relative overflow-hidden"
              onClick={() => { hapticFeedback('light'); navigate(`/day/${currentDay}`); }}
            >
              <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-[#6c5ce7]/10 blur-[40px] pointer-events-none" />
              <div className="flex items-center gap-3.5">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  isComplete
                    ? 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/20'
                    : 'bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe]'
                }`}>
                  {isComplete ? (
                    <CheckCircle2 className="text-emerald-400" style={{ width: 22, height: 22 }} />
                  ) : (
                    <Play className="w-5 h-5 text-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white truncate" style={{ fontSize: '0.9375rem', fontWeight: 700 }}>
                    {safeStr(program.title)}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-white/40" style={{ fontSize: '0.75rem' }}>
                      {t('day_x_of_y', { current: currentDay, total: totalDays })}
                    </span>
                    <span className="text-white/10">&middot;</span>
                    <span className="text-white/25" style={{ fontSize: '0.75rem' }}>
                      {progressPercent}%
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-2 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPercent}%` }}
                      transition={{ duration: 0.8, delay: 0.2 }}
                      className={`h-full rounded-full ${
                        isComplete
                          ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                          : 'bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe]'
                      }`}
                    />
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
              </div>
            </GlassCard>
          ) : (
            <GlassCard
              variant="interactive"
              padding="md"
              className="relative overflow-hidden border border-dashed border-white/[0.08]"
              onClick={() => { hapticFeedback('medium'); navigate('/plan-builder'); }}
            >
              <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-[#6c5ce7]/8 blur-[30px] pointer-events-none" />
              <div className="absolute top-2.5 right-2.5"><PremiumBadge /></div>
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#6c5ce7]/15 to-[#a29bfe]/15 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-[#a29bfe]/60" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white/70" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                    {t('home_no_program_title')}
                  </p>
                  <p className="text-white/25 mt-0.5" style={{ fontSize: '0.75rem' }}>
                    {t('home_no_program_desc')}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-white/15 shrink-0" />
              </div>
            </GlassCard>
          )}
        </motion.div>

        {/* 4. My Tasks section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.13 }}
          className="mb-4"
        >
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex items-center gap-2">
              <ListTodo className="w-3 h-3 text-[#e17055]/60" />
              <p className="text-[#e17055]/50" style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                {t('task_my_tasks')}
              </p>
              {dashTasks.filter(t => t.status === 'todo').length > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-[#e17055]/10 text-[#e17055]/60" style={{ fontSize: '0.5625rem', fontWeight: 600 }}>
                  {dashTasks.filter(t => t.status === 'todo').length}
                </span>
              )}
            </div>
            <button
              onClick={() => { hapticFeedback('light'); setShowDashCreateTask(true); }}
              className="flex items-center gap-1 text-[#e17055]/50"
              style={{ fontSize: '0.75rem', fontWeight: 600 }}
            >
              <Plus className="w-3 h-3" /> {t('task_create')}
            </button>
          </div>

          {dashTasks.length > 0 ? (
            <div className="space-y-1.5">
              {dashTasks.map((task, idx) => {
                const isDone = task.status === 'done';
                return (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.04 + idx * 0.03 }}
                  >
                    <GlassCard variant="interactive" padding="sm" className="relative overflow-hidden">
                      <div className="flex items-center gap-3">
                        {/* Checkbox — toggle complete */}
                        <motion.button
                          whileTap={{ scale: 0.8 }}
                          onClick={(e) => { e.stopPropagation(); handleDashToggleTask(task); }}
                          className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center border transition-all ${
                            isDone
                              ? 'bg-emerald-500/20 border-emerald-500/40'
                              : 'border-[#e17055]/30 bg-[#e17055]/10 active:bg-[#e17055]/20'
                          }`}
                        >
                          {isDone ? (
                            <CircleCheck className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <div className="w-3 h-3 rounded-sm border border-white/20" />
                          )}
                        </motion.button>

                        {/* Main body — tap to edit */}
                        <button
                          className="flex-1 min-w-0 text-left"
                          onClick={() => !isDone && openEditTask(task)}
                        >
                          <p className={`truncate ${isDone ? 'line-through text-white/30' : 'text-white'}`}
                            style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                            {task.title}
                          </p>
                          {task.description ? (
                            <p className="text-white/25 truncate mt-0.5" style={{ fontSize: '0.75rem' }}>
                              {task.description}
                            </p>
                          ) : !isDone ? (
                            <p className="text-white/15 mt-0.5" style={{ fontSize: '0.6875rem' }}>
                              {t('task_tap_to_edit')}
                            </p>
                          ) : null}
                        </button>

                        {/* Reminder badge */}
                        {task.reminderEnabled && !isDone && task.reminderTime && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Bell className="w-3 h-3 text-[#e17055]/40" />
                            <span className="text-[#e17055]/40" style={{ fontSize: '0.5625rem', fontWeight: 600 }}>
                              {task.reminderTime}
                            </span>
                          </div>
                        )}

                        {/* Edit icon (active tasks only) */}
                        {!isDone && (
                          <motion.button
                            whileTap={{ scale: 0.85 }}
                            onClick={(e) => { e.stopPropagation(); openEditTask(task); }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-white/[0.03] active:bg-[#e17055]/10 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5 text-white/20" />
                          </motion.button>
                        )}

                        {/* Delete (done tasks) */}
                        {isDone && (
                          <motion.button
                            whileTap={{ scale: 0.85 }}
                            onClick={(e) => { e.stopPropagation(); handleDashDeleteTask(task); }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-white/[0.03] active:bg-red-500/15 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-white/15" />
                          </motion.button>
                        )}
                      </div>
                    </GlassCard>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <GlassCard
              variant="interactive"
              padding="md"
              className="flex items-center gap-3"
              onClick={() => { hapticFeedback('light'); setShowDashCreateTask(true); }}
            >
              <div className="w-8 h-8 rounded-lg bg-[#e17055]/10 flex items-center justify-center shrink-0">
                <ListTodo className="w-4 h-4 text-[#e17055]/60" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/50" style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{t('task_no_tasks')}</p>
                <p className="text-white/20" style={{ fontSize: '0.6875rem' }}>{t('task_from_note_hint')}</p>
              </div>
              <Plus className="w-3.5 h-3.5 text-white/15 shrink-0" />
            </GlassCard>
          )}
        </motion.div>

        {/* 5. Active challenges preview */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.155 }}
          className="mb-5"
        >
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex items-center gap-2">
              <Swords className="w-3 h-3 text-[#e17055]/60" />
              <p className="text-[#e17055]/50" style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                {t('home_active_challenges')}
              </p>
              {activeChallenges.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-[#e17055]/10 text-[#e17055]/60" style={{ fontSize: '0.5625rem', fontWeight: 600 }}>
                  {activeChallenges.length}
                </span>
              )}
            </div>
            <button
              onClick={() => { hapticFeedback('light'); navigate('/challenges'); }}
              className="text-[#e17055]/40"
              style={{ fontSize: '0.75rem', fontWeight: 600 }}
            >
              {t('goals_all')} →
            </button>
          </div>

          {activeChallenges.length > 0 ? (
            <div className="space-y-1.5">
              {activeChallenges.map((ch) => {
                const daysLeft = Math.max(0, Math.ceil((new Date(ch.endAt).getTime() - Date.now()) / 86400000));
                const totalElapsed = Math.max(1, Math.ceil((Date.now() - new Date(ch.startAt).getTime()) / 86400000));
                const myMember = findMyMember(ch, user?.id);
                const myDone = myMember?.doneDays ?? 0;
                const myStreak = myMember?.streak ?? 0;
                const myPct = ch.durationDays > 0 ? Math.round((myDone / ch.durationDays) * 100) : 0;

                return (
                  <GlassCard
                    key={ch.id}
                    variant="interactive"
                    padding="sm"
                    className="relative overflow-hidden"
                    onClick={() => { hapticFeedback('light'); navigate(`/challenges/${ch.id}`); }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-[#e17055]/10 flex items-center justify-center shrink-0">
                        <Swords className="w-4 h-4 text-[#e17055]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white truncate" style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                          {ch.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="flex items-center gap-1 text-white/25" style={{ fontSize: '0.6875rem' }}>
                            <Users className="w-3 h-3" /> {ch.memberCount}
                          </span>
                          <span className="text-white/10">&middot;</span>
                          <span className="text-white/20" style={{ fontSize: '0.6875rem' }}>
                            {daysLeft} {lang === 'ru' ? 'дн.' : 'd left'}
                          </span>
                          {myStreak > 1 && (
                            <>
                              <span className="text-white/10">&middot;</span>
                              <span className="flex items-center gap-0.5 text-orange-400/60" style={{ fontSize: '0.6875rem' }}>
                                <Flame className="w-2.5 h-2.5" /> {myStreak}
                              </span>
                            </>
                          )}
                        </div>
                        {/* User progress bar */}
                        {myMember && ch.durationDays > 0 && (
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="flex-1 h-1 rounded-full bg-white/[0.04] overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${myPct}%` }}
                                transition={{ duration: 0.6, delay: 0.2 }}
                                className="h-full rounded-full bg-gradient-to-r from-[#e17055] to-[#fab1a0]"
                              />
                            </div>
                            <span className="text-white/20 shrink-0" style={{ fontSize: '0.5625rem', fontWeight: 600 }}>
                              {myDone}/{ch.durationDays}
                            </span>
                          </div>
                        )}
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-white/10 shrink-0" />
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          ) : (
            <GlassCard
              variant="interactive"
              padding="md"
              className="flex items-center gap-3"
              onClick={() => { hapticFeedback('light'); navigate('/challenges'); }}
            >
              <div className="w-9 h-9 rounded-lg bg-[#e17055]/10 flex items-center justify-center shrink-0">
                <Swords className="w-4 h-4 text-[#e17055]/60" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/50" style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                  {t('home_no_challenges')}
                </p>
                <p className="text-white/20" style={{ fontSize: '0.6875rem' }}>
                  {t('home_view_challenges')}
                </p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-white/10 shrink-0" />
            </GlassCard>
          )}
        </motion.div>

        {/* 6. Stats row — streak / XP / done */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.17 }}
          className="grid grid-cols-3 gap-3 mb-5"
        >
          <GlassCard padding="sm" className="text-center">
            <Flame className="w-5 h-5 text-orange-400 mx-auto mb-1" />
            <p className="text-white" style={{ fontSize: '1.25rem', fontWeight: 700 }}>{streakDays}</p>
            <p className="text-white/40" style={{ fontSize: '0.6875rem' }}>{t('streak')}</p>
          </GlassCard>
          <GlassCard padding="sm" className="text-center overflow-visible">
            <XpStatsCard xp={user?.xp ?? 0}>
              <p className="text-white/40" style={{ fontSize: '0.6875rem' }}>{t('xp')}</p>
            </XpStatsCard>
          </GlassCard>
          <GlassCard padding="sm" className="text-center">
            <Trophy className="w-5 h-5 text-[#a29bfe] mx-auto mb-1" />
            <p className="text-white" style={{ fontSize: '1.25rem', fontWeight: 700 }}>{completedDays}</p>
            <p className="text-white/40" style={{ fontSize: '0.6875rem' }}>{t('done')}</p>
          </GlassCard>
        </motion.div>

        {/* 7. Weekly Journal Insights teaser */}
        {weeklyNoteCount >= 3 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.19 }}
            className="mb-4"
          >
            <GlassCard
              variant="interactive"
              padding="md"
              className="flex items-center gap-3.5 relative overflow-hidden"
              onClick={() => { hapticFeedback('medium'); navigate('/journal/insights'); }}
            >
              <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-[#fd79a8]/5 blur-[30px] pointer-events-none" />
              <div className="absolute top-2.5 right-2.5"><PremiumBadge /></div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#fd79a8]/20 to-[#6c5ce7]/20 flex items-center justify-center">
                <Brain className="w-5 h-5 text-[#fd79a8]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                  {t('insights_weekly_teaser')}
                </p>
                <p className="text-white/30" style={{ fontSize: '0.75rem' }}>
                  {t('insights_weekly_desc', { count: weeklyNoteCount })}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
            </GlassCard>
          </motion.div>
        )}

        {/* 8. Coach check-in message */}
        {coachMsg && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.21 }}
            className="mb-4"
          >
            <GlassCard variant="elevated" padding="md" className="relative overflow-hidden">
              <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-[#6c5ce7]/10 blur-[30px] pointer-events-none" />
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#6c5ce7]/15 flex items-center justify-center shrink-0 mt-0.5">
                  <MessageCircle className="text-[#a29bfe]" style={{ width: 18, height: 18 }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[#a29bfe]/70 mb-1" style={{ fontSize: '0.6275rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                    {t('pb_coach_checkin').toUpperCase()}
                  </p>
                  <p className="text-white/60" style={{ fontSize: '0.875rem', lineHeight: 1.55, fontStyle: 'italic' }}>
                    &ldquo;{coachMsg}&rdquo;
                  </p>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* 9. AI Coach Tone card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.23 }}
          className="mb-4"
          ref={toneRef}
        >
          <div className="relative">
            <GlassCard
              variant="interactive"
              padding="md"
              className="flex items-center gap-3.5"
              onClick={() => {
                hapticFeedback('light');
                setShowToneMenu((v) => !v);
              }}
            >
              <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center">
                <currentTone.icon className={`w-5 h-5 ${currentTone.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 500 }}>
                  {t('ai_coach_label')}: <span className={currentTone.color}>{currentTone.emoji} {t(currentTone.labelKey)}</span>
                </p>
                <p className="text-white/30" style={{ fontSize: '0.75rem' }}>
                  {t('tap_to_change_tone')}
                </p>
              </div>
              <Volume2 className="w-4 h-4 text-white/20 shrink-0" />
            </GlassCard>

            {/* Quick tone picker popover */}
            <AnimatePresence>
              {showToneMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="absolute top-full left-0 right-0 mt-2 rounded-2xl bg-liquid-glass-dropdown border border-white/[0.08] overflow-hidden z-50 shadow-2xl"
                  style={{ boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}
                >
                  {Object.entries(TONE_CONFIG).map(([key, config]) => {
                    const isActive = user?.tone === key;
                    return (
                      <button
                        key={key}
                        onClick={() => handleToneChange(key)}
                        className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                          isActive ? 'bg-[#6c5ce7]/10' : 'active:bg-white/[0.04]'
                        }`}
                      >
                        <span style={{ fontSize: '1.125rem' }}>{config.emoji}</span>
                        <span className={`flex-1 ${isActive ? 'text-white' : 'text-white/60'}`} style={{ fontSize: '0.9375rem', fontWeight: isActive ? 600 : 400 }}>
                          {t(config.labelKey)}
                        </span>
                        {isActive && <Check className="w-4 h-4 text-[#6c5ce7]" />}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* 10. Wallet card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <button
            onClick={() => { hapticFeedback('light'); navigate('/wallet'); }}
            className="w-full text-left active:scale-[0.98] transition-transform"
          >
            <GlassCard variant="elevated" className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-yellow-400/20 to-orange-400/20 flex items-center justify-center">
                <Wallet className="w-6 h-6 text-yellow-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{t('my_wallet')}</p>
                <p className="text-white/40" style={{ fontSize: '0.8125rem' }}>
                  {wallet.starsBalance} {t('stars')} &middot; {wallet.tonBalance} {t('ton')}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-white/30" />
            </GlassCard>
          </button>
        </motion.div>
      </div>

      {/* Quick Note Modal */}
      <AnimatePresence>
        {showQuickNote && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center"
            onClick={(e) => { if (e.target === e.currentTarget) setShowQuickNote(false); }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-lg rounded-t-3xl bg-liquid-glass glass-sheet glass-sheet-bottom p-6 pb-10"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white" style={{ fontSize: '1.25rem', fontWeight: 700 }}>{t('note_quick')}</h2>
                <button onClick={() => setShowQuickNote(false)} className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center">
                  <X className="w-4 h-4 text-white/40" />
                </button>
              </div>

              <textarea
                value={quickNoteText}
                onChange={(e) => setQuickNoteText(e.target.value)}
                placeholder={t('note_quick_placeholder')}
                rows={4}
                autoFocus
                className="w-full rounded-xl bg-white/[0.04] border border-white/[0.06] p-4 text-white placeholder:text-white/20 outline-none focus:border-[#6c5ce7]/40 transition-colors resize-none mb-3"
                style={{ fontSize: '0.9375rem', lineHeight: 1.6 }}
              />

              {/* Audio attachment indicator */}
              <AnimatePresence>
                {(quickNoteAudioUrl || quickNoteAudioUploading) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-3 overflow-hidden"
                  >
                    {quickNoteAudioUploading ? (
                      <div className="flex items-center gap-2 py-2 px-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                        <Loader2 className="w-3.5 h-3.5 text-[#a29bfe] animate-spin" />
                        <span className="text-[#a29bfe]/70" style={{ fontSize: '0.75rem' }}>{t('audio_uploading')}</span>
                      </div>
                    ) : quickNoteAudioUrl ? (
                      <div className="relative">
                        <AudioPlayer src={quickNoteAudioUrl} />
                        <button
                          onClick={() => setQuickNoteAudioUrl(null)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center"
                        >
                          <X className="w-3 h-3 text-red-400" />
                        </button>
                      </div>
                    ) : null}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center gap-3">
                <VoiceInput
                  onTranscript={(text) => setQuickNoteText((prev) => prev ? `${prev} ${text}` : text)}
                  onAudioBlob={handleQuickNoteAudioBlob}
                  language={lang}
                  size="sm"
                />
                <div className="flex-1" />
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleQuickNoteSave}
                  disabled={quickNoteSaving || (!quickNoteText.trim() && !quickNoteAudioUrl)}
                  className="h-11 px-6 rounded-xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white disabled:opacity-40 flex items-center gap-2"
                  style={{ fontSize: '0.9375rem', fontWeight: 600 }}
                >
                  {quickNoteSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t('journal_save')}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voice Note Recorder (standalone modal) */}
      <VoiceNoteRecorder
        open={showVoiceRecorder}
        onClose={() => setShowVoiceRecorder(false)}
        onSaved={() => {}}
        language={lang}
      />

      {/* "Create task from note" bottom sheet */}
      <AnimatePresence>
        {showTaskFromNote && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center"
            onClick={(e) => { if (e.target === e.currentTarget) { setShowTaskFromNote(false); setSavedNoteText(''); setSavedNoteId(null); } }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-lg rounded-t-3xl bg-liquid-glass glass-sheet glass-sheet-bottom p-6 pb-10"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#e17055]/15 flex items-center justify-center">
                    <ListTodo className="w-5 h-5 text-[#e17055]" />
                  </div>
                  <h2 className="text-white" style={{ fontSize: '1.125rem', fontWeight: 700 }}>{t('task_from_note')}</h2>
                </div>
                <button onClick={() => { setShowTaskFromNote(false); setSavedNoteText(''); setSavedNoteId(null); }} className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center">
                  <X className="w-4 h-4 text-white/40" />
                </button>
              </div>

              <p className="text-white/40 mb-4" style={{ fontSize: '0.8125rem' }}>
                {t('task_from_note_hint')}
              </p>

              {/* Preview of note text that will become task title */}
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3.5 mb-4">
                <p className="text-white" style={{ fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.5 }}>
                  {savedNoteText.length > 100 ? savedNoteText.slice(0, 100) + '…' : savedNoteText}
                </p>
              </div>

              {/* Reminder toggle */}
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 mb-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    {taskFromNoteReminder ? (
                      <Bell className="w-4 h-4 text-[#e17055]" />
                    ) : (
                      <BellOff className="w-4 h-4 text-white/25" />
                    )}
                    <div>
                      <p className="text-white" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{t('task_reminder')}</p>
                      <p className="text-white/30" style={{ fontSize: '0.6875rem' }}>
                        {taskFromNoteReminder ? t('task_reminder_on') : t('task_reminder_off')}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      hapticFeedback('light');
                      const next = !taskFromNoteReminder;
                      setTaskFromNoteReminder(next);
                      if (next && !taskFromNoteStartDate) {
                        setTaskFromNoteStartDate(computeDefaultStartDate(taskFromNoteTime));
                      }
                    }}
                    className={`w-12 h-7 rounded-full transition-colors flex items-center px-0.5 ${
                      taskFromNoteReminder ? 'bg-[#e17055]' : 'bg-white/[0.08]'
                    }`}
                  >
                    <motion.div
                      animate={{ x: taskFromNoteReminder ? 20 : 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className="w-6 h-6 rounded-full bg-white shadow-md"
                    />
                  </button>
                </div>

                <AnimatePresence>
                  {taskFromNoteReminder && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-4 mt-3 border-t border-white/[0.05] space-y-3">
                        {/* Time picker */}
                        <div className="flex items-center gap-3">
                          <ClockIcon className="w-4 h-4 text-[#e17055]/60 shrink-0" />
                          <p className="text-white/50 flex-1" style={{ fontSize: '0.8125rem' }}>{t('task_reminder_time')}</p>
                          <input
                            type="time"
                            value={taskFromNoteTime}
                            onChange={(e) => {
                              setTaskFromNoteTime(e.target.value);
                              if (!taskFromNoteStartDate || taskFromNoteStartDate === computeDefaultStartDate(taskFromNoteTime)) {
                                setTaskFromNoteStartDate(computeDefaultStartDate(e.target.value));
                              }
                            }}
                            className="h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white outline-none focus:border-[#e17055]/40"
                            style={{ fontSize: '0.875rem', colorScheme: 'dark' }}
                          />
                        </div>

                        {/* Start date */}
                        <div className="flex items-center gap-3">
                          <Calendar className="w-4 h-4 text-[#e17055]/60 shrink-0" />
                          <p className="text-white/50 flex-1" style={{ fontSize: '0.8125rem' }}>{t('task_start_date')}</p>
                          <input
                            type="date"
                            value={taskFromNoteStartDate || computeDefaultStartDate(taskFromNoteTime)}
                            onChange={(e) => setTaskFromNoteStartDate(e.target.value)}
                            min={new Date().toISOString().slice(0, 10)}
                            className="h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/60 outline-none focus:border-[#e17055]/40"
                            style={{ fontSize: '0.8125rem', colorScheme: 'dark' }}
                          />
                        </div>

                        {/* Frequency pills */}
                        <div>
                          <p className="text-white/30 mb-2" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>{t('task_reminder_freq')}</p>
                          <div className="flex gap-2">
                            {(['daily', 'weekdays', 'once'] as const).map(f => (
                              <button
                                key={f}
                                onClick={() => { hapticFeedback('light'); setTaskFromNoteFrequency(f); }}
                                className={`px-3.5 py-1.5 rounded-full transition-all ${
                                  taskFromNoteFrequency === f
                                    ? 'bg-[#e17055]/20 border border-[#e17055]/40 text-white'
                                    : 'bg-white/[0.04] border border-white/[0.06] text-white/40'
                                }`}
                                style={{ fontSize: '0.75rem', fontWeight: taskFromNoteFrequency === f ? 600 : 400 }}
                              >
                                {f === 'daily' ? t('task_freq_daily') : f === 'weekdays' ? t('task_freq_weekdays') : t('task_freq_once')}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Preview */}
                        <div className="rounded-lg bg-[#e17055]/5 border border-[#e17055]/10 px-3 py-2">
                          <p className="text-[#e17055]/70" style={{ fontSize: '0.6875rem', fontWeight: 500 }}>
                            🔔 {(() => {
                              const today = new Date().toISOString().slice(0, 10);
                              const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
                              const sd = taskFromNoteStartDate || computeDefaultStartDate(taskFromNoteTime);
                              const base = sd === today
                                ? t('task_reminder_today', { time: taskFromNoteTime })
                                : sd === tomorrow
                                ? t('task_reminder_tomorrow', { time: taskFromNoteTime })
                                : `${sd} ${lang === 'ru' ? 'в' : 'at'} ${taskFromNoteTime}`;
                              const freqNote = taskFromNoteFrequency === 'once'
                                ? ''
                                : taskFromNoteFrequency === 'weekdays'
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

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowTaskFromNote(false); setSavedNoteText(''); setSavedNoteId(null); }}
                  className="flex-1 h-12 rounded-xl bg-white/[0.06] text-white/60"
                  style={{ fontSize: '0.9375rem', fontWeight: 600 }}
                >
                  {lang === 'ru' ? 'Пропустить' : 'Skip'}
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleCreateTaskFromNote}
                  disabled={taskFromNoteSaving}
                  className="flex-1 h-12 rounded-xl bg-gradient-to-r from-[#e17055] to-[#fab1a0] text-white disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ fontSize: '0.9375rem', fontWeight: 600 }}
                >
                  {taskFromNoteSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t('task_from_note')}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== Create Task Bottom Sheet ===== */}
      <AnimatePresence>
        {showDashCreateTask && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center"
            onClick={(e) => { if (e.target === e.currentTarget) setShowDashCreateTask(false); }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-lg rounded-t-3xl bg-liquid-glass glass-sheet glass-sheet-bottom p-6 pb-10 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-white" style={{ fontSize: '1.25rem', fontWeight: 700 }}>{t('task_create_title')}</h2>
                <button onClick={() => setShowDashCreateTask(false)} className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center">
                  <X className="w-4 h-4 text-white/40" />
                </button>
              </div>

              <input
                type="text"
                value={dashNewTitle}
                onChange={(e) => setDashNewTitle(e.target.value)}
                placeholder={t('task_title_placeholder')}
                autoFocus
                className="w-full h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] px-4 text-white placeholder:text-white/20 outline-none focus:border-[#e17055]/40 transition-colors mb-3"
                style={{ fontSize: '0.9375rem' }}
              />

              <textarea
                value={dashNewDesc}
                onChange={(e) => setDashNewDesc(e.target.value)}
                placeholder={t('task_desc_placeholder')}
                rows={2}
                className="w-full rounded-xl bg-white/[0.04] border border-white/[0.06] p-4 text-white placeholder:text-white/20 outline-none focus:border-[#e17055]/40 transition-colors resize-none mb-4"
                style={{ fontSize: '0.875rem', lineHeight: 1.5 }}
              />

              {/* Reminder section */}
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 mb-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Bell className={dashNewReminder ? 'text-[#e17055]' : 'text-white/25'} style={{ width: 18, height: 18 }} />
                    <div>
                      <p className="text-white" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{t('task_reminder')}</p>
                      <p className="text-white/30" style={{ fontSize: '0.6875rem' }}>
                        {dashNewReminder ? t('task_reminder_on') : t('task_reminder_off')}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      hapticFeedback('light');
                      const next = !dashNewReminder;
                      setDashNewReminder(next);
                      if (next && !dashNewStartDate) {
                        setDashNewStartDate(computeDefaultStartDate(dashNewReminderTime));
                      }
                    }}
                    className={`w-12 h-7 rounded-full transition-colors flex items-center px-0.5 ${
                      dashNewReminder ? 'bg-[#e17055]' : 'bg-white/[0.08]'
                    }`}
                  >
                    <motion.div
                      animate={{ x: dashNewReminder ? 20 : 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className="w-6 h-6 rounded-full bg-white shadow-md"
                    />
                  </button>
                </div>

                <AnimatePresence>
                  {dashNewReminder && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-4 mt-3 border-t border-white/[0.05] space-y-3">
                        {/* Time picker */}
                        <div className="flex items-center gap-3">
                          <ClockIcon className="w-4 h-4 text-[#e17055]/60 shrink-0" />
                          <p className="text-white/50 flex-1" style={{ fontSize: '0.8125rem' }}>{t('task_reminder_time')}</p>
                          <input
                            type="time"
                            value={dashNewReminderTime}
                            onChange={(e) => {
                              setDashNewReminderTime(e.target.value);
                              if (!dashNewStartDate || dashNewStartDate === computeDefaultStartDate(dashNewReminderTime)) {
                                setDashNewStartDate(computeDefaultStartDate(e.target.value));
                              }
                            }}
                            className="h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white outline-none focus:border-[#e17055]/40"
                            style={{ fontSize: '0.875rem', colorScheme: 'dark' }}
                          />
                        </div>

                        {/* Start date */}
                        <div className="flex items-center gap-3">
                          <Calendar className="w-4 h-4 text-[#e17055]/60 shrink-0" />
                          <p className="text-white/50 flex-1" style={{ fontSize: '0.8125rem' }}>{t('task_start_date')}</p>
                          <input
                            type="date"
                            value={dashNewStartDate || computeDefaultStartDate(dashNewReminderTime)}
                            onChange={(e) => setDashNewStartDate(e.target.value)}
                            min={new Date().toISOString().slice(0, 10)}
                            className="h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/60 outline-none focus:border-[#e17055]/40"
                            style={{ fontSize: '0.8125rem', colorScheme: 'dark' }}
                          />
                        </div>

                        {/* Frequency pills */}
                        <div>
                          <p className="text-white/30 mb-2" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>{t('task_reminder_freq')}</p>
                          <div className="flex gap-2">
                            {(['daily', 'weekdays', 'once'] as const).map(f => (
                              <button
                                key={f}
                                onClick={() => { hapticFeedback('light'); setDashNewFreq(f); }}
                                className={`px-3.5 py-1.5 rounded-full transition-all ${
                                  dashNewFreq === f
                                    ? 'bg-[#e17055]/20 border border-[#e17055]/40 text-white'
                                    : 'bg-white/[0.04] border border-white/[0.06] text-white/40'
                                }`}
                                style={{ fontSize: '0.75rem', fontWeight: dashNewFreq === f ? 600 : 400 }}
                              >
                                {f === 'daily' ? t('task_freq_daily') : f === 'weekdays' ? t('task_freq_weekdays') : t('task_freq_once')}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Preview */}
                        <div className="rounded-lg bg-[#e17055]/5 border border-[#e17055]/10 px-3 py-2">
                          <p className="text-[#e17055]/70" style={{ fontSize: '0.6875rem', fontWeight: 500 }}>
                            {'\uD83D\uDD14'} {(() => {
                              const today = new Date().toISOString().slice(0, 10);
                              const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
                              const sd = dashNewStartDate || computeDefaultStartDate(dashNewReminderTime);
                              const base = sd === today
                                ? t('task_reminder_today', { time: dashNewReminderTime })
                                : sd === tomorrow
                                ? t('task_reminder_tomorrow', { time: dashNewReminderTime })
                                : `${sd} ${lang === 'ru' ? '\u0432' : 'at'} ${dashNewReminderTime}`;
                              const freqNote = dashNewFreq === 'once'
                                ? ''
                                : dashNewFreq === 'weekdays'
                                ? ` \u00B7 ${t('task_freq_weekdays')}`
                                : ` \u00B7 ${t('task_freq_daily')}`;
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
                onClick={handleDashCreateTask}
                disabled={dashSavingTask || !dashNewTitle.trim()}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-[#e17055] to-[#fab1a0] text-white disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ fontSize: '0.9375rem', fontWeight: 600 }}
              >
                {dashSavingTask && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('task_create_title')}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== Edit Task Bottom Sheet ===== */}
      <AnimatePresence>
        {showDashEditTask && editingTask && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center"
            onClick={(e) => { if (e.target === e.currentTarget) setShowDashEditTask(false); }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-lg rounded-t-3xl bg-liquid-glass glass-sheet glass-sheet-bottom p-6 pb-10 max-h-[90vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#e17055]/10 flex items-center justify-center">
                    <Pencil className="w-4 h-4 text-[#e17055]/70" />
                  </div>
                  <h2 className="text-white" style={{ fontSize: '1.25rem', fontWeight: 700 }}>{t('task_edit_title')}</h2>
                </div>
                <button onClick={() => setShowDashEditTask(false)} className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center">
                  <X className="w-4 h-4 text-white/40" />
                </button>
              </div>

              {/* Title */}
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder={t('task_title_placeholder')}
                autoFocus
                className="w-full h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] px-4 text-white placeholder:text-white/20 outline-none focus:border-[#e17055]/40 transition-colors mb-3"
                style={{ fontSize: '0.9375rem' }}
              />

              {/* Description */}
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder={t('task_desc_placeholder')}
                rows={2}
                className="w-full rounded-xl bg-white/[0.04] border border-white/[0.06] p-4 text-white placeholder:text-white/20 outline-none focus:border-[#e17055]/40 transition-colors resize-none mb-4"
                style={{ fontSize: '0.875rem', lineHeight: 1.5 }}
              />

              {/* Reminder */}
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 mb-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Bell className={editReminder ? 'text-[#e17055]' : 'text-white/25'} style={{ width: 18, height: 18 }} />
                    <div>
                      <p className="text-white" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{t('task_reminder')}</p>
                      <p className="text-white/30" style={{ fontSize: '0.6875rem' }}>
                        {editReminder ? t('task_reminder_on') : t('task_reminder_off')}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      hapticFeedback('light');
                      const next = !editReminder;
                      setEditReminder(next);
                      if (next && !editStartDate) {
                        setEditStartDate(computeDefaultStartDate(editReminderTime));
                      }
                    }}
                    className={`w-12 h-7 rounded-full transition-colors flex items-center px-0.5 ${
                      editReminder ? 'bg-[#e17055]' : 'bg-white/[0.08]'
                    }`}
                  >
                    <motion.div
                      animate={{ x: editReminder ? 20 : 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className="w-6 h-6 rounded-full bg-white shadow-md"
                    />
                  </button>
                </div>

                <AnimatePresence>
                  {editReminder && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-4 mt-3 border-t border-white/[0.05] space-y-3">
                        {/* Time */}
                        <div className="flex items-center gap-3">
                          <ClockIcon className="w-4 h-4 text-[#e17055]/60 shrink-0" />
                          <p className="text-white/50 flex-1" style={{ fontSize: '0.8125rem' }}>{t('task_reminder_time')}</p>
                          <input
                            type="time"
                            value={editReminderTime}
                            onChange={(e) => {
                              setEditReminderTime(e.target.value);
                              if (!editStartDate) setEditStartDate(computeDefaultStartDate(e.target.value));
                            }}
                            className="h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white outline-none focus:border-[#e17055]/40"
                            style={{ fontSize: '0.875rem', colorScheme: 'dark' }}
                          />
                        </div>

                        {/* Start date */}
                        <div className="flex items-center gap-3">
                          <Calendar className="w-4 h-4 text-[#e17055]/60 shrink-0" />
                          <p className="text-white/50 flex-1" style={{ fontSize: '0.8125rem' }}>{t('task_start_date')}</p>
                          <input
                            type="date"
                            value={editStartDate || computeDefaultStartDate(editReminderTime)}
                            onChange={(e) => setEditStartDate(e.target.value)}
                            min={new Date().toISOString().slice(0, 10)}
                            className="h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/60 outline-none focus:border-[#e17055]/40"
                            style={{ fontSize: '0.8125rem', colorScheme: 'dark' }}
                          />
                        </div>

                        {/* Frequency */}
                        <div>
                          <p className="text-white/30 mb-2" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>{t('task_reminder_freq')}</p>
                          <div className="flex gap-2">
                            {(['daily', 'weekdays', 'once'] as const).map(f => (
                              <button
                                key={f}
                                onClick={() => { hapticFeedback('light'); setEditFreq(f); }}
                                className={`px-3.5 py-1.5 rounded-full transition-all ${
                                  editFreq === f
                                    ? 'bg-[#e17055]/20 border border-[#e17055]/40 text-white'
                                    : 'bg-white/[0.04] border border-white/[0.06] text-white/40'
                                }`}
                                style={{ fontSize: '0.75rem', fontWeight: editFreq === f ? 600 : 400 }}
                              >
                                {f === 'daily' ? t('task_freq_daily') : f === 'weekdays' ? t('task_freq_weekdays') : t('task_freq_once')}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Preview */}
                        <div className="rounded-lg bg-[#e17055]/5 border border-[#e17055]/10 px-3 py-2">
                          <p className="text-[#e17055]/70" style={{ fontSize: '0.6875rem', fontWeight: 500 }}>
                            {'🔔 '}{(() => {
                              const today = new Date().toISOString().slice(0, 10);
                              const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
                              const sd = editStartDate || computeDefaultStartDate(editReminderTime);
                              const base = sd === today
                                ? t('task_reminder_today', { time: editReminderTime })
                                : sd === tomorrow
                                ? t('task_reminder_tomorrow', { time: editReminderTime })
                                : `${sd} ${lang === 'ru' ? 'в' : 'at'} ${editReminderTime}`;
                              const freqNote = editFreq === 'once'
                                ? ''
                                : editFreq === 'weekdays'
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

              {/* Save button */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleDashSaveEditTask}
                disabled={dashEditSaving || !editTitle.trim()}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-[#e17055] to-[#fab1a0] text-white disabled:opacity-40 flex items-center justify-center gap-2 mb-3"
                style={{ fontSize: '0.9375rem', fontWeight: 600 }}
              >
                {dashEditSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {t('task_save')}
              </motion.button>

              {/* Delete button */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleDeleteFromEdit}
                className="w-full h-11 rounded-xl bg-white/[0.03] border border-white/[0.06] text-red-400/70 flex items-center justify-center gap-2"
                style={{ fontSize: '0.875rem', fontWeight: 600 }}
              >
                <Trash2 className="w-4 h-4" />
                {t('task_delete_btn')}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dashboard task toast */}
      <AnimatePresence>
        {dashTaskToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-2xl bg-liquid-glass-toast border border-emerald-500/25 flex items-center gap-2.5 shadow-2xl"
            style={{ boxShadow: '0 8px 32px rgba(16, 185, 129, 0.15)' }}
          >
            <CircleCheck className="text-emerald-400" style={{ width: 18, height: 18 }} />
            <span className="text-emerald-300 whitespace-nowrap" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{dashTaskToast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'night';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}