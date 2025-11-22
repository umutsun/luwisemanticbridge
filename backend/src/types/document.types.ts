/**
 * Document Type Definitions
 * Centralized type definitions for document processing
 */

export interface DocumentMetadata {
    originalName: string;
    mimeType: string;
    fileType: string;
    type: 'pdf' | 'excel' | 'csv' | 'word' | 'text' | 'json' | 'unknown';
    processedAt: Date;
    contentLength?: number;
    chunksCount?: number;
    csvStats?: {
        totalRows: number;
        totalColumns: number;
        numericColumns: number;
        categoricalColumns: number;
        columnTypes: Array<{
            name: string;
            type: 'numeric' | 'text';
            uniqueValues: number;
            nullCount: number;
        }>;
    };
    columnTypes?: Array<{
        name: string;
        type: 'numeric' | 'text';
        uniqueValues: number;
        nullCount: number;
    }>;
    hasNumericData?: boolean;
    hasCategoricalData?: boolean;
    embeddings?: boolean;
    chunks?: number;
    embedding_model?: string;
    total_tokens_used?: number;
}

export interface ProcessedDocument {
    title: string;
    content: string;
    chunks: string[];
    metadata: DocumentMetadata;
}

export interface ChunkMetadata {
    chunk_index: number;
    total_chunks: number;
    document_id: number;
    document_title: string;
    chunk_size: number;
    model_used?: string;
    tokens_used?: number;
}

export interface Document {
    id: number;
    filename: string;
    filepath: string;
    filetype: string;
    filesize: number;
    content?: string;
    hash: string;
    upload_count: number;
    metadata?: DocumentMetadata;
    chunk_count?: number;
    embedding_count?: number;
    transform_status?: 'pending' | 'processing' | 'completed' | 'failed';
    processing_status?: 'pending' | 'processing' | 'completed' | 'failed';
    target_table_name?: string;
    transformed_at?: Date;
    created_at: Date;
    updated_at: Date;
}

export interface DocumentEmbedding {
    id: number;
    document_id: number;
    chunk_text: string;
    embedding: number[];
    metadata?: ChunkMetadata;
    model_name?: string;
    tokens_used?: number;
    embedding_dimension?: number;
    created_at: Date;
}

export interface EmbeddingResult {
    embedding: number[];
    tokens: number;
    model: string;
}
