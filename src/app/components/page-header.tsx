// =============================================
// BECOME — Compact Centered Page Header
// =============================================
// Renders a centered title that fits between
// Telegram's native left/right header buttons.
// Action buttons go into a SEPARATE row below
// the title to avoid overlapping TG controls.
// =============================================

import React from 'react';
import { motion } from 'motion/react';

interface PageHeaderProps {
  /** Primary title — centered, truncated */
  title: string;
  /** Optional small subtitle below title */
  subtitle?: string;
  /** ReactNode rendered below title, right-aligned (action buttons) */
  actions?: React.ReactNode;
  /** Extra bottom margin class override (default mb-3) */
  mb?: string;
}

/**
 * Two-row page header:
 *  Row 1 — centered title (padded to avoid TG native buttons)
 *  Row 2 — optional right-aligned action buttons (below TG header zone)
 */
export function PageHeader({ title, subtitle, actions, mb = 'mb-3' }: PageHeaderProps) {
  return (
    <div className={mb}>
      {/* Row 1: Centered title — fits between TG Close/Back and ∨ ⋮ */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
        style={{ padding: '0 4.5rem' }}
      >
        <h1
          className="text-white/90 truncate"
          style={{ fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.3 }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className="text-white/30 truncate"
            style={{ fontSize: '0.6875rem', lineHeight: 1.2 }}
          >
            {subtitle}
          </p>
        )}
      </motion.div>

      {/* Row 2: Action buttons — right-aligned, safely below TG header */}
      {actions && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.05 }}
          className="flex items-center justify-end gap-1.5 mt-2"
        >
          {actions}
        </motion.div>
      )}
    </div>
  );
}
