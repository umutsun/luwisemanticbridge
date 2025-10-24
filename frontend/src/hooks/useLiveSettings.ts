'use client';

import { useEffect, useState } from 'react';
import { useLiveData } from '@/services/liveDataService';

interface LiveSettingsState {
  isConnected: boolean;
  lastUpdate: string;
  changedBy: string;
  changes: Array<{
    category: string;
    key: string;
    oldValue: any;
    newValue: any;
    timestamp: string;
  }>;
}

export function useLiveSettings() {
  const { subscribeToSettingsChanges, isConnected } = useLiveData();
  const [settingsState, setSettingsState] = useState<LiveSettingsState>({
    isConnected: false,
    lastUpdate: '',
    changedBy: '',
    changes: []
  });

  useEffect(() => {
    setSettingsState(prev => ({ ...prev, isConnected }));

    // Subscribe to settings changes
    const unsubscribe = subscribeToSettingsChanges((data) => {
      console.log('Live settings update received:', data);

      setSettingsState(prev => ({
        ...prev,
        lastUpdate: data.timestamp,
        changedBy: data.changedBy,
        changes: [
          {
            category: data.category,
            key: data.key,
            oldValue: data.oldValue,
            newValue: data.newValue,
            timestamp: data.timestamp
          },
          ...prev.changes.slice(0, 9) // Keep only last 10 changes
        ]
      }));
    });

    return unsubscribe;
  }, [isConnected, subscribeToSettingsChanges]);

  const clearChanges = () => {
    setSettingsState(prev => ({ ...prev, changes: [] }));
  };

  return {
    ...settingsState,
    clearChanges
  };
}