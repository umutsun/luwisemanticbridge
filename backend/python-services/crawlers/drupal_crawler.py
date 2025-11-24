#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Drupal Site Crawler - Uses REST API for fast content extraction"""

import asyncio
import json
import re
import sys
import os
from datetime import datetime
from urllib.parse import urljoin, urlparse
from typing import List, Dict, Any

import redis
import aiohttp
from bs4 import BeautifulSoup

# --- Configuration ---
# Crawler name will be set dynamically from command line argument
CRAWLER_NAME = None  # Will be set in main()
STATE_FILE = os.path.join(os.path.dirname(__file__), 'drupal_crawler_state.json')
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
REDIS_DB = int(os.getenv('REDIS_DB', 0))
# REDIS_KEY_PREFIX will be dynamic: 'crawl4ai:{CRAWLER_NAME}'
# --- End of Configuration ---

r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, decode_responses=True)

def clean_html(html):
    """Clean HTML and extract text"""
    if not html:
        return ""
    soup = BeautifulSoup(html, 'html.parser')

    # Remove script, style, and other non-content tags
    for element in soup(['script', 'style', 'noscript', 'iframe', 'svg']):
        element.decompose()

    # Get text with proper spacing
    text = soup.get_text(separator='\n\n', strip=True)

    # Clean up whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)

    return text.strip()

def save_state(state, crawler_name=None):
    """Save crawler state to JSON file AND Redis"""
    try:
        # Save to file (backup)
        with open(STATE_FILE, 'w', encoding='utf-8') as f:
            json.dump(state, f, ensure_ascii=False, indent=2)

        # Save to Redis (realtime)
        if crawler_name:
            redis_key = f"crawl4ai:{crawler_name}:_state"
            r.set(redis_key, json.dumps(state, ensure_ascii=False))
            print(f"[STATE] Saved: {len(state.get('visited', []))} visited (file + Redis)")
        else:
            print(f"[STATE] Saved: {len(state.get('visited', []))} visited (file only)")
    except Exception as e:
        print(f"[ERROR] Failed to save state: {e}")

def load_state():
    """Load crawler state from JSON file"""
    try:
        if os.path.exists(STATE_FILE):
            with open(STATE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except:
        pass
    return {'visited': [], 'stats': {'pages': 0, 'articles': 0}}

class DrupalCrawler:
    def __init__(self, base_url: str, crawler_name: str):
        self.base_url = base_url.rstrip('/')
        self.crawler_name = crawler_name
        parsed = urlparse(base_url)
        self.domain = f"{parsed.scheme}://{parsed.netloc}"
        self.session = None
        self.state = load_state()

        # Drupal REST API endpoints (common patterns)
        self.api_endpoints = [
            '/jsonapi/node/article',
            '/jsonapi/node/page',
            '/jsonapi/node/blog',
            '/api/v1/node/article',
            '/api/v1/node/page',
            '/rest/node/article',
            '/rest/node/page',
        ]

    async def __aenter__(self):
        timeout = aiohttp.ClientTimeout(total=30)
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json, text/html',
        }
        self.session = aiohttp.ClientSession(timeout=timeout, headers=headers)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    async def fetch_json(self, url: str) -> Dict[str, Any]:
        """Fetch JSON from URL"""
        try:
            async with self.session.get(url) as response:
                if response.status == 200:
                    content_type = response.headers.get('Content-Type', '')
                    if 'application/json' in content_type:
                        return await response.json()
                    else:
                        print(f"  [WARN] Not JSON: {url}")
                        return None
                else:
                    return None
        except Exception as e:
            print(f"  [ERROR] {str(e)[:100]}")
            return None

    async def fetch_html(self, url: str) -> str:
        """Fetch HTML from URL"""
        try:
            async with self.session.get(url) as response:
                if response.status == 200:
                    return await response.text()
                return None
        except Exception as e:
            print(f"  [ERROR] {str(e)[:100]}")
            return None

    async def try_jsonapi(self) -> List[Dict]:
        """Try to fetch content via Drupal JSON:API"""
        all_items = []

        # Try both article and page endpoints separately
        for endpoint in self.api_endpoints:
            url = f"{self.domain}{endpoint}"
            print(f"  [API] Trying: {url}")

            data = await self.fetch_json(url)

            if data and 'data' in data:
                endpoint_type = endpoint.split('/')[-1]  # Extract 'article' or 'page'
                print(f"  [API] ✓ Found JSON:API endpoint: {endpoint}")

                # JSON:API format
                items = data['data']
                if not isinstance(items, list):
                    items = [items]

                endpoint_items = []
                for item in items:
                    attrs = item.get('attributes', {})
                    endpoint_items.append({
                        'id': item.get('id'),
                        'type': endpoint_type,  # Use endpoint type (article/page)
                        'title': attrs.get('title', ''),
                        'body': attrs.get('body', {}).get('value', ''),
                        'summary': attrs.get('body', {}).get('summary', ''),
                        'created': attrs.get('created', ''),
                        'changed': attrs.get('changed', ''),
                        'url': f"{self.domain}{attrs.get('path', {}).get('alias', '')}" if attrs.get('path') else None
                    })

                # Check for pagination - fetch ALL pages
                links = data.get('links', {})
                next_url = links.get('next', {}).get('href') if isinstance(links.get('next'), dict) else links.get('next')

                page_count = 1
                while next_url:
                    page_count += 1
                    print(f"  [API] Fetching page {page_count} for {endpoint_type}...")
                    next_data = await self.fetch_json(next_url)

                    if next_data and 'data' in next_data:
                        for item in next_data['data']:
                            attrs = item.get('attributes', {})
                            endpoint_items.append({
                                'id': item.get('id'),
                                'type': endpoint_type,
                                'title': attrs.get('title', ''),
                                'body': attrs.get('body', {}).get('value', ''),
                                'summary': attrs.get('body', {}).get('summary', ''),
                                'created': attrs.get('created', ''),
                                'changed': attrs.get('changed', ''),
                                'url': f"{self.domain}{attrs.get('path', {}).get('alias', '')}" if attrs.get('path') else None
                            })

                        # Get next page link
                        next_links = next_data.get('links', {})
                        next_url = next_links.get('next', {}).get('href') if isinstance(next_links.get('next'), dict) else next_links.get('next')
                    else:
                        break

                print(f"  [API] ✓ Fetched {len(endpoint_items)} {endpoint_type}s from {page_count} pages")
                all_items.extend(endpoint_items)
                # REMOVED: break statement - continue to try other endpoints

        if all_items:
            print(f"  [API] ✓ Total items collected: {len(all_items)}")
        return all_items

    async def crawl_sitemap(self) -> List[str]:
        """Try to fetch URLs from sitemap.xml"""
        urls = []
        sitemap_urls = [
            f"{self.domain}/sitemap.xml",
            f"{self.domain}/sitemap_index.xml"
        ]

        for sitemap_url in sitemap_urls:
            print(f"  [SITEMAP] Trying: {sitemap_url}")
            html = await self.fetch_html(sitemap_url)

            if html:
                # Extract URLs from sitemap
                soup = BeautifulSoup(html, 'xml')
                locs = soup.find_all('loc')

                for loc in locs:
                    url = loc.text.strip()
                    if url and self.domain in url:
                        urls.append(url)

                if urls:
                    print(f"  [SITEMAP] ✓ Found {len(urls)} URLs")
                    break

        return urls

    def extract_categories_from_html(self, soup) -> List[str]:
        """Extract categories/tags from Drupal HTML"""
        categories = []

        # Try common Drupal category/tag selectors
        for selector in [
            '.field--name-field-tags a',
            '.field--name-field-category a',
            '.field--type-entity-reference a',
            '.tags a',
            '.taxonomy a'
        ]:
            elements = soup.select(selector)
            for el in elements:
                text = el.get_text(strip=True)
                if text and text not in categories:
                    categories.append(text)

        return categories

    async def process_item(self, item: Dict):
        """Process and save item to Redis"""
        item_id = item.get('id', '')
        item_url = item.get('url') or f"{self.domain}/node/{item_id}"

        if item_url in self.state['visited']:
            return

        # Check Redis for duplicates
        slug = urlparse(item_url).path.strip('/').replace('/', '_') or str(item_id)
        redis_key = f"crawl4ai:{self.crawler_name}:{slug}"

        if r.exists(redis_key):
            print(f"\n[SKIP] Already in Redis: {slug}")
            self.state['visited'].append(item_url)
            return

        print(f"\n[ARTICLE] {item.get('title', 'Untitled')}")
        print(f"  URL: {item_url}")

        # Clean content
        body_html = item.get('body', '')
        clean_content = clean_html(body_html)

        summary = item.get('summary', '')
        if summary:
            clean_summary = clean_html(summary)
        else:
            # Generate summary from content (first 300 chars)
            clean_summary = clean_content[:300] + '...' if len(clean_content) > 300 else clean_content

        # Extract categories from HTML if available (or use provided categories from sitemap)
        categories = item.get('categories', [])
        if not categories and body_html:
            try:
                soup = BeautifulSoup(body_html, 'html.parser')
                categories = self.extract_categories_from_html(soup)
            except:
                pass

        # Build data structure
        current_timestamp = datetime.utcnow().isoformat()
        data = {
            'title': item.get('title', ''),
            'content': clean_content,
            'excerpt': clean_summary,
            'url': item_url,
            'page_url': item_url,
            'item_id': item_id,
            'content_type': item.get('type', 'page'),
            'categories': categories,
            'created_date': item.get('created', ''),
            'modified_date': item.get('changed', ''),
            'crawled_at': current_timestamp,
            'scraped_at': current_timestamp,
            'timestamp': current_timestamp,
            'source': 'drupal_api',
            'cms': 'drupal'
        }

        # Save to Redis
        try:
            json_data = json.dumps(data, ensure_ascii=False, indent=2)
            r.set(redis_key, json_data)
            print(f"  [REDIS] Saved: {redis_key}")
            print(f"  Content: {len(clean_content)} chars")
            if categories:
                print(f"  Categories: {', '.join(categories)}")

            self.state['visited'].append(item_url)
            self.state['stats']['articles'] += 1

        except Exception as e:
            print(f"  [ERROR] Redis save failed: {e}")

    async def run(self):
        """Run the crawler"""
        print(f"\n{'='*60}")
        print(f"Drupal Site Crawler")
        print(f"{'='*60}")
        print(f"Base URL: {self.base_url}")
        print(f"{'='*60}\n")

        start_time = datetime.now()

        try:
            # Try JSON:API first (fastest)
            print("[STRATEGY] Trying Drupal JSON:API...")
            items = await self.try_jsonapi()

            if items:
                print(f"\n[SUCCESS] Found {len(items)} items via JSON:API")

                for i, item in enumerate(items, 1):
                    print(f"\n--- Item {i}/{len(items)} ---")
                    await self.process_item(item)

                    if i % 10 == 0:
                        save_state(self.state, self.crawler_name)

                    await asyncio.sleep(0.2)
            else:
                # Fallback: Try sitemap
                print("\n[STRATEGY] Trying sitemap.xml...")
                urls = await self.crawl_sitemap()

                if urls:
                    print(f"\n[SUCCESS] Found {len(urls)} URLs in sitemap")
                    print(f"[INFO] Processing all {len(urls)} URLs...")

                    for i, url in enumerate(urls, 1):
                        print(f"\n--- URL {i}/{len(urls)} ---")
                        print(f"[PAGE] {url}")

                        # Fetch and parse HTML
                        html = await self.fetch_html(url)
                        if html:
                            soup = BeautifulSoup(html, 'html.parser')

                            # Try to extract title and content
                            title = soup.find('h1')
                            title_text = title.text.strip() if title else 'Untitled'

                            # Try common Drupal content selectors
                            content = None
                            for selector in ['.node__content', '.field--name-body', 'article', 'main']:
                                content_el = soup.select_one(selector)
                                if content_el:
                                    content = str(content_el)
                                    break

                            # Extract categories from full page
                            categories = self.extract_categories_from_html(soup)

                            if content:
                                item = {
                                    'id': url.split('/')[-1],
                                    'title': title_text,
                                    'body': content,
                                    'url': url,
                                    'categories': categories
                                }
                                await self.process_item(item)

                        # Save state periodically
                        if i % 10 == 0:
                            save_state(self.state, self.crawler_name)

                        await asyncio.sleep(0.5)
                else:
                    print("\n[ERROR] Could not find content via API or sitemap")
                    print("[INFO] Make sure the site is Drupal and has JSON:API or sitemap enabled")

            save_state(self.state, self.crawler_name)

        except KeyboardInterrupt:
            print("\n[INTERRUPT] Crawler interrupted")
            save_state(self.state, self.crawler_name)
        except Exception as e:
            print(f"\n[ERROR] Crawler failed: {e}")
            import traceback
            traceback.print_exc()
            save_state(self.state, self.crawler_name)

        duration = (datetime.now() - start_time).total_seconds()
        print(f"\n{'='*60}")
        print(f"CRAWL COMPLETE")
        print(f"{'='*60}")
        print(f"Duration: {duration:.1f} seconds")
        print(f"Articles: {self.state['stats']['articles']}")
        print(f"{'='*60}\n")

async def main():
    """Main entry point"""
    if len(sys.argv) < 3:
        print("Usage: python drupal_crawler.py <url> <crawler_name>")
        print("\nExamples:")
        print("  python drupal_crawler.py https://yeditepe.edu.tr/ mysite")
        print("  python drupal_crawler.py https://example.com/ example")
        sys.exit(1)

    base_url = sys.argv[1]
    crawler_name = sys.argv[2]

    print(f"[INIT] Crawler Name: {crawler_name}")
    print(f"[INIT] Target URL: {base_url}")

    async with DrupalCrawler(base_url, crawler_name) as crawler:
        await crawler.run()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[EXIT] Crawler stopped by user")
