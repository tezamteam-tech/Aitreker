// =============================================
// Proper Food AI — Focus Timer (/focus)
// =============================================
// Features: countdown timer, presets, pause/stop,
// completion sound (Web Audio), photo proof,
// focus streak, XP rewards, haptic feedback.
// =============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  Pause,
  Square,
  CheckCircle2,
  Target,
  Flame,
  Star,
  Camera,
  ImageIcon,
  Loader2,
  X,
} from 'lucide-react';
import { GlassCard } from './glass-card';
import { useBottomSheetLifecycle } from './bottom-sheet-context';
import { api } from './api-client';
import type { FocusStats, FocusStopResponse } from './api-client';
import { hapticFeedback, hapticSuccess } from './telegram';
import { useTranslation } from './i18n';
import { PageHeader } from './page-header';

const PRESETS = [5, 10, 25, 50];

type Phase = 'setup' | 'running' | 'paused' | 'completed';

// ---- Web Audio: completion chime ----
let audioCtx: AudioContext | null = null;

function playCompletionSound() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtx;
    const now = ctx.currentTime;

    // Play a pleasant 3-note ascending chime
    const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.15);
      gain.gain.linearRampToValueAtTime(0.15, now + i * 0.15 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.7);
    });
  } catch {
    // Audio not available — silent fallback
  }
}

export function FocusTimerPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Setup state
  const [selectedMinutes, setSelectedMinutes] = useState(25);
  const [tag, setTag] = useState('');

  // Timer state
  const [phase, setPhase] = useState<Phase>('setup');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Keep ref in sync
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // Completion state
  const [resultText, setResultText] = useState('');
  const [showResultModal, setShowResultModal] = useState(false);
  const [stopResponse, setStopResponse] = useState<FocusStopResponse | null>(null);
  const [wasCompleted, setWasCompleted] = useState(false);

  // Hide tab bar when result modal is open
  useBottomSheetLifecycle(showResultModal);

  // Photo state
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUploaded, setPhotoUploaded] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stats
  const [stats, setStats] = useState<FocusStats | null>(null);

  // Load stats on mount
  useEffect(() => {
    api.focusStats().then(setStats).catch(() => {});
  }, []);

  // Countdown logic
  useEffect(() => {
    if (phase === 'running') {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            handleTimerComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [phase]);

  const handleTimerComplete = useCallback(async () => {
    playCompletionSound();
    hapticSuccess();
    setPhase('completed');
    setWasCompleted(true);
    const sid = sessionIdRef.current;
    if (sid) {
      try {
        const res = await api.focusStopWithResult(sid, true);
        setStopResponse(res);
      } catch (e) {
        console.error('[Focus] Error stopping session:', e);
      }
    }
    setShowResultModal(true);
    api.focusStats().then(setStats).catch(() => {});
  }, []);

  const handleStart = async () => {
    hapticFeedback('medium');
    // Pre-warm audio context (needs user gesture)
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch {}
    }
    const total = selectedMinutes * 60;
    setTotalSeconds(total);
    setSecondsLeft(total);
    setPhase('running');

    try {
      const session = await api.focusStart(selectedMinutes, tag || undefined);
      setSessionId(session.id);
    } catch (e) {
      console.error('[Focus] Error starting session:', e);
    }
  };

  const handlePause = () => {
    hapticFeedback('light');
    setPhase('paused');
  };

  const handleResume = () => {
    hapticFeedback('light');
    setPhase('running');
  };

  const handleStop = async () => {
    hapticFeedback('heavy');
    setPhase('completed');
    setWasCompleted(false);
    if (sessionId) {
      try {
        const res = await api.focusStopWithResult(sessionId, false);
        setStopResponse(res);
      } catch (e) {
        console.error('[Focus] Error stopping session:', e);
      }
    }
    setShowResultModal(true);
    api.focusStats().then(setStats).catch(() => {});
  };

  const handleSaveResult = async () => {
    // Save result text via stop (already stopped, but we can update)
    if (sessionId && resultText.trim()) {
      try {
        await api.focusStopWithResult(sessionId, wasCompleted, resultText.trim());
      } catch {}
    }
    handleCloseResult();
  };

  const handleCloseResult = () => {
    setShowResultModal(false);
    setPhase('setup');
    setSecondsLeft(0);
    setSessionId(null);
    setResultText('');
    setTag('');
    setStopResponse(null);
    setPhotoPreview(null);
    setPhotoUploaded(false);
    setPhotoError(false);
    setWasCompleted(false);
  };

  // Photo handling
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !sessionId) return;

    // Preview
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      setPhotoPreview(base64);
      setPhotoUploading(true);
      setPhotoError(false);

      try {
        await api.focusUploadPhoto(sessionId!, base64, file.type);
        setPhotoUploaded(true);
        hapticFeedback('light');
      } catch (err) {
        console.error('[Focus] Photo upload error:', err);
        setPhotoError(true);
      } finally {
        setPhotoUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = () => {
    setPhotoPreview(null);
    setPhotoUploaded(false);
    setPhotoError(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Format time
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progressFraction = totalSeconds > 0 ? 1 - secondsLeft / totalSeconds : 0;
  const circumference = 2 * Math.PI * 140;
  const strokeDashoffset = circumference * (1 - progressFraction);
  const isActive = phase === 'running' || phase === 'paused';

  return (
    <div className="min-h-screen pb-28">
      {/* Background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-[#6c5ce7]/10 blur-[120px]" />
        <div className="absolute bottom-1/4 -right-20 w-60 h-60 rounded-full bg-[#00cec9]/8 blur-[100px]" />
      </div>

      <div className="relative z-10 px-5 pb-6" style={{ paddingTop: 'var(--safe-area-top, 56px)' }}>
        {/* Header */}
        <PageHeader
          title={t('focus_title')}
          actions={
            stats && stats.streak > 0 && phase === 'setup' ? (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20"
              >
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                <span className="text-orange-400" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                  {stats.streak}
                </span>
              </motion.div>
            ) : undefined
          }
        />

        {/* Timer Circle */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="flex justify-center mb-8"
        >
          <div className="relative w-[300px] h-[300px] flex items-center justify-center">
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 300 300">
              <circle cx="150" cy="150" r="140" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="6" />
              {isActive || phase === 'completed' ? (
                <motion.circle
                  cx="150" cy="150" r="140" fill="none"
                  stroke="url(#focusGradient)" strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              ) : null}
              <defs>
                <linearGradient id="focusGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#6c5ce7" />
                  <stop offset="100%" stopColor="#00cec9" />
                </linearGradient>
              </defs>
            </svg>

            <div
              className="absolute rounded-full bg-liquid-glass border border-white/[0.08] flex flex-col items-center justify-center"
              style={{ width: 240, height: 240 }}
            >
              {isActive || phase === 'completed' ? (
                <>
                  <p
                    className="text-white tabular-nums"
                    style={{ fontSize: '3.5rem', fontWeight: 200, letterSpacing: '-0.02em', lineHeight: 1 }}
                  >
                    {formatTime(secondsLeft)}
                  </p>
                  <p className="text-white/30 mt-2" style={{ fontSize: '0.8125rem' }}>
                    {phase === 'paused' ? t('focus_pause') : phase === 'completed' ? t('focus_complete') : t('focus_keep_going')}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-white" style={{ fontSize: '3.5rem', fontWeight: 200, letterSpacing: '-0.02em', lineHeight: 1 }}>
                    {selectedMinutes}
                  </p>
                  <p className="text-white/30 mt-2" style={{ fontSize: '0.9375rem' }}>
                    {t('focus_minutes', { n: selectedMinutes })}
                  </p>
                </>
              )}
            </div>
          </div>
        </motion.div>

        {/* Setup Phase */}
        <AnimatePresence mode="wait">
          {phase === 'setup' && (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <p className="text-white/40 mb-3 px-1" style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.08em' }}>
                {t('focus_select_duration')}
              </p>
              <div className="grid grid-cols-4 gap-2.5 mb-5">
                {PRESETS.map((mins) => {
                  const isSelected = selectedMinutes === mins;
                  return (
                    <motion.button
                      key={mins}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => { hapticFeedback('light'); setSelectedMinutes(mins); }}
                      className={`h-14 rounded-2xl flex flex-col items-center justify-center transition-all duration-200 ${
                        isSelected
                          ? 'bg-[#6c5ce7]/20 border border-[#6c5ce7]/40'
                          : 'bg-white/[0.04] border border-white/[0.06]'
                      }`}
                    >
                      <span className={isSelected ? 'text-white' : 'text-white/60'} style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                        {mins}
                      </span>
                      <span className="text-white/30" style={{ fontSize: '0.625rem' }}>min</span>
                    </motion.button>
                  );
                })}
              </div>

              <div className="mb-6">
                <input
                  type="text"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder={t('focus_tag_placeholder')}
                  maxLength={60}
                  className="w-full h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] px-4 text-white placeholder:text-white/20 outline-none focus:border-[#6c5ce7]/40 transition-colors"
                  style={{ fontSize: '0.9375rem' }}
                />
              </div>

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleStart}
                className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white flex items-center justify-center gap-3 shadow-lg"
                style={{ fontSize: '1.0625rem', fontWeight: 600, boxShadow: '0 6px 24px rgba(108,92,231,0.35)' }}
              >
                <Play className="w-5 h-5" />
                {t('focus_start')}
              </motion.button>
            </motion.div>
          )}

          {/* Running/Paused Phase */}
          {(phase === 'running' || phase === 'paused') && (
            <motion.div
              key="active"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {tag && (
                <div className="text-center mb-5">
                  <GlassCard padding="sm" className="inline-flex items-center gap-2 px-4">
                    <Target className="w-3.5 h-3.5 text-[#a29bfe]" />
                    <span className="text-white/50" style={{ fontSize: '0.8125rem' }}>{tag}</span>
                  </GlassCard>
                </div>
              )}
              <div className="flex gap-3">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={phase === 'paused' ? handleResume : handlePause}
                  className="flex-1 h-14 rounded-2xl bg-white/[0.06] border border-white/[0.08] text-white flex items-center justify-center gap-2.5"
                  style={{ fontSize: '1rem', fontWeight: 600 }}
                >
                  {phase === 'paused' ? (
                    <><Play className="w-5 h-5 text-[#a29bfe]" />{t('focus_resume')}</>
                  ) : (
                    <><Pause className="w-5 h-5 text-white/60" />{t('focus_pause')}</>
                  )}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleStop}
                  className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center"
                >
                  <Square className="w-5 h-5 text-red-400" />
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats section (setup phase only) */}
        {phase === 'setup' && stats && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-8"
          >
            <h3 className="text-white/40 mb-3 px-1" style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.08em' }}>
              {t('focus_stats_title').toUpperCase()}
            </h3>

            {/* Streak + XP row */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <GlassCard padding="sm" className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
                  <Flame className="w-4.5 h-4.5 text-orange-400" style={{ width: 18, height: 18 }} />
                </div>
                <div>
                  <p className="text-white" style={{ fontSize: '1.125rem', fontWeight: 700 }}>{stats.streak}</p>
                  <p className="text-white/30" style={{ fontSize: '0.625rem' }}>{t('focus_streak')}</p>
                </div>
              </GlassCard>
              <GlassCard padding="sm" className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-yellow-500/10 flex items-center justify-center shrink-0">
                  <Star className="w-4.5 h-4.5 text-yellow-400" style={{ width: 18, height: 18 }} />
                </div>
                <div>
                  <p className="text-white" style={{ fontSize: '1.125rem', fontWeight: 700 }}>{stats.totalXpEarned}</p>
                  <p className="text-white/30" style={{ fontSize: '0.625rem' }}>{t('focus_total_xp')}</p>
                </div>
              </GlassCard>
            </div>

            {/* 7d / 30d stats */}
            <div className="grid grid-cols-2 gap-3">
              <GlassCard padding="md" className="text-center">
                <p className="text-[#a29bfe]" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>{t('focus_stats_7d')}</p>
                <p className="text-white mt-1" style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.last7days.minutes}</p>
                <p className="text-white/30" style={{ fontSize: '0.6875rem' }}>{t('focus_total_min')}</p>
                <p className="text-white/20 mt-0.5" style={{ fontSize: '0.625rem' }}>{stats.last7days.sessions} {t('focus_sessions')}</p>
              </GlassCard>
              <GlassCard padding="md" className="text-center">
                <p className="text-[#00cec9]" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>{t('focus_stats_30d')}</p>
                <p className="text-white mt-1" style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.last30days.minutes}</p>
                <p className="text-white/30" style={{ fontSize: '0.6875rem' }}>{t('focus_total_min')}</p>
                <p className="text-white/20 mt-0.5" style={{ fontSize: '0.625rem' }}>{stats.last30days.sessions} {t('focus_sessions')}</p>
              </GlassCard>
            </div>
          </motion.div>
        )}
      </div>

      {/* Hidden file input for photo */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoSelect}
      />

      {/* Completion Modal */}
      <AnimatePresence>
        {showResultModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center"
            onClick={(e) => { if (e.target === e.currentTarget) handleCloseResult(); }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-lg rounded-t-3xl bg-liquid-glass glass-sheet glass-sheet-bottom p-6 pb-10"
            >
              {/* Success icon + XP */}
              <div className="flex justify-center mb-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.2 }}
                  className="w-16 h-16 rounded-full bg-gradient-to-br from-[#6c5ce7]/20 to-[#00cec9]/20 flex items-center justify-center"
                >
                  <CheckCircle2 className="w-8 h-8 text-[#00cec9]" />
                </motion.div>
              </div>

              <h2 className="text-white text-center mb-1" style={{ fontSize: '1.375rem', fontWeight: 700 }}>
                {wasCompleted ? t('focus_great_job') : t('focus_stopped')}
              </h2>

              {/* XP + Streak badges */}
              {stopResponse && wasCompleted && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex items-center justify-center gap-3 mb-3"
                >
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-500/10">
                    <Star className="w-3.5 h-3.5 text-yellow-400" />
                    <span className="text-yellow-400" style={{ fontSize: '0.8125rem', fontWeight: 700 }}>
                      {t('focus_xp_earned', { n: stopResponse.xpEarned })}
                    </span>
                  </div>
                  {stopResponse.streak > 0 && (
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/10">
                      <Flame className="w-3.5 h-3.5 text-orange-400" />
                      <span className="text-orange-400" style={{ fontSize: '0.8125rem', fontWeight: 700 }}>
                        {t('focus_streak_days', { n: stopResponse.streak })}
                      </span>
                    </div>
                  )}
                </motion.div>
              )}

              <p className="text-white/40 text-center mb-5" style={{ fontSize: '0.875rem' }}>
                {selectedMinutes} {t('focus_minutes', { n: selectedMinutes })}
                {tag && <> &middot; {tag}</>}
              </p>

              {/* Result text area */}
              <textarea
                value={resultText}
                onChange={(e) => setResultText(e.target.value)}
                placeholder={t('focus_result_placeholder')}
                rows={3}
                className="w-full rounded-xl bg-white/[0.04] border border-white/[0.06] p-4 text-white placeholder:text-white/20 outline-none focus:border-[#6c5ce7]/40 transition-colors resize-none mb-3"
                style={{ fontSize: '0.9375rem' }}
              />

              {/* Photo proof section */}
              <div className="mb-4">
                {!photoPreview ? (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-12 rounded-xl bg-white/[0.04] border border-dashed border-white/[0.1] flex items-center justify-center gap-2.5 text-white/40 hover:bg-white/[0.06] transition-colors"
                    style={{ fontSize: '0.875rem' }}
                  >
                    <Camera className="w-4 h-4" />
                    {t('focus_attach_photo')}
                  </button>
                ) : (
                  <div className="relative rounded-xl overflow-hidden border border-white/[0.08]">
                    <img src={photoPreview} alt="Focus proof" className="w-full h-32 object-cover" />

                    {/* Overlay status */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      {photoUploading && (
                        <div className="bg-black/60 backdrop-blur-sm rounded-xl px-4 py-2 flex items-center gap-2">
                          <Loader2 className="w-4 h-4 text-white/60 animate-spin" />
                          <span className="text-white/60" style={{ fontSize: '0.8125rem' }}>{t('focus_photo_uploading')}</span>
                        </div>
                      )}
                      {photoUploaded && (
                        <div className="bg-emerald-500/20 backdrop-blur-sm rounded-xl px-4 py-2 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span className="text-emerald-400" style={{ fontSize: '0.8125rem' }}>{t('focus_photo_done')}</span>
                        </div>
                      )}
                      {photoError && (
                        <div className="bg-red-500/20 backdrop-blur-sm rounded-xl px-4 py-2 flex items-center gap-2">
                          <span className="text-red-400" style={{ fontSize: '0.8125rem' }}>{t('focus_photo_error')}</span>
                        </div>
                      )}
                    </div>

                    {/* Remove button */}
                    <button
                      onClick={removePhoto}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center"
                    >
                      <X className="w-4 h-4 text-white/60" />
                    </button>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleCloseResult}
                  className="flex-1 h-12 rounded-xl bg-white/[0.06] text-white/60"
                  style={{ fontSize: '0.9375rem', fontWeight: 500 }}
                >
                  {t('focus_skip_result')}
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSaveResult}
                  className="flex-1 h-12 rounded-xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white"
                  style={{ fontSize: '0.9375rem', fontWeight: 600 }}
                >
                  {t('focus_save_result')}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}