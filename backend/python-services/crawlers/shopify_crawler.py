#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Shopify Store Crawler - Extract products via Storefront API and JSON endpoints"""

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
STATE_FILE = os.path.join(os.path.dirname(__file__), 'shopify_crawler_state.json')
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
REDIS_DB = int(os.getenv('REDIS_DB', 0))
CRAWLER_NAME = None  # Will be set in main()
# REDIS_KEY_PREFIX will be dynamic: 'crawl4ai:{CRAWLER_NAME}:products'
# --- End of Configuration ---

r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, decode_responses=True)

def clean_html(html):
    if not html:
        return ""
    soup = BeautifulSoup(html, 'html.parser')
    return soup.get_text(strip=True, separator='\n\n')

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
    return {'visited': [], 'stats': {'products': 0, 'collections': 0}}

class ShopifyCrawler:
    def __init__(self, store_url, crawler_name):
        self.store_url = store_url.rstrip('/')
        parsed = urlparse(store_url)
        self.base_domain = f"{parsed.scheme}://{parsed.netloc}"
        self.crawler_name = crawler_name
        self.session = None
        self.state = load_state()

    async def __aenter__(self):
        timeout = aiohttp.ClientTimeout(total=30)
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json'
        }
        self.session = aiohttp.ClientSession(timeout=timeout, headers=headers)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    async def fetch_json(self, url):
        """Fetch JSON from URL"""
        try:
            async with self.session.get(url) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    print(f"  [ERROR] HTTP {response.status}: {url}")
                    return None
        except Exception as e:
            print(f"  [ERROR] {str(e)[:100]}")
            return None

    async def fetch_all_products(self):
        """Fetch all products using Shopify JSON endpoint"""
        all_products = []
        page = 1

        while True:
            url = f"{self.base_domain}/products.json?page={page}&limit=250"
            print(f"  [API] Fetching page {page}: {url}")

            data = await self.fetch_json(url)

            if not data or 'products' not in data:
                break

            products = data['products']
            if not products:
                break

            all_products.extend(products)
            print(f"  [API] Got {len(products)} products (total: {len(all_products)})")

            if len(products) < 250:
                break

            page += 1
            await asyncio.sleep(0.5)

        return all_products

    async def fetch_product_details(self, handle):
        """Fetch detailed product info"""
        url = f"{self.base_domain}/products/{handle}.json"
        return await self.fetch_json(url)

    async def process_product(self, product):
        """Process and save product to Redis"""
        product_id = product.get('id')
        handle = product.get('handle', '')
        product_url = f"{self.base_domain}/products/{handle}"

        if product_url in self.state['visited']:
            return

        # Check Redis for duplicates
        redis_key = f"crawl4ai:{self.crawler_name}:products:{handle}"

        if r.exists(redis_key):
            print(f"\n[SKIP] Already in Redis: {handle}")
            self.state['visited'].append(product_url)
            return

        print(f"\n[PRODUCT] {product.get('title', 'Untitled')}")
        print(f"  Handle: {handle}")
        print(f"  URL: {product_url}")

        # Extract variants
        variants = []
        for variant in product.get('variants', []):
            variants.append({
                'id': variant.get('id'),
                'title': variant.get('title'),
                'price': variant.get('price'),
                'sku': variant.get('sku', ''),
                'available': variant.get('available', False),
                'inventory_quantity': variant.get('inventory_quantity', 0)
            })

        # Extract images
        images = []
        for img in product.get('images', []):
            images.append({
                'url': img.get('src'),
                'alt': img.get('alt', '')
            })

        # Clean descriptions
        description = clean_html(product.get('body_html', ''))

        # Build data structure
        current_timestamp = datetime.utcnow().isoformat()
        data = {
            'title': product.get('title', ''),
            'content': description,
            'url': product_url,
            'page_url': product_url,
            'product_id': product_id,
            'handle': handle,
            'vendor': product.get('vendor', ''),
            'product_type': product.get('product_type', ''),
            'tags': product.get('tags', '').split(', ') if product.get('tags') else [],
            'variants': variants,
            'images': images,
            'published_at': product.get('published_at', ''),
            'created_at': product.get('created_at', ''),
            'updated_at': product.get('updated_at', ''),
            'crawled_at': current_timestamp,
            'scraped_at': current_timestamp,
            'timestamp': current_timestamp,
            'source': 'shopify_json_api',
            'content_type': 'product'
        }

        # Save to Redis
        try:
            json_data = json.dumps(data, ensure_ascii=False, indent=2)
            r.set(redis_key, json_data)
            print(f"  [REDIS] Saved: {redis_key}")
            print(f"  Variants: {len(variants)}, Images: {len(images)}")

            self.state['visited'].append(product_url)
            self.state['stats']['products'] += 1

        except Exception as e:
            print(f"  [ERROR] Redis save failed: {e}")

    async def crawl_products(self):
        """Crawl all products"""
        print(f"\n[CRAWL] Fetching products from {self.base_domain}")

        products = await self.fetch_all_products()

        if not products:
            print("  [WARN] No products found")
            print("  [INFO] Make sure this is a valid Shopify store")
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
        print(f"Shopify Store Crawler")
        print(f"{'='*60}")
        print(f"Store URL: {self.store_url}")
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
        print(f"{'='*60}\n")

async def main():
    """Main entry point"""
    if len(sys.argv) < 3:
        print("Usage: python shopify_crawler.py <store_url> <crawler_name>")
        print("\nExamples:")
        print("  python shopify_crawler.py https://example.myshopify.com myshopify")
        print("  python shopify_crawler.py https://shop.example.com shopname")
        sys.exit(1)

    store_url = sys.argv[1]
    crawler_name = sys.argv[2]

    print(f"[INIT] Crawler Name: {crawler_name}")
    print(f"[INIT] Store URL: {store_url}")

    async with ShopifyCrawler(store_url, crawler_name) as crawler:
        await crawler.run()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[EXIT] Crawler stopped by user")
