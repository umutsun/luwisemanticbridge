import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import axiosRetry from 'axios-retry';

interface ApiError {
  message: string;
  code?: string;
  statusCode?: number;
  details?: any;
}

interface RetryConfig {
  retries?: number;
  retryDelay?: (retryCount: number) => number;
  retryCondition?: (error: AxiosError) => boolean;
}

class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor(baseURL: string = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083') {
    this.client = axios.create({
      baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
    this.setupRetryLogic();
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // Add auth token if available
        const token = this.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Add request timestamp
        config.metadata = { startTime: new Date() };
        
        // Log request in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`🚀 ${config.method?.toUpperCase()} ${config.url}`, config.data);
        }

        return config;
      },
      (error) => {
        return Promise.reject(this.handleError(error));
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        // Calculate request duration
        const duration = new Date().getTime() - response.config.metadata?.startTime?.getTime();
        
        // Log response in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`✅ ${response.config.method?.toUpperCase()} ${response.config.url} (${duration}ms)`, response.data);
        }

        return response;
      },
      async (error) => {
        const originalRequest = error.config;

        // Handle 401 Unauthorized
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          
          try {
            await this.refreshToken();
            return this.client(originalRequest);
          } catch (refreshError) {
            this.clearToken();
            window.location.href = '/login';
            return Promise.reject(this.handleError(refreshError));
          }
        }

        return Promise.reject(this.handleError(error));
      }
    );
  }

  private setupRetryLogic(): void {
    axiosRetry(this.client, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        // Retry on network errors or 5xx errors
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
               (error.response?.status ? error.response.status >= 500 : false);
      },
      onRetry: (retryCount, error, requestConfig) => {
        console.log(`🔄 Retry attempt ${retryCount} for ${requestConfig.url}`);
      },
    });
  }

  private handleError(error: any): ApiError {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<any>;
      
      // Network error
      if (!axiosError.response) {
        return {
          message: 'Network error. Please check your connection.',
          code: 'NETWORK_ERROR',
        };
      }

      // Server error with response
      const { status, data } = axiosError.response;
      
      return {
        message: data?.message || `Request failed with status ${status}`,
        code: data?.code || 'API_ERROR',
        statusCode: status,
        details: data?.details,
      };
    }

    // Non-Axios error
    return {
      message: error?.message || 'An unexpected error occurred',
      code: 'UNKNOWN_ERROR',
    };
  }

  // Token management
  public setToken(token: string): void {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  public getToken(): string | null {
    if (this.token) return this.token;
    
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
    
    return this.token;
  }

  public clearToken(): void {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  private async refreshToken(): Promise<void> {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) throw new Error('No refresh token available');

    const response = await this.post('/auth/refresh', { refreshToken });
    this.setToken(response.data.accessToken);
  }

  // HTTP methods with retry configuration
  public async get<T = any>(url: string, config?: AxiosRequestConfig & RetryConfig): Promise<AxiosResponse<T>> {
    return this.client.get<T>(url, config);
  }

  public async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig & RetryConfig): Promise<AxiosResponse<T>> {
    return this.client.post<T>(url, data, config);
  }

  public async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig & RetryConfig): Promise<AxiosResponse<T>> {
    return this.client.put<T>(url, data, config);
  }

  public async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig & RetryConfig): Promise<AxiosResponse<T>> {
    return this.client.patch<T>(url, data, config);
  }

  public async delete<T = any>(url: string, config?: AxiosRequestConfig & RetryConfig): Promise<AxiosResponse<T>> {
    return this.client.delete<T>(url, config);
  }

  // Utility methods
  public async uploadFile(url: string, file: File, onProgress?: (progress: number) => void): Promise<AxiosResponse> {
    const formData = new FormData();
    formData.append('file', file);

    return this.client.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
    });
  }

  public async downloadFile(url: string, filename: string): Promise<void> {
    const response = await this.client.get(url, {
      responseType: 'blob',
    });

    const blob = new Blob([response.data]);
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(link.href);
  }
}

// Create singleton instance
const apiClient = new ApiClient();

export default apiClient;
export { ApiClient, ApiError };