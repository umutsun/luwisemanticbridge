'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const AnimatedLuwiLogo = ({
  onComplete
}: {
  onComplete: () => void;
}) => {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [showText, setShowText] = useState(false);
  const [glowIntensity, setGlowIntensity] = useState(0);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number }>>([]);

  // Animated logo frames with different colors
  const logoFrames = [
    // Frame 1 - Blue gradient
    {
      lines: [
        "                    **@@@@@@@@**                           ",
        "                  *@@@@@@@@@@@@@@@@@*                     ",
        "                *@@@@            @@@@@*                 ",
        "               @@@@                      @@@*              ",
        "              %@@@           **           @@@@            ",
        "             *@@@      *@@@@@@@@@@@@       @@@           ",
        "             @@@@     *@@@@@@****@@@@@@*     @@@          ",
        "            -@@@    @@@@@          @@@@*    @@@           ",
        "            *@@@   @@@@*            *@@@*   @@@           ",
        "            *@@@  *@@@* **        ** @@@@   @@@           ",
        "            *@@@  *@@@  @@@@    @@@@  @@@*  @@@           ",
        "            *@@@  *@@@  *@@@@  @@@@*  @@@*  @@@           ",
        "            *@@@  *@@@   @@@@**@@@@   @@@*  @@@*          ",
        "            *@@@  *@@@@  @@@@**@@@@  @@@@   @@@          ",
        "             @@@   @@@@@@@@@@ *@@@@@@@@@*   @@@         ",
        "             @@@@   *@@@@@@@   *@@@@@@@*   @@@@         ",
        "              @@@*      *         --      *@@@          ",
        "               @@@@                      @@@@           ",
        "                @@@@*                  @@@@*           ",
        "                  @@@@@*            *@@@@*             ",
        "                    *@@@@@@@@@@@@@@@@@@*             ",
        "                        **@@@@@@@@**                 "
      ],
      colors: {
        primary: 'text-blue-400',
        secondary: 'text-cyan-400',
        accent: 'text-blue-600',
        glow: 'shadow-blue-500/50'
      }
    },
    // Frame 2 - Purple/Pink gradient
    {
      lines: [
        "                    **@@@@@@@@**                           ",
        "                  *@@@@@@@@@@@@@@@@@*                     ",
        "                *@@@@            @@@@@*                 ",
        "               @@@@                      @@@*              ",
        "              %@@@           **           @@@@            ",
        "             *@@@      *@@@@@@@@@@@@       @@@           ",
        "             @@@@     *@@@@@@****@@@@@@*     @@@          ",
        "            -@@@    @@@@@          @@@@*    @@@           ",
        "            *@@@   @@@@*            *@@@*   @@@           ",
        "            *@@@  *@@@* **        ** @@@@   @@@           ",
        "            *@@@  *@@@  @@@@    @@@@  @@@*  @@@           ",
        "            *@@@  *@@@  *@@@@  @@@@*  @@@*  @@@           ",
        "            *@@@  *@@@   @@@@**@@@@   @@@*  @@@*          ",
        "            *@@@  *@@@@  @@@@**@@@@  @@@@   @@@          ",
        "             @@@   @@@@@@@@@@ *@@@@@@@@@*   @@@         ",
        "             @@@@   *@@@@@@@   *@@@@@@@*   @@@@         ",
        "              @@@*      *         --      *@@@          ",
        "               @@@@                      @@@@           ",
        "                @@@@*                  @@@@*           ",
        "                  @@@@@*            *@@@@*             ",
        "                    *@@@@@@@@@@@@@@@@@@*             ",
        "                        **@@@@@@@@**                 "
      ],
      colors: {
        primary: 'text-purple-400',
        secondary: 'text-pink-400',
        accent: 'text-violet-600',
        glow: 'shadow-purple-500/50'
      }
    },
    // Frame 3 - Green/Blue gradient
    {
      lines: [
        "                    **@@@@@@@@**                           ",
        "                  *@@@@@@@@@@@@@@@@@*                     ",
        "                *@@@@            @@@@@*                 ",
        "               @@@@                      @@@*              ",
        "              %@@@           **           @@@@            ",
        "             *@@@      *@@@@@@@@@@@@       @@@           ",
        "             @@@@     *@@@@@@****@@@@@@*     @@@          ",
        "            -@@@    @@@@@          @@@@*    @@@           ",
        "            *@@@   @@@@*            *@@@*   @@@           ",
        "            *@@@  *@@@* **        ** @@@@   @@@           ",
        "            *@@@  *@@@  @@@@    @@@@  @@@*  @@@           ",
        "            *@@@  *@@@  *@@@@  @@@@*  @@@*  @@@           ",
        "            *@@@  *@@@   @@@@**@@@@   @@@*  @@@*          ",
        "            *@@@  *@@@@  @@@@**@@@@  @@@@   @@@          ",
        "             @@@   @@@@@@@@@@ *@@@@@@@@@*   @@@         ",
        "             @@@@   *@@@@@@@   *@@@@@@@*   @@@@         ",
        "              @@@*      *         --      *@@@          ",
        "               @@@@                      @@@@           ",
        "                @@@@*                  @@@@*           ",
        "                  @@@@@*            *@@@@*             ",
        "                    *@@@@@@@@@@@@@@@@@@*             ",
        "                        **@@@@@@@@**                 "
      ],
      colors: {
        primary: 'text-green-400',
        secondary: 'text-cyan-400',
        accent: 'text-teal-600',
        glow: 'shadow-green-500/50'
      }
    }
  ];

  const [activeFrame, setActiveFrame] = useState(0);

  // Generate particles
  useEffect(() => {
    const newParticles = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100
    }));
    setParticles(newParticles);
  }, []);

  // Animate through frames
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveFrame((prev) => (prev + 1) % logoFrames.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Animate line by line
  useEffect(() => {
    if (currentFrame < logoFrames[activeFrame].lines.length) {
      const timer = setTimeout(() => {
        setCurrentFrame(currentFrame + 1);
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setShowText(true);
      setGlowIntensity(1);
      const timer = setTimeout(() => {
        onComplete();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [currentFrame, activeFrame, onComplete]);

  // Animate glow
  useEffect(() => {
    const interval = setInterval(() => {
      setGlowIntensity((prev) => (prev === 1 ? 0.5 : 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const frame = logoFrames[activeFrame];

  return (
    <div className="min-h-screen bg-black overflow-hidden relative">
      {/* Animated gradient background */}
      <motion.div
        className="absolute inset-0 opacity-30"
        animate={{
          background: [
            'linear-gradient(to bottom, #000428, #004e92)',
            'linear-gradient(to bottom, #200122, #6f0000)',
            'linear-gradient(to bottom, #0f2027, #203a43, #2c5364)',
            'linear-gradient(to bottom, #000428, #004e92)'
          ]
        }}
        transition={{ duration: 6, repeat: Infinity }}
      />

      {/* Floating particles */}
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute w-1 h-1 bg-white rounded-full"
          initial={{
            x: `${particle.x}%`,
            y: `${particle.y}%`,
            opacity: 0
          }}
          animate={{
            x: `${particle.x + (Math.random() - 0.5) * 20}%`,
            y: `${particle.y - 100}%`,
            opacity: [0, 1, 0]
          }}
          transition={{
            duration: 3 + Math.random() * 2,
            repeat: Infinity,
            delay: Math.random() * 2,
            ease: "easeInOut"
          }}
          style={{
            boxShadow: '0 0 10px rgba(255, 255, 255, 0.5)'
          }}
        />
      ))}

      {/* Logo container */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen">
        <motion.div
          className="relative"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1 }}
        >
          {/* Glow effect */}
          <motion.div
            className={`absolute inset-0 blur-3xl ${frame.colors.glow} transition-all duration-1000`}
            animate={{ opacity: glowIntensity }}
            style={{
              transform: 'scale(1.5)',
              filter: 'blur(40px)'
            }}
          />

          {/* ASCII Logo with colors */}
          <pre className="font-mono text-xs leading-tight relative">
            {frame.lines.map((line, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -50 }}
                animate={{
                  opacity: index <= currentFrame ? 1 : 0,
                  x: index <= currentFrame ? 0 : -50,
                  color: index <= currentFrame ? undefined : 'transparent'
                }}
                transition={{
                  duration: 0.3,
                  ease: "easeOut"
                }}
                className={
                  index <= currentFrame
                    ? index % 3 === 0 ? frame.colors.primary
                    : index % 3 === 1 ? frame.colors.secondary
                    : frame.colors.accent
                    : 'text-transparent'
                }
                style={{
                  textShadow: index <= currentFrame ? '0 0 20px currentColor' : 'none',
                  filter: index <= currentFrame ? 'brightness(1.2)' : 'none'
                }}
              >
                {line}
              </motion.div>
            ))}
          </pre>

          {/* Animated text */}
          <AnimatePresence>
            {showText && (
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -30 }}
                className="text-center mt-12 space-y-4"
              >
                <motion.h1
                  className={`text-5xl font-bold ${frame.colors.primary} transition-colors duration-1000`}
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  style={{
                    textShadow: '0 0 30px currentColor',
                    letterSpacing: '0.2em'
                  }}
                >
                  LUWI.DEV
                </motion.h1>

                <motion.div
                  className={`h-1 ${frame.colors.accent} transition-colors duration-1000`}
                  initial={{ width: 0 }}
                  animate={{ width: '200px' }}
                  transition={{ duration: 1 }}
                  style={{
                    boxShadow: '0 0 20px currentColor'
                  }}
                />

                <motion.p
                  className={`text-xl ${frame.colors.secondary} transition-colors duration-1000`}
                  animate={{ opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  style={{
                    textShadow: '0 0 10px currentColor'
                  }}
                >
                  AI-Powered Knowledge Management
                </motion.p>

                <motion.div
                  className="flex gap-8 justify-center mt-8"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  {['SEMANTIC ANALYSIS', 'INTELLIGENT SEARCH', 'KNOWLEDGE BRIDGE'].map((text, i) => (
                    <motion.span
                      key={text}
                      className={`text-sm ${frame.colors.primary} transition-colors duration-1000`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.7 + i * 0.1 }}
                      style={{
                        textShadow: '0 0 10px currentColor'
                      }}
                    >
                      {text}
                    </motion.span>
                  ))}
                </motion.div>

                <motion.div
                  className="mt-8 text-center"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <div className={`text-sm ${frame.colors.secondary} transition-colors duration-1000`}
                    style={{
                      textShadow: '0 0 10px currentColor'
                    }}
                  >
                    <div className="flex items-center gap-2 justify-center">
                      <motion.div
                        className="w-2 h-2 bg-current rounded-full"
                        animate={{ scale: [1, 1.5, 1] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      />
                      <span>SYSTEMS INITIALIZING...</span>
                      <motion.div
                        className="w-2 h-2 bg-current rounded-full"
                        animate={{ scale: [1, 1.5, 1] }}
                        transition={{ duration: 1, repeat: Infinity, delay: 0.5 }}
                      />
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Corner info */}
      <div className="absolute top-4 left-4 text-gray-500 text-xs font-mono">
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          LUWI SEMANTIC BRIDGE v2.0.0
        </motion.div>
      </div>
    </div>
  );
};

export default AnimatedLuwiLogo;