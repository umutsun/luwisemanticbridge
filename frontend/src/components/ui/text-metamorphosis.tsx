'use client';

import React, { useState, useEffect } from 'react';

// Generic text samples for transitions - not hardcoded meaningful content
const TEXT_SAMPLES = {
  titles: [
    'System initializing...',
    'Loading modules...',
    'Establishing connection...',
    'Processing data...',
    'Configuring environment...',
    'Synchronizing components...',
    'Initializing services...',
    'Loading resources...',
    'Establishing protocols...',
    'Configuring interfaces...',
    'Setting up parameters...',
    'Initializing engine...',
    'Loading assets...',
    'Establishing framework...',
    'Configuring system...'
  ],
  descriptions: [
    'Please wait while system loads...',
    'Initializing core components...',
    'Loading necessary modules...',
    'Establishing secure connection...',
    'Preparing user interface...',
    'Loading configuration files...',
    'Synchronizing with server...',
    'Optimizing performance settings...',
    'Checking system requirements...',
    'Loading user preferences...',
    'Initializing security protocols...',
    'Preparing workspace...',
    'Loading application data...',
    'Establishing communication channels...',
    'Configuring user settings...'
  ]
};

export interface TextMetamorphosisProps {
  title: string;
  description: string;
  speed?: number;
  intensity?: 'light' | 'medium' | 'heavy';
  className?: string;
}

function TextMetamorphosis({
  title,
  description,
  speed = 3000,
  intensity = 'medium',
  className = ''
}: TextMetamorphosisProps) {
  const [displayText, setDisplayText] = useState({ title: '', description: '' });
  const [isComplete, setIsComplete] = useState(false);

  // Character pool for scrambling - using same font weight throughout
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  // Create scrambled animation that slowly forms the target text
  const scrambleToTarget = (target: string, callback: (text: string) => void, delay = 0) => {
    setTimeout(() => {
      let iterations = 0;
      const maxIterations = 60; // More iterations for longer animation
      const interval = 100; // Much slower interval for visibility

      const scrambleInterval = setInterval(() => {
        let scrambled = '';

        // Keep most characters scrambled until very end
        const revealProgress = iterations / maxIterations;
        const charsToReveal = Math.floor(target.length * revealProgress * 0.8);

        for (let i = 0; i < target.length; i++) {
          if (i < charsToReveal && iterations > maxIterations * 0.85) {
            // Only reveal in the last 15% of iterations
            scrambled += target[i];
          } else {
            // Keep scrambling characters
            scrambled += CHARS[Math.floor(Math.random() * CHARS.length)];
          }
        }

        callback(scrambled);
        iterations++;

        if (iterations >= maxIterations) {
          callback(target);
          clearInterval(scrambleInterval);
        }
      }, interval);
    }, delay);
  };

  useEffect(() => {
    // Start with empty text, then scramble to form the title and description
    scrambleToTarget(title, (newTitle) => {
      setDisplayText(prev => ({ ...prev, title: newTitle }));
    }, 0);

    scrambleToTarget(description, (newDesc) => {
      setDisplayText(prev => ({ ...prev, description: newDesc }));
      // Mark as complete after both are done
      setTimeout(() => setIsComplete(true), 800);
    }, 800);
  }, [title, description]);

  return (
    <div className={`text-center w-full space-y-4 ${className}`}>
      {/* Both title and description with same font size and weight */}
      <div className={`text-2xl md:text-3xl font-bold tracking-tight transition-all duration-1000 min-h-[3rem] w-full max-w-md mx-auto ${
        isComplete
          ? 'bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent'
          : 'text-gray-400 dark:text-gray-500'
      } leading-relaxed font-sans`}>
        <div className="space-y-1">
          {/* Title - supports 2 lines */}
          <div className="font-bold">
            {displayText.title}
          </div>
          {/* Description - supports 2 lines */}
          <div className="font-bold">
            {displayText.description}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TextMetamorphosis;

// Export a specialized version for app titles
export function AppTitleMetamorphosis({
  title,
  description,
  className = ''
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <TextMetamorphosis
      title={title}
      description={description}
      speed={2000}
      intensity="medium"
      className={className}
    />
  );
}