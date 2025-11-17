import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeOperationError, NodeConnectionType } from 'n8n-workflow';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';

// Simple in-memory cache for robots.txt rules.
// In a multi-worker n8n setup, this cache would be per-worker.
// For a shared cache, Redis would be a better choice.
const robotsCache = new Map<string, Promise<boolean>>();

async function isAllowed(url: string, respectRobots: boolean, node: any): Promise<boolean> {
	if (!respectRobots) {
		return true;
	}
	const urlObj = new URL(url);
	const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;

	// Check if we already have a promise for this robots.txt
	if (robotsCache.has(robotsUrl)) {
		return robotsCache.get(robotsUrl)!;
	}

	// If not, create a new promise to fetch and parse it.
	// This promise is stored in the cache immediately to prevent race conditions
	// where multiple requests for the same domain are made concurrently.
	const promise = (async () => {
		try {
			// Dynamically import the robots parser.
			const { isAllowedByRobots } = await import('../shared/robots');
			return await isAllowedByRobots(url);
		} catch (error) {
			node.Logger.warn(`Could not check robots.txt for ${url}: ${(error as Error).message}`);
			// Default to not allowed if the robots.txt check fails for any reason.
			return false;
		}
	})();

	robotsCache.set(robotsUrl, promise);

	// Optional: Set a timeout to clear the cache entry after a while (e.g., 1 hour)
	// to avoid stale robots.txt rules.
	setTimeout(() => robotsCache.delete(robotsUrl), 3600 * 1000);

	return promise;
}


export class WebScrape implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Web Scrape',
		name: 'webScrape',
		group: ['transform'],
		version: 2.0,
		description: 'Fetch web pages and extract text content in parallel',
		defaults: {
			name: 'Web Scrape',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		properties: [
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				default: '',
				placeholder: 'https://example.com',
				required: true,
			},
			{
				displayName: 'CSS Selector',
				name: 'selector',
				type: 'string',
				default: 'body',
				description: 'Extract text within this selector',
			},
			{
				displayName: 'Strip HTML',
				name: 'stripHtml',
				type: 'boolean',
				default: true,
				description: 'Return plain text instead of HTML',
			},
			{
				displayName: 'Respect robots.txt',
				name: 'respectRobots',
				type: 'boolean',
				default: false,
				description: 'Check robots.txt for URL and skip if disallowed',
			},
			{
				displayName: 'Concurrency',
				name: 'concurrency',
				type: 'number',
				default: 10,
				description: 'Number of URLs to scrape in parallel',
			}
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const rawConcurrency = this.getNodeParameter('concurrency', 0, 10) as number | undefined;
		const concurrency = Math.max(1, Number(rawConcurrency ?? 10));
		const limit = pLimit(concurrency);

		const scrapePromises = items.map((item: INodeExecutionData, i: number) => limit(async () => {
			const url = this.getNodeParameter('url', i) as string;
			const selector = (this.getNodeParameter('selector', i) as string) || 'body';
			const stripHtml = this.getNodeParameter('stripHtml', i) as boolean;
			const respectRobots = this.getNodeParameter('respectRobots', i) as boolean;

			try {
				const allowed = await isAllowed(url, respectRobots, this.getNode());
				if (!allowed) {
					return { json: { ...item.json, content: '', skipped: true, reason: 'robots_disallow' } };
				}

				const res = await fetch(url, { headers: { 'User-Agent': 'n8n-node-web-scrape/2.0' } });
				if (!res.ok) throw new Error(`HTTP ${res.status}`);

				const html = await res.text();
				const $ = cheerio.load(html);
				const el = $(selector);
				if (!el || el.length === 0) throw new Error('Selector matched no elements');

				const content = stripHtml ? el.text().trim() : el.html() || '';
				return { json: { ...item.json, url, selector, content } };
			} catch (err) {
				// Attach the error to the item, but don't fail the whole node.
				// The user can use an If node to filter for items with an error property.
				return { json: { ...item.json, url, selector, error: (err as Error).message }, error: new NodeOperationError(this.getNode(), (err as Error).message, { itemIndex: i }) };
			}
		}));

		// Wait for all promises to settle, whether they succeed or fail.
		const results = await Promise.all(scrapePromises);

		return [results];
	}
}
