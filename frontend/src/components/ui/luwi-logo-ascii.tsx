'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const LuwiLogoAscii = ({
  title,
  subtitle = "Context Engine",
  description = "AI-Powered Knowledge Management System",
  onComplete
}: {
  title: string;
  subtitle?: string;
  description?: string;
  onComplete: () => void;
}) => {
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [showBranding, setShowBranding] = useState(false);
  const [currentLine, setCurrentLine] = useState(0);

  // ASCII Luwi.dev logo
  const logoLines = [
    "@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@",
    "@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@",
    "@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@",
    "@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@",
    "@@@@@@@@@@@@@@@@@@@      @@@@@@@@@@@@@@@@@@@@@@@@@@",
    "@@@@@@@@@@@@@@@@               @@@@@@@@@@@@@@@@@@@@",
    "@@@@@@@@@@@@@@     @@@@@@@@@@@@    @@@@@@@@@@@@@@@",
    "@@@@@@@@@@@@@    @@@@@@@@@@@@@@@@    @@@@@@@@@@@@@@",
    "@@@@@@@@@@@@@  @@@@@@@@@@@@@@@@@@@@    @@@@@@@@@@@@",
    "@@@@@@@@@@@@  @@@@@@@        @@@@@@@@  @@@@@@@@@@@@",
    "@@@@@@@@@@@@  @@@@            @@@@  @@@@@@@@@@@@@@",
    "@@@@@@@@@@@@  @@@    @@@@@@@@@    @@@  @@@@@@@@@@@@",
    "@@@@@@@@@@@@  @@    @@@@@@@@@@@    @@  @@@@@@@@@@@@",
    "@@@@@@@@@@@@  @@   @   @@@@@   @   @@  @@@@@@@@@@@@",
    "@@@@@@@@@@@@  @    @    @@@    @   @@  @@@@@@@@@@@@",
    "@@@@@@@@@@@@  @@    @@    @    @@   @@  @@@@@@@@@@@@",
    "@@@@@@@@@@@@  @@@    @    @    @    @@  @@@@@@@@@@@@",
    "@@@@@@@@@@@@  @@         @         @@  @@@@@@@@@@@@",
    "@@@@@@@@@@@@  @@@@      @@@      @@@@  @@@@@@@@@@@@",
    "@@@@@@@@@@@@@  @@@@@@@@@@@@@@@@@@@@@  @@@@@@@@@@@@",
    "@@@@@@@@@@@@@@   @@@@@@@@@@@@@@@@@   @@@@@@@@@@@@@@",
    "@@@@@@@@@@@@@@@@    @@@@@@@@@@@    @@@@@@@@@@@@@@@",
    "@@@@@@@@@@@@@@@@@@                @@@@@@@@@@@@@@@@@",
    "@@@@@@@@@@@@@@@@@@@@        @@@@@@@@@@@@@@@@@@@@@@@",
    "@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@",
    "@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@",
    "@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@",
    "@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@"
  ];

  const brandingLines = [
    "SEMANTIC ANALYSIS • INTELLIGENT SEARCH • KNOWLEDGE BRIDGE",
    "AI-Powered Knowledge Management System"
  ];

  useEffect(() => {
    // Animate logo appearing line by line
    if (currentLine < logoLines.length) {
      const timer = setTimeout(() => {
        setCurrentLine(currentLine + 1);
      }, 30);
      return () => clearTimeout(timer);
    } else {
      // After logo is complete, show subtitle
      const timer1 = setTimeout(() => setShowSubtitle(true), 200);
      const timer2 = setTimeout(() => setShowDescription(true), 600);
      const timer3 = setTimeout(() => setShowBranding(true), 1000);

      // Complete after branding animation
      const timer4 = setTimeout(() => {
        onComplete();
      }, 3000);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
        clearTimeout(timer4);
      };
    }
  }, [currentLine, onComplete]);

  return (
    <div className="min-h-screen bg-black text-green-400 flex flex-col items-center justify-center overflow-hidden">
      {/* Matrix-like background effect */}
      <div className="absolute inset-0 opacity-20">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute text-green-500 text-xs"
            initial={{ y: -100 }}
            animate={{ y: window.innerHeight + 100 }}
            transition={{
              duration: 5 + Math.random() * 10,
              repeat: Infinity,
              delay: Math.random() * 5,
              ease: "linear"
            }}
            style={{
              left: `${Math.random() * 100}%`,
              fontFamily: 'monospace'
            }}
          >
            {Math.random() > 0.5 ? '01' : '10'}
          </motion.div>
        ))}
      </div>

      {/* Logo Container */}
      <div className="relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1 }}
          className="text-center"
        >
          {/* ASCII Logo */}
          <pre className="font-mono text-xs leading-tight tracking-wider select-none">
            {logoLines.map((line, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{
                  opacity: index <= currentLine ? 1 : 0,
                  x: index <= currentLine ? 0 : -20
                }}
                transition={{
                  duration: 0.1,
                  ease: "easeOut"
                }}
                className={index <= currentLine ? 'text-green-400' : 'text-transparent'}
              >
                {line}
              </motion.div>
            ))}
          </pre>

          {/* Subtitle - Animated */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: showSubtitle ? 1 : 0, y: showSubtitle ? 0 : 20 }}
            transition={{ duration: 0.8 }}
            className="mt-8"
          >
            <h1 className="text-4xl font-bold text-green-300 tracking-wider">
              LUWI.DEV
            </h1>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: showSubtitle ? "100%" : 0 }}
              transition={{ duration: 1, delay: 0.2 }}
              className="h-0.5 bg-gradient-to-r from-transparent via-green-400 to-transparent mt-2"
            />
          </motion.div>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: showDescription ? 1 : 0, y: showDescription ? 0 : 10 }}
            transition={{ duration: 0.6 }}
            className="text-green-300/80 text-lg mt-4 font-light"
          >
            {subtitle}
          </motion.p>

          {/* Branding Lines */}
          {showBranding && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1 }}
              className="mt-8 space-y-2"
            >
              {brandingLines.map((line, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -50 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    duration: 0.8,
                    delay: index * 0.3,
                    ease: "easeOut"
                  }}
                  className="text-green-400/60 text-sm tracking-widest font-mono"
                >
                  {line}
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* Loading indicator */}
          {showBranding && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="mt-12 text-green-400/40 text-xs font-mono"
            >
              INITIALIZING SYSTEMS...
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* Corner indicators */}
      <div className="absolute top-4 left-4 text-green-400/20 text-xs font-mono select-none">
        LUWI SEMANTIC BRIDGE v2.0.0
      </div>
      <div className="absolute bottom-4 right-4 text-green-400/20 text-xs font-mono select-none">
        {new Date().toISOString().split('T')[0]}
      </div>
    </div>
  );
};

export default LuwiLogoAscii;