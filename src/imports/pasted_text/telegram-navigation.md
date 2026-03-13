# 06. Навигация: Back Button, Smart Back, TabBar

## Проблема навигации в Telegram Mini App

В Telegram есть **нативная кнопка «Назад»** в шапке. Её нужно:
1. Показывать/скрывать в зависимости от страницы
2. Привязывать к правильному действию (назад или fallback)
3. Не показывать на главных табах

Дополнительная проблема: **deep links**. Когда пользователь открывает Mini App через ссылку `t.me/Bot/app?startapp=event_123`, у него нет истории навигации. `navigate(-1)` либо ничего не сделает, либо закроет Mini App.

## useBackButton — управление нативной кнопкой

Файл: `/src/app/shared/hooks/useTelegramApp.ts` (в конце файла)

```tsx
export function useBackButton(visible: boolean, onBack: VoidFunction): void {
  const { isTelegram } = useTma();
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!isTelegram) return;

    try {
      if (visible) {
        backButton.show();
        const off = backButton.onClick(() => onBackRef.current());
        return () => {
          off();           // Удалить обработчик
          backButton.hide(); // Скрыть кнопку
        };
      } else {
        backButton.hide();
      }
    } catch {
      // BackButton not supported
    }
  }, [isTelegram, visible]);
}
```

## useSmartBack — умная навигация назад

Файл: `/src/app/shared/hooks/useSmartBack.ts`

### Ключевая проверка: есть ли in-app история?

```ts
export function hasInAppHistory(): boolean {
  const idx = window.history.state?.idx;
  return typeof idx === "number" && idx > 0;
}
```

React Router хранит `idx` в `history.state`. Если `idx === 0` — это первая запись, навигация назад невозможна.

### Fallback маршруты

Когда истории нет, нужно перенаправить на логическую «родительскую» страницу:

```ts
const FALLBACK_ROUTES = [
  { prefix: "/events/",        fallback: "/events" },
  { prefix: "/member/",        fallback: "/community" },
  { prefix: "/network/profile", fallback: "/network" },
  { prefix: "/network/matches", fallback: "/network" },
  { prefix: "/admin/",         fallback: "/admin" },
  { prefix: "/favorites",      fallback: "/profile" },
  // ... и т.д.
];

const DEFAULT_FALLBACK = "/discover";
```

### Хук

```ts
export function useSmartBack(fallbackOverride?: string): () => void {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(() => {
    setNavigationDirection("back"); // Для анимации перехода
    if (hasInAppHistory()) {
      navigate(-1);
    } else {
      const target = fallbackOverride ?? getFallbackRoute(location.pathname);
      navigate(target, { replace: true });
    }
  }, [navigate, location.pathname, fallbackOverride]);
}
```

### Standalone-версия (для MainLayout)

```ts
export function smartBack(navigateFn, pathname, fallbackOverride?) {
  setNavigationDirection("back");
  if (hasInAppHistory()) {
    navigateFn(-1);
  } else {
    navigateFn(getFallbackRoute(pathname), { replace: true });
  }
}
```

## MainLayout — централизованное управление

Файл: `/src/app/shared/layout/MainLayout.tsx`

### Определение «топовых» маршрутов

На этих маршрутах кнопка «Назад» НЕ показывается:
```ts
const TOP_LEVEL_TABS = ["/discover", "/events", "/network", "/bonuses", "/profile"];

function isTopLevelRoute(pathname: string): boolean {
  return pathname === "/" || TOP_LEVEL_TABS.includes(pathname);
}
```

### Привязка BackButton

```tsx
export function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const haptic = useHaptic();

  const handleBack = useCallback(() => {
    if (hasInAppHistory()) {
      haptic.impact("light");    // Обычный «назад» — лёгкая вибрация
    } else {
      haptic.impact("rigid");    // Fallback — отличимая вибрация
    }
    smartBack(navigate, location.pathname);
  }, [haptic, navigate, location.pathname]);

  // Показываем BackButton на всех маршрутах КРОМЕ топовых
  useBackButton(!isTopLevelRoute(location.pathname), handleBack);

  // ...
}
```

### Скрытие TabBar на подстраницах

```ts
const HIDE_TABBAR_ROUTES = [
  "/profile/qr", "/scan", "/profile/activity",
  "/achievements", "/favorites", "/referrals",
  "/orders", "/settings", "/admin",
  "/network/profile", "/network/matches",
  "/member", "/legal",
];

function shouldHideTabBar(pathname: string): boolean {
  return HIDE_TABBAR_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}
```

## TabBar — два варианта

Файл: `/src/app/shared/layout/TabBar.tsx`

### Mobile: floating pill (bottom)
- Floating rounded pill с glassmorphism
- Safe area padding снизу
- Скрывается при клавиатуре/модалках
- Active tab: подсвеченный фон + индикатор сверху

### Desktop: sidebar (left)
- Glass sidebar с логотипом
- Active tab: подсвеченный фон + индикатор слева
- Всегда видна

```tsx
<TabBar variant="mobile" />  {/* В mobile layout */}
<TabBar variant="sidebar" /> {/* В desktop layout */}
```

### Haptic feedback на переключение табов

```tsx
onClick={() => {
  haptic.selectionChanged(); // Лёгкая вибрация при смене таба
  navigate(tab.path);
}}
```

## Анимации переходов между страницами

MainLayout использует `AnimatePresence mode="popLayout"`:
- Выходящая страница анимируется **одновременно** с входящей (overlapping)
- Направление анимации определяется `getNavigationDirection()`
- `"forward"`: slide up + fade in
- `"back"`: slide from left + fade in

```tsx
const pageVariants = {
  initial: (dir) => ({
    opacity: 0,
    x: dir === "back" ? -24 : 0,
    y: dir === "back" ? 0 : 12,
  }),
  animate: {
    opacity: 1, x: 0, y: 0,
    transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] },
  },
  exit: (dir) => ({
    opacity: 0,
    x: dir === "back" ? 24 : 0,
    y: dir === "back" ? 0 : -8,
    transition: { duration: 0.18 },
  }),
};

<AnimatePresence mode="popLayout" custom={navDirection}>
  <motion.div
    key={location.pathname}
    custom={navDirection}
    variants={pageVariants}
    initial="initial"
    animate="animate"
    exit="exit"
  >
    <Outlet />
  </motion.div>
</AnimatePresence>
```

## useHaptic — Haptic Feedback

```ts
export function useHaptic(): TmaHaptic {
  const { isTelegram } = useTma();
  return useMemo(() => {
    if (!isTelegram) {
      return { impact: NOOP, notification: NOOP, selectionChanged: NOOP };
    }
    return {
      impact: (style = "medium") => hapticFeedback.impactOccurred(style),
      notification: (type = "success") => hapticFeedback.notificationOccurred(type),
      selectionChanged: () => hapticFeedback.selectionChanged(),
    };
  }, [isTelegram]);
}
```

Стили impact: `light`, `medium`, `heavy`, `rigid`, `soft`
Типы notification: `error`, `success`, `warning`

## Переделка в другом проекте

1. **useSmartBack**: скопировать, адаптировать `FALLBACK_ROUTES` под свои маршруты

2. **useBackButton**: скопировать как есть

3. **MainLayout**:
   - Определить свои `TOP_LEVEL_TABS` и `HIDE_TABBAR_ROUTES`
   - Вызвать `useBackButton(!isTopLevelRoute(path), handleBack)`
   - Вызвать `useTelegramFullscreen()`
   - Обернуть `<Outlet />` в `AnimatePresence` (опционально)

4. **TabBar**:
   - Адаптировать табы под свои маршруты
   - Учитывать `--tg-safe-area-inset-bottom` для нижнего отступа
   - Haptic feedback: `haptic.selectionChanged()` при переключении

5. **Haptic**: вызывать `hapticFeedback.mount()` не нужно — он stateless
