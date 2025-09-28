/**
 * ASB API Client
 * Centralized API client for all backend communications
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

// Types
export interface SearchOptions {
  mode?: 'vector' | 'keyword' | 'hybrid';
  topK?: number;
  threshold?: number;
  useGraph?: boolean;
  filters?: Record<string, any>;
}

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  source: string;
  sourceId?: string;
  metadata?: Record<string, any>;
  highlights?: string[];
  chunkIndex?: number;
  totalChunks?: number;
}

export interface EmbeddingResult {
  embedding: number[];
  dimension: number;
  model: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'entity' | 'document' | 'concept' | 'person' | 'organization' | 'location';
  position?: { x: number; y: number; z?: number };
  metadata?: Record<string, any>;
  connections?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  weight?: number;
  type?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats?: {
    totalNodes: number;
    totalEdges: number;
    clusters?: number;
  };
}

export interface Entity {
  id: string;
  name: string;
  type: string;
  count: number;
  metadata?: Record<string, any>;
  relatedEntities?: string[];
  documents?: string[];
}

export interface MetricsData {
  documents: number;
  entities: number;
  relationships: number;
  queries: number;
  avgResponseTime?: number;
  cacheHitRate?: number;
  activeWorkflows?: number;
}

export interface SystemStatus {
  postgres: 'connected' | 'disconnected' | 'error';
  redis: 'connected' | 'disconnected' | 'error';
  lightrag: 'active' | 'inactive' | 'error';
  openai: 'active' | 'inactive' | 'error';
}

// API Client Class
export class ASBApiClient {
  private api: AxiosInstance;
  private baseURL: string;

  constructor(baseURL = '') {
    this.baseURL = baseURL || process.env.NEXT_PUBLIC_API_URL || '';
    
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor
    this.api.interceptors.request.use(
      (config) => {
        // Add auth token if available
        const token = localStorage.getItem('asb_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.api.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Handle unauthorized
          localStorage.removeItem('asb_token');
          window.location.href = '/login';
        }
        return Promise.reject(this.handleError(error));
      }
    );
  }

  // RAG Operations
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    try {
      const response = await this.api.post('/api/rag/search', {
        query,
        ...options,
      });
      return response.data.results || [];
    } catch (error) {
      console.error('Search failed:', error);
      throw error;
    }
  }

  async embed(text: string, model = 'text-embedding-3-small'): Promise<EmbeddingResult> {
    try {
      const response = await this.api.post('/api/rag/embed', {
        text,
        model,
      });
      return response.data;
    } catch (error) {
      console.error('Embedding generation failed:', error);
      throw error;
    }
  }

  async getSuggestions(query: string, limit = 5): Promise<string[]> {
    try {
      const response = await this.api.get('/api/rag/suggestions', {
        params: { query, limit },
      });
      return response.data.suggestions || [];
    } catch (error) {
      console.error('Failed to get suggestions:', error);
      return [];
    }
  }

  async getQueryHistory(limit = 10): Promise<any[]> {
    try {
      const response = await this.api.get('/api/rag/history', {
        params: { limit },
      });
      return response.data.history || [];
    } catch (error) {
      console.error('Failed to get query history:', error);
      return [];
    }
  }

  // Graph Operations
  async getGraphData(filters?: any): Promise<GraphData> {
    try {
      const response = await this.api.get('/api/graph/data', {
        params: filters,
      });
      return response.data;
    } catch (error) {
      console.error('Failed to get graph data:', error);
      throw error;
    }
  }

  async getNodeDetails(nodeId: string): Promise<GraphNode> {
    try {
      const response = await this.api.get(`/api/graph/nodes/${nodeId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get node details:', error);
      throw error;
    }
  }

  async getRelatedNodes(nodeId: string, depth = 1): Promise<GraphData> {
    try {
      const response = await this.api.get(`/api/graph/nodes/${nodeId}/related`, {
        params: { depth },
      });
      return response.data;
    } catch (error) {
      console.error('Failed to get related nodes:', error);
      throw error;
    }
  }

  // Entity Operations
  async getEntities(filters?: any): Promise<Entity[]> {
    try {
      const response = await this.api.get('/api/entities', {
        params: filters,
      });
      return response.data.entities || [];
    } catch (error) {
      console.error('Failed to get entities:', error);
      throw error;
    }
  }

  async getEntityDetails(entityId: string): Promise<Entity> {
    try {
      const response = await this.api.get(`/api/entities/${entityId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get entity details:', error);
      throw error;
    }
  }

  async updateEntity(entityId: string, updates: Partial<Entity>): Promise<Entity> {
    try {
      const response = await this.api.patch(`/api/entities/${entityId}`, updates);
      return response.data;
    } catch (error) {
      console.error('Failed to update entity:', error);
      throw error;
    }
  }

  async deleteEntity(entityId: string): Promise<void> {
    try {
      await this.api.delete(`/api/entities/${entityId}`);
    } catch (error) {
      console.error('Failed to delete entity:', error);
      throw error;
    }
  }

  // Monitoring Operations
  async getMetrics(): Promise<MetricsData> {
    try {
      const response = await this.api.get('/api/monitoring/metrics');
      return response.data;
    } catch (error) {
      console.error('Failed to get metrics:', error);
      throw error;
    }
  }

  async getSystemStatus(): Promise<SystemStatus> {
    try {
      const response = await this.api.get('/api/monitoring/status');
      return response.data;
    } catch (error) {
      console.error('Failed to get system status:', error);
      throw error;
    }
  }

  async getQueryPerformance(timeRange = '24h'): Promise<any> {
    try {
      const response = await this.api.get('/api/monitoring/performance', {
        params: { timeRange },
      });
      return response.data;
    } catch (error) {
      console.error('Failed to get performance data:', error);
      throw error;
    }
  }

  async getWorkflowStatus(): Promise<any[]> {
    try {
      const response = await this.api.get('/api/monitoring/workflows');
      return response.data.workflows || [];
    } catch (error) {
      console.error('Failed to get workflow status:', error);
      return [];
    }
  }

  // LightRAG Operations
  async queryLightRAG(question: string, mode: 'naive' | 'local' | 'global' | 'hybrid' = 'hybrid'): Promise<any> {
    try {
      const response = await this.api.post('/api/lightrag/query', {
        question,
        mode,
      });
      return response.data;
    } catch (error) {
      console.error('LightRAG query failed:', error);
      throw error;
    }
  }

  async insertDocument(content: string, metadata?: Record<string, any>): Promise<any> {
    try {
      const response = await this.api.post('/api/lightrag/insert', {
        content,
        metadata,
      });
      return response.data;
    } catch (error) {
      console.error('Document insertion failed:', error);
      throw error;
    }
  }

  // Utility Methods
  private handleError(error: AxiosError): Error {
    if (error.response) {
      // Server responded with error
      const message = (error.response.data as any)?.message || error.message;
      const err = new Error(message);
      (err as any).status = error.response.status;
      (err as any).data = error.response.data;
      return err;
    } else if (error.request) {
      // No response received
      return new Error('No response from server. Please check your connection.');
    } else {
      // Request setup error
      return new Error(error.message || 'An unexpected error occurred');
    }
  }

  // Batch Operations
  async batchSearch(queries: string[], options: SearchOptions = {}): Promise<SearchResult[][]> {
    try {
      const response = await this.api.post('/api/rag/batch-search', {
        queries,
        ...options,
      });
      return response.data.results || [];
    } catch (error) {
      console.error('Batch search failed:', error);
      throw error;
    }
  }

  async batchEmbed(texts: string[], model = 'text-embedding-3-small'): Promise<EmbeddingResult[]> {
    try {
      const response = await this.api.post('/api/rag/batch-embed', {
        texts,
        model,
      });
      return response.data.embeddings || [];
    } catch (error) {
      console.error('Batch embedding failed:', error);
      throw error;
    }
  }

  // Export/Import Operations
  async exportData(format: 'json' | 'csv' = 'json'): Promise<Blob> {
    try {
      const response = await this.api.get('/api/export', {
        params: { format },
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      console.error('Export failed:', error);
      throw error;
    }
  }

  async importData(file: File, format: 'json' | 'csv' = 'json'): Promise<any> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('format', format);

      const response = await this.api.post('/api/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      console.error('Import failed:', error);
      throw error;
    }
  }
}

// Singleton instance
let apiClient: ASBApiClient;

export function getApiClient(): ASBApiClient {
  if (!apiClient) {
    apiClient = new ASBApiClient();
  }
  return apiClient;
}

// Export default instance
export default getApiClient();