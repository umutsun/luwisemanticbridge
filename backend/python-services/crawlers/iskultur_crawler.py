# -*- coding: utf-8 -*-
import asyncio
import json
import re
import sys
import random
import aiohttp
from urllib.parse import urljoin, urlparse, urlunparse, parse_qs, urlencode

import redis
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

# --- Configuration ---
STATE_FILE = "iskultur_crawler_state.json"
REDIS_HOST = 'localhost'
REDIS_PORT = 6379
REDIS_DB = 0
BACKEND_URL = 'http://localhost:3001'
default_start_url = "https://www.iskultur.com.tr/kitap/cocuk-okul-oncesi/"
# --- End of Configuration ---

r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, decode_responses=True)

async def notify_backend_item_added(item_key, total_count):
    """Notify Node.js backend that a new item was added"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{BACKEND_URL}/api/v2/crawler/crawler-directories/iskultur_crawler/notify-item-added",
                json={"itemKey": item_key, "totalCount": total_count},
                timeout=aiohttp.ClientTimeout(total=5)
            ) as response:
                if response.status == 200:
                    print(f"✅ [WS] Backend notified: {item_key}")
                else:
                    print(f"⚠️ [WS] Backend notification failed: {response.status}")
    except Exception as e:
        print(f"⚠️ [WS] Failed to notify backend: {e}")

def clean_url(url):
    parsed = urlparse(url)
    query_params = parse_qs(parsed.query)
    clean_params = {}
    if 'sayfa' in query_params:
        clean_params['sayfa'] = query_params['sayfa'][0]
    clean_query_str = urlencode(clean_params)
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, clean_query_str, parsed.fragment))

async def get_text_or_none(locator):
    try:
        return await locator.first.inner_text(timeout=5000)
    except PlaywrightTimeoutError:
        return None

async def get_attr_or_none(locator, attr):
    try:
        return await locator.first.get_attribute(attr, timeout=5000)
    except PlaywrightTimeoutError:
        return None

async def extract_product_details(page, url, current_category_path):
    print(f"\n[BOOK] Processing product details: {url}")
    try:
        data = {}
        # --- Robust extraction using Playwright locators ---
        data['product_name'] = await get_text_or_none(page.locator('h1[itemprop="name"]'))
        if not data['product_name']:
            data['product_name'] = await get_text_or_none(page.locator('span[itemprop="name"]'))
        # Extract genre/class from itemprop="genre"
        data['genre'] = await get_text_or_none(page.locator('[itemprop="genre"]'))
        data['isbn'] = await get_text_or_none(page.locator('strong.cursorP.copy'))
        if not data['isbn']:
            data['isbn'] = await get_text_or_none(page.locator('p.flex.pb5 strong.cursorP.copy'))
        data['image_url'] = await get_attr_or_none(page.locator('img[itemprop="image"]'), 'href')
        if not data['image_url']:
            # Fallback to src attribute
            data['image_url'] = await get_attr_or_none(page.locator('img[itemprop="image"]'), 'src')
        data['description'] = await get_text_or_none(page.locator('div[itemprop="description"]'))
        if not data['description']:
            data['description'] = await get_text_or_none(page.locator('div.text-underline.a.lineH20'))
        data['price'] = await get_text_or_none(page.locator('p.detailPrice'))
        if not data['price']:
            data['price'] = await get_text_or_none(page.locator('span.amount'))
        
        authors_illustrators = []
        author_elements = await page.locator('a[itemprop="author"] span[itemprop="name"]').all()
        for el in author_elements:
            authors_illustrators.append({"name": await el.inner_text(), "role": "Yazar"})
        
        # Extract other roles like Çevirmen, Resimleyen from the info div
        info_elements = await page.locator("div.info p.flex").all()
        for el in info_elements:
            info_title_el = el.locator('span.infoTitle')
            info_title = await get_attr_or_none(info_title_el, 'aria-text')
            if info_title in ['Çevirmen', 'Resimleyen', 'Danışman']:
                name_el = el.locator('strong a')
                name = await get_text_or_none(name_el)
                if name:
                    authors_illustrators.append({"name": name, "role": info_title})

        # Extract from infoList for additional roles
        info_list_labels = await page.locator('div.infoList div.col-md-3.col-xs-4').all()
        info_list_values = await page.locator('div.infoList div.col-md-9.col-xs-8').all()
        for i, label in enumerate(info_list_labels):
            label_text = await label.inner_text()
            if i < len(info_list_values):
                value_text = await info_list_values[i].inner_text()
                if 'Çevirmen' in label_text:
                    name = value_text.replace(':', '').strip()
                    if name and not any(ai['name'] == name and ai['role'] == 'Çevirmen' for ai in authors_illustrators):
                        authors_illustrators.append({"name": name, "role": "Çevirmen"})
                if 'Resimleyen' in label_text:
                    name = value_text.replace(':', '').strip()
                    if name and not any(ai['name'] == name and ai['role'] == 'Resimleyen' for ai in authors_illustrators):
                        authors_illustrators.append({"name": name, "role": "Resimleyen"})
        
        data['authors_illustrators'] = authors_illustrators
        data['publisher'] = "Türkiye İş Bankası Kültür Yayınları"

        # Extract additional fields from infoList
        info_list = await page.locator('div.infoList div.col-md-9.col-xs-8').all()
        page_count = None
        age_group = None
        for i, info in enumerate(info_list):
            text = await info.inner_text()
            # Get the corresponding label
            label_div = await page.locator('div.infoList div.col-md-3.col-xs-4').nth(i).inner_text()
            if 'Sayfa Sayısı' in label_div:
                page_count = text.strip().lstrip(':').strip()
            if 'Yaş' in label_div and re.search(r'\d+-\d+', text):
                age_group = text.strip()

        # Extract category path from the category links on product page
        category_path = []
        category_links = await page.locator('p.flex.pb5 strong a[href*="/kitap/"]').all()
        for link in category_links:
            href = await link.get_attribute('href')
            if href:
                # Extract category segments from URL
                parsed_href = urlparse(href)
                path_parts = parsed_href.path.split('/')
                if 'kitap' in path_parts:
                    kitap_index = path_parts.index('kitap')
                    # Get the category hierarchy, excluding the product slug
                    cat_parts = [p for p in path_parts[kitap_index+1:] if p and not p.endswith('.aspx')]
                    if cat_parts:
                        category_path = cat_parts
                        break  # Take the first valid category path

        # If still empty, try from itemprop="genre"
        if not category_path and data.get('genre'):
            # Split genre by comma and clean
            genre_parts = [g.strip() for g in data['genre'].split(',')]
            category_path = genre_parts

        # Extract themes and sub-themes
        themes = []
        sub_themes = []
        theme_links = await page.locator('p.tagLink d a[href*="/tema/"]').all()
        for link in theme_links:
            theme_text = await link.inner_text()
            if theme_text:
                themes.append(theme_text.strip())

        sub_theme_links = await page.locator('p.tagLink d a[href*="/alttema/"]').all()
        for link in sub_theme_links:
            sub_theme_text = await link.inner_text()
            if sub_theme_text:
                sub_themes.append(sub_theme_text.strip())

        # Extract age group if not found in infoList
        if not age_group:
            age_links = await page.locator('p.tagLink d a[href*="/yas/"]').all()
            for link in age_links:
                age_text = await link.inner_text()
                if age_text and re.search(r'\d+-\d+ Yaş', age_text):
                    age_group = re.search(r'(\d+-\d+ Yaş.*)', age_text).group(1).strip()
                    break

        # --- Final Data Structuring (old format) ---
        final_data = {
            "url": url,
            "product_name": data.get('product_name'),
            "price": data.get('price'),
            "category_path": category_path,
            "image_url": data.get('image_url'),
            "description": data.get('description'),
            "isbn": data.get('isbn'),
            "publisher": data.get('publisher'),
            "page_count": page_count or "N/A",
            "age_group": age_group or "N/A",
            "authors_illustrators": data.get('authors_illustrators', []),
            "genre": data.get('genre'),
            "themes": themes,
            "sub_themes": sub_themes,
            "markdown_content": "",  # Placeholder, can be filled if needed
            "scrapes": {}
        }

        print("--- CLEAN DATA ---")
        try:
            print(json.dumps(final_data, indent=2, ensure_ascii=False))
        except UnicodeEncodeError:
            print(json.dumps(final_data, indent=2, ensure_ascii=True))

        slug = urlparse(url).path.split('/')[-1]
        redis_key = f"crawl4ai:iskultur_crawler:kitaplar:{slug}"
        r.set(redis_key, json.dumps(final_data, ensure_ascii=False))
        print(f"[OK] Product data saved to Redis: {redis_key}")
        print(f"[IMG] Image URL: {data.get('image_url')}")

        # Get total count and notify backend
        total_count = len(r.keys("crawl4ai:iskultur_crawler:kitaplar:*"))
        await notify_backend_item_added(slug, total_count)

    except Exception as e:
        try:
            print(f"[ERROR] Error processing product details: {url} - Error: {e}")
        except UnicodeEncodeError:
            print(f"[ERROR] Error processing product details: (URL with special chars) - Error: {str(e)[:100]}")

def save_state(queue, visited, failed_urls=None):
    state_data = {"queue": queue, "visited": list(visited)}
    if failed_urls:
        state_data["failed_urls"] = failed_urls
    with open(STATE_FILE, 'w') as f:
        json.dump(state_data, f)

def load_state():
    try:
        with open(STATE_FILE, 'r') as f:
            state = json.load(f)
            return state["queue"], set(state["visited"]), state.get("failed_urls", [])
    except FileNotFoundError:
        print(f"[INFO] State file not found. Starting fresh.")
        return None, None, []

async def main():
    start_url_param = sys.argv[1] if len(sys.argv) > 1 else default_start_url
    base_category_path = urlparse(start_url_param).path

    queue, visited, failed_urls = load_state()
    if not queue:
        queue = [(start_url_param, [s for s in base_category_path.split('/') if s])]
        visited = set()
        failed_urls = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()

        try:
            while queue:
                current_url, current_category_path = queue.pop(0)
                if current_url in visited: continue
                visited.add(current_url)
                
                print(f"[WEB] Sayfa ziyaret ediliyor: {current_url}")
                
                try:
                    await page.goto(current_url, wait_until="domcontentloaded", timeout=120000)
                except PlaywrightTimeoutError:
                    print(f"  - [WARN] Timeout: Page did not load within 2 minutes. Skipping.")
                    continue
                except Exception as e:
                    if "net::ERR_NAME_NOT_RESOLVED" in str(e):
                        print(f"  - [WARN] DNS Error: Could not resolve URL. Skipping: {current_url}")
                        continue
                    elif "net::ERR_CONNECTION_REFUSED" in str(e):
                        print(f"  - [WARN] Connection Error: Could not connect to site. Skipping: {current_url}")
                        continue
                    else:
                        print(f"  - [WARN] Error loading page: {e}. Skipping: {current_url}")
                        continue

                is_product_page = current_url.endswith(".aspx")

                if is_product_page:
                    await extract_product_details(page, current_url, current_category_path)
                else:
                    print(f"[LINKS] Scanning category/pagination links...")
                    all_links = await page.locator("a").evaluate_all("(elements) => elements.map(el => ({href: el.href, text: el.innerText}))")

                    print(f"  - Found {len(all_links)} potential links.")

                    # First pass: collect product links and find max page number
                    max_page = 1
                    pagination_links_found = []

                    for link_info in all_links:
                        link = link_info.get('href', '')
                        text = link_info.get('text', '').strip()

                        is_product_link = link.endswith('.aspx') and text
                        is_pagination_link = '?sayfa=' in link

                        if is_product_link:
                            cleaned_link = clean_url(link)
                            if cleaned_link and cleaned_link not in visited and not any(q_url == cleaned_link for q_url, _ in queue):
                                link_path_segments = [s for s in urlparse(cleaned_link).path.split('/') if s]
                                new_category_path = link_path_segments[1:-1] if cleaned_link.endswith(".aspx") else current_category_path
                                queue.append((cleaned_link, new_category_path))
                                print(f"  [PRODUCT] Product added to queue: {cleaned_link[:60]}...")

                        elif is_pagination_link:
                            # Extract page number from URL to find max
                            try:
                                page_num = int(link.split('?sayfa=')[1].split('&')[0])
                                if page_num > max_page:
                                    max_page = page_num
                                pagination_links_found.append(link)
                            except (ValueError, IndexError):
                                pass

                    # Second pass: generate ALL page links from 1 to max_page if we found pages
                    if max_page > 1:
                        print(f"  [PAGES] Found {len(pagination_links_found)} pagination links, max page: {max_page}")

                        # Build base URL for pagination
                        base_url = current_url
                        if '?sayfa=' in current_url:
                            base_url = current_url.split('?sayfa=')[0]

                        # Generate all page numbers from 1 to max_page
                        for page_num in range(1, max_page + 1):
                            pagination_url = f"{base_url}?sayfa={page_num}"
                            if pagination_url not in visited and not any(q_url == pagination_url for q_url, _ in queue):
                                queue.append((pagination_url, current_category_path))
                                if page_num <= 5 or page_num > max_page - 2:  # Show first 5 and last 2
                                    print(f"  [PAGINATION] Pagination added to queue: ?sayfa={page_num}")
                                elif page_num == 6:
                                    print(f"  ... ({max_page - 6} more pages) ...")
                    else:
                        print(f"  [INFO] No pagination links found.")

                await asyncio.sleep(random.uniform(3, 7))
        finally:
            await browser.close()
            save_state(queue, visited, failed_urls)
            print(f"\n[SAVED] State saved. Queue: {len(queue)}, Visited: {len(visited)}")

if __name__ == "__main__":
    asyncio.run(main())
