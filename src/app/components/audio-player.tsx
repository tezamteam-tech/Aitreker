// =============================================
// BECOME — Inline Audio Player
// =============================================
// Glassmorphism mini-player for voice notes.
// Seekable waveform bars (tap + drag to scrub),
// play/pause, elapsed/total time.
// =============================================

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'motion/react';
import { Play, Pause, Volume2 } from 'lucide-react';
import { hapticFeedback } from './telegram';

interface AudioPlayerProps {
  src: string;
  className?: string;
}

// Number of bars in the waveform
const BARS = 28;

// Deterministic pseudo-waveform heights (seeded by bar index)
const BAR_HEIGHTS = Array.from({ length: BARS }, (_, i) => {
  const seed = Math.sin(i * 2.7 + 1.3) * 0.5 + 0.5;
  return 4 + seed * 16;
});

export function AudioPlayer({ src, className = '' }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const rafRef = useRef<number | null>(null);

  // Create & configure audio element
  useEffect(() => {
    const audio = new Audio(src);
    audio.preload = 'metadata';
    audioRef.current = audio;

    const onMeta = () => {
      const d = audio.duration;
      setDuration(d && isFinite(d) ? d : 0);
    };
    const onDurationChange = () => {
      const d = audio.duration;
      if (d && isFinite(d) && d > 0) setDuration(d);
    };
    const onEnd = () => { setIsPlaying(false); setCurrentTime(0); };
    const onErr = () => setError(true);

    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnd);
    audio.addEventListener('error', onErr);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnd);
      audio.removeEventListener('error', onErr);
      audio.pause();
      audio.src = '';
    };
  }, [src]);

  // RAF progress loop
  const updateProgress = useCallback(() => {
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      setCurrentTime(audio.currentTime);
      rafRef.current = requestAnimationFrame(updateProgress);
    }
  }, []);

  // Play / Pause
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || error) return;
    hapticFeedback('light');

    if (isPlaying) {
      audio.pause();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setIsPlaying(false);
    } else {
      audio.play().then(() => {
        setIsPlaying(true);
        updateProgress();
      }).catch(() => setError(true));
    }
  }, [isPlaying, error, updateProgress]);

  // ---- Seek helpers ----

  const seekToFraction = useCallback((fraction: number) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const clamped = Math.max(0, Math.min(1, fraction));
    audio.currentTime = clamped * duration;
    setCurrentTime(audio.currentTime);
  }, [duration]);

  const getFraction = useCallback((clientX: number) => {
    const el = waveRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return (clientX - rect.left) / rect.width;
  }, []);

  // Mouse seek
  const handleWaveClick = useCallback((e: React.MouseEvent) => {
    hapticFeedback('light');
    seekToFraction(getFraction(e.clientX));
  }, [seekToFraction, getFraction]);

  // Touch seek (start + move + end)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    setIsSeeking(true);
    hapticFeedback('light');
    const touch = e.touches[0];
    seekToFraction(getFraction(touch.clientX));
  }, [seekToFraction, getFraction]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isSeeking) return;
    const touch = e.touches[0];
    seekToFraction(getFraction(touch.clientX));
  }, [isSeeking, seekToFraction, getFraction]);

  const handleTouchEnd = useCallback(() => {
    setIsSeeking(false);
  }, []);

  // Format seconds → m:ss
  const fmt = (s: number) => {
    if (!s || !isFinite(s) || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? currentTime / duration : 0;

  // Error fallback
  if (error) {
    return (
      <div className={`flex items-center gap-2 py-1.5 px-3 rounded-lg bg-white/[0.03] border border-white/[0.05] ${className}`}>
        <Volume2 className="w-3.5 h-3.5 text-white/15" />
        <span className="text-white/20" style={{ fontSize: '0.75rem' }}>Audio unavailable</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2.5 py-2 px-3 rounded-xl bg-white/[0.03] border border-white/[0.05] ${className}`}>
      {/* Play / Pause */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.85 }}
        onClick={togglePlay}
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${
          isPlaying
            ? 'bg-[#a29bfe]/20 border border-[#a29bfe]/30'
            : 'bg-white/[0.06] border border-white/[0.08]'
        }`}
      >
        {isPlaying ? (
          <Pause className="w-3.5 h-3.5 text-[#a29bfe]" />
        ) : (
          <Play className="w-3.5 h-3.5 text-white/50 ml-0.5" />
        )}
      </motion.button>

      {/* Seekable waveform */}
      <div
        ref={waveRef}
        role="slider"
        aria-label="Audio seek"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        className="flex-1 flex items-center gap-[2px] cursor-pointer select-none"
        style={{ height: 24, touchAction: 'none' }}
        onClick={handleWaveClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {BAR_HEIGHTS.map((h, i) => {
          const barFraction = i / BARS;
          const isActive = barFraction <= progress;
          return (
            <div
              key={i}
              className="rounded-full transition-colors"
              style={{
                flex: '1 1 0',
                maxWidth: 3,
                minWidth: 2,
                height: h,
                transitionDuration: '100ms',
                backgroundColor: isActive
                  ? 'rgba(162, 155, 254, 0.75)'
                  : 'rgba(255, 255, 255, 0.08)',
              }}
            />
          );
        })}
      </div>

      {/* Time */}
      <span
        className="text-white/30 shrink-0"
        style={{
          fontSize: '0.6875rem',
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          minWidth: 36,
          textAlign: 'right',
        }}
      >
        {isPlaying || currentTime > 0 ? `${fmt(currentTime)}` : fmt(duration)}
      </span>
    </div>
  );
}