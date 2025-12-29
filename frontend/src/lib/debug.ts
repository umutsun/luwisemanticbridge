/**
 * Debug Logger Utility
 *
 * Controls console output based on debug mode setting.
 * When debug mode is OFF, all logs are suppressed to improve browser performance.
 */

const DEBUG_MODE_KEY = 'lsemb_debug_mode';

// Check if we're in browser
const isBrowser = typeof window !== 'undefined';

// Get debug mode from localStorage
export function isDebugMode(): boolean {
  if (!isBrowser) return false;
  try {
    return localStorage.getItem(DEBUG_MODE_KEY) === 'true';
  } catch {
    return false;
  }
}

// Set debug mode
export function setDebugMode(enabled: boolean): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(DEBUG_MODE_KEY, String(enabled));
    // Dispatch event for real-time updates
    window.dispatchEvent(new CustomEvent('debugModeChanged', { detail: enabled }));
  } catch {
    // Ignore storage errors
  }
}

// Debug logger - only logs when debug mode is enabled
export const debug = {
  log: (...args: unknown[]): void => {
    if (isDebugMode()) {
      console.log(...args);
    }
  },

  info: (...args: unknown[]): void => {
    if (isDebugMode()) {
      console.info(...args);
    }
  },

  warn: (...args: unknown[]): void => {
    if (isDebugMode()) {
      console.warn(...args);
    }
  },

  error: (...args: unknown[]): void => {
    // Errors are always logged regardless of debug mode
    console.error(...args);
  },

  debug: (...args: unknown[]): void => {
    if (isDebugMode()) {
      console.debug(...args);
    }
  },

  table: (data: unknown): void => {
    if (isDebugMode()) {
      console.table(data);
    }
  },

  group: (label: string): void => {
    if (isDebugMode()) {
      console.group(label);
    }
  },

  groupEnd: (): void => {
    if (isDebugMode()) {
      console.groupEnd();
    }
  },

  time: (label: string): void => {
    if (isDebugMode()) {
      console.time(label);
    }
  },

  timeEnd: (label: string): void => {
    if (isDebugMode()) {
      console.timeEnd(label);
    }
  }
};

// Export default
export default debug;
