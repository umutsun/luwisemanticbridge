import { NextResponse } from 'next/server';

// TypeScript interfaces for dashboard data
interface DatabaseStatus {
  documents: number;
  conversations: number;
  messages: number;
  size: string;
  status: 'connected' | 'disconnected' | 'error';
}

interface RedisStatus {
  connected: boolean;
  used_memory: string;
  total_commands_processed: number;
  status: 'connected' | 'disconnected' | 'error';
}

interface LightRagStatus {
  initialized: boolean;
  documentCount: number;
  vectorStoreSize: number;
  lastUpdate: string;
  provider: 'openai' | 'offline' | 'other';
  status: 'running' | 'stopped' | 'error';
}

interface ServiceStatus {
  lightrag: boolean;
  embedder: boolean;
  fastapi: boolean;
  streamlit: boolean;
}

interface ActivityItem {
  id: string;
  type: 'system' | 'user' | 'document' | 'chat';
  action: string;
  target: string;
  status: 'success' | 'error' | 'warning' | 'info';
  message: string;
  timestamp: string;
  details?: string;
}

interface DashboardData {
  database: DatabaseStatus;
  redis: RedisStatus;
  lightrag: LightRagStatus;
  services: ServiceStatus;
  recentActivity: ActivityItem[];
  timestamp: string;
  error?: string;
  status: 'success' | 'warning' | 'error';
  message?: string;
}

const ASB_API_URL = process.env.ASB_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';

// Simple in-memory cache
let cache: { data: DashboardData; timestamp: number } | null = null;
const CACHE_TTL = 30000; // 30 seconds

export async function GET() {
  // Override backend API response with real data
  const maxRetries = 3;
  let lastError: Error | unknown;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Check cache first (only on first attempt)
      if (attempt === 1 && cache && Date.now() - cache.timestamp < CACHE_TTL) {
        return NextResponse.json(cache.data);
      }

      // Add delay for retries (exponential backoff)
      if (attempt > 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
        console.log(`Retry attempt ${attempt}/${maxRetries} for dashboard API`);
      }

      // Create an AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // Increased to 10 second timeout

      const response = await fetch(`${ASB_API_URL}/api/dashboard`, {
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Log more details about the error
        const errorText = await response.text().catch(() => 'No error details');
        console.error(`Backend error - Status: ${response.status}, Details: ${errorText}`);
        throw new Error(`Backend responded with status: ${response.status}`);
      }

      const data = await response.json();
      
      // Update cache
      cache = { data, timestamp: Date.now() };
      
      return NextResponse.json(data);
    } catch (error: unknown) {
      lastError = error;
      if (attempt === maxRetries) {
        console.error('Dashboard API error after all retries:', error);
      }
    }

  // Log the final error if needed
  if (lastError) {
    console.warn('Final error:', lastError);
  }
  }
  
  // All retries failed - return cached or fallback data
  if (cache) {
    console.log('Returning stale cache due to error');
    return NextResponse.json(cache.data);
  }
  
  // Return real empty data when backend is not available
  const fallbackData = {
      database: {
        documents: 0,
        conversations: 0,
        messages: 0,
        size: '0 MB',
        status: 'disconnected'
      },
      redis: {
        connected: false,
        used_memory: '0 B',
        total_commands_processed: 0,
        status: 'disconnected'
      },
      lightrag: {
        initialized: false,
        documentCount: 0,
        vectorStoreSize: 0,
        lastUpdate: new Date().toISOString(),
        provider: 'offline',
        status: 'stopped'
      },
      services: {
        lightrag: false,
        embedder: false,
        fastapi: true, // Frontend is running
        streamlit: false
      },
      recentActivity: [
        {
          id: 'system-1',
          type: 'system',
          action: 'System Check',
          target: 'Services',
          status: 'warning',
          message: 'Backend services are not running',
          timestamp: new Date().toISOString(),
          details: 'Please start the backend services to view real data'
        }
      ],
      timestamp: new Date().toISOString(),
      error: 'Backend service is unavailable. Please start the backend services.',
      status: 'warning',
      message: 'Dashboard is running in offline mode. Some features may not be available.'
    };
    
    return NextResponse.json(fallbackData);
}