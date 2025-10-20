'use client';

import { useEffect } from 'react';

export default function ThemeInitializer() {
  useEffect(() => {
    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme') || 'system';
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

    // Apply theme
    const themeToApply = savedTheme === 'system' ? systemTheme : savedTheme;

    const html = document.documentElement;
    const body = document.body;

    html.classList.remove('light', 'dark');
    body.classList.remove('light', 'dark');

    html.classList.add(themeToApply);
    body.classList.add(themeToApply);
  }, []);

  return null;
}