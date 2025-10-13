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
  speed = 2000,
  intensity = 'medium',
  className = ''
}: TextMetamorphosisProps) {
  const [currentTitle, setCurrentTitle] = useState(title);
  const [currentDescription, setCurrentDescription] = useState(description);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [displayedTitle, setDisplayedTitle] = useState('');
  const [displayedDescription, setDisplayedDescription] = useState('');
  const [titleIndex, setTitleIndex] = useState(0);
  const [descriptionIndex, setDescriptionIndex] = useState(0);

  // Zen loading phrases
  const ZEN_PHRASES = {
    titles: [
      'Loading wisdom...',
      'Harnessing data...',
      'Finding patterns...',
      'Analyzing insights...',
      'Connecting knowledge...',
      'Discovering truth...',
      'Processing thoughts...',
      'Building bridges...',
      'Mining data gems...',
      'Unlocking secrets...',
      'Weaving narratives...',
      'Illuminating paths...'
    ],
    descriptions: [
      'Finding meaning in the data',
      'Every byte tells a story',
      'Knowledge awaits discovery',
      'Patterns emerge from chaos',
      'Insights bloom with patience',
      'Truth reveals itself slowly',
      'Wisdom flows through data',
      'Understanding takes time',
      'Clarity comes with focus',
      'Answers lie within'
    ]
  };

  const getTransitionDuration = () => {
    switch (intensity) {
      case 'light': return 500;
      case 'medium': return 700;
      case 'heavy': return 1000;
      default: return 700;
    }
  };

  // Gradual letter reveal with traveling effect
  useEffect(() => {
    if (titleIndex < currentTitle.length) {
      const timeout = setTimeout(() => {
        setDisplayedTitle(currentTitle.slice(0, titleIndex + 1));
        setTitleIndex(titleIndex + 1);
      }, 80); // Slower for more dramatic effect
      return () => clearTimeout(timeout);
    } else if (descriptionIndex < currentDescription.length) {
      const timeout = setTimeout(() => {
        setDisplayedDescription(currentDescription.slice(0, descriptionIndex + 1));
        setDescriptionIndex(descriptionIndex + 1);
      }, 50); // Slower for more dramatic effect
      return () => clearTimeout(timeout);
    }
  }, [currentTitle, currentDescription, titleIndex, descriptionIndex]);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsTransitioning(true);

      setTimeout(() => {
        // Select zen text instead of generic system text
        const randomTitle = ZEN_PHRASES.titles[Math.floor(Math.random() * ZEN_PHRASES.titles.length)];
        const randomDescription = ZEN_PHRASES.descriptions[Math.floor(Math.random() * ZEN_PHRASES.descriptions.length)];

        setCurrentTitle(randomTitle);
        setCurrentDescription(randomDescription);
        setTitleIndex(0);
        setDescriptionIndex(0);
        setDisplayedTitle('');
        setDisplayedDescription('');
        setIsTransitioning(false);
      }, 300);
    }, speed);

    return () => clearInterval(interval);
  }, [speed, intensity]);

  // Initialize with first text
  useEffect(() => {
    const randomTitle = ZEN_PHRASES.titles[0];
    const randomDescription = ZEN_PHRASES.descriptions[0];
    setCurrentTitle(randomTitle);
    setCurrentDescription(randomDescription);
  }, []);

  return (
    <div className={`text-center relative ${className}`}>
      {/* Animated gradient background effect */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-64 h-64 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-indigo-500/10 rounded-full blur-3xl animate-pulse"></div>
      </div>

      {/* Title with letter-by-letter reveal */}
      <h1 className="relative text-4xl md:text-5xl font-semibold mb-6 h-20 flex items-center justify-center">
        <span className="bg-gradient-to-r from-blue-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
          {displayedTitle.split('').map((char, i) => (
            <span
              key={i}
              className="inline-block transition-all duration-300"
              style={{
                animation: `letterTravel 0.6s ease-out ${i * 0.05}s`,
                opacity: i <= titleIndex ? 1 : 0,
                transform: i <= titleIndex ? 'translateY(0)' : 'translateY(-10px)'
              }}
            >
              {char === ' ' ? '\u00A0' : char}
            </span>
          ))}
          <span className="animate-pulse ml-1">|</span>
        </span>
      </h1>

      {/* Description with letter-by-letter reveal */}
      <p className="relative text-lg text-muted-foreground/90 max-w-md mx-auto h-12 flex items-center justify-center font-medium tracking-wide">
        {displayedDescription.split('').map((char, i) => (
          <span
            key={i}
            className="inline-block transition-all duration-300"
            style={{
              animation: `letterTravel 0.6s ease-out ${i * 0.03}s`,
              opacity: i <= descriptionIndex ? 1 : 0,
              transform: i <= descriptionIndex ? 'translateY(0)' : 'translateY(-5px)'
            }}
          >
            {char === ' ' ? '\u00A0' : char}
          </span>
        ))}
        {descriptionIndex < currentDescription.length && (
          <span className="animate-pulse ml-1">|</span>
        )}
      </p>

      {/* Floating particles effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-primary/30 rounded-full animate-pulse"
            style={{
              left: `${20 + i * 15}%`,
              top: `${60 + (i % 2) * 20}%`,
              animationDelay: `${i * 0.5}s`,
              animationDuration: '3s'
            }}
          />
        ))}
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