'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const LuwiLargeLogoAscii = ({
  onComplete
}: {
  onComplete: () => void;
}) => {
  const [showText, setShowText] = useState(false);
  const [currentLine, setCurrentLine] = useState(0);

  // Larger Luwi logo with more detail
  const logoLines = [
    "                    @@@@@@@@@@@@@@@@*                                                ",
    "                                           @@@@@@@@@@@@@@@@@@@@@@@@@@@*                                            ",
    "                                        @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@                                         ",
    "                                     @@@@@@@@@@@@               *@@@@@@@@@@@@                                      ",
    "                                   @@@@@@@@@                         @@@@@@@@@@                                    ",
    "                                 @@@@@@@@                               *@@@@@@@@                                 ",
    "                               @@@@@@@@                                    @@@@@@@*                               ",
    "                              @@@@@@@                                        @@@@@@@                              ",
    "                            *@@@@@@                                           @@@@@@@                             ",
    "                            @@@@@@                                              @@@@@@                             ",
    "                           @@@@@@                   %@@@@@@@@*                   @@@@@@                            ",
    "                          @@@@@@               @@@@@@@@@@@@@@@@@@@@               @@@@@*                           ",
    "                         @@@@@@             @@@@@@@@@@@@@@@@@@@@@@@@@@            @@@@@@                           ",
    "                         @@@@@@          *@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@           @@@@@@                          ",
    "                         @@@@@          @@@@@@@@@@*            @@@@@@@@@@@         @@@@@@                          ",
    "                        *@@@@@         @@@@@@@@@                  @@@@@@@@@        *@@@@@                          ",
    "                        *@@@@@        @@@@@@@@                      @@@@@@@@       *@@@@@                          ",
    "                        *@@@@@       @@@@@@@@                         @@@@@@@@      *@@@@@                          ",
    "                        *@@@@@      @@@@@@@                           @@@@@@@       *@@@@@                          ",
    "                        @@@@@@      @@@@@@@                            @@@@@@@      @@@@@@                          ",
    "                        @@@@@@     @@@@@@@   @@@@@@            @@@@@@  @@@@@@@      @@@@@@                         ",
    "                        @@@@@@     @@@@@@@   @@@@@@@*        @@@@@@@*   @@@@@@*     @@@@@@                         ",
    "                        @@@@@@     @@@@@@@    @@@@@@@*      @@@@@@@@    @@@@@@@     @@@@@@                         ",
    "                        @@@@@@     @@@@@@@    @@@@@@@@*    @@@@@@@@    @@@@@@@     @@@@@@                         ",
    "                        @@@@@@     @@@@@@@     @@@@@@@@    @@@@@@@@     @@@@@@@     @@@@@@                         ",
    "                        @@@@@@     @@@@@@@     @@@@@@@@   @@@@@@@@     -@@@@@@@     @@@@@*                         ",
    "                        @@@@@*     @@@@@@@*     @@@@@@@*  @@@@@@@@     @@@@@@@      @@@@@*                         ",
    "                        @@@@@@     *@@@@@@@@    @@@@@@@@  @@@@@@@@    @@@@@@@@      @@@@@-                         ",
    "                        @@@@@@      @@@@@@@@@@@@@@@@@@@   @@@@@@@@@@@@@@@@@@@       @@@@@                          ",
    "                         @@@@@       @@@@@@@@@@@@@@@@@@    @@@@@@@@@@@@@@@@@*      @@@@@                          ",
    "                         @@@@@@       @@@@@@@@@@@@@@@@     @@@@@@@@@@@@@@@@        @@@@@@                         ",
    "                         *@@@@@*        @@@@@@@@@@@@@        @@@@@@@@@@@@*        @@@@@@                          ",
    "                          @@@@@@            @@@@@*              @@@@@*           @@@@@@                            ",
    "                           @@@@@@*                                              @@@@@@                            ",
    "                            @@@@@@@                                            @@@@@@*                            ",
    "                             @@@@@@@*                                        @@@@@@@                              ",
    "                              -@@@@@@@                                     @@@@@@@@                               ",
    "                                @@@@@@@@@                                @@@@@@@@                                 ",
    "                                  @@@@@@@@@@                          @@@@@@@@@*                                 ",
    "                                    *@@@@@@@@@@@@                @@@@@@@@@@@@                                      ",
    "                                       @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@*                                        ",
    "                                          *@@@@@@@@@@@@@@@@@@@@@@@@@@@@                                            ",
    "                                               *@@@@@@@@@@@@@@@@@@                                               "
  ];

  useEffect(() => {
    if (currentLine < logoLines.length) {
      const timer = setTimeout(() => {
        setCurrentLine(currentLine + 1);
      }, 20);
      return () => clearTimeout(timer);
    } else {
      setShowText(true);
      const timer = setTimeout(() => {
        onComplete();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [currentLine, onComplete]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white flex flex-col items-center justify-center overflow-hidden">
      {/* Animated background rays */}
      <div className="absolute inset-0">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute h-px bg-gradient-to-r from-transparent via-cyan-500 to-transparent"
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: [0, 0.5, 0] }}
            transition={{
              duration: 3,
              repeat: Infinity,
              delay: i * 0.5,
              ease: "easeInOut"
            }}
            style={{
              top: `${15 + i * 12}%`,
              left: 0,
              right: 0,
              transformOrigin: 'center'
            }}
          />
        ))}
      </div>

      {/* Logo Container */}
      <motion.div
        className="relative z-10"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.2 }}
      >
        <div className="relative">
          {/* Glow effect */}
          <motion.div
            className="absolute inset-0 blur-3xl bg-cyan-500/30"
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.5, 0.8, 0.5]
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            style={{
              transform: 'scale(1.2)',
            }}
          />

          {/* ASCII Logo */}
          <pre className="font-mono text-[8px] leading-tight tracking-tighter select-none relative">
            {logoLines.map((line, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -30 }}
                animate={{
                  opacity: index <= currentLine ? 1 : 0,
                  x: index <= currentLine ? 0 : -30
                }}
                transition={{
                  duration: 0.2,
                  ease: "easeOut"
                }}
                className={
                  index <= currentLine
                    ? index % 4 === 0
                      ? 'text-cyan-400'
                      : index % 4 === 1
                      ? 'text-blue-400'
                      : index % 4 === 2
                      ? 'text-purple-400'
                      : 'text-pink-400'
                    : 'text-transparent'
                }
                style={{
                  textShadow: index <= currentLine ? '0 0 10px currentColor' : 'none'
                }}
              >
                {line}
              </motion.div>
            ))}
          </pre>
        </div>

        {/* Animated text */}
        {showText && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mt-12"
          >
            <motion.h1
              className="text-6xl font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{
                letterSpacing: '0.3em',
                textShadow: '0 0 30px rgba(34, 211, 238, 0.5)'
              }}
            >
              LUWI.DEV
            </motion.h1>

            <motion.div
              className="h-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 mt-4"
              initial={{ width: 0 }}
              animate={{ width: '300px' }}
              transition={{ duration: 1.5 }}
              style={{
                boxShadow: '0 0 20px rgba(34, 211, 238, 0.5)'
              }}
            />

            <motion.div
              className="mt-6 space-y-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <p className="text-2xl text-gray-300">
                AI-Powered Knowledge Management
              </p>
              <div className="flex flex-wrap gap-4 justify-center mt-6">
                <span className="text-cyan-400">• Semantic Analysis</span>
                <span className="text-blue-400">• Intelligent Search</span>
                <span className="text-purple-400">• Knowledge Bridge</span>
              </div>
            </motion.div>

            <motion.div
              className="mt-10"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <div className="flex items-center gap-3 text-gray-400">
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
                <span className="text-lg">INITIALIZING SYSTEMS...</span>
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
              </div>
            </motion.div>
          </motion.div>
        )}
      </motion.div>

      {/* Corner info */}
      <div className="absolute top-6 left-6 text-gray-600 text-xs font-mono">
        LUWI SEMANTIC BRIDGE v2.0.0
      </div>
      <div className="absolute bottom-6 right-6 text-gray-600 text-xs font-mono">
        SYSTEM STATUS: OPERATIONAL
      </div>
    </div>
  );
};

export default LuwiLargeLogoAscii;