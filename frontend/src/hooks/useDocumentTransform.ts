/**
 * Custom hooks for document transformation operations
 * Handles CSV/JSON → PostgreSQL pipeline with GraphQL
 */

import { useState, useCallback, useEffect } from 'react';
import { executeQuery, executeMutation } from '@/lib/graphql/client';
import {
  GET_DOCUMENT_PREVIEW,
  GET_TRANSFORM_PROGRESS,
  TRANSFORM_DOCUMENTS_TO_SOURCE_DB,
  DocumentPreview,
  TransformProgress,
  TransformResult,
} from '@/lib/graphql/documents.queries';

/**
 * Hook for getting document preview
 */
export const useDocumentPreview = () => {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPreview = useCallback(async (documentId: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await executeQuery<{ documentPreview: DocumentPreview }>(
        GET_DOCUMENT_PREVIEW,
        { documentId }
      );

      setPreview(response.documentPreview);
      return response.documentPreview;
    } catch (err: any) {
      const message = err.message || 'Failed to fetch document preview';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { preview, loading, error, fetchPreview };
};

/**
 * Hook for batch document transformation
 */
export const useDocumentTransform = () => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<TransformProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  /**
   * Start transformation job
   */
  const startTransform = useCallback(
    async (options: {
      documentIds: string[];
      sourceDbId: string;
      tableName?: string;
      batchSize?: number;
      createNewTable?: boolean;
    }) => {
      setLoading(true);
      setError(null);
      setProgress([]);

      try {
        const response = await executeMutation<{
          transformDocumentsToSourceDb: TransformResult;
        }>(TRANSFORM_DOCUMENTS_TO_SOURCE_DB, options);

        const result = response.transformDocumentsToSourceDb;
        setJobId(result.jobId);

        // Start polling for progress
        pollProgress(result.jobId);

        return result;
      } catch (err: any) {
        const message = err.message || 'Failed to start transformation';
        setError(message);
        setLoading(false);
        throw new Error(message);
      }
    },
    []
  );

  /**
   * Poll transformation progress
   */
  const pollProgress = useCallback(async (currentJobId: string) => {
    const pollInterval = 1000; // 1 second
    const maxPolls = 300; // 5 minutes max
    let pollCount = 0;

    const poll = async () => {
      if (pollCount >= maxPolls) {
        setError('Transformation timeout');
        setLoading(false);
        return;
      }

      try {
        const response = await executeQuery<{
          transformProgress: TransformProgress[];
        }>(GET_TRANSFORM_PROGRESS, { jobId: currentJobId });

        const progressData = response.transformProgress;
        setProgress(progressData);

        // Check if all completed or failed
        const allDone = progressData.every(
          (p) => p.status === 'COMPLETED' || p.status === 'FAILED'
        );

        if (allDone) {
          setLoading(false);

          // Check if any failed
          const anyFailed = progressData.some((p) => p.status === 'FAILED');
          if (anyFailed) {
            const failedCount = progressData.filter(
              (p) => p.status === 'FAILED'
            ).length;
            setError(
              `${failedCount} document(s) failed to transform. Check details below.`
            );
          }
        } else {
          // Continue polling
          pollCount++;
          setTimeout(poll, pollInterval);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to fetch progress');
        setLoading(false);
      }
    };

    poll();
  }, []);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setLoading(false);
    setProgress([]);
    setError(null);
    setJobId(null);
  }, []);

  return {
    loading,
    progress,
    error,
    jobId,
    startTransform,
    reset,
  };
};

/**
 * Hook for real-time progress tracking (via polling)
 */
export const useTransformProgressSubscription = (jobId: string | null) => {
  const [progress, setProgress] = useState<{
    status: 'idle' | 'analyzing' | 'creating' | 'inserting' | 'completed' | 'failed' | 'cancelled';
    rowsProcessed: number;
    totalRows: number;
    currentBatch: number;
    totalBatches: number;
    percentage: number;
    message: string;
    elapsedTime?: string;
    estimatedTimeRemaining?: string;
  }>({
    status: 'idle',
    rowsProcessed: 0,
    totalRows: 0,
    currentBatch: 0,
    totalBatches: 0,
    percentage: 0,
    message: 'Ready to start...',
    elapsedTime: '0:00',
    estimatedTimeRemaining: 'Calculating...',
  });
  const [error, setError] = useState<string | null>(null);

  // Cancel function
  const cancelTransform = async () => {
    if (!jobId) return;

    try {
      const response = await fetch(`/api/v2/documents/table-creation/cancel/${jobId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        setProgress(prev => ({ ...prev, status: 'cancelled', message: 'Transform paused by user' }));
        console.log('[Progress] Transform paused successfully');
      }
    } catch (err) {
      console.error('[Progress] Failed to pause transform:', err);
    }
  };

  useEffect(() => {
    if (!jobId) {
      console.log('[Progress] No jobId provided, skipping polling');
      return;
    }

    console.log('[Progress] Starting polling for jobId:', jobId);
    let pollInterval: NodeJS.Timeout;

    const pollProgress = async () => {
      try {
        const response = await fetch(`/api/v2/documents/table-creation/progress/${jobId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        });

        if (!response.ok) {
          if (response.status === 404) {
            console.log('[Progress] Progress not found yet (404), will retry...');
            return;
          }
          throw new Error('Failed to fetch progress');
        }

        const data = await response.json();
        console.log('[Progress] Received data:', data);

        if (data.progress) {
          const p = data.progress;
          const remainingRows = (p.totalRows || 0) - (p.rowsInserted || 0);

          // Calculate elapsed time and ETA
          const startTime = p.startedAt ? new Date(p.startedAt).getTime() : Date.now();
          const elapsedMs = Date.now() - startTime;
          const elapsedMinutes = Math.floor(elapsedMs / 60000);
          const elapsedSeconds = Math.floor((elapsedMs % 60000) / 1000);

          // Calculate ETA based on current progress
          let etaMinutes = 0;
          if (p.progress > 0 && p.progress < 100) {
            const totalEstimatedMs = (elapsedMs / p.progress) * 100;
            const remainingMs = totalEstimatedMs - elapsedMs;
            etaMinutes = Math.ceil(remainingMs / 60000);
          }

          const newProgress = {
            status: p.status === 'COMPLETED' ? 'completed' :
                   p.status === 'FAILED' ? 'failed' :
                   p.status === 'INSERTING_DATA' ? 'inserting' :
                   p.status === 'CREATING_TABLE' ? 'creating' : 'idle',
            rowsProcessed: p.rowsInserted || 0,
            totalRows: p.totalRows || 0,
            currentBatch: p.currentBatch || 0,
            totalBatches: p.totalBatches || 0,
            percentage: p.progress || 0,
            message: `Batch ${p.currentBatch}/${p.totalBatches} | ${p.rowsInserted?.toLocaleString()}/${p.totalRows?.toLocaleString()} rows | Remaining: ${remainingRows.toLocaleString()}`,
            elapsedTime: `${elapsedMinutes}:${elapsedSeconds.toString().padStart(2, '0')}`,
            estimatedTimeRemaining: etaMinutes > 0 ? `~${etaMinutes} min` : 'Calculating...',
          };

          console.log('[Progress] Updating progress:', newProgress);
          setProgress(newProgress);

          // Stop polling if completed or failed
          if (p.status === 'COMPLETED' || p.status === 'FAILED') {
            console.log('[Progress] Job completed/failed, stopping polling');
            clearInterval(pollInterval);
          }
        }
      } catch (err: any) {
        console.error('[Progress] Polling error:', err);
        setError(err.message);
      }
    };

    // Start polling every 500ms
    pollInterval = setInterval(pollProgress, 500);

    // Initial poll
    pollProgress();

    return () => {
      console.log('[Progress] Cleanup - stopping polling');
      clearInterval(pollInterval);
    };
  }, [jobId]);

  return { progress, error, setProgress, cancelTransform };
};

/**
 * Hook for document validation before transformation
 */
export const useDocumentValidation = () => {
  const [validating, setValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<
    Record<string, { isValid: boolean; issues: string[] }>
  >({});

  const validateDocuments = useCallback(async (documentIds: string[]) => {
    setValidating(true);

    try {
      const results: Record<string, { isValid: boolean; issues: string[] }> =
        {};

      // Validate each document
      for (const docId of documentIds) {
        const response = await executeQuery<{ documentPreview: DocumentPreview }>(
          GET_DOCUMENT_PREVIEW,
          { documentId: docId }
        );

        const preview = response.documentPreview;
        const issues: string[] = [];

        // Check data quality
        if (preview.dataQuality.score < 0.7) {
          issues.push('Low data quality score');
        }

        // Check for high severity issues
        const highSeverityIssues = preview.dataQuality.issues.filter(
          (issue) => issue.severity === 'high'
        );
        if (highSeverityIssues.length > 0) {
          issues.push(
            `${highSeverityIssues.length} high-severity data quality issues`
          );
        }

        // Check if valid
        if (!preview.isValid) {
          issues.push('Document structure is invalid');
        }

        results[docId] = {
          isValid: preview.isValid && issues.length === 0,
          issues,
        };
      }

      setValidationResults(results);
      return results;
    } catch (err: any) {
      throw new Error(err.message || 'Validation failed');
    } finally {
      setValidating(false);
    }
  }, []);

  return { validating, validationResults, validateDocuments };
};
