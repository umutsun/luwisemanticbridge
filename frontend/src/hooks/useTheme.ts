import { useMemo } from 'react';
import { getTheme, ThemeConfig } from '@/config/theme.config';

/**
 * Custom hook to get current theme configuration
 * Theme is determined by chatbot settings from database
 *
 * @param themeName - Theme name from database (base, modern, spark)
 * @returns ThemeConfig object with all theme-related class names
 */
export const useTheme = (themeName?: string): ThemeConfig => {
  return useMemo(() => getTheme(themeName), [themeName]);
};

/**
 * Utility function to merge theme classes with custom classes
 * Useful for component-level customization
 *
 * @param themeClasses - Classes from theme config
 * @param customClasses - Additional custom classes
 * @returns Merged class string
 */
export const mergeThemeClasses = (themeClasses: string, customClasses?: string): string => {
  return customClasses ? `${themeClasses} ${customClasses}` : themeClasses;
};
