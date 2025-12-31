'use client';

import React, { useRef, useEffect } from 'react';

interface ParticlesBackgroundProps {
  variant?: 'dark' | 'light';
  className?: string;
  density?: 'sparse' | 'normal' | 'dense';
}

export function ParticlesBackground({
  variant = 'dark',
  className = '',
  density = 'sparse'  // Default: minimal zen particles
}: ParticlesBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match parent
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.offsetWidth;
        canvas.height = parent.offsetHeight;
      } else {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Color schemes based on variant - more subtle
    const colors = variant === 'dark'
      ? { particle: 'rgba(100, 180, 255, ', line: 'rgba(100, 180, 255, ' }
      : { particle: 'rgba(120, 150, 180, ', line: 'rgba(120, 150, 180, ' };

    // Particle class - slower, more zen-like
    class Particle {
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      opacity: number;

      constructor() {
        this.x = Math.random() * canvas!.width;
        this.y = Math.random() * canvas!.height;
        this.size = Math.random() * 1.5 + 0.5;  // Smaller particles
        // Much slower movement - zen-like
        this.speedX = (Math.random() - 0.5) * 0.15;
        this.speedY = (Math.random() - 0.5) * 0.15;
        // Lower opacity for subtlety
        this.opacity = variant === 'dark'
          ? Math.random() * 0.25 + 0.05
          : Math.random() * 0.15 + 0.03;
      }

      update() {
        this.x += this.speedX;
        this.y += this.speedY;

        if (this.x < 0 || this.x > canvas!.width) this.speedX *= -1;
        if (this.y < 0 || this.y > canvas!.height) this.speedY *= -1;
      }

      draw() {
        ctx!.beginPath();
        ctx!.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx!.fillStyle = `${colors.particle}${this.opacity})`;
        ctx!.fill();
      }
    }

    // Density-based particle count - much fewer by default
    const densityMultiplier = density === 'sparse' ? 25000 : density === 'normal' ? 18000 : 12000;
    const maxParticles = density === 'sparse' ? 35 : density === 'normal' ? 50 : 70;
    const particleCount = Math.min(maxParticles, Math.floor((canvas.width * canvas.height) / densityMultiplier));

    const particles: Particle[] = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }

    // Connection distance - shorter for cleaner look
    const connectionDistance = density === 'sparse' ? 80 : 100;

    // Animation loop
    let animationId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw connections between nearby particles - more subtle
      particles.forEach((p1, i) => {
        particles.slice(i + 1).forEach(p2 => {
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < connectionDistance) {
            const opacity = variant === 'dark'
              ? 0.08 * (1 - distance / connectionDistance)
              : 0.04 * (1 - distance / connectionDistance);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `${colors.line}${opacity})`;
            ctx.lineWidth = 0.3;  // Thinner lines
            ctx.stroke();
          }
        });
      });

      // Update and draw particles
      particles.forEach(p => {
        p.update();
        p.draw();
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [variant, density]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      style={{ opacity: variant === 'dark' ? 0.5 : 0.35 }}  // Lower overall opacity
    />
  );
}

export default ParticlesBackground;
