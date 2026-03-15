# 09. Pattern Background — Mesh Gradient + Organic SVG Overlay

## Что это

Фон приложения состоит из двух слоёв:
1. **Mesh gradient** — мягкие цветные пятна, дают glass-элементам цвет для преломления
2. **Organic SVG pattern** — импортированный из Figma абстрактный узор, накладывается поверх mesh для текстуры

Оба слоя фиксированы, за контентом, не интерактивны. Автоматически переключаются между light и dark темой через CSS-переменные.

## Файлы для копирования

| Файл | Назначение |
|------|-----------|
| `PatternBackground.tsx` | React-компонент (два div-слоя) |
| `organic-pattern-path.ts` | SVG path data (экспорт строки ~55KB) |
| CSS в `theme.css` | Переменные `--mesh-gradient` + класс `.bg-mesh-gradient` |

---

## Шаг 1: CSS-переменные (добавить в `theme.css`)

```css
/* ── Light theme ──────────────────────────────────────────────── */
:root {
  /* Mesh gradient — пастельный, воздушный, едва заметные цветные пятна */
  --mesh-gradient:
    radial-gradient(ellipse 65% 55% at 15% 20%, rgba(86, 150, 214, 0.035) 0%, transparent 70%),
    radial-gradient(ellipse 55% 65% at 80% 10%, rgba(140, 170, 230, 0.03) 0%, transparent 65%),
    radial-gradient(ellipse 60% 50% at 60% 80%, rgba(72, 199, 220, 0.03) 0%, transparent 65%),
    radial-gradient(ellipse 50% 55% at 25% 75%, rgba(251, 210, 100, 0.018) 0%, transparent 60%),
    linear-gradient(160deg, rgba(252, 253, 255, 1) 0%, rgba(248, 250, 254, 1) 100%);
}

/* ── Dark theme ───────────────────────────────────────────────── */
.dark {
  /* Mesh gradient — глубокий, насыщенный, светящиеся цветные пятна */
  --mesh-gradient:
    radial-gradient(ellipse 65% 55% at 15% 20%, rgba(86, 109, 214, 0.18) 0%, transparent 70%),
    radial-gradient(ellipse 55% 65% at 80% 10%, rgba(168, 130, 255, 0.12) 0%, transparent 65%),
    radial-gradient(ellipse 60% 50% at 60% 80%, rgba(72, 199, 220, 0.10) 0%, transparent 65%),
    radial-gradient(ellipse 50% 55% at 25% 75%, rgba(251, 191, 36, 0.06) 0%, transparent 60%),
    linear-gradient(160deg, rgba(14, 14, 22, 1) 0%, rgba(8, 8, 16, 1) 100%);
}

/* ── Utility class ────────────────────────────────────────────── */
.bg-mesh-gradient {
  background: var(--mesh-gradient);
}
```

### Разбор mesh gradient

Gradient состоит из 5 слоёв (от верхнего к нижнему):

| Слой | Позиция | Цвет | Назначение |
|------|---------|------|-----------|
| 1 | 15% 20% (верх-лево) | Sky blue | Холодный акцент |
| 2 | 80% 10% (верх-право) | Lilac | Мягкий фиолетовый |
| 3 | 60% 80% (низ-центр) | Cyan/teal | Бирюзовый акцент |
| 4 | 25% 75% (низ-лево) | Warm yellow | Тёплый контраст |
| 5 | 160° linear | White/dark | Базовый фон |

В **light** теме opacity пятен: `0.018–0.035` (едва заметно, воздушно).
В **dark** теме opacity пятен: `0.06–0.18` (ярче, чтобы glass-элементы имели что преломлять на тёмном фоне).

---

## Шаг 2: SVG Path Data

Создать файл `organic-pattern-path.ts`:

```ts
/**
 * Organic pattern SVG path data
 *
 * Imported from Figma. Original dimensions: 1928.01 × 1081.02 (landscape).
 * The PatternBackground component rotates it -90° for portrait orientation.
 *
 * This is a complex decorative pattern — ~55KB of path data.
 */
export const ORGANIC_PATTERN_PATH = "M0.000999928 0.000999987H92.032C90.327..."; // ПОЛНЫЕ ДАННЫЕ НИЖЕ
```

> **Полные данные SVG path** находятся в файле-компаньоне:
> `/src/docs/09_PATTERN_SVG_DATA.ts`
>
> Скопируйте его в свой проект как есть.

---

## Шаг 3: React-компонент `PatternBackground.tsx`

```tsx
/**
 * PatternBackground
 *
 * Two-layer fixed background:
 * Layer 1: Mesh gradient (CSS var --mesh-gradient, auto light/dark)
 * Layer 2: Organic SVG pattern overlay (low opacity, rotated for portrait)
 *
 * Place once in root layout. Both layers use z-[-1] to stay behind content.
 */

import React from "react";
import { ORGANIC_PATTERN_PATH } from "./organic-pattern-path";
// ^ Adjust import path to where you placed the file

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
          SVG source is landscape (1928×1081).
          Rotate -90° → portrait (~1081×1928).
          min-w/min-h with viewport units → always covers screen.
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
```

---

## Шаг 4: Подключение в Layout

```tsx
// MainLayout.tsx (или ваш корневой layout)
import { PatternBackground } from "../components/PatternBackground";

export function MainLayout() {
  return (
    <div className="flex flex-col overflow-hidden relative" style={{ height: "100vh" }}>
      {/* Фон — первый элемент, z-[-1] */}
      <PatternBackground />

      {/* Остальной контент */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
```

---

## Ключевые детали

### Почему `z-[-1]`?
Оба слоя фона используют `z-[-1]` (Tailwind v4: отрицательный z-index). Это помещает их **за** всем контентом, но они остаются видимыми через `backdrop-filter: blur()` glass-элементов.

### Почему НЕ ставить z-index на контейнер контента?
> **Критическое правило**: z-index создаёт новый stacking context. Если поставить `z-10` на `<main>`, то `backdrop-filter` glass-карточек будет «видеть» только элементы внутри этого stacking context (прозрачный фон = ничего для blur). Без z-index glass-элементы видят **PatternBackground** насквозь.

### SVG: ландшафт → портрет
Исходный SVG — горизонтальный (1928×1081). Для мобильного UI поворачиваем на -90°:
- `min-w-[100vh]` — ширина = высота экрана
- `min-h-[100vw]` — высота = ширина экрана
- `-rotate-90` — Tailwind класс поворота
- `preserveAspectRatio="xMidYMid slice"` — SVG обрезается, но всегда покрывает

### Opacity по темам
- **Light**: `opacity-[0.35]` — паттерн хорошо виден
- **Dark**: `dark:opacity-[0.15]` — приглушён, чтобы не мешать
- `transition-opacity duration-500` — плавный переход при смене темы

### `fill="currentColor"` + `fillOpacity="0.2"`
SVG наследует `color` от CSS (`currentColor`). В light — это тёмный цвет, в dark — светлый. `fillOpacity="0.2"` дополнительно приглушает.

---

## Без SVG паттерна (минимальный вариант)

Если не нужен органический паттерн, можно оставить только mesh gradient:

```tsx
export function PatternBackground() {
  return (
    <div
      className="fixed inset-0 z-[-1] pointer-events-none bg-mesh-gradient"
      aria-hidden="true"
    />
  );
}
```

Mesh gradient один уже даёт красивый фон для glassmorphism.

---

## Кастомизация mesh gradient

### Изменить цвета
Каждый `radial-gradient` — это одно цветное пятно. Меняйте `rgba(...)` значения:
```css
/* Добавить розовый акцент вместо жёлтого (слой 4) */
radial-gradient(ellipse 50% 55% at 25% 75%, rgba(255, 100, 150, 0.04) 0%, transparent 60%),
```

### Изменить интенсивность
- Увеличить opacity в rgba → ярче пятна
- Увеличить `%` размеров ellipse → больше пятно
- Изменить позицию `at X% Y%` → передвинуть пятно

### Добавить анимацию (опционально)
```css
@keyframes mesh-shift {
  0%, 100% { background-position: 0% 0%; }
  50% { background-position: 100% 100%; }
}

.bg-mesh-gradient {
  background: var(--mesh-gradient);
  background-size: 200% 200%;
  animation: mesh-shift 30s ease-in-out infinite;
}
```

---

## Чеклист для нового проекта

- [ ] Скопировать CSS-переменные `--mesh-gradient` в `:root` и `.dark`
- [ ] Добавить класс `.bg-mesh-gradient` в CSS
- [ ] Скопировать `/src/docs/09_PATTERN_SVG_DATA.ts` как `organic-pattern-path.ts`
- [ ] Скопировать `PatternBackground.tsx`
- [ ] Подключить `<PatternBackground />` первым элементом в корневом layout
- [ ] Убедиться что `dark:` вариант Tailwind работает через класс (см. документ 03)
- [ ] **Не ставить z-index** на контейнер контента (иначе glass не работает)