'use client';

import { usePathname } from 'next/navigation';

// Page title mapping - Turkish titles for display
const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/documents': 'Doküman Yönetimi',
  '/dashboard/migrations': 'Migrations',
  '/dashboard/messages': 'Mesaj Analizleri',
  '/dashboard/scraper': 'Advanced Scraper',
  '/dashboard/users': 'User Management',
  '/dashboard/settings': 'Settings',
  '/dashboard/audit-logs': 'Audit Logs',
  '/dashboard/notifications': 'Bildirim Ayarları',
  '/dashboard/system-monitor': 'Sistem Monitörü',
  '/scraper': 'Advanced Scraper'
};

/**
 * Get current page title based on pathname
 * @param pathname - Current URL pathname
 */
export function getPageTitle(pathname: string): string {
  // Find the longest matching route
  const matchedRoute = Object.keys(PAGE_TITLES).find(route =>
    pathname === route || pathname.startsWith(route + '/')
  );

  return PAGE_TITLES[matchedRoute || '/dashboard'] || 'Dashboard';
}

/**
 * React hook to get current page title
 * Must be used within a React component
 */
export function usePageTitle(): string {
  const pathname = usePathname();

  const matchedRoute = Object.keys(PAGE_TITLES).find(route =>
    pathname === route || pathname.startsWith(route + '/')
  );

  return PAGE_TITLES[matchedRoute || '/dashboard'] || 'Dashboard';
}