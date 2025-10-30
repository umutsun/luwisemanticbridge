import asyncio
import json
import re
import sys
import random
import os
from urllib.parse import urljoin, urlparse

# Set UTF-8 encoding for Windows
if os.name == 'nt':
    os.system('chcp 65001')

import redis
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

# --- Emlak Mevzuatı Configuration ---
STATE_FILE = "emlakai_crawler_state.json"
REDIS_HOST = 'localhost'
REDIS_PORT = 6379
REDIS_DB = 0
default_start_url = "https://emlakmevzuati.com/category/tuzukler/"
# --- End of Configuration ---

r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, decode_responses=True)

def capitalize_title(text):
    """Convert UPPERCASE text to Title Case (Capital case)"""
    if not text:
        return text
    # If text is all uppercase, convert to title case
    if text.isupper():
        return text.title()
    return text

def extract_entities(text):
    """Extract entities from text content"""
    if not text:
        return {}

    entities = {}

    # Extract dates (DD/MM/YYYY, DD.MM.YYYY, YYYY-MM-DD)
    date_pattern = r'\b(\d{1,2}[./]\d{1,2}[./]\d{4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})\b'
    dates = re.findall(date_pattern, text)
    if dates:
        entities['dates'] = list(set(dates))

    # Extract years (4 digits, likely years 1900-2099)
    year_pattern = r'\b(19\d{2}|20\d{2})\b'
    years = re.findall(year_pattern, text)
    if years:
        entities['years'] = list(set(years))

    # Extract article numbers (Madde 123, md. 123, m. 123)
    article_pattern = r'(?:Madde|madde|md\.|m\.)\s*(\d+)'
    articles = re.findall(article_pattern, text)
    if articles:
        entities['article_numbers'] = list(set(articles))

    # Extract law/regulation numbers (Sayı: 12345, No: 12345)
    number_pattern = r'(?:Sayı|sayı|No|no|Numara|numara)[\s:]+(\d+)'
    numbers = re.findall(number_pattern, text)
    if numbers:
        entities['regulation_numbers'] = list(set(numbers))

    # Extract resmi gazete references
    gazette_pattern = r'Resmi\s+Gazete[^\d]*(\d+)'
    gazette_refs = re.findall(gazette_pattern, text, re.IGNORECASE)
    if gazette_refs:
        entities['resmi_gazete_numbers'] = list(set(gazette_refs))

    # Extract monetary amounts (TL, ₺)
    money_pattern = r'(\d+(?:[.,]\d+)?)\s*(?:TL|₺|lira)'
    amounts = re.findall(money_pattern, text, re.IGNORECASE)
    if amounts:
        entities['monetary_amounts'] = list(set(amounts))

    return entities if entities else None

async def get_text_or_none(locator, timeout=5000):
    try:
        return await locator.first.inner_text(timeout=timeout)
    except:
        return None

async def get_attr_or_none(locator, attr):
    try:
        return await locator.first.get_attribute(attr, timeout=5000)
    except PlaywrightTimeoutError:
        return None

async def extract_content_details(page, url, current_category_path):
    """Extract content from single mevzuat page"""
    print(f"\n[WEB] {url}")
    try:
        data = {}

        # Extract title from h1 or .entry-title
        title = await get_text_or_none(page.locator('h1.entry-title'))
        if not title:
            title = await get_text_or_none(page.locator('h1'))

        # If title is all uppercase (more than 80% uppercase), convert to title case
        if title and len([c for c in title if c.isupper()]) > len(title) * 0.8:
            title = title.title()

        data['title'] = title

        # Extract main content from #mh-content .main-content
        content_html = None
        try:
            # Wait for content to load
            await page.wait_for_selector('#mh-content .main-content', timeout=10000)
            content_html = await page.locator('#mh-content .main-content').first.inner_html()
        except:
            # Fallback to article content
            try:
                content_html = await page.locator('article .entry-content').first.inner_html()
            except:
                pass

        # Extract clean text content - focus on main body paragraphs only
        clean_text_content = ""
        if content_html:
            try:
                from bs4 import BeautifulSoup
                import re

                # Parse HTML with BeautifulSoup
                soup = BeautifulSoup(content_html, 'html.parser')

                # Remove unwanted elements completely
                for element in soup(["script", "style", "noscript", "iframe", "svg", "figure", "img"]):
                    element.decompose()

                # Remove sharing/social media/ads/widgets
                for element in soup.select('.sharedaddy, .sd-sharing, .share-facebook, .share-x, .share-twitter, .share-end'):
                    element.decompose()

                # Remove post views/meta info/thumbnails
                for element in soup.select('.post-views, .entry-meta, .entry-thumbnail'):
                    element.decompose()

                # Remove footer, header, navigation
                for element in soup.select('.mh-footer, footer, header, nav'):
                    element.decompose()

                # Remove tables (we extract meta from tables separately if needed)
                for element in soup.select('table'):
                    element.decompose()

                # Focus on main body content: get only paragraph texts
                paragraphs = []
                for p in soup.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']):
                    text = p.get_text(strip=True)
                    if text and len(text) > 10:  # Skip very short paragraphs
                        paragraphs.append(text)

                clean_text_content = '\n\n'.join(paragraphs)

                # Clean up extra whitespace
                clean_text_content = re.sub(r'\n\s*\n+', '\n\n', clean_text_content)
                clean_text_content = clean_text_content.strip()
            except Exception as e:
                print(f"  - [DEBUG] Could not parse HTML: {str(e)[:50]}")
                # Fallback: use text_content
                try:
                    element = await page.query_selector('#mh-content .main-content')
                    if element:
                        clean_text_content = await element.text_content()
                except:
                    clean_text_content = ""

        data['content'] = clean_text_content

        # Extract PDF URLs if available
        pdf_urls = []
        try:
            # Look for PDF links in content
            pdf_links = await page.locator('a[href*=".pdf"]').evaluate_all(
                "(elements) => elements.map(el => ({ href: el.href, text: el.innerText }))"
            )
            for pdf_link in pdf_links:
                pdf_url = pdf_link.get('href')
                if pdf_url:
                    pdf_urls.append({
                        'url': pdf_url,
                        'description': pdf_link.get('text', '').strip()
                    })
        except:
            pass

        data['pdf_urls'] = pdf_urls if pdf_urls else None

        # Extract entities from content
        entities = extract_entities(clean_text_content)
        if entities:
            data['entities'] = entities

        # Extract metadata
        data['url'] = url
        data['page_url'] = url  # Add page_url field
        data['category_path'] = current_category_path

        # Extract publish date if available
        publish_date = await get_text_or_none(page.locator('time.entry-date'))
        if not publish_date:
            publish_date = await get_text_or_none(page.locator('.entry-meta time'))
        data['publish_date'] = publish_date

        # Extract author if available
        author = await get_text_or_none(page.locator('.author-name'))
        if not author:
            author = await get_text_or_none(page.locator('.entry-meta .author'))
        data['author'] = author

        # Create slug from URL
        slug = urlparse(url).path.strip('/').split('/')[-1]

        # Save to Redis: crawl4ai:emlakai_crawler:mevzuatlar:{slug}
        redis_key = f"crawl4ai:emlakai_crawler:mevzuatlar:{slug}"

        try:
            json_data = json.dumps(data, ensure_ascii=False, indent=2)
            r.set(redis_key, json_data)
            print(f"[OK] Saved to Redis: {redis_key}")
        except Exception as redis_error:
            print(f"[ERROR] Redis write error: {redis_error}")
            try:
                json_data_ascii = json.dumps(data, ensure_ascii=True, indent=2)
                r.set(redis_key, json_data_ascii)
                print(f"[OK] Saved to Redis (ASCII): {redis_key}")
            except Exception as redis_error2:
                print(f"[ERROR] Redis write error: {redis_error2}")

        # Show clean extracted data summary
        print("\n[EXTRACTED]")
        try:
            if data.get('title'):
                print(f"  Title: {data['title']}")
            if data.get('publish_date'):
                print(f"  Date: {data['publish_date']}")
            if data.get('author'):
                print(f"  Author: {data['author']}")
            if data.get('category_path'):
                print(f"  Category: {' > '.join(data['category_path'])}")
            if data.get('pdf_urls'):
                print(f"  PDFs: {len(data['pdf_urls'])}")
            if data.get('entities'):
                entity_counts = {k: len(v) if isinstance(v, list) else 1 for k, v in data['entities'].items()}
                print(f"  Entities: {entity_counts}")
            if clean_text_content:
                preview = clean_text_content[:100].replace('\n', ' ')
                print(f"  Content: {preview}...")
        except UnicodeEncodeError:
            print(f"  [Data saved to Redis - encoding issue in console output]")

    except Exception as e:
        try:
            print(f"[ERROR] Error processing content: {url}")
        except UnicodeEncodeError:
            print(f"[ERROR] Error processing content: (URL with special chars)")
        print(f"[ERROR] Error details: {str(e)[:200]}")
        import traceback
        try:
            print(f"[ERROR] Traceback: {traceback.format_exc()[:500]}")
        except UnicodeEncodeError:
            print(f"[ERROR] Traceback: (Unable to print due to encoding)")

def save_state(queue, visited, failed_urls=None):
    state_data = {"queue": queue, "visited": list(visited)}
    if failed_urls:
        state_data["failed_urls"] = failed_urls
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(state_data, f, ensure_ascii=False)

def load_state():
    try:
        with open(STATE_FILE, 'r', encoding='utf-8') as f:
            state = json.load(f)
            return state["queue"], set(state["visited"]), state.get("failed_urls", [])
    except FileNotFoundError:
        print(f"Durum dosyasi '{STATE_FILE}' bulunamadi. Yeni bir baslangic yapiliyor.")
        return None, None, []

async def main():
    start_url_param = sys.argv[1] if len(sys.argv) > 1 else default_start_url

    # Extract category from URL path
    parsed_url = urlparse(start_url_param)
    path_parts = [s for s in parsed_url.path.split('/') if s]

    # If URL contains 'category', extract the category name
    if 'category' in path_parts:
        category_index = path_parts.index('category')
        if category_index + 1 < len(path_parts):
            base_category_path = [path_parts[category_index + 1]]
        else:
            base_category_path = ['tuzukler']
    else:
        base_category_path = ['tuzukler']

    queue, visited, failed_urls = load_state()
    if not queue:
        queue = [(start_url_param, base_category_path)]
        visited = set()
        failed_urls = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()

        try:
            while queue:
                current_url, current_category_path = queue.pop(0)
                if current_url in visited:
                    continue
                visited.add(current_url)

                try:
                    await page.goto(current_url, wait_until="domcontentloaded", timeout=120000)

                    # Wait for content to load
                    try:
                        await page.wait_for_selector('.main-content', timeout=10000)
                    except:
                        pass
                except PlaywrightTimeoutError:
                    print(f"  - [TIMEOUT] Page load timeout. Skipping.")
                    continue
                except Exception as e:
                    error_str = str(e).lower()
                    if "crashed" in error_str:
                        try:
                            await page.close()
                        except:
                            pass
                        page = await browser.new_page()
                        print(f"  - [CRASH] Page crashed. Recovered and skipping.")
                        continue
                    else:
                        print(f"  - [ERROR] Page load error. Skipping.")
                        continue

                # Determine if this is a category page or single content page
                # Category pages: /category/something
                # Single pages: /specific-content-name/
                is_category_page = '/category/' in current_url

                if is_category_page:
                    print(f"[CATEGORY] {current_url}")

                    # Extract article links from category page
                    article_links = []
                    try:
                        # Extract all links from the page
                        links = await page.locator('a').evaluate_all(
                            "(elements) => elements.map(el => ({ href: el.href, text: el.innerText }))"
                        )

                        print(f"  - [DEBUG] Found {len(links)} total links on page")

                        for link_obj in links:
                            href = link_obj.get('href', '')
                            text = link_obj.get('text', '').strip()

                            # Filter for article links:
                            # 1. Must be emlakmevzuati.com domain
                            # 2. Must NOT contain: /category/, /tag/, /author/, wp-admin, wp-login
                            # 3. Must end with / (typical article URL pattern)
                            # 4. Must not be homepage
                            if (href and
                                'emlakmevzuati.com' in href and
                                href != 'https://emlakmevzuati.com/' and
                                '/category/' not in href and
                                '/tag/' not in href and
                                '/author/' not in href and
                                'wp-admin' not in href and
                                'wp-login' not in href and
                                '#' not in href and
                                href.endswith('/')):

                                full_url = urljoin(current_url, href)
                                if full_url not in article_links:
                                    article_links.append(full_url)
                                    try:
                                        print(f"    - Found article: {text[:50]}")
                                    except:
                                        print(f"    - Found article: [encoding issue]")

                    except Exception as e:
                        print(f"  - [ERROR] Link extraction: {e}")

                    print(f"  - [FOUND] {len(article_links)} article links")

                    # Add article links to queue
                    added_count = 0
                    for link in article_links:
                        if link not in visited and not any(q_url == link for q_url, _ in queue):
                            queue.append((link, current_category_path))
                            added_count += 1
                    print(f"  - [ADDED] {added_count} new article links to queue")

                    # Look for pagination (next page)
                    try:
                        next_page = await page.locator('.pagination .next, .nav-links .next, a.next').first.get_attribute('href')
                        if next_page:
                            full_next_url = urljoin(current_url, next_page)
                            if full_next_url not in visited and not any(q_url == full_next_url for q_url, _ in queue):
                                queue.append((full_next_url, current_category_path))
                                print(f"  - [PAGINATION] Added next page to queue")
                    except:
                        pass
                else:
                    # Single content page - extract content
                    await extract_content_details(page, current_url, current_category_path)

                # Random delay between requests
                await asyncio.sleep(random.uniform(2, 5))

        finally:
            await browser.close()
            save_state(queue, visited, failed_urls)
            print(f"\n[INFO] State saved. Queue: {len(queue)}, Visited: {len(visited)}")

if __name__ == "__main__":
    asyncio.run(main())
