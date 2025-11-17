import { IDataObject } from 'n8n-workflow';

/**
 * Main ASEMB operation interface
 */
export interface IASEMBOperation {
	operation: 'process' | 'search' | 'manage';
	subOperation?: string;
	parameters: Record<string, any>;
}

/**
 * ASEMB result interface with metadata
 */
export interface IASEMBResult {
	success: boolean;
	operation: string;
	data: any;
	metadata?: {
		executionTime: number;
		itemsProcessed?: number;
		cacheHit?: boolean;
	};
}

/**
 * Process operation options
 */
export interface IProcessOptions {
	chunkSize?: number;
	chunkOverlap?: number;
	batchSize?: number;
	metadata?: IDataObject;
}

/**
 * Search operation options
 */
export interface ISearchOptions {
	limit?: number;
	similarityThreshold?: number;
	sourceFilter?: string;
	includeMetadata?: boolean;
}

/**
 * Manage operation options
 */
export interface IManageOptions {
	dryRun?: boolean;
	cascade?: boolean;
	workspace?: string;
}

/**
 * Search mode options
 */
export type SearchMode = 'hybrid' | 'vector' | 'keyword';

/**
 * Manage action types
 */
export type ManageAction = 'statistics' | 'deleteSource' | 'cleanup' | 'optimize';

/**
 * Process result structure
 */
export interface IProcessResult {
	sourceId: string;
	chunksCreated: number;
	contentLength: number;
	status: 'processed' | 'failed';
}

/**
 * Search result structure
 */
export interface ISearchResult {
	query: string;
	mode: SearchMode;
	results: any[];
	resultCount: number;
}

/**
 * Manage result structure
 */
export interface IManageResult {
	action: ManageAction;
	[key: string]: any;
}