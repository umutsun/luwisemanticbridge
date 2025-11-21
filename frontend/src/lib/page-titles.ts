'use client';

import { usePathname } from 'next/navigation';

// Page title mapping - Turkish titles for display
const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/crawls': 'Crawls',
  '/dashboard/documents': 'Documents',
  '/dashboard/migrations': 'Migrations',
  '/dashboard/messages': 'Messages',
  '/dashboard/scraper': 'Advanced Scraper',
  '/dashboard/users': 'Users',
  '/dashboard/settings': 'Settings',
  '/dashboard/audit-logs': 'Audit Logs',
  '/dashboard/notifications': 'Notifications',
  '/dashboard/system-monitor': 'System Monitor',
  '/dashboard/activity': 'Activity',
  '/dashboard/analytics': 'Analytics',
  '/dashboard/audit-settings': 'Audit Settings',
  '/dashboard/cache': 'Cache',
  '/dashboard/chatbot-settings': 'Chatbot Settings',
  '/dashboard/database-config': 'Database Config',
  '/dashboard/embedder': 'Embedder',
  '/dashboard/migration-tools': 'Migration Tools',
  '/dashboard/migrations/embeddings': 'Embedding Migration',
  '/dashboard/query': 'Query Builder',
  '/dashboard/rbac': 'RBAC',
  '/dashboard/scrapes': 'Web Scrapes',
  '/dashboard/search': 'Search',
  '/dashboard/services': 'Services',
  '/dashboard/translations': 'Translations',
  '/dashboard/data-translations': 'Veri Çevirileri',
  '/dashboard/workflows': 'Workflows',
  '/scraper': 'Advanced Scraper'
};

/**
 * Get current page title based on pathname
 * @param pathname - Current URL pathname
 */
export function getPageTitle(pathname: string): string {
  // Find the longest matching route (exact match first, then prefix)
  const exactMatch = Object.keys(PAGE_TITLES).find(route => pathname === route);
  if (exactMatch) return PAGE_TITLES[exactMatch];

  // Find longest prefix match
  const sortedRoutes = Object.keys(PAGE_TITLES)
    .filter(route => pathname.startsWith(route + '/'))
    .sort((a, b) => b.length - a.length); // Sort by length descending

  const matchedRoute = sortedRoutes[0];
  return PAGE_TITLES[matchedRoute] || PAGE_TITLES['/dashboard'] || 'Dashboard';
}

/**
 * React hook to get current page title
 * Must be used within a React component
 */
export function usePageTitle(): string {
  const pathname = usePathname();

  // Find the longest matching route (exact match first, then prefix)
  const exactMatch = Object.keys(PAGE_TITLES).find(route => pathname === route);
  if (exactMatch) {
    const title = PAGE_TITLES[exactMatch];
    console.log('[usePageTitle] pathname:', pathname, 'exact match:', exactMatch, 'title:', title);
    return title;
  }

  // Find longest prefix match
  const sortedRoutes = Object.keys(PAGE_TITLES)
    .filter(route => pathname.startsWith(route + '/'))
    .sort((a, b) => b.length - a.length); // Sort by length descending

  const matchedRoute = sortedRoutes[0];
  const title = PAGE_TITLES[matchedRoute] || PAGE_TITLES['/dashboard'] || 'Dashboard';

  console.log('[usePageTitle] pathname:', pathname, 'matchedRoute:', matchedRoute, 'title:', title);

  return title;
}