# 02. Инициализация Telegram Mini Apps SDK

## Зависимость

```bash
npm install @tma.js/sdk-react
# Используется версия 3.x — import paths отличаются от v2
```

## Порядок инициализации

### Шаг 1: Утилита `tma.ts` — ядро инициализации

Файл: `/src/app/shared/utils/tma.ts`

Это модуль с side-effects. Экспортирует функцию `initTma()` которая вызывается один раз.

```ts
import {
  init as sdkInit,
  isTMA,
  retrieveRawInitData,
  retrieveLaunchParams,
  setDebug,
  viewport,
  themeParams,
  backButton,
  miniApp,
  swipeBehavior,
  closingBehavior,
} from "@tma.js/sdk-react";

let initialized = false;
let _isTelegramApp = false;
let _rawInitData: string | undefined;

export function initTma(debug: boolean): void {
  if (initialized) return;
  initialized = true;

  if (debug) setDebug(true);

  try {
    // 1. Проверяем: мы внутри Telegram?
    const inTelegram = isTMA(); // синхронная проверка URL hash + window.Telegram
    if (!inTelegram) {
      _isTelegramApp = false;
      return; // Работаем как обычный сайт
    }

    // 2. Инициализируем SDK
    sdkInit(); // настраивает event listeners, postEvent, версию

    _isTelegramApp = true;

    // 3. Кешируем initData (для авторизации на бэкенде)
    try {
      _rawInitData = retrieveRawInitData() ?? undefined;
    } catch {
      _rawInitData = undefined;
    }

    // 4. Mount компоненты для реактивных сигналов
    try {
      themeParams.mount();
      themeParams.bindCssVars(); // Автоматически устанавливает --tg-theme-* CSS vars
    } catch (err) {
      console.warn("[TMA] ThemeParams mount failed:", err);
    }

    try {
      backButton.mount();
    } catch (err) {
      console.warn("[TMA] BackButton mount failed:", err);
    }

    try {
      swipeBehavior.mount();
    } catch (err) {
      console.warn("[TMA] SwipeBehavior mount failed:", err);
    }

    try {
      closingBehavior.mount();
    } catch (err) {
      console.warn("[TMA] ClosingBehavior mount failed:", err);
    }

    // 5. Viewport — async mount
    try {
      viewport.mount().then(() => {
        viewport.bindCssVars(); // --tg-viewport-*, --tg-safe-area-*, --tg-content-safe-area-*
        viewport.expand();      // Развернуть на максимальную высоту
      });
    } catch {}

    // 6. Сигнализируем готовность
    miniApp.ready();

    // 7. Цвет шапки Telegram (сливается с фоном приложения)
    miniApp.setHeaderColor("bg_color");

    // 8. Дублирование через нативный API (belt-and-suspenders)
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      tg.requestFullscreen?.(); // Bot API 8.0+
      tg.disableVerticalSwipes?.(); // Bot API 7.7+
      tg.setHeaderColor?.("bg_color");
      tg.setBottomBarColor?.("bg_color");
    }

    // 9. Вычислить header offset для отступов
    computeAndSetHeaderOffset();
    setTimeout(computeAndSetHeaderOffset, 300);  // CSS vars могут прийти с задержкой
    setTimeout(computeAndSetHeaderOffset, 1000);
    setTimeout(computeAndSetHeaderOffset, 3000);

  } catch (err) {
    console.warn("[TMA] SDK init failed:", err);
    _isTelegramApp = false;

    // Fallback: пробуем нативный Telegram.WebApp
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.initData?.length > 0) {
        _rawInitData = tg.initData;
        _isTelegramApp = true;
        tg.ready?.();
        tg.expand?.();
        computeAndSetHeaderOffset();
      }
    } catch {}
  }
}
```

### Шаг 2: TmaProvider — React обёртка

Файл: `/src/app/providers/TmaProvider.tsx`

```tsx
const TmaContext = createContext<{ isReady: boolean; isTelegram: boolean }>({
  isReady: false,
  isTelegram: false,
});

export function TmaProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [isTelegram, setIsTelegram] = useState(false);

  useEffect(() => {
    try {
      initTma(IS_DEBUG);
    } catch {}
    setIsTelegram(isTelegramApp());
    setIsReady(true);
  }, []);

  if (!isReady) {
    return <div className="animate-pulse">Loading...</div>;
  }

  return (
    <TmaContext.Provider value={{ isReady, isTelegram }}>
      {children}
    </TmaContext.Provider>
  );
}

export function useTma() {
  return useContext(TmaContext);
}
```

### Шаг 3: App.tsx — синхронная преинициализация

Файл: `/src/app/App.tsx`

```tsx
// Выполняется ДО рендера React — предотвращает flash of light theme
(() => {
  const root = document.documentElement;
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    root.classList.add("dark");
  }
})();

export default function App() {
  return (
    <AppProvider>        {/* QueryProvider > TmaProvider > AuthProvider */}
      <RouterProvider router={router} />
    </AppProvider>
  );
}
```

## Header Offset — вычисление отступа под шапку Telegram

Telegram клиент добавляет свою шапку (имя бота, кнопки). Под ней может быть status bar + notch (iOS).

```ts
function computeAndSetHeaderOffset(): void {
  if (!_isTelegramApp) return;

  const root = document.documentElement;
  const style = getComputedStyle(root);

  // SDK автоматически устанавливает эти CSS vars:
  const safeTop = parseFloat(style.getPropertyValue("--tg-safe-area-inset-top")) || 0;
  const contentTop = parseFloat(style.getPropertyValue("--tg-content-safe-area-inset-top")) || 0;
  const tgTotal = safeTop + contentTop;

  if (tgTotal > 10) {
    // Telegram клиент предоставил значения
    root.style.setProperty("--app-tg-header-offset", `${tgTotal}px`);
    return;
  }

  // Fallback — CSS vars не установлены (старый клиент)
  let fallback = 56; // generic
  if (platform === "android" || platform === "android_x") {
    fallback = 68;  // status bar (~24-28px) + TG header (~40-44px)
  } else if (platform === "ios") {
    fallback = 90;  // notch/dynamic island (~47-59px) + TG header (~40px)
  }

  root.style.setProperty("--app-tg-header-offset", `${fallback}px`);
}
```

## Что mount-ятся:

| Компонент SDK | Что делает `mount()` | Что делает `bindCssVars()` |
|---------------|---------------------|--------------------------|
| `themeParams` | Активирует реактивные сигналы темы | Устанавливает `--tg-theme-bg-color`, `--tg-theme-text-color`, и т.д. |
| `viewport` | Активирует сигналы viewport + safe areas | `--tg-viewport-height`, `--tg-viewport-stable-height`, `--tg-safe-area-inset-*`, `--tg-content-safe-area-inset-*` |
| `backButton` | Активирует управление кнопкой «Назад» | — |
| `swipeBehavior` | Включает управление жестами свайпа | — |
| `closingBehavior` | Включает управление подтверждением закрытия | — |

## Нативный fallback

Для старых версий Telegram клиента, где SDK не работает, дублируем через `window.Telegram.WebApp`:
- `tg.ready()` — сигнал готовности
- `tg.expand()` — развернуть на максимум
- `tg.requestFullscreen()` — Bot API 8.0+
- `tg.disableVerticalSwipes()` — Bot API 7.7+
- `tg.setHeaderColor("bg_color")` — цвет шапки
- `tg.setBottomBarColor("bg_color")` — цвет нижней панели

## Переделка в другом проекте

1. Установить `@tma.js/sdk-react` v3.x
2. Создать `tma.ts` с функцией `initTma()` — mount всех нужных SDK компонентов
3. Обернуть приложение в `TmaProvider` — вызвать `initTma()` в `useEffect`
4. В `App.tsx` добавить синхронный скрипт для dark mode до рендера
5. Все компоненты проверяют `isTelegram` через `useTma()` хук и gracefully degrading
