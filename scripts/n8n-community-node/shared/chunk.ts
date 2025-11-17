export interface ChunkOptions {
  maxChars?: number; // max characters per chunk
  overlap?: number;  // overlap characters between consecutive chunks
}

export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const maxChars = options.maxChars ?? 1000;
  const overlap = Math.min(options.overlap ?? 100, Math.max(0, maxChars - 1));
  const result: string[] = [];
  if (!text) return result;
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + maxChars);
    result.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - overlap;
  }
  return result;
}

