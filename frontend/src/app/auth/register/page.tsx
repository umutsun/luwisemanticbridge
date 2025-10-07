'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useConfig } from '@/contexts/ConfigContext';
import RegisterForm from '@/components/auth/RegisterForm';

export default function RegisterPage() {
  const { config } = useConfig();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (config?.app?.name) {
      document.title = `Kayıt Ol - ${config.app.name}`;
    }
  }, [config]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-md px-6 my-12">
        <div className="mb-3">
          <div className="flex flex-col items-center">
            <h1 className="text-2xl font-semibold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent mb-1">
              {config?.app?.name}
            </h1>
            <p className="text-muted-foreground text-sm text-left max-w-sm">
              {config?.app?.description}
            </p>
          </div>
        </div>

        <Card className="shadow-lg border-0">
          <CardContent>
            <RegisterForm />
            <div className="text-center text-sm text-muted-foreground mt-6">
              <p>Zaten hesabınız var mı? {' '}
                <Link href="/login" className="text-primary hover:underline">
                  Giriş yapın
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
