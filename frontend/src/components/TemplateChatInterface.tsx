/**
 * Template-Based Chat Interface Wrapper
 *
 * Dynamically loads the active chat template from backend configuration.
 * Falls back to base template if active template fails to load.
 */

'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { loadActiveTemplate } from '@/lib/template-loader';

// Loading component
function ChatInterfaceLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <div className="animate-spin">
            <svg className="h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        </div>
        <p className="text-muted-foreground">Sohbet yükleniyor...</p>
      </div>
    </div>
  );
}

// Error fallback component
function ChatInterfaceError({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20">
      <div className="text-center max-w-md p-6">
        <div className="mb-4">
          <svg className="h-12 w-12 text-destructive mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold mb-2">Sohbet yüklenemedi</h2>
        <p className="text-muted-foreground mb-4">{error.message}</p>
        <button
          onClick={retry}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          Tekrar Dene
        </button>
      </div>
    </div>
  );
}

/**
 * Template Chat Interface Component
 *
 * Loads and renders the active chat template.
 */
export default function TemplateChatInterface(props: any) {
  const [ChatComponent, setChatComponent] = useState<React.ComponentType<any> | null>(null);
  const [templateConfig, setTemplateConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadTemplate = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('🔄 Loading active chat template...');
      const { Component, config } = await loadActiveTemplate();

      console.log('✅ Template loaded:', config?.name || 'base');

      setChatComponent(() => Component);
      setTemplateConfig(config);
    } catch (err) {
      console.error('❌ Failed to load template:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplate();
  }, []);

  // Loading state
  if (loading) {
    return <ChatInterfaceLoading />;
  }

  // Error state
  if (error) {
    return <ChatInterfaceError error={error} retry={loadTemplate} />;
  }

  // No component loaded
  if (!ChatComponent) {
    return <ChatInterfaceError error={new Error('Template component not found')} retry={loadTemplate} />;
  }

  // Inject theme config as CSS variables
  const themeStyles = templateConfig?.theme ? {
    '--primary-color': templateConfig.theme.primaryColor,
    '--secondary-color': templateConfig.theme.secondaryColor,
    '--background-color': templateConfig.theme.backgroundColor,
    '--panel-background': templateConfig.theme.panelBackground,
    '--text-color': templateConfig.theme.textColor,
    '--border-radius': templateConfig.theme.borderRadius,
    '--font-family': templateConfig.theme.fontFamily,
    '--message-spacing': templateConfig.theme.messageSpacing,
    '--header-height': templateConfig.theme.headerHeight,
  } as React.CSSProperties : {};

  // Render template component
  return (
    <div className="template-chat-wrapper" style={themeStyles}>
      {/* Inject custom CSS if provided */}
      {templateConfig?.customCSS && (
        <style dangerouslySetInnerHTML={{ __html: templateConfig.customCSS }} />
      )}

      {/* Render the loaded template component */}
      <Suspense fallback={<ChatInterfaceLoading />}>
        <ChatComponent {...props} config={templateConfig} />
      </Suspense>
    </div>
  );
}
