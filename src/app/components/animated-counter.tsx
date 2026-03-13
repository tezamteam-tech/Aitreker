// =============================================
// BECOME — Animated XP Counter
// =============================================
// Counts up/down to target value with easing.
// Glows and pulses on increase. Pure CSS animations
// — no external animation library dependency.
// =============================================

import React, { useEffect, useRef, useState } from 'react';
import { Star } from 'lucide-react';

interface AnimatedCounterProps {
  value: number;
  /** Duration in ms for the count-up */
  duration?: number;
  /** Text color class */
  className?: string;
  /** Font style override */
  style?: React.CSSProperties;
  /** Show pulse glow on change */
  glow?: boolean;
  /** Color for glow effect */
  glowColor?: string;
}

export function AnimatedCounter({
  value,
  duration = 800,
  className = 'text-white',
  style,
  glow = true,
  glowColor = 'rgba(250, 204, 21, 0.4)',
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const [delta, setDelta] = useState(0);
  const prevValueRef = useRef(value);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const prev = prevValueRef.current;
    prevValueRef.current = value;

    if (prev === value) return;

    const diff = value - prev;
    setDelta(diff);
    setIsAnimating(true);

    const startTime = performance.now();
    const startVal = prev;
    const endVal = value;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startVal + (endVal - startVal) * eased);
      setDisplayValue(current);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endVal);
        setTimeout(() => setIsAnimating(false), 600);
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [value, duration]);

  return (
    <span className={`relative inline-flex items-center ${className}`} style={style}>
      {/* Glow pulse behind the number */}
      {glow && isAnimating && (
        <span
          className="absolute inset-0 rounded-full pointer-events-none animate-xp-glow"
          style={{
            background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
            filter: 'blur(8px)',
          }}
        />
      )}

      {/* The number */}
      <span
        className={isAnimating ? 'animate-xp-bump' : ''}
        style={isAnimating && delta > 0 ? { color: '#facc15' } : undefined}
      >
        {displayValue.toLocaleString()}
      </span>

      {/* Floating delta indicator */}
      {isAnimating && delta !== 0 && (
        <span
          className="absolute -right-3 -top-1 pointer-events-none whitespace-nowrap animate-xp-float"
          style={{
            fontSize: '0.625rem',
            fontWeight: 700,
            color: delta > 0 ? '#facc15' : '#f87171',
          }}
        >
          {delta > 0 ? `+${delta}` : delta}
        </span>
      )}

      <style>{`
        @keyframes xp-glow {
          0% { opacity: 0; transform: scale(0.8); }
          50% { opacity: 0.6; transform: scale(1.6); }
          100% { opacity: 0; transform: scale(2); }
        }
        @keyframes xp-bump {
          0% { transform: scale(1); }
          30% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        @keyframes xp-float {
          0% { opacity: 0; transform: translateY(4px) translateX(4px) scale(0.5); }
          30% { opacity: 1; transform: translateY(-12px) translateX(8px) scale(1); }
          100% { opacity: 0; transform: translateY(-24px) translateX(8px) scale(0.7); }
        }
        .animate-xp-glow { animation: xp-glow 0.8s ease-out forwards; }
        .animate-xp-bump { animation: xp-bump 0.5s ease-out; }
        .animate-xp-float { animation: xp-float 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
      `}</style>
    </span>
  );
}

// ---- XP Stats Card (for dashboard) ----
interface XpStatsCardProps {
  xp: number;
  children?: React.ReactNode;
}

export function XpStatsCard({ xp, children }: XpStatsCardProps) {
  const [prevXp, setPrevXp] = useState(xp);
  const [showBurst, setShowBurst] = useState(false);

  useEffect(() => {
    if (xp > prevXp) {
      setShowBurst(true);
      setTimeout(() => setShowBurst(false), 1200);
    }
    setPrevXp(xp);
  }, [xp]);

  return (
    <div className="relative text-center overflow-visible">
      {/* Burst ring on XP gain */}
      {showBurst && (
        <div
          className="absolute inset-0 rounded-xl pointer-events-none animate-xp-ring"
          style={{ border: '2px solid rgba(250, 204, 21, 0.3)' }}
        />
      )}

      <div className={showBurst ? 'animate-xp-card-bump' : ''}>
        <Star className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
        <AnimatedCounter
          value={xp}
          style={{ fontSize: '1.25rem', fontWeight: 700 }}
          glowColor="rgba(250, 204, 21, 0.35)"
        />
      </div>
      {children}

      <style>{`
        @keyframes xp-ring {
          0% { opacity: 0.5; transform: scale(0.3); }
          100% { opacity: 0; transform: scale(2.5); }
        }
        @keyframes xp-card-bump {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        .animate-xp-ring { animation: xp-ring 0.8s ease-out forwards; }
        .animate-xp-card-bump { animation: xp-card-bump 0.3s ease-out; }
      `}</style>
    </div>
  );
}
