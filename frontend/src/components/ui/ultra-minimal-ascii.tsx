'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface UltraMinimalAsciiProps {
  title: string;
  onComplete: () => void;
}

const UltraMinimalAscii: React.FC<UltraMinimalAsciiProps> = ({
  title,
  onComplete
}) => {
  const [frame, setFrame] = useState(0);
  const [loadingText, setLoadingText] = useState('LOADING');
  const [loading, setLoading] = useState(true);
  const [textColor, setTextColor] = useState('#4ade80');
  const [glowColor, setGlowColor] = useState('rgba(74, 222, 128, 0.5)');
  const [colorIndex, setColorIndex] = useState(0);
  const [mounted, setMounted] = useState(false);

  // Psychedelic color palette for transitions
  const colorPalettes = [
    { text: '#4ade80', glow: 'rgba(74, 222, 128, 0.5)' }, // Green
    { text: '#60a5fa', glow: 'rgba(96, 165, 250, 0.5)' }, // Blue
    { text: '#c084fc', glow: 'rgba(192, 132, 252, 0.5)' }, // Purple
    { text: '#f472b6', glow: 'rgba(244, 114, 182, 0.5)' }, // Pink
    { text: '#fbbf24', glow: 'rgba(251, 191, 36, 0.5)' }, // Yellow
    { text: '#34d399', glow: 'rgba(52, 211, 153, 0.5)' }, // Emerald
    { text: '#f87171', glow: 'rgba(248, 113, 113, 0.5)' }, // Red
    { text: '#38bdf8', glow: 'rgba(56, 189, 248, 0.5)' }, // Sky
    { text: '#a78bfa', glow: 'rgba(167, 139, 250, 0.5)' }, // Violet
    { text: '#10b981', glow: 'rgba(16, 185, 129, 0.5)' }, // Teal
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

  const [allWords, setAllWords] = useState<string[]>(['LOADING', 'SYSTEM', 'SEMANTIC']);
  const [matrixElements, setMatrixElements] = useState<Array<{id: number, text: string, left: number, top: number, duration: number}>>([]);

  // Generate dynamic cube frames with custom text
  const cubeFrames = [
    // Front - LUWI
    [
      "  ╔════╗  ",
      " ║░░░░░║ ",
      `║░░LUWI░░║`,
      " ║░░░░░║ ",
      "  ╚════╝  "
    ],
    // Right - SEMANTIC
    [
      "  ╔══════╗  ",
      " ║░░░░░░░║ ",
      `║SEMANTIC░║`,
      " ║░░░░░░░║ ",
      "  ╚══════╝  "
    ],
    // Back - BRIDGE
    [
      "  ╔═══════╗  ",
      " ║░░░░░░░░║ ",
      `║░BRIDGE░░░║`,
      " ║░░░░░░░░║ ",
      "  ╚═══════╝  "
    ],
    // Left - AI
    [
      "  ╔═══╗  ",
      " ║░░░░║ ",
      `║░AI░░║`,
      " ║░░░░║ ",
      "  ╚═══╝  "
    ]
  ];

  useEffect(() => {
    setMounted(true);

    // Initialize with first color
    setTextColor(colorPalettes[0].text);
    setGlowColor(colorPalettes[0].glow);

    // Generate matrix elements on client side only
    const elements = [...Array(20)].map((_, i) => ({
      id: i,
      text: Array(30).fill(0).map(() =>
        String.fromCharCode(33 + Math.floor(Math.random() * 94))
      ).join(''),
      left: Math.random() * 100,
      top: Math.random() * 100,
      duration: 10 + Math.random() * 10
    }));
    setMatrixElements(elements);

    // Fetch custom loading text
    const fetchLoadingText = async () => {
      try {
        const response = await fetch('/api/config');
        const data = await response.json();
        const customText = data.loadingText || 'Loading system... semantic analysis in progress...';
        const words = generateWordsFromText(customText);
        setAllWords(words);
      } catch (error) {
        // Fallback to default words
        setAllWords(['LOADING', 'SYSTEM', 'SEMANTIC', 'ANALYZING', 'PROCESSING']);
      }
    };

    fetchLoadingText();
  }, []);

  useEffect(() => {
    if (!mounted) return;

    // Rotate cube
    const cubeInterval = setInterval(() => {
      setFrame(prev => (prev + 1) % cubeFrames.length);
    }, 500);

    // Change text
    const textInterval = setInterval(() => {
      const randomWord = allWords[Math.floor(Math.random() * allWords.length)];
      setLoadingText(randomWord);
    }, 800);

    // Transition colors
    const colorInterval = setInterval(() => {
      setColorIndex(prev => {
        const nextIndex = (prev + 1) % colorPalettes.length;
        setTextColor(colorPalettes[nextIndex].text);
        setGlowColor(colorPalettes[nextIndex].glow);
        return nextIndex;
      });
    }, 2000);

    // Complete after 4.5 seconds or when services are ready
    const completeTimer = setTimeout(() => {
      setLoading(false);
      setTimeout(() => onComplete(), 500);
    }, 4500);

    return () => {
      clearInterval(cubeInterval);
      clearInterval(textInterval);
      clearInterval(colorInterval);
      clearTimeout(completeTimer);
    };
  }, [allWords, mounted]);

  return (
    <div className="min-h-screen bg-black font-mono flex items-center justify-center overflow-hidden transition-all duration-1000 ease-in-out" style={{ color: textColor }}>
      {/* Matrix rain effect background */}
      {mounted && (
        <div className="absolute inset-0" style={{ opacity: 0.05 }}>
          {matrixElements.map((element) => (
            <div
              key={element.id}
              className="absolute text-xs leading-none"
              style={{
                left: `${element.left}%`,
                top: `${element.top}%`,
                animation: `fall ${element.duration}s linear infinite`
              }}
            >
              {element.text}
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        @keyframes fall {
          0% { transform: translateY(-100vh); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
      `}</style>

      <div className="relative z-10 text-center">
        {/* 3D Rotating Cube */}
        <motion.pre
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-lg leading-tight mb-8"
          style={{
            textShadow: `0 0 10px ${glowColor}`,
            transition: 'text-shadow 1s ease-in-out'
          }}
        >
          {cubeFrames[frame].map((line, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              {line}
            </motion.div>
          ))}
        </motion.pre>

        {/* Loading text */}
        {!loading ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <h1 className="text-2xl mb-2">{title}</h1>
            <p className="text-sm opacity-80 mb-2">AI-Powered Knowledge Management System</p>
            <p className="text-xs opacity-60">Semantic Analysis • Intelligent Search • Knowledge Bridge</p>
            <div className="w-48 h-px mx-auto mt-4 transition-colors duration-1000 ease-in-out" style={{ backgroundColor: textColor, transition: 'background-color 1s ease-in-out' }} />
          </motion.div>
        ) : (
          <div className="space-y-4">
            <motion.div
              key={loadingText}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-sm opacity-80"
            >
              Initializing {loadingText}...
            </motion.div>
            <div className="flex justify-center space-x-1">
              {[...Array(3)].map((_, i) => (
                <motion.div
                  key={i}
                  className="w-1 h-1 rounded-full"
                  style={{ backgroundColor: textColor, transition: 'background-color 1s ease-in-out' }}
                  animate={{ scale: [1, 1.5, 1] }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    delay: i * 0.2
                  }}
                />
              ))}
            </div>
            <div className="text-xs opacity-50 mt-4">
              <p>Luwi Semantic Bridge</p>
              <p>Connecting Knowledge, Powering Insights</p>
            </div>
          </div>
        )}

        {/* Minimal status */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
          <motion.span
            className="text-xs"
            style={{ opacity: 0.5 }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {loading ? 'INITIALIZING' : 'READY'}
          </motion.span>
        </div>
      </div>
    </div>
  );
};

export default UltraMinimalAscii;