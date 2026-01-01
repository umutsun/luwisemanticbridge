'use client';

import { useState, useCallback, useEffect } from 'react';
import type { ZenThemeMode, ZenThemeContext } from '../types';

const STORAGE_KEY = 'zen01-theme-mode';

/**
 * Custom hook for managing Zen01 theme state (dark/light mode)
 * Persists preference to localStorage
 */
export function useZenTheme(defaultMode: ZenThemeMode = 'dark'): ZenThemeContext {
  const [isDark, setIsDark] = useState<boolean>(() => {
    // Check localStorage on initial load (client-side only)
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light') return false;
      if (stored === 'dark') return true;
    }
    return defaultMode === 'dark';
  });

  // Persist preference to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light');
    }
  }, [isDark]);

  const toggle = useCallback(() => {
    setIsDark(prev => !prev);
  }, []);

  const mode: ZenThemeMode = isDark ? 'dark' : 'light';

  return {
    isDark,
    mode,
    toggle
  };
}

export default useZenTheme;
