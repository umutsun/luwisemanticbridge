'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSocketIO } from '@/hooks/useSocketIO';
import { Wifi, WifiOff, Send, MessageSquare } from 'lucide-react';

export default function WebSocketTest() {
  const [logs, setLogs] = useState<string[]>([]);
  const [testMessage, setTestMessage] = useState('Test WebSocket Connection');

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  // Test WebSocket connection
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';

  const { socket, isConnected } = useSocketIO(backendUrl);

  useEffect(() => {
    addLog(`Initializing WebSocket connection to: ${backendUrl}`);
  }, []);

  useEffect(() => {
    if (isConnected) {
      addLog('✅ WebSocket connected successfully!');
    }
  }, [isConnected]);

  const sendTestMessage = () => {
    if (socket && isConnected) {
      socket.emit('notification:test', {});
      addLog('📤 Sent test notification');
    } else {
      addLog('❌ Cannot send message - WebSocket not connected');
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-6 w-6" />
            WebSocket Connection Test
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connection Status */}
          <div className="flex items-center gap-4">
            <Badge variant={isConnected ? "default" : "destructive"} className="text-sm">
              {isConnected ? (
                <>
                  <Wifi className="h-3 w-3 mr-1" />
                  Connected
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3 mr-1" />
                  Disconnected
                </>
              )}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Backend URL: {backendUrl}
            </span>
          </div>

          {/* Test Controls */}
          <div className="flex gap-2">
            <Button onClick={sendTestMessage} disabled={!isConnected}>
              <Send className="h-4 w-4 mr-2" />
              Send Test Message
            </Button>
            <Button variant="outline" onClick={clearLogs}>
              Clear Logs
            </Button>
          </div>

          {/* Logs */}
          <div className="border rounded-lg p-4 h-96 overflow-y-auto bg-gray-50 dark:bg-gray-900">
            <h3 className="font-semibold mb-2">Connection Logs:</h3>
            {logs.length === 0 ? (
              <p className="text-muted-foreground">No logs yet...</p>
            ) : (
              <div className="space-y-1 font-mono text-sm">
                {logs.map((log, index) => (
                  <div key={index} className={log.includes('✅') ? 'text-green-600' : log.includes('❌') ? 'text-red-600' : 'text-gray-600'}>
                    {log}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h3 className="font-semibold mb-2 text-blue-800 dark:text-blue-200">Instructions:</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-blue-700 dark:text-blue-300">
              <li>Open browser developer tools (F12)</li>
              <li>Check console for WebSocket connection logs</li>
              <li>Look for "🔌 useSocketIO: Connecting to Socket.IO server at:"</li>
              <li>Click "Send Test Message" to test WebSocket communication</li>
              <li>Check backend logs for "WebSocket client connected"</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}