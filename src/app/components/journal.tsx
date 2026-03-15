// =============================================
// Proper Food AI — Journal (/journal)
// =============================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Plus,
  Trash2,
  BookOpen,
  Zap,
  MessageCircle,
  X,
  Loader2,
  Mic,
  Brain,
  ListTodo,
  Bell,
  BellOff,
  Clock,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useBottomSheetLifecycle } from './bottom-sheet-context';
import { api } from './api-client';
import type { Note } from './api-client';
import { hapticFeedback, hapticSuccess } from './telegram';
import { useTranslation } from './i18n';
import { VoiceInput } from './voice-input';
import { AudioPlayer } from './audio-player';
import { VoiceNoteRecorder } from './voice-note-recorder';
import { PremiumBadge } from './premium-gate';
import { PageHeader } from './page-header';

const TYPE_FILTERS = ['', 'quick', 'voice', 'reflection', 'journal'] as const;

const TYPE_ICONS: Record<string, React.ElementType> = {
  quick: Zap,
  voice: Mic,
  reflection: MessageCircle,
  journal: BookOpen,
};

const TYPE_COLORS: Record<string, { text: string; bg: string }> = {
  quick: { text: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  voice: { text: 'text-[#00cec9]', bg: 'bg-[#00cec9]/10' },
  reflection: { text: 'text-[#fd79a8]', bg: 'bg-[#fd79a8]/10' },
  journal: { text: 'text-[#a29bfe]', bg: 'bg-[#a29bfe]/10' },
};

export function JournalPage() {
  const navigate = useNavigate();
  const { t, lang } = useTranslation();

  const [notes, setNotes] = useState<Note[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addText, setAddText] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Audio attachment state for add modal
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioUploading, setAudioUploading] = useState(false);

  // Voice note recorder modal
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);

  // "Create task from note" state
  const [taskNoteText, setTaskNoteText] = useState('');
  const [taskNoteId, setTaskNoteId] = useState<string | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskReminder, setTaskReminder] = useState(true);
  const [taskReminderTime, setTaskReminderTime] = useState('09:00');
  const [taskFrequency, setTaskFrequency] = useState<'once' | 'daily' | 'weekdays'>('daily');
  const [taskStartDate, setTaskStartDate] = useState('');
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskToast, setTaskToast] = useState<string | null>(null);

  // Hide tab bar when any bottom sheet is open
  useBottomSheetLifecycle(showAdd || showVoiceRecorder || showTaskModal);

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

  const handleCreateTaskFromNote = (note: Note) => {
    hapticFeedback('light');
    setTaskNoteText(note.contentText || '');
    setTaskNoteId(note.id);
    setTaskStartDate(computeDefaultStartDate(taskReminderTime));
    setShowTaskModal(true);
  };

  const handleSaveTask = async () => {
    if (!taskNoteText.trim()) return;
    setTaskSaving(true);
    hapticFeedback('light');
    try {
      const startDate = taskReminder
        ? (taskStartDate || computeDefaultStartDate(taskReminderTime))
        : undefined;
      await api.createTask({
        title: taskNoteText.slice(0, 100),
        description: taskNoteText.length > 100 ? taskNoteText : undefined,
        reminderEnabled: taskReminder,
        reminderTime: taskReminder ? taskReminderTime : undefined,
        reminderFrequency: taskReminder ? taskFrequency : undefined,
        reminderStartDate: startDate,
        sourceNoteId: taskNoteId || undefined,
      });
      hapticSuccess();
      setShowTaskModal(false);
      setTaskNoteText('');
      setTaskNoteId(null);
      setTaskFrequency('daily');
      setTaskStartDate('');
      setTaskToast(t('task_saved'));
      setTimeout(() => setTaskToast(null), 2500);
    } catch (err) {
      console.error('[Journal] Create task error:', err);
    } finally {
      setTaskSaving(false);
    }
  };

  // Load notes
  const loadNotes = useCallback(async () => {
    try {
      const res = await api.getNotes({
        type: typeFilter || undefined,
        search: search || undefined,
        limit: 100,
      });
      setNotes(res.notes);
      setTotal(res.total);
    } catch (err) {
      console.error('[Journal] Error loading notes:', err);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, search]);

  useEffect(() => {
    setLoading(true);
    const debounce = setTimeout(loadNotes, search ? 300 : 0);
    return () => clearTimeout(debounce);
  }, [loadNotes]);

  // Handle audio blob from VoiceInput — upload to storage
  const handleAudioBlob = useCallback(async (base64: string, mimeType: string) => {
    setAudioUploading(true);
    try {
      const res = await api.uploadNoteAudio(base64, mimeType);
      if (res.success && res.signedUrl) {
        setAudioUrl(res.signedUrl);
        console.log('[Journal] Audio uploaded:', res.signedUrl);
      }
    } catch (err) {
      console.error('[Journal] Audio upload error:', err);
    } finally {
      setAudioUploading(false);
    }
  }, []);

  // Save new journal entry
  const handleSave = async () => {
    if (!addText.trim() && !audioUrl) return;
    setAddSaving(true);
    hapticFeedback('light');
    try {
      await api.createNote({
        type: 'journal',
        contentText: addText.trim(),
        contentAudioUrl: audioUrl || undefined,
      });
      hapticSuccess();
      setAddText('');
      setAudioUrl(null);
      setShowAdd(false);
      loadNotes();
    } catch (err) {
      console.error('[Journal] Error saving note:', err);
    } finally {
      setAddSaving(false);
    }
  };

  // Delete note
  const handleDelete = async (noteId: string) => {
    hapticFeedback('medium');
    try {
      await api.deleteNote(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      setTotal((prev) => prev - 1);
      setDeleteId(null);
    } catch (err) {
      console.error('[Journal] Error deleting note:', err);
    }
  };

  // Reset modal state
  const openAdd = () => {
    setAddText('');
    setAudioUrl(null);
    setAudioUploading(false);
    setShowAdd(true);
    hapticFeedback('light');
  };

  // Group notes by date
  const grouped = groupByDate(notes, t, lang);

  return (
    <div className="min-h-screen pb-28">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-[#a29bfe]/10 blur-[100px]" />
        <div className="absolute bottom-1/3 -left-16 w-48 h-48 rounded-full bg-[#fd79a8]/8 blur-[80px]" />
      </div>

      <div className="relative z-10 px-5 pb-6" >
        {/* Header */}
        <PageHeader
          title={t('journal_title')}
          actions={
            <>
              <div className="relative">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => { hapticFeedback('light'); navigate('/journal/insights'); }}
                  className="w-9 h-9 rounded-xl bg-[#fd79a8]/20 border border-[#fd79a8]/30 flex items-center justify-center"
                  title={t('insights_btn')}
                >
                  <Brain className="w-5 h-5 text-[#fd79a8]" />
                </motion.button>
                <div className="absolute -top-1.5 -right-1.5"><PremiumBadge /></div>
              </div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => { hapticFeedback('light'); setShowVoiceRecorder(true); }}
                className="w-9 h-9 rounded-xl bg-[#00cec9]/20 border border-[#00cec9]/30 flex items-center justify-center"
              >
                <Mic className="w-5 h-5 text-[#00cec9]" />
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={openAdd}
                className="w-9 h-9 rounded-xl bg-[#6c5ce7]/20 border border-[#6c5ce7]/30 flex items-center justify-center"
              >
                <Plus className="w-5 h-5 text-[#a29bfe]" />
              </motion.button>
            </>
          }
        />

        {/* Search */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ui-tertiary" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('journal_search')}
              className="w-full h-11 rounded-xl bg-ui-button border border-ui-button pl-10 pr-4 text-foreground placeholder:text-ui-tertiary outline-none focus:border-[#6c5ce7]/40 transition-colors"
              style={{ fontSize: '0.875rem' }}
            />
          </div>
        </motion.div>

        {/* Type filters */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {TYPE_FILTERS.map((f) => {
            const isActive = typeFilter === f;
            const label = f === '' ? t('journal_filter_all') : t(`journal_filter_${f}`);
            return (
              <button
                key={f || 'all'}
                onClick={() => { hapticFeedback('light'); setTypeFilter(f); }}
                className={`shrink-0 px-4 py-1.5 rounded-full transition-all ${
                  isActive
                    ? 'bg-[#6c5ce7]/20 border border-[#6c5ce7]/40 text-foreground'
                    : 'bg-ui-button border border-ui-button text-muted-foreground'
                }`}
                style={{ fontSize: '0.8125rem', fontWeight: isActive ? 600 : 400 }}
              >
                {label}
              </button>
            );
          })}
        </motion.div>

        {/* Notes list grouped by date */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-ui-tertiary animate-spin" />
          </div>
        ) : notes.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
            <BookOpen className="w-10 h-10 text-ui-tertiary mx-auto mb-3" />
            <p className="text-ui-secondary" style={{ fontSize: '0.9375rem', fontWeight: 500 }}>{t('journal_empty')}</p>
            <p className="text-ui-tertiary mt-1" style={{ fontSize: '0.8125rem' }}>{t('journal_empty_desc')}</p>
          </motion.div>
        ) : (
          <div className="space-y-6">
            {grouped.map(({ label, items }) => (
              <div key={label}>
                <p className="text-ui-tertiary mb-2 px-1" style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.06em' }}>
                  {label.toUpperCase()}
                </p>
                <div className="space-y-2">
                  {items.map((note, idx) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      idx={idx}
                      t={t}
                      deleteId={deleteId}
                      onDeleteToggle={(id) => {
                        hapticFeedback('light');
                        if (deleteId === id) handleDelete(id);
                        else setDeleteId(id);
                      }}
                      onCreateTask={handleCreateTaskFromNote}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Journal Entry Modal */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center"
            onClick={(e) => { if (e.target === e.currentTarget) setShowAdd(false); }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-lg rounded-t-3xl bg-liquid-glass glass-sheet glass-sheet-bottom p-6 pb-10 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-foreground" style={{ fontSize: '1.25rem', fontWeight: 700 }}>{t('journal_add')}</h2>
                <button onClick={() => setShowAdd(false)} className="w-8 h-8 rounded-lg bg-ui-close flex items-center justify-center">
                  <X className="w-4 h-4 text-ui-icon-secondary" />
                </button>
              </div>

              <textarea
                value={addText}
                onChange={(e) => setAddText(e.target.value)}
                placeholder={t('journal_add_placeholder')}
                rows={5}
                autoFocus
                className="w-full rounded-xl bg-ui-button border border-ui-button p-4 text-foreground placeholder:text-ui-tertiary outline-none focus:border-[#6c5ce7]/40 transition-colors resize-none mb-3"
                style={{ fontSize: '0.9375rem', lineHeight: 1.6 }}
              />

              {/* Audio attachment indicator */}
              <AnimatePresence>
                {(audioUrl || audioUploading) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-3 overflow-hidden"
                  >
                    {audioUploading ? (
                      <div className="flex items-center gap-2 py-2 px-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                        <Loader2 className="w-3.5 h-3.5 text-[#a29bfe] animate-spin" />
                        <span className="text-[#a29bfe]/70" style={{ fontSize: '0.75rem' }}>{t('audio_uploading')}</span>
                      </div>
                    ) : audioUrl ? (
                      <div className="relative">
                        <AudioPlayer src={audioUrl} />
                        <button
                          onClick={() => setAudioUrl(null)}
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
                  onTranscript={(text) => setAddText((prev) => prev ? `${prev} ${text}` : text)}
                  onAudioBlob={handleAudioBlob}
                  language={lang}
                  size="sm"
                />
                <div className="flex-1" />
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSave}
                  disabled={addSaving || (!addText.trim() && !audioUrl) || audioUploading}
                  className="h-11 px-6 rounded-xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white disabled:opacity-40 flex items-center gap-2"
                  style={{ fontSize: '0.9375rem', fontWeight: 600 }}
                >
                  {addSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t('journal_save')}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voice Note Recorder Modal (self-contained) */}
      <VoiceNoteRecorder
        open={showVoiceRecorder}
        onClose={() => setShowVoiceRecorder(false)}
        onSaved={loadNotes}
        language={lang}
      />

      {/* Create Task Modal */}
      <AnimatePresence>
        {showTaskModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center"
            onClick={(e) => { if (e.target === e.currentTarget) setShowTaskModal(false); }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-lg rounded-t-3xl bg-liquid-glass glass-sheet glass-sheet-bottom p-6 pb-10 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#e17055]/15 flex items-center justify-center">
                    <ListTodo className="w-5 h-5 text-[#e17055]" />
                  </div>
                  <h2 className="text-foreground" style={{ fontSize: '1.125rem', fontWeight: 700 }}>{t('task_from_note')}</h2>
                </div>
                <button onClick={() => setShowTaskModal(false)} className="w-8 h-8 rounded-lg bg-ui-close flex items-center justify-center">
                  <X className="w-4 h-4 text-ui-icon-secondary" />
                </button>
              </div>

              {/* Note text preview / editable */}
              <div className="rounded-xl p-3.5 mb-4" style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}>
                <textarea
                  value={taskNoteText}
                  onChange={(e) => setTaskNoteText(e.target.value)}
                  rows={3}
                  className="w-full bg-transparent text-foreground outline-none resize-none placeholder:text-ui-tertiary"
                  style={{ fontSize: '0.875rem', lineHeight: 1.5 }}
                  placeholder={t('task_title')}
                />
              </div>

              {/* Reminder section */}
              <div className="rounded-xl p-4 mb-5" style={{ background: 'var(--glass-bg-row)', border: '1px solid var(--glass-border-subtle)' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    {taskReminder ? (
                      <Bell className="w-4 h-4 text-[#e17055]" />
                    ) : (
                      <BellOff className="w-4 h-4 text-white/25" />
                    )}
                    <div>
                      <p className="text-foreground" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{t('task_reminder')}</p>
                      <p className="text-ui-tertiary" style={{ fontSize: '0.6875rem' }}>
                        {taskReminder ? t('task_reminder_on') : t('task_reminder_off')}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      hapticFeedback('light');
                      const next = !taskReminder;
                      setTaskReminder(next);
                      if (next && !taskStartDate) {
                        setTaskStartDate(computeDefaultStartDate(taskReminderTime));
                      }
                    }}
                    className={`w-12 h-7 rounded-full transition-colors flex items-center px-0.5 ${
                      taskReminder ? 'bg-[#e17055]' : 'bg-[var(--switch-background)]'
                    }`}
                  >
                    <motion.div
                      animate={{ x: taskReminder ? 20 : 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className="w-6 h-6 rounded-full bg-white shadow-md"
                    />
                  </button>
                </div>

                <AnimatePresence>
                  {taskReminder && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-4 mt-3 space-y-3" style={{ borderTop: '1px solid var(--glass-border-subtle)' }}>
                        {/* Time */}
                        <div className="flex items-center gap-3">
                          <Clock className="w-4 h-4 text-[#e17055]/60 shrink-0" />
                          <p className="text-muted-foreground flex-1" style={{ fontSize: '0.8125rem' }}>{t('task_reminder_time')}</p>
                          <input
                            type="time"
                            value={taskReminderTime}
                            onChange={(e) => {
                              setTaskReminderTime(e.target.value);
                              if (!taskStartDate || taskStartDate === computeDefaultStartDate(taskReminderTime)) {
                                setTaskStartDate(computeDefaultStartDate(e.target.value));
                              }
                            }}
                            className="h-9 px-3 rounded-lg bg-ui-button border border-ui-button text-foreground outline-none focus:border-[#e17055]/40"
                            style={{ fontSize: '0.875rem', colorScheme: 'dark' }}
                          />
                        </div>

                        {/* Date */}
                        <div className="flex items-center gap-3">
                          <Clock className="w-4 h-4 text-[#e17055]/60 shrink-0" />
                          <p className="text-muted-foreground flex-1" style={{ fontSize: '0.8125rem' }}>{t('task_start_date')}</p>
                          <input
                            type="date"
                            value={taskStartDate || computeDefaultStartDate(taskReminderTime)}
                            onChange={(e) => setTaskStartDate(e.target.value)}
                            min={new Date().toISOString().slice(0, 10)}
                            className="h-9 px-3 rounded-lg bg-ui-button border border-ui-button text-muted-foreground outline-none focus:border-[#e17055]/40"
                            style={{ fontSize: '0.8125rem', colorScheme: 'dark' }}
                          />
                        </div>

                        {/* Frequency */}
                        <div>
                          <p className="text-ui-tertiary mb-2" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>{t('task_reminder_freq')}</p>
                          <div className="flex gap-2">
                            {(['daily', 'weekdays', 'once'] as const).map(f => (
                              <button
                                key={f}
                                onClick={() => { hapticFeedback('light'); setTaskFrequency(f); }}
                                className={`px-3.5 py-1.5 rounded-full transition-all ${
                                  taskFrequency === f
                                    ? 'bg-[#e17055]/20 border border-[#e17055]/40 text-foreground'
                                    : 'bg-ui-button border border-ui-button text-muted-foreground'
                                }`}
                                style={{ fontSize: '0.75rem', fontWeight: taskFrequency === f ? 600 : 400 }}
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
                              const sd = taskStartDate || computeDefaultStartDate(taskReminderTime);
                              const base = sd === today
                                ? t('task_reminder_today', { time: taskReminderTime })
                                : sd === tomorrow
                                ? t('task_reminder_tomorrow', { time: taskReminderTime })
                                : `${sd} ${t('date_at')} ${taskReminderTime}`;
                              const freqNote = taskFrequency === 'once'
                                ? ''
                                : taskFrequency === 'weekdays'
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
                onClick={handleSaveTask}
                disabled={taskSaving || !taskNoteText.trim()}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-[#e17055] to-[#fab1a0] text-white disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ fontSize: '0.9375rem', fontWeight: 600 }}
              >
                {taskSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('task_create_title')}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task toast */}
      <AnimatePresence>
        {taskToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-2xl bg-liquid-glass-toast border border-emerald-500/25 flex items-center gap-2.5 shadow-2xl"
          >
            <span className="text-emerald-300 whitespace-nowrap" style={{ fontSize: '0.875rem', fontWeight: 600 }}>✓ {taskToast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- Note Card with inline audio ----

function NoteCard({
  note,
  idx,
  t,
  deleteId,
  onDeleteToggle,
  onCreateTask,
}: {
  note: Note;
  idx: number;
  t: (key: string, params?: Record<string, string | number>) => string;
  deleteId: string | null;
  onDeleteToggle: (id: string) => void;
  onCreateTask: (note: Note) => void;
}) {
  const colors = TYPE_COLORS[note.type] || TYPE_COLORS.quick;
  const Icon = TYPE_ICONS[note.type] || Zap;
  const isDeletePending = deleteId === note.id;

  return (
    <motion.div
      key={note.id}
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.03 }}
    >
      <GlassCard padding="md">
        {/* Content area */}
        <div className="flex gap-3">
          <div className={`w-8 h-8 rounded-lg ${colors.bg} flex items-center justify-center shrink-0 mt-0.5`}>
            <Icon className={`w-4 h-4 ${colors.text}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`${colors.text}`} style={{ fontSize: '0.6875rem', fontWeight: 600 }}>
                {t(`note_type_${note.type}`)}
              </span>
              {note.relatedDayNumber != null && (
                <span className="text-ui-tertiary" style={{ fontSize: '0.625rem' }}>
                  &middot; {t('journal_day_ref', { day: note.relatedDayNumber })}
                </span>
              )}
              {note.contentAudioUrl && (
                <span className="flex items-center gap-1 text-[#a29bfe]/50" style={{ fontSize: '0.625rem' }}>
                  <Mic className="w-3 h-3" />
                </span>
              )}
              <span className="text-ui-tertiary ml-auto shrink-0" style={{ fontSize: '0.625rem' }}>
                {formatTime(note.createdAt)}
              </span>
            </div>

            {note.contentText && (
              <p className="text-ui-icon-primary whitespace-pre-wrap" style={{ fontSize: '0.875rem', lineHeight: 1.5 }}>
                {note.contentText.length > 200 ? note.contentText.slice(0, 200) + '...' : note.contentText}
              </p>
            )}

            {/* Inline audio player */}
            {note.contentAudioUrl && (
              <div className="mt-2">
                <AudioPlayer src={note.contentAudioUrl} />
              </div>
            )}
          </div>
        </div>

        {/* ---- Action bar — always visible, mobile-friendly ---- */}
        <div className="flex items-center gap-2 mt-3 pt-2.5" style={{ borderTop: '1px solid var(--glass-border-subtle)' }}>
          {/* Create task button */}
          {note.contentText && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => onCreateTask(note)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#e17055]/10 border border-[#e17055]/20 active:bg-[#e17055]/20 transition-colors"
            >
              <ListTodo className="w-3.5 h-3.5 text-[#e17055]/70" />
              <span className="text-[#e17055]/70" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>
                {t('task_from_note')}
              </span>
            </motion.button>
          )}

          <div className="flex-1" />

          {/* Delete button — two-tap confirm */}
          <AnimatePresence mode="wait">
            {isDeletePending ? (
              <motion.button
                key="confirm"
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.85, opacity: 0 }}
                whileTap={{ scale: 0.93 }}
                onClick={() => onDeleteToggle(note.id)}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-red-500/20 border border-red-500/30 active:bg-red-500/30 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                <span className="text-red-400" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>
                  {t('journal_delete_yes')}
                </span>
              </motion.button>
            ) : (
              <motion.button
                key="delete"
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.85, opacity: 0 }}
                whileTap={{ scale: 0.93 }}
                onClick={() => onDeleteToggle(note.id)}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-ui-button active:bg-[var(--ui-button-active)] transition-colors"
                style={{ border: '1px solid var(--glass-border-subtle)' }}
              >
                <Trash2 className="w-3.5 h-3.5 text-ui-tertiary" />
                <span className="text-ui-tertiary" style={{ fontSize: '0.6875rem', fontWeight: 500 }}>
                  {t('journal_delete')}
                </span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ---- Helpers ----

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function groupByDate(
  notes: Note[],
  t: (key: string) => string,
  lang: string
): { label: string; items: Note[] }[] {
  const groups: Record<string, Note[]> = {};

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  for (const note of notes) {
    const dateStr = note.createdAt.slice(0, 10);
    let label: string;
    if (dateStr === today) {
      label = t('note_today');
    } else if (dateStr === yesterday) {
      label = t('note_yesterday');
    } else {
      label = new Date(dateStr).toLocaleDateString(t('locale_code'), {
        day: 'numeric',
        month: 'long',
      });
    }
    if (!groups[label]) groups[label] = [];
    groups[label].push(note);
  }

  return Object.entries(groups).map(([label, items]) => ({ label, items }));
}