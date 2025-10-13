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
  speed = 1500,
  intensity = 'medium',
  className = ''
}: TextMetamorphosisProps) {
  const [currentTitle, setCurrentTitle] = useState(title);
  const [currentDescription, setCurrentDescription] = useState(description);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const getTransitionDuration = () => {
    switch (intensity) {
      case 'light': return 300;
      case 'medium': return 500;
      case 'heavy': return 800;
      default: return 500;
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setIsTransitioning(true);

      setTimeout(() => {
        // Select random text
        const randomTitle = TEXT_SAMPLES.titles[Math.floor(Math.random() * TEXT_SAMPLES.titles.length)];
        const randomDescription = TEXT_SAMPLES.descriptions[Math.floor(Math.random() * TEXT_SAMPLES.descriptions.length)];

        setCurrentTitle(randomTitle);
        setCurrentDescription(randomDescription);
        setIsTransitioning(false);
      }, getTransitionDuration());
    }, speed);

    return () => clearInterval(interval);
  }, [speed, intensity]);

  return (
    <div className={`text-center ${className}`}>
      <h1
        className={`text-3xl font-bold mb-2 transition-all duration-300 ${
          isTransitioning ? 'opacity-30 blur-sm scale-95' : 'opacity-100 blur-0 scale-100'
        }`}
      >
        <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
          {currentTitle}
        </span>
      </h1>
      <p
        className={`text-sm text-muted-foreground max-w-sm mx-auto transition-all duration-300 ${
          isTransitioning ? 'opacity-30 blur-sm scale-95' : 'opacity-100 blur-0 scale-100'
        }`}
      >
        {currentDescription}
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