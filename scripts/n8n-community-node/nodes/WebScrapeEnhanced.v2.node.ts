import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	NodeConnectionType,
	IDataObject,
} from 'n8n-workflow';

import axios, { AxiosError } from 'axios';
import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { URL } from 'url';
import robotsParser from 'robots-txt-parser';
import pRetry from 'p-retry';
import { RateLimiter } from 'limiter';

/**
 * Enhanced Web Scraper with Comprehensive Error Handling
 * Features:
 * 1. Robust error handling and recovery
 * 2. Retry logic with exponential backoff
 * 3. Rate limiting to prevent blocking
 * 4. Robots.txt compliance
 * 5. Content validation and sanitization
 * 6. Multiple fallback strategies
 * 7. Detailed error reporting
 */

interface ScrapeError {
	type: 'network' | 'parsing' | 'validation' | 'permission' | 'timeout' | 'unknown';
	message: string;
	code?: string;
	statusCode?: number;
	details?: any;
	suggestion?: string;
}

interface ScrapeResult {
	success: boolean;
	url: string;
	data?: any;
	error?: ScrapeError;
	retries?: number;
	duration?: number;
	fallbackUsed?: string;
}

export class WebScrapeEnhancedV2 implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Web Scrape Enhanced v2',
		name: 'webScrapeEnhancedV2',
		icon: 'fa:globe',
		group: ['input'],
		version: 2,
		subtitle: '={{$parameter["scrapeMode"]}}',
		description: 'Advanced web scraping with robust error handling and recovery',
		defaults: {
			name: 'Web Scrape Enhanced v2',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		properties: [
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				default: '',
				required: true,
				description: 'URL of the webpage to scrape',
			},
			{
				displayName: 'Scrape Mode',
				name: 'scrapeMode',
				type: 'options',
				options: [
					{
						name: 'Auto (Smart Detection)',
						value: 'auto',
						description: 'Automatically detect and extract main content',
					},
					{
						name: 'Article Mode',
						value: 'article',
						description: 'Extract article content (best for blogs, news)',
					},
					{
						name: 'Custom Selector',
						value: 'custom',
						description: 'Use CSS selectors to extract specific elements',
					},
					{
						name: 'Structured Data',
						value: 'structured',
						description: 'Extract JSON-LD and microdata',
					},
				],
				default: 'auto',
				description: 'How to extract content from the page',
			},
			{
				displayName: 'CSS Selector',
				name: 'selector',
				type: 'string',
				displayOptions: {
					show: {
						scrapeMode: ['custom'],
					},
				},
				default: '',
				placeholder: 'e.g., article.main-content, div#content',
				description: 'CSS selector to extract specific content',
			},
			{
				displayName: 'Error Handling',
				name: 'errorHandling',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Retry Count',
						name: 'retryCount',
						type: 'number',
						default: 3,
						description: 'Number of retry attempts on failure',
					},
					{
						displayName: 'Retry Delay (ms)',
						name: 'retryDelay',
						type: 'number',
						default: 1000,
						description: 'Initial delay between retries (exponential backoff)',
					},
					{
						displayName: 'Timeout (ms)',
						name: 'timeout',
						type: 'number',
						default: 10000,
						description: 'Request timeout in milliseconds',
					},
					{
						displayName: 'Continue On Fail',
						name: 'continueOnFail',
						type: 'boolean',
						default: true,
						description: 'Continue workflow even if scraping fails',
					},
					{
						displayName: 'Fallback Strategy',
						name: 'fallbackStrategy',
						type: 'options',
						options: [
							{
								name: 'None',
								value: 'none',
							},
							{
								name: 'Basic Text Extraction',
								value: 'basic',
							},
							{
								name: 'Headless Browser',
								value: 'headless',
							},
							{
								name: 'Archive.org Wayback',
								value: 'wayback',
							},
						],
						default: 'basic',
						description: 'Fallback method if primary scraping fails',
					},
				],
			},
			{
				displayName: 'Rate Limiting',
				name: 'rateLimiting',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Enable Rate Limiting',
						name: 'enabled',
						type: 'boolean',
						default: true,
						description: 'Limit request rate to avoid blocking',
					},
					{
						displayName: 'Requests Per Second',
						name: 'requestsPerSecond',
						type: 'number',
						default: 1,
						description: 'Maximum requests per second',
					},
					{
						displayName: 'Respect Robots.txt',
						name: 'respectRobots',
						type: 'boolean',
						default: true,
						description: 'Check robots.txt before scraping',
					},
				],
			},
			{
				displayName: 'Content Options',
				name: 'contentOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Remove Scripts',
						name: 'removeScripts',
						type: 'boolean',
						default: true,
					},
					{
						displayName: 'Remove Styles',
						name: 'removeStyles',
						type: 'boolean',
						default: true,
					},
					{
						displayName: 'Extract Metadata',
						name: 'extractMetadata',
						type: 'boolean',
						default: true,
					},
					{
						displayName: 'Extract Links',
						name: 'extractLinks',
						type: 'boolean',
						default: false,
					},
					{
						displayName: 'Validate Content',
						name: 'validateContent',
						type: 'boolean',
						default: true,
						description: 'Validate extracted content quality',
					},
					{
						displayName: 'Min Content Length',
						name: 'minContentLength',
						type: 'number',
						default: 100,
						description: 'Minimum content length to consider valid',
					},
				],
			},
		],
	};

	private rateLimiters: Map<string, RateLimiter> = new Map();

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			const startTime = Date.now();
			const url = this.getNodeParameter('url', i) as string;
			const scrapeMode = this.getNodeParameter('scrapeMode', i) as string;
			const errorHandling = this.getNodeParameter('errorHandling', i, {}) as IDataObject;
			const rateLimiting = this.getNodeParameter('rateLimiting', i, {}) as IDataObject;
			const contentOptions = this.getNodeParameter('contentOptions', i, {}) as IDataObject;

			try {
				// Validate URL
				const validatedUrl = this.validateUrl(url);

				// Check rate limiting
				if (rateLimiting.enabled !== false) {
					await this.enforceRateLimit(validatedUrl, rateLimiting);
				}

				// Check robots.txt compliance
				if (rateLimiting.respectRobots !== false) {
					const canScrape = await this.checkRobotsTxt(validatedUrl);
					if (!canScrape) {
						throw this.createError('permission', 'Blocked by robots.txt', { url: validatedUrl });
					}
				}

				// Perform scraping with retry logic
				const result = await this.scrapeWithRetry(
					validatedUrl,
					scrapeMode,
					errorHandling,
					contentOptions,
					i
				);

				// Validate content if enabled
				if (contentOptions.validateContent !== false && result.data) {
					this.validateContent(result.data, contentOptions);
				}

				// Add metadata
				result.duration = Date.now() - startTime;
				returnData.push({ json: result });

			} catch (error) {
				const scrapeError = this.handleError(error, url);
				
				if (errorHandling.continueOnFail !== false) {
					// Try fallback strategy
					const fallbackResult = await this.tryFallbackStrategy(
						url,
						errorHandling.fallbackStrategy as string,
						scrapeError
					);
					
					returnData.push({ 
						json: {
							...fallbackResult,
							duration: Date.now() - startTime
						}
					});
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`Scraping failed: ${scrapeError.message}`,
						{ 
							description: scrapeError.suggestion,
							itemIndex: i 
						}
					);
				}
			}
		}

		return [returnData];
	}

	private async scrapeWithRetry(
		url: string,
		scrapeMode: string,
		errorHandling: IDataObject,
		contentOptions: IDataObject,
		itemIndex: number
	): Promise<ScrapeResult> {
		const retryCount = (errorHandling.retryCount as number) || 3;
		const retryDelay = (errorHandling.retryDelay as number) || 1000;
		const timeout = (errorHandling.timeout as number) || 10000;

		return pRetry(
			async (attemptCount) => {
				try {
					const html = await this.fetchPage(url, timeout);
					const data = await this.extractContent(
						html,
						url,
						scrapeMode,
						contentOptions,
						itemIndex
					);

					return {
						success: true,
						url,
						data,
						retries: attemptCount - 1,
					};
				} catch (error) {
					console.log(`Attempt ${attemptCount} failed: ${(error as Error).message}`);
					throw error;
				}
			},
			{
				retries: retryCount,
				minTimeout: retryDelay,
				factor: 2, // Exponential backoff
				onFailedAttempt: (error) => {
					console.log(`Scraping attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`);
				},
			}
		);
	}

	private async fetchPage(url: string, timeout: number): Promise<string> {
		try {
			const response = await axios.get(url, {
				timeout,
				headers: {
					'User-Agent': 'Mozilla/5.0 (compatible; n8n-WebScraper/2.0)',
					'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
					'Accept-Language': 'en-US,en;q=0.5',
					'Accept-Encoding': 'gzip, deflate',
					'Connection': 'keep-alive',
					'Upgrade-Insecure-Requests': '1',
				},
				maxRedirects: 5,
				validateStatus: (status) => status < 400,
			});

			return response.data;
		} catch (error) {
			if (axios.isAxiosError(error)) {
				const axiosError = error as AxiosError;
				if (axiosError.response) {
					throw this.createError(
						'network',
						`HTTP ${axiosError.response.status}: ${axiosError.response.statusText}`,
						{
							statusCode: axiosError.response.status,
							url,
						}
					);
				} else if (axiosError.code === 'ECONNABORTED') {
					throw this.createError('timeout', `Request timeout after ${timeout}ms`, { url });
				} else {
					throw this.createError('network', axiosError.message, { url });
				}
			}
			throw error;
		}
	}

	private async extractContent(
		html: string,
		url: string,
		scrapeMode: string,
		contentOptions: IDataObject,
		itemIndex: number
	): Promise<any> {
		let result: any = {
			url,
			scrapeMode,
			timestamp: new Date().toISOString(),
		};

		try {
			switch (scrapeMode) {
				case 'auto':
				case 'article':
					result = await this.extractArticle(html, url, result);
					break;
				
				case 'custom':
					const selector = this.getNodeParameter('selector', itemIndex) as string;
					result = this.extractCustom(html, selector, result);
					break;
				
				case 'structured':
					result = this.extractStructuredData(html, result);
					break;
				
				default:
					result = this.extractBasic(html, result);
			}

			// Apply content options
			if (contentOptions.removeScripts && result.content) {
				result.content = this.removeScripts(result.content);
			}

			if (contentOptions.removeStyles && result.content) {
				result.content = this.removeStyles(result.content);
			}

			if (contentOptions.extractMetadata) {
				result.metadata = this.extractMetadata(html);
			}

			if (contentOptions.extractLinks) {
				result.links = this.extractLinks(html, url);
			}

			// Calculate content metrics
			if (result.content) {
				const wordCount = result.content.split(/\s+/).length;
				result.metrics = {
					wordCount,
					readingTime: Math.ceil(wordCount / 200),
					contentLength: result.content.length,
				};
			}

			return result;

		} catch (error) {
			throw this.createError('parsing', `Content extraction failed: ${(error as Error).message}`, { url });
		}
	}

	private async extractArticle(html: string, url: string, result: any): Promise<any> {
		try {
			const dom = new JSDOM(html, { url });
			const reader = new Readability(dom.window.document);
			const article = reader.parse();

			if (article) {
				return {
					...result,
					title: article.title,
					content: article.textContent,
					excerpt: article.excerpt,
					byline: article.byline,
					siteName: article.siteName,
				};
			}
		} catch (error) {
			console.log('Readability failed, falling back to cheerio');
		}

		// Fallback to cheerio
		return this.extractBasic(html, result);
	}

	private extractCustom(html: string, selector: string, result: any): any {
		const $ = cheerio.load(html);
		const elements = $(selector);
		
		if (elements.length === 0) {
			throw this.createError('parsing', `No elements found for selector: ${selector}`);
		}

		return {
			...result,
			title: $('title').text(),
			content: elements.text().trim(),
			html: elements.html(),
			elementsFound: elements.length,
		};
	}

	private extractStructuredData(html: string, result: any): any {
		const $ = cheerio.load(html);
		const structuredData: any[] = [];

		// Extract JSON-LD
		$('script[type="application/ld+json"]').each((_, elem) => {
			try {
				const data = JSON.parse($(elem).html() || '{}');
				structuredData.push(data);
			} catch (e) {
				// Invalid JSON, skip
			}
		});

		// Extract Open Graph metadata
		const ogData: any = {};
		$('meta[property^="og:"]').each((_, elem) => {
			const property = $(elem).attr('property')?.replace('og:', '');
			if (property) {
				ogData[property] = $(elem).attr('content');
			}
		});

		return {
			...result,
			structuredData,
			openGraph: ogData,
			title: $('title').text() || ogData.title,
			content: $('body').text().trim(),
		};
	}

	private extractBasic(html: string, result: any): any {
		const $ = cheerio.load(html);
		
		// Remove unwanted elements
		$('script, style, noscript, iframe').remove();
		
		return {
			...result,
			title: $('title').text() || $('h1').first().text(),
			content: $('body').text().trim(),
		};
	}

	private extractMetadata(html: string): any {
		const $ = cheerio.load(html);
		
		return {
			description: $('meta[name="description"]').attr('content') || 
						$('meta[property="og:description"]').attr('content'),
			author: $('meta[name="author"]').attr('content'),
			keywords: $('meta[name="keywords"]').attr('content'),
			publishedTime: $('meta[property="article:published_time"]').attr('content'),
			modifiedTime: $('meta[property="article:modified_time"]').attr('content'),
			ogImage: $('meta[property="og:image"]').attr('content'),
			ogType: $('meta[property="og:type"]').attr('content'),
			viewport: $('meta[name="viewport"]').attr('content'),
			robots: $('meta[name="robots"]').attr('content'),
		};
	}

	private extractLinks(html: string, baseUrl: string): string[] {
		const $ = cheerio.load(html);
		const links: Set<string> = new Set();
		
		$('a[href]').each((_, elem) => {
			const href = $(elem).attr('href');
			if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
				try {
					const absoluteUrl = new URL(href, baseUrl).href;
					links.add(absoluteUrl);
				} catch (e) {
					// Invalid URL, skip
				}
			}
		});
		
		return Array.from(links);
	}

	private validateUrl(url: string): string {
		try {
			const parsed = new URL(url);
			if (!['http:', 'https:'].includes(parsed.protocol)) {
				throw new Error('Invalid protocol');
			}
			return parsed.href;
		} catch (error) {
			throw this.createError('validation', `Invalid URL: ${url}`);
		}
	}

	private validateContent(data: any, options: IDataObject): void {
		const minLength = (options.minContentLength as number) || 100;
		
		if (!data.content || data.content.length < minLength) {
			throw this.createError(
				'validation',
				`Content too short (${data.content?.length || 0} chars, minimum ${minLength})`,
				{
					suggestion: 'Try a different scraping mode or selector'
				}
			);
		}

		// Check for common error patterns
		const errorPatterns = [
			/access denied/i,
			/403 forbidden/i,
			/404 not found/i,
			/please enable javascript/i,
			/are you a robot/i,
		];

		for (const pattern of errorPatterns) {
			if (pattern.test(data.content)) {
				throw this.createError(
					'validation',
					`Content appears to be an error page`,
					{
						pattern: pattern.toString(),
						suggestion: 'The page may require authentication or JavaScript rendering'
					}
				);
			}
		}
	}

	private async enforceRateLimit(url: string, options: IDataObject): Promise<void> {
		const domain = new URL(url).hostname;
		const requestsPerSecond = (options.requestsPerSecond as number) || 1;
		
		if (!this.rateLimiters.has(domain)) {
			this.rateLimiters.set(domain, new RateLimiter({
				tokensPerInterval: requestsPerSecond,
				interval: 'second',
			}));
		}
		
		const limiter = this.rateLimiters.get(domain)!;
		const hasToken = await limiter.tryRemoveTokens(1);
		
		if (!hasToken) {
			// Wait for next available slot
			await new Promise(resolve => setTimeout(resolve, 1000 / requestsPerSecond));
		}
	}

	private async checkRobotsTxt(url: string): Promise<boolean> {
		try {
			const parsed = new URL(url);
			const robotsUrl = `${parsed.protocol}//${parsed.hostname}/robots.txt`;
			
			const response = await axios.get(robotsUrl, { 
				timeout: 5000,
				validateStatus: (status) => status < 500 
			});
			
			if (response.status === 404) {
				// No robots.txt means we can scrape
				return true;
			}
			
			const robots = robotsParser({
				userAgent: 'n8n-WebScraper',
				allowOnNeutral: true,
			});
			
			await robots.parse(response.data);
			return robots.isAllowed(url);
			
		} catch (error) {
			// If we can't check robots.txt, allow scraping
			return true;
		}
	}

	private async tryFallbackStrategy(
		url: string,
		strategy: string,
		originalError: ScrapeError
	): Promise<ScrapeResult> {
		switch (strategy) {
			case 'basic':
				return this.basicTextFallback(url, originalError);
			
			case 'wayback':
				return this.waybackMachineFallback(url, originalError);
			
			case 'headless':
				return this.headlessBrowserFallback(url, originalError);
			
			default:
				return {
					success: false,
					url,
					error: originalError,
				};
		}
	}

	private async basicTextFallback(url: string, originalError: ScrapeError): Promise<ScrapeResult> {
		try {
			const response = await axios.get(url, {
				timeout: 5000,
				responseType: 'text',
				headers: {
					'User-Agent': 'Mozilla/5.0 (compatible; BasicBot/1.0)',
				},
			});
			
			// Strip all HTML tags
			const text = response.data.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
			
			return {
				success: true,
				url,
				data: {
					content: text,
					fallbackUsed: 'basic',
				},
				fallbackUsed: 'basic',
			};
		} catch (error) {
			return {
				success: false,
				url,
				error: originalError,
				fallbackUsed: 'basic',
			};
		}
	}

	private async waybackMachineFallback(url: string, originalError: ScrapeError): Promise<ScrapeResult> {
		try {
			// Get latest snapshot from Wayback Machine
			const availabilityUrl = `http://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
			const response = await axios.get(availabilityUrl, { timeout: 5000 });
			
			if (response.data?.archived_snapshots?.closest?.available) {
				const snapshotUrl = response.data.archived_snapshots.closest.url;
				const snapshotResponse = await axios.get(snapshotUrl, { timeout: 10000 });
				
				const $ = cheerio.load(snapshotResponse.data);
				$('script, style').remove();
				
				return {
					success: true,
					url,
					data: {
						content: $('body').text().trim(),
						title: $('title').text(),
						fallbackUsed: 'wayback',
						snapshotUrl,
						snapshotDate: response.data.archived_snapshots.closest.timestamp,
					},
					fallbackUsed: 'wayback',
				};
			}
		} catch (error) {
			// Wayback failed
		}
		
		return {
			success: false,
			url,
			error: originalError,
			fallbackUsed: 'wayback',
		};
	}

	private async headlessBrowserFallback(url: string, originalError: ScrapeError): Promise<ScrapeResult> {
		// This would require puppeteer or playwright
		// For now, return the original error
		return {
			success: false,
			url,
			error: {
				...originalError,
				suggestion: 'Headless browser fallback not implemented. Consider using Puppeteer node.',
			},
			fallbackUsed: 'headless',
		};
	}

	private removeScripts(content: string): string {
		return content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
	}

	private removeStyles(content: string): string {
		return content.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
	}

	private createError(
		type: ScrapeError['type'],
		message: string,
		details?: any
	): Error & { scrapeError: ScrapeError } {
		const scrapeError: ScrapeError = {
			type,
			message,
			details,
			suggestion: this.getErrorSuggestion(type, details),
		};
		
		const error = new Error(message) as Error & { scrapeError: ScrapeError };
		error.scrapeError = scrapeError;
		return error;
	}

	private getErrorSuggestion(type: ScrapeError['type'], details?: any): string {
		switch (type) {
			case 'network':
				if (details?.statusCode === 403) {
					return 'The server blocked the request. Try using different headers or a proxy.';
				}
				if (details?.statusCode === 404) {
					return 'Page not found. Check if the URL is correct.';
				}
				return 'Check your network connection and the URL.';
			
			case 'timeout':
				return 'The request took too long. Try increasing the timeout or check if the site is responsive.';
			
			case 'parsing':
				return 'Failed to parse the content. Try a different scraping mode or selector.';
			
			case 'permission':
				return 'Access denied. The site may have anti-scraping measures or require authentication.';
			
			case 'validation':
				return details?.suggestion || 'The extracted content failed validation. Check the page structure.';
			
			default:
				return 'An unexpected error occurred. Check the logs for more details.';
		}
	}

	private handleError(error: any, url: string): ScrapeError {
		if (error.scrapeError) {
			return error.scrapeError;
		}
		
		if (axios.isAxiosError(error)) {
			const axiosError = error as AxiosError;
			return {
				type: 'network',
				message: axiosError.message,
				code: axiosError.code,
				statusCode: axiosError.response?.status,
				details: { url },
				suggestion: this.getErrorSuggestion('network', { statusCode: axiosError.response?.status }),
			};
		}
		
		return {
			type: 'unknown',
			message: error.message || 'Unknown error',
			details: { url },
			suggestion: 'An unexpected error occurred. Check the logs for more details.',
		};
	}
}