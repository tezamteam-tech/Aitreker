# 04. Safe Areas и отступы под системные кнопки Telegram

## Проблема

Внутри Telegram Mini App сверху есть **шапка Telegram** (имя бота, кнопка «Назад», кнопка закрытия). На iOS ещё добавляется **notch / Dynamic Island**. Если не учитывать эти отступы, контент будет перекрыт.

Снизу на мобильных устройствах есть **home indicator** (iOS) или **navigation bar** (Android).

## Два типа safe areas в Telegram

Telegram SDK предоставляет два набора safe area insets:

### 1. Device Safe Area (`--tg-safe-area-inset-*`)
Физические вырезы устройства (notch, dynamic island, home indicator):
- `--tg-safe-area-inset-top` — notch/status bar
- `--tg-safe-area-inset-bottom` — home indicator
- `--tg-safe-area-inset-left` / `right` — боковые вырезы (редко)

### 2. Content Safe Area (`--tg-content-safe-area-inset-*`)
Область, занятая **интерфейсом Telegram** (шапка бота):
- `--tg-content-safe-area-inset-top` — высота шапки Telegram
- Остальные обычно = 0

### Итоговый верхний отступ
```
total_top = --tg-safe-area-inset-top + --tg-content-safe-area-inset-top
```

## CSS-переменная `--app-tg-header-offset`

Мы вычисляем итоговый отступ и сохраняем в единую переменную:

```ts
// В tma.ts
function computeAndSetHeaderOffset(): void {
  if (!_isTelegramApp) return;

  const root = document.documentElement;
  const style = getComputedStyle(root);

  // Читаем CSS vars, которые SDK устанавливает через bindCssVars()
  const safeTop = parseFloat(style.getPropertyValue("--tg-safe-area-inset-top")) || 0;
  const contentTop = parseFloat(style.getPropertyValue("--tg-content-safe-area-inset-top")) || 0;
  const tgTotal = safeTop + contentTop;

  if (tgTotal > 10) {
    // Telegram клиент установил CSS vars — используем
    root.style.setProperty("--app-tg-header-offset", `${tgTotal}px`);
    return;
  }

  // Fallback — CSS vars не установлены (старый клиент)
  let fallback = 56;
  if (platform === "android") fallback = 68;  // status bar + TG header
  if (platform === "ios")     fallback = 90;  // notch + TG header

  root.style.setProperty("--app-tg-header-offset", `${fallback}px`);
}
```

**Почему повторные вызовы с таймаутом?**
Telegram клиент может установить CSS vars с задержкой (особенно при fullscreen). Поэтому:
```ts
computeAndSetHeaderOffset();
setTimeout(computeAndSetHeaderOffset, 300);
setTimeout(computeAndSetHeaderOffset, 1000);
setTimeout(computeAndSetHeaderOffset, 3000);
```

## CSS-утилита `pt-safe`

В `theme.css` определён утилитарный класс:

```css
@layer base {
  /* Отступ сверху = header offset + базовый padding */
  .pt-safe {
    padding-top: calc(var(--app-tg-header-offset, 0px) + 12px);
  }

  /* Уменьшенный вариант */
  .pt-safe-sm {
    padding-top: calc(var(--app-tg-header-offset, 0px) + 6px);
  }
}
```

**Вне Telegram**: `--app-tg-header-offset` не установлен -> fallback `0px` -> отступ = `12px` (обычный padding).

**Внутри Telegram**: `--app-tg-header-offset` = `90px` (iOS) -> отступ = `102px`.

## Использование на страницах

Каждая страница добавляет `pt-safe` к своему корневому контейнеру:

```tsx
// DiscoverPage
<PageTransition className="flex-1 flex flex-col pb-4 pt-safe">

// EventsPage
<div className="px-4 sm:px-6 pt-safe pb-3">

// ProfilePage
<div className="flex-1 flex flex-col px-4 pb-4 sm:px-6 sm:pb-6 pt-safe gap-3">

// AdminLayout
<div className="px-4 pt-safe pb-2">
```

## Нижний safe area (TabBar)

TabBar учитывает нижний safe area для home indicator:

```tsx
// TabBar.tsx — Mobile variant
<div
  className="flex justify-center px-4 sm:px-6 pt-1.5"
  style={{
    paddingBottom: isTelegram
      ? "calc(max(var(--tg-safe-area-inset-bottom, 0px), 8px) + 16px)"
      : "calc(max(env(safe-area-inset-bottom, 0px), 8px) + 16px)",
  }}
>
```

- **Внутри Telegram**: читает `--tg-safe-area-inset-bottom` (из SDK)
- **В браузере**: читает `env(safe-area-inset-bottom)` (стандартный CSS)
- `max(..., 8px)` — минимум 8px даже если safe area = 0
- `+ 16px` — дополнительный отступ от края

## Боковые safe areas (MainLayout)

MainLayout учитывает боковые safe areas (для горизонтальных вырезов, например iPad landscape):

```tsx
// MainLayout.tsx
<div
  className="flex flex-col lg:flex-row overflow-hidden relative"
  style={{
    height: keyboardOpen ? "var(--visual-viewport-height, 100vh)" : "100vh",
    ...(isTelegram ? {
      paddingLeft: safeArea.left > 0 ? `${safeArea.left}px` : undefined,
      paddingRight: safeArea.right > 0 ? `${safeArea.right}px` : undefined,
    } : {}),
  }}
>
```

## Fullscreen и пересчёт offset

При входе/выходе из fullscreen safe areas меняются. Хук `useTelegramFullscreen` слушает `fullscreenchange`:

```ts
document.addEventListener("fullscreenchange", () => {
  recomputeHeaderOffset(); // Пересчитать CSS var
});
```

## Переделка в другом проекте

1. В `tma.ts`:
   - Функция `computeAndSetHeaderOffset()` — вычисляет `--app-tg-header-offset`
   - Вызывать после `initTma()` + с таймаутами
   - Экспортировать `recomputeHeaderOffset()` для fullscreen

2. В `theme.css`:
   ```css
   .pt-safe { padding-top: calc(var(--app-tg-header-offset, 0px) + 12px); }
   .pt-safe-sm { padding-top: calc(var(--app-tg-header-offset, 0px) + 6px); }
   ```

3. На каждой странице: добавить `pt-safe` к верхнему элементу

4. В TabBar:
   - Внутри Telegram: `var(--tg-safe-area-inset-bottom)`
   - В браузере: `env(safe-area-inset-bottom)`

5. В MainLayout: боковые `safeArea.left` / `safeArea.right` (если нужно)

6. **Важно**: `viewport.mount()` + `viewport.bindCssVars()` должны быть вызваны в `initTma()`, иначе `--tg-safe-area-*` vars не появятся
