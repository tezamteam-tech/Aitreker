// =============================================
// Proper Food AI — Voice Note Recorder (bottom-sheet)
// =============================================
// Full-screen-ish modal with large pulsating mic
// button, live waveform, duration counter.
// On stop: uploads audio → transcribes → saves.
// =============================================

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Square, Loader2, Check, X } from 'lucide-react';
import { api } from './api-client';
import { hapticFeedback, hapticSuccess } from './telegram';
import { useTranslation } from './i18n';
import { useBottomSheetLifecycle } from './bottom-sheet-context';

interface VoiceNoteRecorderProps {
  open: boolean;
  onClose: () => void;
  /** Called after note is saved successfully */
  onSaved: () => void;
  /** Language for Whisper STT */
  language?: string;
  /** Max duration in seconds (default: 120) */
  maxDuration?: number;
}

const WAVE_BARS = 32;

export function VoiceNoteRecorder({
  open,
  onClose,
  onSaved,
  language,
  maxDuration = 120,
}: VoiceNoteRecorderProps) {
  const { t } = useTranslation();

  // Hide tab bar when recorder is open
  useBottomSheetLifecycle(open);

  // Recording state
  const [phase, setPhase] = useState<'idle' | 'recording' | 'processing' | 'done'>('idle');
  const [duration, setDuration] = useState(0);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const waveRafRef = useRef<number | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setPhase('idle');
      setDuration(0);
      setWaveform([]);
      setError(null);
    }
  }, [open]);

  // Cleanup on unmount / close
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (waveRafRef.current) cancelAnimationFrame(waveRafRef.current);
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    recorderRef.current = null;
    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    chunksRef.current = [];
    timerRef.current = null;
    waveRafRef.current = null;
  }, []);

  // Waveform animation
  const updateWaveform = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    const step = Math.floor(dataArray.length / WAVE_BARS);
    const bars: number[] = [];
    for (let i = 0; i < WAVE_BARS; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += dataArray[i * step + j];
      }
      bars.push(sum / step / 255);
    }
    setWaveform(bars);
    waveRafRef.current = requestAnimationFrame(updateWaveform);
  }, []);

  // Start recording
  const startRecording = useCallback(async () => {
    setError(null);
    hapticFeedback('medium');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Audio analysis for waveform
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Stop waveform
        if (waveRafRef.current) cancelAnimationFrame(waveRafRef.current);
        setWaveform([]);

        // Close audio context
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
          audioCtxRef.current.close().catch(() => {});
        }

        // Stop tracks
        stream.getTracks().forEach((track) => track.stop());

        if (timerRef.current) clearInterval(timerRef.current);

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });

        if (blob.size < 500) {
          setPhase('idle');
          return;
        }

        setPhase('processing');

        try {
          const base64 = await blobToBase64(blob);
          const recMime = recorder.mimeType || 'audio/webm';

          // Upload audio + transcribe in parallel
          const [uploadRes, transcribeRes] = await Promise.all([
            api.uploadNoteAudio(base64, recMime),
            api.transcribeAudio(base64, language || undefined, recMime).catch(() => ({ text: '' })),
          ]);

          if (!uploadRes.success || !uploadRes.signedUrl) {
            throw new Error('Audio upload failed');
          }

          // Save note
          await api.createNote({
            type: 'voice' as any,
            contentText: transcribeRes.text?.trim() || '',
            contentAudioUrl: uploadRes.signedUrl,
          });

          hapticSuccess();
          setPhase('done');

          // Auto-close after brief success animation
          setTimeout(() => {
            onSaved();
            onClose();
          }, 800);
        } catch (err) {
          console.error('[VoiceNoteRecorder] Error:', err);
          setError(t('voice_error'));
          setPhase('idle');
        }
      };

      recorder.start(250);
      setPhase('recording');
      setDuration(0);

      // Duration timer
      timerRef.current = setInterval(() => {
        setDuration((d) => {
          const next = d + 1;
          if (next >= maxDuration) {
            recorder.stop();
          }
          return next;
        });
      }, 1000);

      // Start waveform
      updateWaveform();
    } catch (err: any) {
      console.error('[VoiceNoteRecorder] Mic error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError(t('voice_mic_denied'));
      } else {
        setError(t('voice_error'));
      }
      hapticFeedback('heavy');
    }
  }, [language, maxDuration, onClose, onSaved, t, updateWaveform]);

  // Stop recording
  const stopRecording = useCallback(() => {
    hapticFeedback('light');
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  // Handle close (with cleanup)
  const handleClose = useCallback(() => {
    if (phase === 'recording') {
      // Stop without saving
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.onstop = null; // prevent auto-save
        recorderRef.current.stop();
      }
    }
    cleanup();
    setPhase('idle');
    onClose();
  }, [phase, cleanup, onClose]);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end justify-center"
        onClick={(e) => { if (e.target === e.currentTarget && phase !== 'processing') handleClose(); }}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full max-w-lg rounded-t-3xl bg-liquid-glass glass-sheet glass-sheet-bottom px-6 pt-6 pb-12"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-foreground" style={{ fontSize: '1.25rem', fontWeight: 700 }}>
              {t('voice_note_title')}
            </h2>
            <button
              onClick={handleClose}
              disabled={phase === 'processing'}
              className="w-8 h-8 rounded-lg bg-ui-button flex items-center justify-center disabled:opacity-30"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Duration */}
          <div className="text-center mb-6">
            <p
              className={`transition-colors ${phase === 'recording' ? 'text-[#a29bfe]' : 'text-ui-tertiary'}`}
              style={{
                fontSize: '2.5rem',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.04em',
              }}
            >
              {formatDuration(duration)}
            </p>
            <p className="text-ui-tertiary mt-1" style={{ fontSize: '0.75rem' }}>
              {phase === 'idle' && t('voice_note_tap_to_record')}
              {phase === 'recording' && t('voice_note_recording')}
              {phase === 'processing' && t('voice_note_processing')}
              {phase === 'done' && t('voice_note_saved')}
            </p>
          </div>

          {/* Waveform visualization */}
          <div className="flex items-center justify-center gap-[2px] mb-8" style={{ height: 48 }}>
            {phase === 'recording' && waveform.length > 0
              ? waveform.map((v, i) => (
                  <div
                    key={i}
                    className="rounded-full bg-[#a29bfe]"
                    style={{
                      width: 3,
                      height: Math.max(3, v * 44),
                      opacity: 0.4 + v * 0.6,
                      transition: 'height 80ms ease-out',
                    }}
                  />
                ))
              : Array.from({ length: WAVE_BARS }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-full"
                    style={{
                      width: 3,
                      height: 3,
                      backgroundColor: phase === 'done' ? 'rgba(162, 155, 254, 0.5)' : 'rgba(255, 255, 255, 0.06)',
                    }}
                  />
                ))}
          </div>

          {/* Main action button */}
          <div className="flex justify-center mb-4">
            {phase === 'idle' && (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={startRecording}
                className="w-20 h-20 rounded-full bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] flex items-center justify-center shadow-2xl relative"
                style={{ boxShadow: '0 8px 32px rgba(108, 92, 231, 0.4)' }}
              >
                {/* Outer pulse ring */}
                <div className="absolute inset-0 rounded-full bg-[#6c5ce7]/20 animate-ping" style={{ animationDuration: '2s' }} />
                <Mic className="w-8 h-8 text-white relative z-10" />
              </motion.button>
            )}

            {phase === 'recording' && (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={stopRecording}
                className="w-20 h-20 rounded-full bg-gradient-to-br from-[#e17055] to-[#fd79a8] flex items-center justify-center relative"
                style={{ boxShadow: '0 8px 32px rgba(225, 112, 85, 0.4)' }}
              >
                {/* Recording pulse */}
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-[#e17055]/40"
                  animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                />
                <Square className="w-7 h-7 text-white relative z-10" />
              </motion.button>
            )}

            {phase === 'processing' && (
              <div className="w-20 h-20 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-[#a29bfe] animate-spin" />
              </div>
            )}

            {phase === 'done' && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                className="w-20 h-20 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center"
              >
                <Check className="w-8 h-8 text-emerald-400" />
              </motion.div>
            )}
          </div>

          {/* Max duration hint */}
          {phase === 'recording' && (
            <div className="text-center">
              <div className="mx-auto w-48 h-1 rounded-full bg-ui-progress overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-[#a29bfe]/40"
                  style={{ width: `${(duration / maxDuration) * 100}%` }}
                />
              </div>
              <p className="text-ui-tertiary mt-2" style={{ fontSize: '0.6875rem' }}>
                {t('voice_note_max', { max: Math.floor(maxDuration / 60) })}
              </p>
            </div>
          )}

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-center text-red-400/70 mt-4"
                style={{ fontSize: '0.8125rem' }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ---- Helpers ----

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}