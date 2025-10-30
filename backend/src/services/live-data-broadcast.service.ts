import { WebSocketConnectionService } from './websocket-connection.service';

export class LiveDataBroadcastService {
  private static instance: LiveDataBroadcastService;
  private wsService: WebSocketConnectionService;

  private constructor(wsService: WebSocketConnectionService) {
    this.wsService = wsService;
  }

  static getInstance(wsService: WebSocketConnectionService): LiveDataBroadcastService {
    if (!LiveDataBroadcastService.instance) {
      LiveDataBroadcastService.instance = new LiveDataBroadcastService(wsService);
    }
    return LiveDataBroadcastService.instance;
  }

  // Dashboard metrics updates
  broadcastDashboardMetrics(metrics: {
    totalDocuments: number;
    totalScrapedItems: number;
    activeUsers: number;
    systemHealth: 'healthy' | 'warning' | 'error';
    lastUpdated: string;
  }) {
    this.wsService.getIO().emit('dashboard:metrics:update', metrics);
  }

  // Document upload progress
  broadcastDocumentUploadProgress(data: {
    documentId: string;
    filename: string;
    progress: number;
    status: 'uploading' | 'processing' | 'completed' | 'error';
    error?: string;
  }) {
    this.wsService.getIO().emit('document:upload:progress', data);
  }

  // Document processing status
  broadcastDocumentProcessingStatus(data: {
    documentId: string;
    status: 'processing' | 'completed' | 'error';
    pagesProcessed?: number;
    totalPages?: number;
    extractedText?: string;
    error?: string;
  }) {
    this.wsService.getIO().emit('document:processing:status', data);
  }

  // Document embedding update
  broadcastDocumentEmbeddingUpdate(data: {
    documentId: string;
    embeddingJobId: string;
    status: 'processing' | 'completed' | 'error';
    progress: number;
    chunksProcessed?: number;
    totalChunks?: number;
    error?: string;
  }) {
    this.wsService.getIO().emit('document:embedding:update', data);
  }

  // Document list update
  broadcastDocumentListUpdate(data: {
    action: 'added' | 'updated' | 'deleted';
    document: any;
  }) {
    this.wsService.getIO().emit('document:list:update', data);
  }

  // Scraper job status
  broadcastScraperJobStatus(data: {
    jobId: string;
    url: string;
    status: 'queued' | 'running' | 'completed' | 'failed' | 'paused';
    progress?: number;
    itemsScraped?: number;
    error?: string;
  }) {
    this.wsService.getIO().emit('scraper:job:status', data);
  }

  // Scraper job progress
  broadcastScraperJobProgress(data: {
    jobId: string;
    progress: number;
    itemsScraped: number;
    totalItems?: number;
    currentItem?: {
      title: string;
      url: string;
    };
  }) {
    this.wsService.getIO().emit('scraper:job:progress', data);
  }

  // Scraper job completion
  broadcastScraperJobComplete(data: {
    jobId: string;
    url: string;
    status: 'completed' | 'failed';
    itemsScraped: number;
    totalItems?: number;
    duration: number;
    error?: string;
  }) {
    this.wsService.getIO().emit('scraper:job:complete', data);
  }

  // Scraper list update
  broadcastScraperListUpdate(data: {
    action: 'added' | 'updated' | 'deleted';
    job: any;
  }) {
    this.wsService.getIO().emit('scraper:list:update', data);
  }

  // Embedding job status
  broadcastEmbeddingJobStatus(data: {
    jobId: string;
    sourceType: 'document' | 'scraper' | 'manual';
    status: 'queued' | 'processing' | 'completed' | 'failed';
    progress: number;
    itemsProcessed?: number;
    totalItems?: number;
    error?: string;
  }) {
    this.wsService.getIO().emit('embedding:job:status', data);
  }

  // Embedding job progress
  broadcastEmbeddingJobProgress(data: {
    jobId: string;
    progress: number;
    itemsProcessed: number;
    totalItems: number;
    currentBatch?: {
      size: number;
      processed: number;
    };
    estimatedTimeRemaining?: number;
  }) {
    this.wsService.getIO().emit('embedding:job:progress', data);
  }

  // Embedding metrics update
  broadcastEmbeddingMetricsUpdate(data: {
    totalEmbeddings: number;
    processingQueue: number;
    averageProcessingTime: number;
    successRate: number;
    lastUpdated: string;
  }) {
    this.wsService.getIO().emit('embedding:metrics:update', data);
  }

  // Message streaming
  broadcastMessageStream(data: {
    sessionId: string;
    messageId: string;
    content: string;
    type: 'question' | 'answer';
    isComplete: boolean;
    metadata?: any;
  }) {
    this.wsService.getIO().to(`session:${data.sessionId}`).emit('message:stream', data);
  }

  // Typing status
  broadcastTypingStatus(data: {
    sessionId: string;
    userId: string;
    isTyping: boolean;
  }) {
    this.wsService.getIO().to(`session:${data.sessionId}`).emit('typing:status', data);
  }

  // Conversation update
  broadcastConversationUpdate(data: {
    sessionId: string;
    conversation: any;
    action: 'created' | 'updated' | 'deleted';
  }) {
    this.wsService.getIO().to(`session:${data.sessionId}`).emit('conversation:update', data);
  }

  // System health update
  broadcastSystemHealthUpdate(data: {
    status: 'healthy' | 'warning' | 'error';
    cpu: number;
    memory: number;
    disk: number;
    database: 'connected' | 'disconnected';
    lastCheck: string;
  }) {
    this.wsService.getIO().emit('system:health:update', data);
  }

  // Performance metrics
  broadcastPerformanceMetrics(data: {
    responseTime: number;
    throughput: number;
    activeConnections: number;
    errorRate: number;
    timestamp: string;
  }) {
    this.wsService.getIO().emit('system:performance:metrics', data);
  }

  // Settings changed
  broadcastSettingsChanged(data: {
    category: string;
    key: string;
    oldValue: any;
    newValue: any;
    changedBy: string;
    timestamp: string;
  }) {
    this.wsService.getIO().emit('settings:changed', data);
  }

  // Configuration update
  broadcastConfigurationUpdate(data: {
    category: string;
    settings: any;
    updatedBy: string;
    timestamp: string;
  }) {
    this.wsService.getIO().emit('configuration:update', data);
  }

  // Crawler data item added
  broadcastCrawlerItemAdded(data: {
    directoryName: string;
    item: any;
    totalItems: number;
    timestamp: string;
  }) {
    this.wsService.getIO().emit('crawler:item:added', data);
  }

  // Crawler script status
  broadcastCrawlerScriptStatus(data: {
    directoryName: string;
    jobId: string;
    status: 'starting' | 'running' | 'completed' | 'failed';
    url?: string;
    itemsCount?: number;
    error?: string;
    timestamp: string;
  }) {
    this.wsService.getIO().emit('crawler:script:status', data);
  }

  // Generic broadcast method
  broadcast(event: string, data: any, targetRoom?: string) {
    if (targetRoom) {
      this.wsService.getIO().to(targetRoom).emit(event, data);
    } else {
      this.wsService.getIO().emit(event, data);
    }
  }

  // Get the Socket.IO instance directly for custom events
  getIO() {
    return this.wsService.getIO();
  }
}

// Extend WebSocketConnectionService to add getIO method
declare module './websocket-connection.service' {
  interface WebSocketConnectionService {
    getIO(): any;
  }
}