'use client';

import React from 'react';
import Settings from './settings';

// Settings page with optimized loading
// Only loads the active tab's configuration for better performance
export default function SettingsPage() {
  return <Settings />;
}