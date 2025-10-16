'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface CyberAsciiProps {
  title: string;
  onComplete: () => void;
  description?: string;
}

const CyberAscii: React.FC<CyberAsciiProps> = ({ title, onComplete, description }) => {
  const [frame, setFrame] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Minimal cyber frames
  const cyberFrames = [
    // Frame 1: Glitch
    [
      "  ▓▓▓▓▓▓▓▓  ",
      " ░▒ INIT ░▒ ",
      " ▓▓ SYSTEM ▓▓",
      " ░▒ NODE ░▒ ",
      "  ▓▓▓▓▓▓▓▓  "
    ],
    // Frame 2: Cyber
    [
      "  ╔═══════╗  ",
      " ║ █░█░█░█ ║ ",
      " ║░SYSTEM░░║ ",
      " ║ █░█░█░█ ║ ",
      "  ╚═══════╝  "
    ],
    // Frame 3: Matrix
    [
      "  ░░░░░░░░  ",
      " ▒01101101▒ ",
      " ░SYSTEM░░░ ",
      " ▒10110010▒ ",
      "  ░░░░░░░░  "
    ],
    // Frame 4: Retro
    [
      "  ◆◆◆◆◆◆◆  ",
      " ◇ SYSTEM ◇ ",
      " ◆ ONLINE ◆ ",
      " ◇ SYSTEM ◇ ",
      "  ◆◆◆◆◆◆◆  "
    ]
  ];

  const matrixChars = '01ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ';
  const [particles, setParticles] = useState<Array<{id: number, char: string, x: number, y: number, delay: number}>>([]);

  useEffect(() => {
    setMounted(true);

    // Generate particles
    const newParticles = [...Array(15)].map((_, i) => ({
      id: i,
      char: matrixChars[Math.floor(Math.random() * matrixChars.length)],
      x: Math.random() * 100,
      y: -10,
      delay: Math.random() * 2
    }));
    setParticles(newParticles);

    const frameInterval = setInterval(() => {
      setFrame(prev => (prev + 1) % cyberFrames.length);
    }, 600);

    const completeTimer = setTimeout(() => {
      setLoading(false);
      setTimeout(() => onComplete(), 800);
    }, 3500);

    return () => {
      clearInterval(frameInterval);
      clearTimeout(completeTimer);
    };
  }, []);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-black flex items-center justify-center overflow-hidden relative">
      {/* Animated particles background */}
      <div className="absolute inset-0">
        {particles.map((particle) => (
          <motion.div
            key={particle.id}
            className="absolute text-green-500 opacity-20"
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              fontFamily: 'monospace'
            }}
            animate={{
              y: ["0vh", "110vh"],
              opacity: [0, 0.4, 0.4, 0],
            }}
            transition={{
              duration: 8 + Math.random() * 4,
              delay: particle.delay,
              repeat: Infinity,
              ease: "linear"
            }}
          >
            {particle.char}
          </motion.div>
        ))}
      </div>

      {/* Scan line effect */}
      <motion.div
        className="absolute inset-x-0 h-px bg-green-500 opacity-50"
        animate={{ y: ["0%", "100%"] }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
      />

      {/* Main content */}
      <div className="relative z-10 text-center">
        {/* Cyber frame */}
        <motion.pre
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-green-500 text-sm leading-tight mb-6 font-mono"
          style={{
            filter: 'drop-shadow(0 0 10px rgba(74, 222, 128, 0.5))'
          }}
        >
          {cyberFrames[frame].map((line, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              {line}
            </motion.div>
          ))}
        </motion.pre>

        {/* Glitch title */}
        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-4xl font-mono font-bold text-green-500 mb-4"
          style={{
            textShadow: '0 0 20px rgba(74, 222, 128, 0.8)',
            animation: 'glitch 2s infinite'
          }}
        >
          {title}
        </motion.h1>

        {/* Loading bar */}
        <div className="w-64 h-1 bg-gray-800 rounded-full overflow-hidden mx-auto">
          <motion.div
            className="h-full bg-gradient-to-r from-green-500 to-cyan-500"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 3, ease: "easeInOut" }}
          />
        </div>

        {/* Status text */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-6"
        >
          <div className="text-green-400 text-lg font-bold mb-2 tracking-wider"
               style={{
                 textShadow: '0 0 15px rgba(74, 222, 128, 1), 0 0 30px rgba(74, 222, 128, 0.8)',
                 animation: 'pulse 1.5s infinite'
               }}>
            {title || "SYSTEM"}
          </div>
          <motion.p
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-green-300 text-sm font-mono mb-1"
            style={{
              textShadow: '0 0 10px rgba(74, 222, 128, 0.8)'
            }}
          >
            &gt; Context Engine
          </motion.p>
          <motion.p
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
            className="text-green-300 text-xs font-mono"
            style={{
              textShadow: '0 0 10px rgba(74, 222, 128, 0.8)'
            }}
          >
            &gt; AI Powered Knowledge Management System
          </motion.p>
          <motion.div
            className="flex items-center justify-center mt-3 space-x-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <span className="text-green-500 text-xs font-mono">{title ? title.toUpperCase() : "INITIALIZING"}</span>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-3 h-3 border border-green-500 border-t-transparent rounded-full"
              style={{ boxShadow: '0 0 8px rgba(74, 222, 128, 0.8)' }}
            />
            <span className="text-green-500 text-xs font-mono">NEURAL INTERFACE</span>
          </motion.div>
        </motion.div>
      </div>

      {/* Corner decorations */}
      {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((corner) => (
        <div
          key={corner}
          className={`absolute ${corner.includes('top') ? 'top-4' : 'bottom-4'} ${
            corner.includes('left') ? 'left-4' : 'right-4'
          } w-8 h-8 border-green-500`}
          style={{
            borderTopWidth: corner.includes('top') ? '2px' : '0',
            borderBottomWidth: corner.includes('bottom') ? '2px' : '0',
            borderLeftWidth: corner.includes('left') ? '2px' : '0',
            borderRightWidth: corner.includes('right') ? '2px' : '0',
            opacity: 0.5
          }}
        />
      ))}

      <style jsx>{`
        @keyframes glitch {
          0%, 100% {
            text-shadow: 0 0 20px rgba(74, 222, 128, 0.8);
            transform: translate(0);
          }
          20% {
            text-shadow: -2px 0 red, 2px 0 cyan;
            transform: translate(-1px, 1px);
          }
          40% {
            text-shadow: 2px 0 red, -2px 0 cyan;
            transform: translate(1px, -1px);
          }
        }
      `}</style>
    </div>
  );
};

export default CyberAscii;