'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface RotatingCube3DProps {
  title: string;
  onComplete?: () => void;
  subtitle?: string;
  description?: string;
  footer?: string;
}

const RotatingCube3D: React.FC<RotatingCube3DProps> = ({
  title,
  onComplete,
  subtitle = "AI-Powered Knowledge Management System"
}) => {
  const [frame, setFrame] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [textOpacity, setTextOpacity] = useState(1);

  // 3D Cube frames - realistic rotation
  const cubeFrames3D = [
    // Frame 0: Front face
    {
      top: ["        ╔════════════╗        "],
      middle: [
        "       ╔╩╗        ╔╩╗       ",
        "       ║│║        ║│║       ",
        "       ║│║        ║│║       ",
        "       ║│║        ║│║       "
      ],
      bottom: ["        ╚════════════╝        "],
      face: 'front',
      color: '#10b981'
    },
    // Frame 1: Slight rotation right
    {
      top: ["         ╔═════════╗         "],
      middle: [
        "       ╔╩╗      ╔╩╗         ",
        "      ╔╩╩╗      ║│║         ",
        "      ║│║║      ║│║         ",
        "      ║│║║      ║│║         "
      ],
      bottom: ["       ╚═════════╝         "],
      face: 'front-right',
      color: '#10b981'
    },
    // Frame 2: More rotation
    {
      top: ["          ╔═══════╗          "],
      middle: [
        "       ╔╩╗     ╔╩╩╗          ",
        "      ╔╩╩╗     ║│║║          ",
        "     ╔╩╩╩╗     ║│║║          ",
        "     ║││║║     ║│║║          "
      ],
      bottom: ["       ╚═══════╝          "],
      face: 'right',
      color: '#06b6d4'
    },
    // Frame 3: Front-Right-Top
    {
      top: ["      ╔═══════════╗        "],
      middle: [
        "      ║░░░░░░░░░░░░║        ",
        "     ╔╩╗░░░░░░░░░╔╩╗        ",
        "     ║│║░░░░░░░░░║│║        ",
        "    ╔╩╩╩╗░░░░░░░╔╩╩╩╗       "
      ],
      bottom: ["    ╚═══════════╝        "],
      face: 'front-right-top',
      color: '#10b981'
    },
    // Frame 4: Top view
    {
      top: ["    ╔══════════════╗      "],
      middle: [
        "    ║░░░░░░░░░░░░░░║      ",
        "   ╔╩╗░░░░░░░░░░░░╔╩╗      ",
        "   ║│║░░░░░░░░░░░║│║      ",
        "  ╔╩╩╩╗░░░░░░░░░░╔╩╩╩╗     "
      ],
      bottom: ["  ╚══════════════╝      "],
      face: 'top',
      color: '#8b5cf6'
    },
    // Frame 5: Top-Back
    {
      top: ["   ╔════════════════╗    "],
      middle: [
        "   ║▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓║    ",
        "  ╔╩╗▓▓▓▓▓▓▓▓▓▓▓▓╔╩╗    ",
        "  ║│║▓▓▓▓▓▓▓▓▓▓▓║│║    ",
        " ╔╩╩╩╗▓▓▓▓▓▓▓▓▓╔╩╩╩╗   "
      ],
      bottom: [" ╚════════════════╝    "],
      face: 'top-back',
      color: '#8b5cf6'
    },
    // Frame 6: Back face
    {
      top: ["  ╔═════════════════╗   "],
      middle: [
        "  ║▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒║   ",
        " ╔╩╗▒▒▒▒▒▒▒▒▒▒▒▒▒╔╩╗   ",
        " ║│║▒▒▒▒▒▒▒▒▒▒▒▒║│║   ",
        "╔╩╩╩╗▒▒▒▒▒▒▒▒▒▒╔╩╩╩╗  "
      ],
      bottom: ["╚═════════════════╝   "],
      face: 'back',
      color: '#f59e0b'
    },
    // Frame 7: Left-Back
    {
      top: ["  ╔═══════════════╗    "],
      middle: [
        " ╔╩╗▒▒▒▒▒▒▒▒▒▒▒▒║    ",
        " ║│║▒▒▒▒▒▒▒▒▒▒▒▒║    ",
        "╔╩╩╩╗▒▒▒▒▒▒▒▒▒╔╩╗    ",
        "║││║║▒▒▒▒▒▒▒▒╔╩╩╗   "
      ],
      bottom: ["╚═══════════════╝    "],
      face: 'left-back',
      color: '#f59e0b'
    },
    // Frame 8: Left face
    {
      top: ["   ╔════════════╗      "],
      middle: [
        "  ╔╩╗▓▓▓▓▓▓▓▓▓▓▓║      ",
        "  ║│║▓▓▓▓▓▓▓▓▓▓▓║      ",
        " ╔╩╩╩╗▓▓▓▓▓▓▓▓╔╩╗      ",
        " ║││║║▓▓▓▓▓▓╔╩╩╩╗     "
      ],
      bottom: ["  ╚════════════╝      "],
      face: 'left',
      color: '#ef4444'
    },
    // Frame 9: Front-Left
    {
      top: ["    ╔══════════╗       "],
      middle: [
        "   ╔╩╗░░░░░░░░░░║       ",
        "   ║│║░░░░░░░░░░║       ",
        "  ╔╩╩╩╗░░░░░░░░╔╩╗       ",
        "  ║││║║░░░░░░░╔╩╩╗      "
      ],
      bottom: ["    ╚══════════╝       "],
      face: 'front-left',
      color: '#10b981'
    },
    // Frame 10: Almost Front
    {
      top: ["      ╔════════╗        "],
      middle: [
        "      ║░░░░░░░░░║        ",
        "     ╔╩╗░░░░░░░╔╩╗        ",
        "     ║│║░░░░░░░║│║        ",
        "    ╔╩╩╩╗░░░░░╔╩╩╩╗       "
      ],
      bottom: ["      ╚════════╝        "],
      face: 'front',
      color: '#10b981'
    },
    // Frame 11: Front (solid)
    {
      top: ["       ╔══════╗         "],
      middle: [
        "       ║██████║         ",
        "       ║██████║         ",
        "       ║██████║         ",
        "       ║██████║         "
      ],
      bottom: ["       ╚══════╝         "],
      face: 'front',
      color: '#10b981'
    }
  ];

  // Particle effects
  const [particles, setParticles] = useState<Array<{id: number, x: number, y: number, char: string}>>([]);

  useEffect(() => {
    setMounted(true);

    // Generate particles
    const newParticles = [...Array(20)].map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      char: '·' + String.fromCharCode(0x25CF + Math.floor(Math.random() * 10))
    }));
    setParticles(newParticles);

    const frameInterval = setInterval(() => {
      setFrame(prev => (prev + 1) % cubeFrames3D.length);
    }, 100);

    const textInterval = setInterval(() => {
      setTextOpacity(prev => prev === 1 ? 0.7 : 1);
    }, 500);

    const completeTimer = setTimeout(() => {
      clearInterval(frameInterval);
      clearInterval(textInterval);
      onComplete();
    }, 3500);

    return () => {
      clearInterval(frameInterval);
      clearInterval(textInterval);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  if (!mounted) return null;

  const currentCube = cubeFrames3D[frame];

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
              fontFamily: 'monospace',
              fontSize: '8px'
            }}
            animate={{
              y: [0, -20, 0],
              x: [0, 10, 0],
              opacity: [0.1, 0.3, 0.1]
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            {particle.char}
          </motion.div>
        ))}
      </div>

      {/* Main 3D Cube */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="relative"
        style={{ perspective: '1000px' }}
      >
        {/* 3D Cube Container */}
        <div
          className="relative transform-gpu"
          style={{
            transformStyle: 'preserve-3d',
            transform: `rotateY(${frame * 30}deg) rotateX(${Math.sin(frame * 0.1) * 10}deg)`
          }}
        >
          {/* Top face */}
          <pre
            className="absolute text-xs leading-none font-mono"
            style={{
              color: currentCube.color,
              filter: `drop-shadow(0 0 10px ${currentCube.color})`,
              transform: 'rotateX(90deg) translateZ(60px)',
              left: '-120px',
              top: '-80px'
            }}
          >
            {currentCube.top.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </pre>

          {/* Front face */}
          <pre
            className="relative text-xs leading-none font-mono mb-4"
            style={{
              color: currentCube.color,
              filter: `drop-shadow(0 0 15px ${currentCube.color}) drop-shadow(0 0 30px ${currentCube.color})`,
              transform: 'translateZ(60px)'
            }}
          >
            {currentCube.top.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
            {currentCube.middle.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
            {currentCube.bottom.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </pre>

          {/* Side faces (simulated with transparency) */}
          <div
            className="absolute inset-0 opacity-60"
            style={{
              transform: 'rotateY(90deg) translateZ(60px)'
            }}
          >
            <pre
              className="text-xs leading-none font-mono"
              style={{
                color: colors[(frame + 1) % colors.length],
                filter: `drop-shadow(0 0 10px ${colors[(frame + 1) % colors.length]})`
              }}
            >
              {currentCube.middle.map((line, i) => (
                <div key={i}>{line.replace(/[│║]/g, ' ')}</div>
              ))}
            </pre>
          </div>
        </div>

        {/* Title below cube */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: textOpacity, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mt-8"
        >
          <h1
            className="text-3xl font-bold text-green-400 mb-2 tracking-wider"
            style={{
              textShadow: '0 0 20px rgba(74, 222, 128, 1), 0 0 40px rgba(74, 222, 128, 0.8)',
              animation: 'glow 2s infinite'
            }}
          >
            {title}
          </h1>
          <p
            className="text-green-300 text-sm"
            style={{
              textShadow: '0 0 10px rgba(74, 222, 128, 0.6)'
            }}
          >
            {subtitle}
          </p>
        </motion.div>

        {/* Loading indicator */}
        <motion.div
          className="flex justify-center mt-6 space-x-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 bg-green-500 rounded-full"
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.5, 1, 0.5]
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.2
              }}
              style={{ boxShadow: '0 0 10px rgba(74, 222, 128, 0.8)' }}
            />
          ))}
        </motion.div>
      </motion.div>

      {/* Corner indicators */}
      {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((corner, index) => (
        <motion.div
          key={corner}
          className={`absolute ${corner.includes('top') ? 'top-8' : 'bottom-8'} ${
            corner.includes('left') ? 'left-8' : 'right-8'
          }`}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 0.5, scale: 1 }}
          transition={{ delay: 0.5 + index * 0.1 }}
        >
          <div className="w-12 h-12 border border-green-500"
               style={{
                 borderTopWidth: corner.includes('top') ? '2px' : '0',
                 borderBottomWidth: corner.includes('bottom') ? '2px' : '0',
                 borderLeftWidth: corner.includes('left') ? '2px' : '0',
                 borderRightWidth: corner.includes('right') ? '2px' : '0',
                 filter: 'drop-shadow(0 0 5px rgba(74, 222, 128, 0.5))'
               }}
          />
        </motion.div>
      ))}

      <style jsx>{`
        @keyframes glow {
          0%, 100% {
            filter: drop-shadow(0 0 20px rgba(74, 222, 128, 1))
                    drop-shadow(0 0 40px rgba(74, 222, 128, 0.8));
          }
          50% {
            filter: drop-shadow(0 0 30px rgba(74, 222, 128, 1))
                    drop-shadow(0 0 60px rgba(74, 222, 128, 0.9));
          }
        }
      `}</style>
    </div>
  );
};

const colors = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'];

export default RotatingCube3D;