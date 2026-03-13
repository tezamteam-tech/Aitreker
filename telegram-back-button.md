# Telegram Mini App — Native Back Button

How to use Telegram's built-in system back button instead of rendering your own.
Copy this file into another project to replicate the same navigation pattern.

---

## Philosophy

**We do NOT render a custom "← Back" button in the UI.** Instead, we use the native Telegram `BackButton` — the arrow that appears in the **Telegram header bar** (the same place as the app title). This gives:

- **Native look & feel** — the button is styled by Telegram, matches the platform (iOS / Android / Desktop).
- **No wasted vertical space** — no extra toolbar eating into your content area.
- **Consistent behavior** — users already know this button from other Telegram Mini Apps.
- **Automatic platform handling** — on Android it also responds to the hardware/gesture back action.

```
┌──────────────────────────────────────────┐
│  ← BECOME               ···             │ ← Telegram header (BackButton lives here)
├──────────────────────────────────────────┤
│                                          │
│          Your Mini App content           │ ← NO back button in your UI
│                                          │
│                                          │
└──────────────────────────────────────────┘
```

---

## How It Works

The Telegram WebApp SDK exposes `window.Telegram.WebApp.BackButton` with three methods:

| Method | What it does |
|---|---|
| `BackButton.show()` | Shows the ← arrow in the Telegram header |
| `BackButton.hide()` | Hides it (default state) |
| `BackButton.onClick(cb)` | Subscribes to press events |
| `BackButton.offClick(cb)` | Unsubscribes from press events |

The button is **hidden by default**. You show it on "deeper" pages and hide it on top-level tabs.

---

## 1. Telegram SDK Helpers (`telegram.ts`)

Create thin wrappers with try/catch so the app doesn't crash outside of Telegram (browser dev, etc.):

```typescript
// telegram.ts

function getTelegramWebApp() {
  if (typeof window !== "undefined" && window.Telegram?.WebApp) {
    return window.Telegram.WebApp;
  }
  return null;
}

/**
 * Show the native Telegram back button in the header.
 */
export function showBackButton(): void {
  try {
    getTelegramWebApp()?.BackButton?.show();
  } catch {}
}

/**
 * Hide the native Telegram back button.
 */
export function hideBackButton(): void {
  try {
    getTelegramWebApp()?.BackButton?.hide();
  } catch {}
}

/**
 * Subscribe to back button press. Returns an unsubscribe function.
 *
 * IMPORTANT: Always store the returned unsubscribe function and call it
 * in your useEffect cleanup. Otherwise, stale callbacks accumulate and
 * you get double-navigation bugs.
 */
export function onBackButtonPressed(callback: () => void): () => void {
  try {
    const wa = getTelegramWebApp();
    wa?.BackButton?.onClick(callback);
    return () => {
      try {
        wa?.BackButton?.offClick(callback);
      } catch {}
    };
  } catch {
    return () => {};
  }
}

/**
 * Haptic feedback — optional but recommended on back navigation.
 */
export function hapticFeedback(
  style: "light" | "medium" | "heavy" | "rigid" | "soft" = "light"
): void {
  try {
    getTelegramWebApp()?.HapticFeedback?.impactOccurred(style);
  } catch {}
}
```

---

## 2. Route-Based Show/Hide Logic (`layout.tsx`)

The core idea: define which routes are "deep" pages (should show back button) and which are top-level tabs (should hide it). React to route changes in a `useEffect`.

### Define Deep Pages

```typescript
// Pages where the Telegram BackButton should be shown.
// These are "deeper" pages — not top-level tabs.
const BACK_BUTTON_PAGES = [
  "/day/",
  "/challenges/",
  "/challenge/",
  "/plan-builder",
  "/plan-history",
  "/journal/insights",
  "/coach",
  "/goals",
  "/goal/",
  "/strategic-goal/",
  "/bonuses",
  "/wallet",
  "/admin",
  "/settings",
];

function shouldShowBackButton(pathname: string): boolean {
  return BACK_BUTTON_PAGES.some((p) => pathname.startsWith(p));
}
```

### useEffect in Your Root Layout

```typescript
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import {
  showBackButton,
  hideBackButton,
  onBackButtonPressed,
  hapticFeedback,
} from "./telegram";

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  // ── Telegram Back Button integration ──
  useEffect(() => {
    const showBack = shouldShowBackButton(location.pathname);

    if (showBack) {
      // Show the native ← button
      showBackButton();

      // Subscribe to press → navigate back in React Router history
      const unsub = onBackButtonPressed(() => {
        hapticFeedback("light"); // subtle tactile feedback
        navigate(-1);            // go back one step in history
      });

      // Cleanup: unsubscribe + hide button when route changes
      return () => {
        unsub();
        hideBackButton();
      };
    } else {
      // Top-level tab — no back button
      hideBackButton();
    }
  }, [location.pathname, navigate]);

  return (
    <div>
      {/* NO custom back button anywhere here */}
      <Outlet />
    </div>
  );
}
```

### How the Flow Works

```
User on /home (tab)
  → shouldShowBackButton("/home") = false
  → hideBackButton()
  → No ← arrow in header

User taps a challenge card → navigates to /challenges/abc123
  → shouldShowBackButton("/challenges/abc123") = true
  → showBackButton()
  → ← arrow appears in Telegram header
  → onBackButtonPressed registered

User taps ← arrow
  → hapticFeedback("light")
  → navigate(-1) → back to /home
  → useEffect re-runs with "/home"
  → unsub() removes old listener
  → hideBackButton() → ← arrow disappears
```

---

## 3. Complete Minimal Example

A single-file layout with React Router that integrates the Telegram back button:

```tsx
// layout.tsx
import { useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router";

// ── Telegram SDK helpers ────────────────────────────

function getTg() {
  return typeof window !== "undefined" ? window.Telegram?.WebApp : null;
}

function showBackButton() {
  try { getTg()?.BackButton?.show(); } catch {}
}

function hideBackButton() {
  try { getTg()?.BackButton?.hide(); } catch {}
}

function onBackButtonPressed(cb: () => void): () => void {
  try {
    const wa = getTg();
    wa?.BackButton?.onClick(cb);
    return () => { try { wa?.BackButton?.offClick(cb); } catch {} };
  } catch {
    return () => {};
  }
}

function haptic() {
  try { getTg()?.HapticFeedback?.impactOccurred("light"); } catch {}
}

// ── Route config ────────────────────────────────────

// Top-level tabs — back button is HIDDEN on these
const TOP_LEVEL = ["/home", "/profile", "/settings"];

// Everything else — back button is SHOWN
function shouldShowBack(path: string): boolean {
  return !TOP_LEVEL.includes(path);
}

// ── Layout component ────────────────────────────────

export function AppLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (shouldShowBack(pathname)) {
      showBackButton();
      const unsub = onBackButtonPressed(() => {
        haptic();
        navigate(-1);
      });
      return () => {
        unsub();
        hideBackButton();
      };
    } else {
      hideBackButton();
    }
  }, [pathname, navigate]);

  return <Outlet />;
}
```

### Router Setup

```tsx
// routes.ts
import { createBrowserRouter } from "react-router";
import { AppLayout } from "./layout";
import { Home } from "./pages/home";
import { ItemDetail } from "./pages/item-detail";
import { Profile } from "./pages/profile";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: AppLayout,
    children: [
      { path: "home", Component: Home },
      { path: "items/:id", Component: ItemDetail },  // ← deep page, back button shown
      { path: "profile", Component: Profile },
    ],
  },
]);
```

```tsx
// App.tsx
import { RouterProvider } from "react-router";
import { router } from "./routes";

export default function App() {
  return <RouterProvider router={router} />;
}
```

---

## 4. TypeScript Types

If your project doesn't have Telegram WebApp types, add this to a `.d.ts` file:

```typescript
// telegram-webapp.d.ts

interface TelegramBackButton {
  isVisible: boolean;
  show(): void;
  hide(): void;
  onClick(callback: () => void): void;
  offClick(callback: () => void): void;
}

interface TelegramHapticFeedback {
  impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
  notificationOccurred(type: "error" | "success" | "warning"): void;
  selectionChanged(): void;
}

interface WebApp {
  BackButton: TelegramBackButton;
  HapticFeedback: TelegramHapticFeedback;
  // ... other properties
}

interface Telegram {
  WebApp: WebApp;
}

declare global {
  interface Window {
    Telegram?: Telegram;
  }
}
```

---

## 5. Common Pitfalls

| Pitfall | What happens | Fix |
|---|---|---|
| **Not unsubscribing `onClick`** | Old callbacks stack up → double/triple navigation on one press | Always call `offClick` in useEffect cleanup |
| **Showing back on top-level tabs** | Users tap ← on `/home` and get stuck or leave the app | Maintain a clear list of top-level routes where back is hidden |
| **Using `navigate("/home")` instead of `navigate(-1)`** | Breaks natural browser-like history flow | Use `navigate(-1)` — it respects the actual navigation stack |
| **Not hiding on unmount** | Back button stays visible after navigating to a tab | `hideBackButton()` in both the cleanup function AND the `else` branch |
| **No try/catch** | App crashes in browser dev mode (no Telegram SDK) | Wrap every SDK call in try/catch |
| **Rendering a custom back button too** | Two back buttons (native + custom), confusing UX | Choose one — we choose the native Telegram button exclusively |

---

## 6. Why Not a Custom Back Button?

| Custom `<button>` in your UI | Native Telegram `BackButton` |
|---|---|
| Takes up 44-56px of vertical space | Zero pixels — lives in Telegram's own header |
| You must style it for iOS + Android + Desktop | Telegram styles it natively per platform |
| Doesn't respond to Android hardware back | Automatically handles Android back gesture |
| Another element to maintain and test | Zero maintenance — Telegram SDK handles it |
| Inconsistent with other Mini Apps | Consistent with the entire Telegram ecosystem |

The only case where you might render a custom back button is if your Mini App runs **outside of Telegram** (e.g., a PWA or web fallback). In that case, detect the environment:

```typescript
const isTelegram = !!window.Telegram?.WebApp?.initData;

// In your component:
{!isTelegram && (
  <button onClick={() => navigate(-1)} className="...">
    ← Back
  </button>
)}
```

Inside Telegram — always use the native button.
