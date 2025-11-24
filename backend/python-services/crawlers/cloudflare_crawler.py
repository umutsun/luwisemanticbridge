#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cloudflare Bypass Crawler - Uses Playwright with stealth mode for protected sites"""

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
    print("[ERROR] Playwright not installed")
    print("[ERROR] Install: pip install playwright playwright-stealth")
    print("[ERROR] Then: playwright install chromium")
    sys.exit(1)

# --- Configuration ---
STATE_FILE = os.path.join(os.path.dirname(__file__), 'cloudflare_crawler_state.json')
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
REDIS_DB = int(os.getenv('REDIS_DB', 0))
REDIS_KEY_PREFIX = 'crawl4ai:cloudflare_crawler:pages'
# --- End of Configuration ---

r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, decode_responses=True)

def clean_content(html):
    if not html:
        return ""

    soup = BeautifulSoup(html, 'html.parser')
    for element in soup(['script', 'style', 'noscript', 'iframe', 'svg']):
        element.decompose()

    paragraphs = []
    for tag in soup.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'li', 'div']):
        text = tag.get_text(strip=True)
        if text and len(text) > 15:
            paragraphs.append(text)

    return '\n\n'.join(paragraphs[:100]).strip()  # Limit paragraphs

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

class CloudflareCrawler:
    def __init__(self, start_url, max_pages=50):
        self.start_url = start_url
        parsed = urlparse(start_url)
        self.base_domain = f"{parsed.scheme}://{parsed.netloc}"
        self.max_pages = max_pages
        self.state = load_state()

        if not self.state['queue']:
            self.state['queue'] = [start_url]

    async def wait_for_cloudflare(self, page):
        """Wait for Cloudflare challenge to complete"""
        try:
            # Check for Cloudflare challenge
            cf_selectors = [
                '#challenge-form',
                '.cf-browser-verification',
                '#cf-wrapper',
                'title:has-text("Just a moment")'
            ]

            for selector in cf_selectors:
                try:
                    element = await page.query_selector(selector)
                    if element:
                        print("  [CF] Cloudflare challenge detected, waiting...")
                        await asyncio.sleep(5)  # Wait for challenge
                        await page.wait_for_load_state('networkidle', timeout=30000)
                        print("  [CF] Challenge passed!")
                        return True
                except:
                    continue

            return False

        except Exception as e:
            print(f"  [CF] Error checking Cloudflare: {str(e)[:50]}")
            return False

    async def extract_content(self, page, url):
        """Extract content from page"""
        try:
            # Wait for page to fully load
            await page.wait_for_load_state('networkidle', timeout=20000)

            title = await page.title()

            # Get main content
            content_html = ""
            for selector in ['main', 'article', '[role="main"]', 'body']:
                try:
                    element = await page.query_selector(selector)
                    if element:
                        content_html = await element.inner_html()
                        if len(content_html) > 500:
                            break
                except:
                    continue

            clean_text = clean_content(content_html)

            # Extract links
            links = []
            try:
                all_links = await page.query_selector_all('a[href]')
                for link in all_links[:100]:  # Limit to 100 links
                    href = await link.get_attribute('href')
                    if href:
                        if href.startswith('/') or self.base_domain in href:
                            full_url = urljoin(self.base_domain, href)
                            # Filter out common non-content links
                            if not any(x in full_url for x in ['#', 'javascript:', 'mailto:', 'tel:']):
                                links.append(full_url)
            except:
                pass

            return {
                'title': title,
                'content': clean_text,
                'url': url,
                'links': list(set(links))[:30]  # Unique links, max 30
            }

        except Exception as e:
            print(f"  [ERROR] Extract failed: {str(e)[:100]}")
            return None

    async def process_page(self, page, url):
        """Process a single page"""
        if url in self.state['visited']:
            return

        # Check Redis
        slug = urlparse(url).path.strip('/').replace('/', '_') or 'home'
        redis_key = f"{REDIS_KEY_PREFIX}:{slug}"

        if r.exists(redis_key):
            print(f"\n[SKIP] Already in Redis: {slug}")
            self.state['visited'].append(url)
            return

        print(f"\n[PAGE] {url}")

        try:
            # Navigate to page
            response = await page.goto(url, wait_until='domcontentloaded', timeout=30000)

            if not response:
                print("  [ERROR] No response received")
                return

            # Check for Cloudflare
            await self.wait_for_cloudflare(page)

            # Extra wait for dynamic content
            await asyncio.sleep(2)

            # Extract content
            extracted = await self.extract_content(page, url)

            if not extracted or len(extracted['content']) < 100:
                print("  [WARN] Insufficient content extracted")
                return

            # Add links to queue
            for link in extracted['links']:
                if link not in self.state['visited'] and link not in self.state['queue']:
                    self.state['queue'].append(link)

            # Build data
            current_timestamp = datetime.utcnow().isoformat()
            data = {
                'title': extracted['title'],
                'content': extracted['content'],
                'url': url,
                'page_url': url,
                'crawled_at': current_timestamp,
                'scraped_at': current_timestamp,
                'timestamp': current_timestamp,
                'source': 'cloudflare_playwright',
                'content_type': 'page'
            }

            # Save to Redis
            try:
                json_data = json.dumps(data, ensure_ascii=False, indent=2)
                r.set(redis_key, json_data)
                print(f"  [REDIS] Saved: {redis_key}")
                print(f"  Content: {len(extracted['content'])} chars")
                print(f"  Links found: {len(extracted['links'])}")

                self.state['visited'].append(url)
                self.state['stats']['pages'] += 1

            except Exception as e:
                print(f"  [ERROR] Redis save failed: {e}")

        except PlaywrightTimeoutError:
            print(f"  [TIMEOUT] Page load timeout")
        except Exception as e:
            print(f"  [ERROR] {str(e)[:100]}")

    async def run(self):
        """Run crawler"""
        print(f"\n{'='*60}")
        print(f"Cloudflare Bypass Crawler (Stealth Mode)")
        print(f"{'='*60}")
        print(f"Start URL: {self.start_url}")
        print(f"Max Pages: {self.max_pages}")
        print(f"{'='*60}\n")

        start_time = datetime.now()

        async with async_playwright() as p:
            # Launch with stealth settings
            browser = await p.chromium.launch(
                headless=True,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-web-security'
                ]
            )

            # Create context with realistic fingerprint
            context = await browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                locale='en-US',
                timezone_id='America/New_York',
                extra_http_headers={
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                }
            )

            page = await context.new_page()

            # Add stealth scripts
            await page.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined
                });
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5]
                });
            """)

            try:
                processed = 0

                while self.state['queue'] and processed < self.max_pages:
                    current_url = self.state['queue'].pop(0)
                    await self.process_page(page, current_url)
                    processed += 1

                    if processed % 5 == 0:
                        save_state(self.state)

                    # Random delay (3-7 seconds)
                    await asyncio.sleep(random.uniform(3, 7))

            except KeyboardInterrupt:
                print("\n[INTERRUPT] Stopped by user")
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
        print(f"Queue: {len(self.state['queue'])}")
        print(f"{'='*60}\n")

async def main():
    if len(sys.argv) < 2:
        print("Usage: python cloudflare_crawler.py <url> [max_pages]")
        print("\nExample:")
        print("  python cloudflare_crawler.py https://example.com/ 50")
        sys.exit(1)

    url = sys.argv[1]
    max_pages = int(sys.argv[2]) if len(sys.argv) > 2 else 50

    crawler = CloudflareCrawler(url, max_pages)
    await crawler.run()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[EXIT] Stopped")
