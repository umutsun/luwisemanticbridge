#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
General Department of Immigration (GDI) Link Extractor
Extracts all visa and immigration related links from immigration.gov.kh

Categories:
- E-Class (Ordinary) visas
- EB (Business) visas
- Other visa types
- Visa extension rules
- Overstay penalties
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

# GDI Categories with their base URLs and patterns
GDI_CATEGORIES = {
    'e_class': {
        'name': 'E-Class (Ordinary) Visas',
        'base_url': 'https://immigration.gov.kh',
        'list_url': 'https://immigration.gov.kh/en/visa/e-class',
        'link_pattern': r'/en/visa/e-class',
        'output_file': 'GDI-E_CLASS_LINKLERI.json'
    },
    'eb_visa': {
        'name': 'EB (Business) Visas',
        'base_url': 'https://immigration.gov.kh',
        'list_url': 'https://immigration.gov.kh/en/visa/eb',
        'link_pattern': r'/en/visa/eb',
        'output_file': 'GDI-EB_VISA_LINKLERI.json'
    },
    'other_visas': {
        'name': 'Other Visa Types',
        'base_url': 'https://immigration.gov.kh',
        'list_url': 'https://immigration.gov.kh/en/visa',
        'link_pattern': r'/en/visa',
        'output_file': 'GDI-OTHER_VISA_TYPES_LINKLERI.json'
    },
    'visa_extension': {
        'name': 'Visa Extension Rules',
        'base_url': 'https://immigration.gov.kh',
        'list_url': 'https://immigration.gov.kh/en/visa-extension',
        'link_pattern': r'/en/visa-extension',
        'output_file': 'GDI-VISA_EXTENSION_LINKLERI.json'
    },
    'overstay': {
        'name': 'Overstay Penalties',
        'base_url': 'https://immigration.gov.kh',
        'list_url': 'https://immigration.gov.kh/en/overstay',
        'link_pattern': r'/en/overstay',
        'output_file': 'GDI-OVERSTAY_LINKLERI.json'
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
                            href = f"https://immigration.gov.kh{href}"

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
                load_more = await page.query_selector('button:has-text("Load More"), .load-more, .pagination a, a[rel="next"]')
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
    if category_key not in GDI_CATEGORIES:
        print(f"[ERROR] Unknown category: {category_key}")
        return {'links': [], 'count': 0}

    config = GDI_CATEGORIES[category_key]
    print(f"\n[INFO] Extracting links for: {config['name']}")
    print(f"[INFO] URL: {config['list_url']}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            locale='en-US',
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        )
        page = await context.new_page()

        try:
            # Navigate to list page
            await page.goto(config['list_url'], wait_until='networkidle', timeout=60000)
            await asyncio.sleep(3)

            # Scroll and load all content
            await scroll_and_load_all(page)

            # Extract links
            links = await extract_links_from_page(page, config)

            # Save to file
            output_path = os.path.join(DOCS_DIR, config['output_file'])
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump({
                    'source': 'GDI',
                    'category': config['name'],
                    'extracted_at': datetime.now().isoformat(),
                    'count': len(links),
                    'links': links
                }, f, ensure_ascii=False, indent=2)

            print(f"[SUCCESS] Extracted {len(links)} links to {config['output_file']}")
            return {'links': links, 'count': len(links)}

        except Exception as e:
            print(f"[ERROR] Failed to extract links: {e}")
            return {'links': [], 'count': 0}
        finally:
            await browser.close()


async def main():
    """Main function to extract all GDI categories"""
    print("=" * 60)
    print("General Department of Immigration (GDI) Link Extractor")
    print("=" * 60)

    # Extract all categories
    results = {}
    for category_key in GDI_CATEGORIES.keys():
        result = await extract_category_links(category_key)
        results[category_key] = result

    # Print summary
    print("\n" + "=" * 60)
    print("EXTRACTION SUMMARY")
    print("=" * 60)
    for category_key, result in results.items():
        print(f"{GDI_CATEGORIES[category_key]['name']}: {result['count']} links")

    total = sum(r['count'] for r in results.values())
    print(f"\nTotal: {total} links extracted")


if __name__ == '__main__':
    asyncio.run(main())