// =============================================
// Proper Food AI — Local Settings Reader
// =============================================
// Shared utility for reading localStorage-based settings
// from both React components and non-React utility functions.
// =============================================

const LS_KEY = 'proper_local_settings';

export interface LocalSettings {
  soundsEnabled: boolean;
  hapticsEnabled: boolean;
  compactCards: boolean;
}

const DEFAULTS: LocalSettings = {
  soundsEnabled: true,
  hapticsEnabled: true,
  compactCards: false,
};

/**
 * Migration: read old key if new one doesn't exist
 */
function migrateLocalSettings(): void {
  try {
    if (!localStorage.getItem(LS_KEY) && localStorage.getItem('become_local_settings')) {
      localStorage.setItem(LS_KEY, localStorage.getItem('become_local_settings')!);
      localStorage.removeItem('become_local_settings');
    }
  } catch {}
}

/**
 * Run migration once on module load
 */
if (typeof window !== 'undefined') migrateLocalSettings();

/**
 * Read local settings from localStorage.
 * Safe to call from anywhere — utility functions, hooks, etc.
 */
export function getLocalSettings(): LocalSettings {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULTS, ...parsed };
    }
  } catch {
    // Corrupted or unavailable localStorage
  }
  return { ...DEFAULTS };
}

/**
 * Quick boolean check: are sounds enabled?
 * Used by xp-sound.tsx to gate audio playback.
 */
export function isSoundEnabled(): boolean {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) return JSON.parse(saved).soundsEnabled !== false;
  } catch {}
  return true;
}

/**
 * Quick boolean check: are haptics enabled?
 * Used by telegram.tsx to gate vibration feedback.
 */
export function isHapticsEnabled(): boolean {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) return JSON.parse(saved).hapticsEnabled !== false;
  } catch {}
  return true;
}

/**
 * Quick boolean check: are compact cards enabled?
 * Used by list components to toggle compact/full display.
 */
export function isCompactCards(): boolean {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) return !!JSON.parse(saved).compactCards;
  } catch {}
  return false;
}