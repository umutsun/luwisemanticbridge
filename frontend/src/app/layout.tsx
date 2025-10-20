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
  title: "Alice Semantic Bridge",
  description: "AI-powered Semantic Search and Knowledge Management System",
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