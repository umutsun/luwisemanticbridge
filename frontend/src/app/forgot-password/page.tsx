'use client';

import React, { useState } from 'react';
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
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4 overflow-hidden" style={{ backgroundColor: '#0f172a' }}>
            {/* 3D Cube */}
            <div className="absolute top-20 left-1/2 transform -translate-x-1/2 pointer-events-none">
                <div className="relative w-10 h-10" style={{ perspective: '1000px' }}>
                    <div className="absolute w-full h-full" style={{
                        transformStyle: 'preserve-3d',
                        animation: 'rotateCube 8s linear infinite'
                    }}>
                        {/* Front Face */}
                        <div className="absolute w-full h-full cube-face" style={{
                            transform: 'translateZ(20px)',
                            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))',
                            border: '1px solid rgba(99, 102, 241, 0.6)',
                            backdropFilter: 'blur(5px)'
                        }} />
                        {/* Back Face */}
                        <div className="absolute w-full h-full cube-face" style={{
                            transform: 'rotateY(180deg) translateZ(20px)',
                            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))',
                            border: '1px solid rgba(99, 102, 241, 0.6)',
                            backdropFilter: 'blur(5px)'
                        }} />
                        {/* Right Face */}
                        <div className="absolute w-full h-full cube-face" style={{
                            transform: 'rotateY(90deg) translateZ(20px)',
                            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))',
                            border: '1px solid rgba(99, 102, 241, 0.6)',
                            backdropFilter: 'blur(5px)'
                        }} />
                        {/* Left Face */}
                        <div className="absolute w-full h-full cube-face" style={{
                            transform: 'rotateY(-90deg) translateZ(20px)',
                            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))',
                            border: '1px solid rgba(99, 102, 241, 0.6)',
                            backdropFilter: 'blur(5px)'
                        }} />
                        {/* Top Face */}
                        <div className="absolute w-full h-full cube-face" style={{
                            transform: 'rotateX(90deg) translateZ(20px)',
                            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))',
                            border: '1px solid rgba(99, 102, 241, 0.6)',
                            backdropFilter: 'blur(5px)'
                        }} />
                        {/* Bottom Face */}
                        <div className="absolute w-full h-full cube-face" style={{
                            transform: 'rotateX(-90deg) translateZ(20px)',
                            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))',
                            border: '1px solid rgba(99, 102, 241, 0.6)',
                            backdropFilter: 'blur(5px)'
                        }} />
                    </div>
                </div>

                {/* CSS for animations */}
                <style jsx>{`
                    @keyframes rotateCube {
                        0% { transform: rotateX(0deg) rotateY(0deg); }
                        100% { transform: rotateX(360deg) rotateY(360deg); }
                    }
                    @keyframes cubeGlow {
                        0% {
                            box-shadow: 0 0 10px rgba(99, 102, 241, 0.6),
                                        0 0 20px rgba(99, 102, 241, 0.4),
                                        inset 0 0 10px rgba(99, 102, 241, 0.1);
                        }
                        100% {
                            box-shadow: 0 0 20px rgba(139, 92, 246, 0.8),
                                        0 0 30px rgba(139, 92, 246, 0.6),
                                        inset 0 0 15px rgba(139, 92, 246, 0.2);
                        }
                    }
                    .cube-face {
                        animation: cubeGlow 4s ease-in-out infinite alternate;
                    }
                `}</style>
            </div>

            <div className="max-w-md w-full relative z-10">
                <div className="text-center mb-8">
                    <div className="inline-flex flex-col items-center gap-3">
                        <div className="text-2xl font-black text-white">
                            {config?.app?.name || 'Luwi Semantic Bridge'}
                        </div>
                        <p className="text-sm text-slate-400">
                            {config?.app?.description || 'AI-powered Semantic Search Platform'}
                        </p>
                    </div>
                </div>

                <div className="bg-slate-800/50 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border border-slate-700/50">
                    {success ? (
                        <div className="space-y-6">
                            <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                                <svg className="h-5 w-5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p className="text-green-300 text-sm">
                                    {t('forgotPassword.success')}
                                </p>
                            </div>
                            <a
                                href="/login"
                                className="flex items-center justify-center gap-2 w-full bg-slate-700/50 hover:bg-slate-700 text-white font-medium py-3 px-4 rounded-lg transition-all duration-300 border border-slate-600"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                                {t('forgotPassword.backToLogin')}
                            </a>
                        </div>
                    ) : (
                        <>
                            <div className="text-center mb-6">
                                <h2 className="text-xl font-semibold text-white mb-2">
                                    {t('forgotPassword.title')}
                                </h2>
                                <p className="text-sm text-slate-400">
                                    {t('forgotPassword.description')}
                                </p>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                {error && (
                                    <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                                        <svg className="h-5 w-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        <p className="text-red-300 text-sm">{error}</p>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">
                                        {t('forgotPassword.emailLabel')}
                                    </label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        disabled={loading}
                                        className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-white placeholder-slate-500 transition-all disabled:opacity-50"
                                        placeholder={t('forgotPassword.emailPlaceholder')}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading || !email}
                                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold py-3 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-purple-500/25"
                                >
                                    {loading ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                            {t('forgotPassword.sending')}
                                        </span>
                                    ) : (
                                        t('forgotPassword.sendResetLink')
                                    )}
                                </button>
                            </form>

                            <div className="mt-6 text-center">
                                <a href="/login" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors inline-flex items-center gap-1">
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                    </svg>
                                    {t('forgotPassword.backToLogin')}
                                </a>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
