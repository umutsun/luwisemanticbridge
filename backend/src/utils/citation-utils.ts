/**
 * Citation Reordering and Filtering Utilities
 *
 * Reorders citations based on usage frequency in LLM response
 * and removes unused citations to improve UX.
 *
 * Problem: LLM may reference [6] most but sources are ordered by similarity score
 * Solution: Reorder so most-referenced citation becomes [1]
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

  // Sort by usage frequency if requested (highest first)
  // v12.49: Multi-signal sort: citation usage > rerank score > table priority > similarity
  const hasCitedSources = processedSources.some(s => s.count > 0);
  if (sortByUsage) {
    processedSources.sort((a, b) => {
      if (hasCitedSources) {
        // Primary: usage count (descending) - most cited first
        if (b.count !== a.count) return b.count - a.count;
      }
      // Secondary: Jina rerank score (descending) - semantic relevance
      if (b.rerankScore !== a.rerankScore) return b.rerankScore - a.rerankScore;
      // Tertiary: table priority (descending) - Kanun > Tebliğ > Özelge etc.
      if (b.priority !== a.priority) return b.priority - a.priority;
      // Quaternary: similarity score (descending)
      if (b.similarityScore !== a.similarityScore) return b.similarityScore - a.similarityScore;
      // Final: original order (ascending) for equal scores
      return a.originalIndex - b.originalIndex;
    });
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
