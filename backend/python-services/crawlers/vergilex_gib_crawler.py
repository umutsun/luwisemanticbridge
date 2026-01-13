#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Vergilex GIB Sirkuler Crawler
Crawls circulars from gib.gov.tr for Vergilex platform
Uses Playwright for dynamic Next.js content
"""

import asyncio
import json
import os
import sys
import re
from datetime import datetime
from pathlib import Path
import random

import redis

try:
    from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
except ImportError:
    print("[ERROR] Playwright not installed")
    print("[ERROR] Install: pip install playwright")
    print("[ERROR] Then: playwright install chromium")
    sys.exit(1)

# --- Configuration ---
CRAWLER_NAME = "vergilex_gib_sirkuler"
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
REDIS_DB = int(os.getenv('REDIS_DB', 2))  # Vergilex uses DB 2
REDIS_KEY_PREFIX = f'crawl4ai:{CRAWLER_NAME}'

# State file for resume support
STATE_FILE = os.path.join(os.path.dirname(__file__), f'{CRAWLER_NAME}_state.json')

# Link file paths
LINKS_FILE = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'docs', 'GIBGOVTR-SIRKULER LINKLERI.html')

# Rate limiting
MIN_DELAY = 3  # seconds
MAX_DELAY = 6  # seconds
# --- End of Configuration ---

# Redis connection
r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, decode_responses=True)


def load_links_from_file(filepath: str) -> list:
    """Load URLs from the links file"""
    links = []
    try:
        # Try different encodings
        content = None
        for encoding in ['utf-8', 'utf-8-sig', 'latin-1', 'cp1254']:
            try:
                with open(filepath, 'r', encoding=encoding) as f:
                    content = f.read()
                break
            except UnicodeDecodeError:
                continue

        if not content:
            print(f"[ERROR] Could not read file with any encoding")
            return links

        # Extract all URLs
        url_pattern = r'https?://[^\s<>"\']+gib\.gov\.tr[^\s<>"\']*'
        found_urls = re.findall(url_pattern, content)
        for url in found_urls:
            # Clean URL
            url = url.strip()
            if '/sirkuler/' in url and url not in links:
                links.append(url)
    except Exception as e:
        print(f"[ERROR] Failed to load links: {e}")
    return links


def save_state(state: dict):
    """Save crawler state for resume"""
    try:
        with open(STATE_FILE, 'w', encoding='utf-8') as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[ERROR] Failed to save state: {e}")


def load_state() -> dict:
    """Load crawler state"""
    try:
        if os.path.exists(STATE_FILE):
            with open(STATE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except:
        pass
    return {'completed': [], 'failed': [], 'stats': {'success': 0, 'failed': 0}}


class GIBSirkulerCrawler:
    def __init__(self, links: list, start_index: int = 0):
        self.links = links
        self.start_index = start_index
        self.state = load_state()

    async def extract_sirkuler_content(self, page) -> dict:
        """Extract circular content from GIB page"""
        try:
            # Wait for content to load (Next.js hydration)
            await page.wait_for_load_state('networkidle', timeout=15000)
            await asyncio.sleep(2)  # Extra wait for dynamic content

            # Try to find the main content area
            content_data = {
                'title': '',
                'sirkuler_no': '',
                'tarih': '',
                'konu': '',
                'content': '',
                'kanun_kodu': '',
                'sirkuler_id': ''
            }

            # Extract from URL
            url = page.url
            url_match = re.search(r'/kanun/(\d+)/sirkuler/(\d+)', url)
            if url_match:
                content_data['kanun_kodu'] = url_match.group(1)
                content_data['sirkuler_id'] = url_match.group(2)

            # Get page title
            title = await page.title()
            if title and 'Gelir İdaresi' not in title:
                content_data['title'] = title.strip()

            # Try multiple selectors for content extraction
            selectors_to_try = [
                # Main content containers
                'main',
                'article',
                '.sirkuler-detay',
                '.content',
                '.mevzuat-content',
                '[class*="content"]',
                '[class*="detail"]',
                '#content',
                '.container main',
                'div[class*="sirkuler"]'
            ]

            content_html = ""
            for selector in selectors_to_try:
                try:
                    element = await page.query_selector(selector)
                    if element:
                        html = await element.inner_html()
                        if len(html) > 500:
                            content_html = html
                            break
                except:
                    continue

            # If no content found, get body
            if not content_html:
                try:
                    body = await page.query_selector('body')
                    if body:
                        content_html = await body.inner_html()
                except:
                    pass

            # Parse content
            if content_html:
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(content_html, 'html.parser')

                # Remove unwanted elements
                for tag in soup(['script', 'style', 'nav', 'header', 'footer', 'noscript', 'iframe']):
                    tag.decompose()

                # Try to extract structured data
                # Look for sirkuler number
                sirkuler_no_patterns = [
                    r'Sirküler\s*(?:No|Numarası)?\s*[:\s]*(\d+[/\-]?\d*)',
                    r'(\d+)\s*(?:Seri\s*No|nolu)',
                ]

                text_content = soup.get_text(' ', strip=True)

                for pattern in sirkuler_no_patterns:
                    match = re.search(pattern, text_content, re.IGNORECASE)
                    if match:
                        content_data['sirkuler_no'] = match.group(1)
                        break

                # Look for date
                date_patterns = [
                    r'Tarih\s*[:\s]*(\d{1,2}[./]\d{1,2}[./]\d{2,4})',
                    r'(\d{1,2}[./]\d{1,2}[./]\d{4})',
                    r'(\d{4}[./]\d{1,2}[./]\d{1,2})'
                ]

                for pattern in date_patterns:
                    match = re.search(pattern, text_content)
                    if match:
                        content_data['tarih'] = match.group(1)
                        break

                # Extract main content
                paragraphs = []
                for tag in soup.find_all(['p', 'div', 'article', 'section']):
                    text = tag.get_text(strip=True)
                    if text and len(text) > 50:
                        # Skip navigation/menu items
                        if not any(skip in text.lower() for skip in ['anasayfa', 'menü', 'arama', 'giriş']):
                            paragraphs.append(text)

                # Remove duplicates while preserving order
                seen = set()
                unique_paragraphs = []
                for p in paragraphs:
                    p_normalized = p[:100]  # Compare first 100 chars
                    if p_normalized not in seen:
                        seen.add(p_normalized)
                        unique_paragraphs.append(p)

                content_data['content'] = '\n\n'.join(unique_paragraphs[:50])  # Limit paragraphs

                # Extract title from content if not found
                if not content_data['title']:
                    h1 = soup.find('h1')
                    if h1:
                        content_data['title'] = h1.get_text(strip=True)
                    else:
                        # Use first paragraph as title
                        if unique_paragraphs:
                            content_data['title'] = unique_paragraphs[0][:200]

            return content_data

        except Exception as e:
            print(f"  [ERROR] Content extraction failed: {str(e)[:100]}")
            return None

    async def process_url(self, page, url: str, index: int) -> bool:
        """Process a single URL"""
        # Check if already processed
        if url in self.state['completed']:
            print(f"[{index}] SKIP (already done): {url[-50:]}")
            return True

        # Generate Redis key
        url_match = re.search(r'/kanun/(\d+)/sirkuler/(\d+)', url)
        if url_match:
            redis_key = f"{REDIS_KEY_PREFIX}:kanun_{url_match.group(1)}_sirkuler_{url_match.group(2)}"
        else:
            slug = url.split('/')[-1] or 'unknown'
            redis_key = f"{REDIS_KEY_PREFIX}:{slug}"

        # Check Redis
        if r.exists(redis_key):
            print(f"[{index}] SKIP (in Redis): {redis_key}")
            self.state['completed'].append(url)
            return True

        print(f"\n[{index}/{len(self.links)}] Processing: {url}")

        try:
            # Navigate to page
            response = await page.goto(url, wait_until='domcontentloaded', timeout=30000)

            if not response:
                print(f"  [ERROR] No response")
                self.state['failed'].append(url)
                return False

            if response.status >= 400:
                print(f"  [ERROR] HTTP {response.status}")
                self.state['failed'].append(url)
                return False

            # Extract content
            content = await self.extract_sirkuler_content(page)

            if not content or not content.get('content'):
                print(f"  [WARN] No content extracted")
                # Still save with minimal data
                content = content or {}
                content['content'] = f"Sirküler içeriği yüklenemedi. URL: {url}"

            # Build data object
            timestamp = datetime.utcnow().isoformat()
            data = {
                'title': content.get('title', ''),
                'sirkuler_no': content.get('sirkuler_no', ''),
                'sirkuler_id': content.get('sirkuler_id', ''),
                'kanun_kodu': content.get('kanun_kodu', ''),
                'tarih': content.get('tarih', ''),
                'content': content.get('content', ''),
                'url': url,
                'source': 'gib.gov.tr',
                'source_type': 'sirkuler',
                'crawled_at': timestamp,
                'crawler': CRAWLER_NAME
            }

            # Save to Redis
            r.set(redis_key, json.dumps(data, ensure_ascii=False, indent=2))

            print(f"  [OK] Saved: {redis_key}")
            print(f"  Title: {content.get('title', 'N/A')[:60]}...")
            print(f"  Content: {len(content.get('content', ''))} chars")

            self.state['completed'].append(url)
            self.state['stats']['success'] += 1
            return True

        except PlaywrightTimeoutError:
            print(f"  [TIMEOUT] Page load timeout")
            self.state['failed'].append(url)
            self.state['stats']['failed'] += 1
            return False
        except Exception as e:
            print(f"  [ERROR] {str(e)[:100]}")
            self.state['failed'].append(url)
            self.state['stats']['failed'] += 1
            return False

    async def run(self):
        """Run the crawler"""
        print(f"\n{'='*60}")
        print(f"GIB Sirkuler Crawler - Vergilex")
        print(f"{'='*60}")
        print(f"Total links: {len(self.links)}")
        print(f"Already completed: {len(self.state['completed'])}")
        print(f"Starting from index: {self.start_index}")
        print(f"Redis DB: {REDIS_DB}")
        print(f"{'='*60}\n")

        start_time = datetime.now()

        async with async_playwright() as p:
            # Launch browser with stealth settings
            browser = await p.chromium.launch(
                headless=True,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                    '--disable-setuid-sandbox'
                ]
            )

            # Create context with Turkish locale
            context = await browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                locale='tr-TR',
                timezone_id='Europe/Istanbul',
                extra_http_headers={
                    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                }
            )

            page = await context.new_page()

            # Add stealth scripts
            await page.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            """)

            try:
                for i, url in enumerate(self.links[self.start_index:], start=self.start_index):
                    await self.process_url(page, url, i + 1)

                    # Save state periodically
                    if (i + 1) % 10 == 0:
                        save_state(self.state)
                        print(f"\n[STATE] Saved progress: {i + 1}/{len(self.links)}\n")

                    # Rate limiting
                    delay = random.uniform(MIN_DELAY, MAX_DELAY)
                    await asyncio.sleep(delay)

            except KeyboardInterrupt:
                print("\n[INTERRUPT] Stopping crawler...")
            except Exception as e:
                print(f"\n[ERROR] Crawler error: {e}")
                import traceback
                traceback.print_exc()
            finally:
                await browser.close()
                save_state(self.state)

        # Print summary
        duration = (datetime.now() - start_time).total_seconds()
        print(f"\n{'='*60}")
        print(f"CRAWL COMPLETE")
        print(f"{'='*60}")
        print(f"Duration: {duration:.1f} seconds ({duration/60:.1f} minutes)")
        print(f"Success: {self.state['stats']['success']}")
        print(f"Failed: {self.state['stats']['failed']}")
        print(f"Total completed: {len(self.state['completed'])}")
        print(f"{'='*60}\n")


async def main():
    # Parse arguments
    start_index = 0
    if len(sys.argv) > 1:
        try:
            start_index = int(sys.argv[1])
        except:
            print("Usage: python vergilex_gib_crawler.py [start_index]")
            sys.exit(1)

    # Load links
    links_file = Path(LINKS_FILE).resolve()
    print(f"Loading links from: {links_file}")

    if not links_file.exists():
        print(f"[ERROR] Links file not found: {links_file}")
        sys.exit(1)

    links = load_links_from_file(str(links_file))
    print(f"Loaded {len(links)} sirkuler links")

    if not links:
        print("[ERROR] No links found in file")
        sys.exit(1)

    # Run crawler
    crawler = GIBSirkulerCrawler(links, start_index)
    await crawler.run()


if __name__ == "__main__":
    asyncio.run(main())
