'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

interface ConnectionStatusProps {
  isConnected: boolean;
  isFallback: boolean;
  onReconnect?: () => void;
  showReconnectButton?: boolean;
}

export default function ConnectionStatus({
  isConnected,
  isFallback,
  onReconnect,
  showReconnectButton = true
}: ConnectionStatusProps) {

  // Real-time WebSocket connection
  if (isConnected && !isFallback) {
    return (
      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 dark:bg-green-900/20 dark:text-green-400 dark:border-green-700">
        <Wifi className="w-3 h-3 mr-1" />
        Real-time
      </Badge>
    );
  }

  // Polling fallback mode
  if (isFallback) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-700">
          <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
          Polling
        </Badge>
        {showReconnectButton && onReconnect && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReconnect}
            className="h-6 px-2 text-xs"
            title="Reconnect to WebSocket"
          >
            <Wifi className="w-3 h-3 mr-1" />
            Reconnect
          </Button>
        )}
      </div>
    );
  }

  // Disconnected
  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700">
        <WifiOff className="w-3 h-3 mr-1" />
        Disconnected
      </Badge>
      {showReconnectButton && onReconnect && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onReconnect}
          className="h-6 px-2 text-xs"
          title="Reconnect"
        >
          <RefreshCw className="w-3 h-3 mr-1" />
          Retry
        </Button>
      )}
    </div>
  );
}
