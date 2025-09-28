import apiClient from '../client';

export interface DashboardStats {
  totalMemories: number;
  totalSearches: number;
  avgResponseTime: number;
  successRate: number;
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  type: 'search' | 'memory' | 'chat';
  query?: string;
  timestamp: string;
  duration?: number;
  status: 'success' | 'error';
}

class DashboardService {
  async getStats(): Promise<DashboardStats> {
    const response = await apiClient.get<DashboardStats>('/api/v2/dashboard');
    return response.data;
  }

  async getRecentActivity(limit: number = 10): Promise<ActivityItem[]> {
    const response = await apiClient.get<ActivityItem[]>('/api/v2/dashboard/activity', {
      params: { limit }
    });
    return response.data;
  }

  async getMetrics(startDate: Date, endDate: Date) {
    const response = await apiClient.get('/api/v2/dashboard/metrics', {
      params: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      }
    });
    return response.data;
  }
}

export default new DashboardService();