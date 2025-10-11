/**
 * Dynamic Table Names Utility
 * Gets table names and display names from the database instead of using hardcoded values
 */

import { getApiUrl } from '@/lib/config';

export interface TableInfo {
  name: string;
  displayName: string;
  database: string;
}

// Cache for table names
let tableCache: TableInfo[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch table names from the database
 */
export async function getTableNames(): Promise<TableInfo[]> {
  // Check cache first
  if (tableCache && Date.now() - cacheTimestamp < CACHE_TTL) {
    return tableCache;
  }

  try {
    const response = await fetch(`${getApiUrl()}/api/v2/embeddings-tables/all?t=${Date.now()}`, {
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (response.ok) {
      const data = await response.json();
      tableCache = data.tables || [];
      cacheTimestamp = Date.now();
      return tableCache;
    }
  } catch (error) {
    console.error('Failed to fetch table names:', error);
  }

  // Return empty array on error
  return [];
}

/**
 * Get display name for a table
 */
export async function getTableDisplayName(tableName: string): Promise<string> {
  const tables = await getTableNames();
  const table = tables.find(t => t.name === tableName);
  return table?.displayName || tableName;
}

/**
 * Get table name by display name
 */
export async function getTableNameByDisplayName(displayName: string): Promise<string | null> {
  const tables = await getTableNames();
  const table = tables.find(t => t.displayName === displayName);
  return table?.name || null;
}

/**
 * Legacy compatibility - converts old TABLES constants to dynamic values
 */
export async function getDynamicTables() {
  const tables = await getTableNames();

  // Convert to old format for backward compatibility
  const dynamicTables: { [key: string]: string } = {};

  tables.forEach(table => {
    // Create various key formats
    const upperKey = table.name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const camelKey = table.name.toLowerCase().replace(/[^a-z0-9]/g, '_');

    dynamicTables[upperKey] = table.displayName;
    dynamicTables[camelKey] = table.displayName;
    dynamicTables[table.name] = table.displayName;
  });

  return dynamicTables;
}

/**
 * Check if a table exists
 */
export async function tableExists(tableName: string): Promise<boolean> {
  const tables = await getTableNames();
  return tables.some(t => t.name === tableName);
}

/**
 * Clear the table names cache
 */
export function clearTableCache(): void {
  tableCache = null;
  cacheTimestamp = 0;
}