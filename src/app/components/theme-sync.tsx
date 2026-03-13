// =============================================
// Proper Food AI — ThemeSync Component
// =============================================
// Side-effect component (renders null).
// Manages .dark class on <html> and maps Telegram
// theme colors to CSS variables.
//
// Inside Telegram: follows Telegram's color scheme.
// In browser: follows system prefers-color-scheme.
// =============================================

import { useEffect } from 'react';
import { isTelegramEnvironment } from './telegram';

// Telegram theme key -> CSS variable mapping
const THEME_TO_CSS: Record<string, string> = {
  bg_color:                '--background',
  text_color:              '--foreground',
  hint_color:              '--muted-foreground',
  link_color:              '--app-accent',
  button_color:            '--primary',
  button_text_color:       '--primary-foreground',
  secondary_bg_color:      '--secondary',
  header_bg_color:         '--card',
  accent_text_color:       '--accent-foreground',
  section_bg_color:        '--card',
  section_header_text_color: '--foreground',
  section_separator_color: '--border',
  subtitle_text_color:     '--muted-foreground',
  destructive_text_color:  '--destructive',
  bottom_bar_bg_color:     '--sidebar',
};

function getTelegramColorScheme(): 'dark' | 'light' | null {
  try {
    const wa = (window as any).Telegram?.WebApp;
    if (wa?.colorScheme) return wa.colorScheme;
    // Fallback: check themeParams
    if (wa?.themeParams) {
      const bg = wa.themeParams.bg_color;
      if (bg) {
        // Simple luminance check
        const hex = bg.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance < 0.5 ? 'dark' : 'light';
      }
    }
  } catch {}
  return null;
}

function getTelegramThemeParams(): Record<string, string> {
  try {
    const wa = (window as any).Telegram?.WebApp;
    return wa?.themeParams ?? {};
  } catch {}
  return {};
}

export function ThemeSync() {
  const isTelegram = isTelegramEnvironment();

  // Effect 1: Manage .dark class
  useEffect(() => {
    const root = document.documentElement;

    if (isTelegram) {
      // Inside Telegram — follow Telegram's color scheme
      const scheme = getTelegramColorScheme();
      if (scheme === 'dark') {
        root.classList.add('dark');
      } else if (scheme === 'light') {
        root.classList.remove('dark');
      }
      // else: keep what was set by FOUC prevention

      // Listen for theme changes from Telegram
      const wa = (window as any).Telegram?.WebApp;
      if (wa?.onEvent) {
        const handler = () => {
          const newScheme = getTelegramColorScheme();
          if (newScheme === 'dark') {
            root.classList.add('dark');
          } else if (newScheme === 'light') {
            root.classList.remove('dark');
          }
        };
        wa.onEvent('themeChanged', handler);
        return () => {
          try { wa.offEvent('themeChanged', handler); } catch {}
        };
      }
    } else {
      // In browser — follow system preference
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const apply = (e: MediaQueryList | MediaQueryListEvent) => {
        if (e.matches) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      };
      apply(mq);
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [isTelegram]);

  // Effect 2: Map Telegram theme colors to CSS vars
  useEffect(() => {
    if (!isTelegram) return;

    const root = document.documentElement;
    const applied: string[] = [];

    const applyThemeParams = () => {
      const theme = getTelegramThemeParams();
      for (const [themeKey, cssVar] of Object.entries(THEME_TO_CSS)) {
        const value = theme[themeKey];
        if (value) {
          root.style.setProperty(cssVar, value);
          applied.push(cssVar);
        }
      }
    };

    applyThemeParams();

    // Listen for theme param changes
    const wa = (window as any).Telegram?.WebApp;
    if (wa?.onEvent) {
      wa.onEvent('themeChanged', applyThemeParams);
      return () => {
        try { wa.offEvent('themeChanged', applyThemeParams); } catch {}
        // Restore defaults
        for (const cssVar of applied) {
          root.style.removeProperty(cssVar);
        }
      };
    }

    return () => {
      for (const cssVar of applied) {
        root.style.removeProperty(cssVar);
      }
    };
  }, [isTelegram]);

  // Effect 3: Set header/bottom bar color based on current theme
  useEffect(() => {
    if (!isTelegram) return;
    try {
      const wa = (window as any).Telegram?.WebApp;
      if (wa && typeof wa.isVersionAtLeast === 'function') {
        if (wa.isVersionAtLeast('6.1')) {
          wa.setHeaderColor?.('bg_color');
        }
        if (wa.isVersionAtLeast('7.10')) {
          wa.setBottomBarColor?.('bg_color');
        }
      }
    } catch {}
  }, [isTelegram]);

  return null;
}