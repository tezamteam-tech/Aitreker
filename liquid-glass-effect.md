# Liquid Glass Effect — Implementation Guide

Self-contained reference for the Apple-style "Liquid Glass" visual effect used in BECOME.
Copy this file into any React + Tailwind CSS v4 project and follow the integration steps below.

---

## 1. Architecture Overview

The effect has three layers:

1. **SVG Filter** (`#liquidGlassFilter`) — an invisible `<svg>` element in the DOM that defines a displacement map based on procedural fractal noise. It warps the `backdrop-filter` of any element that references it.
2. **CSS Classes** — utility classes (`.bg-liquid-glass`, `.glass-sheet`, etc.) that combine `backdrop-filter: blur()` with the SVG filter reference and decorative box-shadows / borders.
3. **React Components** — optional wrappers (`<GlassCard>`, tab bar, bottom sheets) that compose the CSS classes with Tailwind utilities.

```
┌─────────────────────────────────────────────────┐
│  Root layout (dark bg #0a0a0f)                  │
│                                                 │
│  <svg> ← hidden, defines #liquidGlassFilter     │
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │  Scrollable content                     │    │
│  │  ┌───────────────────────────────────┐  │    │
│  │  │  .bg-liquid-glass card            │  │    │
│  │  │  backdrop-filter: url(#…) blur()  │  │    │
│  │  └───────────────────────────────────┘  │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │  Tab bar / bottom sheet                 │    │
│  │  .bg-liquid-glass .glass-sheet          │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

---

## 2. SVG Displacement Filter

Place this **once** in your root layout component. It must be in the DOM but invisible.

```tsx
{/* Global SVG displacement filter for liquid glass effect */}
<svg
  style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
  aria-hidden="true"
>
  <filter id="liquidGlassFilter" x="-10%" y="-10%" width="120%" height="120%">
    {/* 1. Fractal noise — organic, flowing distortion texture.
           Low baseFrequency = large "blobs" of distortion.
           Two frequencies (0.012 horizontal, 0.018 vertical) for asymmetry.
           numOctaves=3 adds detail layers. */}
    <feTurbulence
      type="fractalNoise"
      baseFrequency="0.012 0.018"
      numOctaves={3}
      seed={2}
      result="noise"
    />

    {/* 2. Rotate displacement direction ~30°.
           Without this, displacement goes straight up/down + left/right,
           which looks mechanical. The rotation gives a natural refraction angle.

           Matrix math:
             cos(30deg) ≈ 0.866    sin(30deg) = 0.5
             New R =  0.866 * R + 0.5 * G    → X displacement is angled
             New G = -0.5   * R + 0.866 * G  → Y displacement is angled */}
    <feColorMatrix
      in="noise"
      type="matrix"
      values="0.866 0.5 0 0 0
              -0.5 0.866 0 0 0
              0 0 1 0 0
              0 0 0 1 0"
      result="rotatedNoise"
    />

    {/* 3. Apply the noise as a displacement map to SourceGraphic.
           scale=18 is subtle; values 30-60 give more dramatic warping.
           R channel → X shift, G channel → Y shift. */}
    <feDisplacementMap
      in="SourceGraphic"
      in2="rotatedNoise"
      scale={18}
      xChannelSelector="R"
      yChannelSelector="G"
    />
  </filter>
</svg>
```

### Tuning Parameters

| Parameter | Default | Effect |
|---|---|---|
| `baseFrequency` | `0.012 0.018` | Lower = larger blobs, higher = finer grain |
| `numOctaves` | `3` | More octaves = more detail (costs perf) |
| `seed` | `2` | Changes the noise pattern entirely |
| `scale` | `18` | Displacement strength in px. 0 = off, 60+ = heavy |
| `feColorMatrix angle` | `30°` | Change cos/sin values to rotate refraction direction |

---

## 3. CSS Classes

Add these to your global CSS file (Tailwind `@layer` or plain CSS).

```css
/* ── Liquid Glass backgrounds ─────────────────────────── */

/* Light glass — cards, surfaces */
.bg-liquid-glass {
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  background: rgba(255, 255, 255, 0.1);
}

/* Heavier glass — panels, bottom sheets, navigation */
.bg-liquid-glass-panel {
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  background: rgba(18, 18, 30, 0.72);
}

/* Toast notifications */
.bg-liquid-glass-toast {
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  background: rgba(26, 26, 46, 0.7);
}

/* Dropdowns / context menus */
.bg-liquid-glass-dropdown {
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  background: rgba(22, 22, 38, 0.75);
}

/*
 * SVG filter enhancement — applied ONLY on non-Safari browsers.
 *
 * Safari (iOS/macOS) has rendering bugs with url() inside backdrop-filter,
 * so we gate this behind @supports not (hanging-punctuation: first).
 * "hanging-punctuation" is a Safari-only CSS property, so this check
 * effectively means "if NOT Safari, add the SVG filter".
 *
 * On Safari, the effect falls back to plain backdrop-filter: blur(),
 * which still looks good — just without the displacement distortion.
 */
@supports not (hanging-punctuation: first) {
  .bg-liquid-glass {
    backdrop-filter: url(#liquidGlassFilter) blur(2px);
  }
  .bg-liquid-glass-panel {
    backdrop-filter: url(#liquidGlassFilter) blur(6px);
  }
  .bg-liquid-glass-toast {
    backdrop-filter: url(#liquidGlassFilter) blur(8px);
  }
  .bg-liquid-glass-dropdown {
    backdrop-filter: url(#liquidGlassFilter) blur(8px);
  }
}


/* ── Glass Sheet (bottom sheets & modals) ─────────────── */

.glass-sheet {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow:
    /* Inner top highlight — simulates light catching the upper glass rim */
    inset 0 1px 0 0 rgba(255, 255, 255, 0.2),
    /* Inner bottom shadow — depth illusion */
    inset 0 -1px 0 0 rgba(255, 255, 255, 0.05),
    /* Outer shadow — element lifts off the page */
    0 -8px 32px rgba(0, 0, 0, 0.3),
    /* Hairline outer ring — defines the glass "edge" */
    0 0 0 0.5px rgba(255, 255, 255, 0.1);
}

/* Top specular highlight — a bright gradient line across the top edge,
   simulating light reflecting off the rim of a glass panel. */
.glass-sheet::before {
  content: '';
  position: absolute;
  top: 0;
  left: 8%;
  right: 8%;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.3) 30%,
    rgba(255, 255, 255, 0.45) 50%,
    rgba(255, 255, 255, 0.3) 70%,
    transparent
  );
  pointer-events: none;
  z-index: 1;
}

/* Variant: bottom sheet — remove bottom border (it slides up from below) */
.glass-sheet-bottom {
  border-bottom: none;
}

/* Variant: centered modal — symmetrical shadow (no directional bias) */
.glass-sheet-center {
  box-shadow:
    inset 0 1px 0 0 rgba(255, 255, 255, 0.2),
    inset 0 -1px 0 0 rgba(255, 255, 255, 0.05),
    0 8px 48px rgba(0, 0, 0, 0.4),
    0 0 0 0.5px rgba(255, 255, 255, 0.1);
}
```

---

## 4. Usage Patterns

### 4.1 Glass Card (inline)

```tsx
<div
  className="rounded-2xl bg-liquid-glass border border-white/[0.08] p-4"
  style={{
    boxShadow: 'inset 0 0.5px 0 0 rgba(255,255,255,0.1), 0 4px 16px rgba(0,0,0,0.12)',
  }}
>
  Card content
</div>
```

### 4.2 Glass Card (reusable component)

```tsx
import React from 'react';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: 'default' | 'elevated' | 'interactive' | 'accent';
  padding?: 'sm' | 'md' | 'lg';
}

export function GlassCard({
  children,
  className = '',
  variant = 'default',
  padding = 'md',
  ...props
}: GlassCardProps) {
  const variants: Record<string, string> = {
    default: 'border border-white/[0.08]',
    elevated: 'border border-white/[0.12] shadow-lg shadow-black/20',
    interactive:
      'border border-white/[0.08] hover:border-white/[0.14] active:scale-[0.98] transition-all duration-200 cursor-pointer',
    accent: 'border border-[#6c5ce7]/25',
  };

  const paddings: Record<string, string> = {
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-5',
  };

  return (
    <div
      className={`rounded-2xl bg-liquid-glass ${variants[variant]} ${paddings[padding]} ${className}`}
      style={{
        boxShadow:
          'inset 0 0.5px 0 0 rgba(255,255,255,0.1), 0 4px 16px rgba(0,0,0,0.12)',
      }}
      {...props}
    >
      {children}
    </div>
  );
}
```

### 4.3 Bottom Sheet

```tsx
<div className="bg-liquid-glass glass-sheet glass-sheet-bottom rounded-t-3xl p-6">
  Bottom sheet content
</div>
```

### 4.4 Centered Modal

```tsx
<div className="bg-liquid-glass glass-sheet glass-sheet-center rounded-3xl p-6">
  Modal content
</div>
```

### 4.5 Floating Tab Bar

```tsx
<div
  className="bg-liquid-glass relative rounded-[28px] overflow-hidden"
  style={{
    border: '1px solid rgba(255, 255, 255, 0.15)',
    boxShadow: `
      inset 0 1px 0 0 rgba(255,255,255,0.2),
      inset 0 -1px 0 0 rgba(255,255,255,0.05),
      0 8px 32px rgba(0,0,0,0.2),
      0 0 0 0.5px rgba(255,255,255,0.1)
    `,
  }}
>
  {/* Top specular highlight */}
  <div
    className="pointer-events-none absolute top-0 left-[8%] right-[8%] h-px"
    style={{
      background:
        'linear-gradient(90deg, transparent, rgba(255,255,255,0.3) 30%, rgba(255,255,255,0.45) 50%, rgba(255,255,255,0.3) 70%, transparent)',
    }}
  />
  {/* Tab buttons go here */}
</div>
```

### 4.6 Toast Notification

```tsx
<div className="bg-liquid-glass-toast rounded-2xl px-4 py-3 border border-white/10">
  Notification text
</div>
```

### 4.7 Dropdown / Context Menu

```tsx
<div className="bg-liquid-glass-dropdown rounded-xl border border-white/10 py-1">
  <button className="w-full text-left px-4 py-2 hover:bg-white/5">Option 1</button>
  <button className="w-full text-left px-4 py-2 hover:bg-white/5">Option 2</button>
</div>
```

---

## 5. Integration Checklist

1. **Dark background** — The glass effect is designed for dark UIs. Set your root container to a dark solid color (e.g., `#0a0a0f`). Glass on light backgrounds looks washed out.

2. **SVG filter in DOM** — Paste the `<svg>` block from Section 2 into your root layout component. It must be rendered in the DOM (not in CSS) for `url(#liquidGlassFilter)` references to resolve.

3. **CSS classes** — Copy the CSS from Section 3 into your global stylesheet. If using Tailwind CSS, place it outside of `@layer` directives so it doesn't get purged.

4. **Textured background recommended** — The displacement effect is most visible when there is visual content _behind_ the glass element (a pattern, gradient, image, or other UI elements). A plain solid background won't show much distortion.

5. **Safari fallback** — The `@supports not (hanging-punctuation: first)` block ensures Safari falls back gracefully to plain `blur()`. No action needed — it's automatic.

6. **Performance** — `backdrop-filter` with SVG filters triggers GPU compositing. Avoid applying it to dozens of simultaneously visible elements. 3-5 glass elements on screen at once is fine.

---

## 6. Class Reference

| Class | Blur | Background | Use for |
|---|---|---|---|
| `.bg-liquid-glass` | 4px (+SVG) | `rgba(255,255,255, 0.1)` | Cards, surfaces, light panels |
| `.bg-liquid-glass-panel` | 12px (+SVG) | `rgba(18,18,30, 0.72)` | Heavy panels, navigation bars |
| `.bg-liquid-glass-toast` | 16px (+SVG) | `rgba(26,26,46, 0.7)` | Toast notifications |
| `.bg-liquid-glass-dropdown` | 16px (+SVG) | `rgba(22,22,38, 0.75)` | Dropdowns, context menus |
| `.glass-sheet` | — | — | Adds border, shadow, specular highlight |
| `.glass-sheet-bottom` | — | — | Modifier: removes bottom border |
| `.glass-sheet-center` | — | — | Modifier: symmetrical shadow for modals |

Combine them: `bg-liquid-glass glass-sheet glass-sheet-bottom rounded-t-3xl`

---

## 7. How It Works (Technical Deep-Dive)

### The Displacement Pipeline

```
feTurbulence ──→ feColorMatrix ──→ feDisplacementMap ──→ output
 (noise)          (rotate 30°)      (warp pixels)
```

1. **`feTurbulence`** generates a 2D noise texture using Perlin fractal noise. Each pixel has R, G, B, A channels filled with noise values between 0 and 1. The `baseFrequency` controls the "zoom level" of the noise — lower values produce larger, smoother blobs.

2. **`feColorMatrix`** applies a 5x4 matrix transform to the noise color channels. We use a 2D rotation matrix (cos/sin of 30 degrees) on R and G channels. This rotates the displacement direction, so instead of warping strictly horizontally (R) and vertically (G), the distortion follows a diagonal, which mimics the angled refraction you see through real curved glass.

3. **`feDisplacementMap`** uses the processed noise as a lookup: for each pixel in `SourceGraphic`, it reads the R value at that position from the noise to determine horizontal shift, and the G value for vertical shift. `scale=18` means a noise value of 0.5 (neutral) causes zero shift, while 0 or 1 causes ±9px of shift.

### Why `backdrop-filter` and not `filter`?

- `filter` warps the element's own content (text, images inside it).
- `backdrop-filter` warps what's _behind_ the element — the background, other UI elements, patterns. This is what creates the "looking through glass" illusion while keeping the element's own content crisp and readable.

### The Safari Gate

Safari supports `backdrop-filter` well but has bugs with `url()` SVG filter references inside it. The CSS uses:

```css
@supports not (hanging-punctuation: first) { ... }
```

`hanging-punctuation` is a real CSS property implemented only in Safari. So `@supports not (hanging-punctuation: first)` matches every browser _except_ Safari. On Safari, users still get the `blur()` backdrop filter and all the decorative shadows/borders — just without the displacement warping.

---

## 8. Customization Recipes

### Warmer glass tint
```css
.bg-liquid-glass-warm {
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  background: rgba(255, 200, 150, 0.08);
}
```

### Stronger displacement (more "liquid")
Change `scale` in the SVG filter:
```tsx
<feDisplacementMap scale={40} ... />
```

### Animated displacement
Add `<animate>` to `feTurbulence` to create a slowly shifting glass surface:
```tsx
<feTurbulence
  type="fractalNoise"
  baseFrequency="0.012 0.018"
  numOctaves={3}
  seed={2}
  result="noise"
>
  <animate
    attributeName="seed"
    from="0"
    to="100"
    dur="10s"
    repeatCount="indefinite"
  />
</feTurbulence>
```
> **Warning:** Animated displacement is GPU-heavy. Use sparingly.

### Light theme variant
```css
.bg-liquid-glass-light {
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  background: rgba(255, 255, 255, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.6);
}
```
