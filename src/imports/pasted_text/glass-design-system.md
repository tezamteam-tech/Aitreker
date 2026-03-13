# 07. Glass Design System (Glassmorphism / Liquid Glass)

## Концепция

Весь UI построен на glassmorphism — полупрозрачные поверхности с backdrop-blur, которые «видят» контент позади себя. Для усиления эффекта используется SVG displacement filter, создающий эффект преломления как через настоящее стекло.

## Архитектура

```
PatternBackground (mesh gradient) — фоновый слой, даёт стеклу что-то для преломления
     |
LiquidGlassFilter (SVG) — displacement map filter в DOM
     |
Glass CSS classes — backdrop-filter: url(#filter) blur(...)
     |
GlassCard / glass-sheet — декоративные обёртки (border, shadow, noise)
```

## CSS-переменные: два набора (light / dark)

### Light (`:root`)
```css
:root {
  /* Поверхности — больше opacity для читаемости на светлом */
  --glass-bg:        rgba(255, 255, 255, 0.45);
  --glass-bg-card:   rgba(255, 255, 255, 0.50);
  --glass-bg-row:    rgba(255, 255, 255, 0.35);
  --glass-bg-button: rgba(255, 255, 255, 0.40);
  --glass-bg-panel:  rgba(245, 247, 252, 0.85);

  /* Границы — тёмные, едва заметные */
  --glass-border:        rgba(0, 0, 0, 0.08);
  --glass-border-subtle: rgba(0, 0, 0, 0.05);

  /* Тени */
  --glass-shadow-card:  inset 0 0.5px 0 0 rgba(255,255,255,0.15), 0 4px 16px rgba(0,0,0,0.06);
  --glass-shadow-sheet: inset 0 1px 0 0 rgba(255,255,255,0.2), 0 -8px 32px rgba(0,0,0,0.15);

  /* Текстура шума */
  --glass-noise-opacity: 0.032;

  /* Значения blur */
  --glass-blur-base:   4px;
  --glass-blur-card:   4px;
  --glass-blur-panel:  12px;
  --glass-blur-row:    4px;
  --glass-blur-button: 4px;

  /* Mesh gradient — пастельный, воздушный */
  --mesh-gradient: radial-gradient(...light...),
                   linear-gradient(160deg, rgba(252,253,255,1) 0%, rgba(248,250,254,1) 100%);
}
```

### Dark (`.dark`)
```css
.dark {
  --glass-bg:        rgba(255, 255, 255, 0.04);  /* Почти прозрачный */
  --glass-bg-card:   rgba(255, 255, 255, 0.06);
  --glass-bg-row:    rgba(255, 255, 255, 0.03);
  --glass-bg-button: rgba(255, 255, 255, 0.04);
  --glass-bg-panel:  rgba(18, 18, 30, 0.72);     /* Тёмная полупрозрачная */

  --glass-border:        rgba(255, 255, 255, 0.12);
  --glass-border-subtle: rgba(255, 255, 255, 0.06);

  --glass-shadow-card:  inset 0 0.5px 0 0 rgba(255,255,255,0.08), 0 4px 16px rgba(0,0,0,0.25);
  --glass-shadow-sheet: inset 0 1px 0 0 rgba(255,255,255,0.12), 0 -8px 32px rgba(0,0,0,0.4);

  --glass-noise-opacity: 0.05;

  --mesh-gradient: radial-gradient(...dark...),
                   linear-gradient(160deg, rgba(14,14,22,1) 0%, rgba(8,8,16,1) 100%);
}
```

## CSS-классы поверхностей

Классы не дублируются для dark — переменные сами переключаются:

```css
/* Базовая поверхность */
.bg-liquid-glass {
  backdrop-filter: blur(var(--glass-blur-base));
  -webkit-backdrop-filter: blur(var(--glass-blur-base));
  background: var(--glass-bg);
}

/* Карточка */
.bg-glass-card {
  backdrop-filter: blur(var(--glass-blur-card));
  -webkit-backdrop-filter: blur(var(--glass-blur-card));
  background: var(--glass-bg-card);
}

/* Тяжёлая панель (навбар, bottom sheet) */
.bg-liquid-glass-panel {
  backdrop-filter: blur(var(--glass-blur-panel));
  -webkit-backdrop-filter: blur(var(--glass-blur-panel));
  background: var(--glass-bg-panel);
}

/* Строка списка / инпут */
.bg-glass-row {
  backdrop-filter: blur(var(--glass-blur-row));
  background: var(--glass-bg-row);
  border: 1px solid var(--glass-border-subtle);
}

/* Интерактивная кнопка */
.bg-glass-button {
  backdrop-filter: blur(var(--glass-blur-button));
  background: var(--glass-bg-button);
  border: 1px solid var(--glass-border-subtle);
  transition: background 0.2s ease, box-shadow 0.2s ease;
}
.bg-glass-button:active { background: var(--glass-bg-row); }

/* Mesh gradient фон */
.bg-mesh-gradient { background: var(--mesh-gradient); }
```

## SVG Displacement Filter — «настоящее» преломление

### Компонент LiquidGlassFilter

Рендерится один раз в `MainLayout`, невидим:

```tsx
export function LiquidGlassFilter() {
  return (
    <svg aria-hidden="true" style={{ position: "absolute", width: 0, height: 0 }}>
      <filter id="liquidGlassFilter" x="-10%" y="-10%" width="120%" height="120%">
        {/* 1. Фрактальный шум — органическая текстура искажения */}
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.012 0.018"  {/* Асимметричный: крупные «блобы» */}
          numOctaves={3}
          seed={2}
          result="noise"
        />

        {/* 2. Поворот направления искажения на ~30° */}
        <feColorMatrix
          in="noise"
          type="matrix"
          values="0.866 0.5 0 0 0  -0.5 0.866 0 0 0  0 0 1 0 0  0 0 0 1 0"
          result="rotatedNoise"
        />

        {/* 3. Применение шума как displacement map */}
        <feDisplacementMap
          in="SourceGraphic"
          in2="rotatedNoise"
          scale={18}              {/* 18 = субтильное. 30-60 = драматичное */}
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  );
}
```

### CSS Enhancement — только для не-Safari

Safari ломается с `url()` внутри `backdrop-filter`. Используем хак:

```css
/* hanging-punctuation — CSS-свойство, которое поддерживает ТОЛЬКО Safari.
   Поэтому @supports NOT ... сработает для Chrome, Firefox, и всех остальных. */
@supports not (hanging-punctuation: first) {
  .bg-liquid-glass {
    backdrop-filter: url(#liquidGlassFilter) blur(2px);
  }
  .bg-glass-card {
    backdrop-filter: url(#liquidGlassFilter) blur(2px);
  }
  .bg-liquid-glass-panel {
    backdrop-filter: url(#liquidGlassFilter) blur(6px);
  }
  .bg-glass-row {
    backdrop-filter: url(#liquidGlassFilter) blur(2px);
  }
  .bg-glass-button {
    backdrop-filter: url(#liquidGlassFilter) blur(2px);
  }
}
```

**Safari получает**: обычный `blur()` без SVG — выглядит хорошо.
**Chrome/Firefox получают**: `url(#liquidGlassFilter) blur()` — настоящее преломление.

## Декорации

### glass-sheet — для модалок и bottom sheets

```css
.glass-sheet {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow-sheet);
}

/* Спекулярный блик сверху — имитация отражения света */
.glass-sheet::before {
  content: '';
  position: absolute;
  top: 0; left: 8%; right: 8%;
  height: 1px;
  background: linear-gradient(90deg,
    transparent,
    rgba(255,255,255,0.3) 30%,
    rgba(255,255,255,0.45) 50%,
    rgba(255,255,255,0.3) 70%,
    transparent
  );
  pointer-events: none;
  z-index: 1;
}
```

### glass-noise — текстура зернистости

```css
.glass-noise { position: relative; }
.glass-noise::after {
  content: "";
  position: absolute;
  inset: 0; z-index: 2;
  pointer-events: none;
  border-radius: inherit;
  opacity: var(--glass-noise-opacity);
  background-image: url("data:image/svg+xml,..."); /* SVG noise */
  background-size: 128px 128px;
  mix-blend-mode: overlay;
}
```

### glass-card-border — границы для карточек

```css
.glass-card-border {
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow-card);
}
```

## GlassCard компонент

```tsx
export function GlassCard({ children, className, variant = "default", ...props }) {
  const variants = {
    default:     "border border-white/[0.08]",
    elevated:    "border border-white/[0.12] shadow-lg shadow-black/20",
    interactive: "border border-white/[0.08] hover:border-white/[0.14] active:scale-[0.98]",
    accent:      "border border-[#566DD6]/25",
  };

  return (
    <div
      className={`rounded-2xl bg-glass-card ${variants[variant]} ${className}`}
      style={{
        boxShadow: "inset 0 0.5px 0 0 rgba(255,255,255,0.1), 0 4px 16px rgba(0,0,0,0.12)",
      }}
      {...props}
    >
      {children}
    </div>
  );
}
```

## PatternBackground — фон приложения

```tsx
export function PatternBackground() {
  return (
    <>
      {/* Mesh gradient — даёт стеклу цвет для искажения */}
      <div className="fixed inset-0 z-[-1] pointer-events-none bg-mesh-gradient" />

      {/* Органический паттерн — текстура */}
      <div className="fixed inset-0 z-[-1] pointer-events-none opacity-[0.35] dark:opacity-[0.15]">
        <svg>...</svg>
      </div>
    </>
  );
}
```

**Важно**: z-index стекинг! `PatternBackground` — `z-[-1]`. Контент — без z-index (чтобы не создавать stacking context и glass видел сквозь к фону).

## Переделка в другом проекте

1. **Минимум (без SVG filter)**:
   - CSS-переменные в `:root` / `.dark`
   - CSS-классы `.bg-glass-card` и т.д.
   - `PatternBackground` с mesh gradient
   - `GlassCard` компонент

2. **Полный эффект (с SVG filter)**:
   - Добавить `LiquidGlassFilter` компонент
   - Рендерить его один раз в корневом layout
   - Добавить `@supports not (hanging-punctuation: first)` блок в CSS

3. **Ключевое правило z-index**:
   > Не ставьте z-index на контейнер контента! z-index создаёт stacking context, и backdrop-filter будет «видеть» только элементы внутри этого контекста, а не PatternBackground за ним.
