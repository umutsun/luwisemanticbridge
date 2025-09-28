/**
 * WebSocket Connection Manager
 * Real-time updates and event handling
 */

import { io, Socket } from 'socket.io-client';
import { create } from 'zustand';

// Event Types
export interface WebSocketEvent {
  type: string;
  payload: any;
  timestamp: string;
}

export interface QueryResultEvent {
  queryId: string;
  results: any[];
  duration: number;
}

export interface GraphUpdateEvent {
  action: 'add' | 'update' | 'delete';
  nodes?: any[];
  edges?: any[];
}

export interface MetricsUpdateEvent {
  documents?: number;
  entities?: number;
  relationships?: number;
  queries?: number;
  performance?: any;
}

export interface SystemStatusEvent {
  service: string;
  status: 'connected' | 'disconnected' | 'error';
  message?: string;
}

// WebSocket Store
interface WebSocketStore {
  socket: Socket | null;
  connected: boolean;
  connectionError: string | null;
  events: WebSocketEvent[];
  subscriptions: Map<string, Set<(data: any) => void>>;
  
  // Actions
  connect: () => void;
  disconnect: () => void;
  emit: (event: string, data: any) => void;
  subscribe: (event: string, callback: (data: any) => void) => () => void;
  unsubscribe: (event: string, callback: (data: any) => void) => void;
  clearEvents: () => void;
}

export const useWebSocketStore = create<WebSocketStore>((set, get) => ({
  socket: null,
  connected: false,
  connectionError: null,
  events: [],
  subscriptions: new Map(),

  connect: () => {
    const state = get();
    if (state.socket?.connected) {
      console.log('WebSocket already connected');
      return;
    }

    const socketUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3002';
    const socket = io(socketUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling'],
    });

    // Connection events
    socket.on('connect', () => {
      console.log('WebSocket connected:', socket.id);
      set({ connected: true, connectionError: null });
      
      // Subscribe to default channels
      socket.emit('subscribe', 'asb:events');
      socket.emit('subscribe', 'asb:notifications');
      socket.emit('subscribe', 'asb:frontend:sync');
    });

    socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      set({ connected: false });
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error.message);
      set({ connectionError: error.message });
    });

    // Event handlers
    socket.on('query:result', (data: QueryResultEvent) => {
      const callbacks = get().subscriptions.get('query:result');
      callbacks?.forEach(cb => cb(data));
      
      set(state => ({
        events: [...state.events, {
          type: 'query:result',
          payload: data,
          timestamp: new Date().toISOString(),
        }].slice(-100), // Keep last 100 events
      }));
    });

    socket.on('graph:update', (data: GraphUpdateEvent) => {
      const callbacks = get().subscriptions.get('graph:update');
      callbacks?.forEach(cb => cb(data));
      
      set(state => ({
        events: [...state.events, {
          type: 'graph:update',
          payload: data,
          timestamp: new Date().toISOString(),
        }].slice(-100),
      }));
    });

    socket.on('entity:created', (data: any) => {
      const callbacks = get().subscriptions.get('entity:created');
      callbacks?.forEach(cb => cb(data));
    });

    socket.on('entity:updated', (data: any) => {
      const callbacks = get().subscriptions.get('entity:updated');
      callbacks?.forEach(cb => cb(data));
    });

    socket.on('entity:deleted', (data: any) => {
      const callbacks = get().subscriptions.get('entity:deleted');
      callbacks?.forEach(cb => cb(data));
    });

    socket.on('metrics:update', (data: MetricsUpdateEvent) => {
      const callbacks = get().subscriptions.get('metrics:update');
      callbacks?.forEach(cb => cb(data));
      
      set(state => ({
        events: [...state.events, {
          type: 'metrics:update',
          payload: data,
          timestamp: new Date().toISOString(),
        }].slice(-100),
      }));
    });

    socket.on('status:update', (data: SystemStatusEvent) => {
      const callbacks = get().subscriptions.get('status:update');
      callbacks?.forEach(cb => cb(data));
    });

    socket.on('workflow:status', (data: any) => {
      const callbacks = get().subscriptions.get('workflow:status');
      callbacks?.forEach(cb => cb(data));
    });

    socket.on('cache:invalidate', (data: any) => {
      const callbacks = get().subscriptions.get('cache:invalidate');
      callbacks?.forEach(cb => cb(data));
    });

    // Redis pub/sub events
    socket.on('redis:message', (channel: string, message: string) => {
      try {
        const data = JSON.parse(message);
        const callbacks = get().subscriptions.get(`redis:${channel}`);
        callbacks?.forEach(cb => cb(data));
      } catch (error) {
        console.error('Failed to parse Redis message:', error);
      }
    });

    // Error events
    socket.on('error', (error: any) => {
      console.error('WebSocket error:', error);
      const callbacks = get().subscriptions.get('error');
      callbacks?.forEach(cb => cb(error));
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, connected: false });
    }
  },

  emit: (event: string, data: any) => {
    const { socket, connected } = get();
    if (socket && connected) {
      socket.emit(event, data);
    } else {
      console.warn('Cannot emit event: WebSocket not connected');
    }
  },

  subscribe: (event: string, callback: (data: any) => void) => {
    const state = get();
    
    if (!state.subscriptions.has(event)) {
      state.subscriptions.set(event, new Set());
    }
    
    state.subscriptions.get(event)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      get().unsubscribe(event, callback);
    };
  },

  unsubscribe: (event: string, callback: (data: any) => void) => {
    const state = get();
    const callbacks = state.subscriptions.get(event);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        state.subscriptions.delete(event);
      }
    }
  },

  clearEvents: () => {
    set({ events: [] });
  },
}));

// Hooks for common subscriptions
export function useQueryResults(callback: (data: QueryResultEvent) => void) {
  const { subscribe } = useWebSocketStore();
  
  React.useEffect(() => {
    const unsubscribe = subscribe('query:result', callback);
    return unsubscribe;
  }, [callback]);
}

export function useGraphUpdates(callback: (data: GraphUpdateEvent) => void) {
  const { subscribe } = useWebSocketStore();
  
  React.useEffect(() => {
    const unsubscribe = subscribe('graph:update', callback);
    return unsubscribe;
  }, [callback]);
}

export function useMetricsUpdates(callback: (data: MetricsUpdateEvent) => void) {
  const { subscribe } = useWebSocketStore();
  
  React.useEffect(() => {
    const unsubscribe = subscribe('metrics:update', callback);
    return unsubscribe;
  }, [callback]);
}

export function useSystemStatus(callback: (data: SystemStatusEvent) => void) {
  const { subscribe } = useWebSocketStore();
  
  React.useEffect(() => {
    const unsubscribe = subscribe('status:update', callback);
    return unsubscribe;
  }, [callback]);
}

// Auto-connect on import (for Next.js)
if (typeof window !== 'undefined') {
  // Connect after a short delay to ensure DOM is ready
  setTimeout(() => {
    useWebSocketStore.getState().connect();
  }, 100);
}

// Singleton WebSocket manager class (alternative approach)
export class WebSocketManager {
  private static instance: WebSocketManager;
  private socket: Socket | null = null;
  private listeners: Map<string, Set<Function>> = new Map();

  private constructor() {}

  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  connect(url?: string): void {
    if (this.socket?.connected) return;

    const socketUrl = url || process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3002';
    this.socket = io(socketUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.emit('connected', { socketId: this.socket?.id });
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      this.emit('disconnected', {});
    });

    // Forward all events to listeners
    const events = [
      'query:result',
      'graph:update',
      'entity:created',
      'entity:updated',
      'entity:deleted',
      'metrics:update',
      'status:update',
      'workflow:status',
      'cache:invalidate',
      'error',
    ];

    events.forEach(event => {
      this.socket?.on(event, (data: any) => {
        this.emit(event, data);
      });
    });
  }

  on(event: string, callback: Function): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.off(event, callback);
    };
  }

  off(event: string, callback: Function): void {
    this.listeners.get(event)?.delete(callback);
  }

  emit(event: string, data: any): void {
    this.listeners.get(event)?.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in WebSocket listener for ${event}:`, error);
      }
    });
  }

  send(event: string, data: any): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('Cannot send: WebSocket not connected');
    }
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

// Export singleton instance
export const wsManager = WebSocketManager.getInstance();

// React hook for WebSocket manager
export function useWebSocket() {
  const [connected, setConnected] = React.useState(false);

  React.useEffect(() => {
    wsManager.connect();
    
    const unsubConnect = wsManager.on('connected', () => setConnected(true));
    const unsubDisconnect = wsManager.on('disconnected', () => setConnected(false));

    setConnected(wsManager.isConnected());

    return () => {
      unsubConnect();
      unsubDisconnect();
    };
  }, []);

  return {
    connected,
    on: wsManager.on.bind(wsManager),
    send: wsManager.send.bind(wsManager),
    disconnect: wsManager.disconnect.bind(wsManager),
  };
}

import React from 'react';