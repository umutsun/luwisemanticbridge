/**
 * Enterprise Document Audit Service
 * Provides comprehensive audit logging for all document operations
 */

import pool from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export interface AuditLogEntry {
  id: string;
  userId: string;
  documentId?: string;
  operation: 'upload' | 'download' | 'view' | 'delete' | 'edit' | 'share' | 'ocr' | 'translate' | 'embed';
  details: Record<string, any>;
  ipAddress: string;
  userAgent?: string;
  timestamp: Date;
  sessionId?: string;
}

export interface DocumentWatermark {
  id: string;
  documentId: string;
  userId: string;
  watermarkType: 'text' | 'image' | 'invisible';
  content: string;
  position?: 'header' | 'footer' | 'diagonal' | 'center';
  opacity?: number;
  createdAt: Date;
}

export class DocumentAuditService {
  /**
   * Log a document operation for audit purposes
   */
  async logOperation(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void> {
    try {
      const auditEntry: AuditLogEntry = {
        ...entry,
        id: uuidv4(),
        timestamp: new Date()
      };

      await pool.query(`
        INSERT INTO document_audit_logs (
          id, user_id, document_id, operation, details,
          ip_address, user_agent, timestamp, session_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        auditEntry.id,
        auditEntry.userId,
        auditEntry.documentId || null,
        auditEntry.operation,
        JSON.stringify(auditEntry.details),
        auditEntry.ipAddress,
        auditEntry.userAgent || null,
        auditEntry.timestamp,
        auditEntry.sessionId || null
      ]);

      // Also log to Redis for real-time monitoring
      // This would be implemented with your Redis instance
      console.log(`[AUDIT] ${entry.operation}: User ${entry.userId} - Document ${entry.documentId}`);

    } catch (error) {
      console.error('Failed to log audit entry:', error);
      // Don't throw - audit failures shouldn't break the main operation
    }
  }

  /**
   * Get audit logs for a document
   */
  async getDocumentAuditLogs(documentId: string, userId?: string): Promise<AuditLogEntry[]> {
    try {
      const query = `
        SELECT * FROM document_audit_logs
        WHERE document_id = $1
        ${userId ? 'AND user_id = $2' : ''}
        ORDER BY timestamp DESC
        LIMIT 100
      `;

      const params = userId ? [documentId, userId] : [documentId];
      const result = await pool.query(query, params);

      return result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        documentId: row.document_id,
        operation: row.operation,
        details: JSON.parse(row.details),
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        timestamp: row.timestamp,
        sessionId: row.session_id
      }));
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      return [];
    }
  }

  /**
   * Create a watermark for a document
   */
  async createWatermark(watermark: Omit<DocumentWatermark, 'id' | 'createdAt'>): Promise<string> {
    try {
      const watermarkEntry: DocumentWatermark = {
        ...watermark,
        id: uuidv4(),
        createdAt: new Date()
      };

      await pool.query(`
        INSERT INTO document_watermarks (
          id, document_id, user_id, watermark_type, content,
          position, opacity, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        watermarkEntry.id,
        watermarkEntry.documentId,
        watermarkEntry.userId,
        watermarkEntry.watermarkType,
        watermarkEntry.content,
        watermarkEntry.position || 'footer',
        watermarkEntry.opacity || 0.5,
        watermarkEntry.createdAt
      ]);

      return watermarkEntry.id;
    } catch (error) {
      console.error('Failed to create watermark:', error);
      throw error;
    }
  }

  /**
   * Get user activity summary for GDPR compliance
   */
  async getUserActivitySummary(userId: string, startDate?: Date, endDate?: Date): Promise<any> {
    try {
      const query = `
        SELECT
          operation,
          COUNT(*) as count,
          MIN(timestamp) as first_seen,
          MAX(timestamp) as last_seen
        FROM document_audit_logs
        WHERE user_id = $1
        ${startDate ? 'AND timestamp >= $2' : ''}
        ${endDate ? `AND timestamp <= ${startDate ? '$3' : '$2'}` : ''}
        GROUP BY operation
        ORDER BY count DESC
      `;

      const params = [userId, startDate, endDate].filter(Boolean);
      const result = await pool.query(query, params);

      return {
        userId,
        period: { startDate, endDate },
        operations: result.rows,
        totalOperations: result.rows.reduce((sum, row) => sum + parseInt(row.count), 0)
      };
    } catch (error) {
      console.error('Failed to get user activity summary:', error);
      throw error;
    }
  }

  /**
   * Delete all user data for GDPR compliance (right to be forgotten)
   */
  async deleteUserData(userId: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete audit logs
      await client.query('DELETE FROM document_audit_logs WHERE user_id = $1', [userId]);

      // Delete watermarks
      await client.query('DELETE FROM document_watermarks WHERE user_id = $1', [userId]);

      // Mark documents for deletion or anonymize them
      await client.query(`
        UPDATE documents
        SET metadata = metadata || '{"deleted": true, "deleted_at": "' + new Date().toISOString() + '"}',
            uploaded_by = 'deleted_user_' || SUBSTRING(md5($1), 1, 8)
        WHERE uploaded_by = $1
      `, [userId]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get compliance report for data retention policies
   */
  async getRetentionReport(daysOld: number = 365): Promise<any> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await pool.query(`
        SELECT
          COUNT(*) as total_old_documents,
          COUNT(CASE WHEN metadata->>'deleted' = 'true' THEN 1 END) as deleted_documents,
          COUNT(CASE WHEN metadata->>'retention_exempt' = 'true' THEN 1 END) as exempt_documents
        FROM documents
        WHERE created_at < $1
      `, [cutoffDate]);

      return {
        cutoffDate,
        daysOld,
        ...result.rows[0]
      };
    } catch (error) {
      console.error('Failed to generate retention report:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const documentAuditService = new DocumentAuditService();