import { Pool } from 'pg';
import pool from './database';

/**
 * Dynamic Table Configuration Service
 * Reads table names and display names from the database without any hardcoded language assumptions
 */

export interface TableInfo {
  tableName: string;
  displayName: string;
  columnNames: string[];
  recordCount: number;
  isActive: boolean;
}

export interface DatabaseTableConfig {
  connectionId: string;
  tables: TableInfo[];
  lastUpdated: number;
}

class TableConfigService {
  private cache: Map<string, DatabaseTableConfig> = new Map();
  private cacheExpiry = 300000; // 5 minutes

  /**
   * Get all table information from database dynamically
   * No language assumptions - uses database metadata and content analysis
   */
  async getAllTables(connectionId: string = 'default', databasePool?: Pool): Promise<TableInfo[]> {
    const now = Date.now();
    const cacheKey = `${connectionId}_tables`;

    // Return cached data if not expired
    const cached = this.cache.get(cacheKey);
    if (cached && (now - cached.lastUpdated) < this.cacheExpiry) {
      return cached.tables;
    }

    const dbPool = databasePool || pool;

    try {
      // Get tables with their record counts
      const tableQuery = `
        WITH table_info AS (
          SELECT
            t.table_name,
            EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = t.table_name
              LIMIT 1
            ) as has_columns
          FROM information_schema.tables t
          WHERE t.table_schema = 'public'
            AND t.table_type = 'BASE TABLE'
            AND t.table_name NOT LIKE 'pg_%'
            AND t.table_name NOT LIKE 'information_%'
            AND t.table_name NOT LIKE '_%'
            AND t.table_name NOT IN ('activity_log', 'embeddings', 'unified_embeddings', 'migration_history', 'chatbot_settings', 'settings')
        ),
        table_counts AS (
          SELECT
            ti.table_name,
            ti.has_columns,
            COALESCE(
              CASE
                WHEN EXISTS (
                  SELECT 1 FROM information_schema.columns c
                  WHERE c.table_name = ti.table_name
                  AND c.column_name = 'id'
                ) THEN (
                  SELECT CAST(COUNT(*) AS INTEGER)
                  FROM pg_class pgc
                  JOIN pg_namespace pn ON pn.oid = pgc.relnamespace
                  WHERE pgc.relname = ti.table_name
                    AND pn.nspname = 'public'
                )
                ELSE 0
              END,
              0
            ) as record_count
          FROM table_info ti
        )
        SELECT
          tc.table_name,
          tc.record_count,
          tc.has_columns,
          array_remove(
            ARRAY_AGG(c.column_name ORDER BY
              CASE c.column_name
                WHEN 'id' THEN 1
                WHEN 'title' THEN 2
                WHEN 'name' THEN 3
                WHEN 'subject' THEN 4
                WHEN 'question' THEN 5
                WHEN 'content' THEN 6
                WHEN 'text' THEN 7
                WHEN 'description' THEN 8
                ELSE 9
              END
            ),
            NULL
          ) as columns
        FROM table_counts tc
        LEFT JOIN information_schema.columns c ON c.table_name = tc.table_name
          AND c.data_type IN ('text', 'varchar', 'character varying', 'json', 'jsonb')
        GROUP BY tc.table_name, tc.record_count, tc.has_columns
        ORDER BY tc.record_count DESC NULLS LAST, tc.table_name
      `;

      const result = await dbPool.query(tableQuery);

      const tables: TableInfo[] = result.rows.map(row => ({
        tableName: row.table_name,
        displayName: this.generateDisplayName(row.table_name, row.columns),
        columnNames: row.columns || [],
        recordCount: row.record_count || 0,
        isActive: row.has_columns && row.record_count > 0
      }));

      // Cache the results
      this.cache.set(cacheKey, {
        connectionId,
        tables,
        lastUpdated: now
      });

      console.log(`Loaded ${tables.length} tables for connection ${connectionId}`);
      return tables;

    } catch (error) {
      console.error(`Failed to load table configuration for ${connectionId}:`, error);
      return [];
    }
  }

  /**
   * Generate display name from table metadata (language-agnostic)
   */
  private generateDisplayName(tableName: string, columns: string[]): string {
    // Try to infer a better display name from column names
    if (columns) {
      // Check for content columns to determine table type
      const hasQuestion = columns.some(c => c.toLowerCase().includes('question'));
      const hasAnswer = columns.some(c => c.toLowerCase().includes('answer'));
      const hasTitle = columns.some(c => c.toLowerCase().includes('title'));
      const hasSubject = columns.some(c => c.toLowerCase().includes('subject'));
      const hasContent = columns.some(c => c.toLowerCase().includes('content'));
      const hasName = columns.some(c => c.toLowerCase().includes('name'));

      // Generate meaningful display names based on structure
      if (hasQuestion && hasAnswer) {
        return 'Q&A Documents';
      }
      if (hasSubject || hasTitle) {
        return 'Documents';
      }
      if (hasContent) {
        return 'Content';
      }
      if (hasName) {
        return 'Records';
      }
    }

    // Fallback: convert table_name to readable format
    return tableName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Get display name for a specific table
   */
  async getDisplayName(tableName: string, connectionId: string = 'default', databasePool?: Pool): Promise<string> {
    const tables = await this.getAllTables(connectionId, databasePool);
    const table = tables.find(t => t.tableName.toLowerCase() === tableName.toLowerCase());
    return table?.displayName || this.generateDisplayName(tableName, []);
  }

  /**
   * Get table configuration for SQL queries
   */
  async getTableConfig(connectionId: string = 'default', databasePool?: Pool): Promise<{ [key: string]: string }> {
    const tables = await this.getAllTables(connectionId, databasePool);
    const config: { [key: string]: string } = {};

    tables.forEach(table => {
      // Use the actual table name as key
      config[table.tableName] = table.tableName;
    });

    return config;
  }

  /**
   * Extract keywords dynamically from actual table content
   */
  async getTableKeywords(tableName: string, limit: number = 10, connectionId: string = 'default', databasePool?: Pool): Promise<string[]> {
    const dbPool = databasePool || pool;

    try {
      // Get content columns from table
      const columnQuery = `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = $1
          AND table_schema = 'public'
          AND data_type IN ('text', 'varchar', 'character varying', 'json', 'jsonb')
        ORDER BY
          CASE
            WHEN column_name ILIKE '%title%' THEN 1
            WHEN column_name ILIKE '%subject%' THEN 2
            WHEN column_name ILIKE '%content%' THEN 3
            WHEN column_name ILIKE '%text%' THEN 4
            WHEN column_name ILIKE '%description%' THEN 5
            ELSE 6
          END
        LIMIT 3
      `;

      const columns = await dbPool.query(columnQuery, [tableName]);

      if (columns.rows.length === 0) {
        return [];
      }

      // Get sample data
      const sampleColumns = columns.rows.map(r => r.column_name).join(', ');
      const sampleQuery = `
        SELECT ${sampleColumns}
        FROM public."${tableName}"
        WHERE ${columns.rows[0].column_name} IS NOT NULL
        LIMIT 10
      `;

      const samples = await dbPool.query(sampleQuery);

      // Extract keywords from sample data
      const keywords = this.extractDynamicKeywords(samples.rows, columns.rows.map(r => r.column_name));
      return keywords.slice(0, limit);

    } catch (error) {
      console.error(`Failed to get keywords for table ${tableName}:`, error);
      return [];
    }
  }

  /**
   * Extract keywords from data without language assumptions
   */
  private extractDynamicKeywords(rows: any[], columns: string[]): string[] {
    const keywords = new Set<string>();

    rows.forEach(row => {
      columns.forEach(column => {
        const text = row[column];
        if (typeof text === 'string' && text.length > 0) {
          // Extract numbers with units
          const numbers = text.match(/\d+(?:\.\d+)?\s*[a-zA-Z%$€£¥₺]+/g);
          if (numbers) numbers.forEach(n => keywords.add(n));

          // Extract dates
          const dates = text.match(/\d{1,4}[-/]\d{1,2}[-/]\d{2,4}/g);
          if (dates) dates.forEach(d => keywords.add(d));

          // Extract capitalized words (potential entities)
          const words = text.split(/\s+/);
          words.forEach(word => {
            if (word.length > 5 && word.charAt(0) === word.charAt(0).toUpperCase() && word !== word.toLowerCase()) {
              keywords.add(word);
            }
          });

          // Extract percentages
          const percentages = text.match(/\d+(?:\.\d+)?%/g);
          if (percentages) percentages.forEach(p => keywords.add(`${p} rate`));

          // Extract monetary values
          const money = text.match(/\d+(?:\.\d+)?\s*[€$£¥₺]/g);
          if (money) money.forEach(m => keywords.add(m));
        }
      });
    });

    return Array.from(keywords).filter(k => k.length > 2);
  }

  /**
   * Get table name by display name
   */
  async getTableNameByDisplayName(displayName: string, connectionId: string = 'default', databasePool?: Pool): Promise<string | null> {
    const tables = await this.getAllTables(connectionId, databasePool);
    const table = tables.find(t => t.displayName.toLowerCase() === displayName.toLowerCase());
    return table?.tableName || null;
  }

  /**
   * Get table names for SQL queries (returns actual table names)
   */
  async getTableNames(connectionId: string = 'default', databasePool?: Pool): Promise<{ [key: string]: string }> {
    const tables = await this.getAllTables(connectionId, databasePool);
    const tableNames: { [key: string]: string } = {};

    tables.forEach(table => {
      const key = table.tableName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
      tableNames[key] = table.tableName;
    });

    return tableNames;
  }

  /**
   * Check if table exists and is active
   */
  async isTableActive(tableName: string, connectionId: string = 'default', databasePool?: Pool): Promise<boolean> {
    const tables = await this.getAllTables(connectionId, databasePool);
    const table = tables.find(t => t.tableName.toLowerCase() === tableName.toLowerCase());
    return table?.isActive || false;
  }

  /**
   * Clear cache (useful after schema changes)
   */
  clearCache(): void {
    this.cache.clear();
    console.log('Table configuration cache cleared');
  }

  /**
   * Get multiple table configurations for different connections
   */
  async getAllConnectionConfigs(): Promise<Map<string, DatabaseTableConfig>> {
    return new Map(this.cache.entries());
  }
}

// Export singleton instance
export const tableConfigService = new TableConfigService();

// Export a quick helper function for backward compatibility
export const getTableDisplayName = async (tableName: string, connectionId?: string, databasePool?: Pool): Promise<string> => {
  return await tableConfigService.getDisplayName(tableName, connectionId, databasePool);
};

export default tableConfigService;