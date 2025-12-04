'use client';

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { RefreshCw, Database, FileText, MessageSquare, Network, TrendingUp } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { motion, AnimatePresence } from 'framer-motion';

interface GraphData {
  nodes: Array<{
    id: string;
    label: string;
    type: 'source' | 'process' | 'table';
    data: Record<string, any>;
    position: { x: number; y: number };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string;
    animated?: boolean;
  }>;
  stats: {
    totalDocuments: number;
    embeddedDocuments: number;
    totalEmbeddings: number;
    dataSources: number;
    crawledItems?: number;
    totalMessages?: number;
    vectorDimensions?: number;
  };
}

export default function DataSourcesGraph() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredStat, setHoveredStat] = useState<string | null>(null);

  useEffect(() => {
    loadGraphData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadGraphData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadGraphData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get('/api/v2/dashboard/graph/data-sources');

      if (!response.data?.graph) {
        throw new Error('Invalid response format: missing graph data');
      }

      setGraphData(response.data.graph);
    } catch (err: any) {
      console.error('Failed to load graph:', err);
      const errorMessage =
        err.response?.data?.error ||
        err.message ||
        'Failed to load graph data';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-500/10 via-blue-500/10 to-amber-500/10 backdrop-blur-xl border border-white/20 dark:border-white/10"
      >
        <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:20px_20px]" />
        <div className="relative flex items-center justify-center h-96">
          <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
        </div>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-500/10 to-orange-500/10 backdrop-blur-xl border border-red-500/20 p-6"
      >
        <p className="text-red-500 text-center">{error}</p>
      </motion.div>
    );
  }

  if (!graphData) return null;

  const { nodes, edges, stats } = graphData;

  // Calculate progress percentage
  const embeddingProgress = stats.totalDocuments > 0
    ? Math.round((stats.embeddedDocuments / stats.totalDocuments) * 100)
    : 0;

  // Stats configuration with icons and colors
  const statsConfig = [
    {
      key: 'documents',
      icon: FileText,
      label: 'Documents',
      value: stats.totalDocuments,
      subValue: `${stats.embeddedDocuments} embedded`,
      color: 'from-blue-500 to-cyan-500',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
      iconColor: 'text-blue-500'
    },
    {
      key: 'embeddings',
      icon: Network,
      label: 'Embeddings',
      value: stats.totalEmbeddings,
      subValue: `${stats.dataSources} sources`,
      color: 'from-purple-500 to-pink-500',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/20',
      iconColor: 'text-purple-500'
    },
    {
      key: 'messages',
      icon: MessageSquare,
      label: 'Messages',
      value: stats.totalMessages || 0,
      subValue: 'chat messages',
      color: 'from-amber-500 to-orange-500',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20',
      iconColor: 'text-amber-500'
    },
    {
      key: 'progress',
      icon: TrendingUp,
      label: 'Progress',
      value: `${embeddingProgress}%`,
      subValue: 'completion',
      color: 'from-green-500 to-emerald-500',
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/20',
      iconColor: 'text-green-500',
      progress: embeddingProgress
    },
  ];

  // SVG node positioning
  const padding = 40;
  const nodeWidth = 140;
  const nodeHeight = 70;

  const minX = Math.min(...nodes.map(n => n.position.x)) - padding;
  const maxX = Math.max(...nodes.map(n => n.position.x + nodeWidth)) + padding;
  const minY = Math.min(...nodes.map(n => n.position.y)) - padding;
  const maxY = Math.max(...nodes.map(n => n.position.y + nodeHeight)) + padding;

  const svgWidth = Math.max(1200, maxX - minX);
  const svgHeight = Math.max(500, maxY - minY);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-4"
    >
      {/* Stats Grid with Glassmorph */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsConfig.map((stat, index) => (
          <motion.div
            key={stat.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            onHoverStart={() => setHoveredStat(stat.key)}
            onHoverEnd={() => setHoveredStat(null)}
            className="group relative"
          >
            <div className={`
              relative overflow-hidden rounded-xl p-4
              ${stat.bgColor} backdrop-blur-xl
              border ${stat.borderColor}
              transition-all duration-300
              ${hoveredStat === stat.key ? 'scale-105 shadow-lg' : 'scale-100'}
            `}>
              {/* Gradient overlay on hover */}
              <div className={`
                absolute inset-0 bg-gradient-to-br ${stat.color}
                opacity-0 group-hover:opacity-10
                transition-opacity duration-300
              `} />

              <div className="relative flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs font-medium text-muted-foreground mb-2">{stat.label}</p>
                  <p className="text-2xl font-bold tracking-tight mb-1">{stat.value}</p>
                  <p className={`text-xs ${stat.iconColor}/80`}>{stat.subValue}</p>
                </div>
                <div className={`
                  p-2 rounded-lg ${stat.bgColor}
                  transform group-hover:scale-110 group-hover:rotate-12
                  transition-all duration-300
                `}>
                  <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
                </div>
              </div>

              {/* Progress bar for completion stat */}
              {stat.progress !== undefined && (
                <div className="mt-3">
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${stat.progress}%` }}
                      transition={{ duration: 1, delay: 0.5 }}
                      className={`h-full bg-gradient-to-r ${stat.color}`}
                    />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Graph Visualization with Glassmorph */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50/50 via-white/50 to-slate-100/50 dark:from-slate-900/50 dark:via-slate-800/50 dark:to-slate-900/50 backdrop-blur-xl border border-white/20 dark:border-white/10"
      >
        {/* Refresh button */}
        <div className="absolute top-4 right-4 z-10">
          <motion.button
            whileHover={{ scale: 1.1, rotate: 180 }}
            whileTap={{ scale: 0.9 }}
            onClick={loadGraphData}
            className="p-2 rounded-lg bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-white/20 shadow-lg hover:shadow-xl transition-all"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-purple-500" />
          </motion.button>
        </div>

        <div className="p-6">
          <svg
            viewBox={`${minX} ${minY} ${svgWidth} ${svgHeight}`}
            className="w-full"
            style={{ minHeight: '400px' }}
          >
            {/* Defs for gradients and markers */}
            <defs>
              {/* Arrow markers with different colors */}
              <marker
                id="arrowhead-purple"
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 10 3, 0 6" fill="#a855f7" />
              </marker>
              <marker
                id="arrowhead-blue"
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 10 3, 0 6" fill="#3b82f6" />
              </marker>

              {/* Node gradients */}
              <linearGradient id="gradient-source" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0.8" />
              </linearGradient>
              <linearGradient id="gradient-process" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.8" />
              </linearGradient>
              <linearGradient id="gradient-table" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#f97316" stopOpacity="0.8" />
              </linearGradient>
            </defs>

            {/* Edges with animation */}
            {edges.map(edge => {
              const sourceNode = nodes.find(n => n.id === edge.source);
              const targetNode = nodes.find(n => n.id === edge.target);

              if (!sourceNode || !targetNode) return null;

              const x1 = sourceNode.position.x + nodeWidth / 2;
              const y1 = sourceNode.position.y + nodeHeight / 2;
              const x2 = targetNode.position.x + nodeWidth / 2;
              const y2 = targetNode.position.y + nodeHeight / 2;

              return (
                <g key={edge.id} className="group">
                  {/* Edge line */}
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={edge.animated ? '#a855f7' : '#94a3b8'}
                    strokeWidth={edge.animated ? 2.5 : 2}
                    strokeDasharray={edge.animated ? '8,4' : 'none'}
                    markerEnd={edge.animated ? 'url(#arrowhead-purple)' : 'url(#arrowhead-blue)'}
                    className="transition-all duration-300 group-hover:stroke-purple-400"
                    opacity="0.6"
                  >
                    {edge.animated && (
                      <animate
                        attributeName="stroke-dashoffset"
                        from="0"
                        to="-12"
                        dur="1s"
                        repeatCount="indefinite"
                      />
                    )}
                  </line>

                  {/* Edge label */}
                  {edge.label && (
                    <text
                      x={(x1 + x2) / 2}
                      y={(y1 + y2) / 2 - 8}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="500"
                      fill="currentColor"
                      className="text-muted-foreground fill-current pointer-events-none opacity-70"
                    >
                      {edge.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {nodes.map(node => {
              let gradientId = 'gradient-source';
              let strokeColor = '#8b5cf6';

              if (node.type === 'process') {
                gradientId = 'gradient-process';
                strokeColor = '#3b82f6';
              } else if (node.type === 'table') {
                gradientId = 'gradient-table';
                strokeColor = '#f59e0b';
              }

              return (
                <g key={node.id} className="group cursor-pointer">
                  {/* Node shadow */}
                  <rect
                    x={node.position.x + 2}
                    y={node.position.y + 2}
                    width={nodeWidth}
                    height={nodeHeight}
                    rx="12"
                    fill="black"
                    opacity="0.1"
                  />

                  {/* Node background */}
                  <rect
                    x={node.position.x}
                    y={node.position.y}
                    width={nodeWidth}
                    height={nodeHeight}
                    rx="12"
                    fill={`url(#${gradientId})`}
                    stroke={strokeColor}
                    strokeWidth="2"
                    className="transition-all duration-300 group-hover:stroke-[3]"
                  >
                    <animate
                      attributeName="opacity"
                      values="0.8;1;0.8"
                      dur="3s"
                      repeatCount="indefinite"
                    />
                  </rect>

                  {/* Node label */}
                  <text
                    x={node.position.x + nodeWidth / 2}
                    y={node.position.y + nodeHeight / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="12"
                    fontWeight="600"
                    fill="white"
                    className="pointer-events-none"
                  >
                    {node.label}
                  </text>

                  {/* Node data count */}
                  {node.data?.count !== undefined && (
                    <text
                      x={node.position.x + nodeWidth / 2}
                      y={node.position.y + nodeHeight / 2 + 16}
                      textAnchor="middle"
                      fontSize="10"
                      fill="white"
                      opacity="0.8"
                      className="pointer-events-none"
                    >
                      {node.data.count} items
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </motion.div>
    </motion.div>
  );
}
