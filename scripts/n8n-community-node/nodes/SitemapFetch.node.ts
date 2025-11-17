import type { IExecuteFunctions } from 'n8n-workflow';
import type { INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeOperationError, NodeConnectionType } from 'n8n-workflow';

function extractLocs(xml: string): string[] {
  const locs: string[] = [];
  const regex = /<loc>([^<]+)<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(xml)) !== null) {
    const url = m[1].trim();
    if (url) locs.push(url);
  }
  return Array.from(new Set(locs));
}

export class SitemapFetch implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Sitemap Fetch',
    name: 'sitemapFetch',
    group: ['transform'],
    version: 1,
    description: 'Fetch a sitemap.xml and emit URLs',
    defaults: { name: 'Sitemap Fetch' },
    inputs: [NodeConnectionType.Main],
    outputs: [NodeConnectionType.Main],
    properties: [
      { displayName: 'Sitemap URL', name: 'sitemapUrl', type: 'string', default: '', required: true },
      { displayName: 'Max URLs', name: 'maxUrls', type: 'number', default: 1000 },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const out: INodeExecutionData[] = [];
    const countItems = Math.max(1, items.length);
    for (let i = 0; i < countItems; i++) {
      const sitemapUrl = this.getNodeParameter('sitemapUrl', i) as string;
      const maxUrls = this.getNodeParameter('maxUrls', i) as number;
      try {
        const res = await fetch(sitemapUrl, { headers: { 'User-Agent': 'n8n-node-sitemap-fetch/1.0' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        const locs = extractLocs(xml).slice(0, maxUrls);
        for (const url of locs) out.push({ json: { url } });
      } catch (err) {
        throw new NodeOperationError(this.getNode(), (err as Error).message, { itemIndex: i });
      }
    }
    return [out];
  }
}

