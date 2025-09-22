import { useState, useEffect } from 'react';

export interface LLMSettings {
  maxLength?: number;
  style?: 'professional' | 'conversational' | 'legal';
  preserveEntities?: boolean;
  addContext?: boolean;
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export const useLLMSettings = () => {
  const [settings, setSettings] = useState<LLMSettings>({
    maxLength: 150,
    style: 'professional',
    preserveEntities: true,
    addContext: true,
    temperature: 0.3,
    maxTokens: 100,
    model: 'anthropic/claude-3-sonnet'
  });
  const [loading, setLoading] = useState(true);

  // Fetch LLM settings from backend
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/v2/chatbot/settings');
        if (response.ok) {
          const data = await response.json();

          // Extract LLM-related settings
          const llmSettings: LLMSettings = {
            maxLength: data.llm?.maxLength || 150,
            style: data.llm?.style || 'professional',
            preserveEntities: data.llm?.preserveEntities ?? true,
            addContext: data.llm?.addContext ?? true,
            temperature: data.llm?.temperature ?? 0.3,
            maxTokens: data.llm?.maxTokens ?? 100,
            model: data.llm?.model || 'anthropic/claude-3-sonnet'
          };

          setSettings(llmSettings);
        }
      } catch (error) {
        console.error('Failed to fetch LLM settings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  // Update settings
  const updateSettings = (newSettings: Partial<LLMSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  return {
    settings,
    loading,
    updateSettings
  };
};