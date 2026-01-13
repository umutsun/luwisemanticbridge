#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GIB Link Extractor
Extracts all legislation links from gib.gov.tr for various categories
Outputs links to docs folder for crawlers to use

Categories:
- SIRKULER (Circulars)
- KANUNLAR (Laws)
- GEREKCELER (Rationales)
- CUMHURBASKANI_KARARLARI (Presidential Decrees)
- BKK (Cabinet Decrees)
- YONETMELIKLER (Regulations)
- TEBLIGLER (Communiques)
- IC_GENELGELER (Internal Circulars)
- GENEL_YAZILAR (General Letters)
- OZELGELER (Rulings/Muktezas)
"""

import asyncio
import json
import os
import sys
import re
from datetime import datetime
from pathlib import Path

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("[ERROR] Playwright not installed. Run: pip install playwright && playwright install chromium")
    sys.exit(1)

# Output directory
DOCS_DIR = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'docs')

# GIB Categories with their base URLs and patterns
GIB_CATEGORIES = {
    'sirkuler': {
        'name': 'Sirküler',
        'base_url': 'https://gib.gov.tr/sirkuler',
        'list_url': 'https://gib.gov.tr/sirkuler',
        'link_pattern': r'/kanun/\d+/sirkuler/\d+',
        'output_file': 'GIBGOVTR-SIRKULER_LINKLERI.json'
    },
    'kanunlar': {
        'name': 'Kanunlar',
        'base_url': 'https://gib.gov.tr/mevzuat/kanun',
        'list_url': 'https://gib.gov.tr/mevzuat/kanunlar',
        'link_pattern': r'/mevzuat/kanun/\d+',
        'output_file': 'GIBGOVTR-KANUNLAR_LINKLERI.json'
    },
    'gerekceler': {
        'name': 'Gerekçeler',
        'base_url': 'https://gib.gov.tr/mevzuat/gerekce',
        'list_url': 'https://gib.gov.tr/mevzuat/gerekceler',
        'link_pattern': r'/mevzuat/gerekce/\d+',
        'output_file': 'GIBGOVTR-GEREKCELER_LINKLERI.json'
    },
    'cbk': {
        'name': 'Cumhurbaşkanı Kararları',
        'base_url': 'https://gib.gov.tr/mevzuat/cbk',
        'list_url': 'https://gib.gov.tr/mevzuat/cumhurbaskani-kararlari',
        'link_pattern': r'/mevzuat/cbk/\d+',
        'output_file': 'GIBGOVTR-CBK_LINKLERI.json'
    },
    'bkk': {
        'name': 'Bakanlar Kurulu Kararları',
        'base_url': 'https://gib.gov.tr/mevzuat/bkk',
        'list_url': 'https://gib.gov.tr/mevzuat/bkk',
        'link_pattern': r'/mevzuat/bkk/\d+',
        'output_file': 'GIBGOVTR-BKK_LINKLERI.json'
    },
    'yonetmelikler': {
        'name': 'Yönetmelikler',
        'base_url': 'https://gib.gov.tr/mevzuat/yonetmelik',
        'list_url': 'https://gib.gov.tr/mevzuat/yonetmelikler',
        'link_pattern': r'/mevzuat/yonetmelik/\d+',
        'output_file': 'GIBGOVTR-YONETMELIKLER_LINKLERI.json'
    },
    'tebligler': {
        'name': 'Tebliğler',
        'base_url': 'https://gib.gov.tr/mevzuat/teblig',
        'list_url': 'https://gib.gov.tr/mevzuat/tebligler',
        'link_pattern': r'/mevzuat/teblig/\d+',
        'output_file': 'GIBGOVTR-TEBLIGLER_LINKLERI.json'
    },
    'ic_genelgeler': {
        'name': 'İç Genelgeler',
        'base_url': 'https://gib.gov.tr/mevzuat/ic-genelge',
        'list_url': 'https://gib.gov.tr/mevzuat/ic-genelgeler',
        'link_pattern': r'/mevzuat/ic-genelge/\d+',
        'output_file': 'GIBGOVTR-IC_GENELGELER_LINKLERI.json'
    },
    'genel_yazilar': {
        'name': 'Genel Yazılar',
        'base_url': 'https://gib.gov.tr/mevzuat/genel-yazi',
        'list_url': 'https://gib.gov.tr/mevzuat/genel-yazilar',
        'link_pattern': r'/mevzuat/genel-yazi/\d+',
        'output_file': 'GIBGOVTR-GENEL_YAZILAR_LINKLERI.json'
    },
    'ozelgeler': {
        'name': 'Özelgeler',
        'base_url': 'https://gib.gov.tr/ozelge',
        'list_url': 'https://gib.gov.tr/ozelge',
        'link_pattern': r'/ozelge/\d+',
        'output_file': 'GIBGOVTR-OZELGELER_LINKLERI.json'
    }
}


async def extract_links_from_page(page, category_config: dict) -> list:
    """Extract all links matching the pattern from the page"""
    links = []

    try:
        # Get all anchor elements
        anchors = await page.query_selector_all('a[href]')

        for anchor in anchors:
            try:
                href = await anchor.get_attribute('href')
                if href:
                    # Check if matches pattern
                    if re.search(category_config['link_pattern'], href):
                        # Normalize URL
                        if href.startswith('/'):
                            href = f"https://gib.gov.tr{href}"

                        # Get link text for title
                        text = await anchor.inner_text()
                        text = text.strip() if text else ''

                        if href not in [l['url'] for l in links]:
                            links.append({
                                'url': href,
                                'title': text
                            })
            except:
                continue

    except Exception as e:
        print(f"[ERROR] Failed to extract links: {e}")

    return links


async def scroll_and_load_all(page, max_scrolls: int = 50):
    """Scroll page to load all lazy-loaded content"""
    previous_height = 0
    scroll_count = 0

    while scroll_count < max_scrolls:
        # Get current scroll height
        current_height = await page.evaluate('document.body.scrollHeight')

        if current_height == previous_height:
            # Try clicking "Load More" or pagination buttons
            try:
                load_more = await page.query_selector('button:has-text("Daha Fazla"), button:has-text("Load More"), .load-more, .pagination a')
                if load_more:
                    await load_more.click()
                    await asyncio.sleep(2)
                else:
                    break
            except:
                break

        previous_height = current_height

        # Scroll down
        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
        await asyncio.sleep(1)
        scroll_count += 1

    print(f"[INFO] Completed {scroll_count} scrolls")


async def extract_category_links(category_key: str) -> dict:
    """Extract all links for a specific category"""
    if category_key not in GIB_CATEGORIES:
        print(f"[ERROR] Unknown category: {category_key}")
        return {'links': [], 'count': 0}

    config = GIB_CATEGORIES[category_key]
    print(f"\n[INFO] Extracting links for: {config['name']}")
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
            await asyncio.sleep(3)  # Wait for Next.js hydration

            # Scroll to load all content
            await scroll_and_load_all(page)

            # Extract links
            links = await extract_links_from_page(page, config)

            print(f"[INFO] Found {len(links)} links for {config['name']}")

            # Save to file
            output_path = os.path.join(DOCS_DIR, config['output_file'])
            os.makedirs(DOCS_DIR, exist_ok=True)

            output_data = {
                'category': category_key,
                'name': config['name'],
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


async def extract_all_categories():
    """Extract links for all categories"""
    results = {}

    for category_key in GIB_CATEGORIES:
        result = await extract_category_links(category_key)
        results[category_key] = result

        # Delay between categories to avoid rate limiting
        await asyncio.sleep(5)

    # Save summary
    summary_path = os.path.join(DOCS_DIR, 'GIBGOVTR-SUMMARY.json')
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


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Extract GIB legislation links')
    parser.add_argument('category', nargs='?', default='all',
                       help='Category to extract (sirkuler, kanunlar, etc.) or "all"')
    args = parser.parse_args()

    if args.category == 'all':
        asyncio.run(extract_all_categories())
    elif args.category in GIB_CATEGORIES:
        asyncio.run(extract_category_links(args.category))
    else:
        print(f"[ERROR] Unknown category: {args.category}")
        print(f"[INFO] Available categories: {', '.join(GIB_CATEGORIES.keys())}")
        sys.exit(1)


if __name__ == '__main__':
    main()
