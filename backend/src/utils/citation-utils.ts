/**
 * Citation Reordering and Filtering Utilities
 *
 * Removes unused citations and re-numbers them sequentially.
 * Preserves Python's rerank + priority-based source ordering.
 *
 * v12.53: Changed from usage-frequency sorting to priority-preserving.
 * Python's final_score already includes rerank + source_priority + table_weight,
 * so re-sorting by LLM usage count was counterproductive (LLM naturally cites [1] most).
 */

export interface CitationSource {
  id?: string | number;
  title?: string;
  content?: string;
  source_table?: string;
  similarity_score?: number;
  rerank_score?: number;
  table_weight?: number;       // v12.45: Table priority weight from settings
  _hierarchyWeight?: number;   // v12.45: Authority level from schema
  [key: string]: any;
}

export interface ReorderResult {
  response: string;
  sources: CitationSource[];
  citationStats: {
    totalCitations: number;
    usedCitations: number;
    removedCitations: number;
    reorderMap: Record<number, number>; // oldIndex -> newIndex
  };
}

/**
 * Count citation occurrences in text
 * Matches patterns like [1], [2], [12], etc.
 */
function countCitationUsage(text: string): Map<number, number> {
  const citationPattern = /\[(\d+)\]/g;
  const counts = new Map<number, number>();

  let match;
  while ((match = citationPattern.exec(text)) !== null) {
    const citationNum = parseInt(match[1], 10);
    counts.set(citationNum, (counts.get(citationNum) || 0) + 1);
  }

  return counts;
}

/**
 * Reorder citations based on usage and optionally remove unused ones
 *
 * @param response - LLM response text with [N] citations
 * @param sources - Original sources array (1-indexed in response, 0-indexed in array)
 * @param options - Configuration options
 * @returns Reordered response and sources
 */
export function reorderCitations(
  response: string,
  sources: CitationSource[],
  options: {
    removeUnused?: boolean;      // Remove sources not cited in response (default: true)
    sortByUsage?: boolean;       // Sort by usage frequency (default: true)
    maxSources?: number;         // Maximum sources to keep (default: no limit)
  } = {}
): ReorderResult {
  const {
    removeUnused = true,
    sortByUsage = true,
    maxSources = 0  // 0 = no limit
  } = options;

  // Early return if no sources or response
  if (!sources || sources.length === 0 || !response) {
    return {
      response,
      sources: sources || [],
      citationStats: {
        totalCitations: sources?.length || 0,
        usedCitations: 0,
        removedCitations: 0,
        reorderMap: {}
      }
    };
  }

  // Count citation usage (1-indexed)
  const usageCount = countCitationUsage(response);

  // Build usage data for each source (0-indexed)
  // v12.49: Include rerank_score and similarity_score for composite sorting
  const sourceUsage = sources.map((source, index) => ({
    originalIndex: index,
    citationNum: index + 1,  // 1-indexed citation number
    count: usageCount.get(index + 1) || 0,
    priority: source.table_weight ?? source._hierarchyWeight ?? 0.5,  // v12.45: Priority weight
    rerankScore: source.rerank_score ?? 0,  // Jina rerank score
    similarityScore: source.similarity_score ?? 0,  // Semantic similarity
    source
  }));

  // Filter and sort
  let processedSources = [...sourceUsage];

  // Remove unused if requested
  // v12.49: Safety net - if removeUnused would remove ALL sources, keep them all
  // This prevents the case where sanitizer strips all citations but response exists
  if (removeUnused) {
    const cited = processedSources.filter(s => s.count > 0);
    if (cited.length > 0) {
      processedSources = cited;
    } else {
      // No citations found in response - keep all sources as context
      console.log(`📑 [Citation reorder] No citations found in response, keeping all ${processedSources.length} sources`);
    }
  }

  // v12.53: Preserve Python's priority-based ordering (final_score = rerank + source_priority + table_weight)
  // Don't re-sort by usage count - LLM naturally cites [1] most since it's first in context,
  // which would always push the first source to top regardless of actual relevance.
  // Instead, keep original order from Python's scoring pipeline.
  // Only sort if sortByUsage is explicitly true AND there's no rerank data (legacy fallback).
  const hasRerankData = processedSources.some(s => s.rerankScore > 0);
  if (sortByUsage && !hasRerankData) {
    // Legacy fallback: no rerank data, sort by usage as before
    const hasCitedSources = processedSources.some(s => s.count > 0);
    processedSources.sort((a, b) => {
      if (hasCitedSources) {
        if (b.count !== a.count) return b.count - a.count;
      }
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (b.similarityScore !== a.similarityScore) return b.similarityScore - a.similarityScore;
      return a.originalIndex - b.originalIndex;
    });
  } else {
    // v12.53: Rerank-aware mode - preserve Python's original ordering (by originalIndex)
    // Sources already come sorted by final_score from Python pipeline
    processedSources.sort((a, b) => a.originalIndex - b.originalIndex);
  }

  // Apply max limit if specified
  if (maxSources > 0 && processedSources.length > maxSources) {
    processedSources = processedSources.slice(0, maxSources);
  }

  // Build reorder map (old 1-indexed -> new 1-indexed)
  const reorderMap: Record<number, number> = {};
  processedSources.forEach((item, newIndex) => {
    reorderMap[item.citationNum] = newIndex + 1;
  });

  // Rewrite citations in response
  let newResponse = response;

  // Replace citations in reverse order of old numbers to avoid conflicts
  // e.g., [10] before [1] to prevent [1] matching inside [10]
  const oldCitations = Object.keys(reorderMap)
    .map(Number)
    .sort((a, b) => b - a);

  for (const oldNum of oldCitations) {
    const newNum = reorderMap[oldNum];
    // Use a placeholder first to avoid conflicts
    const placeholder = `__CITE_${newNum}__`;
    newResponse = newResponse.replace(
      new RegExp(`\\[${oldNum}\\]`, 'g'),
      placeholder
    );
  }

  // Replace placeholders with final citation numbers
  for (let i = 1; i <= processedSources.length; i++) {
    newResponse = newResponse.replace(
      new RegExp(`__CITE_${i}__`, 'g'),
      `[${i}]`
    );
  }

  // Build new sources array
  const newSources = processedSources.map(item => item.source);

  // Calculate stats
  const stats = {
    totalCitations: sources.length,
    usedCitations: processedSources.filter(s => s.count > 0).length,
    removedCitations: sources.length - newSources.length,
    reorderMap
  };

  // v12.45: Count high-priority sources for logging
  const highPriorityCited = processedSources.filter(s => s.count > 0 && s.priority >= 1.0).length;
  console.log(`📑 Citation reorder: ${stats.totalCitations} total → ${newSources.length} kept (${stats.removedCitations} removed, ${stats.usedCitations} cited, ${highPriorityCited} high-priority)`);

  return {
    response: newResponse,
    sources: newSources,
    citationStats: stats
  };
}

/**
 * Quick check if response has any citations
 */
export function hasCitations(text: string): boolean {
  return /\[\d+\]/.test(text);
}

/**
 * Get list of citation numbers used in text
 */
export function getUsedCitationNumbers(text: string): number[] {
  const usage = countCitationUsage(text);
  return Array.from(usage.keys()).sort((a, b) => a - b);
}
