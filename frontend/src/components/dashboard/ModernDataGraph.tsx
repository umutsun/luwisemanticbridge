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

  const nodeWidth = 160;
  const nodeHeight = 80;

  const getNodeStyle = (node: typeof enhancedNodes[0]) => {
    if (node.type === 'stat') {
      // Neon stat node'ları
      const styles: Record<string, { fill: string; stroke: string; filter: string }> = {
        'stat-docs': {
          fill: 'url(#gradient-blue)',
          stroke: '#06b6d4',
          filter: 'url(#glow-cyan)'
        },
        'stat-emb': {
          fill: 'url(#gradient-green)',
          stroke: '#10b981',
          filter: 'url(#glow-green)'
        },
        'stat-msg': {
          fill: 'url(#gradient-purple)',
          stroke: '#d946ef',
          filter: 'url(#glow-magenta)'
        },
        'stat-prog': {
          fill: 'url(#gradient-orange)',
          stroke: '#fbbf24',
          filter: 'url(#glow-yellow)'
        }
      };

      const style = styles[node.id] || { fill: '#1e293b', stroke: '#475569', filter: 'none' };

      return {
        fill: style.fill,
        stroke: style.stroke,
        strokeWidth: 2,
        filter: style.filter
      };
    }
    return {
      fill: '#0f172a',
      stroke: '#06b6d4',
      strokeWidth: 2,
      filter: 'url(#glow-cyan)'
    };
  };

  return (
    <div className="relative bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 rounded-lg border border-cyan-500/20 overflow-hidden shadow-2xl">
      {/* Animated Grid Background */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(to right, rgba(6, 182, 212, 0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(6, 182, 212, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px'
        }}></div>
      </div>

      {/* Glowing Particles Background */}
      <div className="absolute inset-0 overflow-hidden opacity-30 pointer-events-none">
        <div className="absolute top-10 left-10 w-2 h-2 rounded-full bg-cyan-400 blur-sm animate-pulse"></div>
        <div className="absolute top-32 right-20 w-2 h-2 rounded-full bg-fuchsia-400 blur-sm animate-pulse" style={{ animationDelay: '0.5s' }}></div>
        <div className="absolute bottom-20 left-1/4 w-2 h-2 rounded-full bg-yellow-400 blur-sm animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute bottom-40 right-1/3 w-2 h-2 rounded-full bg-cyan-400 blur-sm animate-pulse" style={{ animationDelay: '1.5s' }}></div>
        <div className="absolute top-1/2 right-10 w-2 h-2 rounded-full bg-fuchsia-400 blur-sm animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>
      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <div className="bg-slate-900/80 backdrop-blur-sm rounded-lg border border-cyan-500/30 px-3 py-1.5 flex items-center gap-2 shadow-lg shadow-cyan-500/10">
          <span className="text-xs text-cyan-400">Zoom</span>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.1"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="w-20 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
          />
          <span className="text-xs font-mono text-cyan-300 w-10">{zoom.toFixed(1)}x</span>
        </div>
        <button
          onClick={loadGraphData}
          className="p-2 rounded-lg bg-slate-900/80 backdrop-blur-sm border border-cyan-500/30 hover:border-cyan-500/50 hover:bg-cyan-500/10 transition-all shadow-lg shadow-cyan-500/10"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4 text-cyan-400" />
        </button>
      </div>

      {/* Graph Canvas */}
      <div
        className="relative w-full h-[600px] cursor-grab active:cursor-grabbing"
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
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center',
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
          </defs>

          <rect width="2000" height="1000" fill="url(#grid)" />

          {/* Edges */}
          <g>
            {edges.map(edge => {
              const sourceNode = enhancedNodes.find(n => n.id === edge.source);
              const targetNode = enhancedNodes.find(n => n.id === edge.target);
              if (!sourceNode || !targetNode) return null;

              const x1 = sourceNode.position.x + nodeWidth / 2;
              const y1 = sourceNode.position.y + nodeHeight / 2;
              const x2 = targetNode.position.x + nodeWidth / 2;
              const y2 = targetNode.position.y + nodeHeight / 2;

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

              return (
                <g
                  key={node.id}
                  className="transition-transform hover:scale-105"
                  style={{ transformOrigin: `${node.position.x + nodeWidth/2}px ${node.position.y + nodeHeight/2}px` }}
                >
                  <rect
                    x={node.position.x}
                    y={node.position.y}
                    width={nodeWidth}
                    height={nodeHeight}
                    rx="12"
                    {...style}
                    className="transition-all"
                  />

                  {/* Node content */}
                  <text
                    x={node.position.x + nodeWidth / 2}
                    y={node.position.y + 24}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="600"
                    fill={node.type === 'stat' ? '#f1f5f9' : '#06b6d4'}
                    className="pointer-events-none select-none"
                  >
                    {node.label}
                  </text>

                  {node.type === 'stat' && (
                    <>
                      <text
                        x={node.position.x + nodeWidth / 2}
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
                        x={node.position.x + nodeWidth / 2}
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
                            y={node.position.y + nodeHeight - 12}
                            width={nodeWidth - 32}
                            height="3"
                            rx="1.5"
                            fill="#1e293b"
                          />
                          <rect
                            x={node.position.x + 16}
                            y={node.position.y + nodeHeight - 12}
                            width={(nodeWidth - 32) * (node.data.progress / 100)}
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
                      x={node.position.x + nodeWidth / 2}
                      y={node.position.y + 48}
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="600"
                      fill="#06b6d4"
                      className="pointer-events-none select-none"
                    >
                      {node.data.count}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 left-4 text-xs text-cyan-400/60 space-y-1">
        <p>• Scroll to zoom • Drag to pan</p>
        <p>• Hover nodes for details</p>
      </div>
    </div>
  );
}
