// Re-export from embedding.ts for backward compatibility
export { 
  EmbeddingService,
  embedTextForNode as generateEmbedding,
  EmbeddingProvider,
  EmbeddingConfig,
  EmbeddingResponse as EmbeddingResult
} from './embedding';

// Helper function for getting embeddings
export async function getEmbedding(text: string): Promise<number[]> {
  const { EmbeddingService } = await import('./embedding');
  const service = EmbeddingService.getInstance();
  const response = await service.generateEmbedding(text);
  return response.embedding;
}