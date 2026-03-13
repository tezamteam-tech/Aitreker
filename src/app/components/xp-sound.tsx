// =============================================
// BECOME — XP Sound Effects (Web Audio API)
// =============================================
// Synthesized audio cues for XP rewards.
// No external audio files needed — pure oscillators.
// Respects user's sound settings from localStorage.
// =============================================

import { isSoundEnabled } from './local-settings';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Resume if suspended (autoplay policy)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Play a short ascending "coin collect" sound.
 * Two quick notes: C6 -> E6 (~1047Hz -> ~1319Hz)
 * Duration: ~220ms total
 */
export function playXpCoinSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Note 1: C6
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(1047, now);
  gain1.gain.setValueAtTime(0, now);
  gain1.gain.linearRampToValueAtTime(0.15, now + 0.01);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.13);

  // Note 2: E6 (slightly delayed)
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(1319, now + 0.09);
  gain2.gain.setValueAtTime(0, now + 0.09);
  gain2.gain.linearRampToValueAtTime(0.18, now + 0.1);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(now + 0.09);
  osc2.stop(now + 0.25);

  // Subtle shimmer harmonic
  const osc3 = ctx.createOscillator();
  const gain3 = ctx.createGain();
  osc3.type = 'triangle';
  osc3.frequency.setValueAtTime(2637, now + 0.1); // E7
  gain3.gain.setValueAtTime(0, now + 0.1);
  gain3.gain.linearRampToValueAtTime(0.04, now + 0.12);
  gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  osc3.connect(gain3);
  gain3.connect(ctx.destination);
  osc3.start(now + 0.1);
  osc3.stop(now + 0.31);
}

/**
 * Play a richer "level up" sound for milestones.
 * Ascending arpeggio: C5 -> E5 -> G5 -> C6
 * Duration: ~500ms
 */
export function playXpLevelUpSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
  const noteGap = 0.08;

  notes.forEach((freq, i) => {
    const t = now + i * noteGap;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.12 + i * 0.02, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.22);
  });

  // Sustain chord on last note
  const chordTime = now + notes.length * noteGap;
  [1047, 1319, 1568].forEach((freq) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, chordTime);
    gain.gain.setValueAtTime(0, chordTime);
    gain.gain.linearRampToValueAtTime(0.05, chordTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, chordTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(chordTime);
    osc.stop(chordTime + 0.42);
  });
}

/**
 * Play a gentle "task complete" tick.
 * Single short click/pop sound.
 */
export function playTaskCompleteSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, now); // A5
  osc.frequency.exponentialRampToValueAtTime(1320, now + 0.05);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.1, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.12);
}