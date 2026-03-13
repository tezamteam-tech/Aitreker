# 05. Клавиатура, Viewport, Fullscreen

## Проблема viewport в Mini App

В Telegram Mini App viewport ведёт себя иначе, чем в обычном браузере:
- `100vh` может быть больше видимой области (из-за шапки Telegram)
- При открытии клавиатуры viewport уменьшается, но `100vh` не меняется
- Telegram предоставляет свои viewport events

## useKeyboardVisibility — определение клавиатуры

Файл: `/src/app/shared/hooks/useKeyboardVisibility.ts`

### Множество источников данных

Хук использует **5 сигналов** параллельно для надёжного определения:

1. **`window.visualViewport` resize** — основной, кросс-браузерный
2. **`window.visualViewport` scroll** — iOS перемещает viewport при скролле с клавиатурой
3. **`focusin` / `focusout`** — отслеживание фокуса на input/textarea
4. **`window.resize`** — смена ориентации, не-клавиатурный resize
5. **Telegram `viewportChanged` event** — TMA-специфичный

### CSS-переменные

Хук устанавливает CSS vars на `<html>`:

```ts
function setCssVars(isOpen: boolean, kbHeight: number, vvHeight: number): void {
  const root = document.documentElement;
  root.style.setProperty("--kb-height", `${kbHeight}px`);            // Высота клавиатуры
  root.style.setProperty("--visual-viewport-height", `${vvHeight}px`); // Текущая видимая высота
  root.style.setProperty("--kb-open", isOpen ? "1" : "0");            // Флаг
}
```

### CSS-утилиты в theme.css

```css
/* Высота = visual viewport (уменьшается при клавиатуре) */
.h-visual-viewport {
  height: var(--visual-viewport-height, 100vh);
}

/* Нижний padding, учитывающий клавиатуру */
.pb-kb-safe {
  padding-bottom: calc(var(--kb-height, 0px) + 8px);
}

/* Позиция «прилипшего» элемента над клавиатурой */
.bottom-kb {
  bottom: var(--kb-height, 0px);
}
```

### Автоскролл к фокусированному элементу

При открытии клавиатуры хук автоматически скроллит к активному input:

```ts
if (isOpen && kbHeight > 0) {
  requestAnimationFrame(() => scrollFocusedIntoView(kbHeight));
}
```

### Ключевая логика определения

```ts
const delta = referenceHeight - currentHeight;
const isOpen = delta > 100 && inputFocusedRef.current; // 100px порог
```

Два условия: viewport уменьшился более чем на 100px **И** input в фокусе.

## useTabBarVisibility — скрытие TabBar

Файл: `/src/app/shared/hooks/useTabBarVisibility.ts`

TabBar скрывается когда:
1. Клавиатура открыта (`useKeyboardVisibility`)
2. Модальное окно открыто (MutationObserver на `[data-vaul-overlay]`, `[role="dialog"]`, `body.style.overflow`)

```ts
export function useTabBarVisibility(): boolean {
  const { isOpen: keyboardOpen } = useKeyboardVisibility();
  const [modalOpen, setModalOpen] = useState(false);

  // MutationObserver для модалок...

  return !keyboardOpen && !modalOpen;
}
```

## MainLayout — адаптивная высота

```tsx
<div
  style={{
    // Клавиатура открыта: точная высота visual viewport
    // Закрыта: стабильная 100vh
    height: keyboardOpen
      ? "var(--visual-viewport-height, 100vh)"
      : "100vh",
    transition: keyboardOpen ? "none" : "height 0.2s ease-out",
  }}
>
```

При открытой клавиатуре анимация отключается (`transition: none`) — иначе будет дёрганье.

## useTelegramFullscreen — полноэкранный режим

Файл: `/src/app/shared/hooks/useTelegramFullscreen.ts`

Этот хук делает три вещи:

### 1. Отключает вертикальный свайп (swipe-to-close)
```ts
// SDK
swipeBehavior.disableVertical();

// Нативный fallback
(window as any).Telegram?.WebApp?.disableVerticalSwipes();
```

### 2. Включает подтверждение закрытия
```ts
// SDK
closingBehavior.enableConfirmation();

// Нативный fallback
(window as any).Telegram?.WebApp?.enableClosingConfirmation();
```

### 3. Запрашивает fullscreen (Bot API 8.0+)
```ts
// SDK
await viewport.requestFullscreen();

// Нативный fallback
(window as any).Telegram?.WebApp?.requestFullscreen();
```

### Платформенные особенности

- **Android**: fullscreen часто не срабатывает с первого раза. Используется:
  - 500ms задержка перед первой попыткой
  - Retry через 1000ms при ошибке
  - Второй retry через 2000ms с нативным API
  - `sessionStorage.tma_fullscreen_done` — отслеживание

- **iOS**: работает сразу, вызывается немедленно

- **Desktop**: fullscreen не запрашивается (не мобильная платформа)

### Определение платформы

```ts
function getPlatform(): string {
  try {
    const lp = retrieveLaunchParams();
    return lp?.tgWebAppPlatform ?? "unknown";
  } catch {
    return (window as any).Telegram?.WebApp?.platform ?? "unknown";
  }
}

function isMobile(platform: string): boolean {
  return ["android", "android_x", "ios"].includes(platform);
}
```

### Слушаем fullscreenchange для пересчёта offset

```ts
document.addEventListener("fullscreenchange", () => {
  recomputeHeaderOffset(); // Safe areas меняются при fullscreen
});
```

## Переделка в другом проекте

1. **useKeyboardVisibility**: скопировать как есть. Основные точки настройки:
   - `KEYBOARD_THRESHOLD = 100` — порог определения клавиатуры
   - `FOCUS_CHECK_DELAY = 350` — задержка для анимации клавиатуры
   - CSS vars: `--kb-height`, `--visual-viewport-height`, `--kb-open`

2. **useTabBarVisibility**: скопировать, адаптировать селекторы модалок под свою библиотеку

3. **useTelegramFullscreen**: скопировать. Обратить внимание:
   - Нужен mount для `swipeBehavior` и `closingBehavior` в `initTma()`
   - Android requires special retry logic
   - Вызывать в MainLayout: `useTelegramFullscreen()`

4. **MainLayout height**:
   ```tsx
   height: keyboardOpen ? "var(--visual-viewport-height, 100vh)" : "100vh"
   ```

5. В `theme.css` добавить утилиты:
   ```css
   .h-visual-viewport { height: var(--visual-viewport-height, 100vh); }
   .pb-kb-safe { padding-bottom: calc(var(--kb-height, 0px) + 8px); }
   .bottom-kb { bottom: var(--kb-height, 0px); }
   ```
