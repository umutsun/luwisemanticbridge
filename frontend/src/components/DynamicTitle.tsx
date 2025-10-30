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
    const appDescription = config?.app?.description || 'Intelligent RAG & Context Engine';

    // For chatbot page (root or /chat), only show chatbot title without app name
    const isChatbotPage = pathname === '/' || pathname === '/chat' || pathname?.startsWith('/chat/');
    const chatbotTitle = config?.chatbot?.title || 'Chatbot';

    const finalTitle = isChatbotPage ? chatbotTitle : `${finalPageTitle} - ${appName}`;

    // Only update if title actually changed (prevents unnecessary updates)
    const titleChanged = document.title !== finalTitle;

    // Check if description meta tag exists and needs update
    const metaDescription = document.querySelector('meta[name="description"]');
    const currentDescription = metaDescription?.getAttribute('content');
    const descriptionChanged = currentDescription !== appDescription;

    // Skip if nothing changed
    if (!titleChanged && !descriptionChanged) {
      return;
    }

    console.log('[DynamicTitle] Updating metadata:', {
      title: titleChanged ? { from: document.title, to: finalTitle } : 'unchanged',
      description: descriptionChanged ? { from: currentDescription, to: appDescription } : 'unchanged',
      pageTitle: finalPageTitle,
      pathname,
      isChatbotPage
    });

    // Update document title
    if (titleChanged) {
      document.title = finalTitle;
    }

    // Update description meta tag (dynamic from app settings)
    if (metaDescription && descriptionChanged) {
      metaDescription.setAttribute('content', appDescription);
    }

    // Also update the meta title if it exists
    const metaTitle = document.querySelector('meta[name="title"]');
    if (metaTitle && titleChanged) {
      metaTitle.setAttribute('content', finalTitle);
    }

    // Update og:title and og:description for social sharing
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && titleChanged) {
      ogTitle.setAttribute('content', finalTitle);
    }

    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription && descriptionChanged) {
      ogDescription.setAttribute('content', appDescription);
    }

    // Also update twitter:title and twitter:description
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    if (twitterTitle && titleChanged) {
      twitterTitle.setAttribute('content', finalTitle);
    }

    const twitterDescription = document.querySelector('meta[name="twitter:description"]');
    if (twitterDescription && descriptionChanged) {
      twitterDescription.setAttribute('content', appDescription);
    }
  }, [config?.app?.name, config?.app?.description, config?.chatbot?.title, finalPageTitle, pathname]);

  // Return null as this component only modifies the document title
  return null;
}