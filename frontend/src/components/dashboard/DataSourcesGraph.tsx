'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, Database, Zap } from 'lucide-react';
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
      const response = await apiClient.get('/api/v2/dashboard/graph/data-sources');
      setGraphData(response.data.graph);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load graph:', err);
      setError(err.response?.data?.error || 'Failed to load graph data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-4 h-4" />
            Data Sources Graph
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-96">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Data Sources Graph</CardTitle>
        </CardHeader>
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

  const svgWidth = Math.max(800, maxX - minX);
  const svgHeight = Math.max(400, maxY - minY);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Database className="w-4 h-4" />
          Data Sources & Embeddings
        </CardTitle>
        <button
          onClick={loadGraphData}
          className="p-2 hover:bg-muted rounded-lg transition"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Documents</p>
            <p className="text-lg font-semibold">{stats.totalDocuments}</p>
            <p className="text-xs text-green-600">
              {stats.embeddedDocuments} embedded
            </p>
          </div>
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Embeddings</p>
            <p className="text-lg font-semibold">{stats.totalEmbeddings}</p>
            <p className="text-xs text-blue-600">
              {stats.dataSources} sources
            </p>
          </div>
          <div className="p-3 bg-muted rounded-lg md:col-span-2">
            <p className="text-xs text-muted-foreground mb-1">Embedding Status</p>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-green-500 h-full"
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
              <span className="text-xs font-semibold">
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
            let icon = null;

            if (node.type === 'source') {
              bgColor = '#dbeafe';
              textColor = '#1e40af';
              icon = '📄';
            } else if (node.type === 'process') {
              bgColor = '#dcfce7';
              textColor = '#15803d';
              icon = '⚡';
            } else if (node.type === 'table') {
              bgColor = '#f3e8ff';
              textColor = '#6b21a8';
              icon = '📊';
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

                {/* Icon */}
                <text
                  x={node.position.x + 10}
                  y={node.position.y + 20}
                  fontSize="16"
                  className="pointer-events-none"
                >
                  {icon}
                </text>

                {/* Label */}
                <text
                  x={node.position.x + 10}
                  y={node.position.y + 40}
                  fontSize="12"
                  fontWeight="600"
                  fill={textColor}
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

        {/* Legend */}
        <div className="grid grid-cols-3 gap-4 text-xs pt-4 border-t">
          <div className="flex items-center gap-2">
            <span className="text-xl">📄</span>
            <span>Source Documents</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <span>Embeddings</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl">📊</span>
            <span>Data Tables</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
