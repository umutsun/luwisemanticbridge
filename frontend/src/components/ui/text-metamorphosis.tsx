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
  const [currentText, setCurrentText] = useState({ title, description });
  const [displayedText, setDisplayedText] = useState({ title: '', description: '' });
  const [isTyping, setIsTyping] = useState(true);

  // Simple loading phrases
  const LOADING_PHRASES = [
    { title: 'Loading wisdom...', description: 'Knowledge awaits discovery' },
    { title: 'Finding patterns...', description: 'Creating meaning from data' },
    { title: 'Processing thoughts...', description: 'Weaving wisdom together' },
    { title: 'Discovering truth...', description: 'Insights bloom with patience' },
    { title: 'Building knowledge...', description: 'Every byte tells a story' },
    { title: 'Mining data gems...', description: 'Finding hidden treasures' },
    { title: 'Connecting ideas...', description: 'Building bridges of thought' },
    { title: 'Illuminating paths...', description: 'Light shows the way forward' }
  ];

  // Typing effect
  useEffect(() => {
    if (isTyping) {
      let titleIndex = 0;
      let descriptionIndex = 0;

      const typeInterval = setInterval(() => {
        if (titleIndex < currentText.title.length) {
          setDisplayedText(prev => ({
            ...prev,
            title: currentText.title.slice(0, titleIndex + 1)
          }));
          titleIndex++;
        } else if (descriptionIndex < currentText.description.length) {
          setDisplayedText(prev => ({
            ...prev,
            description: currentText.description.slice(0, descriptionIndex + 1)
          }));
          descriptionIndex++;
        } else {
          setIsTyping(false);
        }
      }, 50);

      return () => clearInterval(typeInterval);
    }
  }, [currentText, isTyping]);

  // Cycle through phrases
  useEffect(() => {
    let phraseIndex = 0;

    const interval = setInterval(() => {
      phraseIndex = (phraseIndex + 1) % LOADING_PHRASES.length;
      const nextPhrase = LOADING_PHRASES[phraseIndex];
      setCurrentText(nextPhrase);
      setDisplayedText({ title: '', description: '' });
      setIsTyping(true);
    }, speed);

    // Start with first phrase
    setCurrentText(LOADING_PHRASES[0]);
    setIsTyping(true);

    return () => clearInterval(interval);
  }, [speed]);

  return (
    <div className={`text-center w-full ${className}`}>
      <h2 className="text-2xl md:text-3xl font-light mb-3 h-8 text-gray-600 dark:text-gray-400">
        {displayedText.title}
        {isTyping && <span className="animate-pulse">|</span>}
      </h2>
      <p className="text-lg text-gray-500 dark:text-gray-500 h-6">
        {displayedText.description}
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