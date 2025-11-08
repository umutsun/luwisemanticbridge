import asyncio
import json
import re
import sys
import os
import random
from urllib.parse import urljoin, urlparse
from pathlib import Path

import redis
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
from dotenv import load_dotenv

# Load .env.lsemb from root directory
env_path = Path(__file__).parent.parent.parent.parent / '.env.lsemb'
load_dotenv(dotenv_path=env_path)

# --- YKY Specific Configuration ---
STATE_FILE = "yky_crawler_state.json"
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', '6379'))
REDIS_DB = int(os.getenv('REDIS_DB', '2'))  # Read from .env.lsemb
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD')
HTML_DEBUG_FILE = "yky_debug_html.txt"
html_debug_done = False
default_start_url = "https://kitap.ykykultur.com.tr/kitaplar/konu-dizini/dogan-kardes"
# --- End of Configuration ---

# Redis connection with password support
redis_config = {
    'host': REDIS_HOST,
    'port': REDIS_PORT,
    'db': REDIS_DB,
    'decode_responses': True
}
if REDIS_PASSWORD:
    redis_config['password'] = REDIS_PASSWORD

r = redis.Redis(**redis_config)
print(f"✅ Connected to Redis at {REDIS_HOST}:{REDIS_PORT} DB {REDIS_DB}")

async def get_text_or_none(locator, timeout=5000):
    try:
        return await locator.first.inner_text(timeout=timeout)
    except PlaywrightTimeoutError:
        return None

async def get_attr_or_none(locator, attr, timeout=5000):
    try:
        return await locator.first.get_attribute(attr, timeout=timeout)
    except PlaywrightTimeoutError:
        return None

async def extract_product_details(page, url):
    print(f"\nUrun detaylari isleniyor: {url}")
    try:
        # Product Name - From div#bookDetail h1
        product_name = await get_text_or_none(page.locator('div#bookDetail h1'))
        if not product_name:
            product_name = await get_text_or_none(page.locator('h1'))

        # Price - From span#price (YKY Internet Fiyati)
        price = await get_text_or_none(page.locator('span#price'))
        if not price:
            price = await get_text_or_none(page.locator('div#detailPrice span#price'))

        # Image URL - From lightbox link or img.detailBigImg
        image_url = await get_attr_or_none(page.locator('img.detailBigImg'), 'src')
        if not image_url:
            image_url = await get_attr_or_none(page.locator('a.lightbox img'), 'src')
        if image_url and not image_url.startswith('http'):
            image_url = urljoin(url, image_url)

        # Description - From div#genelBilgi paragraphs
        description = None
        try:
            # Get all paragraphs from genelBilgi tab (skip the table)
            description_elems = await page.locator('div#genelBilgi p').all()
            if description_elems:
                descriptions = []
                for elem in description_elems:
                    text = await get_text_or_none(elem)
                    if text:
                        descriptions.append(text)
                description = '\n\n'.join(descriptions) if descriptions else None
        except:
            pass

        # Extract details from div#detailFeature
        details = {}

        # Extract from detail feature rows: Yazar, Kategori, Yaş etc
        detail_feature = page.locator('div#detailFeature')

        # Get all paragraphs with span labels and links
        paragraphs = await detail_feature.locator('p').all()
        for p in paragraphs:
            span_text = await get_text_or_none(p.locator('span'))
            if span_text:
                # Remove the trailing colon and whitespace
                key = span_text.rstrip(': ').strip()

                # Get the value (text after span or from link)
                links = await p.locator('a').all()
                if links:
                    # Join multiple link texts with comma
                    link_texts = []
                    for link in links:
                        link_text = await get_text_or_none(link)
                        if link_text:
                            link_texts.append(link_text)
                    value = ', '.join(link_texts)
                else:
                    # Get remaining text after span
                    full_text = await get_text_or_none(p)
                    if full_text:
                        # Remove the key part
                        value = full_text.replace(span_text, '', 1).strip().lstrip(': ').strip()
                    else:
                        value = ""

                if key and value:
                    details[key] = value

        # Also try to extract from the table (Sayfa Sayisi, Boyut)
        table_rows = await page.locator('table#tabOzellilerPD tr').all()
        for row in table_rows:
            cells = await row.locator('td').all()
            if len(cells) == 2:
                key = await get_text_or_none(cells[0])
                value = await get_text_or_none(cells[1])
                if key:
                    key = key.strip()
                    # Remove leading colon and whitespace from value
                    value = value.lstrip(': ').strip() if value else ""
                    details[key] = value

        isbn = details.get('ISBN')
        page_count = details.get('Sayfa Sayisi') or details.get('Sayfa Sayısı')
        age_group = details.get('Yas') or details.get('Yaş')

        authors_illustrators = []

        # Check for Yazar
        yazar_key = next((k for k in details.keys() if 'Yazar' in k), None)
        if yazar_key and details[yazar_key]:
            # Split by comma if multiple authors
            yazar_list = [y.strip() for y in details[yazar_key].split(',')]
            for yazar in yazar_list:
                if yazar:
                    authors_illustrators.append({"name": yazar, "role": "Yazar"})

        # Check for Resimleyen
        resimleyen_key = next((k for k in details.keys() if 'Resimleyen' in k or 'Resimle' in k), None)
        if resimleyen_key and details[resimleyen_key]:
            resimleyen_list = [r.strip() for r in details[resimleyen_key].split(',')]
            for resimleyen in resimleyen_list:
                if resimleyen:
                    authors_illustrators.append({"name": resimleyen, "role": "Resimleyen"})

        # Check for Ceviren (Translator)
        ceviren_key = next((k for k in details.keys() if 'Ceviren' in k or 'Çeviren' in k), None)
        if ceviren_key and details[ceviren_key]:
            ceviren_list = [c.strip() for c in details[ceviren_key].split(',')]
            for ceviren in ceviren_list:
                if ceviren:
                    authors_illustrators.append({"name": ceviren, "role": "Ceviren"})

        # Extract category path from breadcrumb or kategori field
        # Only take the last 2 categories (main and sub)
        category_path = []
        kategori_key = next((k for k in details.keys() if 'Kategori' in k), None)
        if kategori_key and details[kategori_key]:
            all_cats = [c.strip() for c in details[kategori_key].split(',')]
            # Take only the last 2 categories (most specific ones)
            category_path = all_cats[-2:] if len(all_cats) >= 2 else all_cats

        # Extract additional book information for scrapes
        scrapes = {}
        for key in ['Orijinal Adı', 'Boyut']:
            if key in details:
                scrapes[key] = details[key]

        # --- Final Data Structuring ---
        final_data = {
            "url": url,
            "product_name": product_name,
            "price": price,
            "category_path": category_path,
            "image_url": image_url,
            "description": description,
            "isbn": isbn,
            "publisher": "Yapı Kredi Yayınları",
            "page_count": page_count,
            "age_group": age_group,
            "authors_illustrators": authors_illustrators,
            "genre": ", ".join(category_path) if category_path else "",
            "themes": [],
            "sub_themes": [],
            "markdown_content": "",
            "scrapes": scrapes
        }

        print("--- TAM VE TEMIZ VERI ---")
        # Print with UTF-8 encoding to avoid charmap errors on Windows
        try:
            print(json.dumps(final_data, indent=2, ensure_ascii=False))
        except UnicodeEncodeError:
            # Fallback - print with ASCII encoding
            print(json.dumps(final_data, indent=2, ensure_ascii=True))

        slug = urlparse(url).path.strip('/').replace('/', '_')
        redis_key = f"crawl4ai:yky_crawler:kitaplar:{slug}"
        r.set(redis_key, json.dumps(final_data, ensure_ascii=False))
        print(f"Urun verisi Redis'e kaydedildi: {redis_key}")

    except Exception as e:
        print(f"Urun detaylari cekilirken genel hata: {url} - Hata: {e}")
        import traceback
        traceback.print_exc()
        # You might want to save the HTML for debugging
        try:
            with open(HTML_DEBUG_FILE, "w", encoding="utf-8") as f:
                f.write(await page.content())
            print(f"Hata ayiklama icin HTML icerigi '{HTML_DEBUG_FILE}' dosyasina kaydedildi.")
        except:
            pass


def save_state(queue, visited):
    with open(STATE_FILE, 'w') as f:
        json.dump({"queue": queue, "visited": list(visited)}, f)

def load_state():
    try:
        with open(STATE_FILE, 'r') as f:
            state = json.load(f)
            return state["queue"], set(state["visited"])
    except FileNotFoundError:
        print(f"Durum dosyasi '{STATE_FILE}' bulunamadi. Yeni bir baslangic yapiliyor.")
        return [], set()

async def main():
    # DEBUG: Log script start and arguments
    print(f"[DEBUG] Script started")
    print(f"[DEBUG] sys.argv: {sys.argv}")
    print(f"[DEBUG] Working directory: {os.getcwd()}")

    start_url_param = sys.argv[1] if len(sys.argv) > 1 else default_start_url
    print(f"[DEBUG] Start URL: {start_url_param}")

    queue, visited = load_state()
    print(f"[DEBUG] Loaded state - Queue length: {len(queue)}, Visited length: {len(visited)}")

    if not queue and start_url_param not in visited:
        queue = [(start_url_param, [])] # Start with no category path
        print(f"[DEBUG] Initialized queue with start URL")
    else:
        print(f"[DEBUG] Using existing state or URL already visited")
        print(f"[DEBUG] Queue: {queue[:3] if len(queue) > 3 else queue}")  # Show first 3 items
        print(f"[DEBUG] Start URL in visited: {start_url_param in visited}")

    async with async_playwright() as p:
        # Launch browser with args to avoid bot detection
        browser = await p.chromium.launch(
            headless=True,
            args=['--disable-blink-features=AutomationControlled']
        )
        # Create page with realistic user agent and viewport
        page = await browser.new_page(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport={'width': 1920, 'height': 1080}
        )
        # Remove webdriver property
        await page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

        try:
            print(f"[DEBUG] About to start crawling loop")
            print(f"[DEBUG] Queue length before loop: {len(queue)}")
            if queue:
                print(f"[DEBUG] First item in queue: {queue[0]}")
            else:
                print(f"[DEBUG] Queue is empty! Loop will not run.")

            print(f"Tarama dongusu baslatiliyor.")
            while queue:
                current_url, current_category_path = queue.pop(0)
                if current_url in visited:
                    continue
                visited.add(current_url)
                
                print(f"Sayfa ziyaret ediliyor: {current_url} (Kuyruk: {len(queue)}, Ziyaret Edilen: {len(visited)})")

                try:
                    # Use networkidle to handle Cloudflare's "Just a moment" redirects
                    await page.goto(current_url, wait_until="networkidle", timeout=120000)
                    # Give Cloudflare extra time to complete any JS challenges
                    await asyncio.sleep(2)
                except PlaywrightTimeoutError:
                    print(f"  - Zaman asimi: Sayfa yuklenemedi {current_url}. Atlanıyor.")
                    continue

                # Check if it's a book page by URL or by looking for .bookDetailDiv or div#bookDetail
                is_product_page = False

                # Check by URL pattern - product pages don't have ?sayfa= parameter
                if '?sayfa=' not in current_url and '?page=' not in current_url and '#' not in current_url:
                    # Try to detect product page by looking for the bookDetailDiv or div#bookDetail
                    try:
                        # Increase timeout to allow for Cloudflare delays
                        # Use .first to handle multiple matches
                        is_product_page = await page.locator('.bookDetailDiv, div#bookDetail').first.is_visible(timeout=5000)
                    except:
                        is_product_page = False

                if is_product_page:
                    await extract_product_details(page, current_url)
                else: # Category or Pagination Page
                    print(f"Kategori/Sayfalama linkleri taraniyor...")

                    # Find product links from product cards (div.content-detail a)
                    product_links = await page.locator("div.content-detail a").all()
                    print(f"  - {len(product_links)} urun linki bulundu.")

                    for link_elem in product_links:
                        link = await link_elem.get_attribute('href')
                        if link:
                            # Convert relative URLs to absolute
                            absolute_link = urljoin(current_url, link)
                            if absolute_link not in visited and not any(q_url == absolute_link for q_url, _ in queue):
                                # Only add links that don't have pagination parameters (actual product pages)
                                if '?sayfa=' not in link and '?page=' not in link:
                                    queue.append((absolute_link, current_category_path))
                                    print(f"  -> Urun kuyruga eklendi: {absolute_link}")

                    # Find pagination links - YKY uses div.pagination-container
                    # Strategy: Extract all explicit links and find max page number to generate all missing pages

                    pagination_links_found = []
                    max_page = 1
                    page_param = 'page'  # Default to 'page'

                    # Get all links from div.pagination-container
                    paging_div = await page.locator("div.pagination-container a").all()
                    if paging_div:
                        for link_elem in paging_div:
                            link = await link_elem.get_attribute('href')
                            if link:
                                # Check for both ?sayfa= and ?page= parameters
                                page_num = None
                                if '?sayfa=' in link:
                                    try:
                                        page_num = int(link.split('?sayfa=')[1].split('&')[0])
                                        page_param = 'sayfa'
                                    except (ValueError, IndexError):
                                        pass
                                elif '?page=' in link:
                                    try:
                                        page_num = int(link.split('?page=')[1].split('&')[0])
                                        page_param = 'page'
                                    except (ValueError, IndexError):
                                        pass

                                if page_num and page_num > max_page:
                                    max_page = page_num
                                    pagination_links_found.append(link)

                    # Generate ALL page links from 1 to max_page if we found pages
                    if max_page > 1:
                        print(f"  - {len(pagination_links_found)} sayfalama linki bulundu, en fazla sayfa: {max_page}")

                        # Build base URL for pagination
                        base_url = current_url
                        if '?sayfa=' in current_url:
                            base_url = current_url.split('?sayfa=')[0]
                        elif '?page=' in current_url:
                            base_url = current_url.split('?page=')[0]

                        # Generate all page numbers from 1 to max_page
                        for page_num in range(1, max_page + 1):
                            pagination_url = urljoin(current_url, f"{base_url}?{page_param}={page_num}")
                            if pagination_url not in visited and not any(q_url == pagination_url for q_url, _ in queue):
                                queue.append((pagination_url, current_category_path))
                                print(f"  -> Sayfalama kuyruga eklendi: ?{page_param}={page_num}")
                    else:
                        print(f"  - Sayfalama linki bulunamadi.")


                await asyncio.sleep(random.uniform(1, 3))
        finally:
            await browser.close()
            save_state(queue, visited)
            print(f"\n[INFO] State saved. Queue: {len(queue)}, Visited: {len(visited)}")

if __name__ == "__main__":
    asyncio.run(main())
