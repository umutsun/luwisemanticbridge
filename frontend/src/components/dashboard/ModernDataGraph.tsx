'use client';

import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import apiClient from '@/lib/api/client';

interface GraphData {
  nodes: Array<{
    id: string;
    label: string;
    type: 'source' | 'process' | 'table' | 'stat';
    data: Record<string, any>;
    position: { x: number; y: number };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string;
  }>;
  stats: {
    totalDocuments: number;
    embeddedDocuments: number;
    totalEmbeddings: number;
    dataSources: number;
    totalMessages?: number;
  };
}

export default function ModernDataGraph() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    loadGraphData();
    // Auto-refresh disabled per user request
  }, []);

  const loadGraphData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get('/api/v2/dashboard/graph/data-sources');

      if (!response.data?.graph) {
        throw new Error('Invalid response format');
      }

      setGraphData(response.data.graph);
    } catch (err: any) {
      console.error('Failed to load graph:', err);
      setError(err.response?.data?.error || err.message || 'Failed to load graph');
    } finally {
      setLoading(false);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.min(Math.max(prev * delta, 0.5), 3));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-12">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-red-200 dark:border-red-900 p-6">
        <p className="text-red-600 dark:text-red-400 text-center text-sm">{error}</p>
      </div>
    );
  }

  if (!graphData) return null;

  const { nodes, edges, stats } = graphData;
  const embeddingProgress = stats.totalDocuments > 0
    ? Math.round((stats.embeddedDocuments / stats.totalDocuments) * 100)
    : 0;

  // Enhanced nodes with stats integrated
  const enhancedNodes = [
    ...nodes,
    {
      id: 'stat-docs',
      label: 'Documents',
      type: 'stat' as const,
      data: { value: stats.totalDocuments, sub: `${stats.embeddedDocuments} embedded` },
      position: { x: 50, y: 50 }
    },
    {
      id: 'stat-emb',
      label: 'Embeddings',
      type: 'stat' as const,
      data: { value: stats.totalEmbeddings, sub: `${stats.dataSources} sources` },
      position: { x: 250, y: 50 }
    },
    {
      id: 'stat-msg',
      label: 'Messages',
      type: 'stat' as const,
      data: { value: stats.totalMessages || 0, sub: 'chat messages' },
      position: { x: 450, y: 50 }
    },
    {
      id: 'stat-prog',
      label: 'Progress',
      type: 'stat' as const,
      data: { value: `${embeddingProgress}%`, sub: 'completion', progress: embeddingProgress },
      position: { x: 650, y: 50 }
    }
  ];

  // Dynamic node sizing based on data
  const getNodeSize = (node: typeof enhancedNodes[0]) => {
    if (node.type === 'stat') {
      return { width: 160, height: 80 };
    }
    // Size based on count (for data nodes)
    const count = node.data?.count || 0;
    const baseSize = 120;
    const scaleFactor = Math.min(Math.sqrt(count) * 10, 80); // Max +80px
    const width = baseSize + scaleFactor;
    const height = (baseSize + scaleFactor) * 0.5;
    return { width, height };
  };

  // Get node color based on type and data
  const getNodeColor = (node: typeof enhancedNodes[0]) => {
    // Stat nodes have predefined colors
    const statColors: Record<string, { gradient: string; stroke: string; filter: string; strokeDark: string; strokeLight: string }> = {
      'stat-docs': { gradient: 'url(#gradient-blue)', stroke: '#06b6d4', filter: 'url(#glow-cyan)', strokeDark: '#06b6d4', strokeLight: '#0891b2' },
      'stat-emb': { gradient: 'url(#gradient-green)', stroke: '#10b981', filter: 'url(#glow-green)', strokeDark: '#10b981', strokeLight: '#059669' },
      'stat-msg': { gradient: 'url(#gradient-purple)', stroke: '#d946ef', filter: 'url(#glow-magenta)', strokeDark: '#d946ef', strokeLight: '#a855f7' },
      'stat-prog': { gradient: 'url(#gradient-orange)', stroke: '#fbbf24', filter: 'url(#glow-yellow)', strokeDark: '#fbbf24', strokeLight: '#f59e0b' }
    };

    if (node.type === 'stat' && statColors[node.id]) {
      return statColors[node.id];
    }

    // Data nodes get different colors based on node type
    const dataColors: Record<string, { gradient: string; stroke: string; filter: string; strokeDark: string; strokeLight: string }> = {
      'source': { gradient: 'url(#gradient-source)', stroke: '#06b6d4', filter: 'url(#glow-cyan)', strokeDark: '#06b6d4', strokeLight: '#0891b2' },
      'process': { gradient: 'url(#gradient-process)', stroke: '#8b5cf6', filter: 'url(#glow-magenta)', strokeDark: '#8b5cf6', strokeLight: '#7c3aed' },
      'table': { gradient: 'url(#gradient-table)', stroke: '#10b981', filter: 'url(#glow-green)', strokeDark: '#10b981', strokeLight: '#059669' }
    };

    return dataColors[node.type] || { gradient: '#0f172a', stroke: '#06b6d4', filter: 'url(#glow-cyan)', strokeDark: '#06b6d4', strokeLight: '#0891b2' };
  };

  const getNodeStyle = (node: typeof enhancedNodes[0]) => {
    const colors = getNodeColor(node);

    return {
      fill: colors.gradient,
      stroke: colors.stroke,
      strokeWidth: 2,
      filter: colors.filter
    };
  };

  // Dynamic particles based on node count
  const particleCount = enhancedNodes.length;
  const generateParticles = () => {
    const particles = [];
    for (let i = 0; i < Math.min(particleCount * 2, 20); i++) {
      const colors = ['cyan', 'fuchsia', 'yellow', 'green'];
      const color = colors[i % colors.length];
      const top = Math.random() * 100;
      const left = Math.random() * 100;
      const delay = Math.random() * 3;
      particles.push({ color, top, left, delay, id: i });
    }
    return particles;
  };

  const particles = generateParticles();

  return (
    <div className="relative bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950 light:from-blue-50 light:via-slate-50 light:to-cyan-50 rounded-lg border border-cyan-500/20 dark:border-cyan-500/20 light:border-cyan-300/40 overflow-hidden shadow-2xl">
      {/* Animated Grid Background */}
      <div className="absolute inset-0 opacity-20 dark:opacity-20 light:opacity-30 pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(to right, rgba(6, 182, 212, 0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(6, 182, 212, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px'
        }}></div>
      </div>

      {/* Dynamic Glowing Particles Background */}
      <div className="absolute inset-0 overflow-hidden opacity-30 dark:opacity-30 light:opacity-50 pointer-events-none">
        {particles.map((particle) => (
          <div
            key={particle.id}
            className={`absolute w-2 h-2 rounded-full bg-${particle.color}-400 blur-sm animate-pulse`}
            style={{
              top: `${particle.top}%`,
              left: `${particle.left}%`,
              animationDelay: `${particle.delay}s`
            }}
          />
        ))}
      </div>
      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <div className="bg-slate-900/80 dark:bg-slate-900/80 light:bg-white/90 backdrop-blur-sm rounded-lg border border-cyan-500/30 dark:border-cyan-500/30 light:border-cyan-400/50 px-3 py-1.5 flex items-center gap-2 shadow-lg shadow-cyan-500/10">
          <span className="text-xs text-cyan-400 dark:text-cyan-400 light:text-cyan-600">Zoom</span>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.1"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="w-20 h-1 bg-slate-700 dark:bg-slate-700 light:bg-slate-200 rounded-lg appearance-none cursor-pointer"
          />
          <span className="text-xs font-mono text-cyan-300 dark:text-cyan-300 light:text-cyan-700 w-10">{zoom.toFixed(1)}x</span>
        </div>
        <button
          onClick={loadGraphData}
          className="p-2 rounded-lg bg-slate-900/80 dark:bg-slate-900/80 light:bg-white/90 backdrop-blur-sm border border-cyan-500/30 dark:border-cyan-500/30 light:border-cyan-400/50 hover:border-cyan-500/50 hover:bg-cyan-500/10 transition-all shadow-lg shadow-cyan-500/10"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4 text-cyan-400 dark:text-cyan-400 light:text-cyan-600" />
        </button>
      </div>

      {/* Graph Canvas with 3D Perspective */}
      <div
        className="relative w-full h-[600px] cursor-grab active:cursor-grabbing"
        style={{ perspective: '1200px', perspectiveOrigin: 'center center' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          ref={svgRef}
          className="w-full h-full"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotateX(5deg) rotateY(2deg)`,
            transformOrigin: 'center',
            transformStyle: 'preserve-3d',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out'
          }}
        >
          {/* Definitions */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="#0ea5e9"
                strokeWidth="0.3"
                opacity="0.2"
              />
            </pattern>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="#06b6d4" />
            </marker>

            {/* Neon Glow Filters */}
            <filter id="glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <filter id="glow-magenta" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <filter id="glow-yellow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>

            {/* Neon Gradient Definitions */}
            <radialGradient id="gradient-blue">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#0891b2" />
            </radialGradient>
            <radialGradient id="gradient-green">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#059669" />
            </radialGradient>
            <radialGradient id="gradient-purple">
              <stop offset="0%" stopColor="#d946ef" />
              <stop offset="100%" stopColor="#a855f7" />
            </radialGradient>
            <radialGradient id="gradient-orange">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#f59e0b" />
            </radialGradient>
            {/* Data node gradients */}
            <radialGradient id="gradient-source">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#0284c7" />
            </radialGradient>
            <radialGradient id="gradient-process">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#7c3aed" />
            </radialGradient>
            <radialGradient id="gradient-table">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#047857" />
            </radialGradient>
          </defs>

          <rect width="2000" height="1000" fill="url(#grid)" />

          {/* Edges */}
          <g>
            {edges.map(edge => {
              const sourceNode = enhancedNodes.find(n => n.id === edge.source);
              const targetNode = enhancedNodes.find(n => n.id === edge.target);
              if (!sourceNode || !targetNode) return null;

              const sourceSize = getNodeSize(sourceNode);
              const targetSize = getNodeSize(targetNode);

              const x1 = sourceNode.position.x + sourceSize.width / 2;
              const y1 = sourceNode.position.y + sourceSize.height / 2;
              const x2 = targetNode.position.x + targetSize.width / 2;
              const y2 = targetNode.position.y + targetSize.height / 2;

              return (
                <g key={edge.id}>
                  {/* Glowing background line */}
                  <line
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="#06b6d4"
                    strokeWidth="3"
                    opacity="0.3"
                    filter="url(#glow-cyan)"
                  />
                  {/* Main line */}
                  <line
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="#06b6d4"
                    strokeWidth="1.5"
                    markerEnd="url(#arrowhead)"
                    opacity="0.6"
                    className="hover:opacity-100 transition-opacity"
                  />
                  {edge.label && (
                    <text
                      x={(x1 + x2) / 2}
                      y={(y1 + y2) / 2 - 8}
                      textAnchor="middle"
                      fontSize="9"
                      fill="#06b6d4"
                      fontWeight="500"
                      opacity="0.8"
                    >
                      {edge.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {/* Nodes */}
          <g>
            {enhancedNodes.map(node => {
              const style = getNodeStyle(node);
              const size = getNodeSize(node);
              const colors = getNodeColor(node);
              const isSelected = selectedNode === node.id;

              return (
                <g
                  key={node.id}
                  className="transition-transform hover:scale-105 cursor-pointer"
                  style={{ transformOrigin: `${node.position.x + size.width/2}px ${node.position.y + size.height/2}px` }}
                  onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
                >
                  <rect
                    x={node.position.x}
                    y={node.position.y}
                    width={size.width}
                    height={size.height}
                    rx="12"
                    {...style}
                    className="transition-all"
                    strokeWidth={isSelected ? 3 : 2}
                    opacity={isSelected ? 1 : 0.9}
                  />

                  {/* Node content */}
                  <text
                    x={node.position.x + size.width / 2}
                    y={node.position.y + 24}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="600"
                    fill={node.type === 'stat' ? '#f1f5f9' : '#ffffff'}
                    className="pointer-events-none select-none"
                  >
                    {node.label}
                  </text>

                  {node.type === 'stat' && (
                    <>
                      <text
                        x={node.position.x + size.width / 2}
                        y={node.position.y + 44}
                        textAnchor="middle"
                        fontSize="18"
                        fontWeight="700"
                        fill="#ffffff"
                        className="pointer-events-none select-none"
                      >
                        {node.data.value}
                      </text>
                      <text
                        x={node.position.x + size.width / 2}
                        y={node.position.y + 60}
                        textAnchor="middle"
                        fontSize="8"
                        fill="#cbd5e1"
                        className="pointer-events-none select-none"
                      >
                        {node.data.sub}
                      </text>
                      {node.data.progress !== undefined && (
                        <>
                          <rect
                            x={node.position.x + 16}
                            y={node.position.y + size.height - 12}
                            width={size.width - 32}
                            height="3"
                            rx="1.5"
                            fill="#1e293b"
                          />
                          <rect
                            x={node.position.x + 16}
                            y={node.position.y + size.height - 12}
                            width={(size.width - 32) * (node.data.progress / 100)}
                            height="3"
                            rx="1.5"
                            fill="#fbbf24"
                            className="transition-all duration-500"
                          />
                        </>
                      )}
                    </>
                  )}

                  {node.data?.count !== undefined && node.type !== 'stat' && (
                    <text
                      x={node.position.x + size.width / 2}
                      y={node.position.y + size.height / 2 + 6}
                      textAnchor="middle"
                      fontSize="14"
                      fontWeight="700"
                      fill="#ffffff"
                      className="pointer-events-none select-none"
                    >
                      {node.data.count}
                    </text>
                  )}

                  {/* Tooltip on click */}
                  {isSelected && (
                    <g>
                      <rect
                        x={node.position.x + size.width + 10}
                        y={node.position.y}
                        width="200"
                        height="auto"
                        rx="8"
                        fill="rgba(15, 23, 42, 0.95)"
                        stroke={colors.stroke}
                        strokeWidth="1"
                        filter="url(#glow-cyan)"
                      />
                      <text
                        x={node.position.x + size.width + 20}
                        y={node.position.y + 20}
                        fontSize="10"
                        fontWeight="600"
                        fill="#f1f5f9"
                        className="pointer-events-none select-none"
                      >
                        {node.label}
                      </text>
                      <text
                        x={node.position.x + size.width + 20}
                        y={node.position.y + 38}
                        fontSize="9"
                        fill="#cbd5e1"
                        className="pointer-events-none select-none"
                      >
                        Type: {node.type}
                      </text>
                      {node.data?.count !== undefined && (
                        <text
                          x={node.position.x + size.width + 20}
                          y={node.position.y + 53}
                          fontSize="9"
                          fill="#cbd5e1"
                          className="pointer-events-none select-none"
                        >
                          Count: {node.data.count}
                        </text>
                      )}
                      {node.data?.value && (
                        <text
                          x={node.position.x + size.width + 20}
                          y={node.position.y + 68}
                          fontSize="9"
                          fill="#cbd5e1"
                          className="pointer-events-none select-none"
                        >
                          Value: {node.data.value}
                        </text>
                      )}
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 left-4 text-xs text-cyan-400/60 dark:text-cyan-400/60 light:text-cyan-600/80 space-y-1">
        <p>• Scroll to zoom • Drag to pan • Click nodes for details</p>
      </div>
    </div>
  );
}
