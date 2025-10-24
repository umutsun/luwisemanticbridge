/**
 * GraphQL Queries and Mutations for Documents
 * Document transform operations for CSV/JSON → PostgreSQL pipeline
 */

import { gql } from 'graphql-request';

/**
 * Get single document by ID
 */
export const GET_DOCUMENT = gql`
  query GetDocument($id: ID!) {
    document(id: $id) {
      id
      filename
      fileType
      fileSize
      rowCount
      columnHeaders
      parsedData
      dataQualityScore
      transformStatus
      transformProgress
      targetTableName
      sourceDbId
      transformErrors
      transformedAt
      createdAt
      updatedAt
    }
  }
`;

/**
 * List documents with filters and pagination
 */
export const GET_DOCUMENTS = gql`
  query GetDocuments(
    $limit: Int
    $offset: Int
    $status: TransformStatus
    $fileType: String
  ) {
    documents(
      limit: $limit
      offset: $offset
      status: $status
      fileType: $fileType
    ) {
      items {
        id
        filename
        fileType
        fileSize
        rowCount
        columnHeaders
        dataQualityScore
        transformStatus
        transformProgress
        targetTableName
        sourceDbId
        transformedAt
        createdAt
        updatedAt
      }
      total
      hasMore
    }
  }
`;

/**
 * Get document preview (last 10 rows + headers)
 */
export const GET_DOCUMENT_PREVIEW = gql`
  query GetDocumentPreview($documentId: ID!) {
    documentPreview(documentId: $documentId) {
      documentId
      filename
      fileType
      rowCount
      columnHeaders
      sampleRows
      dataQuality {
        score
        issues {
          severity
          field
          description
          suggestion
          affectedRows
          canAutoFix
        }
        fieldTypes {
          field
          type
          nullable
          unique
        }
        warnings
      }
      suggestedTableName
      isValid
      existingTableStatus {
        exists
        rowCount
        willResume
        resumeFromRow
      }
    }
  }
`;

/**
 * Get transformation progress for a job
 */
export const GET_TRANSFORM_PROGRESS = gql`
  query GetTransformProgress($jobId: ID!) {
    transformProgress(jobId: $jobId) {
      documentId
      filename
      status
      progress
      rowsProcessed
      totalRows
      error
    }
  }
`;

/**
 * Upload document (CSV/JSON)
 */
export const UPLOAD_DOCUMENT = gql`
  mutation UploadDocument($file: Upload!, $filename: String!) {
    uploadDocument(file: $file, filename: $filename) {
      id
      filename
      fileType
      fileSize
      rowCount
      columnHeaders
      dataQualityScore
      transformStatus
      suggestedTableName
      createdAt
    }
  }
`;

/**
 * Transform documents to source database (batch)
 */
export const TRANSFORM_DOCUMENTS_TO_SOURCE_DB = gql`
  mutation TransformDocumentsToSourceDb(
    $documentIds: [ID!]!
    $sourceDbId: String!
    $tableName: String
    $batchSize: Int
    $createNewTable: Boolean
  ) {
    transformDocumentsToSourceDb(
      documentIds: $documentIds
      sourceDbId: $sourceDbId
      tableName: $tableName
      batchSize: $batchSize
      createNewTable: $createNewTable
    ) {
      jobId
      status
      documentsProcessed
      message
    }
  }
`;

/**
 * Delete document
 */
export const DELETE_DOCUMENT = gql`
  mutation DeleteDocument($id: ID!) {
    deleteDocument(id: $id)
  }
`;

/**
 * Update document metadata
 */
export const UPDATE_DOCUMENT_METADATA = gql`
  mutation UpdateDocumentMetadata(
    $id: ID!
    $targetTableName: String
    $sourceDbId: String
  ) {
    updateDocumentMetadata(
      id: $id
      targetTableName: $targetTableName
      sourceDbId: $sourceDbId
    ) {
      id
      targetTableName
      sourceDbId
      updatedAt
    }
  }
`;

/**
 * Subscribe to transformation progress updates
 */
export const SUBSCRIBE_TRANSFORM_PROGRESS = gql`
  subscription TransformProgressUpdates($jobId: ID!) {
    transformProgressUpdates(jobId: $jobId) {
      documentId
      filename
      status
      progress
      rowsProcessed
      totalRows
      error
    }
  }
`;

/**
 * Subscribe to document status updates
 */
export const SUBSCRIBE_DOCUMENT_STATUS = gql`
  subscription DocumentStatusUpdates($documentId: ID!) {
    documentStatusUpdates(documentId: $documentId) {
      id
      transformStatus
      transformProgress
      transformErrors
      transformedAt
    }
  }
`;

/**
 * TypeScript interfaces for responses
 */

export interface Document {
  id: string;
  filename: string;
  fileType: string;
  fileSize: number;
  rowCount: number;
  columnHeaders: string[];
  parsedData?: any;
  dataQualityScore?: number;
  transformStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  transformProgress: number;
  targetTableName?: string;
  sourceDbId?: string;
  transformErrors?: any;
  transformedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentPreview {
  documentId: string;
  filename: string;
  fileType: string;
  rowCount: number;
  columnHeaders: string[];
  sampleRows: any[];
  dataQuality: {
    score: number;
    issues: Array<{
      severity: 'ERROR' | 'WARNING' | 'INFO';
      field?: string;
      description: string;
      suggestion?: string;
      affectedRows: number;
      canAutoFix: boolean;
    }>;
    fieldTypes: Array<{
      field: string;
      type: string;
      nullable: boolean;
      unique: boolean;
    }>;
    warnings: string[];
  };
  suggestedTableName: string;
  isValid: boolean;
}

export interface DocumentsResponse {
  items: Document[];
  total: number;
  hasMore: boolean;
}

export interface TransformProgress {
  documentId: string;
  filename: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  rowsProcessed: number;
  totalRows: number;
  error?: string;
}

export interface TransformResult {
  jobId: string;
  status: string;
  documentsProcessed: number;
  message: string;
}
