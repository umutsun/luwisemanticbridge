'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
      <Card>
        <CardContent className="flex items-center justify-center h-96">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-96 text-red-500">
          {error}
        </CardContent>
      </Card>
    );
  }

  if (!graphData) return null;

  const { nodes, edges, stats } = graphData;

  // Calculate SVG bounds
  const padding = 40;
  const nodeWidth = 120;
  const nodeHeight = 60;

  const minX = Math.min(...nodes.map(n => n.position.x)) - padding;
  const maxX = Math.max(...nodes.map(n => n.position.x + nodeWidth)) + padding;
  const minY = Math.min(...nodes.map(n => n.position.y)) - padding;
  const maxY = Math.max(...nodes.map(n => n.position.y + nodeHeight)) + padding;

  const svgWidth = Math.max(1200, maxX - minX);
  const svgHeight = Math.max(600, maxY - minY);

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex justify-end mb-2">
          <button
            onClick={loadGraphData}
            className="p-2 hover:bg-muted rounded-lg transition"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        {/* Stats - Expanded with all data sources */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-muted-foreground mb-1">Documents</p>
            <p className="text-lg font-semibold">{stats.totalDocuments}</p>
            <p className="text-xs text-blue-600">
              {stats.embeddedDocuments} embedded
            </p>
          </div>
          <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <p className="text-xs text-muted-foreground mb-1">Web Crawls</p>
            <p className="text-lg font-semibold">{stats.crawledItems || 0}</p>
            <p className="text-xs text-green-600">
              crawled items
            </p>
          </div>
          <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
            <p className="text-xs text-muted-foreground mb-1">Messages</p>
            <p className="text-lg font-semibold">{stats.totalMessages || 0}</p>
            <p className="text-xs text-purple-600">
              chat messages
            </p>
          </div>
          <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
            <p className="text-xs text-muted-foreground mb-1">Embeddings</p>
            <p className="text-lg font-semibold">{stats.totalEmbeddings}</p>
            <p className="text-xs text-orange-600">
              {stats.dataSources} sources
            </p>
          </div>
          <div className="p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800">
            <p className="text-xs text-muted-foreground mb-1">Vector DB</p>
            <p className="text-lg font-semibold">{stats.vectorDimensions || 1536}</p>
            <p className="text-xs text-cyan-600">
              dimensions
            </p>
          </div>
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Embedding Progress</p>
            <div className="flex items-center gap-1">
              <div className="flex-1 min-h-6">
                <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-green-500 h-full transition-all"
                    style={{
                      width: `${
                        stats.totalDocuments > 0
                          ? (stats.embeddedDocuments / stats.totalDocuments) * 100
                          : 0
                      }%`
                    }}
                  />
                </div>
              </div>
              <span className="text-xs font-semibold ml-1">
                {stats.totalDocuments > 0
                  ? Math.round(
                      (stats.embeddedDocuments / stats.totalDocuments) * 100
                    )
                  : 0}
                %
              </span>
            </div>
          </div>
        </div>

        {/* Graph Visualization */}
        <svg
          viewBox={`${minX} ${minY} ${svgWidth} ${svgHeight}`}
          className="w-full border border-border rounded-lg bg-muted/20 dark:bg-muted/10"
          style={{ minHeight: '400px' }}
        >
          {/* Edges */}
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
                {/* Arrow line */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={edge.animated ? '#3b82f6' : '#94a3b8'}
                  strokeWidth={edge.animated ? 2 : 1.5}
                  strokeDasharray={edge.animated ? '5,5' : 'none'}
                  markerEnd="url(#arrowhead)"
                />
                {/* Label */}
                {edge.label && (
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 5}
                    textAnchor="middle"
                    fontSize="11"
                    fill="#64748b"
                    className="pointer-events-none"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Arrow marker definition */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="#94a3b8" />
            </marker>
          </defs>

          {/* Nodes */}
          {nodes.map(node => {
            let bgColor = '#f1f5f9';
            let textColor = '#1e293b';

            if (node.type === 'source') {
              // Differentiate source types by node ID
              if (node.id === 'documents') {
                bgColor = '#dbeafe';
                textColor = '#1e40af';
              } else if (node.id === 'crawls') {
                bgColor = '#dcfce7';
                textColor = '#15803d';
              } else if (node.id === 'messages') {
                bgColor = '#fce7f3';
                textColor = '#be185d';
              } else {
                bgColor = '#dbeafe';
                textColor = '#1e40af';
              }
            } else if (node.type === 'process') {
              if (node.id === 'vector-db') {
                bgColor = '#e0e7ff';
                textColor = '#3730a3';
              } else {
                bgColor = '#fef08a';
                textColor = '#854d0e';
              }
            } else if (node.type === 'table') {
              bgColor = '#f3e8ff';
              textColor = '#6b21a8';
            }

            const nodeData = node.data;

            return (
              <g key={node.id}>
                {/* Node background */}
                <rect
                  x={node.position.x}
                  y={node.position.y}
                  width={nodeWidth}
                  height={nodeHeight}
                  rx="8"
                  fill={bgColor}
                  stroke={textColor}
                  strokeWidth="2"
                />

                {/* Label - centered */}
                <text
                  x={node.position.x + nodeWidth / 2}
                  y={node.position.y + nodeHeight / 2 + 2}
                  fontSize="12"
                  fontWeight="600"
                  fill={textColor}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="pointer-events-none"
                >
                  {node.label}
                </text>

                {/* Data info */}
                {node.type === 'source' && (
                  <>
                    <text
                      x={node.position.x + nodeWidth / 2}
                      y={node.position.y - 5}
                      fontSize="10"
                      textAnchor="middle"
                      fill={textColor}
                      className="pointer-events-none"
                    >
                      {nodeData.total} total
                    </text>
                    <text
                      x={node.position.x + nodeWidth / 2}
                      y={node.position.y + nodeHeight + 15}
                      fontSize="10"
                      textAnchor="middle"
                      fill={textColor}
                      className="pointer-events-none"
                    >
                      {nodeData.embedded} embedded
                    </text>
                  </>
                )}

                {node.type === 'process' && (
                  <>
                    <text
                      x={node.position.x + nodeWidth / 2}
                      y={node.position.y - 5}
                      fontSize="10"
                      textAnchor="middle"
                      fill={textColor}
                      className="pointer-events-none"
                    >
                      {nodeData.total} vectors
                    </text>
                    <text
                      x={node.position.x + nodeWidth / 2}
                      y={node.position.y + nodeHeight + 15}
                      fontSize="10"
                      textAnchor="middle"
                      fill={textColor}
                      className="pointer-events-none"
                    >
                      dim: {nodeData.dimensions}
                    </text>
                  </>
                )}

                {node.type === 'table' && (
                  <text
                    x={node.position.x + nodeWidth / 2}
                    y={node.position.y + nodeHeight + 15}
                    fontSize="10"
                    textAnchor="middle"
                    fill={textColor}
                    className="pointer-events-none"
                  >
                    {nodeData.count} records
                  </text>
                )}
              </g>
            );
          })}
        </svg>

      </CardContent>
    </Card>
  );
}
