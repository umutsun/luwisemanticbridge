import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLLMSettings } from './useLLMSettings';

// Mock fetch
global.fetch = jest.fn();

// Create a test query client
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useLLMSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch LLM settings successfully', async () => {
    const mockSettings = {
      activeModel: 'claude-3-sonnet',
      temperature: 0.1,
      maxTokens: 2048,
      topP: 0.1,
      frequencyPenalty: 0,
      presencePenalty: 0,
      providers: {
        openai: {
          available: true,
          models: ['gpt-3.5-turbo', 'gpt-4'],
        },
        claude: {
          available: true,
          models: ['claude-3-sonnet', 'claude-3-opus'],
        },
      },
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSettings,
    });

    const { result } = renderHook(() => useLLMSettings(), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockSettings);
    expect(fetch).toHaveBeenCalledWith('/api/v2/ai/settings', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  it('should handle fetch error', async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useLLMSettings(), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(expect.any(Error));
  });

  it('should update settings successfully', async () => {
    const mockSettings = {
      activeModel: 'gpt-4',
      temperature: 0.2,
      maxTokens: 1024,
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() => useLLMSettings(), { wrapper });

    await act(async () => {
      await result.current.updateSettings(mockSettings);
    });

    expect(fetch).toHaveBeenCalledWith('/api/v2/ai/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mockSettings),
    });

    expect(result.current.isSuccess).toBe(true);
  });

  it('should test LLM connection', async () => {
    const mockTestResult = {
      connected: true,
      responseTime: 500,
      model: 'claude-3-sonnet',
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockTestResult,
    });

    const { result } = renderHook(() => useLLMSettings(), { wrapper });

    await act(async () => {
      const testResult = await result.current.testConnection('claude-3-sonnet');
      expect(testResult).toEqual(mockTestResult);
    });

    expect(fetch).toHaveBeenCalledWith('/api/v2/ai/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'claude-3-sonnet' }),
    });
  });

  it('should cache settings in localStorage', async () => {
    const mockSettings = {
      activeModel: 'claude-3-sonnet',
      temperature: 0.1,
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSettings,
    });

    const { result } = renderHook(() => useLLMSettings(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual(mockSettings);
    });

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'llm-settings',
      JSON.stringify(mockSettings)
    );
  });

  it('should use cached settings if available', async () => {
    const cachedSettings = {
      activeModel: 'gpt-4',
      temperature: 0.3,
    };

    (localStorage.getItem as jest.Mock).mockReturnValueOnce(
      JSON.stringify(cachedSettings)
    );

    const { result } = renderHook(() => useLLMSettings(), { wrapper });

    // Should return cached data immediately
    expect(result.current.data).toEqual(cachedSettings);
    expect(result.current.isLoading).toBe(false);

    // Then fetch fresh data
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
  });

  it('should handle update settings error', async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new Error('Update failed'));

    const { result } = renderHook(() => useLLMSettings(), { wrapper });

    await act(async () => {
      await expect(
        result.current.updateSettings({ temperature: 0.5 })
      ).rejects.toThrow('Update failed');
    });

    expect(result.current.isError).toBe(true);
  });

  it('should invalidate cache on successful update', async () => {
    const mockSettings = {
      activeModel: 'claude-3-opus',
      temperature: 0.1,
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() => useLLMSettings(), { wrapper });

    await act(async () => {
      await result.current.updateSettings(mockSettings);
    });

    expect(localStorage.removeItem).toHaveBeenCalledWith('llm-settings');
  });

  it('should retry failed requests', async () => {
    // Fail first, then succeed
    (fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ activeModel: 'claude-3-sonnet' }),
      });

    const { result } = renderHook(() => useLLMSettings(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual({ activeModel: 'claude-3-sonnet' });
    });

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});