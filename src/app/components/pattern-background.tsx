/**
 * PatternBackground
 *
 * Two-layer fixed background:
 * Layer 1: Mesh gradient (CSS var --mesh-gradient, auto light/dark)
 * Layer 2: Organic SVG pattern overlay (low opacity, rotated for portrait)
 *
 * Place once in root layout. Both layers use z-[-1] to stay behind content.
 * IMPORTANT: Do NOT set z-index on content containers — it would create a new
 * stacking context and break backdrop-filter glass effects.
 */

import React from "react";
import { ORGANIC_PATTERN_PATH } from "./organic-pattern-path";

export function PatternBackground() {
  return (
    <>
      {/* Layer 1: Mesh gradient — gives glass elements color to distort */}
      <div
        className="fixed inset-0 z-[-1] pointer-events-none bg-mesh-gradient"
        aria-hidden="true"
      />

      {/* Layer 2: Organic SVG pattern overlay */}
      <div
        className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden opacity-[0.35] dark:opacity-[0.15] transition-opacity duration-500"
        aria-hidden="true"
      >
        {/*
          SVG source is landscape (1928x1081).
          Rotate -90deg -> portrait (~1081x1928).
          min-w/min-h with viewport units -> always covers screen.
        */}
        <div className="absolute inset-0 flex items-center justify-center">
          <svg
            className="min-w-[100vh] min-h-[100vw] -rotate-90"
            fill="none"
            preserveAspectRatio="xMidYMid slice"
            viewBox="0 0 1928.01 1081.02"
          >
            <path
              clipRule="evenodd"
              d={ORGANIC_PATTERN_PATH}
              fill="currentColor"
              fillOpacity="0.2"
              fillRule="evenodd"
            />
          </svg>
        </div>
      </div>
    </>
  );
}
