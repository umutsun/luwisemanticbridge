/**
 * Document Transform Component
 * Handles CSV/JSON upload, preview, and transformation to source_db
 */

import React, { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { gql } from '@apollo/client';

// GraphQL Queries & Mutations
const GET_DOCUMENTS = gql`
  query GetDocuments($limit: Int, $offset: Int, $status: TransformStatus, $fileType: String) {
    documents(limit: $limit, offset: $offset, status: $status, fileType: $fileType) {
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
        createdAt
      }
      total
      hasMore
    }
  }
`;

const GET_DOCUMENT_PREVIEW = gql`
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
          description
          suggestion
        }
        warnings
      }
      suggestedTableName
      isValid
    }
  }
`;

const TRANSFORM_DOCUMENTS = gql`
  mutation TransformDocuments(
    $documentIds: [ID!]!
    $sourceDbId: String!
    $tableName: String
    $batchSize: Int
    $enableEmbedding: Boolean
  ) {
    transformDocumentsToSourceDb(
      documentIds: $documentIds
      sourceDbId: $sourceDbId
      tableName: $tableName
      batchSize: $batchSize
      enableEmbedding: $enableEmbedding
    ) {
      jobId
      message
      documentsProcessed
    }
  }
`;

const GET_TRANSFORM_PROGRESS = gql`
  query GetTransformProgress($jobId: String!) {
    transformProgress(jobId: $jobId) {
      jobId
      documentId
      status
      progress
      rowsProcessed
      totalRows
      errors
      embeddingEnabled
      embeddingStatus
      embeddingProgress
      chunksProcessed
      totalChunks
    }
  }
`;

interface Document {
  id: string;
  filename: string;
  fileType: string;
  fileSize: number;
  rowCount: number;
  columnHeaders: string[];
  dataQualityScore: number;
  transformStatus: string;
  transformProgress: number;
  targetTableName?: string;
  createdAt: string;
}

interface DocumentPreview {
  documentId: string;
  filename: string;
  fileType: string;
  rowCount: number;
  columnHeaders: string[];
  sampleRows: any[];
  dataQuality: {
    score: number;
    issues: any[];
    warnings: string[];
  };
  suggestedTableName: string;
  isValid: boolean;
}

export const DocumentTransform: React.FC = () => {
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [transformJobId, setTransformJobId] = useState<string | null>(null);
  const [customTableName, setCustomTableName] = useState<string>('');
  const [enableEmbedding, setEnableEmbedding] = useState<boolean>(false);

  // Fetch documents list
  const { data: documentsData, loading: documentsLoading, refetch: refetchDocuments } = useQuery(
    GET_DOCUMENTS,
    {
      variables: { limit: 50, offset: 0 },
      pollInterval: 5000, // Refresh every 5 seconds
    }
  );

  // Fetch document preview
  const { data: previewData, loading: previewLoading } = useQuery(GET_DOCUMENT_PREVIEW, {
    variables: { documentId: previewDocId },
    skip: !previewDocId,
  });

  // Fetch transform progress
  const { data: progressData } = useQuery(GET_TRANSFORM_PROGRESS, {
    variables: { jobId: transformJobId },
    skip: !transformJobId,
    pollInterval: 2000, // Poll every 2 seconds
  });

  // Transform mutation
  const [transformDocuments, { loading: transforming }] = useMutation(TRANSFORM_DOCUMENTS, {
    onCompleted: (data) => {
      setTransformJobId(data.transformDocumentsToSourceDb.jobId);
      alert(`Transform started! Job ID: ${data.transformDocumentsToSourceDb.jobId}`);
    },
    onError: (error) => {
      alert(`Transform failed: ${error.message}`);
    },
  });

  const handleSelectDocument = (docId: string) => {
    setSelectedDocuments((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  };

  const handlePreview = (docId: string) => {
    setPreviewDocId(docId);
  };

  const handleTransform = () => {
    if (selectedDocuments.length === 0) {
      alert('Please select at least one document');
      return;
    }

    const tableName = customTableName || undefined;

    transformDocuments({
      variables: {
        documentIds: selectedDocuments,
        sourceDbId: 'source_database',
        tableName,
        batchSize: 100,
        enableEmbedding,
      },
    });
  };

  const documents: Document[] = documentsData?.documents?.items || [];
  const preview: DocumentPreview | null = previewData?.documentPreview || null;
  const progress = progressData?.transformProgress || [];

  return (
    <div className="document-transform-container">
      <h1>Document Transform</h1>
      <p>Upload CSV/JSON files and transform them into PostgreSQL tables</p>

      {/* Documents List */}
      <div className="documents-section">
        <h2>Documents ({documents.length})</h2>

        {documentsLoading ? (
          <div>Loading documents...</div>
        ) : (
          <table className="documents-table">
            <thead>
              <tr>
                <th>Select</th>
                <th>Filename</th>
                <th>Type</th>
                <th>Rows</th>
                <th>Quality</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedDocuments.includes(doc.id)}
                      onChange={() => handleSelectDocument(doc.id)}
                      disabled={doc.transformStatus === 'COMPLETED'}
                    />
                  </td>
                  <td>{doc.filename}</td>
                  <td>{doc.fileType}</td>
                  <td>{doc.rowCount?.toLocaleString()}</td>
                  <td>{(doc.dataQualityScore * 100).toFixed(1)}%</td>
                  <td>
                    <span className={`status-badge status-${doc.transformStatus.toLowerCase()}`}>
                      {doc.transformStatus}
                    </span>
                  </td>
                  <td>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${doc.transformProgress}%` }}
                      />
                      <span className="progress-text">{doc.transformProgress}%</span>
                    </div>
                  </td>
                  <td>
                    <button onClick={() => handlePreview(doc.id)}>Preview</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Batch Actions */}
        <div className="batch-actions">
          <input
            type="text"
            placeholder="Custom table name (optional)"
            value={customTableName}
            onChange={(e) => setCustomTableName(e.target.value)}
          />
          <label className="embed-toggle" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '16px' }}>
            <input
              type="checkbox"
              checked={enableEmbedding}
              onChange={(e) => setEnableEmbedding(e.target.checked)}
              style={{ width: '18px', height: '18px' }}
            />
            <span>Enable Embeddings</span>
            <span style={{ fontSize: '12px', color: '#666' }}>(Store in document_embeddings)</span>
          </label>
          <button
            onClick={handleTransform}
            disabled={selectedDocuments.length === 0 || transforming}
          >
            {transforming ? 'Transforming...' : `Transform ${selectedDocuments.length} Document(s)${enableEmbedding ? ' + Embed' : ''}`}
          </button>
        </div>
      </div>

      {/* Preview Modal */}
      {preview && (
        <div className="preview-modal">
          <div className="preview-content">
            <h2>Preview: {preview.filename}</h2>

            <div className="preview-info">
              <p><strong>File Type:</strong> {preview.fileType}</p>
              <p><strong>Total Rows:</strong> {preview.rowCount.toLocaleString()}</p>
              <p><strong>Quality Score:</strong> {(preview.dataQuality.score * 100).toFixed(1)}%</p>
              <p><strong>Suggested Table:</strong> {preview.suggestedTableName}</p>
              <p><strong>Valid:</strong> {preview.isValid ? '✅ Yes' : '❌ No'}</p>
            </div>

            {/* Column Headers */}
            <div className="column-headers">
              <h3>Columns ({preview.columnHeaders.length})</h3>
              <div className="columns-list">
                {preview.columnHeaders.map((col, idx) => (
                  <span key={idx} className="column-badge">{col}</span>
                ))}
              </div>
            </div>

            {/* Sample Data (Last 10 rows) */}
            <div className="sample-data">
              <h3>Sample Data (Last 10 rows)</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    {preview.columnHeaders.map((col, idx) => (
                      <th key={idx}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.sampleRows.map((row, idx) => (
                    <tr key={idx}>
                      {preview.columnHeaders.map((col, colIdx) => (
                        <td key={colIdx}>{JSON.stringify(row[col])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Data Quality Issues */}
            {preview.dataQuality.issues.length > 0 && (
              <div className="quality-issues">
                <h3>Data Quality Issues</h3>
                {preview.dataQuality.issues.map((issue, idx) => (
                  <div key={idx} className={`issue issue-${issue.severity.toLowerCase()}`}>
                    <strong>{issue.severity}:</strong> {issue.description}
                    {issue.suggestion && <p>💡 {issue.suggestion}</p>}
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => setPreviewDocId(null)}>Close Preview</button>
          </div>
        </div>
      )}

      {/* Transform Progress */}
      {progress.length > 0 && (
        <div className="transform-progress">
          <h2>Transform Progress</h2>
          {progress.map((p: any) => (
            <div key={p.documentId} className="progress-item">
              <p><strong>Document:</strong> {p.documentId}</p>
              <p><strong>Status:</strong> {p.status}</p>

              {/* Table Transform Progress */}
              <div className="progress-section">
                <p style={{ fontSize: '12px', color: '#666' }}>Table Transform:</p>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${p.progress}%` }} />
                  <span className="progress-text">
                    {p.rowsProcessed} / {p.totalRows} rows ({p.progress}%)
                  </span>
                </div>
              </div>

              {/* Embedding Progress (if enabled) */}
              {p.embeddingEnabled && (
                <div className="progress-section" style={{ marginTop: '8px' }}>
                  <p style={{ fontSize: '12px', color: '#666' }}>
                    Embedding: <span style={{
                      color: p.embeddingStatus === 'completed' ? 'green' :
                             p.embeddingStatus === 'failed' ? 'red' : 'orange'
                    }}>{p.embeddingStatus || 'pending'}</span>
                  </p>
                  <div className="progress-bar" style={{ backgroundColor: '#e0e0e0' }}>
                    <div
                      className="progress-fill"
                      style={{
                        width: `${p.embeddingProgress || 0}%`,
                        backgroundColor: p.embeddingStatus === 'failed' ? '#f44336' : '#4caf50'
                      }}
                    />
                    <span className="progress-text">
                      {p.chunksProcessed || 0} / {p.totalChunks || 0} chunks ({p.embeddingProgress || 0}%)
                    </span>
                  </div>
                </div>
              )}

              {p.errors && p.errors.length > 0 && (
                <div className="errors">
                  {p.errors.map((err: string, idx: number) => (
                    <p key={idx} className="error">{err}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DocumentTransform;
