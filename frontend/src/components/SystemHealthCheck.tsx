'use client';

import React, { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RefreshCw, Database, Settings, Wifi, WifiOff } from 'lucide-react';
import systemHealthService, { HealthCheckResult } from '@/lib/system-health';

interface SystemHealthCheckProps {
  onHealthy?: () => void;
  onUnhealthy?: (errors: string[]) => void;
  children?: React.ReactNode;
}

export default function SystemHealthCheck({
  onHealthy,
  onUnhealthy,
  children
}: SystemHealthCheckProps) {
  const [healthResult, setHealthResult] = useState<HealthCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const checkHealth = async () => {
    setIsChecking(true);
    try {
      const result = await systemHealthService.checkSystemHealth();
      setHealthResult(result);

      if (result.healthy) {
        console.log('✅ System is healthy');
        onHealthy?.();
      } else {
        console.error('❌ System health issues:', result.errors);
        onUnhealthy?.(result.errors);
      }
    } catch (error) {
      console.error('Health check failed:', error);
      const errorResult: HealthCheckResult = {
        healthy: false,
        health: {
          database: { connected: false, error: 'Health check failed' },
          settings: { loaded: false, error: 'Health check failed' },
          redis: { connected: false, error: 'Health check failed' }
        },
        errors: ['System health check failed']
      };
      setHealthResult(errorResult);
      onUnhealthy?.(['System health check failed']);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkHealth();
    // Check health every 30 seconds
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  if (healthResult?.healthy) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full space-y-4">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 text-red-500 mb-4">
            <Database className="h-12 w-12" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Sistem Bağlantı Hatası
          </h1>
          <p className="text-gray-600 mb-6">
            Alice Semantic Bridge başlatılamıyor. Lütfen sistem bağlantılarını kontrol edin.
          </p>
        </div>

        {/* Database Status */}
        <Alert className={healthResult?.health.database.connected ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
          <div className="flex items-center gap-2">
            {healthResult?.health.database.connected ? (
              <Database className="h-4 w-4 text-green-600" />
            ) : (
              <Database className="h-4 w-4 text-red-600" />
            )}
            <AlertTitle className="text-sm">ASemb Veritabanı</AlertTitle>
          </div>
          <AlertDescription className="text-sm">
            {healthResult?.health.database.connected ? (
              <span className="text-green-700">✅ Bağlandı</span>
            ) : (
              <div className="text-red-700">
                <div>❌ Bağlanamadı</div>
                {healthResult?.health.database.error && (
                  <div className="text-xs mt-1">{healthResult.health.database.error}</div>
                )}
              </div>
            )}
          </AlertDescription>
        </Alert>

        {/* Settings Status */}
        {healthResult?.health.database.connected && (
          <Alert className={healthResult?.health.settings.loaded ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
            <div className="flex items-center gap-2">
              {healthResult?.health.settings.loaded ? (
                <Settings className="h-4 w-4 text-green-600" />
              ) : (
                <Settings className="h-4 w-4 text-red-600" />
              )}
              <AlertTitle className="text-sm">Sistem Ayarları</AlertTitle>
            </div>
            <AlertDescription className="text-sm">
              {healthResult?.health.settings.loaded ? (
                <span className="text-green-700">✅ Yüklendi</span>
              ) : (
                <div className="text-red-700">
                  <div>❌ Yüklenemedi</div>
                  {healthResult?.health.settings.error && (
                    <div className="text-xs mt-1">{healthResult.health.settings.error}</div>
                  )}
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Redis Status */}
        {healthResult?.health.database.connected && (
          <Alert className={healthResult?.health.redis.connected ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
            <div className="flex items-center gap-2">
              {healthResult?.health.redis.connected ? (
                <Wifi className="h-4 w-4 text-green-600" />
              ) : (
                <WifiOff className="h-4 w-4 text-red-600" />
              )}
              <AlertTitle className="text-sm">Redis Cache</AlertTitle>
            </div>
            <AlertDescription className="text-sm">
              {healthResult?.health.redis.connected ? (
                <span className="text-green-700">✅ Bağlandı</span>
              ) : (
                <div className="text-red-700">
                  <div>❌ Bağlanamadı</div>
                  {healthResult?.health.redis.error && (
                    <div className="text-xs mt-1">{healthResult.health.redis.error}</div>
                  )}
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Error Messages */}
        {healthResult?.errors && healthResult.errors.length > 0 && (
          <Alert className="border-orange-200 bg-orange-50">
            <AlertTitle className="text-sm text-orange-800">Hata Detayları</AlertTitle>
            <AlertDescription className="text-sm text-orange-700">
              <ul className="list-disc list-inside space-y-1">
                {healthResult.errors.map((error, index) => (
                  <li key={index} className="text-xs">{error}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Retry Button */}
        <Button
          onClick={checkHealth}
          disabled={isChecking}
          className="w-full"
        >
          {isChecking ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Kontrol Ediliyor...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Tekrar Dene
            </>
          )}
        </Button>

        {/* Help Text */}
        <div className="text-center text-xs text-gray-500 space-y-1">
          <p>• .env dosyasındaki veritabanı ayarlarını kontrol edin</p>
          <p>• PostgreSQL ve Redis servislerinin çalıştığından emin olun</p>
          <p>• Network bağlantılarınızı kontrol edin</p>
        </div>
      </div>
    </div>
  );
}