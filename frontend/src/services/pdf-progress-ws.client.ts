/**
 * PDF Progress WebSocket Client
 * Connects to backend for real-time progress updates
 */

import { io, Socket } from 'socket.io-client';

export interface ProgressUpdate {
  jobId: string;
  type: 'ocr' | 'metadata' | 'transform' | 'batch-metadata-transform';
  status: 'processing' | 'completed' | 'error';
  current?: number;
  total?: number;
  percentage?: number;
  currentFile?: string;
  message?: string;
  currentDocument?: string;
  timestamp: string;
}

class PDFProgressWSClient {
  private socket: Socket | null = null;
  private subscribers: Map<string, (update: ProgressUpdate) => void> = new Map();

  connect(): void {
    if (this.socket?.connected) {
      return;
    }

    const token = localStorage.getItem('authToken');
    const cookies = document.cookie.split(';').reduce((acc: any, cookie) => {
      const [key, value] = cookie.trim().split('=');
      if (key) acc[key] = value;
      return acc;
    }, {});

    this.socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8086', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: {
        token,
        cookies
      },
      extraHeaders: {
        Cookie: document.cookie
      },
      credentials: 'include'
    });

    this.socket.on('connect', () => {
      console.log('[PDF Progress WS] Connected to server');
    });

    this.socket.on('disconnect', () => {
      console.log('[PDF Progress WS] Disconnected from server');
    });

    this.socket.on('progress-update', (update: ProgressUpdate) => {
      console.log('[PDF Progress WS] Received update:', update);
      const subscriber = this.subscribers.get(update.jobId);
      if (subscriber) {
        subscriber(update);
      }
    });

    this.socket.on('error', (error) => {
      console.error('[PDF Progress WS] Socket error:', error);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.subscribers.clear();
  }

  subscribeToJob(jobId: string, callback: (update: ProgressUpdate) => void): void {
    if (!this.socket?.connected) {
      this.connect();
    }

    this.subscribers.set(jobId, callback);

    if (this.socket) {
      this.socket.emit('subscribe-job', jobId);
    }
  }

  unsubscribeFromJob(jobId: string): void {
    this.subscribers.delete(jobId);
    if (this.socket) {
      this.socket.emit('unsubscribe-job', jobId);
    }
  }
}

// Singleton instance
const pdfProgressWSClient = new PDFProgressWSClient();

export default pdfProgressWSClient;