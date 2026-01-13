#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Vergilex Mevzuat Crawler
Crawls laws (Kanunlar) and general communiques (Genel Tebligler) from mevzuat.gov.tr
Uses Playwright for dynamic content and iframe handling
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
CRAWLER_NAME = "vergilex_mevzuat"
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
REDIS_DB = int(os.getenv('REDIS_DB', 2))  # Vergilex uses DB 2
REDIS_KEY_PREFIX = f'crawl4ai:{CRAWLER_NAME}'

# State file for resume support
STATE_FILE = os.path.join(os.path.dirname(__file__), f'{CRAWLER_NAME}_state.json')

# Link file path
LINKS_FILE = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'docs', 'MEVZUATGOVTR-KANUN LINKLERI.html')

# Rate limiting
MIN_DELAY = 3
MAX_DELAY = 6
# --- End of Configuration ---

# Redis connection
r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, decode_responses=True)


def load_links_from_file(filepath: str) -> dict:
    """Load URLs from the links file, categorized by type"""
    result = {
        'kanunlar': [],
        'tebligler': []
    }

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
            return result

        # Split by sections
        lines = content.split('\n')
        current_section = None

        for line in lines:
            line = line.strip()

            # Detect section headers
            if 'KANUNLAR' in line.upper():
                current_section = 'kanunlar'
                continue
            elif 'TEBLİĞ' in line.upper() or 'TEBLIG' in line.upper():
                current_section = 'tebligler'
                continue

            # Extract URLs
            if 'mevzuat.gov.tr' in line:
                # Clean the URL
                url = line.strip()
                # Handle HTML entities
                url = url.replace('&amp;', '&')

                if 'MevzuatFihristDetayIframe' in url:
                    if url not in result['kanunlar']:
                        result['kanunlar'].append(url)
                elif 'MevzuatNo=' in url and 'MevzuatTur=9' in url:
                    if url not in result['tebligler']:
                        result['tebligler'].append(url)

    except Exception as e:
        print(f"[ERROR] Failed to load links: {e}")

    return result


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
    return {
        'completed_kanunlar': [],
        'completed_tebligler': [],
        'failed': [],
        'stats': {'kanunlar': 0, 'tebligler': 0, 'failed': 0}
    }


class MevzuatCrawler:
    def __init__(self, links: dict, doc_type: str = 'all', start_index: int = 0):
        self.links = links
        self.doc_type = doc_type  # 'kanunlar', 'tebligler', or 'all'
        self.start_index = start_index
        self.state = load_state()

    async def extract_kanun_content(self, page, url: str) -> dict:
        """Extract law content from mevzuat.gov.tr iframe page"""
        try:
            # Wait for page to load
            await page.wait_for_load_state('networkidle', timeout=20000)
            await asyncio.sleep(2)

            content_data = {
                'title': '',
                'mevzuat_no': '',
                'mevzuat_tur': '',
                'kabul_tarihi': '',
                'resmi_gazete_tarihi': '',
                'resmi_gazete_sayisi': '',
                'maddeler': [],
                'content': ''
            }

            # Extract parameters from URL
            params = {}
            if '?' in url:
                query = url.split('?')[1]
                for param in query.split('&'):
                    if '=' in param:
                        key, value = param.split('=', 1)
                        params[key] = value

            content_data['mevzuat_no'] = params.get('MevzuatNo', '')
            content_data['mevzuat_tur'] = params.get('MevzuatTur', '')

            # This page uses iframe - try to access iframe content
            # First check if there's an iframe
            iframe_element = await page.query_selector('iframe')

            target_page = page
            if iframe_element:
                try:
                    frame = await iframe_element.content_frame()
                    if frame:
                        await frame.wait_for_load_state('networkidle', timeout=15000)
                        target_page = frame
                except:
                    pass

            # Get title
            title_selectors = ['h1', '.baslik', '.title', '[class*="baslik"]', '.kanun-adi']
            for selector in title_selectors:
                try:
                    element = await target_page.query_selector(selector)
                    if element:
                        title = await element.inner_text()
                        if title and len(title) > 10:
                            content_data['title'] = title.strip()
                            break
                except:
                    continue

            # If no title from page, try to get from document
            if not content_data['title']:
                page_title = await page.title()
                if page_title:
                    content_data['title'] = page_title.strip()

            # Extract metadata
            meta_patterns = {
                'kabul_tarihi': [r'Kabul\s*Tarihi\s*[:\s]*(\d{1,2}[./]\d{1,2}[./]\d{4})', r'(\d{1,2}[./]\d{1,2}[./]\d{4})'],
                'resmi_gazete_tarihi': [r'Resmî?\s*Gazete\s*Tarihi\s*[:\s]*(\d{1,2}[./]\d{1,2}[./]\d{4})'],
                'resmi_gazete_sayisi': [r'Resmî?\s*Gazete\s*Sayısı\s*[:\s]*(\d+)']
            }

            # Get all text content
            body_html = ""
            try:
                body = await target_page.query_selector('body')
                if body:
                    body_html = await body.inner_html()
            except:
                pass

            if body_html:
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(body_html, 'html.parser')

                # Remove scripts and styles
                for tag in soup(['script', 'style', 'nav', 'header', 'footer']):
                    tag.decompose()

                full_text = soup.get_text(' ', strip=True)

                # Extract metadata
                for field, patterns in meta_patterns.items():
                    for pattern in patterns:
                        match = re.search(pattern, full_text, re.IGNORECASE)
                        if match:
                            content_data[field] = match.group(1)
                            break

                # Extract articles (Madde)
                madde_pattern = r'(Madde\s*\d+[^M]*?)(?=Madde\s*\d+|$)'
                maddeler = re.findall(madde_pattern, full_text, re.DOTALL | re.IGNORECASE)

                if maddeler:
                    content_data['maddeler'] = [m.strip()[:2000] for m in maddeler[:100]]  # Limit articles

                # Full content
                paragraphs = []
                for tag in soup.find_all(['p', 'div', 'article', 'section', 'td']):
                    text = tag.get_text(strip=True)
                    if text and len(text) > 30:
                        paragraphs.append(text)

                # Deduplicate
                seen = set()
                unique = []
                for p in paragraphs:
                    key = p[:80]
                    if key not in seen:
                        seen.add(key)
                        unique.append(p)

                content_data['content'] = '\n\n'.join(unique[:100])

            return content_data

        except Exception as e:
            print(f"  [ERROR] Kanun extraction failed: {str(e)[:100]}")
            return None

    async def extract_teblig_content(self, page, url: str) -> dict:
        """Extract communique content from mevzuat.gov.tr"""
        try:
            await page.wait_for_load_state('networkidle', timeout=20000)
            await asyncio.sleep(2)

            content_data = {
                'title': '',
                'mevzuat_no': '',
                'resmi_gazete_tarihi': '',
                'resmi_gazete_sayisi': '',
                'content': ''
            }

            # Extract parameters from URL
            params = {}
            if '?' in url:
                query = url.split('?')[1]
                for param in query.split('&'):
                    if '=' in param:
                        key, value = param.split('=', 1)
                        params[key] = value

            content_data['mevzuat_no'] = params.get('MevzuatNo', '')

            # Get page content
            body_html = ""
            try:
                # Try main content selectors
                for selector in ['main', 'article', '.content', '.mevzuat-icerik', 'body']:
                    element = await page.query_selector(selector)
                    if element:
                        html = await element.inner_html()
                        if len(html) > 500:
                            body_html = html
                            break
            except:
                pass

            if body_html:
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(body_html, 'html.parser')

                # Remove unwanted elements
                for tag in soup(['script', 'style', 'nav', 'header', 'footer', 'noscript']):
                    tag.decompose()

                full_text = soup.get_text(' ', strip=True)

                # Extract title
                h1 = soup.find('h1')
                if h1:
                    content_data['title'] = h1.get_text(strip=True)
                else:
                    # Try to find title pattern
                    title_match = re.search(r'(?:Tebliğ|TEBLİĞ)[^.]*', full_text)
                    if title_match:
                        content_data['title'] = title_match.group(0)[:200]

                # Extract dates
                rg_tarih = re.search(r'Resmî?\s*Gazete\s*Tarihi\s*[:\s]*(\d{1,2}[./]\d{1,2}[./]\d{4})', full_text)
                if rg_tarih:
                    content_data['resmi_gazete_tarihi'] = rg_tarih.group(1)

                rg_sayi = re.search(r'Resmî?\s*Gazete\s*Sayısı\s*[:\s]*(\d+)', full_text)
                if rg_sayi:
                    content_data['resmi_gazete_sayisi'] = rg_sayi.group(1)

                # Extract content
                paragraphs = []
                for tag in soup.find_all(['p', 'div', 'article']):
                    text = tag.get_text(strip=True)
                    if text and len(text) > 30:
                        paragraphs.append(text)

                seen = set()
                unique = []
                for p in paragraphs:
                    key = p[:80]
                    if key not in seen:
                        seen.add(key)
                        unique.append(p)

                content_data['content'] = '\n\n'.join(unique[:100])

            # Fallback: get title from page
            if not content_data['title']:
                content_data['title'] = await page.title() or ''

            return content_data

        except Exception as e:
            print(f"  [ERROR] Teblig extraction failed: {str(e)[:100]}")
            return None

    async def process_kanun(self, page, url: str, index: int) -> bool:
        """Process a single law URL"""
        if url in self.state['completed_kanunlar']:
            print(f"[K-{index}] SKIP (already done)")
            return True

        # Extract mevzuat_no for Redis key
        mevzuat_no = ''
        if 'MevzuatNo=' in url:
            match = re.search(r'MevzuatNo=(\d+)', url)
            if match:
                mevzuat_no = match.group(1)

        redis_key = f"{REDIS_KEY_PREFIX}:kanun_{mevzuat_no}" if mevzuat_no else f"{REDIS_KEY_PREFIX}:kanun_{index}"

        if r.exists(redis_key):
            print(f"[K-{index}] SKIP (in Redis): kanun_{mevzuat_no}")
            self.state['completed_kanunlar'].append(url)
            return True

        print(f"\n[KANUN {index}/{len(self.links['kanunlar'])}] MevzuatNo: {mevzuat_no}")

        try:
            response = await page.goto(url, wait_until='domcontentloaded', timeout=30000)

            if not response or response.status >= 400:
                print(f"  [ERROR] HTTP {response.status if response else 'No response'}")
                self.state['failed'].append(url)
                return False

            content = await self.extract_kanun_content(page, url)

            if not content:
                content = {'content': f"İçerik yüklenemedi. URL: {url}"}

            timestamp = datetime.utcnow().isoformat()
            data = {
                'title': content.get('title', f'Kanun No: {mevzuat_no}'),
                'mevzuat_no': mevzuat_no,
                'mevzuat_tur': 'Kanun',
                'kabul_tarihi': content.get('kabul_tarihi', ''),
                'resmi_gazete_tarihi': content.get('resmi_gazete_tarihi', ''),
                'resmi_gazete_sayisi': content.get('resmi_gazete_sayisi', ''),
                'maddeler': content.get('maddeler', []),
                'content': content.get('content', ''),
                'url': url,
                'source': 'mevzuat.gov.tr',
                'source_type': 'kanun',
                'crawled_at': timestamp,
                'crawler': CRAWLER_NAME
            }

            r.set(redis_key, json.dumps(data, ensure_ascii=False, indent=2))

            print(f"  [OK] Saved: {redis_key}")
            print(f"  Title: {content.get('title', 'N/A')[:60]}...")
            print(f"  Maddeler: {len(content.get('maddeler', []))}")
            print(f"  Content: {len(content.get('content', ''))} chars")

            self.state['completed_kanunlar'].append(url)
            self.state['stats']['kanunlar'] += 1
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

    async def process_teblig(self, page, url: str, index: int) -> bool:
        """Process a single communique URL"""
        if url in self.state['completed_tebligler']:
            print(f"[T-{index}] SKIP (already done)")
            return True

        # Extract mevzuat_no for Redis key
        mevzuat_no = ''
        if 'MevzuatNo=' in url:
            match = re.search(r'MevzuatNo=(\d+)', url)
            if match:
                mevzuat_no = match.group(1)

        redis_key = f"{REDIS_KEY_PREFIX}:teblig_{mevzuat_no}" if mevzuat_no else f"{REDIS_KEY_PREFIX}:teblig_{index}"

        if r.exists(redis_key):
            print(f"[T-{index}] SKIP (in Redis): teblig_{mevzuat_no}")
            self.state['completed_tebligler'].append(url)
            return True

        print(f"\n[TEBLİĞ {index}/{len(self.links['tebligler'])}] MevzuatNo: {mevzuat_no}")

        try:
            response = await page.goto(url, wait_until='domcontentloaded', timeout=30000)

            if not response or response.status >= 400:
                print(f"  [ERROR] HTTP {response.status if response else 'No response'}")
                self.state['failed'].append(url)
                return False

            content = await self.extract_teblig_content(page, url)

            if not content:
                content = {'content': f"İçerik yüklenemedi. URL: {url}"}

            timestamp = datetime.utcnow().isoformat()
            data = {
                'title': content.get('title', f'Tebliğ No: {mevzuat_no}'),
                'mevzuat_no': mevzuat_no,
                'mevzuat_tur': 'Genel Tebliğ',
                'resmi_gazete_tarihi': content.get('resmi_gazete_tarihi', ''),
                'resmi_gazete_sayisi': content.get('resmi_gazete_sayisi', ''),
                'content': content.get('content', ''),
                'url': url,
                'source': 'mevzuat.gov.tr',
                'source_type': 'teblig',
                'crawled_at': timestamp,
                'crawler': CRAWLER_NAME
            }

            r.set(redis_key, json.dumps(data, ensure_ascii=False, indent=2))

            print(f"  [OK] Saved: {redis_key}")
            print(f"  Title: {content.get('title', 'N/A')[:60]}...")
            print(f"  Content: {len(content.get('content', ''))} chars")

            self.state['completed_tebligler'].append(url)
            self.state['stats']['tebligler'] += 1
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
        print(f"Mevzuat Crawler - Vergilex")
        print(f"{'='*60}")
        print(f"Document type: {self.doc_type}")
        print(f"Kanunlar: {len(self.links['kanunlar'])}")
        print(f"Tebliğler: {len(self.links['tebligler'])}")
        print(f"Redis DB: {REDIS_DB}")
        print(f"{'='*60}\n")

        start_time = datetime.now()

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                    '--disable-setuid-sandbox'
                ]
            )

            context = await browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                locale='tr-TR',
                timezone_id='Europe/Istanbul'
            )

            page = await context.new_page()

            await page.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            """)

            try:
                # Process Kanunlar
                if self.doc_type in ['kanunlar', 'all']:
                    print("\n" + "="*40)
                    print("Processing KANUNLAR")
                    print("="*40)

                    for i, url in enumerate(self.links['kanunlar'][self.start_index:], start=self.start_index):
                        await self.process_kanun(page, url, i + 1)

                        if (i + 1) % 10 == 0:
                            save_state(self.state)

                        await asyncio.sleep(random.uniform(MIN_DELAY, MAX_DELAY))

                # Process Tebligler
                if self.doc_type in ['tebligler', 'all']:
                    print("\n" + "="*40)
                    print("Processing TEBLİĞLER")
                    print("="*40)

                    start_idx = self.start_index if self.doc_type == 'tebligler' else 0

                    for i, url in enumerate(self.links['tebligler'][start_idx:], start=start_idx):
                        await self.process_teblig(page, url, i + 1)

                        if (i + 1) % 10 == 0:
                            save_state(self.state)

                        await asyncio.sleep(random.uniform(MIN_DELAY, MAX_DELAY))

            except KeyboardInterrupt:
                print("\n[INTERRUPT] Stopping crawler...")
            except Exception as e:
                print(f"\n[ERROR] Crawler error: {e}")
                import traceback
                traceback.print_exc()
            finally:
                await browser.close()
                save_state(self.state)

        # Summary
        duration = (datetime.now() - start_time).total_seconds()
        print(f"\n{'='*60}")
        print(f"CRAWL COMPLETE")
        print(f"{'='*60}")
        print(f"Duration: {duration:.1f} seconds ({duration/60:.1f} minutes)")
        print(f"Kanunlar: {self.state['stats']['kanunlar']}")
        print(f"Tebliğler: {self.state['stats']['tebligler']}")
        print(f"Failed: {self.state['stats']['failed']}")
        print(f"{'='*60}\n")


async def main():
    # Parse arguments
    doc_type = 'all'
    start_index = 0

    if len(sys.argv) > 1:
        doc_type = sys.argv[1]
        if doc_type not in ['kanunlar', 'tebligler', 'all']:
            print("Usage: python vergilex_mevzuat_crawler.py [kanunlar|tebligler|all] [start_index]")
            sys.exit(1)

    if len(sys.argv) > 2:
        try:
            start_index = int(sys.argv[2])
        except:
            pass

    # Load links
    links_file = Path(LINKS_FILE).resolve()
    print(f"Loading links from: {links_file}")

    if not links_file.exists():
        print(f"[ERROR] Links file not found: {links_file}")
        sys.exit(1)

    links = load_links_from_file(str(links_file))
    print(f"Loaded {len(links['kanunlar'])} kanun links")
    print(f"Loaded {len(links['tebligler'])} tebliğ links")

    if not links['kanunlar'] and not links['tebligler']:
        print("[ERROR] No links found in file")
        sys.exit(1)

    # Run crawler
    crawler = MevzuatCrawler(links, doc_type, start_index)
    await crawler.run()


if __name__ == "__main__":
    asyncio.run(main())
