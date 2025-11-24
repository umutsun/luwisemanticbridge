#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""WooCommerce Product Crawler - Extract products, categories, and content via REST API"""

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
STATE_FILE = os.path.join(os.path.dirname(__file__), 'woocommerce_crawler_state.json')
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
REDIS_DB = int(os.getenv('REDIS_DB', 0))
CRAWLER_NAME = None  # Will be set in main()
# REDIS_KEY_PREFIX will be dynamic: 'crawl4ai:{CRAWLER_NAME}:products'
# --- End of Configuration ---

r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, decode_responses=True)

def clean_html_content(html_content):
    """Extract clean text from HTML content"""
    if not html_content:
        return ""

    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        for element in soup(["script", "style", "noscript", "iframe", "svg"]):
            element.decompose()

        paragraphs = []
        for tag in soup.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'li']):
            text = tag.get_text(strip=True)
            if text and len(text) > 5:
                paragraphs.append(text)

        return '\n\n'.join(paragraphs).strip()
    except Exception as e:
        return html_content

def save_state(state):
    try:
        with open(STATE_FILE, 'w', encoding='utf-8') as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[ERROR] Failed to save state: {e}")

def load_state():
    try:
        if os.path.exists(STATE_FILE):
            with open(STATE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except:
        pass
    return {'visited': [], 'stats': {'products': 0, 'categories': 0}}

class WooCommerceCrawler:
    def __init__(self, base_url, crawler_name, consumer_key=None, consumer_secret=None):
        self.base_url = base_url.rstrip('/')
        self.api_base = f"{self.base_url}/wp-json/wc/v3"
        self.crawler_name = crawler_name
        self.consumer_key = consumer_key
        self.consumer_secret = consumer_secret
        self.session = None
        self.state = load_state()

    async def __aenter__(self):
        timeout = aiohttp.ClientTimeout(total=30)
        # Add WooCommerce auth if credentials provided
        auth = None
        if self.consumer_key and self.consumer_secret:
            auth = aiohttp.BasicAuth(self.consumer_key, self.consumer_secret)
        self.session = aiohttp.ClientSession(timeout=timeout, auth=auth)
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
                elif response.status == 401:
                    print(f"  [AUTH] Authentication required for {url}")
                    return None
                else:
                    print(f"  [ERROR] HTTP {response.status}: {url}")
                    return None
        except Exception as e:
            print(f"  [ERROR] {str(e)[:100]}")
            return None

    async def fetch_all_items(self, endpoint, params=None):
        """Fetch all items with pagination"""
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
            print(f"  [API] Fetched page {page}: {len(items)} items")

            if len(items) < params['per_page']:
                break

            page += 1
            await asyncio.sleep(0.5)

        return all_items

    async def process_product(self, product):
        """Process a single product and save to Redis"""
        product_id = product.get('id')
        product_url = product.get('permalink')

        if product_url in self.state['visited']:
            return

        slug = product.get('slug', str(product_id))
        redis_key = f"crawl4ai:{self.crawler_name}:products:{slug}"

        if r.exists(redis_key):
            print(f"\n[SKIP] Already in Redis: {slug}")
            self.state['visited'].append(product_url)
            return

        print(f"\n[PRODUCT] {product.get('name', 'Untitled')}")
        print(f"  URL: {product_url}")
        print(f"  Price: {product.get('price', 'N/A')}")

        # Clean descriptions
        description = clean_html_content(product.get('description', ''))
        short_description = clean_html_content(product.get('short_description', ''))

        # Extract images
        images = []
        for img in product.get('images', []):
            images.append({
                'url': img.get('src'),
                'alt': img.get('alt', '')
            })

        # Build data structure
        current_timestamp = datetime.utcnow().isoformat()
        data = {
            'title': product.get('name', ''),
            'content': description,
            'short_description': short_description,
            'url': product_url,
            'page_url': product_url,
            'product_id': product_id,
            'sku': product.get('sku', ''),
            'price': product.get('price', ''),
            'regular_price': product.get('regular_price', ''),
            'sale_price': product.get('sale_price', ''),
            'stock_status': product.get('stock_status', ''),
            'stock_quantity': product.get('stock_quantity'),
            'categories': [cat.get('name') for cat in product.get('categories', [])],
            'category_ids': [cat.get('id') for cat in product.get('categories', [])],
            'tags': [tag.get('name') for tag in product.get('tags', [])],
            'images': images,
            'rating_count': product.get('rating_count', 0),
            'average_rating': product.get('average_rating', '0'),
            'crawled_at': current_timestamp,
            'scraped_at': current_timestamp,
            'timestamp': current_timestamp,
            'source': 'woocommerce_api',
            'content_type': 'product'
        }

        # Save to Redis
        try:
            json_data = json.dumps(data, ensure_ascii=False, indent=2)
            r.set(redis_key, json_data)
            print(f"  [REDIS] Saved: {redis_key}")

            self.state['visited'].append(product_url)
            self.state['stats']['products'] += 1

        except Exception as e:
            print(f"  [ERROR] Redis save failed: {e}")

    async def crawl_products(self, category_id=None):
        """Crawl all products (or filtered by category)"""
        print(f"\n[CRAWL] Fetching products from {self.api_base}/products")

        params = {'status': 'publish'}
        if category_id:
            params['category'] = category_id
            print(f"  [FILTER] Category ID: {category_id}")

        products = await self.fetch_all_items(f"{self.api_base}/products", params)

        if not products:
            print("  [WARN] No products found")
            print("  [INFO] Make sure WooCommerce REST API is enabled")
            print("  [INFO] Or provide consumer_key and consumer_secret")
            return

        print(f"\n[PROCESSING] {len(products)} products")
        for i, product in enumerate(products, 1):
            print(f"\n--- Product {i}/{len(products)} ---")
            await self.process_product(product)

            if i % 10 == 0:
                save_state(self.state)

            await asyncio.sleep(0.3)

    async def run(self):
        """Run the crawler"""
        print(f"\n{'='*60}")
        print(f"WooCommerce Product Crawler")
        print(f"{'='*60}")
        print(f"Base URL: {self.base_url}")
        print(f"API Endpoint: {self.api_base}")
        print(f"{'='*60}\n")

        start_time = datetime.now()

        try:
            await self.crawl_products()
            save_state(self.state)

        except KeyboardInterrupt:
            print("\n[INTERRUPT] Crawler interrupted")
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
        print(f"Products: {self.state['stats']['products']}")
        print(f"Total: {len(self.state['visited'])}")
        print(f"{'='*60}\n")

async def main():
    """Main entry point"""
    if len(sys.argv) < 3:
        print("Usage: python woocommerce_crawler.py <url> <crawler_name> [consumer_key] [consumer_secret]")
        print("\nExamples:")
        print("  python woocommerce_crawler.py https://shop.example.com/ myshop")
        print("  python woocommerce_crawler.py https://shop.example.com/ myshop ck_xxx cs_xxx")
        sys.exit(1)

    input_url = sys.argv[1]
    crawler_name = sys.argv[2]
    consumer_key = sys.argv[3] if len(sys.argv) > 3 else None
    consumer_secret = sys.argv[4] if len(sys.argv) > 4 else None

    print(f"[INIT] Crawler Name: {crawler_name}")
    print(f"[INIT] Target URL: {input_url}")

    parsed = urlparse(input_url)
    base_url = f"{parsed.scheme}://{parsed.netloc}"

    async with WooCommerceCrawler(base_url, crawler_name, consumer_key, consumer_secret) as crawler:
        await crawler.run()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[EXIT] Crawler stopped by user")
