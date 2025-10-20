'use client';

import React, { useState, useEffect } from 'react';
import InitialLoadingScreen from '@/components/ui/initial-loading-screen';

interface AppInitialLoaderProps {
  children: React.ReactNode;
}

export default function AppInitialLoader({ children }: AppInitialLoaderProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Check if we've already shown the initial loading screen
    const hasShownInitialLoad = sessionStorage.getItem('initial-load-complete');

    if (hasShownInitialLoad === 'true') {
      setIsLoading(false);
      return;
    }

    // Show loading screen for 3 seconds
    const timer = setTimeout(() => {
      sessionStorage.setItem('initial-load-complete', 'true');
      setIsLoading(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  // Don't render anything until mounted (prevents SSR mismatch)
  if (!mounted) {
    return null;
  }

  if (isLoading) {
    return <InitialLoadingScreen onComplete={() => setIsLoading(false)} />;
  }

  return <>{children}</>;
}