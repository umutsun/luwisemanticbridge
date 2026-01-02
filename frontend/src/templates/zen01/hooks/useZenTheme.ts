'use client';

import { useState, useCallback, useEffect } from 'react';
import type { ZenThemeMode, ZenThemeContext } from '../types';

const STORAGE_KEY = 'zen01-theme-mode';

/**
 * Custom hook for managing Zen01 theme state (dark/light mode)
 * Persists preference to localStorage
 */
export function useZenTheme(defaultMode: ZenThemeMode = 'dark'): ZenThemeContext {
  // Start with default mode to avoid hydration mismatch
  const [isDark, setIsDark] = useState<boolean>(defaultMode === 'dark');
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage after mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light') {
        setIsDark(false);
      } else if (stored === 'dark') {
        setIsDark(true);
      }
      // If no stored value, keep default (dark)
    } catch (e) {
      console.warn('localStorage not available:', e);
    }
    setIsHydrated(true);
  }, []);

  // Persist preference to localStorage
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light');
    }
  }, [isDark, isHydrated]);

  const toggle = useCallback(() => {
    setIsDark(prev => {
      const newValue = !prev;
      console.log('[ZenTheme] Toggle:', prev, '->', newValue);
      return newValue;
    });
  }, []);

  const mode: ZenThemeMode = isDark ? 'dark' : 'light';

  return {
    isDark,
    mode,
    toggle
  };
}

export default useZenTheme;
