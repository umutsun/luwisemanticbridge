'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useConfig } from '@/contexts/ConfigContext';
import { usePageTitle } from '@/lib/page-titles';

interface DynamicTitleProps {
  pageTitle?: string;
  defaultTitle?: string;
}

export default function DynamicTitle({
  pageTitle: propPageTitle,
  defaultTitle
}: DynamicTitleProps) {
  const { config } = useConfig();
  const pathname = usePathname();

  // Get dynamic page title based on current route
  const dynamicPageTitle = usePageTitle();

  // Use prop pageTitle if provided, otherwise use dynamic title
  const finalPageTitle = propPageTitle || dynamicPageTitle;

  useEffect(() => {
    if (!finalPageTitle) {
      console.warn('[DynamicTitle] No page title found!');
      return;
    }

    // Wait for config to load before setting title
    const appName = config?.app?.name || 'Luwi Semantic Bridge';

    // Skip if config hasn't loaded yet (avoid showing "Page Name - undefined")
    if (!config?.app?.name && !appName) {
      console.log('[DynamicTitle] Waiting for config to load...');
      return;
    }

    // For chatbot page (root or /chat), only show chatbot title without app name
    const isChatbotPage = pathname === '/' || pathname === '/chat' || pathname?.startsWith('/chat/');
    const chatbotTitle = config?.chatbot?.title || 'Chatbot';

    const finalTitle = isChatbotPage ? chatbotTitle : `${finalPageTitle} - ${appName}`;

    console.log('[DynamicTitle] Setting title:', {
      finalTitle,
      appName,
      pageTitle: finalPageTitle,
      configAppName: config?.app?.name,
      propPageTitle,
      dynamicPageTitle
    });

    // Update document title IMMEDIATELY
    document.title = finalTitle;

    // Also update the meta title if it exists
    const metaTitle = document.querySelector('meta[name="title"]');
    if (metaTitle) {
      metaTitle.setAttribute('content', finalTitle);
    }

    // Update og:title as well for social sharing
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      ogTitle.setAttribute('content', finalTitle);
    }

    // Also update twitter:title
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    if (twitterTitle) {
      twitterTitle.setAttribute('content', finalTitle);
    }
  }, [config?.app?.name, finalPageTitle, pathname, config?.chatbot?.title]);

  // Return null as this component only modifies the document title
  return null;
}