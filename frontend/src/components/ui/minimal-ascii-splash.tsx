'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

// Latin Lorem Ipsum words for animation
const loremWords = [
  "LOREM", "IPSUM", "DOLOR", "SIT", "AMET", "CONSECTETUR",
  "ADIPISCING", "ELIT", "SED", "DO", "EIUSMOD", "TEMPOR",
  "INCIDIDUNT", "LABORE", "ET", "DOLORE", "MAGNA", "ALIQUA"
];

// Rotating ASCII Art
const asciiFrames = [
  [
    "    ╔═════════════════    ",
    "   ║▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓║   ",
    "  ║▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓║  ",
    " ║▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓║ ",
    " ║▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓║ ",
    "  ║▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓║  ",
    "   ║▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓║   ",
    "    ╚═════════════════    "
  ],
  [
    "    ╔═════════════════    ",
    "   ║░░░░░░░░░░░░░░░░░║   ",
    "  ║░░░░░░░░░░░░░░░░░░║  ",
    " ║░░░░░░░░░░░░░░░░░░░░║ ",
    " ║░░░░░░░░░░░░░░░░░░░░║ ",
    "  ║░░░░░░░░░░░░░░░░░░║  ",
    "   ║░░░░░░░░░░░░░░░░░║   ",
    "    ╚═════════════════    "
  ],
  [
    "    ╔═════════════════    ",
    "   ║▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒║   ",
    "  ║▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒║  ",
    " ║▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒║ ",
    " ║▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒║ ",
    "  ║▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒║  ",
    "   ║▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒║   ",
    "    ╚═════════════════    "
  ],
  [
    "    ╔═════════════════    ",
    "   ║▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓║   ",
    "  ║▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓║  ",
    " ║▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓║ ",
    " ║▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓║ ",
    "  ║▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓║  ",
    "   ║▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓║   ",
    "    ╚═════════════════    "
  ]
];

interface MinimalAsciiSplashProps {
  title: string;
  onComplete: () => void;
}

const MinimalAsciiSplash: React.FC<MinimalAsciiSplashProps> = ({
  title,
  onComplete
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [showTitle, setShowTitle] = useState(false);

  useEffect(() => {
    const steps = asciiArt.loading;
    let stepIndex = 0;

    const stepInterval = setInterval(() => {
      if (stepIndex < steps.length) {
        setDisplayText(steps[stepIndex]);
        stepIndex++;
      } else {
        clearInterval(stepInterval);
        setShowTitle(true);
        setTimeout(() => {
          onComplete();
        }, 1000);
      }
    }, 600);

    return () => clearInterval(stepInterval);
  }, [onComplete]);

  return (
    <div className="min-h-screen bg-black text-green-400 font-mono flex items-center justify-center overflow-hidden">
      {/* Subtle scan line effect */}
      <motion.div
        className="absolute inset-0 h-px bg-gradient-to-r from-transparent via-green-400/20 to-transparent"
        animate={{ y: [0, '100vh'] }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
      />

      <div className="relative z-10 text-center space-y-8">
        {/* ASCII Art */}
        <motion.pre
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1 }}
          className="text-sm leading-tight"
        >
          {asciiArt.simple.map((line, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              {line}
            </motion.div>
          ))}
        </motion.pre>

        {/* Loading Text */}
        {!showTitle ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-green-500"
          >
            <span className="inline-block">{displayText}</span>
            <motion.span
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.5, repeat: Infinity }}
              className="inline-block ml-1"
            >
              █
            </motion.span>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-2"
          >
            <h1 className="text-2xl text-green-400">{title}</h1>
            <div className="w-32 h-px bg-green-400/30 mx-auto" />
          </motion.div>
        )}

        {/* Random dots for ambiance */}
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute text-xs text-green-400/10"
            initial={{ opacity: 0 }}
            animate={{
              opacity: [0, Math.random() * 0.3, 0],
              x: Math.random() * 100 - 50,
              y: Math.random() * 100 - 50
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2
            }}
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`
            }}
          >
            {Math.random() > 0.5 ? '.' : '·'}
          </motion.div>
        ))}
      </div>

      {/* Terminal cursor effect at bottom */}
      <motion.div
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2"
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 1, repeat: Infinity }}
      >
        <span className="text-green-400 text-xs">READY</span>
      </motion.div>
    </div>
  );
};

export default MinimalAsciiSplash;