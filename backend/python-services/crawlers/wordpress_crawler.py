#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generic WordPress REST API Crawler - Fast and reliable for any WordPress site"""

import asyncio
import json
import re
import sys
import os
from datetime import datetime
from urllib.parse import urljoin, urlparse

import redis
import aiohttp
from bs4 import BeautifulSoup

# --- Configuration ---
STATE_FILE = os.path.join(os.path.dirname(__file__), 'wordpress_crawler_state.json')
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
REDIS_DB = int(os.getenv('REDIS_DB', 0))
REDIS_KEY_PREFIX = 'crawl4ai:wordpress_crawler:content'
# --- End of Configuration ---

r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, decode_responses=True)

def clean_html_content(html_content):
    """Extract clean text from HTML content"""
    if not html_content:
        return ""

    try:
        soup = BeautifulSoup(html_content, 'html.parser')

        # Remove unwanted elements
        for element in soup(["script", "style", "noscript", "iframe", "svg", "img"]):
            element.decompose()

        # Remove social sharing, ads, widgets
        for selector in ['.sharedaddy', '.sd-sharing', '.share-', '.social-', '.widget', '.sidebar']:
            for element in soup.select(selector):
                element.decompose()

        # Get text from paragraphs and headings
        paragraphs = []
        for tag in soup.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li']):
            text = tag.get_text(strip=True)
            if text and len(text) > 10:
                paragraphs.append(text)

        clean_text = '\n\n'.join(paragraphs)
        clean_text = re.sub(r'\n\s*\n+', '\n\n', clean_text)
        return clean_text.strip()
    except Exception as e:
        print(f"  [WARN] HTML cleaning failed: {str(e)[:50]}")
        return html_content

def save_state(state):
    """Save crawler state to JSON file"""
    try:
        with open(STATE_FILE, 'w', encoding='utf-8') as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
        print(f"[STATE] Saved: {len(state.get('visited', []))} visited")
    except Exception as e:
        print(f"[ERROR] Failed to save state: {e}")

def load_state():
    """Load crawler state from JSON file"""
    try:
        if os.path.exists(STATE_FILE):
            with open(STATE_FILE, 'r', encoding='utf-8') as f:
                state = json.load(f)
            print(f"[STATE] Loaded: {len(state.get('visited', []))} visited")
            return state
    except Exception as e:
        print(f"[WARN] Could not load state: {e}")

    return {
        'visited': [],
        'stats': {'posts': 0, 'pages': 0}
    }

class WordPressCrawler:
    def __init__(self, base_url, target_category_id=None):
        self.base_url = base_url.rstrip('/')
        self.api_base = f"{self.base_url}/wp-json/wp/v2"
        self.target_category_id = target_category_id
        self.session = None
        self.state = load_state()

    async def __aenter__(self):
        timeout = aiohttp.ClientTimeout(total=30)
        self.session = aiohttp.ClientSession(timeout=timeout)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    async def fetch_json(self, url, params=None):
        """Fetch JSON data from URL"""
        try:
            async with self.session.get(url, params=params) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    print(f"  [ERROR] HTTP {response.status}: {url}")
                    return None
        except asyncio.TimeoutError:
            print(f"  [TIMEOUT] {url}")
            return None
        except Exception as e:
            print(f"  [ERROR] {str(e)[:100]}")
            return None

    async def get_category_id_from_url(self, category_url):
        """Extract category ID from category URL"""
        parsed = urlparse(category_url)
        path_parts = [p for p in parsed.path.split('/') if p]

        if 'category' in path_parts:
            idx = path_parts.index('category')
            if idx + 1 < len(path_parts):
                category_slug = path_parts[idx + 1]
                categories = await self.fetch_json(f"{self.api_base}/categories", {'per_page': 100})
                if categories:
                    for cat in categories:
                        if cat.get('slug') == category_slug:
                            return cat.get('id')
        return None

    async def fetch_all_posts(self, endpoint, params=None):
        """Fetch all posts with pagination"""
        if params is None:
            params = {}

        params['per_page'] = 100
        page = 1
        all_items = []

        while True:
            params['page'] = page
            items = await self.fetch_json(endpoint, params)

            if not items:
                break

            all_items.extend(items)
            print(f"  [API] Fetched page {page}: {len(items)} items (total: {len(all_items)})")

            if len(items) < params['per_page']:
                break

            page += 1
            await asyncio.sleep(0.5)

        return all_items

    async def process_post(self, post, content_type='post'):
        """Process a single post/page and save to Redis"""
        post_id = post.get('id')
        post_url = post.get('link')

        # Check if already processed
        if post_url in self.state['visited']:
            return

        # Check Redis for duplicates
        slug = urlparse(post_url).path.strip('/').split('/')[-1] or str(post_id)
        redis_key = f"{REDIS_KEY_PREFIX}:{slug}"

        if r.exists(redis_key):
            print(f"\n[SKIP] Already in Redis: {slug}")
            self.state['visited'].append(post_url)
            return

        print(f"\n[{content_type.upper()}] {post.get('title', {}).get('rendered', 'Untitled')}")
        print(f"  URL: {post_url}")

        # Extract content
        title = post.get('title', {}).get('rendered', '')
        content_html = post.get('content', {}).get('rendered', '')
        excerpt = post.get('excerpt', {}).get('rendered', '')

        # Clean HTML to text
        clean_content = clean_html_content(content_html)
        clean_excerpt = clean_html_content(excerpt)

        # Extract metadata
        current_timestamp = datetime.utcnow().isoformat()
        data = {
            'title': BeautifulSoup(title, 'html.parser').get_text(),
            'content': clean_content,
            'excerpt': clean_excerpt,
            'url': post_url,
            'page_url': post_url,
            'post_id': post_id,
            'content_type': content_type,
            'publish_date': post.get('date', ''),
            'modified_date': post.get('modified', ''),
            'author_id': post.get('author'),
            'category_ids': post.get('categories', []),
            'tag_ids': post.get('tags', []),
            'crawled_at': current_timestamp,
            'scraped_at': current_timestamp,
            'timestamp': current_timestamp,
            'source': 'wordpress_rest_api'
        }

        # Save to Redis
        try:
            json_data = json.dumps(data, ensure_ascii=False, indent=2)
            r.set(redis_key, json_data)
            print(f"  [REDIS] Saved: {redis_key}")

            self.state['visited'].append(post_url)
            if content_type == 'post':
                self.state['stats']['posts'] += 1
            else:
                self.state['stats']['pages'] += 1

        except Exception as e:
            print(f"  [ERROR] Redis save failed: {e}")

    async def crawl_posts(self):
        """Crawl all posts (or filtered by category)"""
        print(f"\n[CRAWL] Fetching posts from {self.api_base}/posts")

        params = {'status': 'publish'}
        if self.target_category_id:
            params['categories'] = self.target_category_id
            print(f"  [FILTER] Category ID: {self.target_category_id}")

        posts = await self.fetch_all_posts(f"{self.api_base}/posts", params)

        if not posts:
            print("  [WARN] No posts found")
            return

        print(f"\n[PROCESSING] {len(posts)} posts")
        for i, post in enumerate(posts, 1):
            print(f"\n--- Post {i}/{len(posts)} ---")
            await self.process_post(post, 'post')

            if i % 10 == 0:
                save_state(self.state)

            await asyncio.sleep(0.3)

    async def crawl_pages(self):
        """Crawl all pages"""
        print(f"\n[CRAWL] Fetching pages from {self.api_base}/pages")

        pages = await self.fetch_all_posts(f"{self.api_base}/pages", {'status': 'publish'})

        if not pages:
            print("  [WARN] No pages found")
            return

        print(f"\n[PROCESSING] {len(pages)} pages")
        for i, page in enumerate(pages, 1):
            print(f"\n--- Page {i}/{len(pages)} ---")
            await self.process_post(page, 'page')

            if i % 10 == 0:
                save_state(self.state)

            await asyncio.sleep(0.3)

    async def run(self):
        """Run the crawler"""
        print(f"\n{'='*60}")
        print(f"WordPress REST API Crawler")
        print(f"{'='*60}")
        print(f"Base URL: {self.base_url}")
        print(f"API Endpoint: {self.api_base}")
        if self.target_category_id:
            print(f"Target Category ID: {self.target_category_id}")
        else:
            print(f"Mode: Full site crawl")
        print(f"{'='*60}\n")

        start_time = datetime.now()

        try:
            await self.crawl_posts()

            if not self.target_category_id:
                await self.crawl_pages()

            save_state(self.state)

        except KeyboardInterrupt:
            print("\n[INTERRUPT] Crawler interrupted by user")
            save_state(self.state)
        except Exception as e:
            print(f"\n[ERROR] Crawler failed: {e}")
            import traceback
            traceback.print_exc()
            save_state(self.state)

        duration = (datetime.now() - start_time).total_seconds()
        print(f"\n{'='*60}")
        print(f"CRAWL COMPLETE")
        print(f"{'='*60}")
        print(f"Duration: {duration:.1f} seconds")
        print(f"Posts: {self.state['stats']['posts']}")
        print(f"Pages: {self.state['stats']['pages']}")
        print(f"Total: {len(self.state['visited'])}")
        print(f"{'='*60}\n")

async def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print("Usage: python wordpress_crawler.py <url>")
        print("\nExamples:")
        print("  python wordpress_crawler.py https://example.com/")
        print("  python wordpress_crawler.py https://example.com/category/news/")
        sys.exit(1)

    input_url = sys.argv[1]
    parsed = urlparse(input_url)
    base_url = f"{parsed.scheme}://{parsed.netloc}"

    category_id = None
    if '/category/' in parsed.path:
        print("[DETECT] Category URL detected")

    async with WordPressCrawler(base_url, category_id) as crawler:
        if '/category/' in parsed.path:
            category_id = await crawler.get_category_id_from_url(input_url)
            if category_id:
                print(f"[CATEGORY] Found category ID: {category_id}")
                crawler.target_category_id = category_id
            else:
                print("[WARN] Could not extract category ID, falling back to full crawl")

        await crawler.run()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[EXIT] Crawler stopped by user")
