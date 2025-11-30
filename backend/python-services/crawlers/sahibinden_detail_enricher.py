#!/usr/bin/env python3
"""
Sahibinden Detail Enricher
Redis'teki mevcut ilanların detay sayfalarını ziyaret ederek eksik bilgileri doldurur.
Liste crawler'ı ile paralel çalışabilir.
"""

import asyncio
import json
import os
import re
import random
from datetime import datetime, timezone
from patchright.async_api import async_playwright
import redis

# Redis config
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
REDIS_DB = int(os.getenv('REDIS_DB', 1))

# Proxy config - TR Mobile Proxy
PROXY_HOST = os.getenv('SAHIBINDEN_PROXY_HOST', '51.77.190.247')
PROXY_PORT = os.getenv('SAHIBINDEN_PROXY_PORT', '5959')
PROXY_USER = os.getenv('SAHIBINDEN_PROXY_USER', 'pcMVhFMABB-mob-tr')
PROXY_PASS = os.getenv('SAHIBINDEN_PROXY_PASS', 'PC_07qMzFOzrqvngMuXW')

# Cookies file
COOKIES_FILE = os.path.join(os.path.dirname(__file__), 'sahibinden_cookies.json')

# Rate limiting
MIN_DELAY = 15
MAX_DELAY = 25


class SahibindenDetailEnricher:
    def __init__(self, crawler_name, max_items=100, skip_enriched=True):
        self.crawler_name = crawler_name
        self.max_items = max_items
        self.skip_enriched = skip_enriched
        self.playwright = None
        self.redis_client = None
        self.cookies = []
        self.enriched_count = 0
        self.failed_count = 0

    async def init_redis(self):
        try:
            self.redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB)
            self.redis_client.ping()
            print(f"[+] Redis connected: {REDIS_HOST}:{REDIS_PORT} DB:{REDIS_DB}")
        except Exception as e:
            print(f"[-] Redis connection failed: {e}")
            self.redis_client = None

    def load_cookies(self):
        if not os.path.exists(COOKIES_FILE):
            print(f"[-] Cookie file not found: {COOKIES_FILE}")
            return []
        with open(COOKIES_FILE) as f:
            self.cookies = json.load(f)
        print(f"[+] Loaded {len(self.cookies)} cookies")
        return self.cookies

    async def init_playwright(self):
        self.playwright = await async_playwright().start()
        self.load_cookies()
        print(f"[+] Playwright initialized")

    async def create_fresh_context(self):
        """Create a fresh browser and context for each request"""
        browser = await self.playwright.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--disable-blink-features=AutomationControlled']
        )

        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            proxy={
                'server': f'http://{PROXY_HOST}:{PROXY_PORT}',
                'username': PROXY_USER,
                'password': PROXY_PASS
            }
        )

        # Add cookies
        for c in self.cookies:
            try:
                cookie = {
                    'name': c['name'],
                    'value': c['value'],
                    'domain': c['domain'],
                    'path': c['path']
                }
                if c.get('expires') and c['expires'] > 0:
                    cookie['expires'] = c['expires']
                await context.add_cookies([cookie])
            except:
                pass

        page = await context.new_page()
        return browser, context, page

    async def random_delay(self):
        delay = random.uniform(MIN_DELAY, MAX_DELAY)
        print(f"[*] Waiting {delay:.1f}s before next detail...")
        await asyncio.sleep(delay)
        return delay

    async def wait_for_cloudflare(self, page, max_wait=60):
        """Wait for Cloudflare challenge to complete"""
        for i in range(max_wait // 2):
            title = await page.title()
            if 'Bir dakika' in title or 'moment' in title.lower() or 'challenge' in title.lower():
                if i % 5 == 0:
                    print(f"  [CF] Waiting for challenge... ({i*2}s)")
                await asyncio.sleep(2)
                continue
            if any(x in title.lower() for x in ['sahibinden', 'ilan']):
                print(f"  [CF] Challenge passed!")
                return True
        print(f"  [CF] Challenge timeout after {max_wait}s")
        return False

    async def extract_detail_data(self, page):
        """Extract all available data from detail page"""
        data = {}

        # Wait for content to load and try to wait for key element
        try:
            await page.wait_for_selector('div.classifiedInfo, ul.classifiedInfoList', timeout=10000)
        except:
            print("  [!] Could not find main content elements, trying anyway...")

        await asyncio.sleep(2)

        # === TRY TO EXTRACT JAVASCRIPT DATA FIRST (most complete) ===
        try:
            js_data = await page.evaluate('''() => {
                // Sahibinden stores classified data in various window objects
                const result = {};

                // Try classifiedUserInfo
                if (window.classifiedUserInfo) {
                    Object.assign(result, window.classifiedUserInfo);
                }

                // Try classifiedDetailInfo
                if (window.classifiedDetailInfo) {
                    Object.assign(result, window.classifiedDetailInfo);
                }

                // Try dataLayer (Google Analytics layer often has structured data)
                if (window.dataLayer && window.dataLayer.length > 0) {
                    for (const item of window.dataLayer) {
                        if (item.classifiedId || item.category || item.price) {
                            Object.assign(result, item);
                        }
                    }
                }

                // Try to find JSON-LD structured data
                const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
                for (const script of jsonLdScripts) {
                    try {
                        const jsonData = JSON.parse(script.textContent);
                        if (jsonData['@type'] === 'RealEstateListing' || jsonData['@type'] === 'Product') {
                            result.jsonLd = jsonData;
                        }
                    } catch (e) {}
                }

                // Try to find inline script with classified data
                const scripts = document.querySelectorAll('script:not([src])');
                for (const script of scripts) {
                    const text = script.textContent;
                    // Look for classifiedId patterns
                    const classifiedIdMatch = text.match(/classifiedId['"\\s:]+['"]?(\\d+)['"]?/);
                    if (classifiedIdMatch) {
                        result.classifiedId = classifiedIdMatch[1];
                    }
                    // Look for latitude/longitude
                    const latMatch = text.match(/["']?latitude["']?\\s*[:=]\\s*([\\d.]+)/);
                    const lngMatch = text.match(/["']?longitude["']?\\s*[:=]\\s*([\\d.]+)/);
                    if (latMatch) result.latitude = parseFloat(latMatch[1]);
                    if (lngMatch) result.longitude = parseFloat(lngMatch[1]);

                    // Look for price
                    const priceMatch = text.match(/["']?price["']?\\s*[:=]\\s*([\\d.]+)/);
                    if (priceMatch) result.priceFromJs = parseFloat(priceMatch[1]);

                    // Look for area/m2
                    const areaMatch = text.match(/["']?(?:area|m2|metrekare)["']?\\s*[:=]\\s*([\\d.]+)/i);
                    if (areaMatch) result.areaFromJs = parseFloat(areaMatch[1]);
                }

                return Object.keys(result).length > 0 ? result : null;
            }''')

            if js_data:
                print(f"  [+] Extracted {len(js_data)} fields from JavaScript")
                # Map JS data to our schema
                if js_data.get('latitude') and js_data.get('longitude'):
                    lat, lng = js_data['latitude'], js_data['longitude']
                    if 35 < lat < 43 and 25 < lng < 46:
                        data['latitude'] = lat
                        data['longitude'] = lng
                if js_data.get('priceFromJs'):
                    data['price_js'] = js_data['priceFromJs']
                if js_data.get('areaFromJs'):
                    data['area_js'] = js_data['areaFromJs']
                if js_data.get('classifiedId'):
                    data['listing_id_verified'] = js_data['classifiedId']
                # Store raw JS data for reference
                data['_js_data'] = js_data
        except Exception as e:
            print(f"  [!] JavaScript extraction error: {e}")

        # === PRICE ===
        try:
            price_el = await page.query_selector('div.classifiedInfo h3')
            if price_el:
                price_text = (await price_el.inner_text()).strip()
                data['price_raw'] = price_text
                # Parse numeric price
                price_clean = price_text.replace('.', '').replace(' TL', '').replace('₺', '').strip()
                match = re.search(r'(\d+)', price_clean)
                if match:
                    data['price'] = int(match.group(1))
                data['currency'] = 'TRY'
        except Exception as e:
            print(f"  [!] Price extraction error: {e}")

        # === LOCATION BREADCRUMB ===
        try:
            breadcrumb = await page.query_selector('div.classifiedInfo h2')
            if breadcrumb:
                loc_text = (await breadcrumb.inner_text()).strip()
                parts = [p.strip() for p in loc_text.split('/')]
                if len(parts) >= 1:
                    data['city'] = parts[0]
                if len(parts) >= 2:
                    data['district'] = parts[1]
                if len(parts) >= 3:
                    data['neighborhood'] = parts[2]
        except Exception as e:
            print(f"  [!] Location extraction error: {e}")

        # === PROPERTY DETAILS TABLE ===
        try:
            info_items = await page.query_selector_all('ul.classifiedInfoList li')
            for item in info_items:
                try:
                    label_el = await item.query_selector('strong')
                    value_el = await item.query_selector('span')
                    if label_el and value_el:
                        label = (await label_el.inner_text()).strip().lower()
                        value = (await value_el.inner_text()).strip()

                        # Map Turkish labels to English keys
                        label_map = {
                            'ilan no': 'listing_id',
                            'ilan tarihi': 'listing_date',
                            'emlak tipi': 'property_type',
                            'm² (brüt)': 'area_gross',
                            'm² brüt': 'area_gross',
                            'm² (net)': 'area_net',
                            'm² net': 'area_net',
                            'oda sayısı': 'rooms',
                            'bulunduğu kat': 'floor',
                            'kat sayısı': 'total_floors',
                            'isıtma': 'heating',
                            'banyo sayısı': 'bathrooms',
                            'mutfak': 'kitchen_type',
                            'balkon': 'balcony',
                            'asansör': 'elevator',
                            'otopark': 'parking',
                            'site içerisinde': 'in_complex',
                            'site adı': 'complex_name',
                            'yapının durumu': 'building_condition',
                            'yapı tipi': 'building_type',
                            'bina yaşı': 'building_age',
                            'aidat': 'monthly_fee',
                            'krediye uygun': 'credit_eligible',
                            'takas': 'exchange_possible',
                            'eşyalı': 'furnished',
                            'kullanım durumu': 'usage_status',
                            'kimden': 'seller_type',
                            'tapu durumu': 'deed_status',
                            'kişi kapasitesi': 'person_capacity',
                            'yatak sayısı': 'bed_count',
                            'izin belge no': 'permit_no',
                            # Arsa fields
                            'ada no': 'block_no',
                            'parsel no': 'parcel_no',
                            'pafta no': 'sheet_no',
                            'imar durumu': 'zoning_status',
                            'gabari': 'gabari',
                            'kaks (emsal)': 'floor_area_ratio',
                            'taks': 'building_coverage_ratio',
                        }

                        key = label_map.get(label.replace(':', ''), None)
                        if key:
                            # Parse numeric values
                            if key in ['area_gross', 'area_net', 'bathrooms', 'total_floors', 'building_age', 'person_capacity', 'bed_count']:
                                num_match = re.search(r'(\d+)', value.replace('.', ''))
                                if num_match:
                                    data[key] = int(num_match.group(1))
                                else:
                                    data[key] = value
                            elif key == 'monthly_fee':
                                num_match = re.search(r'(\d+)', value.replace('.', ''))
                                if num_match:
                                    data[key] = int(num_match.group(1))
                                else:
                                    data[key] = value
                            else:
                                data[key] = value
                except:
                    continue
        except Exception as e:
            print(f"  [!] Details table extraction error: {e}")

        # === DESCRIPTION ===
        try:
            desc_el = await page.query_selector('div#classifiedDescription')
            if desc_el:
                desc_text = (await desc_el.inner_text()).strip()
                # Clean up description
                data['description'] = desc_text[:5000]  # Limit to 5000 chars
        except Exception as e:
            print(f"  [!] Description extraction error: {e}")

        # === ALL IMAGES ===
        try:
            images = []
            # Try multiple image selectors
            img_elements = await page.query_selector_all('div.classifiedDetailPhotos img, div.thmbContainer img')
            for img in img_elements:
                src = await img.get_attribute('src')
                data_src = await img.get_attribute('data-src')
                img_url = data_src or src
                if img_url and 'placeholder' not in img_url and 'data:image' not in img_url:
                    # Convert to full size
                    full_url = img_url.replace('lthmb_', 'x5_').replace('thmb_', 'x5_')
                    if full_url not in images:
                        images.append(full_url)

            # Also try gallery thumbnails
            thumb_elements = await page.query_selector_all('div.classifiedOtherPhotos img')
            for img in thumb_elements:
                src = await img.get_attribute('src')
                data_src = await img.get_attribute('data-src')
                img_url = data_src or src
                if img_url and 'placeholder' not in img_url and 'data:image' not in img_url:
                    full_url = img_url.replace('lthmb_', 'x5_').replace('thmb_', 'x5_')
                    if full_url not in images:
                        images.append(full_url)

            if images:
                data['images'] = images[:30]  # Max 30 images
                data['image_count'] = len(images)
        except Exception as e:
            print(f"  [!] Images extraction error: {e}")

        # === SELLER INFO ===
        try:
            seller_name_el = await page.query_selector('div.username-info-area h5, div.storeInfo h4')
            if seller_name_el:
                data['seller_name'] = (await seller_name_el.inner_text()).strip()

            phone_el = await page.query_selector('a.pretty-phone-part.show, div.phones-container a')
            if phone_el:
                phone_text = (await phone_el.inner_text()).strip()
                data['seller_phone'] = phone_text
        except Exception as e:
            print(f"  [!] Seller info extraction error: {e}")

        # === COORDINATES (from map/scripts) ===
        try:
            # Method 1: Try data attributes on map element
            map_el = await page.query_selector('div#gmap, div.map-wrapper, div[data-lat], div[data-lng]')
            if map_el:
                lat = await map_el.get_attribute('data-lat')
                lng = await map_el.get_attribute('data-lng')
                if lat and lng:
                    data['latitude'] = float(lat)
                    data['longitude'] = float(lng)

            # Method 2: Extract from JavaScript in page
            if 'latitude' not in data:
                coords_script = await page.evaluate('''() => {
                    // Try window variables
                    if (window.lat && window.lng) {
                        return {lat: window.lat, lng: window.lng};
                    }
                    if (window.classifiedLat && window.classifiedLng) {
                        return {lat: window.classifiedLat, lng: window.classifiedLng};
                    }
                    // Search in page content for coordinate patterns
                    const html = document.documentElement.innerHTML;
                    // Pattern: "lat":38.xxx,"lng":27.xxx or lat:38.xxx,lng:27.xxx
                    const latMatch = html.match(/"?lat"?\\s*[:=]\\s*([\\d.]+)/i);
                    const lngMatch = html.match(/"?lng"?\\s*[:=]\\s*([\\d.]+)/i);
                    if (latMatch && lngMatch) {
                        return {lat: parseFloat(latMatch[1]), lng: parseFloat(lngMatch[1])};
                    }
                    // Pattern: LatLng(38.xxx, 27.xxx)
                    const latlngMatch = html.match(/LatLng\\s*\\(\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*\\)/);
                    if (latlngMatch) {
                        return {lat: parseFloat(latlngMatch[1]), lng: parseFloat(latlngMatch[2])};
                    }
                    // Pattern in Google Maps URL
                    const gmapMatch = html.match(/maps.*?[@?]([\\d.]+),([\\d.]+)/);
                    if (gmapMatch) {
                        return {lat: parseFloat(gmapMatch[1]), lng: parseFloat(gmapMatch[2])};
                    }
                    return null;
                }''')
                if coords_script and coords_script.get('lat') and coords_script.get('lng'):
                    lat_val = coords_script['lat']
                    lng_val = coords_script['lng']
                    # Validate coordinates are in Turkey range (roughly 36-42 lat, 26-45 lng)
                    if 35 < lat_val < 43 and 25 < lng_val < 46:
                        data['latitude'] = lat_val
                        data['longitude'] = lng_val
                        print(f"  [+] Found coordinates: {lat_val}, {lng_val}")
        except Exception as e:
            print(f"  [!] Coordinates extraction error: {e}")

        # === FEATURES/AMENITIES ===
        try:
            features = []
            feature_items = await page.query_selector_all('ul.classifiedProperties li')
            for item in feature_items:
                feature_text = (await item.inner_text()).strip()
                if feature_text:
                    features.append(feature_text)
            if features:
                data['features'] = features
        except Exception as e:
            print(f"  [!] Features extraction error: {e}")

        # Mark as enriched
        data['enriched'] = True
        data['enriched_at'] = datetime.now(timezone.utc).isoformat()

        return data

    async def enrich_item(self, listing_id, existing_data):
        """Enrich a single item with detail page data"""
        url = existing_data.get('url')
        if not url:
            print(f"  [!] No URL for listing {listing_id}")
            return None

        print(f"\n[Enriching] {listing_id}")
        print(f"  URL: {url}")

        browser, context, page = await self.create_fresh_context()

        try:
            try:
                await page.goto(url, wait_until='domcontentloaded', timeout=90000)
            except Exception as e:
                print(f"  [-] Page load error: {e}")
                return None

            # Wait a bit for dynamic content
            await asyncio.sleep(5)

            try:
                title = await page.title()
            except:
                title = ""

            # Check for block page with safer approach
            try:
                if title == '' or 'Olağandışı' in title:
                    body_el = await page.query_selector('body')
                    if body_el:
                        body_text = await body_el.inner_text()
                        if 'Olağandışı' in body_text:
                            print(f"  [!] BLOCKED by Sahibinden!")
                            return None
            except Exception as e:
                print(f"  [!] Block check error: {e}")

            # Cloudflare check
            if title and ('Bir dakika' in title or 'moment' in title.lower()):
                print(f"  [CF] Cloudflare detected, waiting...")
                if not await self.wait_for_cloudflare(page):
                    print(f"  [!] Cloudflare challenge failed!")
                    return None
                try:
                    title = await page.title()
                except:
                    title = "Unknown"

            print(f"  [+] Loaded: {title[:50] if title else 'No title'}...")

            # Scroll to load lazy content
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight / 3)")
            await asyncio.sleep(1)
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight / 2)")
            await asyncio.sleep(1)

            # Extract detail data
            detail_data = await self.extract_detail_data(page)

            # Merge with existing data (detail data takes priority)
            merged_data = {**existing_data, **detail_data}

            print(f"  [+] Extracted {len(detail_data)} new fields")

            return merged_data

        finally:
            await browser.close()

    def get_items_to_enrich(self):
        """Get list of items that need enrichment"""
        if not self.redis_client:
            return []

        pattern = f"crawl4ai:{self.crawler_name}:*"
        keys = self.redis_client.keys(pattern)

        items = []
        for key in keys:
            key_str = key.decode('utf-8') if isinstance(key, bytes) else key
            if '_init' in key_str or '_state' in key_str:
                continue

            try:
                data = self.redis_client.get(key)
                if data:
                    item = json.loads(data)
                    # Skip if already enriched
                    if self.skip_enriched and item.get('enriched'):
                        continue
                    items.append((key_str, item))
            except:
                continue

        print(f"[+] Found {len(items)} items to enrich (skipping enriched: {self.skip_enriched})")
        return items[:self.max_items]

    async def run(self):
        """Main enrichment loop"""
        await self.init_redis()
        await self.init_playwright()

        try:
            items = self.get_items_to_enrich()

            if not items:
                print("[!] No items to enrich")
                return

            for i, (key, existing_data) in enumerate(items, 1):
                listing_id = key.split(':')[-1]
                print(f"\n{'='*60}")
                print(f"[{i}/{len(items)}] Processing {listing_id}")

                try:
                    enriched_data = await self.enrich_item(listing_id, existing_data)

                    if enriched_data:
                        # Save back to Redis
                        self.redis_client.set(key, json.dumps(enriched_data, ensure_ascii=False))
                        self.enriched_count += 1
                        print(f"  [✓] Saved enriched data")
                    else:
                        self.failed_count += 1
                        print(f"  [✗] Failed to enrich")

                except Exception as e:
                    print(f"  [!] Error: {e}")
                    self.failed_count += 1

                # Rate limit
                if i < len(items):
                    await self.random_delay()

            print(f"\n{'='*60}")
            print(f"ENRICHMENT COMPLETE")
            print(f"{'='*60}")
            print(f"Enriched: {self.enriched_count}")
            print(f"Failed: {self.failed_count}")

        finally:
            pass


async def main():
    import argparse

    parser = argparse.ArgumentParser(description='Sahibinden Detail Enricher')
    parser.add_argument('--name', '-n', required=True, help='Crawler name (e.g., IZMIR_SATILIK_KONUT)')
    parser.add_argument('--max', '-m', type=int, default=100, help='Maximum items to enrich (default: 100)')
    parser.add_argument('--force', '-f', action='store_true', help='Re-enrich already enriched items')

    args = parser.parse_args()

    print(f"[+] Starting enricher for: {args.name}")
    print(f"[+] Max items: {args.max}")
    print(f"[+] Force re-enrich: {args.force}")

    enricher = SahibindenDetailEnricher(
        crawler_name=args.name,
        max_items=args.max,
        skip_enriched=not args.force
    )
    await enricher.run()


if __name__ == '__main__':
    asyncio.run(main())
