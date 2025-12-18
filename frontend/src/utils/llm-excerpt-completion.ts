// LLM-powered excerpt completion for natural language summaries
import config, { getEndpoint } from '@/config/api.config';
import { useLLMSettings } from '@/hooks/useLLMSettings';

export interface CompletionOptions {
  maxLength?: number;
  style?: 'professional' | 'conversational' | 'legal';
  preserveEntities?: boolean;
  addContext?: boolean;
}

// Complete excerpt using LLM for natural language
export const completeExcerptWithLLM = async (
  content: string,
  options: CompletionOptions = {}
): Promise<string> => {
  // Get settings from backend if not provided
  const { settings: llmSettings } = useLLMSettings();

  const {
    maxLength = llmSettings?.maxLength || 600,
    style = llmSettings?.style || 'professional',
    preserveEntities = llmSettings?.preserveEntities ?? true,
    addContext = llmSettings?.addContext ?? true
  } = options;

  // Clean the content
  const cleanContent = content
    .replace(/^Cevap:\s*/i, '')
    .replace(/^Açıklama:\s*/i, '')
    .trim();

  // If content is already good, return as is
  if (cleanContent.length <= maxLength && isCompleteSentence(cleanContent)) {
    return cleanContent;
  }

  // Create prompt for LLM
  const prompt = createCompletionPrompt(cleanContent, {
    maxLength,
    style,
    preserveEntities,
    addContext
  });

  try {
    // Call LLM API
    const response = await fetch(getEndpoint('chat', 'complete'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: cleanContent,
        prompt,
        options: {
          maxLength,
          style,
          temperature: 0.3,
          maxTokens: 100
        }
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to complete excerpt');
    }

    const data = await response.json();
    let completed = data.completed || data.result || cleanContent;

    // Post-processing
    completed = postProcessCompletion(completed, cleanContent, options);

    return completed;
  } catch (error) {
    console.error('LLM completion failed:', error);
    // Fallback to rule-based completion
    return fallbackCompletion(cleanContent, options);
  }
};

// Create prompt for LLM completion
const createCompletionPrompt = (content: string, options: CompletionOptions): string => {
  const { maxLength, style, preserveEntities, addContext } = options;

  const styleInstructions = {
    professional: 'Resmi ve profesyonel bir dil kullan',
    conversational: 'Samimi ve anlaşılır bir dil kullan',
    legal: 'Hukuki terminolojiyi koruyarak resmi bir dil kullan'
  };

  const entities = preserveEntities ? extractEntities(content) : [];

  return `Aşağıdaki yarım kalmış metni tam bir cümle olarak tamamla.
${styleInstructions[style]}
${entities.length > 0 ? `Bu önemli terimleri koru: ${entities.join(', ')}` : ''}
${addContext ? 'Metnin bağlamını anlamaya çalış ve uygun bir şekilde tamamla.' : ''}
Maksimum ${maxLength} karakter uzunluğunda olmalı.

Metin: "${content}"

Tamamlanmış cümle:`;
};

// Extract important entities
const extractEntities = (text: string): string[] => {
  const entities: string[] = [];

  // Numbers and percentages
  const numbers = text.match(/\d+(?:\.\d+)?%?/g) || [];
  entities.push(...numbers);

  // Legal terms
  const legalTerms = [
    'KDV', 'ÖTV', 'GV', 'KV', 'stopaj', 'tazminat', 'kıdem', 'ihbar',
    'mükellef', 'vergi dairesi', 'sosyal güvenlik', 'iş sözleşmesi',
    'iş akdi', 'feshetme', 'işe iade', 'uzlaşma', 'tarhiyat'
  ];

  legalTerms.forEach(term => {
    if (text.toLowerCase().includes(term.toLowerCase())) {
      entities.push(term);
    }
  });

  return [...new Set(entities)];
};

// Post-process LLM completion
const postProcessCompletion = (
  completed: string,
  original: string,
  options: CompletionOptions
): string => {
  let processed = completed
    .replace(/^"\s*/, '') // Remove leading quotes
    .replace(/\s*"$/, '') // Remove trailing quotes
    .replace(/^[Aa]sıl[aı]?\s*:\s*/, '') // Remove "Aslı:" prefix
    .trim();

  // Ensure it ends with proper punctuation
  if (!/[.!?]$/.test(processed)) {
    processed += '.';
  }

  // Ensure it doesn't exceed max length
  if (processed.length > options.maxLength!) {
    processed = processed.substring(0, options.maxLength!);
    const lastSpace = processed.lastIndexOf(' ');
    if (lastSpace > options.maxLength! * 0.8) {
      processed = processed.substring(0, lastSpace);
    }
    processed += '...';
  }

  return processed;
};

// Fallback rule-based completion
const fallbackCompletion = (content: string, options: CompletionOptions): string => {
  const { maxLength } = options;

  // Simple truncation at word boundary
  if (content.length > maxLength) {
    const truncated = content.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    const lastPunctuation = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?')
    );

    let result;
    if (lastPunctuation > maxLength * 0.7) {
      result = truncated.substring(0, lastPunctuation + 1);
    } else if (lastSpace > maxLength * 0.8) {
      result = truncated.substring(0, lastSpace) + '...';
    } else {
      result = truncated + '...';
    }

    return result;
  }

  return content;
};

// Check if sentence is complete
const isCompleteSentence = (text: string): boolean => {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) && trimmed.length > 10;
};

// Batch complete multiple excerpts
export const batchCompleteExcerpts = async (
  excerpts: string[],
  options: CompletionOptions = {}
): Promise<string[]> => {
  // Process in batches to avoid overwhelming the API
  const batchSize = 5;
  const results: string[] = [];

  for (let i = 0; i < excerpts.length; i += batchSize) {
    const batch = excerpts.slice(i, i + batchSize);
    const batchPromises = batch.map(excerpt =>
      completeExcerptWithLLM(excerpt, options)
    );

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
};