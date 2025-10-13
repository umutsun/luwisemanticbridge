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
  speed = 2500,
  intensity = 'medium',
  className = ''
}: TextMetamorphosisProps) {
  const [displayText, setDisplayText] = useState({ title: '', description: '' });
  const [targetText, setTargetText] = useState({ title, description });
  const [isComplete, setIsComplete] = useState(false);

  // Lorem ipsum first paragraph for loading animation
  const LOREM_IPSUM = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.";

  // Split into chunks for morphing animation
  const getLoremChunks = () => {
    const words = LOREM_IPSUM.split(' ');
    const chunks = [];

    // Create 8 different chunks from the Lorem ipsum text
    for (let i = 0; i < 8; i++) {
      const startIdx = i * 6;
      const title = words.slice(startIdx, startIdx + 3).join(' ');
      const desc = words.slice(startIdx + 3, startIdx + 7).join(' ');
      chunks.push({ title, description: desc });
    }

    return chunks;
  };

  const LOADING_PHRASES = getLoremChunks();

  // Smooth letter morphing
  const morphText = (from: string, to: string, callback: (text: string) => void) => {
    let step = 0;
    const totalSteps = 20;

    const morphInterval = setInterval(() => {
      if (step >= totalSteps) {
        callback(to);
        clearInterval(morphInterval);
        return;
      }

      const progress = step / totalSteps;
      let morphed = '';

      for (let i = 0; i < Math.max(from.length, to.length); i++) {
        if (progress < 0.5) {
          // First half: scramble
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz0123456789';
          morphed += chars[Math.floor(Math.random() * chars.length)];
        } else {
          // Second half: settle into target
          if (i < to.length) {
            morphed += to[i];
          }
        }
      }

      callback(morphed);
      step++;
    }, 50);
  };

  useEffect(() => {
    let phraseIndex = 0;

    const showNextPhrase = () => {
      if (phraseIndex < LOADING_PHRASES.length) {
        const phrase = LOADING_PHRASES[phraseIndex];
        morphText(displayText.title, phrase.title, (newTitle) => {
          setDisplayText(prev => ({ ...prev, title: newTitle }));
        });
        morphText(displayText.description, phrase.description, (newDesc) => {
          setDisplayText(prev => ({ ...prev, description: newDesc }));
        });
        phraseIndex++;
      } else {
        // Final morph to actual title and description
        morphText(displayText.title, title, (newTitle) => {
          setDisplayText(prev => ({ ...prev, title: newTitle }));
        });
        morphText(displayText.description, description, (newDesc) => {
          setDisplayText(prev => ({ ...prev, description: newDesc }));
          setTimeout(() => setIsComplete(true), 500);
        });
      }
    };

    // Start animation
    showNextPhrase();

    // Schedule next phrase
    const interval = setInterval(() => {
      if (phraseIndex <= LOADING_PHRASES.length) {
        showNextPhrase();
      } else {
        clearInterval(interval);
      }
    }, speed / (LOADING_PHRASES.length + 1));

    return () => clearInterval(interval);
  }, [title, description, speed]);

  return (
    <div className={`text-center w-full space-y-4 ${className}`}>
      <h1 className={`text-5xl md:text-6xl min-h-[4rem] font-light tracking-tight transition-all duration-1000 ${
        isComplete
          ? 'bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent font-semibold'
          : 'text-gray-400 dark:text-gray-500 font-light'
      } leading-tight`}>
        <span className="inline-block">
          {displayText.title}
        </span>
      </h1>
      <p className={`text-xl md:text-2xl max-w-lg mx-auto min-h-[3rem] transition-all duration-1000 ${
        isComplete
          ? 'text-gray-700 dark:text-gray-300 font-normal'
          : 'text-gray-400 dark:text-gray-500 font-light'
      } leading-relaxed`}>
        {displayText.description}
      </p>
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