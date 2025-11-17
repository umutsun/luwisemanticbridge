import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	NodeConnectionType,
} from 'n8n-workflow';

import axios from 'axios';
import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

export class WebScrapeEnhanced implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Web Scrape Enhanced',
		name: 'webScrapeEnhanced',
		icon: 'fa:globe',
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["scrapeMode"]}}',
		description: 'Advanced web scraping with content distillation powered by Readability',
		defaults: {
			name: 'Web Scrape Enhanced',
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
						description: 'Automatically detect and extract main content using Readability',
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
						name: 'Full HTML',
						value: 'full',
						description: 'Return complete HTML (for debugging)',
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
				displayName: 'Additional Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Remove Scripts',
						name: 'removeScripts',
						type: 'boolean',
						default: true,
						description: 'Remove JavaScript code from extracted content',
					},
					{
						displayName: 'Remove Styles',
						name: 'removeStyles',
						type: 'boolean',
						default: true,
						description: 'Remove CSS styles from extracted content',
					},
					{
						displayName: 'Extract Metadata',
						name: 'extractMetadata',
						type: 'boolean',
						default: true,
						description: 'Extract page metadata (title, author, date)',
					},
					{
						displayName: 'Extract Links',
						name: 'extractLinks',
						type: 'boolean',
						default: false,
						description: 'Extract all links from the content',
					},
					{
						displayName: 'Timeout (ms)',
						name: 'timeout',
						type: 'number',
						default: 10000,
						description: 'Request timeout in milliseconds',
					},
					{
						displayName: 'User Agent',
						name: 'userAgent',
						type: 'string',
						default: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
						description: 'User agent string for the request',
					},
					{
						displayName: 'Headers',
						name: 'headers',
						type: 'json',
						default: '{}',
						description: 'Additional headers for the request',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const url = this.getNodeParameter('url', i) as string;
				const scrapeMode = this.getNodeParameter('scrapeMode', i) as string;
				const options = this.getNodeParameter('options', i, {}) as any;

				// Prepare axios config
				const axiosConfig = {
					timeout: options.timeout || 10000,
					headers: {
						'User-Agent': options.userAgent || 'Mozilla/5.0',
						...(options.headers ? JSON.parse(options.headers) : {}),
					},
				};

				// Fetch the page
				const response = await axios.get(url, axiosConfig);
				const html = response.data;

				let result: any = {
					url,
					scrapeMode,
					timestamp: new Date().toISOString(),
				};

				if (scrapeMode === 'auto' || scrapeMode === 'article') {
					// Use Readability for content extraction
					const dom = new JSDOM(html as string, { url });
					const reader = new Readability(dom.window.document);
					const article = reader.parse();

					if (article) {
						result = {
							...result,
							title: article.title,
							content: article.textContent,
							excerpt: article.excerpt,
							length: article.length,
							byline: article.byline,
							dir: article.dir,
							siteName: article.siteName,
						};

						// Clean content if HTML is returned
						if (article.content && article.content.includes('<')) {
							const $ = cheerio.load(article.content);
							result.content = $('body').text().trim();
						}
					} else {
						// Fallback to cheerio if Readability fails
						const $ = cheerio.load(html as string);
						result.title = $('title').text() || $('h1').first().text();
						result.content = $('body').text().trim();
					}
				} else if (scrapeMode === 'custom') {
					// Use cheerio for custom selector
					const selector = this.getNodeParameter('selector', i) as string;
					const $ = cheerio.load(html as string);
					
					result.title = $('title').text();
					result.content = $(selector).text().trim();
					result.html = $(selector).html();
				} else if (scrapeMode === 'full') {
					// Return full HTML
					result.html = html;
					result.contentLength = (html as string).length;
				}

				// Process options
				if (options.removeScripts && result.content) {
					result.content = result.content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
				}

				if (options.removeStyles && result.content) {
					result.content = result.content.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
				}

				if (options.extractMetadata) {
					const $ = cheerio.load(html as string);
					result.metadata = {
						description: $('meta[name="description"]').attr('content') || 
									 $('meta[property="og:description"]').attr('content'),
						author: $('meta[name="author"]').attr('content'),
						keywords: $('meta[name="keywords"]').attr('content'),
						publishedTime: $('meta[property="article:published_time"]').attr('content'),
						modifiedTime: $('meta[property="article:modified_time"]').attr('content'),
						ogImage: $('meta[property="og:image"]').attr('content'),
						ogType: $('meta[property="og:type"]').attr('content'),
					};
				}

				if (options.extractLinks) {
					const $ = cheerio.load(html as string);
					const links: string[] = [];
					$('a[href]').each((_, elem) => {
						const href = $(elem).attr('href');
						if (href && !href.startsWith('#')) {
							// Convert relative URLs to absolute
							const absoluteUrl = new URL(href, url).href;
							links.push(absoluteUrl);
						}
					});
					result.links = [...new Set(links)]; // Remove duplicates
				}

				// Calculate reading time (average 200 words per minute)
				if (result.content) {
					const wordCount = result.content.split(/\s+/).length;
					result.wordCount = wordCount;
					result.readingTime = Math.ceil(wordCount / 200);
				}

				returnData.push({ json: result });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
							url: this.getNodeParameter('url', i) as string,
						},
					});
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`Failed to scrape ${this.getNodeParameter('url', i)}: ${(error as Error).message}`
					);
				}
			}
		}

		return [returnData];
	}
}
