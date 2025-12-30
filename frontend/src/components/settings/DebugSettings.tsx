'use client';

import React, { useState, useEffect } from 'react';
import { Switch } from '../ui/switch';
import { isDebugMode, setDebugMode } from '../../lib/debug';

export function DebugSettings() {
  const [debugEnabled, setDebugEnabled] = useState(false);

  useEffect(() => {
    setDebugEnabled(isDebugMode());
    const handleChange = (e: CustomEvent) => setDebugEnabled(e.detail);
    window.addEventListener('debugModeChanged', handleChange as EventListener);
    return () => window.removeEventListener('debugModeChanged', handleChange as EventListener);
  }, []);

  const handleToggle = (enabled: boolean) => {
    setDebugMode(enabled);
    setDebugEnabled(enabled);
  };

  return (
    <div className="flex items-center justify-between py-2 px-3 text-xs text-muted-foreground border-t">
      <span>Debug Mode</span>
      <Switch
        checked={debugEnabled}
        onCheckedChange={handleToggle}
        className="scale-75"
      />
    </div>
  );
}

export default DebugSettings;
