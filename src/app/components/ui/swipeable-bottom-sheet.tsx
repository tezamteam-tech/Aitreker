// =============================================
// SwipeableBottomSheet — Reusable Bottom Sheet
// =============================================
// Swipe-to-dismiss bottom sheet with spring animation,
// backdrop blur, drag handle, safe area support, and
// automatic tab-bar hiding via BottomSheetContext.
// =============================================

import React, { useCallback, useRef, useEffect } from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  type PanInfo,
} from 'motion/react';
import { X } from 'lucide-react';
import { useBottomSheetLifecycle } from '../bottom-sheet-context';

export interface SwipeableBottomSheetProps {
  /** Whether the sheet is open */
  open: boolean;
  /** Called when user dismisses the sheet (swipe, backdrop tap, X button) */
  onClose: () => void;
  /** Optional title shown in the header */
  title?: string;
  /** Sheet content */
  children: React.ReactNode;
  /** Max height as CSS value (default: '85vh') */
  maxHeight?: string;
  /** Z-index for the sheet and backdrop (default: 50) */
  zIndex?: number;
  /** Show close (X) button in header (default: true) */
  showCloseButton?: boolean;
  /** Show drag handle bar (default: true) */
  showHandle?: boolean;
  /** Minimum velocity (px/s) to dismiss on swipe (default: 300) */
  dismissVelocity?: number;
  /** Minimum distance (px) to dismiss on swipe (default: 100) */
  dismissDistance?: number;
  /** Custom class for the content area below title */
  contentClassName?: string;
}

export function SwipeableBottomSheet({
  open,
  onClose,
  title,
  children,
  maxHeight = '85vh',
  zIndex = 50,
  showCloseButton = true,
  showHandle = true,
  dismissVelocity = 300,
  dismissDistance = 100,
  contentClassName,
}: SwipeableBottomSheetProps) {
  // Track open state for tab bar hiding
  useBottomSheetLifecycle(open);

  // Motion value for drag offset
  const dragY = useMotionValue(0);
  // Backdrop opacity dims as user drags down
  const backdropOpacity = useTransform(dragY, [0, 300], [1, 0.2]);
  // Track if dismissing to avoid double-fire
  const dismissing = useRef(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      dismissing.current = false;
      dragY.set(0);
    }
  }, [open, dragY]);

  const handleDragEnd = useCallback(
    (_: any, info: PanInfo) => {
      if (dismissing.current) return;
      const { velocity, offset } = info;
      // Dismiss if fast swipe or dragged far enough
      if (velocity.y > dismissVelocity || offset.y > dismissDistance) {
        dismissing.current = true;
        onClose();
      } else {
        // Snap back
        dragY.set(0);
      }
    },
    [onClose, dismissVelocity, dismissDistance, dragY]
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ opacity: backdropOpacity, zIndex }}
            onClick={() => {
              if (!dismissing.current) {
                dismissing.current = true;
                onClose();
              }
            }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={handleDragEnd}
            style={{
              y: dragY,
              maxHeight,
              zIndex: zIndex + 1,
              paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
              background: 'rgba(18,18,30,0.98)',
              borderTop: '1px solid rgba(255,255,255,0.08)',
            }}
            className="fixed left-0 right-0 bottom-0 rounded-t-[1.5rem] overflow-hidden flex flex-col"
          >
            {/* Drag Handle */}
            {showHandle && (
              <div className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-white/15" />
              </div>
            )}

            {/* Header */}
            {(title || showCloseButton) && (
              <div className="px-5 pb-2 flex items-center justify-between flex-shrink-0">
                {title ? (
                  <h3 className="text-white" style={{ fontSize: '1.0625rem', fontWeight: 700 }}>
                    {title}
                  </h3>
                ) : (
                  <div />
                )}
                {showCloseButton && (
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => {
                      if (!dismissing.current) {
                        dismissing.current = true;
                        onClose();
                      }
                    }}
                    className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-white/50" />
                  </motion.button>
                )}
              </div>
            )}

            {/* Scrollable Content */}
            <div
              className={`overflow-y-auto overscroll-contain flex-1 px-5 pb-4 ${contentClassName || ''}`}
              // Prevent drag from triggering while scrolling content
              onPointerDownCapture={(e) => {
                const el = e.currentTarget;
                if (el.scrollTop > 0) {
                  e.stopPropagation();
                }
              }}
            >
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
