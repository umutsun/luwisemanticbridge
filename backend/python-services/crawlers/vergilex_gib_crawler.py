#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Vergilex GIB Multi-Category Crawler
Crawls all legislation types from gib.gov.tr for Vergilex platform
Uses Playwright for dynamic Next.js content

Categories:
- sirkuler: Sirküler (Circulars)
- kanunlar: Kanunlar (Laws)
- gerekceler: Gerekçeler (Rationales)
- tebligler: Tebliğler (Communiques)
- yonetmelikler: Yönetmelikler (Regulations)
- ic_genelgeler: İç Genelgeler (Internal Circulars)
- genel_yazilar: Genel Yazılar (General Letters)
- ozelgeler: Özelgeler (Rulings)
- cbk: Cumhurbaşkanı Kararları (Presidential Decrees)
- bkk: Bakanlar Kurulu Kararları (Cabinet Decrees)

Usage:
  python vergilex_gib_crawler.py sirkuler                    # Crawl circulars
  python vergilex_gib_crawler.py kanunlar                    # Crawl laws
  python vergilex_gib_crawler.py tebligler --force           # Force recrawl communiques
  python vergilex_gib_crawler.py all                         # Crawl all categories
  python vergilex_gib_crawler.py --list                      # List available categories
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

# GIB Category Configuration
GIB_CATEGORIES = {
    'sirkuler': {
        'name': 'Sirküler',
        'name_tr': 'Sirküler',
        'crawler_name': 'vergilex_gib_sirkuler',
        'list_url': 'https://gib.gov.tr/sirkuler',
        'link_pattern': r'/kanun/\d+/sirkuler/\d+',
        'url_pattern': r'/kanun/(\d+)/sirkuler/(\d+)',
        'links_file': 'GIBGOVTR-SIRKULER_LINKLERI.json',
        'source_type': 'sirkuler'
    },
    'kanunlar': {
        'name': 'Laws',
        'name_tr': 'Kanunlar',
        'crawler_name': 'vergilex_gib_kanunlar',
        'list_url': 'https://gib.gov.tr/mevzuat/kanunlar',
        'link_pattern': r'/mevzuat/kanun/\d+',
        'url_pattern': r'/mevzuat/kanun/(\d+)',
        'links_file': 'GIBGOVTR-KANUNLAR_LINKLERI.json',
        'source_type': 'kanun'
    },
    'gerekceler': {
        'name': 'Rationales',
        'name_tr': 'Gerekçeler',
        'crawler_name': 'vergilex_gib_gerekceler',
        'list_url': 'https://gib.gov.tr/mevzuat/gerekceler',
        'link_pattern': r'/mevzuat/gerekce/\d+',
        'url_pattern': r'/mevzuat/gerekce/(\d+)',
        'links_file': 'GIBGOVTR-GEREKCELER_LINKLERI.json',
        'source_type': 'gerekce'
    },
    'tebligler': {
        'name': 'Communiques',
        'name_tr': 'Tebliğler',
        'crawler_name': 'vergilex_gib_tebligler',
        'list_url': 'https://gib.gov.tr/mevzuat/tebligler',
        'link_pattern': r'/mevzuat/teblig/\d+',
        'url_pattern': r'/mevzuat/teblig/(\d+)',
        'links_file': 'GIBGOVTR-TEBLIGLER_LINKLERI.json',
        'source_type': 'teblig'
    },
    'yonetmelikler': {
        'name': 'Regulations',
        'name_tr': 'Yönetmelikler',
        'crawler_name': 'vergilex_gib_yonetmelikler',
        'list_url': 'https://gib.gov.tr/mevzuat/yonetmelikler',
        'link_pattern': r'/mevzuat/yonetmelik/\d+',
        'url_pattern': r'/mevzuat/yonetmelik/(\d+)',
        'links_file': 'GIBGOVTR-YONETMELIKLER_LINKLERI.json',
        'source_type': 'yonetmelik'
    },
    'ic_genelgeler': {
        'name': 'Internal Circulars',
        'name_tr': 'İç Genelgeler',
        'crawler_name': 'vergilex_gib_ic_genelgeler',
        'list_url': 'https://gib.gov.tr/mevzuat/ic-genelgeler',
        'link_pattern': r'/mevzuat/ic-genelge/\d+',
        'url_pattern': r'/mevzuat/ic-genelge/(\d+)',
        'links_file': 'GIBGOVTR-IC_GENELGELER_LINKLERI.json',
        'source_type': 'ic_genelge'
    },
    'genel_yazilar': {
        'name': 'General Letters',
        'name_tr': 'Genel Yazılar',
        'crawler_name': 'vergilex_gib_genel_yazilar',
        'list_url': 'https://gib.gov.tr/mevzuat/genel-yazilar',
        'link_pattern': r'/mevzuat/genel-yazi/\d+',
        'url_pattern': r'/mevzuat/genel-yazi/(\d+)',
        'links_file': 'GIBGOVTR-GENEL_YAZILAR_LINKLERI.json',
        'source_type': 'genel_yazi'
    },
    'ozelgeler': {
        'name': 'Rulings',
        'name_tr': 'Özelgeler',
        'crawler_name': 'vergilex_gib_ozelgeler',
        'list_url': 'https://gib.gov.tr/ozelge',
        'link_pattern': r'/ozelge/\d+',
        'url_pattern': r'/ozelge/(\d+)',
        'links_file': 'GIBGOVTR-OZELGELER_LINKLERI.json',
        'source_type': 'ozelge'
    },
    'cbk': {
        'name': 'Presidential Decrees',
        'name_tr': 'Cumhurbaşkanı Kararları',
        'crawler_name': 'vergilex_gib_cbk',
        'list_url': 'https://gib.gov.tr/mevzuat/cumhurbaskani-kararlari',
        'link_pattern': r'/mevzuat/cbk/\d+',
        'url_pattern': r'/mevzuat/cbk/(\d+)',
        'links_file': 'GIBGOVTR-CBK_LINKLERI.json',
        'source_type': 'cbk'
    },
    'bkk': {
        'name': 'Cabinet Decrees',
        'name_tr': 'Bakanlar Kurulu Kararları',
        'crawler_name': 'vergilex_gib_bkk',
        'list_url': 'https://gib.gov.tr/mevzuat/bkk',
        'link_pattern': r'/mevzuat/bkk/\d+',
        'url_pattern': r'/mevzuat/bkk/(\d+)',
        'links_file': 'GIBGOVTR-BKK_LINKLERI.json',
        'source_type': 'bkk'
    }
}

# GIB Kanun Codes mapping
GIB_KANUN_CODES = {
    '433': 'GVK (Gelir Vergisi Kanunu)',
    '434': 'VUK (Vergi Usul Kanunu)',
    '435': 'KVK (Kurumlar Vergisi Kanunu)',
    '436': 'KDV (Katma Değer Vergisi Kanunu)',
    '437': 'ÖTV (Özel Tüketim Vergisi Kanunu)',
    '438': 'DVK (Damga Vergisi Kanunu)',
    '439': 'HK (Harçlar Kanunu)',
    '440': 'VİVK (Veraset ve İntikal Vergisi Kanunu)',
    '441': 'MVK (Motorlu Taşıtlar Vergisi Kanunu)',
    '442': 'EMLK (Emlak Vergisi Kanunu)',
    '443': 'BSMVK (Banka ve Sigorta Muameleleri Vergisi Kanunu)',
    '444': 'AATUHK (Amme Alacaklarının Tahsil Usulü Hakkında Kanun)',
    '445': 'TPKK (Türk Parası Kıymetini Koruma Kanunu)',
    '446': 'TK (Ticaret Kanunu)',
    '447': 'TTK (Türk Ticaret Kanunu)',
    '448': 'TVK (Türkiye Vergi Kanunu)',
    '449': 'KDDVK (Kanunda Değişiklik Yapılmasına Dair Kanun)',
    '450': 'SVKK (Sermaye Vergisi Kanunu)',
    '451': 'GKK (Gider Katkısı Kanunu)',
    '471': 'YATIRIM (Yatırım Teşvik Mevzuatı)',
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
    ]
    for pattern in ui_patterns:
        title = re.sub(pattern, '', title, flags=re.IGNORECASE)

    # Fix spacing: add space before capital letters following lowercase
    title = re.sub(r'([a-zçğıöşü])([A-ZÇĞİÖŞÜ])', r'\1 \2', title)

    # Fix spacing: add space between number and text
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

    # Normalize whitespace
    title = re.sub(r'\s+', ' ', title).strip()

    # Remove leading/trailing punctuation
    title = re.sub(r'^[\s\-:.,/]+|[\s\-:.,/]+$', '', title)

    return title


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

        # Extract URLs matching the category pattern
        pattern = category_config['link_pattern']
        url_pattern = r'https?://[^\s<>"\']+gib\.gov\.tr[^\s<>"\']*'
        found_urls = re.findall(url_pattern, content)

        for url in found_urls:
            url = url.strip()
            if re.search(pattern, url) and url not in links:
                links.append(url)

        print(f"[INFO] Loaded {len(links)} links from HTML: {filepath}")
    except Exception as e:
        print(f"[ERROR] Failed to load links from HTML: {e}")
    return links


def save_state(state: dict, category: str):
    """Save crawler state for resume"""
    state_file = os.path.join(os.path.dirname(__file__), f'vergilex_gib_{category}_state.json')
    try:
        with open(state_file, 'w', encoding='utf-8') as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[ERROR] Failed to save state: {e}")


def load_state(category: str) -> dict:
    """Load crawler state"""
    state_file = os.path.join(os.path.dirname(__file__), f'vergilex_gib_{category}_state.json')
    try:
        if os.path.exists(state_file):
            with open(state_file, 'r', encoding='utf-8') as f:
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


def set_crawler_running(category_config: dict, total_links: int):
    """Set crawler running status in Redis for UI"""
    job_data = {
        "jobId": f"gib_{category_config['source_type']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "status": "running",
        "category": category_config['name_tr'],
        "totalLinks": total_links
    }
    r.set(f"crawler_running:{category_config['crawler_name']}", json.dumps(job_data))


def clear_crawler_running(category_config: dict):
    """Clear crawler running status"""
    r.delete(f"crawler_running:{category_config['crawler_name']}")


class GIBCategoryCrawler:
    def __init__(self, category: str, links: list, start_index: int = 0,
                 force_mode: bool = False, update_mode: bool = False):
        self.category = category
        self.category_config = GIB_CATEGORIES[category]
        self.links = links
        self.start_index = start_index
        self.force_mode = force_mode
        self.update_mode = update_mode
        self.state = load_state(category)
        self.redis_prefix = f"crawl4ai:{self.category_config['crawler_name']}"

        # Reset state for force mode
        if force_mode:
            self.state = {'completed': [], 'failed': [], 'stats': {'success': 0, 'failed': 0, 'updated': 0, 'unchanged': 0}}

    async def extract_content(self, page) -> dict:
        """Extract content from GIB page based on category"""
        try:
            # Wait for content to load (Next.js hydration)
            await page.wait_for_load_state('networkidle', timeout=15000)
            await asyncio.sleep(2)

            content_data = {
                'title': '',
                'content': '',
                'metadata': {}
            }

            # Get page title
            title = await page.title()
            if title and 'Gelir İdaresi' not in title:
                content_data['title'] = clean_title(title)

            # Extract document ID from URL
            url = page.url
            url_match = re.search(self.category_config['url_pattern'], url)
            if url_match:
                content_data['metadata']['doc_id'] = url_match.group(1)
                if len(url_match.groups()) > 1:
                    content_data['metadata']['secondary_id'] = url_match.group(2)

            # Try multiple selectors for content extraction
            selectors_to_try = [
                'main',
                'article',
                '.content',
                '.mevzuat-content',
                '[class*="content"]',
                '[class*="detail"]',
                '#content',
                '.container main',
                '.accordion-body',
                '.panel-body',
                '.tab-content',
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
                soup = BeautifulSoup(content_html, 'html.parser')

                # Remove unwanted elements
                for tag in soup(['script', 'style', 'nav', 'header', 'footer', 'noscript', 'iframe']):
                    tag.decompose()

                text_content = soup.get_text(' ', strip=True)

                # Category-specific extraction
                content_data = self._extract_category_specific(content_data, soup, text_content, url)

                # Extract main content paragraphs
                paragraphs = []
                for tag in soup.find_all(['p', 'div', 'article', 'section']):
                    text = tag.get_text(strip=True)
                    if text and len(text) > 50:
                        if not any(skip in text.lower() for skip in ['anasayfa', 'menü', 'arama', 'giriş']):
                            paragraphs.append(text)

                # Remove duplicates
                seen = set()
                unique_paragraphs = []
                for p in paragraphs:
                    p_normalized = p[:100]
                    if p_normalized not in seen:
                        seen.add(p_normalized)
                        unique_paragraphs.append(p)

                content_data['content'] = '\n\n'.join(unique_paragraphs[:50])

                # Extract title from content if not found
                if not content_data['title']:
                    h1 = soup.find('h1')
                    if h1:
                        title_text = h1.get_text(strip=True)
                        if title_text and 'Gelir İdaresi' not in title_text:
                            content_data['title'] = clean_title(title_text)

            return content_data

        except Exception as e:
            print(f"  [ERROR] Content extraction failed: {str(e)[:100]}")
            return None

    def _extract_category_specific(self, content_data: dict, soup, text_content: str, url: str) -> dict:
        """Extract category-specific metadata"""
        category = self.category

        if category == 'sirkuler':
            # Extract sirkuler number
            sirkuler_patterns = [
                r'Sirküler\s*No\s*([A-ZÇĞİÖŞÜ]+-\d+/\d+[-/][^\n]+?)(?:Sirküler\s*Tarihi|Konusu|Tarihi\s*:|\s{2,})',
                r'Sayısı\s*:\s*([A-ZÇĞİÖŞÜ]+-\d+/\d+[-/][^\n]+?)(?:İlgili|Tarihi|\s{2,})',
                r'Sirküler\s*(?:No|Numarası)?\s*[:\s]*([A-ZÇĞİÖŞÜ]+-\d+/\d+-\d+)',
            ]
            for pattern in sirkuler_patterns:
                match = re.search(pattern, text_content, re.IGNORECASE)
                if match:
                    content_data['metadata']['sirkuler_no'] = match.group(1)
                    break

        elif category == 'kanunlar':
            # Extract law number and name
            kanun_patterns = [
                r'(\d+)\s*Sayılı\s*(.+?)\s*Kanun',
                r'Kanun\s*(?:No|Numarası)?\s*[:\s]*(\d+)',
            ]
            for pattern in kanun_patterns:
                match = re.search(pattern, text_content, re.IGNORECASE)
                if match:
                    content_data['metadata']['kanun_no'] = match.group(1)
                    if len(match.groups()) > 1:
                        content_data['metadata']['kanun_adi'] = match.group(2)
                    break

        elif category == 'tebligler':
            # Extract teblig info
            teblig_patterns = [
                r'Tebliğ\s*(?:No|Seri\s*No)?\s*[:\s]*([^\n]+?)(?:Tarih|İlgili|\s{2,})',
                r'Genel\s*Tebliğ\s*(?:Seri\s*No)?\s*[:\s]*(\d+)',
            ]
            for pattern in teblig_patterns:
                match = re.search(pattern, text_content, re.IGNORECASE)
                if match:
                    content_data['metadata']['teblig_no'] = match.group(1).strip()
                    break

        elif category == 'ozelgeler':
            # Extract ozelge date and subject
            date_match = re.search(r'(\d{2}[./]\d{2}[./]\d{4})', text_content)
            if date_match:
                content_data['metadata']['tarih'] = date_match.group(1)

        # Common: Extract date
        date_patterns = [
            r'Tarih\s*[:\s]*(\d{1,2}[./]\d{1,2}[./]\d{2,4})',
            r'(\d{1,2}[./]\d{1,2}[./]\d{4})',
        ]
        for pattern in date_patterns:
            match = re.search(pattern, text_content)
            if match:
                content_data['metadata']['tarih'] = match.group(1)
                break

        # Common: Extract subject
        konu_patterns = [
            r'Konusu?\s*:\s*(.+?)(?:Tarih|İlgili|Sayısı|\s{2,})',
        ]
        for pattern in konu_patterns:
            match = re.search(pattern, text_content)
            if match:
                konu = match.group(1).strip()
                if len(konu) > 5 and len(konu) < 200:
                    content_data['metadata']['konu'] = konu
                    break

        return content_data

    async def process_url(self, page, url: str, index: int, retry_count: int = 0) -> bool:
        """Process a single URL"""
        # Generate Redis key
        url_match = re.search(self.category_config['url_pattern'], url)
        if url_match:
            if len(url_match.groups()) > 1:
                redis_key = f"{self.redis_prefix}:{url_match.group(1)}_{url_match.group(2)}"
            else:
                redis_key = f"{self.redis_prefix}:{url_match.group(1)}"
        else:
            slug = url.split('/')[-1] or 'unknown'
            redis_key = f"{self.redis_prefix}:{slug}"

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
            content = await self.extract_content(page)

            if not content or not content.get('content'):
                print(f"  [WARN] No content extracted")
                content = content or {}
                content['content'] = f"İçerik yüklenemedi. URL: {url}"

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
                'title': content.get('title', ''),
                'content': content.get('content', ''),
                'content_hash': new_content_hash,
                'url': url,
                'source': 'gib.gov.tr',
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
        print(f"GIB {self.category_config['name_tr']} Crawler - Vergilex")
        print(f"{'='*60}")
        print(f"Category: {self.category} ({self.category_config['name_tr']})")
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
    if category not in GIB_CATEGORIES:
        print(f"[ERROR] Unknown category: {category}")
        print(f"[INFO] Available categories: {', '.join(GIB_CATEGORIES.keys())}")
        return

    config = GIB_CATEGORIES[category]

    # Try to load links from JSON first, then fall back to HTML
    json_file = os.path.join(DOCS_DIR, config['links_file'])
    links = load_links_from_json(json_file)

    # Fallback to HTML file (legacy support)
    if not links:
        html_file = os.path.join(DOCS_DIR, config['links_file'].replace('.json', '.html'))
        # Also try with space in filename (legacy)
        if not os.path.exists(html_file):
            html_file = os.path.join(DOCS_DIR, f"GIBGOVTR-{config['source_type'].upper()} LINKLERI.html")
        links = load_links_from_html(html_file, config)

    if not links:
        print(f"[ERROR] No links found for category: {category}")
        print(f"[INFO] Expected file: {json_file}")
        print(f"[INFO] Run link extractor first: python gib_link_extractor.py {category}")
        return

    crawler = GIBCategoryCrawler(
        category,
        links,
        start_index=start_index,
        force_mode=force_mode,
        update_mode=update_mode
    )
    await crawler.run()


async def crawl_all_categories(force_mode: bool = False, update_mode: bool = False):
    """Crawl all GIB categories sequentially"""
    print(f"\n{'='*60}")
    print("GIB Full Crawl - All Categories")
    print(f"{'='*60}")
    print(f"Categories: {len(GIB_CATEGORIES)}")
    print(f"Mode: {'FORCE' if force_mode else 'UPDATE' if update_mode else 'NORMAL'}")
    print(f"{'='*60}\n")

    for category in GIB_CATEGORIES.keys():
        print(f"\n[STARTING] Category: {category}")
        await crawl_category(category, force_mode=force_mode, update_mode=update_mode)
        # Delay between categories
        await asyncio.sleep(10)

    print(f"\n{'='*60}")
    print("ALL CATEGORIES COMPLETE")
    print(f"{'='*60}\n")


def list_categories():
    """List available categories"""
    print(f"\n{'='*60}")
    print("Available GIB Categories")
    print(f"{'='*60}")
    for key, config in GIB_CATEGORIES.items():
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
        print(f"  {key:20} - {config['name_tr']:30} {status}")
    print(f"{'='*60}")
    print("\nUsage:")
    print("  python vergilex_gib_crawler.py <category>              # Crawl specific category")
    print("  python vergilex_gib_crawler.py all                     # Crawl all categories")
    print("  python vergilex_gib_crawler.py <category> --force      # Force recrawl")
    print("  python vergilex_gib_crawler.py <category> --update     # Update changed only")
    print("  python vergilex_gib_crawler.py --list                  # Show this list")
    print(f"\n")


async def main():
    parser = argparse.ArgumentParser(description='Vergilex GIB Multi-Category Crawler')
    parser.add_argument('category', nargs='?', default=None,
                        help='Category to crawl (sirkuler, kanunlar, etc.) or "all"')
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
    elif args.category in GIB_CATEGORIES:
        await crawl_category(args.category, args.start_index, args.force, args.update)
    else:
        print(f"[ERROR] Unknown category: {args.category}")
        list_categories()


if __name__ == "__main__":
    print("GIB crawler started")
    asyncio.run(main())
