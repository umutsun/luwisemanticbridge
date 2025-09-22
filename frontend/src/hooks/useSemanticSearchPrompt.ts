import { useState, useCallback } from 'react';
import { SearchResult, SearchContext } from '@/utils/semantic-search-prompt';
import { generateRefinedPrompt, searchResultsToPrompt } from '@/utils/semantic-search-prompt';

interface UseSemanticSearchPromptOptions {
  onPromptGenerated?: (prompt: string) => void;
  autoRefine?: boolean;
}

export const useSemanticSearchPrompt = (options: UseSemanticSearchPromptOptions = {}) => {
  const { onPromptGenerated, autoRefine = true } = options;
  const [currentPrompt, setCurrentPrompt] = useState<string>('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [context, setContext] = useState<SearchContext | null>(null);

  // Update context when new results arrive
  const updateContext = useCallback((query: string, results: SearchResult[]) => {
    const newContext = {
      query,
      results,
      topScore: Math.max(...results.map(r => r.score || r.relevanceScore || 0)),
      averageScore: results.reduce((sum, r) => sum + (r.score || r.relevanceScore || 0), 0) / results.length,
      theme: extractThemeFromResults(results),
      intent: detectIntentFromQuery(query)
    };
    setContext(newContext);
    return newContext;
  }, []);

  // Generate prompt from search results
  const generatePrompt = useCallback((
    query: string,
    results: SearchResult[],
    customTags?: string[]
  ): string => {
    const searchContext = updateContext(query, results);
    const tags = customTags || selectedTags;

    let prompt = query;

    if (autoRefine) {
      // Generate refined prompt based on context
      if (tags.length > 0) {
        prompt = generateRefinedPrompt(query, tags, searchContext);
      } else {
        prompt = searchResultsToPrompt(searchContext);
      }
    }

    setCurrentPrompt(prompt);
    onPromptGenerated?.(prompt);

    return prompt;
  }, [updateContext, selectedTags, autoRefine, onPromptGenerated]);

  // Add tag for refinement
  const addTag = useCallback((tag: string) => {
    if (!selectedTags.includes(tag)) {
      const newTags = [...selectedTags, tag];
      setSelectedTags(newTags);

      // Regenerate prompt with new tags if we have context
      if (context) {
        const refinedPrompt = generateRefinedPrompt(context.query, newTags, context);
        setCurrentPrompt(refinedPrompt);
        onPromptGenerated?.(refinedPrompt);
      }
    }
  }, [selectedTags, context, onPromptGenerated]);

  // Remove tag
  const removeTag = useCallback((tag: string) => {
    const newTags = selectedTags.filter(t => t !== tag);
    setSelectedTags(newTags);

    // Regenerate prompt without tag if we have context
    if (context) {
      const refinedPrompt = generateRefinedPrompt(context.query, newTags, context);
      setCurrentPrompt(refinedPrompt);
      onPromptGenerated?.(refinedPrompt);
    }
  }, [selectedTags, context, onPromptGenerated]);

  // Clear all tags
  const clearTags = useCallback(() => {
    setSelectedTags([]);

    // Reset to original query if we have context
    if (context) {
      setCurrentPrompt(context.query);
      onPromptGenerated?.(context.query);
    }
  }, [context, onPromptGenerated]);

  // Reset state
  const reset = useCallback(() => {
    setCurrentPrompt('');
    setSelectedTags([]);
    setContext(null);
  }, []);

  return {
    currentPrompt,
    selectedTags,
    context,
    generatePrompt,
    addTag,
    removeTag,
    clearTags,
    reset,
    updateContext
  };
};

// Helper functions
const extractThemeFromResults = (results: SearchResult[]): string => {
  const themes = results.map(r => {
    const text = (r.title + ' ' + r.content).toLowerCase();

    if (text.includes('vergi') || text.includes('stopaj') || text.includes('kdv')) return 'vergi';
    if (text.includes('işçi') || text.includes('işveren') || text.includes('kıdem')) return 'iş hukuku';
    if (text.includes('tazminat') || text.includes('alacak')) return 'tazminat';
    if (text.includes('sözleşme') || text.includes('akdi')) return 'sözleşme';
    if (text.includes('dava') || text.includes('mahkeme')) return 'yargı';
    if (text.includes('başvuru') || text.includes('prosedür')) return 'prosedür';

    return 'general';
  });

  const themeFrequency: { [key: string]: number } = {};
  themes.forEach(t => {
    themeFrequency[t] = (themeFrequency[t] || 0) + 1;
  });

  const dominantTheme = Object.entries(themeFrequency)
    .sort(([, a], [, b]) => b - a)[0]?.[0];

  return dominantTheme || 'general';
};

const detectIntentFromQuery = (query: string): 'informational' | 'procedural' | 'analytical' | 'comparative' => {
  const lowerQuery = query.toLowerCase();

  if (lowerQuery.includes('nasıl') || lowerQuery.includes('adım') || lowerQuery.includes('yapılır')) {
    return 'procedural';
  }

  if (lowerQuery.includes('analiz') || lowerQuery.includes('karşılaştır') || lowerQuery.includes('sonuç')) {
    return 'analytical';
  }

  if (lowerQuery.includes('fark') || lowerQuery.includes('hangisi') || lowerQuery.includes('en iyi')) {
    return 'comparative';
  }

  return 'informational';
};