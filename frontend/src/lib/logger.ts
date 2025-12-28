/**
 * Debug Logger Utility
 * Controls console output based on debugMode setting
 */

// Store original console methods
const originalConsole = {
  log: typeof console !== 'undefined' ? console.log : () => {},
  debug: typeof console !== 'undefined' ? console.debug : () => {},
  info: typeof console !== 'undefined' ? console.info : () => {},
  warn: typeof console !== 'undefined' ? console.warn : () => {},
  error: typeof console !== 'undefined' ? console.error : () => {},
};

// No-op function
const noop = () => {};

// Debug mode state
let debugModeEnabled = false;

/**
 * Initialize logger based on debug mode setting
 * Call this once when app loads with the debugMode value from settings
 */
export function initializeLogger(debugMode: boolean) {
  debugModeEnabled = debugMode;

  if (typeof window === 'undefined') return;

  if (!debugMode) {
    // Disable console.log, debug, info in production when debug mode is off
    console.log = noop;
    console.debug = noop;
    console.info = noop;
    // Keep warn and error always enabled
  } else {
    // Restore original methods
    console.log = originalConsole.log;
    console.debug = originalConsole.debug;
    console.info = originalConsole.info;
  }
}

/**
 * Check if debug mode is enabled
 */
export function isDebugMode(): boolean {
  return debugModeEnabled;
}

/**
 * Force log even when debug mode is off (for critical messages)
 */
export function forceLog(...args: unknown[]) {
  originalConsole.log(...args);
}

/**
 * Always available logging methods
 */
export const logger = {
  log: (...args: unknown[]) => debugModeEnabled && originalConsole.log(...args),
  debug: (...args: unknown[]) => debugModeEnabled && originalConsole.debug(...args),
  info: (...args: unknown[]) => debugModeEnabled && originalConsole.info(...args),
  warn: (...args: unknown[]) => originalConsole.warn(...args),
  error: (...args: unknown[]) => originalConsole.error(...args),
  force: (...args: unknown[]) => originalConsole.log(...args),
};

export default logger;
