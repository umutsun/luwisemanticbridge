'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface DataPoint {
  id: string;
  label: string;
  value: number;
  category: string;
  metadata?: Record<string, any>;
}

interface VectorSpaceGraphProps {
  data: DataPoint[];
  width?: number;
  height?: number;
  showStats?: boolean;
}

export function VectorSpaceGraph({
  data,
  width = 800,
  height = 500,
  showStats = true
}: VectorSpaceGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredPoint, setHoveredPoint] = useState<DataPoint | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width, height });

  // Calculate statistics
  const stats = {
    total: data.length,
    categories: [...new Set(data.map(d => d.category))].length,
    avgValue: data.length > 0 ? data.reduce((sum, d) => sum + d.value, 0) / data.length : 0,
  };

  // Convert data points to 2D positions in vector space
  const positions = data.map((point, index) => {
    const angle = (index / data.length) * Math.PI * 2;
    const radius = 0.3 + (point.value / Math.max(...data.map(d => d.value))) * 0.4;

    return {
      ...point,
      x: 0.5 + Math.cos(angle) * radius,
      y: 0.5 + Math.sin(angle) * radius,
      pulse: Math.random() * Math.PI * 2,
    };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = dimensions.width * window.devicePixelRatio;
    canvas.height = dimensions.height * window.devicePixelRatio;
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    let animationFrame: number;
    let time = 0;

    const animate = () => {
      ctx.clearRect(0, 0, dimensions.width, dimensions.height);

      // Draw connections (neural network style)
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
      ctx.lineWidth = 1;

      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const p1 = positions[i];
          const p2 = positions[j];
          const dist = Math.hypot(
            (p1.x - p2.x) * dimensions.width,
            (p1.y - p2.y) * dimensions.height
          );

          // Only draw connections for nearby points
          if (dist < 150) {
            ctx.beginPath();
            ctx.moveTo(p1.x * dimensions.width, p1.y * dimensions.height);
            ctx.lineTo(p2.x * dimensions.width, p2.y * dimensions.height);
            ctx.stroke();
          }
        }
      }

      // Draw points with pulse animation
      positions.forEach((point) => {
        const x = point.x * dimensions.width;
        const y = point.y * dimensions.height;
        const pulsePhase = Math.sin(time * 0.05 + point.pulse);
        const baseRadius = 6;
        const pulseRadius = baseRadius + pulsePhase * 2;

        // Outer glow (pulse)
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, pulseRadius * 2);
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.3)');
        gradient.addColorStop(0.5, 'rgba(99, 102, 241, 0.1)');
        gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, pulseRadius * 2, 0, Math.PI * 2);
        ctx.fill();

        // Inner circle
        ctx.fillStyle = hoveredPoint?.id === point.id
          ? 'rgba(99, 102, 241, 1)'
          : 'rgba(99, 102, 241, 0.8)';
        ctx.beginPath();
        ctx.arc(x, y, baseRadius, 0, Math.PI * 2);
        ctx.fill();

        // White center
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(x, y, baseRadius * 0.4, 0, Math.PI * 2);
        ctx.fill();
      });

      time++;
      animationFrame = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [data, dimensions, hoveredPoint]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: rect.width,
          height: Math.min(500, rect.width * 0.625), // 16:10 ratio
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle mouse move for tooltips
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Find closest point
    let closestPoint: typeof positions[0] | null = null;
    let minDist = Infinity;

    positions.forEach((point) => {
      const px = point.x * dimensions.width;
      const py = point.y * dimensions.height;
      const dist = Math.hypot(x - px, y - py);

      if (dist < 20 && dist < minDist) {
        minDist = dist;
        closestPoint = point;
      }
    });

    if (closestPoint) {
      setHoveredPoint(closestPoint);
      setTooltipPos({ x: e.clientX, y: e.clientY });
    } else {
      setHoveredPoint(null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
  };

  return (
    <Card className="overflow-hidden border-slate-200 dark:border-slate-700">
      <CardContent className="p-0">
        {/* Stats bar - minimalist */}
        {showStats && (
          <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/20">
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">Total:</span>
                <span className="ml-2 font-semibold text-slate-700 dark:text-slate-300">
                  {stats.total}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Categories:</span>
                <span className="ml-2 font-semibold text-slate-700 dark:text-slate-300">
                  {stats.categories}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Avg Value:</span>
                <span className="ml-2 font-semibold text-slate-700 dark:text-slate-300">
                  {stats.avgValue.toFixed(1)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Canvas */}
        <div ref={containerRef} className="relative bg-white dark:bg-slate-950">
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="cursor-pointer"
          />

          {/* Tooltip */}
          {hoveredPoint && (
            <div
              className="fixed z-50 pointer-events-none"
              style={{
                left: tooltipPos.x + 10,
                top: tooltipPos.y + 10,
              }}
            >
              <div className="bg-slate-900 dark:bg-slate-800 text-white px-3 py-2 rounded-lg shadow-xl border border-slate-700 text-sm max-w-xs">
                <div className="font-semibold mb-1">{hoveredPoint.label}</div>
                <div className="text-xs space-y-1 text-slate-300">
                  <div>Category: {hoveredPoint.category}</div>
                  <div>Value: {hoveredPoint.value}</div>
                  {hoveredPoint.metadata && Object.entries(hoveredPoint.metadata).map(([key, value]) => (
                    <div key={key}>
                      {key}: {String(value)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
