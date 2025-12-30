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

  // Just return the Switch - parent component handles layout
  return (
    <Switch
      checked={debugEnabled}
      onCheckedChange={handleToggle}
    />
  );
}

export default DebugSettings;
