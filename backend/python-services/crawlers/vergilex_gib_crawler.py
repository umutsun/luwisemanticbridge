#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Vergilex GIB Sirkuler Crawler
Crawls circulars from gib.gov.tr for Vergilex platform
Uses Playwright for dynamic Next.js content

Usage:
  python vergilex_gib_crawler.py [start_index]           # Normal mode (skip existing)
  python vergilex_gib_crawler.py --update                # Update mode (check for changes)
  python vergilex_gib_crawler.py --force                 # Force mode (recrawl all)
  python vergilex_gib_crawler.py --force 50              # Force from index 50
"""

import asyncio
import json
import os
import sys
import re
import hashlib
from datetime import datetime, timezone
from pathlib import Path
import random
import argparse

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

# Rate limit detection patterns
RATE_LIMIT_PATTERNS = [
    'ÇOK FAZLA İSTEK',
    'TOO MANY REQUESTS',
    'RATE LIMIT',
    'ERİŞİM ENGELLENDİ',
    'BLOCKED',
    '429',
]

# Exponential backoff settings
RATE_LIMIT_INITIAL_WAIT = 60  # seconds
RATE_LIMIT_MAX_WAIT = 600  # 10 minutes max
RATE_LIMIT_MAX_RETRIES = 5
# --- End of Configuration ---

# Redis connection
r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, decode_responses=True)


def clean_title(title: str) -> str:
    """Clean and normalize title text"""
    if not title:
        return ''

    # Remove UI elements
    ui_patterns = [
        r'SAYFAYI\s*İNDİR',
        r'Sayfayı\s*İndir',
        r'SAYFA\s*İNDİR',
        r'İNDİR',
        r'Yazdır',
        r'YAZDIR',
        r'Paylaş',
        r'PAYLAŞ',
    ]
    for pattern in ui_patterns:
        title = re.sub(pattern, '', title, flags=re.IGNORECASE)

    # Fix spacing: add space before capital letters following lowercase
    # "KanunNumarası" -> "Kanun Numarası"
    title = re.sub(r'([a-zçğıöşü])([A-ZÇĞİÖŞÜ])', r'\1 \2', title)

    # Fix spacing: add space between number and text
    # "213Kanun" -> "213 Kanun", "Kanun213" -> "Kanun 213"
    title = re.sub(r'(\d)([A-ZÇĞİÖŞÜa-zçğıöşü])', r'\1 \2', title)
    title = re.sub(r'([A-ZÇĞİÖŞÜa-zçğıöşü])(\d)', r'\1 \2', title)

    # Remove duplicate consecutive words (case insensitive)
    # "KANUNUKanun" -> "KANUNU"
    words = title.split()
    cleaned_words = []
    for i, word in enumerate(words):
        if i == 0:
            cleaned_words.append(word)
        else:
            # Check if this word is similar to previous (ignoring case)
            prev_word = cleaned_words[-1].upper()
            curr_word = word.upper()
            # If current word is contained in previous or vice versa, skip
            if curr_word in prev_word or prev_word in curr_word:
                continue
            cleaned_words.append(word)

    title = ' '.join(cleaned_words)

    # Normalize whitespace
    title = re.sub(r'\s+', ' ', title).strip()

    # Remove leading/trailing punctuation
    title = re.sub(r'^[\s\-:.,/]+|[\s\-:.,/]+$', '', title)

    return title


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
    return {'completed': [], 'failed': [], 'stats': {'success': 0, 'failed': 0, 'updated': 0, 'unchanged': 0}}


def compute_content_hash(content: str) -> str:
    """Compute MD5 hash of content for change detection"""
    return hashlib.md5(content.encode('utf-8')).hexdigest()


def is_rate_limited(page_content: str, page_title: str = "") -> bool:
    """Check if page indicates rate limiting"""
    check_text = (page_content + " " + page_title).upper()
    for pattern in RATE_LIMIT_PATTERNS:
        if pattern.upper() in check_text:
            return True
    return False


class GIBSirkulerCrawler:
    def __init__(self, links: list, start_index: int = 0, force_mode: bool = False, update_mode: bool = False):
        self.links = links
        self.start_index = start_index
        self.force_mode = force_mode  # Recrawl everything
        self.update_mode = update_mode  # Check for changes and update if different
        self.state = load_state()

        # Reset state for force mode
        if force_mode:
            self.state = {'completed': [], 'failed': [], 'stats': {'success': 0, 'failed': 0, 'updated': 0, 'unchanged': 0}}

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
                content_data['title'] = clean_title(title)

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
                # Look for sirkuler number - more specific patterns for GIB format
                sirkuler_no_patterns = [
                    # VUK-191/2025-12/Enflasyon Düzeltmesi Uygulaması-21 format
                    r'Sirküler\s*No\s*([A-ZÇĞİÖŞÜ]+-\d+/\d+[^S\n]{0,100})',
                    # VUK-41/2006-6 format
                    r'Sayısı\s*:\s*([A-ZÇĞİÖŞÜ]+-\d+/\d+-\d+[^İ\n]{0,80})',
                    # Simpler patterns
                    r'Sirküler\s*(?:No|Numarası)?\s*[:\s]*([A-ZÇĞİÖŞÜ]+-\d+[/\-]\d+)',
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

                # Look for konu/subject
                konu_patterns = [
                    r'Konusu\s*:\s*([^\n]{10,100})',
                    r'Konu\s*:\s*([^\n]{10,100})',
                ]
                for pattern in konu_patterns:
                    match = re.search(pattern, text_content)
                    if match:
                        content_data['konu'] = match.group(1).strip()
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
                        title_text = h1.get_text(strip=True)
                        if title_text and 'Gelir İdaresi' not in title_text:
                            content_data['title'] = clean_title(title_text)

                # If still no title, try pattern matching
                if not content_data['title']:
                    title_patterns = [
                        # Sirküler with number
                        r'(\d+\s*(?:SAYILI|Sayılı|Seri\s*No[:\s]*\d*)\s*[A-ZÇĞİÖŞÜa-zçğıöşü\s]+(?:SİRKÜLERİ?|Sirküleri?))',
                        # Sirküler başlığı
                        r'([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s]+(?:SİRKÜLERİ?|Sirküleri?))',
                        # Kanun-ilgili başlıklar
                        r'([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s]+(?:KANUNU?|Kanunu?)\s*(?:ile|İle|hakkında|Hakkında)?[A-ZÇĞİÖŞÜa-zçğıöşü\s]*)',
                        # Genel Tebliğ
                        r'([A-ZÇĞİÖŞÜa-zçğıöşü\s]+(?:GENEL\s*TEBLİĞİ?|Genel\s*Tebliği?))',
                    ]

                    for pattern in title_patterns:
                        match = re.search(pattern, text_content[:2000])
                        if match:
                            extracted_title = match.group(1).strip()
                            if len(extracted_title) > 15 and len(extracted_title) < 250:
                                content_data['title'] = clean_title(extracted_title)
                                break

                # Build best possible title - prefer specific info over generic page title
                # Priority: sirkuler_no > konu > page_title > fallback
                best_title = content_data.get('title', '')

                # If we have sirkuler_no (like "VUK-191/2025-12/Enflasyon Düzeltmesi"), use it
                if content_data.get('sirkuler_no'):
                    sirkuler_title = clean_title(content_data['sirkuler_no'])
                    if len(sirkuler_title) > 10:
                        best_title = sirkuler_title
                # If we have konu but no good sirkuler_no
                elif content_data.get('konu') and len(content_data['konu']) > 15:
                    best_title = clean_title(content_data['konu'])
                # Fallback to kanun_kodu/sirkuler_id combo
                elif content_data.get('kanun_kodu') and content_data.get('sirkuler_id'):
                    best_title = f"Sirküler - Kanun {content_data['kanun_kodu']} / {content_data['sirkuler_id']}"
                # Use first paragraph as last resort
                elif not best_title and unique_paragraphs:
                    best_title = clean_title(unique_paragraphs[0][:200])

                content_data['title'] = best_title

            return content_data

        except Exception as e:
            print(f"  [ERROR] Content extraction failed: {str(e)[:100]}")
            return None

    async def process_url(self, page, url: str, index: int, retry_count: int = 0) -> bool:
        """Process a single URL with rate limit handling"""
        # Generate Redis key
        url_match = re.search(r'/kanun/(\d+)/sirkuler/(\d+)', url)
        if url_match:
            redis_key = f"{REDIS_KEY_PREFIX}:kanun_{url_match.group(1)}_sirkuler_{url_match.group(2)}"
        else:
            slug = url.split('/')[-1] or 'unknown'
            redis_key = f"{REDIS_KEY_PREFIX}:{slug}"

        # Check existing data in Redis
        existing_data = None
        existing_hash = None
        if r.exists(redis_key):
            try:
                existing_data = json.loads(r.get(redis_key))
                existing_hash = existing_data.get('content_hash')
            except:
                pass

        # Skip logic based on mode
        if not self.force_mode and not self.update_mode:
            # Normal mode: skip if already completed or in Redis
            if url in self.state['completed']:
                print(f"[{index}] SKIP (already done): {url[-50:]}")
                return True
            if existing_data:
                print(f"[{index}] SKIP (in Redis): {redis_key}")
                self.state['completed'].append(url)
                return True

        print(f"\n[{index}/{len(self.links)}] {'UPDATE' if self.update_mode else 'FORCE' if self.force_mode else 'NEW'}: {url}")

        try:
            # Navigate to page
            response = await page.goto(url, wait_until='domcontentloaded', timeout=30000)

            if not response:
                print(f"  [ERROR] No response")
                self.state['failed'].append(url)
                return False

            # Check for HTTP 429 rate limit
            if response.status == 429:
                return await self._handle_rate_limit(page, url, index, retry_count, "HTTP 429")

            if response.status >= 400:
                print(f"  [ERROR] HTTP {response.status}")
                self.state['failed'].append(url)
                return False

            # Check page content for rate limit indicators
            page_title = await page.title() or ""
            page_text = ""
            try:
                body = await page.query_selector('body')
                if body:
                    page_text = await body.inner_text()
            except:
                pass

            if is_rate_limited(page_text, page_title):
                return await self._handle_rate_limit(page, url, index, retry_count, "Rate limit page detected")

            # Extract content
            content = await self.extract_sirkuler_content(page)

            if not content or not content.get('content'):
                print(f"  [WARN] No content extracted")
                content = content or {}
                content['content'] = f"Sirküler içeriği yüklenemedi. URL: {url}"

            # Compute content hash for change detection
            new_content_hash = compute_content_hash(content.get('content', ''))

            # In update mode, check if content has changed
            if self.update_mode and existing_hash and existing_hash == new_content_hash:
                print(f"  [UNCHANGED] Content hash matches, skipping")
                self.state['stats']['unchanged'] = self.state['stats'].get('unchanged', 0) + 1
                self.state['completed'].append(url)
                return True

            # Build data object
            timestamp = datetime.now(timezone.utc).isoformat()
            data = {
                'title': content.get('title', ''),
                'sirkuler_no': content.get('sirkuler_no', ''),
                'sirkuler_id': content.get('sirkuler_id', ''),
                'kanun_kodu': content.get('kanun_kodu', ''),
                'tarih': content.get('tarih', ''),
                'content': content.get('content', ''),
                'content_hash': new_content_hash,
                'url': url,
                'source': 'gib.gov.tr',
                'source_type': 'sirkuler',
                'crawled_at': existing_data.get('crawled_at', timestamp) if existing_data else timestamp,
                'updated_at': timestamp,
                'crawler': CRAWLER_NAME
            }

            # Save to Redis
            r.set(redis_key, json.dumps(data, ensure_ascii=False, indent=2))

            # Track if this is an update or new
            if existing_data:
                print(f"  [UPDATED] {redis_key}")
                self.state['stats']['updated'] = self.state['stats'].get('updated', 0) + 1
            else:
                print(f"  [NEW] Saved: {redis_key}")
                self.state['stats']['success'] += 1

            print(f"  Title: {content.get('title', 'N/A')[:60]}...")
            print(f"  Content: {len(content.get('content', ''))} chars")

            self.state['completed'].append(url)
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

    async def _handle_rate_limit(self, page, url: str, index: int, retry_count: int, reason: str) -> bool:
        """Handle rate limiting with exponential backoff"""
        if retry_count >= RATE_LIMIT_MAX_RETRIES:
            print(f"  [RATE LIMIT] Max retries ({RATE_LIMIT_MAX_RETRIES}) exceeded for {url}")
            self.state['failed'].append(url)
            self.state['stats']['failed'] += 1
            return False

        # Calculate exponential backoff wait time
        wait_time = min(RATE_LIMIT_INITIAL_WAIT * (2 ** retry_count), RATE_LIMIT_MAX_WAIT)

        print(f"  [RATE LIMIT] {reason}")
        print(f"  [RATE LIMIT] Waiting {wait_time} seconds before retry {retry_count + 1}/{RATE_LIMIT_MAX_RETRIES}...")

        # Save state before waiting
        save_state(self.state)

        await asyncio.sleep(wait_time)

        # Retry the URL
        return await self.process_url(page, url, index, retry_count + 1)

    async def run(self):
        """Run the crawler"""
        mode_str = "FORCE" if self.force_mode else "UPDATE" if self.update_mode else "NORMAL"
        print(f"\n{'='*60}")
        print(f"GIB Sirkuler Crawler - Vergilex")
        print(f"{'='*60}")
        print(f"Mode: {mode_str}")
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
        print(f"CRAWL COMPLETE - {mode_str} MODE")
        print(f"{'='*60}")
        print(f"Duration: {duration:.1f} seconds ({duration/60:.1f} minutes)")
        print(f"New: {self.state['stats'].get('success', 0)}")
        print(f"Updated: {self.state['stats'].get('updated', 0)}")
        print(f"Unchanged: {self.state['stats'].get('unchanged', 0)}")
        print(f"Failed: {self.state['stats'].get('failed', 0)}")
        print(f"Total completed: {len(self.state['completed'])}")
        print(f"{'='*60}\n")


async def main():
    # Parse arguments
    parser = argparse.ArgumentParser(description='Vergilex GIB Sirkuler Crawler')
    parser.add_argument('start_index', nargs='?', type=int, default=0,
                        help='Starting index (default: 0)')
    parser.add_argument('--update', '-u', action='store_true',
                        help='Update mode: check for changes and update if content differs')
    parser.add_argument('--force', '-f', action='store_true',
                        help='Force mode: recrawl everything regardless of existing data')

    args = parser.parse_args()

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
    crawler = GIBSirkulerCrawler(
        links,
        start_index=args.start_index,
        force_mode=args.force,
        update_mode=args.update
    )
    await crawler.run()


if __name__ == "__main__":
    asyncio.run(main())
