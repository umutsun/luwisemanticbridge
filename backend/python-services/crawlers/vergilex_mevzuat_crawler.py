#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Vergilex Mevzuat Multi-Category Crawler
Crawls all legislation types from mevzuat.gov.tr for Vergilex platform
Uses Playwright for dynamic content and iframe handling

Categories (MevzuatTur):
- kanunlar (1): Kanunlar (Laws)
- tuzukler (2): Tüzükler (Old-style Regulations)
- yonetmelikler (3): Yönetmelikler (Regulations)
- khk (4): Kanun Hükmünde Kararnameler (Decree Laws)
- cbk (6): Cumhurbaşkanlığı Kararnameleri (Presidential Decrees)
- tebligler (9): Genel Tebliğler (Communiques)

Usage:
  python vergilex_mevzuat_crawler.py kanunlar                 # Crawl laws
  python vergilex_mevzuat_crawler.py tebligler                # Crawl communiques
  python vergilex_mevzuat_crawler.py yonetmelikler --force    # Force recrawl regulations
  python vergilex_mevzuat_crawler.py all                      # Crawl all categories
  python vergilex_mevzuat_crawler.py --list                   # List available categories
"""

import asyncio
import json
import os
import sys
import re
import hashlib
import argparse
from datetime import datetime, timezone
from pathlib import Path
import random
import io

# Fix Windows console encoding for Turkish characters
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import redis

try:
    from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
except ImportError:
    print("[ERROR] Playwright not installed")
    print("[ERROR] Install: pip install playwright")
    print("[ERROR] Then: playwright install chromium")
    sys.exit(1)

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("[ERROR] BeautifulSoup not installed")
    print("[ERROR] Install: pip install beautifulsoup4")
    sys.exit(1)

# --- Configuration ---
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
REDIS_DB = int(os.getenv('REDIS_DB', 2))  # Vergilex uses DB 2

# Base directory for docs
DOCS_DIR = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'docs')

# Rate limiting - mevzuat.gov.tr is sensitive to rate limits
MIN_DELAY = 25
MAX_DELAY = 40

# Rate limit detection patterns
RATE_LIMIT_PATTERNS = [
    'ÇOK FAZLA İSTEK',
    'TOO MANY REQUESTS',
    'RATE LIMIT EXCEEDED',
    'ERİŞİM ENGELLENDİ',
    'ACCESS BLOCKED',
    'ERROR 429',
    'HTTP 429',
    '429 TOO MANY',
]

# Exponential backoff settings
RATE_LIMIT_INITIAL_WAIT = 60
RATE_LIMIT_MAX_WAIT = 600
RATE_LIMIT_MAX_RETRIES = 5

# Mevzuat Category Configuration
MEVZUAT_CATEGORIES = {
    'kanunlar': {
        'name': 'Laws',
        'name_tr': 'Kanunlar',
        'crawler_name': 'vergilex_mevzuat_kanunlar',
        'mevzuat_tur': '1',
        'links_file': 'MEVZUATGOVTR-KANUNLAR_LINKLERI.json',
        'source_type': 'kanun'
    },
    'tuzukler': {
        'name': 'Regulations (Old)',
        'name_tr': 'Tüzükler',
        'crawler_name': 'vergilex_mevzuat_tuzukler',
        'mevzuat_tur': '2',
        'links_file': 'MEVZUATGOVTR-TUZUKLER_LINKLERI.json',
        'source_type': 'tuzuk'
    },
    'yonetmelikler': {
        'name': 'Regulations',
        'name_tr': 'Yönetmelikler',
        'crawler_name': 'vergilex_mevzuat_yonetmelikler',
        'mevzuat_tur': '3',
        'links_file': 'MEVZUATGOVTR-YONETMELIKLER_LINKLERI.json',
        'source_type': 'yonetmelik'
    },
    'khk': {
        'name': 'Decree Laws',
        'name_tr': 'Kanun Hükmünde Kararnameler',
        'crawler_name': 'vergilex_mevzuat_khk',
        'mevzuat_tur': '4',
        'links_file': 'MEVZUATGOVTR-KHK_LINKLERI.json',
        'source_type': 'khk'
    },
    'cbk': {
        'name': 'Presidential Decrees',
        'name_tr': 'Cumhurbaşkanlığı Kararnameleri',
        'crawler_name': 'vergilex_mevzuat_cbk',
        'mevzuat_tur': '6',
        'links_file': 'MEVZUATGOVTR-CBK_LINKLERI.json',
        'source_type': 'cbk'
    },
    'tebligler': {
        'name': 'Communiques',
        'name_tr': 'Genel Tebliğler',
        'crawler_name': 'vergilex_mevzuat_tebligler',
        'mevzuat_tur': '9',
        'links_file': 'MEVZUATGOVTR-TEBLIGLER_LINKLERI.json',
        'source_type': 'teblig'
    }
}

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
        r'Üyelik\s*Bilgileri',
        r'Anasayfa',
        r'Mevzuat Bilgi Sistemi',
    ]
    for pattern in ui_patterns:
        title = re.sub(pattern, '', title, flags=re.IGNORECASE)

    # Fix spacing
    title = re.sub(r'([a-zçğıöşü])([A-ZÇĞİÖŞÜ])', r'\1 \2', title)
    title = re.sub(r'(\d)([A-ZÇĞİÖŞÜa-zçğıöşü])', r'\1 \2', title)
    title = re.sub(r'([A-ZÇĞİÖŞÜa-zçğıöşü])(\d)', r'\1 \2', title)

    # Remove duplicate consecutive words
    words = title.split()
    cleaned_words = []
    for i, word in enumerate(words):
        if i == 0:
            cleaned_words.append(word)
        else:
            prev_word = cleaned_words[-1].upper()
            curr_word = word.upper()
            if curr_word in prev_word or prev_word in curr_word:
                continue
            cleaned_words.append(word)

    title = ' '.join(cleaned_words)
    title = re.sub(r'\s+', ' ', title).strip()
    title = re.sub(r'^[\s\-:.,/×]+|[\s\-:.,/×]+$', '', title)

    return title


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


def load_links_from_json(filepath: str) -> list:
    """Load URLs from JSON links file"""
    links = []
    try:
        if not os.path.exists(filepath):
            print(f"[WARN] Links file not found: {filepath}")
            return links

        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        if 'links' in data:
            for link_item in data['links']:
                if isinstance(link_item, dict) and 'url' in link_item:
                    links.append(link_item['url'])
                elif isinstance(link_item, str):
                    links.append(link_item)

        print(f"[INFO] Loaded {len(links)} links from {filepath}")
    except Exception as e:
        print(f"[ERROR] Failed to load links from JSON: {e}")
    return links


def load_links_from_html(filepath: str, category_config: dict) -> list:
    """Load URLs from HTML links file (legacy support)"""
    links = []
    try:
        if not os.path.exists(filepath):
            return links

        content = None
        for encoding in ['utf-8', 'utf-8-sig', 'latin-1', 'cp1254']:
            try:
                with open(filepath, 'r', encoding=encoding) as f:
                    content = f.read()
                break
            except UnicodeDecodeError:
                continue

        if not content:
            return links

        mevzuat_tur = category_config['mevzuat_tur']

        # Extract URLs
        url_pattern = r'https?://[^\s<>"\']+mevzuat\.gov\.tr[^\s<>"\']*'
        found_urls = re.findall(url_pattern, content)

        for url in found_urls:
            url = url.strip().replace('&amp;', '&')
            # Filter by MevzuatTur
            if f'MevzuatTur={mevzuat_tur}' in url and url not in links:
                links.append(url)

        print(f"[INFO] Loaded {len(links)} links from HTML: {filepath}")
    except Exception as e:
        print(f"[ERROR] Failed to load links from HTML: {e}")
    return links


def save_state(state: dict, category: str):
    """Save crawler state for resume"""
    state_file = os.path.join(os.path.dirname(__file__), f'vergilex_mevzuat_{category}_state.json')
    try:
        with open(state_file, 'w', encoding='utf-8') as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[ERROR] Failed to save state: {e}")


def load_state(category: str) -> dict:
    """Load crawler state"""
    state_file = os.path.join(os.path.dirname(__file__), f'vergilex_mevzuat_{category}_state.json')
    try:
        if os.path.exists(state_file):
            with open(state_file, 'r', encoding='utf-8') as f:
                return json.load(f)
    except:
        pass
    return {'completed': [], 'failed': [], 'stats': {'success': 0, 'failed': 0, 'updated': 0, 'unchanged': 0}}


def set_crawler_running(category_config: dict, total_links: int):
    """Set crawler running status in Redis for UI"""
    job_data = {
        "jobId": f"mevzuat_{category_config['source_type']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "status": "running",
        "category": category_config['name_tr'],
        "totalLinks": total_links
    }
    r.set(f"crawler_running:{category_config['crawler_name']}", json.dumps(job_data))


def clear_crawler_running(category_config: dict):
    """Clear crawler running status"""
    r.delete(f"crawler_running:{category_config['crawler_name']}")


class MevzuatCategoryCrawler:
    def __init__(self, category: str, links: list, start_index: int = 0,
                 force_mode: bool = False, update_mode: bool = False):
        self.category = category
        self.category_config = MEVZUAT_CATEGORIES[category]
        self.links = links
        self.start_index = start_index
        self.force_mode = force_mode
        self.update_mode = update_mode
        self.state = load_state(category)
        self.redis_prefix = f"crawl4ai:{self.category_config['crawler_name']}"

        # Reset state for force mode
        if force_mode:
            self.state = {'completed': [], 'failed': [], 'stats': {'success': 0, 'failed': 0, 'updated': 0, 'unchanged': 0}}

    def _convert_to_iframe_url(self, url: str) -> str:
        """Convert URL to iframe format for better content extraction"""
        params = {}
        if '?' in url:
            query = url.split('?')[1]
            for param in query.split('&'):
                if '=' in param:
                    key, value = param.split('=', 1)
                    params[key] = value

        mevzuat_no = params.get('MevzuatNo', '')
        mevzuat_tur = params.get('MevzuatTur', self.category_config['mevzuat_tur'])
        mevzuat_tertip = params.get('MevzuatTertip', '5')

        iframe_url = f"https://mevzuat.gov.tr/anasayfa/MevzuatFihristDetayIframe?MevzuatTur={mevzuat_tur}&MevzuatNo={mevzuat_no}&MevzuatTertip={mevzuat_tertip}"
        return iframe_url

    async def extract_content(self, page, url: str) -> dict:
        """Extract content from mevzuat.gov.tr page"""
        try:
            await page.wait_for_load_state('networkidle', timeout=20000)
            await asyncio.sleep(2)

            content_data = {
                'title': '',
                'content': '',
                'metadata': {}
            }

            # Extract parameters from URL
            params = {}
            if '?' in url:
                query = url.split('?')[1]
                for param in query.split('&'):
                    if '=' in param:
                        key, value = param.split('=', 1)
                        params[key] = value

            content_data['metadata']['mevzuat_no'] = params.get('MevzuatNo', '')
            content_data['metadata']['mevzuat_tur'] = params.get('MevzuatTur', '')
            content_data['metadata']['mevzuat_tertip'] = params.get('MevzuatTertip', '')

            # Check for iframe
            target_page = page
            iframe_element = await page.query_selector('iframe')
            if iframe_element:
                try:
                    frame = await iframe_element.content_frame()
                    if frame:
                        await frame.wait_for_load_state('networkidle', timeout=15000)
                        target_page = frame
                except:
                    pass

            # Get title
            title_selectors = [
                'h1', 'h2', '.baslik', '.title', '[class*="baslik"]',
                '.kanun-adi', '#icerik h1', '#icerik h2', '.mevzuat-baslik'
            ]

            for selector in title_selectors:
                try:
                    element = await target_page.query_selector(selector)
                    if element:
                        title = await element.inner_text()
                        if title and len(title) > 10 and 'Mevzuat Bilgi Sistemi' not in title:
                            content_data['title'] = clean_title(title)
                            break
                except:
                    continue

            # Get body content
            body_html = ""
            try:
                for selector in ['main', 'article', '.content', '.mevzuat-icerik', '#icerik', '.icerik', 'body']:
                    element = await target_page.query_selector(selector)
                    if element:
                        html = await element.inner_html()
                        if len(html) > 500:
                            body_html = html
                            break
            except:
                pass

            if body_html:
                soup = BeautifulSoup(body_html, 'html.parser')

                # Remove unwanted elements
                for tag in soup(['script', 'style', 'nav', 'header', 'footer', 'noscript']):
                    tag.decompose()

                full_text = soup.get_text(' ', strip=True)

                # Extract metadata
                meta_patterns = {
                    'kabul_tarihi': r'Kabul\s*Tarihi\s*[:\s]*(\d{1,2}[./]\d{1,2}[./]\d{4})',
                    'resmi_gazete_tarihi': r'Resmî?\s*Gazete\s*Tarihi\s*[:\s]*(\d{1,2}[./]\d{1,2}[./]\d{4})',
                    'resmi_gazete_sayisi': r'Resmî?\s*Gazete\s*Sayısı\s*[:\s]*(\d+)'
                }

                for field, pattern in meta_patterns.items():
                    match = re.search(pattern, full_text, re.IGNORECASE)
                    if match:
                        content_data['metadata'][field] = match.group(1)

                # Extract title if not found
                if not content_data['title'] or content_data['title'] == 'Mevzuat Bilgi Sistemi':
                    title_patterns = self._get_title_patterns()
                    for pattern in title_patterns:
                        match = re.search(pattern, full_text[:2000])
                        if match:
                            extracted_title = clean_title(match.group(1))
                            if len(extracted_title) > 15 and len(extracted_title) < 200:
                                if 'Mevzuat Bilgi Sistemi' not in extracted_title:
                                    content_data['title'] = extracted_title
                                    break

                    # Fallback to mevzuat_no
                    if not content_data['title']:
                        mevzuat_no = content_data['metadata'].get('mevzuat_no', '')
                        if mevzuat_no:
                            content_data['title'] = f"{self.category_config['name_tr']} No: {mevzuat_no}"

                # Extract articles (Madde)
                madde_pattern = r'(Madde\s*\d+[^M]*?)(?=Madde\s*\d+|$)'
                maddeler = re.findall(madde_pattern, full_text, re.DOTALL | re.IGNORECASE)
                if maddeler:
                    content_data['metadata']['maddeler'] = [m.strip()[:2000] for m in maddeler[:100]]
                    content_data['metadata']['madde_sayisi'] = len(maddeler)

                # Full content
                paragraphs = []
                for tag in soup.find_all(['p', 'div', 'article', 'section', 'td']):
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

                # Validate content - detect error pages
                error_patterns = [
                    'Kanunlar Fihristindeyapılan aramada',
                    'Kanunlar Fihristi',
                    'aramada çıkan Kanunun',
                    'butonundan arama yapılması gerekmektedir'
                ]
                is_error_page = any(pattern in content_data['content'] for pattern in error_patterns)
                if is_error_page:
                    print("  [WARN] Detected error/info page")
                    return None

            return content_data

        except Exception as e:
            print(f"  [ERROR] Content extraction failed: {str(e)[:100]}")
            return None

    def _get_title_patterns(self) -> list:
        """Get category-specific title patterns"""
        category = self.category

        if category == 'kanunlar':
            return [
                r'([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s]+(?:KANUNU|KANUN))',
                r'(\d+\s*(?:SAYILI|Sayılı)\s+[A-ZÇĞİÖŞÜa-zçğıöşü\s]+(?:KANUNU?|Kanunu?))',
            ]
        elif category == 'tebligler':
            return [
                r'([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s,]+(?:TEBLİĞİ?|Tebliği?)(?:\s*\([^)]+\))?)',
                r'((?:GENEL\s+)?TEBLİĞ[^.]{10,100})',
            ]
        elif category == 'yonetmelikler':
            return [
                r'([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s]+(?:YÖNETMELİĞİ?|Yönetmeliği?))',
            ]
        elif category == 'cbk':
            return [
                r'([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s]+(?:KARARNAMESİ?|Kararnamesi?))',
                r'(CUMHURBAŞKANLIĞI\s+KARARNAMESİ[^.]{10,100})',
            ]
        elif category == 'khk':
            return [
                r'([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s]+(?:HÜKMÜNDE\s+KARARNAME|Hükmünde\s+Kararname))',
                r'(\d+\s*(?:SAYILI|Sayılı)\s+KANUN\s+HÜKMÜNDE\s+KARARNAME)',
            ]
        elif category == 'tuzukler':
            return [
                r'([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s]+(?:TÜZÜĞÜ?|Tüzüğü?))',
            ]
        else:
            return [
                r'([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s]{15,200})',
            ]

    async def process_url(self, page, url: str, index: int, retry_count: int = 0) -> bool:
        """Process a single URL"""
        # Extract mevzuat_no for Redis key
        mevzuat_no = ''
        if 'MevzuatNo=' in url:
            match = re.search(r'MevzuatNo=(\d+)', url)
            if match:
                mevzuat_no = match.group(1)

        redis_key = f"{self.redis_prefix}:{mevzuat_no}" if mevzuat_no else f"{self.redis_prefix}:{index}"

        # Check existing data
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
            if url in self.state['completed']:
                print(f"[{index}] SKIP (already done): MevzuatNo={mevzuat_no}")
                return True
            if existing_data:
                print(f"[{index}] SKIP (in Redis): {redis_key}")
                self.state['completed'].append(url)
                return True

        print(f"\n[{index}/{len(self.links)}] {'UPDATE' if self.update_mode else 'FORCE' if self.force_mode else 'NEW'}: MevzuatNo={mevzuat_no}")

        # Convert to iframe URL for better extraction
        actual_url = self._convert_to_iframe_url(url)

        try:
            response = await page.goto(actual_url, wait_until='domcontentloaded', timeout=30000)

            if not response:
                print(f"  [ERROR] No response")
                self.state['failed'].append(url)
                return False

            # Check for rate limiting
            if response.status == 429:
                return await self._handle_rate_limit(page, url, index, retry_count, "HTTP 429")

            if response.status >= 400:
                print(f"  [ERROR] HTTP {response.status}")
                self.state['failed'].append(url)
                return False

            # Check page content for rate limit
            page_title = await page.title() or ""
            page_text = ""
            try:
                body = await page.query_selector('body')
                if body:
                    page_text = await body.inner_text()
            except:
                pass

            if is_rate_limited(page_text, page_title):
                return await self._handle_rate_limit(page, url, index, retry_count, "Rate limit detected")

            # Extract content
            content = await self.extract_content(page, actual_url)

            if not content or not content.get('content'):
                print(f"  [WARN] No content extracted")
                content = content or {}
                content['content'] = f"İçerik yüklenemedi. URL: {actual_url}"

            # Compute content hash
            new_content_hash = compute_content_hash(content.get('content', ''))

            # Check for changes in update mode
            if self.update_mode and existing_hash and existing_hash == new_content_hash:
                print(f"  [UNCHANGED] Content hash matches")
                self.state['stats']['unchanged'] = self.state['stats'].get('unchanged', 0) + 1
                self.state['completed'].append(url)
                return True

            # Build data object
            timestamp = datetime.now(timezone.utc).isoformat()
            data = {
                'title': content.get('title', f"{self.category_config['name_tr']} No: {mevzuat_no}"),
                'content': content.get('content', ''),
                'content_hash': new_content_hash,
                'url': actual_url,
                'original_url': url,
                'source': 'mevzuat.gov.tr',
                'source_type': self.category_config['source_type'],
                'category': self.category,
                'category_tr': self.category_config['name_tr'],
                'metadata': content.get('metadata', {}),
                'crawled_at': existing_data.get('crawled_at', timestamp) if existing_data else timestamp,
                'updated_at': timestamp,
                'crawler': self.category_config['crawler_name']
            }

            # Save to Redis
            r.set(redis_key, json.dumps(data, ensure_ascii=False, indent=2))

            # Track stats
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
            print(f"  [RATE LIMIT] Max retries exceeded for {url}")
            self.state['failed'].append(url)
            self.state['stats']['failed'] += 1
            return False

        wait_time = min(RATE_LIMIT_INITIAL_WAIT * (2 ** retry_count), RATE_LIMIT_MAX_WAIT)
        print(f"  [RATE LIMIT] {reason}")
        print(f"  [RATE LIMIT] Waiting {wait_time}s before retry {retry_count + 1}/{RATE_LIMIT_MAX_RETRIES}...")

        save_state(self.state, self.category)
        await asyncio.sleep(wait_time)

        return await self.process_url(page, url, index, retry_count + 1)

    async def run(self):
        """Run the crawler"""
        mode_str = "FORCE" if self.force_mode else "UPDATE" if self.update_mode else "NORMAL"

        print(f"\n{'='*60}")
        print(f"Mevzuat {self.category_config['name_tr']} Crawler - Vergilex")
        print(f"{'='*60}")
        print(f"Category: {self.category} ({self.category_config['name_tr']})")
        print(f"MevzuatTur: {self.category_config['mevzuat_tur']}")
        print(f"Mode: {mode_str}")
        print(f"Total links: {len(self.links)}")
        print(f"Already completed: {len(self.state['completed'])}")
        print(f"Starting from index: {self.start_index}")
        print(f"Redis DB: {REDIS_DB}")
        print(f"Redis prefix: {self.redis_prefix}")
        print(f"{'='*60}\n")

        if not self.links:
            print("[ERROR] No links to crawl!")
            return

        # Set crawler running status
        set_crawler_running(self.category_config, len(self.links))

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
                timezone_id='Europe/Istanbul',
                extra_http_headers={
                    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                }
            )

            page = await context.new_page()

            await page.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            """)

            try:
                for i, url in enumerate(self.links[self.start_index:], start=self.start_index):
                    await self.process_url(page, url, i + 1)

                    # Save state periodically
                    if (i + 1) % 10 == 0:
                        save_state(self.state, self.category)
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
                save_state(self.state, self.category)
                clear_crawler_running(self.category_config)

        # Print summary
        duration = (datetime.now() - start_time).total_seconds()
        print(f"\n{'='*60}")
        print(f"CRAWL COMPLETE - {self.category_config['name_tr']} - {mode_str} MODE")
        print(f"{'='*60}")
        print(f"Duration: {duration:.1f} seconds ({duration/60:.1f} minutes)")
        print(f"New: {self.state['stats'].get('success', 0)}")
        print(f"Updated: {self.state['stats'].get('updated', 0)}")
        print(f"Unchanged: {self.state['stats'].get('unchanged', 0)}")
        print(f"Failed: {self.state['stats'].get('failed', 0)}")
        print(f"Total completed: {len(self.state['completed'])}")
        print(f"{'='*60}\n")


async def crawl_category(category: str, start_index: int = 0,
                         force_mode: bool = False, update_mode: bool = False):
    """Crawl a specific category"""
    if category not in MEVZUAT_CATEGORIES:
        print(f"[ERROR] Unknown category: {category}")
        print(f"[INFO] Available categories: {', '.join(MEVZUAT_CATEGORIES.keys())}")
        return

    config = MEVZUAT_CATEGORIES[category]

    # Try to load links from JSON first
    json_file = os.path.join(DOCS_DIR, config['links_file'])
    links = load_links_from_json(json_file)

    # Fallback to HTML file (legacy support)
    if not links:
        html_file = os.path.join(DOCS_DIR, config['links_file'].replace('.json', '.html'))
        # Also try legacy filename format
        if not os.path.exists(html_file):
            legacy_name = config['source_type'].upper().replace('_', ' ')
            html_file = os.path.join(DOCS_DIR, f"MEVZUATGOVTR-{legacy_name} LINKLERI.html")
        links = load_links_from_html(html_file, config)

    if not links:
        print(f"[ERROR] No links found for category: {category}")
        print(f"[INFO] Expected file: {json_file}")
        print(f"[INFO] Run link extractor first: python mevzuat_link_extractor.py {category}")
        return

    crawler = MevzuatCategoryCrawler(
        category,
        links,
        start_index=start_index,
        force_mode=force_mode,
        update_mode=update_mode
    )
    await crawler.run()


async def crawl_all_categories(force_mode: bool = False, update_mode: bool = False):
    """Crawl all Mevzuat categories sequentially"""
    print(f"\n{'='*60}")
    print("Mevzuat Full Crawl - All Categories")
    print(f"{'='*60}")
    print(f"Categories: {len(MEVZUAT_CATEGORIES)}")
    print(f"Mode: {'FORCE' if force_mode else 'UPDATE' if update_mode else 'NORMAL'}")
    print(f"{'='*60}\n")

    for category in MEVZUAT_CATEGORIES.keys():
        print(f"\n[STARTING] Category: {category}")
        await crawl_category(category, force_mode=force_mode, update_mode=update_mode)
        # Delay between categories
        await asyncio.sleep(30)  # Longer delay for mevzuat.gov.tr

    print(f"\n{'='*60}")
    print("ALL CATEGORIES COMPLETE")
    print(f"{'='*60}\n")


def list_categories():
    """List available categories"""
    print(f"\n{'='*60}")
    print("Available Mevzuat Categories")
    print(f"{'='*60}")
    for key, config in MEVZUAT_CATEGORIES.items():
        json_file = os.path.join(DOCS_DIR, config['links_file'])
        link_count = 0
        if os.path.exists(json_file):
            try:
                with open(json_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    link_count = data.get('count', len(data.get('links', [])))
            except:
                pass
        status = f"({link_count} links)" if link_count > 0 else "(no links - run extractor)"
        print(f"  {key:20} - MevzuatTur={config['mevzuat_tur']} - {config['name_tr']:35} {status}")
    print(f"{'='*60}")
    print("\nUsage:")
    print("  python vergilex_mevzuat_crawler.py <category>            # Crawl specific category")
    print("  python vergilex_mevzuat_crawler.py all                   # Crawl all categories")
    print("  python vergilex_mevzuat_crawler.py <category> --force    # Force recrawl")
    print("  python vergilex_mevzuat_crawler.py <category> --update   # Update changed only")
    print("  python vergilex_mevzuat_crawler.py --list                # Show this list")
    print(f"\n")


async def main():
    parser = argparse.ArgumentParser(description='Vergilex Mevzuat Multi-Category Crawler')
    parser.add_argument('category', nargs='?', default=None,
                        help='Category to crawl (kanunlar, tebligler, etc.) or "all"')
    parser.add_argument('start_index', nargs='?', type=int, default=0,
                        help='Starting index (default: 0)')
    parser.add_argument('--update', '-u', action='store_true',
                        help='Update mode: check for changes')
    parser.add_argument('--force', '-f', action='store_true',
                        help='Force mode: recrawl everything')
    parser.add_argument('--list', '-l', action='store_true',
                        help='List available categories')

    args = parser.parse_args()

    if args.list:
        list_categories()
        return

    if not args.category:
        print("[ERROR] No category specified")
        list_categories()
        return

    if args.category == 'all':
        await crawl_all_categories(force_mode=args.force, update_mode=args.update)
    elif args.category in MEVZUAT_CATEGORIES:
        await crawl_category(args.category, args.start_index, args.force, args.update)
    else:
        print(f"[ERROR] Unknown category: {args.category}")
        list_categories()


if __name__ == "__main__":
    print("Mevzuat crawler started")
    asyncio.run(main())
