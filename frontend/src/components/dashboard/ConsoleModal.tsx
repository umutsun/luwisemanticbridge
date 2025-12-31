'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Terminal, AlertCircle } from 'lucide-react';
import dynamic from 'next/dynamic';

interface ConsoleModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

// Dynamic import with error boundary
const Console = dynamic(() => import('@/components/terminal/Console'), {
  loading: () => <div className="p-4 text-center text-muted-foreground">Loading console...</div>,
  ssr: false
});

export default function ConsoleModal({ isOpen, onOpenChange }: ConsoleModalProps) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col z-[100]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            System Console & Logs
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto min-h-0">
          {hasError ? (
            <div className="flex items-center justify-center h-full gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              <span>Unable to load console. Please refresh the page.</span>
            </div>
          ) : (
            <ErrorBoundary onError={() => setHasError(true)}>
              <Console
                height={500}
                maxHeight={600}
                showHeader={true}
                showControls={true}
                showFilters={true}
                showBookmarks={true}
                showHistory={true}
                autoScroll={true}
                maxLogs={1000}
              />
            </ErrorBoundary>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Error boundary component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: () => void },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('Console error:', error);
    this.props.onError();
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}
