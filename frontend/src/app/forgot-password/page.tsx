'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail, ArrowLeft, CheckCircle, AlertTriangle } from 'lucide-react';
import { useConfig } from '@/contexts/ConfigContext';
import { useTranslation } from 'react-i18next';
import apiConfig from '@/config/api.config';

export default function ForgotPasswordPage() {
    const { config } = useConfig();
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(apiConfig.getApiUrl('/api/v2/auth/forgot-password'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || t('forgotPassword.errors.requestFailed'));
            }

            setSuccess(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('forgotPassword.errors.requestFailed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
            <div className="w-full max-w-md px-6 my-12">
                <div className="mb-6">
                    <div className="flex flex-col items-center">
                        <h1 className="text-2xl font-semibold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent mb-1">
                            {config?.app?.name || 'Luwi Semantic Bridge'}
                        </h1>
                        <p className="text-muted-foreground text-sm text-center max-w-sm">
                            {config?.app?.description || 'AI-powered Semantic Search Platform'}
                        </p>
                    </div>
                </div>

                <Card className="shadow-lg border-0">
                    <CardHeader>
                        <CardTitle className="text-center">{t('forgotPassword.title')}</CardTitle>
                        <CardDescription className="text-center">
                            {t('forgotPassword.description')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {success ? (
                            <div className="space-y-4">
                                <Alert className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                                    <AlertDescription className="text-green-800 dark:text-green-200">
                                        {t('forgotPassword.success')}
                                    </AlertDescription>
                                </Alert>
                                <Link href="/login">
                                    <Button variant="outline" className="w-full">
                                        <ArrowLeft className="h-4 w-4 mr-2" />
                                        {t('forgotPassword.backToLogin')}
                                    </Button>
                                </Link>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {error && (
                                    <Alert variant="destructive">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertDescription>{error}</AlertDescription>
                                    </Alert>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="email">{t('forgotPassword.emailLabel')}</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <Input
                                            id="email"
                                            type="email"
                                            placeholder={t('forgotPassword.emailPlaceholder')}
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="pl-10"
                                            required
                                            disabled={loading}
                                        />
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full"
                                    disabled={loading || !email}
                                >
                                    {loading ? t('forgotPassword.sending') : t('forgotPassword.sendResetLink')}
                                </Button>

                                <div className="text-center">
                                    <Link href="/login" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                                        <ArrowLeft className="h-3 w-3 inline mr-1" />
                                        {t('forgotPassword.backToLogin')}
                                    </Link>
                                </div>
                            </form>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
