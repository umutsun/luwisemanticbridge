#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Wix Site Crawler - Uses Playwright to handle JavaScript-rendered content"""

import asyncio
import json
import re
import sys
import os
from datetime import datetime
from urllib.parse import urljoin, urlparse
import random

import redis
from bs4 import BeautifulSoup

try:
    from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
except ImportError:
    print("[ERROR] Playwright not installed. Install with: pip install playwright")
    print("[ERROR] Then run: playwright install chromium")
    sys.exit(1)

# --- Configuration ---
STATE_FILE = os.path.join(os.path.dirname(__file__), 'wix_crawler_state.json')
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
REDIS_DB = int(os.getenv('REDIS_DB', 0))
CRAWLER_NAME = None  # Will be set in main()
# REDIS_KEY_PREFIX will be dynamic: 'crawl4ai:{CRAWLER_NAME}:pages'
# --- End of Configuration ---

r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, decode_responses=True)

def clean_content(html):
    """Clean HTML content"""
    if not html:
        return ""

    soup = BeautifulSoup(html, 'html.parser')

    # Remove Wix-specific elements
    for selector in ['#SITE_HEADER', '#SITE_FOOTER', '.wix-ads', 'wix-chat', 'script', 'style']:
        for element in soup.select(selector):
            element.decompose()

    paragraphs = []
    for tag in soup.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'li']):
        text = tag.get_text(strip=True)
        if text and len(text) > 10:
            paragraphs.append(text)

    return '\n\n'.join(paragraphs).strip()

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
    return {'visited': [], 'queue': [], 'stats': {'pages': 0}}

class WixCrawler:
    def __init__(self, start_url, crawler_name):
        self.start_url = start_url
        self.crawler_name = crawler_name
        parsed = urlparse(start_url)
        self.base_domain = f"{parsed.scheme}://{parsed.netloc}"
        self.state = load_state()

        if not self.state['queue']:
            self.state['queue'] = [start_url]

    async def extract_page_content(self, page, url):
        """Extract content from Wix page"""
        try:
            # Wait for Wix to fully render
            await page.wait_for_load_state('networkidle', timeout=30000)
            await asyncio.sleep(2)  # Extra wait for dynamic content

            # Try to get title
            title = await page.title()

            # Get main content - Wix uses different selectors
            content_html = ""
            try:
                # Try multiple Wix content selectors
                for selector in ['#SITE_PAGES', 'main', '[data-mesh-id]', 'body']:
                    try:
                        element = await page.query_selector(selector)
                        if element:
                            content_html = await element.inner_html()
                            if len(content_html) > 1000:  # Found substantial content
                                break
                    except:
                        continue
            except Exception as e:
                print(f"  [WARN] Could not extract content: {str(e)[:50]}")

            clean_text = clean_content(content_html)

            # Extract all internal links
            links = []
            try:
                all_links = await page.query_selector_all('a')
                for link in all_links:
                    href = await link.get_attribute('href')
                    if href and (href.startswith('/') or self.base_domain in href):
                        full_url = urljoin(self.base_domain, href)
                        if full_url not in links and full_url not in self.state['visited']:
                            links.append(full_url)
            except:
                pass

            return {
                'title': title,
                'content': clean_text,
                'url': url,
                'links': links[:50]  # Limit to 50 links
            }

        except Exception as e:
            print(f"  [ERROR] Failed to extract content: {str(e)[:100]}")
            return None

    async def process_page(self, page, url):
        """Process a single page"""
        if url in self.state['visited']:
            return

        # Check Redis for duplicates
        slug = urlparse(url).path.strip('/').replace('/', '_') or 'home'
        redis_key = f"crawl4ai:{self.crawler_name}:pages:{slug}"

        if r.exists(redis_key):
            print(f"\n[SKIP] Already in Redis: {slug}")
            self.state['visited'].append(url)
            return

        print(f"\n[PAGE] {url}")

        try:
            await page.goto(url, wait_until='domcontentloaded', timeout=30000)

            extracted = await self.extract_page_content(page, url)

            if not extracted:
                return

            # Add discovered links to queue
            for link in extracted.get('links', []):
                if link not in self.state['visited'] and link not in self.state['queue']:
                    self.state['queue'].append(link)

            # Build data structure
            current_timestamp = datetime.utcnow().isoformat()
            data = {
                'title': extracted['title'],
                'content': extracted['content'],
                'url': url,
                'page_url': url,
                'crawled_at': current_timestamp,
                'scraped_at': current_timestamp,
                'timestamp': current_timestamp,
                'source': 'wix_playwright',
                'content_type': 'page'
            }

            # Save to Redis
            try:
                json_data = json.dumps(data, ensure_ascii=False, indent=2)
                r.set(redis_key, json_data)
                print(f"  [REDIS] Saved: {redis_key}")
                print(f"  Content length: {len(extracted['content'])} chars")
                print(f"  Found {len(extracted.get('links', []))} links")

                self.state['visited'].append(url)
                self.state['stats']['pages'] += 1

            except Exception as e:
                print(f"  [ERROR] Redis save failed: {e}")

        except PlaywrightTimeoutError:
            print(f"  [TIMEOUT] Page load timeout")
        except Exception as e:
            print(f"  [ERROR] {str(e)[:100]}")

    async def run(self):
        """Run the crawler"""
        print(f"\n{'='*60}")
        print(f"Wix Site Crawler (Playwright)")
        print(f"{'='*60}")
        print(f"Start URL: {self.start_url}")
        print(f"Base Domain: {self.base_domain}")
        print(f"{'='*60}\n")

        start_time = datetime.now()

        async with async_playwright() as p:
            # Launch browser with stealth settings
            browser = await p.chromium.launch(
                headless=True,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox'
                ]
            )

            # Create context with realistic settings
            context = await browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            )

            page = await context.new_page()

            try:
                max_pages = 100  # Limit for safety
                processed = 0

                while self.state['queue'] and processed < max_pages:
                    current_url = self.state['queue'].pop(0)

                    await self.process_page(page, current_url)
                    processed += 1

                    # Save state every 10 pages
                    if processed % 10 == 0:
                        save_state(self.state)

                    # Random delay to be polite
                    await asyncio.sleep(random.uniform(1, 3))

            except KeyboardInterrupt:
                print("\n[INTERRUPT] Crawler interrupted")
            except Exception as e:
                print(f"\n[ERROR] Crawler failed: {e}")
                import traceback
                traceback.print_exc()
            finally:
                await browser.close()
                save_state(self.state)

        duration = (datetime.now() - start_time).total_seconds()
        print(f"\n{'='*60}")
        print(f"CRAWL COMPLETE")
        print(f"{'='*60}")
        print(f"Duration: {duration:.1f} seconds")
        print(f"Pages: {self.state['stats']['pages']}")
        print(f"Queue remaining: {len(self.state['queue'])}")
        print(f"{'='*60}\n")

async def main():
    """Main entry point"""
    if len(sys.argv) < 3:
        print("Usage: python wix_crawler.py <url> <crawler_name>")
        print("\nExample:")
        print("  python wix_crawler.py https://example.wixsite.com/mysite mywixsite")
        sys.exit(1)

    start_url = sys.argv[1]
    crawler_name = sys.argv[2]

    print(f"[INIT] Crawler Name: {crawler_name}")
    print(f"[INIT] Start URL: {start_url}")

    crawler = WixCrawler(start_url, crawler_name)
    await crawler.run()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[EXIT] Crawler stopped by user")
