'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface PsychedelicAsciiProps {
  title: string;
  onComplete: () => void;
}

const PsychedelicAscii: React.FC<PsychedelicAsciiProps> = ({
  title,
  onComplete
}) => {
  const [frame, setFrame] = useState(0);
  const [loadingText, setLoadingText] = useState('LOADING');
  const [loading, setLoading] = useState(true);
  const [colorIndex, setColorIndex] = useState(0);
  const [allWords, setAllWords] = useState(['LOADING', 'SYSTEM', 'SEMANTIC']);

  // Psychedelic color palettes with gradient effects
  const psychedelicPalettes = [
    ['#FF006E', '#FB5607', '#FFBE0B', '#8338EC'], // Hot pink to purple
    ['#00F5FF', '#00FF88', '#FFFF00', '#FF00FF'], // Cyan to magenta
    ['#FF1744', '#F50057', '#D500F9', '#651FFF'], // Red to violet
    ['#00E676', '#76FF03', '#C6FF00', '#FFEA00'], // Green to yellow
    ['#304FFE', '#6200EA', '#AA00FF', '#E040FB'], // Deep blue to pink
    ['#FF6D00', '#FF3D00', '#DD2C00', '#BF360C'], // Orange to red
    ['#00B8D4', '#00ACC1', '#0097A7', '#00838F'], // Cyan palette
    ['#69F0AE', '#B2FF59', '#EEFF41', '#FFFF00'], // Green to yellow
    ['#E91E63', '#F06292', '#FF4081', '#FF80AB'], // Pink palette
    ['#7C4DFF', '#B388FF', '#D1C4E9', '#EDE7F6'], // Purple to lavender
  ];

  // Psychedelic ASCII art patterns
  const psychedelicFrames = [
    // Pattern 1: Expanding circle
    [
      '      ░░░      ',
      '    ░░██░░    ',
      '   ░░████░░   ',
      '  ░░██████░░  ',
      ' ░░████████░░ ',
      '  ░░██████░░  ',
      '   ░░████░░   ',
      '    ░░██░░    ',
      '      ░░░      '
    ],
    // Pattern 2: Diamond shape
    [
      '      ██      ',
      '    ██████    ',
      '  ██████████  ',
      ' ████████████ ',
      '██████████████',
      ' ████████████ ',
      '  ██████████  ',
      '    ██████    ',
      '      ██      '
    ],
    // Pattern 3: Spiral effect
    [
      '    ░████    ',
      '   ██░░░░██   ',
      '  ██░░██░░██  ',
      ' ██░░████░░██ ',
      '██░░██████░░██',
      ' ██░░████░░██ ',
      '  ██░░██░░██  ',
      '   ██░░░░██   ',
      '    ░████    '
    ],
    // Pattern 4: Wave pattern
    [
      '░░░░░░░░░░░░░',
      '██████████████',
      '░░░░░░░░░░░░░',
      '██████████████',
      '░░░░░░░░░░░░░',
      '██████████████',
      '░░░░░░░░░░░░░',
      '██████████████',
      '░░░░░░░░░░░░░'
    ]
  ];

  // Generate random words from loading text
  const generateWordsFromText = (text: string) => {
    const words = text
      .split(' ')
      .filter(word => word.length > 3 && word.length < 12)
      .map(word => word.toUpperCase().substring(0, 6))
      .slice(0, 10);

    if (words.length === 0) {
      return ['LOADING', 'SYSTEM', 'SEMANTIC', 'ANALYZING', 'PROCESSING'];
    }
    return words;
  };

  useEffect(() => {
    // Initialize with random colors
    const randomPalette = psychedelicPalettes[Math.floor(Math.random() * psychedelicPalettes.length)];
    setColorIndex(Math.floor(Math.random() * 4));

    // Fetch custom loading text
    const fetchLoadingText = async () => {
      try {
        const response = await fetch('/api/config');
        const data = await response.json();
        const customText = data.loadingText || 'Loading system... semantic analysis in progress...';
        const words = generateWordsFromText(customText);
        setAllWords(words);
      } catch (error) {
        setAllWords(['LOADING', 'SYSTEM', 'SEMANTIC', 'ANALYZING', 'PROCESSING']);
      }
    };

    fetchLoadingText();
  }, []);

  useEffect(() => {
    // Rotate patterns
    const frameInterval = setInterval(() => {
      setFrame(prev => (prev + 1) % psychedelicFrames.length);
    }, 400);

    // Change text
    const textInterval = setInterval(() => {
      const randomWord = allWords[Math.floor(Math.random() * allWords.length)];
      setLoadingText(randomWord);
    }, 700);

    // Rotate colors
    const colorInterval = setInterval(() => {
      setColorIndex(prev => (prev + 1) % 4);
    }, 200);

    // Complete after 3 seconds
    const completeTimer = setTimeout(() => {
      setLoading(false);
      setTimeout(() => onComplete(), 500);
    }, 3000);

    return () => {
      clearInterval(frameInterval);
      clearInterval(textInterval);
      clearInterval(colorInterval);
      clearTimeout(completeTimer);
    };
  }, [allWords]);

  const getCurrentColors = () => {
    const paletteIndex = Math.floor(Math.random() * psychedelicPalettes.length);
    return psychedelicPalettes[paletteIndex];
  };

  const colors = getCurrentColors();

  return (
    <div className="min-h-screen bg-black font-mono flex items-center justify-center overflow-hidden relative">
      {/* Animated psychedelic background */}
      <div className="absolute inset-0">
        {[...Array(30)].map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full blur-sm"
            style={{
              backgroundColor: colors[i % colors.length],
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `pulse ${2 + Math.random() * 3}s ease-in-out infinite, float ${5 + Math.random() * 10}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 2}s`
            }}
          />
        ))}
      </div>

      {/* Matrix rain with colors */}
      <div className="absolute inset-0 opacity-20">
        {[...Array(40)].map((_, i) => (
          <div
            key={i}
            className="absolute text-xs leading-none font-mono"
            style={{
              color: colors[i % colors.length],
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `fall ${5 + Math.random() * 10}s linear infinite`,
              textShadow: `0 0 8px ${colors[i % colors.length]}`
            }}
          >
            {Array(50).fill(0).map(() =>
              String.fromCharCode(33 + Math.floor(Math.random() * 94))
            ).join('')}
          </div>
        ))}
      </div>

      <style jsx>{`
        @keyframes fall {
          0% { transform: translateY(-100vh); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(2); opacity: 1; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px) translateX(0px); }
          33% { transform: translateY(-20px) translateX(10px); }
          66% { transform: translateY(20px) translateX(-10px); }
        }
      `}</style>

      <div className="relative z-10 text-center">
        {/* Psychedelic ASCII Art */}
        <motion.pre
          initial={{ opacity: 0, scale: 0.5, rotate: -180 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 1, type: "spring" }}
          className="text-lg leading-tight mb-8"
        >
          {psychedelicFrames[frame].map((line, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, type: "spring" }}
              className="relative"
            >
              {line.split('').map((char, j) => (
                <motion.span
                  key={j}
                  className="inline-block"
                  style={{
                    color: colors[(i + j + colorIndex) % colors.length],
                    textShadow: `
                      0 0 10px ${colors[(i + j + colorIndex) % colors.length]},
                      0 0 20px ${colors[(i + j + colorIndex) % colors.length]},
                      0 0 30px ${colors[(i + j + colorIndex) % colors.length]}
                    `,
                    filter: 'brightness(1.5)'
                  }}
                  animate={{
                    scale: char !== ' ' ? [1, 1.2, 1] : 1,
                    opacity: char !== ' ' ? [0.5, 1, 0.5] : 0.3
                  }}
                  transition={{
                    duration: 1 + Math.random() * 2,
                    repeat: Infinity,
                    delay: (i * line.length + j) * 0.05
                  }}
                >
                  {char === ' ' ? '\u00A0' : char}
                </motion.span>
              ))}
            </motion.div>
          ))}
        </motion.pre>

        {/* Animated loading text with gradient */}
        <div className="mb-8 h-8">
          {!loading ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4"
            >
              <h1
                className="text-3xl font-bold"
                style={{
                  background: `linear-gradient(90deg, ${colors[0]}, ${colors[1]}, ${colors[2]}, ${colors[3]})`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  textShadow: `0 0 30px ${colors[1]}`
                }}
              >
                {title}
              </h1>
              <p
                className="text-lg opacity-80"
                style={{
                  background: `linear-gradient(90deg, ${colors[0]}, ${colors[2]})`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}
              >
                AI-Powered Knowledge Management System
              </p>
              <p className="text-sm opacity-60 mt-2">Semantic Analysis • Intelligent Search • Knowledge Bridge</p>
              <div className="flex justify-center mt-4">
                <motion.div
                  className="h-px"
                  initial={{ width: 0 }}
                  animate={{ width: '200px' }}
                  transition={{ delay: 0.5, duration: 1 }}
                  style={{
                    background: `linear-gradient(90deg, transparent, ${colors[1]}, transparent)`
                  }}
                />
              </div>
            </motion.div>
          ) : (
            <div className="space-y-4">
              <motion.div
                key={loadingText + colorIndex}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="text-xl font-bold"
                style={{
                  color: colors[colorIndex],
                  textShadow: `0 0 20px ${colors[colorIndex]}`
                }}
              >
                {loadingText}
              </motion.div>

              {/* Animated dots with rainbow effect */}
              <div className="flex justify-center space-x-2">
                {[...Array(5)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor: colors[(colorIndex + i) % colors.length],
                      boxShadow: `0 0 10px ${colors[(colorIndex + i) % colors.length]}`
                    }}
                    animate={{
                      scale: [1, 1.5, 1],
                      y: [0, -10, 0],
                      rotate: [0, 180, 360]
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      delay: i * 0.1
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Psychedelic status indicator */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
          <motion.span
            className="text-sm font-bold"
            style={{
              color: colors[colorIndex],
              textShadow: `0 0 10px ${colors[colorIndex]}`
            }}
            animate={{
              opacity: [0.3, 1, 0.3],
              scale: [1, 1.1, 1]
            }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {loading ? '✨ INITIALIZING SYSTEM ✨' : '🌟 READY TO LAUNCH 🌟'}
          </motion.span>
        </div>

        {/* Corner decorations */}
        {[...Array(4)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute text-2xl"
            style={{
              top: i < 2 ? '20px' : 'auto',
              bottom: i >= 2 ? '20px' : 'auto',
              left: i % 2 === 0 ? '20px' : 'auto',
              right: i % 2 === 1 ? '20px' : 'auto',
              color: colors[i % colors.length]
            }}
            animate={{
              rotate: [0, 360],
              scale: [1, 1.2, 1]
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              delay: i * 0.5
            }}
          >
            {['◈', '◉', '◆', '◇'][i]}
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default PsychedelicAscii;