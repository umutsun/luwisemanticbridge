'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useConfig } from '@/contexts/ConfigContext';
import RegisterForm from '@/components/auth/RegisterForm';
import { useTranslation } from 'react-i18next';

export default function RegisterPage() {
  const { config } = useConfig();
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (config?.app?.name) {
      document.title = `${t('register.title')} - ${config.app.name}`;
    }
  }, [config, t]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-md px-6 my-12">
        <div className="mb-3">
          <div className="flex flex-col items-center">
            {!config?.app?.name ? (
              // Loading skeleton animation
              <div className="w-full max-w-sm space-y-2">
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse w-3/4"></div>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-semibold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent mb-1">
                  {config.app.name}
                </h1>
                <p className="text-muted-foreground text-sm text-left max-w-sm">
                  {config.app.description}
                </p>
              </>
            )}
          </div>
        </div>

        <Card className="shadow-lg border-0">
          <CardContent className="pt-6">
            <RegisterForm />
            <div className="text-center text-sm text-muted-foreground mt-6">
              <p>{t('register.alreadyHaveAccount')} {' '}
                <Link href="/login" className="text-primary hover:underline">
                  {t('register.signIn')}
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
