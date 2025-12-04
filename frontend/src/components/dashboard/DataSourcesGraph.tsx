'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import apiClient from '@/lib/api/client';

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

  // Calculate progress percentage
  const embeddingProgress = stats.totalDocuments > 0
    ? Math.round((stats.embeddedDocuments / stats.totalDocuments) * 100)
    : 0;

  // Minimal stats configuration
  const statsConfig = [
    {
      key: 'documents',
      label: 'Documents',
      value: stats.totalDocuments,
      subValue: `${stats.embeddedDocuments} embedded`,
    },
    {
      key: 'embeddings',
      label: 'Embeddings',
      value: stats.totalEmbeddings,
      subValue: `${stats.dataSources} sources`,
    },
    {
      key: 'messages',
      label: 'Messages',
      value: stats.totalMessages || 0,
      subValue: 'chat messages',
    },
    {
      key: 'progress',
      label: 'Progress',
      value: `${embeddingProgress}%`,
      subValue: 'completion',
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
    <div className="space-y-4">
      {/* Minimal Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {statsConfig.map((stat, index) => (
          <div
            key={stat.key}
            className="group relative bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex flex-col space-y-1">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{stat.label}</p>
              <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{stat.value}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">{stat.subValue}</p>

              {/* Minimal Progress bar */}
              {stat.progress !== undefined && (
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-slate-900 dark:bg-slate-100 rounded-full transition-all duration-700"
                      style={{ width: `${stat.progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Minimal Graph Visualization */}
      <div className="relative bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Minimal Refresh button */}
        <div className="absolute top-3 right-3 z-10">
          <button
            onClick={loadGraphData}
            className="p-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
          </button>
        </div>

        <div className="p-6">
          <svg
            viewBox={`${minX} ${minY} ${svgWidth} ${svgHeight}`}
            className="w-full"
            style={{ minHeight: '400px' }}
          >
            {/* Minimal markers */}
            <defs>
              <marker
                id="arrowhead"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" fill="#64748b" />
              </marker>
            </defs>

            {/* Minimal Edges */}
            {edges.map(edge => {
              const sourceNode = nodes.find(n => n.id === edge.source);
              const targetNode = nodes.find(n => n.id === edge.target);

              if (!sourceNode || !targetNode) return null;

              const x1 = sourceNode.position.x + nodeWidth / 2;
              const y1 = sourceNode.position.y + nodeHeight / 2;
              const x2 = targetNode.position.x + nodeWidth / 2;
              const y2 = targetNode.position.y + nodeHeight / 2;

              return (
                <g key={edge.id}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="#cbd5e1"
                    strokeWidth="1.5"
                    markerEnd="url(#arrowhead)"
                    opacity="0.5"
                  />
                  {edge.label && (
                    <text
                      x={(x1 + x2) / 2}
                      y={(y1 + y2) / 2 - 8}
                      textAnchor="middle"
                      fontSize="9"
                      fill="#94a3b8"
                      className="pointer-events-none"
                    >
                      {edge.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Minimal Nodes */}
            {nodes.map(node => {
              let fillColor = '#f8fafc';
              let textColor = '#1e293b';

              return (
                <g key={node.id}>
                  {/* Node background */}
                  <rect
                    x={node.position.x}
                    y={node.position.y}
                    width={nodeWidth}
                    height={nodeHeight}
                    rx="8"
                    fill={fillColor}
                    stroke="#cbd5e1"
                    strokeWidth="1.5"
                  />

                  {/* Node label */}
                  <text
                    x={node.position.x + nodeWidth / 2}
                    y={node.position.y + nodeHeight / 2 - 4}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="11"
                    fontWeight="500"
                    fill={textColor}
                    className="pointer-events-none"
                  >
                    {node.label}
                  </text>

                  {/* Node data count */}
                  {node.data?.count !== undefined && (
                    <text
                      x={node.position.x + nodeWidth / 2}
                      y={node.position.y + nodeHeight / 2 + 12}
                      textAnchor="middle"
                      fontSize="9"
                      fill="#64748b"
                      className="pointer-events-none"
                    >
                      {node.data.count}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
