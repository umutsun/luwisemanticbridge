import { authenticatedFetch } from './client';

export interface UserStats {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin' | 'premium';
  status: 'active' | 'inactive' | 'suspended';
  email_verified: boolean;
  created_at: string;
  updated_at: string;
  last_login?: string;
  token_usage?: {
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
    monthly_limit: number;
    usage_percentage: number;
    remaining_tokens: number;
    current_month_queries: number;
  };
  subscription?: {
    id: string | null;
    plan_id: string | null;
    plan_name: string | null;
    status: string | null;
    start_date: string | null;
    end_date: string | null;
    monthly_limit: number | null;
    features: string[];
    created_at: string | null;
  };
  message_stats?: {
    total_messages: number;
    total_sessions: number;
    avg_messages_per_session: number;
    total_question_tokens: number;
    total_answer_tokens: number;
    last_activity?: string;
  };
}

interface ApiResponse {
  users: UserStats[];
}

export const usersApi = {
  /**
   * Fetch all users with their usage statistics
   * Requires admin authentication
   */
  fetchUsersWithUsage: async (): Promise<ApiResponse> => {
    try {
      const response = await authenticatedFetch('/api/v2/users/with-usage', {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching users with usage:', error);
      throw error;
    }
  },

  /**
   * Update user subscription
   * Requires admin authentication
   */
  updateUserSubscription: async (userId: string, planId: string): Promise<any> => {
    try {
      const response = await authenticatedFetch(`/api/v2/users/${userId}/subscription`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ planId }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating user subscription:', error);
      throw error;
    }
  },

  /**
   * Update user role
   * Requires admin authentication
   */
  updateUserRole: async (userId: string, role: string): Promise<any> => {
    try {
      const response = await authenticatedFetch(`/api/v2/users/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating user role:', error);
      throw error;
    }
  },

  /**
   * Update user status
   * Requires admin authentication
   */
  updateUserStatus: async (userId: string, status: string): Promise<any> => {
    try {
      const response = await authenticatedFetch(`/api/v2/users/${userId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating user status:', error);
      throw error;
    }
  },

  /**
   * Delete user
   * Requires admin authentication
   */
  deleteUser: async (userId: string): Promise<any> => {
    try {
      const response = await authenticatedFetch(`/api/v2/users/${userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  },

  /**
   * Create new user
   * Requires admin authentication
   */
  createUser: async (userData: {
    email: string;
    name: string;
    password: string;
    role?: 'user' | 'admin' | 'premium';
    company?: string;
  }): Promise<any> => {
    try {
      const response = await authenticatedFetch('/api/v2/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  },

  /**
   * Get user statistics overview
   * Requires admin authentication
   */
  getUserStatsOverview: async (): Promise<any> => {
    try {
      const response = await authenticatedFetch('/api/v2/users/stats/overview', {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching user stats overview:', error);
      throw error;
    }
  },
};

export default usersApi;