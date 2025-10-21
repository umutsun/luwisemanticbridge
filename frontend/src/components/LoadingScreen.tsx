'use client';

import React from 'react';

interface LoadingScreenProps {
  message?: string;
  error?: string | null;
}

export function LoadingScreen({ message = 'Loading...', error }: LoadingScreenProps) {
  // Check if error is a backend connection issue
  const isBackendConnectionError = error?.includes('Backend') || error?.includes('bağlantısı');

  if (error && !isBackendConnectionError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="mb-6">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.314 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Bağlantı Hatası</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Not:</strong> Uygulama veritabanı bağlantısı gerektirir.
              Lütfen veritabanı yapılandırmanızı kontrol edin.
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Yeniden Dene
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-2xl p-8 text-center border border-gray-100">
        <div className="mb-6">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto shadow-lg">
            <svg className="animate-spin w-10 h-10 text-white" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Alice Semantic Bridge
        </h2>
        <p className="text-gray-600 mb-6 font-medium">{message || 'Sistem başlatılıyor...'}</p>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-center gap-2 text-gray-500">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            <p>Backend bağlantısı kuruluyor...</p>
          </div>
          <div className="flex items-center justify-center gap-2 text-gray-500">
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse delay-75"></div>
            <p>Veritabanı bağlantısı kontrol ediliyor...</p>
          </div>
          <div className="flex items-center justify-center gap-2 text-gray-500">
            <div className="w-2 h-2 bg-pink-500 rounded-full animate-pulse delay-150"></div>
            <p>Uygulama ayarları yükleniyor...</p>
          </div>
        </div>
        {isBackendConnectionError && (
          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800">
              <strong>⏳ Bekliyor:</strong> Backend servisi başlatılıyor. Otomatik olarak bağlanılacak...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}