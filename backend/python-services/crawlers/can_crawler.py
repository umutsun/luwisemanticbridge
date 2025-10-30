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

# --- Can Yayınları Configuration ---
STATE_FILE = "can_crawler_state.json"
REDIS_HOST = 'localhost'
REDIS_PORT = 6379
REDIS_DB = 0
default_start_url = "https://www.canyayinlari.com/kitap-cocuk"
# --- End of Configuration ---

r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, decode_responses=True)

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

async def extract_product_details(page, url, current_category_path):
    print(f"\n[WEB] {url}")
    try:
        data = {}
        # --- Robust extraction using Playwright locators for Can Yayınları ---

        # Product Name - h1.product-title
        data['product_name'] = await get_text_or_none(page.locator('h1.product-title'))

        # Track unmatched fields for debugging
        unmatched_fields = {}

        # Helper function to get all table labels for debugging
        async def get_all_table_labels():
            """Get all labels from the table for debugging"""
            try:
                # Try multiple selectors
                rows = await page.locator('#Properties table.table tbody tr').all()
                if not rows:
                    rows = await page.locator('#Properties tbody tr').all()
                if not rows:
                    rows = await page.locator('table tbody tr').all()

                # If still no rows, try div-based structure or nested tables
                if not rows:
                    rows = await page.locator('#Properties tr').all()

                labels = []
                for row in rows:
                    # Try td first
                    cells = await row.locator('td').all()
                    if len(cells) >= 2:
                        label = await cells[0].inner_text()
                        labels.append(label.strip())
                    elif len(cells) == 1:
                        # Single cell, might be label-only or value-only
                        label = await cells[0].inner_text()
                        if label.strip():
                            labels.append(label.strip())

                return labels
            except Exception:
                return []

        # Helper function to extract table data from properties table
        async def get_table_value(label_text, alternatives=None, field_name=None):
            """Extract value from properties table by label text - supports alternatives"""
            try:
                # Target the Properties section table - try multiple selectors
                rows = await page.locator('#Properties table.table tbody tr').all()

                # If no rows, try with just tbody
                if not rows:
                    rows = await page.locator('table tbody tr').all()

                # If main selector doesn't work, try alternatives
                if not rows:
                    rows = await page.locator('#Properties tbody tr').all()
                if not rows:
                    rows = await page.locator('table tbody tr').all()
                if not rows:
                    rows = await page.locator('#Properties tr').all()

                search_labels = [label_text]
                if alternatives:
                    search_labels.extend(alternatives)

                for row in rows:
                    cells = await row.locator('td').all()
                    if len(cells) >= 2:
                        label = await cells[0].inner_text()
                        label_clean = label.strip()

                        # Debug logging for critical fields
                        if field_name in ["isbn", "page_count"] and label_clean in ["ISBN", "Sayfa Sayısı"]:
                            try:
                                print(f"  [DEBUG] Found {label_clean} in table, extracting value...")
                            except:
                                pass

                        # Check if label matches any of the search terms (exact match or contains)
                        match_found = label_clean in search_labels
                        if not match_found:
                            # Also try case-insensitive contains match for better compatibility
                            match_found = any(search.lower() in label_clean.lower() for search in search_labels)

                        if match_found:
                            value = await cells[1].inner_text()
                            value_clean = value.strip() if value else None

                            # Debug logging
                            if field_name in ["isbn", "page_count"]:
                                try:
                                    print(f"  [DEBUG] {field_name}: label='{label_clean}' value='{value_clean}'")
                                except:
                                    pass

                            # Return value only if not empty
                            if value_clean:
                                return value_clean
                            # If value is empty, don't record in scrapes (it's in the table but empty)
                            return None
                    elif len(cells) == 1:
                        # Single cell - check if it contains label, and look for value in next row or sibling
                        cell_text = await cells[0].inner_text()
                        cell_clean = cell_text.strip()
                        if cell_clean in search_labels:
                            # Next sibling row might have the value
                            next_row = await row.evaluate('el => el.nextElementSibling')
                            if next_row:
                                next_cells = await row.locator('xpath=following-sibling::tr[1]//td').all()
                                if next_cells:
                                    value = await next_cells[0].inner_text()
                                    value_clean = value.strip() if value else None
                                    if value_clean:
                                        return value_clean

                # Record unmatched field for debugging - include all labels tried
                # Only if the label wasn't found at all (not if it was found but empty)
                if field_name:
                    unmatched_fields[field_name] = {
                        "searched_for": [label_text] + (alternatives or []),
                        "reason": "Label not found in table"
                    }

                return None
            except Exception as e:
                if field_name:
                    unmatched_fields[field_name] = {
                        "searched_for": [label_text] + (alternatives or []),
                        "reason": f"Error: {str(e)}"
                    }
                return None

        # Helper function to extract links from table (for authors, translators, etc.)
        async def get_table_links(label_text):
            """Extract link texts from properties table by label"""
            try:
                rows = await page.locator('#Properties table.table tbody tr').all()
                for row in rows:
                    cells = await row.locator('td').all()
                    if len(cells) >= 2:
                        label = await cells[0].inner_text()
                        label_clean = label.strip()
                        if label_clean == label_text or label_text in label_clean:
                            links = await cells[1].locator('a').all()
                            if links:
                                names = []
                                for link in links:
                                    name = await link.inner_text()
                                    if name:
                                        names.append(name.strip())
                                return names if names else None
                            else:
                                # No links, get text directly
                                value = await cells[1].inner_text()
                                return [value.strip()] if value else None
                return None
            except Exception:
                return None

        # ISBN - first try from table, then extract from URL if available
        isbn_cell = await get_table_value("ISBN", field_name="isbn")
        if not isbn_cell:
            # Extract ISBN from URL pattern: -978XXXXXXXXXX at the end
            isbn_match = re.search(r'-978(\d{10,13})(?:$|/)', url)
            if isbn_match:
                isbn_cell = '978' + isbn_match.group(1)
        data['isbn'] = isbn_cell

        # Subtitle (Alt Başlık) from table
        subtitle_cell = await get_table_value("Alt Başlık")
        data['subtitle'] = subtitle_cell if subtitle_cell else None

        # Image URL from #prd-images img
        data['image_url'] = await get_attr_or_none(page.locator('#prd-images img').first, 'src')
        if not data['image_url']:
            data['image_url'] = await get_attr_or_none(page.locator('#prd-images img').first, 'data-src')

        # Description from #Detail p
        data['description'] = await get_text_or_none(page.locator('#Detail p'))

        # Price from .installment-price or .price-sales
        price_text = await get_text_or_none(page.locator('.installment-price'))
        if not price_text:
            price_text = await get_text_or_none(page.locator('.price-sales'))
        data['price'] = price_text

        # Page Count from table (with alternatives: Sayfa Sayısı, Sahife Sayısı, Pages)
        page_count_cell = await get_table_value("Sayfa Sayısı", ["Sahife Sayısı", "Pages", "Sayfa"], field_name="page_count")
        data['page_count'] = page_count_cell if page_count_cell else "N/A"

        # Publisher from table
        publisher_cell = await get_table_value("Yayınevi")
        data['publisher'] = publisher_cell if publisher_cell else "Can Yayinlari"

        # Category Path from breadcrumb
        category_path = []
        breadcrumb_items = await page.locator('.breadcrumb li a').all()
        for item in breadcrumb_items:
            text = await item.inner_text()
            if text and text != "Ana Sayfa" and "can" not in text.lower():
                category_path.append(text.strip())
        data['category_path'] = category_path

        # Age Group from table (with alternative "Yaş Grubu")
        age_cell = await get_table_value("Yaş", ["Yaş Grubu"], field_name="age_group")
        data['age_group'] = age_cell if age_cell else "N/A"

        # Dimensions from table (with alternative "Boyut")
        dimensions_cell = await get_table_value("Ebat", ["Boyut"], field_name="dimensions")
        data['dimensions'] = dimensions_cell if dimensions_cell else "N/A"

        # First Print Date from table (with alternative "İlk Basım Tarihi")
        first_print_date_cell = await get_table_value("İlk Baskı Tarihi", ["İlk Basım Tarihi"], field_name="first_print_date")
        data['first_print_date'] = first_print_date_cell if first_print_date_cell else "N/A"

        # Editor from table
        editor_cell = await get_table_value("Editör")
        data['editor'] = editor_cell if editor_cell else "N/A"

        # Illustrator from table
        illustrator_cell = await get_table_value("Resimleyen")
        data['illustrator'] = illustrator_cell if illustrator_cell else "N/A"

        # Cover Design from table
        cover_designer_cell = await get_table_value("Kapak Tasarımı")
        data['cover_designer'] = cover_designer_cell if cover_designer_cell else "N/A"

        # Authors/Artists from table
        authors_illustrators = []

        # Yazar (can have links)
        authors = await get_table_links("Yazar")
        if authors:
            for author in authors:
                authors_illustrators.append({"name": author, "role": "Yazar"})

        # Çevirmen (can have links)
        translators = await get_table_links("Çevirmen")
        if translators:
            for translator in translators:
                authors_illustrators.append({"name": translator, "role": "Çevirmen"})

        # Resimleyen (can have links)
        illustrators = await get_table_links("Resimleyen")
        if illustrators:
            for illustrator in illustrators:
                authors_illustrators.append({"name": illustrator, "role": "Resimleyen"})

        # Dizi Editörü (Series Editor)
        series_editor_cell = await get_table_value("Dizi Editörü")
        if series_editor_cell:
            authors_illustrators.append({"name": series_editor_cell, "role": "Dizi Editörü"})

        # Editör
        editor_cell = await get_table_value("Editör")
        if editor_cell:
            # Handle multiple editors separated by comma
            editors = [e.strip() for e in editor_cell.split(',')]
            for editor in editors:
                authors_illustrators.append({"name": editor, "role": "Editör"})

        # Düzelti
        proofreader_cell = await get_table_value("Düzelti")
        if proofreader_cell:
            authors_illustrators.append({"name": proofreader_cell, "role": "Düzelti"})

        # Mizanpaj
        layout_cell = await get_table_value("Mizanpaj")
        if layout_cell:
            authors_illustrators.append({"name": layout_cell, "role": "Mizanpaj"})

        # Sanat Yönetmeni
        art_director_cell = await get_table_value("Sanat Yönetmeni")
        if art_director_cell:
            authors_illustrators.append({"name": art_director_cell, "role": "Sanat Yönetmeni"})

        # Kapak Tasarimi (same as Sanat Yönetmeni often, but check separately)
        cover_design_cell = await get_table_value("Kapak Tasarimi")
        if cover_design_cell and cover_design_cell != art_director_cell:
            authors_illustrators.append({"name": cover_design_cell, "role": "Kapak Tasarimi"})

        # Kapak Uygulama (Cover Application/Technique)
        cover_application_cell = await get_table_value("Kapak Uygulama")
        if cover_application_cell:
            authors_illustrators.append({"name": cover_application_cell, "role": "Kapak Uygulama"})

        data['authors_illustrators'] = authors_illustrators

        # Genre from last category or default
        data['genre'] = category_path[-1] if category_path else "Çocuk Kitapları"

        # Product Short Info from table
        product_short_info_cell = await get_table_value("Ürün Detay")
        data['product_short_info'] = product_short_info_cell if product_short_info_cell else "N/A"

        # Publish Year from table
        publish_year_cell = await get_table_value("İlk Yayın Tarihi")
        data['publish_year'] = publish_year_cell if publish_year_cell else "N/A"

        # School/Class Info from table
        school_class_info_cell = await get_table_value("Okul / Sınıf Bilgisi")
        data['school_class_info'] = school_class_info_cell if school_class_info_cell else "N/A"

        # Application from table
        application_cell = await get_table_value("Uygulama")
        data['application'] = application_cell if application_cell else "N/A"

        # Original Title from table (with alternative "Orijinal Adı")
        original_title_cell = await get_table_value("Özgün Adı", ["Orijinal Adı"])
        data['original_title'] = original_title_cell if original_title_cell else "N/A"

        # Book Language (Eser Dili) - the actual language of the book
        book_language_cell = await get_table_value("Eser Dili")
        data['book_language'] = book_language_cell if book_language_cell else "N/A"

        # Original Language from table (for translations)
        original_language_cell = await get_table_value("Özgün Dili")
        data['original_language'] = original_language_cell if original_language_cell else "N/A"

        # Translation Language from table
        translation_language_cell = await get_table_value("Çeviri Dili")
        data['translation_language'] = translation_language_cell if translation_language_cell else "N/A"

        # Store extracted values in data dict for final structuring
        data['series_editor'] = series_editor_cell if series_editor_cell else "N/A"
        data['proofreader'] = proofreader_cell if proofreader_cell else "N/A"
        data['layout'] = layout_cell if layout_cell else "N/A"
        data['art_director'] = art_director_cell if art_director_cell else "N/A"

        # Theme Info from table
        theme_info_cell = await get_table_value("PYP")
        data['theme_info'] = theme_info_cell if theme_info_cell else "N/A"

        # Themes from table
        themes_cell = await get_table_value("Tema")
        if themes_cell:
            data['themes'] = [theme.strip() for theme in themes_cell.split(',')]
        else:
            data['themes'] = []

        # Sub-themes from table
        sub_themes_cell = await get_table_value("Alt Tema")
        if sub_themes_cell:
            data['sub_themes'] = [sub_theme.strip() for sub_theme in sub_themes_cell.split(',')]
        else:
            data['sub_themes'] = []

        # Get all table labels for debugging unmatched fields
        all_table_labels = await get_all_table_labels()

        # If no labels found, try alternative selectors (silently)
        if not all_table_labels:
            try:
                # Try alternative: any table in Properties
                alt_rows = await page.locator('#Properties tbody tr').all()
                if alt_rows:
                    for row in alt_rows:
                        cells = await row.locator('td').all()
                        if len(cells) >= 2:
                            label = await cells[0].inner_text()
                            all_table_labels.append(label.strip())
                else:
                    # Try: table > tbody > tr
                    alt_rows2 = await page.locator('table tbody tr').all()
                    if alt_rows2:
                        for row in alt_rows2:
                            cells = await row.locator('td').all()
                            if len(cells) >= 2:
                                label = await cells[0].inner_text()
                                all_table_labels.append(label.strip())
            except Exception:
                pass

        # Add actual table labels to scrapes for unmatched fields
        # Only keep scrapes if we have available_labels (meaning table was found)
        # AND if the label truly wasn't found (not just had empty value)
        if all_table_labels:
            # Filter out fields where the label actually exists in the table
            filtered_unmatched = {}
            for field_name, info in unmatched_fields.items():
                searched_labels = info["searched_for"]
                # Check if any of the searched labels are in available_labels
                label_found = any(label in all_table_labels for label in searched_labels)
                if not label_found:
                    # Label truly not found, keep in scrapes
                    info["available_labels"] = all_table_labels
                    filtered_unmatched[field_name] = info
            unmatched_fields = filtered_unmatched
        else:
            # If no table labels found, don't include scrapes (table doesn't exist or can't be parsed)
            unmatched_fields = {}

        # --- Final Data Structuring (consolidated, no duplicates) ---
        final_data = {
            "url": url,
            "product_name": data.get('product_name'),
            "subtitle": data.get('subtitle'),
            "price": data.get('price'),
            "category_path": data.get('category_path'),
            "image_url": data.get('image_url'),
            "description": data.get('description'),
            "isbn": data.get('isbn'),
            "publisher": data.get('publisher'),
            "page_count": data.get('page_count'),
            "age_group": data.get('age_group'),
            "dimensions": data.get('dimensions'),
            "first_print_date": data.get('first_print_date'),
            "product_short_info": data.get('product_short_info'),
            "publish_year": data.get('publish_year'),
            "school_class_info": data.get('school_class_info'),
            "application": data.get('application'),
            "book_language": data.get('book_language'),
            "original_title": data.get('original_title'),
            "original_language": data.get('original_language'),
            "translation_language": data.get('translation_language'),
            "theme_info": data.get('theme_info'),
            "authors_illustrators": data.get('authors_illustrators', []),
            "genre": data.get('genre'),
            "themes": data.get('themes'),
            "sub_themes": data.get('sub_themes'),
            "markdown_content": "",
        }

        # Only add scrapes if there are unmatched fields
        if unmatched_fields:
            final_data["scrapes"] = unmatched_fields

        # Save to Redis in the correct format
        slug = urlparse(url).path.split('/')[-1]
        redis_key = f"crawl4ai:can_crawler:kitaplar:{slug}"

        try:
            json_data = json.dumps(final_data, ensure_ascii=False, indent=2)
            r.set(redis_key, json_data)
            print(f"[OK] Saved to Redis")
        except Exception as redis_error:
            print(f"[ERROR] Redis write error: {redis_error}")
            try:
                json_data_ascii = json.dumps(final_data, ensure_ascii=True, indent=2)
                r.set(redis_key, json_data_ascii)
                print(f"[OK] Saved to Redis (ASCII)")
            except Exception as redis_error2:
                print(f"[ERROR] Redis write error: {redis_error2}")

        # Show clean extracted data summary
        print("\n[EXTRACTED]")
        try:
            if final_data.get('product_name'):
                print(f"  Title: {final_data['product_name']}")
            if final_data.get('subtitle'):
                print(f"  Subtitle: {final_data['subtitle']}")
            if final_data.get('isbn'):
                print(f"  ISBN: {final_data['isbn']}")
            if final_data.get('page_count') and final_data['page_count'] != "N/A":
                print(f"  Pages: {final_data['page_count']}")
            if final_data.get('price'):
                print(f"  Price: {final_data['price']}")
            if final_data.get('age_group') and final_data['age_group'] != "N/A":
                print(f"  Age: {final_data['age_group']}")
            if final_data.get('book_language') and final_data['book_language'] != "N/A":
                print(f"  Language: {final_data['book_language']}")

            # Show authors/illustrators count
            authors_count = len(final_data.get('authors_illustrators', []))
            if authors_count > 0:
                print(f"  Contributors: {authors_count}")
        except UnicodeEncodeError:
            # If encoding fails, just show a minimal summary
            print(f"  [Data saved to Redis - encoding issue in console output]")

    except Exception as e:
        try:
            print(f"[ERROR] Error processing product details: {url}")
        except UnicodeEncodeError:
            print(f"[ERROR] Error processing product details: (URL with special chars)")
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
    with open(STATE_FILE, 'w') as f:
        json.dump(state_data, f)

def load_state():
    try:
        with open(STATE_FILE, 'r') as f:
            state = json.load(f)
            return state["queue"], set(state["visited"]), state.get("failed_urls", [])
    except FileNotFoundError:
        print(f"Durum dosyasi '{STATE_FILE}' bulunamadi. Yeni bir baslangic yapiliyor.")
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

                try:
                    await page.goto(current_url, wait_until="domcontentloaded", timeout=120000)

                    # Wait for Properties table to load (it's loaded asynchronously via JS)
                    try:
                        await page.wait_for_selector('#Properties table.table tbody tr', timeout=15000)
                    except:
                        # If table doesn't load, properties might not exist on this page
                        pass
                except PlaywrightTimeoutError:
                    print(f"  - [TIMEOUT] Page load timeout. Skipping.")
                    continue
                except Exception as e:
                    error_str = str(e).lower()
                    if "crashed" in error_str:
                        # Page crashed, create new page and skip URL
                        try:
                            page.close()
                        except:
                            pass
                        page = await browser.new_page()
                        print(f"  - [CRASH] Page crashed. Recovered and skipping.")
                        continue
                    elif "name_not_resolved" in error_str or "dns" in error_str:
                        print(f"  - [ERROR] DNS Error. Skipping.")
                        continue
                    elif "connection_refused" in error_str:
                        print(f"  - [ERROR] Connection refused. Skipping.")
                        continue
                    else:
                        print(f"  - [ERROR] Page load error. Skipping.")
                        continue

                # Product pages have ISBN in URL: /978XXXX or -978XXXX format
                is_product_page = bool(re.search(r'[-/]978\d{10,13}', current_url))

                if is_product_page:
                    await extract_product_details(page, current_url, current_category_path)
                else:
                    print(f"[SEARCH] Scanning category/pagination links...")
                    # Handle infinite scroll for Can Yayınları
                    await page.wait_for_timeout(3000)  # Wait longer for initial load

                    # Click "Daha fazla göster" button to load more products
                    previous_count = 0
                    click_attempts = 0
                    max_clicks = 200  # Much higher limit to get all products

                    while click_attempts < max_clicks:  # Keep clicking until no more products load
                        # Check current product count - fix selector for Can Yayınları
                        product_count = await page.locator('.product').count()
                        if product_count == previous_count and click_attempts > 0:
                            print(f"  - [INFO] No more products loaded. Total: {product_count}")
                            break

                        # Try multiple selectors for the "Daha fazla göster" button
                        button_found = False

                        # Method 1: .view-more-btn
                        more_button = page.locator('.view-more-btn')
                        if await more_button.is_visible():
                            try:
                                await more_button.click()
                                button_found = True
                            except:
                                pass

                        # Method 2: button with "Daha fazla" text
                        if not button_found:
                            try:
                                daha_fazla_btn = page.locator('button:has-text("Daha fazla")')
                                if await daha_fazla_btn.first.is_visible():
                                    await daha_fazla_btn.first.click()
                                    button_found = True
                            except:
                                pass

                        # Method 3: Any visible button with partial text match
                        if not button_found:
                            try:
                                buttons = await page.locator('button').all()
                                for btn in buttons:
                                    if await btn.is_visible():
                                        text = await btn.inner_text()
                                        if 'daha' in text.lower() and 'fazla' in text.lower():
                                            await btn.click()
                                            button_found = True
                                            break
                            except:
                                pass

                        if button_found:
                            await page.wait_for_timeout(8000)  # Wait longer for products to load dynamically
                            click_attempts += 1
                            previous_count = product_count
                            print(f"  - [CLICK] Button clicked {click_attempts}x. Products loaded: {product_count}")
                        else:
                            print(f"  - [INFO] All products loaded. Total: {product_count}")
                            break

                    print(f"[LINKS] Scanning category/pagination links...")

                    # First, check for pagination links (?rpg=X)
                    pagination_links = []
                    try:
                        all_links = await page.locator('a').evaluate_all(
                            "(elements) => elements.map(el => el.href)"
                        )
                        for href in all_links:
                            if href and '?rpg=' in href:
                                full_url = urljoin(current_url, href)
                                if full_url not in visited and full_url not in pagination_links:
                                    pagination_links.append(full_url)
                        if pagination_links:
                            print(f"  - [PAGINATION] Found {len(pagination_links)} pagination links")
                    except:
                        pass

                    # Can Yayınları için ürün linklerini bul
                    product_links = []

                    # Can Yayınları URL format: /product-name-978XXXXXXXXXX
                    # ISBN pattern: ends with -978 followed by 10-13 digits (for ISBN-13)
                    isbn_pattern = r'-978\d{10,13}(?:$|/)'

                    # Try to find product links (.product.relative a)
                    try:
                        links = await page.locator('.product.relative a').evaluate_all(
                            "(elements) => elements.map(el => el.href)"
                        )
                        print(f"  - [FOUND] {len(links)} links in .product.relative")
                        for href in links:
                            if href and re.search(isbn_pattern, href):
                                full_url = urljoin(current_url, href)
                                if full_url not in product_links:
                                    product_links.append(full_url)
                        if product_links:
                            print(f"  - [ADDED] {len(product_links)} product links from .product.relative")
                    except Exception as e:
                        print(f"  - [ERROR] .product.relative parsing: {e}")

                    # Fallback: product-name class links
                    if not product_links:
                        try:
                            links = await page.locator('.product-name a').evaluate_all(
                                "(elements) => elements.map(el => el.href)"
                            )
                            print(f"  - [FOUND] {len(links)} links in .product-name")
                            for href in links:
                                if href and re.search(isbn_pattern, href):
                                    full_url = urljoin(current_url, href)
                                    if full_url not in product_links:
                                        product_links.append(full_url)
                            if product_links:
                                print(f"  - [ADDED] {len(product_links)} product links from .product-name")
                        except Exception as e:
                            print(f"  - [ERROR] .product-name parsing: {e}")

                    # Fallback: check all links
                    if not product_links:
                        try:
                            all_links = await page.locator('a').evaluate_all(
                                "(elements) => elements.map(el => el.href)"
                            )
                            print(f"  - [SEARCH] Checking all {len(all_links)} links for ISBN pattern")
                            for href in all_links:
                                if href and re.search(isbn_pattern, href):
                                    full_url = urljoin(current_url, href)
                                    if full_url not in product_links:
                                        product_links.append(full_url)
                            if product_links:
                                print(f"  - [ADDED] {len(product_links)} product links from all links")
                        except Exception as e:
                            print(f"  - [ERROR] All links parsing: {e}")
                    
                    # Remove duplicates
                    unique_links = list(set(product_links))

                    print(f"  - [FOUND] {len(unique_links)} potential product links found")
                    added_count = 0
                    # Add all products to queue
                    for link in unique_links:
                        if link and link not in visited and not any(q_url == link for q_url, _ in queue):
                            queue.append((link, current_category_path))
                            added_count += 1
                    print(f"  - [INFO] Added {added_count} new product links to queue")

                    # Also add pagination links to queue
                    pagination_added = 0
                    for pag_link in pagination_links:
                        if pag_link not in visited and not any(q_url == pag_link for q_url, _ in queue):
                            queue.append((pag_link, current_category_path))
                            pagination_added += 1
                    if pagination_added > 0:
                        print(f"  - [INFO] Added {pagination_added} pagination links to queue")

                    print(f"  - [INFO] Total queue now: {len(queue)} links")

                await asyncio.sleep(random.uniform(3, 7))
        finally:
            await browser.close()
            save_state(queue, visited, failed_urls)
            print(f"\n[INFO] State saved. Queue: {len(queue)}, Visited: {len(visited)}")

if __name__ == "__main__":
    asyncio.run(main())