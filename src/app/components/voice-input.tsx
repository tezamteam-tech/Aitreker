// =============================================
// Proper Food AI — Voice Input Component
// =============================================
// Reusable voice recording button with live
// audio waveform visualization. Uses
// MediaRecorder API + OpenAI Whisper for STT.
// Auto-detects language when no hint provided.
// 60s max recording with auto-stop + arc timer.
// =============================================

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { api } from './api-client';
import { hapticFeedback, hapticSuccess } from './telegram';
import { useTranslation } from './i18n';

interface VoiceInputProps {
  /** Called when transcription is complete — append text to existing value */
  onTranscript: (text: string) => void;
  /** Called with raw audio blob + base64 after recording stops (before transcription) */
  onAudioBlob?: (base64: string, mimeType: string) => void;
  /** Language hint for Whisper ('ru' | 'en'). Omit for auto-detection. */
  language?: string;
  /** Optional size variant */
  size?: 'sm' | 'md';
  /** Optional custom className */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Max recording duration in seconds (default: 60) */
  maxDuration?: number;
}

// Number of waveform bars
const WAVE_BARS = 24;
const WAVE_BARS_SM = 16;

export function VoiceInput({
  onTranscript,
  onAudioBlob,
  language,
  size = 'md',
  className = '',
  disabled = false,
  maxDuration = 60,
}: VoiceInputProps) {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [waveform, setWaveform] = useState<number[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const waveRafRef = useRef<number | null>(null);
  const durationRef = useRef(0); // non-reactive ref for auto-stop check

  const isSm = size === 'sm';
  const barsCount = isSm ? WAVE_BARS_SM : WAVE_BARS;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (waveRafRef.current) cancelAnimationFrame(waveRafRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Clear error after 3s
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // ---- Waveform updater ----
  const updateWaveform = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    const step = Math.floor(bufferLength / barsCount);
    const bars: number[] = [];
    for (let i = 0; i < barsCount; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += dataArray[i * step + j];
      }
      bars.push(Math.min(1, (sum / step / 255) * 2.5));
    }
    setWaveform(bars);

    waveRafRef.current = requestAnimationFrame(updateWaveform);
  }, [barsCount]);

  // ---- Stop recording (extracted for auto-stop) ----
  const doStop = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (disabled || isProcessing) return;
    setError(null);
    durationRef.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;

      // Set up Web Audio API for waveform
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Determine supported MIME type
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = '';
          }
        }
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        // Stop waveform animation
        if (waveRafRef.current) {
          cancelAnimationFrame(waveRafRef.current);
          waveRafRef.current = null;
        }
        setWaveform([]);

        // Close audio context
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
          audioCtxRef.current.close().catch(() => {});
          audioCtxRef.current = null;
        }
        analyserRef.current = null;

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });

        if (blob.size < 500) {
          setIsRecording(false);
          setDuration(0);
          return;
        }

        setIsProcessing(true);
        setIsRecording(false);
        setDuration(0);

        try {
          const base64 = await blobToBase64(blob);
          const recMime = recorder.mimeType || 'audio/webm';

          // Fire audio blob callback (for upload to storage)
          if (onAudioBlob) {
            onAudioBlob(base64, recMime);
          }

          const result = await api.transcribeAudio(
            base64,
            language || undefined,
            recMime
          );

          if (result.text && result.text.trim()) {
            onTranscript(result.text.trim());
            hapticSuccess();
          } else {
            setError(t('voice_error'));
          }
        } catch (err) {
          console.error('[VoiceInput] Transcription error:', err);
          setError(t('voice_error'));
        } finally {
          setIsProcessing(false);
        }
      };

      recorder.start(250);
      setIsRecording(true);
      setDuration(0);
      hapticFeedback('medium');

      // Duration timer with auto-stop
      timerRef.current = setInterval(() => {
        durationRef.current += 1;
        setDuration(durationRef.current);

        if (durationRef.current >= maxDuration) {
          // Auto-stop: time limit reached
          hapticFeedback('heavy');
          doStop();
        }
      }, 1000);

      // Start waveform
      updateWaveform();
    } catch (err: any) {
      console.error('[VoiceInput] Mic access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError(t('voice_mic_denied'));
      } else {
        setError(t('voice_error'));
      }
      hapticFeedback('heavy');
    }
  }, [disabled, isProcessing, language, onTranscript, t, updateWaveform, maxDuration, doStop, onAudioBlob]);

  const stopRecording = useCallback(() => {
    hapticFeedback('light');
    doStop();
  }, [doStop]);

  const handleClick = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  // Format mm:ss
  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const btnSize = isSm ? 'w-9 h-9' : 'w-11 h-11';
  const iconSize = isSm ? 'w-4 h-4' : 'w-5 h-5';
  const waveHeight = isSm ? 20 : 28;
  const arcR = isSm ? 16 : 20; // SVG arc radius
  const arcStroke = isSm ? 2 : 2.5;
  const arcSize = (arcR + arcStroke) * 2;
  const progress = Math.min(duration / maxDuration, 1);

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {/* Waveform + duration while recording */}
      <AnimatePresence>
        {isRecording && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            className="flex items-center gap-2 overflow-hidden"
          >
            {/* Live waveform bars */}
            <div
              className="flex items-center gap-px"
              style={{ height: waveHeight }}
            >
              {Array.from({ length: barsCount }).map((_, i) => {
                const level = waveform[i] || 0;
                const minH = isSm ? 2 : 3;
                const maxH = waveHeight;
                const h = Math.max(minH, level * maxH);
                return (
                  <div
                    key={i}
                    className="rounded-full transition-all"
                    style={{
                      width: isSm ? 1.5 : 2,
                      height: h,
                      transitionDuration: '80ms',
                      backgroundColor: progress > 0.85
                        ? `rgba(239, 68, 68, ${0.5 + level * 0.4})` // red-ish when near limit
                        : `rgba(248, 113, 113, ${0.5 + level * 0.3})`, // normal red
                    }}
                  />
                );
              })}
            </div>

            {/* Duration + remaining indicator */}
            <div className="flex items-center gap-1.5 shrink-0">
              <motion.div
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                className="w-1.5 h-1.5 rounded-full bg-red-500"
              />
              <span
                className={`${progress > 0.85 ? 'text-red-300' : 'text-red-400'}`}
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatDuration(duration)}
              </span>
            </div>
          </motion.div>
        )}

        {isProcessing && (
          <motion.div
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            className="flex items-center gap-1.5"
          >
            {/* Shimmer bars while processing */}
            <div className="flex items-center gap-px" style={{ height: waveHeight }}>
              {Array.from({ length: Math.floor(barsCount / 2) }).map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    height: [isSm ? 3 : 4, isSm ? 10 : 14, isSm ? 3 : 4],
                  }}
                  transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    delay: i * 0.06,
                    ease: 'easeInOut',
                  }}
                  className="rounded-full bg-[#a29bfe]/50"
                  style={{ width: isSm ? 1.5 : 2 }}
                />
              ))}
            </div>
            <span
              className="text-[#a29bfe] shrink-0"
              style={{ fontSize: '0.75rem', fontWeight: 500 }}
            >
              {t('voice_processing')}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mic / Stop button with arc timer */}
      <div className="relative shrink-0">
        {/* Circular progress arc (visible only while recording) */}
        {isRecording && (
          <svg
            className="absolute inset-0 -rotate-90 pointer-events-none"
            width={isSm ? 36 : 44}
            height={isSm ? 36 : 44}
            viewBox={`0 0 ${arcSize} ${arcSize}`}
          >
            {/* Background track */}
            <circle
              cx={arcSize / 2}
              cy={arcSize / 2}
              r={arcR}
              fill="none"
              stroke="rgba(239,68,68,0.12)"
              strokeWidth={arcStroke}
            />
            {/* Progress arc */}
            <circle
              cx={arcSize / 2}
              cy={arcSize / 2}
              r={arcR}
              fill="none"
              stroke={progress > 0.85 ? '#ef4444' : '#f87171'}
              strokeWidth={arcStroke}
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * arcR}`}
              strokeDashoffset={`${2 * Math.PI * arcR * (1 - progress)}`}
              style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
            />
          </svg>
        )}

        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={handleClick}
          disabled={disabled || isProcessing}
          className={`${btnSize} rounded-xl flex items-center justify-center transition-all ${
            isRecording
              ? 'bg-red-500/20 border border-red-500/40 text-red-400'
              : isProcessing
                ? 'bg-[#6c5ce7]/10 border border-[#6c5ce7]/20 text-[#a29bfe]'
                : 'bg-ui-button border border-[var(--glass-border)] text-muted-foreground active:bg-ui-button-active'
          }`}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        >
          {isProcessing ? (
            <Loader2 className={`${iconSize} animate-spin`} />
          ) : isRecording ? (
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            >
              <Square className={isSm ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
            </motion.div>
          ) : (
            <Mic className={iconSize} />
          )}
        </motion.button>
      </div>

      {/* Error tooltip */}
      <AnimatePresence>
        {error && (
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="text-red-400/80"
            style={{ fontSize: '0.6875rem' }}
          >
            {error}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- Helper: Blob to base64 ----
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read blob'));
      }
    };
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}