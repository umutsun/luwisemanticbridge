'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface MinimalCubeLoaderProps {
  size?: 'sm' | 'md' | 'lg';
  speed?: 'slow' | 'normal' | 'fast';
  colors?: string[];
  text?: string;
}

const MinimalCubeLoader: React.FC<MinimalCubeLoaderProps> = ({
  size = 'md',
  speed = 'normal',
  colors = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b'],
  text
}) => {
  const [frame, setFrame] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [colorFrame, setColorFrame] = useState(0);

  const sizeMap = {
    sm: { container: 'w-20 h-20', text: 'text-xs' },
    md: { container: 'w-32 h-32', text: 'text-sm' },
    lg: { container: 'w-40 h-40', text: 'text-base' }
  };

  const speedMap = {
    slow: { rotation: 300, color: 200 },
    normal: { rotation: 150, color: 100 },
    fast: { rotation: 80, color: 50 }
  };

  // 3D Cube frames - showing different faces
  const cubeFrames = [
    // Front face
    {
      top: [
        "  ┌──────┐  ",
        " /      /  ",
        "/──────/   "
      ],
      middle: [
        "│      │   ",
        "│      │   ",
        "│      │   "
      ],
      bottom: [
        "│      │   ",
        "│      │   ",
        "└──────┘   "
      ],
      currentColor: 0
    },
    // Slight rotation right
    {
      top: [
        "    ┌───┐   ",
        "   /     │  ",
        "  /      │  "
      ],
      middle: [
        " ┌──────┐  ",
        " │      │  ",
        " │      │  "
      ],
      bottom: [
        " │      │  ",
        " └──────│  ",
        "       └───┘"
      ],
      currentColor: 1
    },
    // Right face
    {
      top: [
        "       ┌───┐",
        "      /    │",
        "     /     │"
      ],
      middle: [
        "    ┌─────┐",
        "    │     │",
        "    │     │"
      ],
      bottom: [
        "    │     │",
        "    └─────│",
        "          └"
      ],
      currentColor: 2
    },
    // Slight rotation back
    {
      top: [
        "       ┌───┐ ",
        "      /│    │",
        "     / │    │"
      ],
      middle: [
        "    ┌───┘   ",
        "    │        ",
        "    │        "
      ],
      bottom: [
        "    │        ",
        "    └───┐    ",
        "        └────"
      ],
      currentColor: 3
    },
    // Back face
    {
      top: [
        "       ┌────┐",
        "      /      │",
        "     /       │"
      ],
      middle: [
        "    ┌────────┘",
        "    │        ",
        "    │        "
      ],
      bottom: [
        "    │        ",
        "    └────────┘",
        "              "
      ],
      currentColor: 0
    },
    // Slight rotation left
    {
      top: [
        "  ┌───┐      ",
        "  │    │     ",
        "  │    /     "
      ],
      middle: [
        " ┌──────┘    ",
        " │           ",
        " │           "
      ],
      bottom: [
        " │           ",
        " └──────┐    ",
        "        └────"
      ],
      currentColor: 1
    },
    // Left face
    {
      top: [
        "┌───┐        ",
        "│    │       ",
        "│    /       "
      ],
      middle: [
        "└─────┐      ",
        "      │      ",
        "      │      "
      ],
      bottom: [
        "      │      ",
        "      └─────┐",
        "            └"
      ],
      currentColor: 2
    },
    // Final rotation to front
    {
      top: [
        "  ┌──────┐   ",
        " /      /    ",
        "/──────/     "
      ],
      middle: [
        "│      │     ",
        "│      │     ",
        "│      │     "
      ],
      bottom: [
        "│      │     ",
        "└──────┘     ",
        "              "
      ],
      currentColor: 3
    }
  ];

  // Animated wave pattern for cube surface
  const wavePatterns = [
    ["░░░░░░", "▒▒▒▒▒▒", "▓▓▓▓▓▓", "██████"],
    ["░░▒▒▓▓", "▒▒▓▓██", "▓▓████", "████░░"],
    ["░▒▓█░▒", "▒▓█▒▓█", "▓█▒▓█▒", "█▒▓█▒▓"],
    ["░░░░░░", "▒▒▒▒▒▒", "▓▓▓▓▓▓", "██████"]
  ];

  const [currentPattern, setCurrentPattern] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const rotationInterval = setInterval(() => {
      setFrame(prev => (prev + 1) % cubeFrames.length);
    }, speedMap[speed].rotation);

    const colorInterval = setInterval(() => {
      setColorFrame(prev => (prev + 1) % colors.length);
      setCurrentPattern(prev => (prev + 1) % wavePatterns.length);
    }, speedMap[speed].color);

    return () => {
      clearInterval(rotationInterval);
      clearInterval(colorInterval);
    };
  }, [cubeFrames.length, colors.length, speed, mounted]);

  if (!mounted) return null;

  const currentCube = cubeFrames[frame];
  const currentWave = wavePatterns[currentPattern];
  const currentColor = colors[colorFrame];

  // Fill cube faces with animated pattern
  const fillFaceWithPattern = (face: string[], pattern: string[]) => {
    return face.map((line, i) => {
      let filledLine = line;
      // Replace spaces in the middle of the cube with pattern
      if (line.includes('   ') || line.includes('    ') || line.includes('     ')) {
        filledLine = line.replace(/( {3,})/g, (match) => {
          const patternIndex = (frame + i) % pattern.length;
          return pattern[patternIndex].substring(0, match.length);
        });
      }
      return filledLine;
    });
  };

  return (
    <div className={`flex flex-col items-center justify-center ${sizeMap[size].text} font-mono`}>
      <motion.div
        initial={{ opacity: 0, rotateY: -180 }}
        animate={{ opacity: 1, rotateY: 0 }}
        transition={{ duration: 0.5 }}
        className={`${sizeMap[size].container} flex flex-col justify-center`}
        style={{ perspective: '1000px' }}
      >
        {/* Top face */}
        <div className="flex justify-center mb-0">
          <pre
            className="leading-none text-xs"
            style={{
              color: currentColor,
              filter: `drop-shadow(0 0 4px ${currentColor})`,
              transform: 'rotateX(30deg)'
            }}
          >
            {fillFaceWithPattern(currentCube.top, currentWave).map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </pre>
        </div>

        {/* Middle faces */}
        <div className="flex items-center justify-center">
          <pre
            className="leading-none text-xs mr-2"
            style={{
              color: currentColor,
              filter: `drop-shadow(0 0 4px ${currentColor})`,
              opacity: 0.9
            }}
          >
            {fillFaceWithPattern(currentCube.middle, currentWave).map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </pre>

          {/* Side face (right) */}
          <pre
            className="leading-none text-xs"
            style={{
              color: colors[(colorFrame + 1) % colors.length],
              filter: `drop-shadow(0 0 4px ${colors[(colorFrame + 1) % colors.length]})`,
              opacity: 0.8,
              transform: 'scale(0.8) translateX(4px)'
            }}
          >
            {fillFaceWithPattern(
              ["  ░░░░", "  ▒▒▒▒", "  ▓▓▓▓", "  ████"],
              currentWave
            ).map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </pre>
        </div>

        {/* Bottom face */}
        <div className="flex justify-center mt-0">
          <pre
            className="leading-none text-xs"
            style={{
              color: colors[(colorFrame + 2) % colors.length],
              filter: `drop-shadow(0 0 4px ${colors[(colorFrame + 2) % colors.length]})`,
              opacity: 0.7,
              transform: 'rotateX(-30deg)'
            }}
          >
            {currentCube.bottom.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </pre>
        </div>
      </motion.div>

      {text && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.8 }}
          transition={{ delay: 0.3 }}
          className="mt-4 uppercase tracking-widest"
          style={{
            color: currentColor,
            textShadow: `0 0 8px ${currentColor}`
          }}
        >
          {text}
        </motion.p>
      )}

      {/* Subtle rotation indicator */}
      <div className="flex space-x-1 mt-2">
        {cubeFrames.map((_, index) => (
          <div
            key={index}
            className="w-1 h-1 rounded-full transition-all duration-200"
            style={{
              backgroundColor: index === frame ? currentColor : '#374151',
              boxShadow: index === frame ? `0 0 4px ${currentColor}` : 'none'
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default MinimalCubeLoader;