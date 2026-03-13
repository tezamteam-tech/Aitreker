// =============================================
// Bottom Sheet Context
// =============================================
// Tracks how many bottom sheets are open so that
// the tab bar can hide when any sheet is visible.
// =============================================

import React, { createContext, useContext, useCallback, useRef, useState, useEffect } from 'react';

interface BottomSheetContextValue {
  /** Number of currently open bottom sheets */
  openCount: number;
  /** Call when a bottom sheet opens */
  register: () => void;
  /** Call when a bottom sheet closes */
  unregister: () => void;
}

const BottomSheetContext = createContext<BottomSheetContextValue>({
  openCount: 0,
  register: () => {},
  unregister: () => {},
});

export function BottomSheetProvider({ children }: { children: React.ReactNode }) {
  const [openCount, setOpenCount] = useState(0);
  const countRef = useRef(0);

  const register = useCallback(() => {
    countRef.current += 1;
    setOpenCount(countRef.current);
  }, []);

  const unregister = useCallback(() => {
    countRef.current = Math.max(0, countRef.current - 1);
    setOpenCount(countRef.current);
  }, []);

  return (
    <BottomSheetContext.Provider value={{ openCount, register, unregister }}>
      {children}
    </BottomSheetContext.Provider>
  );
}

/**
 * Hook to register/unregister a bottom sheet.
 * Call `register()` when the sheet opens and `unregister()` when it closes.
 * Use the `useBottomSheetLifecycle(isOpen)` helper for automatic tracking.
 */
export function useBottomSheet() {
  return useContext(BottomSheetContext);
}

/**
 * Returns true when any bottom sheet is open.
 * Used by the tab bar to hide itself.
 */
export function useAnyBottomSheetOpen(): boolean {
  const { openCount } = useContext(BottomSheetContext);
  return openCount > 0;
}

/**
 * Automatically registers/unregisters a bottom sheet based on its open state.
 * Usage: `useBottomSheetLifecycle(isModalOpen);`
 */
export function useBottomSheetLifecycle(isOpen: boolean) {
  const { register, unregister } = useContext(BottomSheetContext);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      register();
      wasOpen.current = true;
    } else if (!isOpen && wasOpen.current) {
      unregister();
      wasOpen.current = false;
    }
  }, [isOpen, register, unregister]);

  // Cleanup on unmount — if sheet was open when component unmounts
  useEffect(() => {
    return () => {
      if (wasOpen.current) {
        unregister();
        wasOpen.current = false;
      }
    };
  }, [unregister]);
}