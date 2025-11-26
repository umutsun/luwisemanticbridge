import { renderHook, waitFor, act } from '@testing-library/react';
import { useLLMSettings } from './useLLMSettings';

// Mock fetch
global.fetch = jest.fn();

describe('useLLMSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch LLM settings successfully', async () => {
    const mockSettings = {
      llm: {
        maxLength: 800,
        style: 'legal',
        preserveEntities: false,
        addContext: false,
        temperature: 0.5,
        maxTokens: 200,
        model: 'gpt-4'
      }
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSettings,
    });

    const { result } = renderHook(() => useLLMSettings());

    // Initial state
    expect(result.current.loading).toBe(true);

    // Wait for update
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Verify data
    expect(result.current.settings).toEqual({
      maxLength: 800,
      style: 'legal',
      preserveEntities: false,
      addContext: false,
      temperature: 0.5,
      maxTokens: 200,
      model: 'gpt-4'
    });

    expect(fetch).toHaveBeenCalledWith('/api/v2/chatbot/settings');
  });

  it('should use default settings on fetch error', async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useLLMSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should retain default settings
    expect(result.current.settings).toEqual({
      maxLength: 600,
      style: 'professional',
      preserveEntities: true,
      addContext: true,
      temperature: 0.3,
      maxTokens: 100,
      model: 'anthropic/claude-3-5-sonnet'
    });
  });

  it('should update settings locally', async () => {
    // Mock successful fetch to settle loading state
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ llm: {} }),
    });

    const { result } = renderHook(() => useLLMSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const newSettings = {
      maxLength: 1000,
      style: 'conversational' as const
    };

    // Act
    await act(async () => {
      result.current.updateSettings(newSettings);
    });

    // Assert
    expect(result.current.settings.maxLength).toBe(1000);
    expect(result.current.settings.style).toBe('conversational');
    // Other settings should remain defaults
    expect(result.current.settings.preserveEntities).toBe(true);
  });
});