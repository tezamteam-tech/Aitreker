// =============================================
// Proper Food AI — SwipeableTask Component
// =============================================
// Drag-to-complete card for strategic tasks.
// Swipe right to complete. Shows green reveal
// background and animated +XP popup on completion.
// =============================================

import React, { useState, useRef, useCallback } from 'react';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'motion/react';
import { Check, Star } from 'lucide-react';
import { hapticSuccess } from './telegram';

const SWIPE_THRESHOLD = 100;
const COMPLETE_EXIT_X = 400;

// Stable particle angles (avoid Math.random in render)
const PARTICLES = [
  { angle: 45, dist: 22 },
  { angle: 135, dist: 28 },
  { angle: 225, dist: 24 },
  { angle: 315, dist: 30 },
];

interface SwipeableTaskProps {
  taskId: string;
  children: React.ReactNode;
  isDone: boolean;
  isCompleting: boolean;
  onComplete: () => void;
  xpAmount?: number;
  compact?: boolean;
}

export function SwipeableTask({
  taskId,
  children,
  isDone,
  isCompleting,
  onComplete,
  xpAmount = 5,
  compact = false,
}: SwipeableTaskProps) {
  const x = useMotionValue(0);
  const [swiped, setSwiped] = useState(false);
  const [showXp, setShowXp] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const revealOpacity = useTransform(x, [0, SWIPE_THRESHOLD * 0.5, SWIPE_THRESHOLD], [0, 0.5, 1]);
  const revealScale = useTransform(x, [0, SWIPE_THRESHOLD], [0.6, 1]);
  const revealCheckOpacity = useTransform(x, [0, SWIPE_THRESHOLD * 0.3, SWIPE_THRESHOLD], [0, 0.3, 1]);

  const handleDragEnd = useCallback(
    (_: any, info: { offset: { x: number; y: number }; velocity: { x: number; y: number } }) => {
      if (isDone || isCompleting || swiped) return;

      if (info.offset.x >= SWIPE_THRESHOLD) {
        setSwiped(true);
        hapticSuccess();
        onComplete();
        setTimeout(() => setShowXp(true), 200);
        setTimeout(() => setShowXp(false), 2200);
      }
    },
    [isDone, isCompleting, swiped, onComplete]
  );

  // ---- Completed state ----
  if (isDone || swiped) {
    return (
      <div className="relative overflow-hidden">
        <AnimatePresence>
          {showXp && (
            <motion.div
              initial={{ opacity: 0, y: 0, scale: 0.5 }}
              animate={{ opacity: 1, y: -30, scale: 1 }}
              exit={{ opacity: 0, y: -60, scale: 0.8 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="absolute right-3 -top-2 z-20 pointer-events-none"
            >
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-400/20 border border-yellow-400/30 backdrop-blur-sm">
                <Star className="w-3 h-3 text-yellow-400" />
                <span className="text-yellow-400" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                  +{xpAmount} XP
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 1, height: 'auto' }}
          animate={{ opacity: 0.4, height: compact ? 28 : 40 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="overflow-hidden"
        >
          <motion.div
            initial={{ x: COMPLETE_EXIT_X }}
            animate={{ x: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 200, delay: 0.15 }}
          >
            <div className={`flex items-center gap-2 ${compact ? 'px-2' : 'px-3 py-1'}`}>
              <div className="w-5 h-5 rounded-md bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Check className="w-3 h-3 text-emerald-400" />
              </div>
              <span className="text-white/25 line-through truncate" style={{ fontSize: compact ? '0.75rem' : '0.8125rem' }}>
                {/* completed placeholder */}
              </span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  // ---- Active / swipeable state ----
  return (
    <div className="relative overflow-hidden rounded-2xl" ref={cardRef}>
      {/* Green reveal background */}
      <motion.div
        className="absolute inset-0 rounded-2xl flex items-center pl-5 z-0"
        style={{
          opacity: revealOpacity,
          background: 'linear-gradient(90deg, rgba(0, 206, 201, 0.15), rgba(85, 239, 196, 0.1))',
        }}
      >
        <motion.div
          style={{ scale: revealScale, opacity: revealCheckOpacity }}
          className="flex items-center gap-2"
        >
          <div className="w-8 h-8 rounded-xl bg-emerald-500/30 flex items-center justify-center">
            <Check className="w-5 h-5 text-emerald-400" />
          </div>
          <span className="text-emerald-400" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
            Done
          </span>
        </motion.div>
      </motion.div>

      {/* Draggable card */}
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: SWIPE_THRESHOLD + 60 }}
        dragElastic={{ left: 0, right: 0.4 }}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className="relative z-10 touch-pan-y"
        whileDrag={{ cursor: 'grabbing' }}
      >
        {children}
      </motion.div>
    </div>
  );
}

// ---- XP Burst animation ----
interface XpBurstProps {
  show: boolean;
  amount: number;
}

export function XpBurst({ show, amount }: XpBurstProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.3 }}
          animate={{ opacity: 1, y: -35, scale: 1 }}
          exit={{ opacity: 0, y: -65, scale: 0.7 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="absolute right-2 -top-1 z-30 pointer-events-none"
        >
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-400/25 border border-yellow-400/35 backdrop-blur-lg shadow-lg">
            <motion.div
              animate={{ rotate: [0, 20, -20, 10, 0] }}
              transition={{ duration: 0.5, delay: 0.15 }}
            >
              <Star className="w-3.5 h-3.5 text-yellow-400" />
            </motion.div>
            <motion.span
              initial={{ width: 0 }}
              animate={{ width: 'auto' }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="text-yellow-400 whitespace-nowrap overflow-hidden"
              style={{ fontSize: '0.8125rem', fontWeight: 700 }}
            >
              +{amount} XP
            </motion.span>
          </div>

          {/* Particle sparkles */}
          {PARTICLES.map((p, i) => {
            const rad = p.angle * (Math.PI / 180);
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0.8, x: 0, y: 0, scale: 1 }}
                animate={{
                  opacity: 0,
                  x: Math.cos(rad) * p.dist,
                  y: Math.sin(rad) * p.dist - 10,
                  scale: 0.3,
                }}
                transition={{ duration: 0.6, delay: 0.1 + i * 0.05 }}
                className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full bg-yellow-400"
              />
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
