import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import I18nProvider from "@/components/I18nProvider";
import { AuthProvider } from "@/contexts/AuthProvider";
import { ConfigProvider } from "@/contexts/ConfigContext";
import FrontendLogger from "@/utils/frontend-logger";
import AppInitialLoader from "@/components/app-initial-loader";
import ThemeInitializer from "@/components/ThemeInitializer";
import DynamicTitle from "@/components/DynamicTitle";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // title: "Luwi Semantic Bridge", // Commented out - DynamicTitle handles this
  description: "Intelligent RAG & Context Engine", // Initial fallback - DynamicTitle updates this dynamically
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        {/* Chunk loading error handler */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                // Track chunk load errors
                var chunkLoadErrorCount = 0;
                var MAX_RETRIES = 3;

                // Handle unhandled promise rejections (chunk loading errors)
                window.addEventListener('unhandledrejection', function(event) {
                  var error = event.reason;

                  // Check if it's a chunk loading error
                  var isChunkError = error && (
                    error.name === 'ChunkLoadError' ||
                    (error.message && (
                      error.message.includes('Loading chunk') ||
                      error.message.includes('Failed to fetch dynamically imported module') ||
                      error.message.includes('ChunkLoadError')
                    ))
                  );

                  if (isChunkError) {
                    chunkLoadErrorCount++;
                    console.warn('Chunk loading error detected (attempt ' + chunkLoadErrorCount + '/' + MAX_RETRIES + '):', error.message);

                    if (chunkLoadErrorCount <= MAX_RETRIES) {
                      // Prevent default error handling
                      event.preventDefault();

                      // Reload the page after a short delay
                      setTimeout(function() {
                        console.log('Reloading page to recover from chunk loading error...');
                        window.location.reload();
                      }, 1000);
                    } else {
                      console.error('Max chunk load retries reached. Manual intervention required.');
                    }
                  }
                });

                // Handle global errors
                window.addEventListener('error', function(event) {
                  var error = event.error;

                  // Check if it's a script loading error
                  var isScriptError = event.target && (
                    event.target.tagName === 'SCRIPT' ||
                    event.target.tagName === 'LINK'
                  );

                  if (isScriptError) {
                    console.warn('Script/resource loading error detected:', event.target.src || event.target.href);

                    // For script errors, we might want to reload
                    if (chunkLoadErrorCount < MAX_RETRIES) {
                      chunkLoadErrorCount++;
                      setTimeout(function() {
                        console.log('Reloading page to recover from script loading error...');
                        window.location.reload();
                      }, 1000);
                    }
                  }
                });

                // Reset error count after successful navigation
                if (typeof window !== 'undefined' && window.performance) {
                  window.addEventListener('load', function() {
                    // Reset after page successfully loads
                    setTimeout(function() {
                      chunkLoadErrorCount = 0;
                    }, 5000);
                  });
                }
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeInitializer />
        <AuthProvider>
          <ConfigProvider>
            <I18nProvider>
              <AppInitialLoader>
                <DynamicTitle />
                {children}
              </AppInitialLoader>
            </I18nProvider>
          </ConfigProvider>
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}