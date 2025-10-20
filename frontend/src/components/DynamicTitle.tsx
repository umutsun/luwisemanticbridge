'use client';

import { useEffect, useState, useMemo } from 'react';
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
  const [mounted, setMounted] = useState(false);

  // Get dynamic page title based on current route
  const dynamicPageTitle = usePageTitle();

  // Use prop pageTitle if provided, otherwise use dynamic title
  const finalPageTitle = propPageTitle || dynamicPageTitle;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const appName = config?.app?.name || 'Alice Semantic Bridge';
    const finalTitle = `${finalPageTitle} - ${appName}`;

    // Update document title
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
  }, [config, finalPageTitle, mounted]);

  // Return null as this component only modifies the document title
  return null;
}