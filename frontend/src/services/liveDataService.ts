'use client';

import React, { useCallback } from 'react';
import { useSocketIO } from '@/hooks/useSocketIO';
import { useAuth } from '@/hooks/useAuth';
import { WEBSOCKET_CONFIG } from '@/lib/config/websocket';

// Live data service for real-time updates across all pages
export class LiveDataService {
  private static instance: LiveDataService;
  private subscribers: Map<string, Set<(data: any) => void>> = new Map();
  private socket: any = null;
  private token: string | null = null;

  private constructor() {}

  static getInstance(): LiveDataService {
    if (!LiveDataService.instance) {
      LiveDataService.instance = new LiveDataService();
    }
    return LiveDataService.instance;
  }

  // Initialize with authentication token
  initialize(token: string) {
    this.token = token;

    // Initialize Socket.IO connection
    const wsUrl = process.env.NODE_ENV === 'production'
      ? process.env.NEXT_PUBLIC_WS_URL || `ws://localhost:8083`
      : `ws://localhost:8083`;

    // Use existing useSocketIO hook logic
    const { socket } = useSocketIO(wsUrl, {
      enableLogs: process.env.NODE_ENV === 'development',
      onMessage: (data) => {
        this.handleIncomingMessage(data);
      }
    });

    this.socket = socket;
  }

  // Handle incoming WebSocket messages
  private handleIncomingMessage(data: any) {
    const { type, payload } = data;

    // Notify all subscribers for this event type
    const subscribers = this.subscribers.get(type);
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(payload);
        } catch (error) {
          console.error(`Error in subscriber callback for ${type}:`, error);
        }
      });
    }
  }

  // Subscribe to specific live data events
  subscribe(eventType: string, callback: (data: any) => void) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }

    this.subscribers.get(eventType)!.add(callback);

    // Return unsubscribe function
    return () => {
      const subscribers = this.subscribers.get(eventType);
      if (subscribers) {
        subscribers.delete(callback);
        if (subscribers.size === 0) {
          this.subscribers.delete(eventType);
        }
      }
    };
  }

  // Subscribe to dashboard metrics updates
  subscribeToDashboardMetrics(callback: (data: any) => void) {
    return this.subscribe(WEBSOCKET_CONFIG.EVENTS.DASHBOARD_METRICS_UPDATE, callback);
  }

  // Subscribe to document upload progress
  subscribeToDocumentUploadProgress(callback: (data: any) => void) {
    return this.subscribe(WEBSOCKET_CONFIG.EVENTS.DOCUMENT_UPLOAD_PROGRESS, callback);
  }

  // Subscribe to document processing status
  subscribeToDocumentProcessingStatus(callback: (data: any) => void) {
    return this.subscribe(WEBSOCKET_CONFIG.EVENTS.DOCUMENT_PROCESSING_STATUS, callback);
  }

  // Subscribe to document embedding updates
  subscribeToDocumentEmbeddingUpdates(callback: (data: any) => void) {
    return this.subscribe(WEBSOCKET_CONFIG.EVENTS.DOCUMENT_EMBEDDING_UPDATE, callback);
  }

  // Subscribe to document list updates
  subscribeToDocumentListUpdates(callback: (data: any) => void) {
    return this.subscribe(WEBSOCKET_CONFIG.EVENTS.DOCUMENT_LIST_UPDATE, callback);
  }

  // Subscribe to scraper job status
  subscribeToScraperJobStatus(callback: (data: any) => void) {
    return this.subscribe(WEBSOCKET_CONFIG.EVENTS.SCRAPER_JOB_STATUS, callback);
  }

  // Subscribe to scraper job progress
  subscribeToScraperJobProgress(callback: (data: any) => void) {
    return this.subscribe(WEBSOCKET_CONFIG.EVENTS.SCRAPER_JOB_PROGRESS, callback);
  }

  // Subscribe to scraper job completion
  subscribeToScraperJobCompletion(callback: (data: any) => void) {
    return this.subscribe(WEBSOCKET_CONFIG.EVENTS.SCRAPER_JOB_COMPLETE, callback);
  }

  // Subscribe to scraper list updates
  subscribeToScraperListUpdates(callback: (data: any) => void) {
    return this.subscribe(WEBSOCKET_CONFIG.EVENTS.SCRAPER_LIST_UPDATE, callback);
  }

  // Subscribe to embedding job status
  subscribeToEmbeddingJobStatus(callback: (data: any) => void) {
    return this.subscribe(WEBSOCKET_CONFIG.EVENTS.EMBEDDING_JOB_STATUS, callback);
  }

  // Subscribe to embedding job progress
  subscribeToEmbeddingJobProgress(callback: (data: any) => void) {
    return this.subscribe(WEBSOCKET_CONFIG.EVENTS.EMBEDDING_JOB_PROGRESS, callback);
  }

  // Subscribe to embedding metrics updates
  subscribeToEmbeddingMetricsUpdates(callback: (data: any) => void) {
    return this.subscribe(WEBSOCKET_CONFIG.EVENTS.EMBEDDING_METRICS_UPDATE, callback);
  }

  // Subscribe to message streaming
  subscribeToMessageStreaming(callback: (data: any) => void) {
    return this.subscribe(WEBSOCKET_CONFIG.EVENTS.MESSAGE_STREAM, callback);
  }

  // Subscribe to typing status
  subscribeToTypingStatus(callback: (data: any) => void) {
    return this.subscribe(WEBSOCKET_CONFIG.EVENTS.TYPING_STATUS, callback);
  }

  // Subscribe to conversation updates
  subscribeToConversationUpdates(callback: (data: any) => void) {
    return this.subscribe(WEBSOCKET_CONFIG.EVENTS.CONVERSATION_UPDATE, callback);
  }

  // Subscribe to system health updates
  subscribeToSystemHealthUpdates(callback: (data: any) => void) {
    return this.subscribe(WEBSOCKET_CONFIG.EVENTS.SYSTEM_HEALTH_UPDATE, callback);
  }

  // Subscribe to performance metrics
  subscribeToPerformanceMetrics(callback: (data: any) => void) {
    return this.subscribe(WEBSOCKET_CONFIG.EVENTS.PERFORMANCE_METRICS, callback);
  }

  // Subscribe to settings changes
  subscribeToSettingsChanges(callback: (data: any) => void) {
    return this.subscribe(WEBSOCKET_CONFIG.EVENTS.SETTINGS_CHANGED, callback);
  }

  // Emit events to server
  emit(eventType: string, data: any) {
    if (this.socket && this.socket.isConnected) {
      this.socket.sendMessage({
        type: eventType,
        payload: data
      });
    }
  }

  // Join a room for targeted updates
  joinRoom(roomId: string) {
    this.emit('join:room', { roomId });
  }

  // Leave a room
  leaveRoom(roomId: string) {
    this.emit('leave:room', { roomId });
  }

  // Disconnect from live data service
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.subscribers.clear();
    this.token = null;
  }

  // Get connection status
  isConnected(): boolean {
    return this.socket?.isConnected || false;
  }

  // Get current subscribers count
  getSubscribersCount(): number {
    let count = 0;
    this.subscribers.forEach(subscribers => {
      count += subscribers.size;
    });
    return count;
  }
}

// Export singleton instance
export const liveDataService = LiveDataService.getInstance();

// React hook for using live data service
export function useLiveData() {
  const { token } = useAuth();

  // Initialize service with token
  const initializeService = useCallback(() => {
    if (token) {
      liveDataService.initialize(token);
    }
  }, [token]);

  // Auto-initialize when token changes
  React.useEffect(() => {
    initializeService();
  }, [initializeService]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      // Don't disconnect here as other components might still be using it
    };
  }, []);

  return {
    subscribe: liveDataService.subscribe.bind(liveDataService),
    subscribeToDashboardMetrics: liveDataService.subscribeToDashboardMetrics.bind(liveDataService),
    subscribeToDocumentUploadProgress: liveDataService.subscribeToDocumentUploadProgress.bind(liveDataService),
    subscribeToDocumentProcessingStatus: liveDataService.subscribeToDocumentProcessingStatus.bind(liveDataService),
    subscribeToDocumentEmbeddingUpdates: liveDataService.subscribeToDocumentEmbeddingUpdates.bind(liveDataService),
    subscribeToDocumentListUpdates: liveDataService.subscribeToDocumentListUpdates.bind(liveDataService),
    subscribeToScraperJobStatus: liveDataService.subscribeToScraperJobStatus.bind(liveDataService),
    subscribeToScraperJobProgress: liveDataService.subscribeToScraperJobProgress.bind(liveDataService),
    subscribeToScraperJobCompletion: liveDataService.subscribeToScraperJobCompletion.bind(liveDataService),
    subscribeToScraperListUpdates: liveDataService.subscribeToScraperListUpdates.bind(liveDataService),
    subscribeToEmbeddingJobStatus: liveDataService.subscribeToEmbeddingJobStatus.bind(liveDataService),
    subscribeToEmbeddingJobProgress: liveDataService.subscribeToEmbeddingJobProgress.bind(liveDataService),
    subscribeToEmbeddingMetricsUpdates: liveDataService.subscribeToEmbeddingMetricsUpdates.bind(liveDataService),
    subscribeToMessageStreaming: liveDataService.subscribeToMessageStreaming.bind(liveDataService),
    subscribeToTypingStatus: liveDataService.subscribeToTypingStatus.bind(liveDataService),
    subscribeToConversationUpdates: liveDataService.subscribeToConversationUpdates.bind(liveDataService),
    subscribeToSystemHealthUpdates: liveDataService.subscribeToSystemHealthUpdates.bind(liveDataService),
    subscribeToPerformanceMetrics: liveDataService.subscribeToPerformanceMetrics.bind(liveDataService),
    subscribeToSettingsChanges: liveDataService.subscribeToSettingsChanges.bind(liveDataService),
    emit: liveDataService.emit.bind(liveDataService),
    joinRoom: liveDataService.joinRoom.bind(liveDataService),
    leaveRoom: liveDataService.leaveRoom.bind(liveDataService),
    isConnected: liveDataService.isConnected(),
    disconnect: liveDataService.disconnect.bind(liveDataService)
  };
}