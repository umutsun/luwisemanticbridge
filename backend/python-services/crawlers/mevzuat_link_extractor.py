#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Mevzuat Link Extractor
Extracts all legislation links from mevzuat.gov.tr for various categories
Outputs links to docs folder for crawlers to use

Categories (MevzuatTur):
- kanunlar (1): Kanunlar (Laws)
- tuzukler (2): Tüzükler (Old-style Regulations)
- yonetmelikler (3): Yönetmelikler (Regulations)
- khk (4): Kanun Hükmünde Kararnameler (Decree Laws)
- cbk (6): Cumhurbaşkanlığı Kararnameleri (Presidential Decrees)
- tebligler (9): Genel Tebliğler (Communiques)
"""

import asyncio
import json
import os
import sys
import re
from datetime import datetime
from pathlib import Path
import io

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("[ERROR] Playwright not installed. Run: pip install playwright && playwright install chromium")
    sys.exit(1)

# Output directory
DOCS_DIR = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'docs')

# Mevzuat Categories with their configurations
MEVZUAT_CATEGORIES = {
    'kanunlar': {
        'name': 'Kanunlar',
        'mevzuat_tur': '1',
        'list_url': 'https://mevzuat.gov.tr/mevzuat?MevzuatTur=1&MevzuatTertip=5',
        'output_file': 'MEVZUATGOVTR-KANUNLAR_LINKLERI.json'
    },
    'tuzukler': {
        'name': 'Tüzükler',
        'mevzuat_tur': '2',
        'list_url': 'https://mevzuat.gov.tr/mevzuat?MevzuatTur=2&MevzuatTertip=5',
        'output_file': 'MEVZUATGOVTR-TUZUKLER_LINKLERI.json'
    },
    'yonetmelikler': {
        'name': 'Yönetmelikler',
        'mevzuat_tur': '3',
        'list_url': 'https://mevzuat.gov.tr/mevzuat?MevzuatTur=3&MevzuatTertip=5',
        'output_file': 'MEVZUATGOVTR-YONETMELIKLER_LINKLERI.json'
    },
    'khk': {
        'name': 'Kanun Hükmünde Kararnameler',
        'mevzuat_tur': '4',
        'list_url': 'https://mevzuat.gov.tr/mevzuat?MevzuatTur=4&MevzuatTertip=5',
        'output_file': 'MEVZUATGOVTR-KHK_LINKLERI.json'
    },
    'cbk': {
        'name': 'Cumhurbaşkanlığı Kararnameleri',
        'mevzuat_tur': '6',
        'list_url': 'https://mevzuat.gov.tr/mevzuat?MevzuatTur=6&MevzuatTertip=5',
        'output_file': 'MEVZUATGOVTR-CBK_LINKLERI.json'
    },
    'tebligler': {
        'name': 'Genel Tebliğler',
        'mevzuat_tur': '9',
        'list_url': 'https://mevzuat.gov.tr/mevzuat?MevzuatTur=9&MevzuatTertip=5',
        'output_file': 'MEVZUATGOVTR-TEBLIGLER_LINKLERI.json'
    }
}


async def extract_links_from_page(page, category_config: dict) -> list:
    """Extract all links from the page"""
    links = []
    mevzuat_tur = category_config['mevzuat_tur']

    try:
        # Get all anchor elements
        anchors = await page.query_selector_all('a[href]')

        for anchor in anchors:
            try:
                href = await anchor.get_attribute('href')
                if href:
                    # Check if it's a mevzuat detail link
                    if 'MevzuatNo=' in href or 'mevzuatno=' in href.lower():
                        # Normalize URL
                        if href.startswith('/'):
                            href = f"https://mevzuat.gov.tr{href}"

                        # Ensure it has the correct MevzuatTur
                        if f'MevzuatTur={mevzuat_tur}' in href or f'mevzuattur={mevzuat_tur}' in href.lower():
                            # Get link text for title
                            text = await anchor.inner_text()
                            text = text.strip() if text else ''

                            # Extract MevzuatNo
                            match = re.search(r'MevzuatNo=(\d+)', href, re.IGNORECASE)
                            mevzuat_no = match.group(1) if match else ''

                            if href not in [l['url'] for l in links]:
                                links.append({
                                    'url': href,
                                    'title': text,
                                    'mevzuat_no': mevzuat_no
                                })
            except:
                continue

    except Exception as e:
        print(f"[ERROR] Failed to extract links: {e}")

    return links


async def scroll_and_load_all(page, max_scrolls: int = 100):
    """Scroll page to load all lazy-loaded content"""
    previous_height = 0
    scroll_count = 0

    while scroll_count < max_scrolls:
        # Get current scroll height
        current_height = await page.evaluate('document.body.scrollHeight')

        if current_height == previous_height:
            # Try clicking "Load More" or pagination buttons
            try:
                load_more = await page.query_selector(
                    'button:has-text("Daha Fazla"), '
                    'button:has-text("Load More"), '
                    '.load-more, '
                    '.pagination a.next, '
                    'a[rel="next"], '
                    '[class*="next-page"]'
                )
                if load_more:
                    await load_more.click()
                    await asyncio.sleep(3)
                else:
                    break
            except:
                break

        previous_height = current_height

        # Scroll down
        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
        await asyncio.sleep(1.5)
        scroll_count += 1

    print(f"[INFO] Completed {scroll_count} scrolls")


async def extract_from_search_api(page, category_config: dict) -> list:
    """Extract links using Mevzuat search API approach"""
    links = []
    mevzuat_tur = category_config['mevzuat_tur']

    try:
        # Navigate to search page with filters
        search_url = f"https://mevzuat.gov.tr/mevzuat?MevzuatTur={mevzuat_tur}&MevzuatTertip=5"
        await page.goto(search_url, wait_until='networkidle', timeout=60000)
        await asyncio.sleep(3)

        # Try to get total count from page
        total_element = await page.query_selector('.total-count, .result-count, [class*="total"]')
        if total_element:
            total_text = await total_element.inner_text()
            print(f"[INFO] Total results indicator: {total_text}")

        # Scroll and extract
        await scroll_and_load_all(page)
        links = await extract_links_from_page(page, category_config)

        # Try pagination if available
        page_num = 1
        while True:
            next_button = await page.query_selector('a.next, .pagination .next, [rel="next"]')
            if not next_button:
                break

            try:
                await next_button.click()
                await asyncio.sleep(3)
                page_num += 1

                new_links = await extract_links_from_page(page, category_config)
                for link in new_links:
                    if link['url'] not in [l['url'] for l in links]:
                        links.append(link)

                print(f"[INFO] Page {page_num}: Found {len(new_links)} links, total: {len(links)}")

                if page_num > 100:  # Safety limit
                    break
            except:
                break

    except Exception as e:
        print(f"[ERROR] API extraction failed: {e}")

    return links


async def extract_category_links(category_key: str) -> dict:
    """Extract all links for a specific category"""
    if category_key not in MEVZUAT_CATEGORIES:
        print(f"[ERROR] Unknown category: {category_key}")
        return {'links': [], 'count': 0}

    config = MEVZUAT_CATEGORIES[category_key]
    print(f"\n[INFO] Extracting links for: {config['name']}")
    print(f"[INFO] MevzuatTur: {config['mevzuat_tur']}")
    print(f"[INFO] URL: {config['list_url']}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            locale='tr-TR',
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        )
        page = await context.new_page()

        try:
            # Navigate to list page
            await page.goto(config['list_url'], wait_until='networkidle', timeout=60000)
            await asyncio.sleep(3)

            # Try API-based extraction first
            links = await extract_from_search_api(page, config)

            # If no links found, try direct page extraction
            if not links:
                await scroll_and_load_all(page)
                links = await extract_links_from_page(page, config)

            print(f"[INFO] Found {len(links)} links for {config['name']}")

            # Save to file
            output_path = os.path.join(DOCS_DIR, config['output_file'])
            os.makedirs(DOCS_DIR, exist_ok=True)

            output_data = {
                'category': category_key,
                'name': config['name'],
                'mevzuat_tur': config['mevzuat_tur'],
                'extracted_at': datetime.now().isoformat(),
                'count': len(links),
                'links': links
            }

            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(output_data, f, ensure_ascii=False, indent=2)

            print(f"[INFO] Saved to: {output_path}")

            return output_data

        except Exception as e:
            print(f"[ERROR] Failed to extract {config['name']}: {e}")
            return {'links': [], 'count': 0, 'error': str(e)}

        finally:
            await browser.close()


async def generate_links_by_range(category_key: str, start_no: int = 1, end_no: int = 10000) -> dict:
    """Generate links by MevzuatNo range (alternative method)"""
    if category_key not in MEVZUAT_CATEGORIES:
        print(f"[ERROR] Unknown category: {category_key}")
        return {'links': [], 'count': 0}

    config = MEVZUAT_CATEGORIES[category_key]
    print(f"\n[INFO] Generating links for: {config['name']} (range {start_no}-{end_no})")

    links = []
    mevzuat_tur = config['mevzuat_tur']

    for mevzuat_no in range(start_no, end_no + 1):
        url = f"https://mevzuat.gov.tr/anasayfa/MevzuatFihristDetayIframe?MevzuatTur={mevzuat_tur}&MevzuatNo={mevzuat_no}&MevzuatTertip=5"
        links.append({
            'url': url,
            'title': f"{config['name']} No: {mevzuat_no}",
            'mevzuat_no': str(mevzuat_no)
        })

    # Save to file
    output_path = os.path.join(DOCS_DIR, config['output_file'])
    os.makedirs(DOCS_DIR, exist_ok=True)

    output_data = {
        'category': category_key,
        'name': config['name'],
        'mevzuat_tur': config['mevzuat_tur'],
        'generated': True,
        'range': f"{start_no}-{end_no}",
        'extracted_at': datetime.now().isoformat(),
        'count': len(links),
        'links': links
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print(f"[INFO] Generated {len(links)} links")
    print(f"[INFO] Saved to: {output_path}")

    return output_data


async def extract_all_categories():
    """Extract links for all categories"""
    results = {}

    for category_key in MEVZUAT_CATEGORIES:
        result = await extract_category_links(category_key)
        results[category_key] = result

        # Delay between categories to avoid rate limiting
        await asyncio.sleep(10)

    # Save summary
    summary_path = os.path.join(DOCS_DIR, 'MEVZUATGOVTR-SUMMARY.json')
    summary = {
        'extracted_at': datetime.now().isoformat(),
        'categories': {k: {'name': v.get('name', k), 'count': v.get('count', 0)} for k, v in results.items()},
        'total_links': sum(v.get('count', 0) for v in results.values())
    }

    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print(f"\n[SUMMARY] Total links extracted: {summary['total_links']}")
    for cat, data in summary['categories'].items():
        print(f"  - {data['name']}: {data['count']}")

    return results


def list_categories():
    """List available categories"""
    print(f"\n{'='*60}")
    print("Available Mevzuat Categories")
    print(f"{'='*60}")
    for key, config in MEVZUAT_CATEGORIES.items():
        json_file = os.path.join(DOCS_DIR, config['output_file'])
        link_count = 0
        if os.path.exists(json_file):
            try:
                with open(json_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    link_count = data.get('count', 0)
            except:
                pass
        status = f"({link_count} links)" if link_count > 0 else "(no links)"
        print(f"  {key:20} - MevzuatTur={config['mevzuat_tur']} - {config['name']:35} {status}")
    print(f"{'='*60}\n")


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Extract Mevzuat legislation links')
    parser.add_argument('category', nargs='?', default='all',
                       help='Category to extract (kanunlar, tebligler, etc.) or "all"')
    parser.add_argument('--generate', '-g', action='store_true',
                       help='Generate links by range instead of scraping')
    parser.add_argument('--start', type=int, default=1,
                       help='Start MevzuatNo for range generation')
    parser.add_argument('--end', type=int, default=10000,
                       help='End MevzuatNo for range generation')
    parser.add_argument('--list', '-l', action='store_true',
                       help='List available categories')
    args = parser.parse_args()

    if args.list:
        list_categories()
        return

    if args.generate:
        if args.category == 'all':
            print("[ERROR] Cannot use --generate with 'all' category")
            print("[INFO] Specify a single category: python mevzuat_link_extractor.py kanunlar --generate")
            return
        asyncio.run(generate_links_by_range(args.category, args.start, args.end))
    elif args.category == 'all':
        asyncio.run(extract_all_categories())
    elif args.category in MEVZUAT_CATEGORIES:
        asyncio.run(extract_category_links(args.category))
    else:
        print(f"[ERROR] Unknown category: {args.category}")
        list_categories()
        sys.exit(1)


if __name__ == '__main__':
    main()
