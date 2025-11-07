import asyncio
import json
import re
import sys
import os
from datetime import datetime
from urllib.parse import urljoin, urlparse
from pathlib import Path

# Set UTF-8 encoding for Windows
if os.name == 'nt':
    os.system('chcp 65001')

from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
from dotenv import load_dotenv

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    print("[WARNING] Redis not installed. Install with: pip install redis")

# Load .env.lsemb from root directory
env_path = Path(__file__).parent.parent.parent.parent / '.env.lsemb'
load_dotenv(dotenv_path=env_path)

# --- IMSDB Configuration ---
STATE_FILE = "imsdb_crawler_state.json"
OUTPUT_DIR = Path("output/imsdb")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', '6379'))
REDIS_DB = int(os.getenv('REDIS_DB', '2'))  # Read from .env.lsemb
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD')
REDIS_PREFIX = "crawl4ai:imsdb_crawler"

default_start_url = "https://imsdb.com/all-scripts.html"
# --- End of Configuration ---

# Initialize Redis if available
redis_client = None
if REDIS_AVAILABLE:
    try:
        redis_config = {
            'host': REDIS_HOST,
            'port': REDIS_PORT,
            'db': REDIS_DB,
            'decode_responses': True
        }
        if REDIS_PASSWORD:
            redis_config['password'] = REDIS_PASSWORD

        redis_client = redis.Redis(**redis_config)
        redis_client.ping()
        print(f"✅ Connected to Redis at {REDIS_HOST}:{REDIS_PORT} DB {REDIS_DB}")
    except Exception as e:
        print(f"[WARNING] Redis connection failed: {e} - continuing with file-only output")
        redis_client = None

async def get_text_or_none(locator, timeout=5000):
    try:
        return await locator.first.inner_text(timeout=timeout)
    except:
        return None

async def get_attr_or_none(locator, attr, timeout=5000):
    try:
        return await locator.first.get_attribute(attr, timeout=timeout)
    except:
        return None

async def close_popups_and_ads(page):
    """Close any popups, ads, or modals that might block scraping"""
    try:
        # Close common popup patterns
        close_buttons = [
            'button[aria-label="Close"]',
            'button.close',
            '.close-button',
            'button[class*="close"]',
            '[role="button"][aria-label*="close"]',
            '[class*="modal-close"]',
            '[class*="popup-close"]',
            'button[onclick*="close"]',
            'a[href*="close"]',
        ]

        for selector in close_buttons:
            try:
                button = page.locator(selector).first
                if await button.is_visible(timeout=1000):
                    await button.click(timeout=5000)
                    await page.wait_for_timeout(500)
            except:
                pass

        # Close by clicking outside modal (on backdrop)
        try:
            backdrop = page.locator('[class*="backdrop"], [class*="modal-backdrop"], [class*="overlay"]').first
            if await backdrop.is_visible(timeout=1000):
                # Click top-left to close
                await backdrop.click(position={"x": 50, "y": 50})
                await page.wait_for_timeout(500)
        except:
            pass

        # Remove common ad containers
        ad_selectors = [
            '[id*="ad"], [id*="advertisement"]',
            '[class*="ad-"], [class*="advertisement"]',
            '[class*="popup"], [class*="modal"]',
            'iframe[src*="ads"], iframe[src*="doubleclick"]',
            '.ad-container, .ads-container',
        ]

        for selector in ad_selectors:
            try:
                elements = await page.locator(selector).all()
                for elem in elements:
                    try:
                        await elem.evaluate('el => el.remove()')
                    except:
                        pass
            except:
                pass

    except Exception as e:
        pass  # Silently continue if popup closing fails

async def extract_level1_links(page, url):
    """
    LEVEL 1: Extract all movie script links from the list page
    https://imsdb.com/all-scripts.html
    """
    print(f"\n[LEVEL 1] Scanning list page for movie links...")
    try:
        script_links = []

        # Find all links in the table that point to movie script pages
        # Typically: /Movie%20Scripts/Movie%20Title%20Script.html
        all_links = await page.locator('a').evaluate_all(
            "(elements) => elements.map(el => ({ href: el.href, text: el.innerText }))"
        )

        # Filter for movie script links (contains /Movie%20Scripts/ or /scripts/)
        for link_info in all_links:
            href = link_info.get('href', '')
            text = link_info.get('text', '')

            # Look for links in the Movie Scripts section
            if '/Movie%20Scripts/' in href and 'Script' in href:
                full_url = urljoin(url, href)
                if full_url not in script_links:
                    script_links.append(full_url)

        print(f"  - [FOUND] {len(script_links)} movie script links")
        return script_links

    except Exception as e:
        print(f"  - [ERROR] Error extracting level 1 links: {str(e)[:100]}")
        return []

async def extract_level2_link(page, url):
    """
    LEVEL 2: Extract script link AND metadata from intermediate movie page
    Returns: (script_url, metadata_dict)
    Metadata includes: writers, genres, script_date, movie_release_date, imdb_rating, poster_url
    """
    print(f"[LEVEL 2] Scanning intermediate page for script link and metadata...")

    # Extract metadata from the page
    metadata = {}

    try:
        # Extract Writers
        writers_text = await get_text_or_none(page.locator('b:has-text("Writers")').locator('xpath=following-sibling::text()[1]'))
        if writers_text:
            metadata['writers'] = [w.strip() for w in writers_text.split('\n') if w.strip()]

        # Extract Genres
        genres_text = await get_text_or_none(page.locator('b:has-text("Genres")').locator('xpath=following-sibling::text()[1]'))
        if genres_text:
            metadata['genres'] = [g.strip() for g in genres_text.split() if g.strip()]

        # Extract Script Date
        script_date = await get_text_or_none(page.locator('b:has-text("Script Date")').locator('xpath=following-sibling::text()[1]'))
        if script_date:
            metadata['script_date'] = script_date.strip()

        # Extract Movie Release Date
        release_date = await get_text_or_none(page.locator('b:has-text("Movie Release Date")').locator('xpath=following-sibling::text()[1]'))
        if release_date:
            metadata['movie_release_date'] = release_date.strip()

        # Extract IMDb Rating
        imdb_rating = await get_text_or_none(page.locator('b:has-text("IMSDb rating")').locator('xpath=following-sibling::text()[1]'))
        if imdb_rating:
            metadata['imsdb_rating'] = imdb_rating.strip()

        # Extract User Rating
        user_rating = await get_text_or_none(page.locator('b:has-text("Average user rating")').locator('xpath=following-sibling::text()[1]'))
        if user_rating:
            metadata['user_rating'] = user_rating.strip()

        # Extract Poster Image URL if available
        try:
            poster_img = await page.locator('img[src*="poster"]').first.get_attribute('src', timeout=2000)
            if poster_img:
                metadata['poster_url'] = urljoin(url, poster_img)
        except:
            pass

        print(f"  - [METADATA] Extracted: writers={len(metadata.get('writers', []))}, genres={len(metadata.get('genres', []))}")

    except Exception as e:
        print(f"  - [WARNING] Error extracting metadata: {str(e)[:100]}")

    # Now extract script link
    try:
        # PRIMARY: Look for link in tbody after #script-comments table
        # The structure is: table#script-comments... followed by tbody with the actual script link
        try:
            # Find the tbody that comes after #script-comments table
            tbody_links = await page.locator('table#script-comments ~ tbody a, table#script-comments + tbody a').evaluate_all(
                "(elements) => elements.map(el => ({ href: el.href, text: el.innerText }))"
            )

            if tbody_links:
                for link_info in tbody_links:
                    href = link_info.get('href', '')
                    text = link_info.get('text', '').strip()
                    if '/scripts/' in href and '.html' in href:
                        full_url = urljoin(url, href)
                        print(f"  - [FOUND] Script link (from #script-comments tbody): {text[:50]}")
                        return (full_url, metadata)

        except Exception as e:
            print(f"  - [DEBUG] Could not find link in #script-comments tbody: {str(e)[:80]}")

        # FALLBACK: Look for all links in tbody elements
        try:
            all_tbody_links = await page.locator('tbody a').evaluate_all(
                "(elements) => elements.map(el => ({ href: el.href, text: el.innerText }))"
            )

            script_links = []
            for link_info in all_tbody_links:
                href = link_info.get('href', '')
                text = link_info.get('text', '').strip()

                if '/scripts/' in href and '.html' in href:
                    full_url = urljoin(url, href)
                    if full_url not in script_links:
                        script_links.append(full_url)
                        print(f"  - [FOUND] Script link (from tbody): {text[:50]}")

            if script_links:
                return (script_links[0], metadata)

        except Exception as e:
            print(f"  - [DEBUG] Could not find link in tbody: {str(e)[:80]}")

        # LAST RESORT: Look for all links in the page
        try:
            all_links = await page.locator('a').evaluate_all(
                "(elements) => elements.map(el => ({ href: el.href, text: el.innerText }))"
            )

            script_links = []
            for link_info in all_links:
                href = link_info.get('href', '')
                text = link_info.get('text', '').strip()

                # Look for links like /scripts/TITLE.html
                if '/scripts/' in href and '.html' in href:
                    full_url = urljoin(url, href)
                    if full_url not in script_links:
                        script_links.append(full_url)

            if script_links:
                print(f"  - [FOUND] Script link (from all links): {len(script_links)} candidates, using first")
                return (script_links[0], metadata)

        except Exception as e:
            print(f"  - [DEBUG] Could not find link in all links: {str(e)[:80]}")

        print(f"  - [ERROR] No script link found in any location")
        return (None, metadata)

    except Exception as e:
        print(f"  - [ERROR] Error extracting level 2 link: {str(e)[:100]}")
        return (None, metadata)

def extract_writers(script_text):
    """
    Extract writer names from script text.
    Looks for patterns like:
    - "Written by John Collee & Peter Weir"
    - "by William Hjortsberg"
    - "screenplay by ..., story by ..."
    """
    if not script_text or len(script_text) < 100:
        return []

    writers = []

    try:
        # Search in first 1000 characters for efficiency
        first_part = script_text[:1000]

        # Pattern 1: "Written by" followed by author names
        match = re.search(
            r'(?:Written by|written by|WRITTEN BY)\s*\n?\s*([A-Za-z\s,&\-\.]+?)(?:\n\n|\n$)',
            first_part,
            re.IGNORECASE | re.MULTILINE
        )
        if match:
            writer_str = match.group(1).strip()
            # Clean up: remove extra whitespace, split by & or comma
            writer_str = re.sub(r'\s+', ' ', writer_str)  # Normalize whitespace
            # Split by & or "and" or comma
            writer_parts = re.split(r'\s*(?:&|,|and)\s*', writer_str, flags=re.IGNORECASE)
            for part in writer_parts:
                part = part.strip()
                if part and len(part) > 2 and len(part) < 100:
                    writers.append(part)

        # Pattern 2: "screenplay by" if not found yet
        if not writers:
            match = re.search(
                r'(?:screenplay by|SCREENPLAY BY)\s*([A-Za-z\s,&\-\.]+?)(?:\n|$)',
                first_part,
                re.IGNORECASE
            )
            if match:
                writer_str = match.group(1).strip()
                writer_str = re.sub(r'\s+', ' ', writer_str)
                writer_parts = re.split(r'\s*(?:&|,|and)\s*', writer_str, flags=re.IGNORECASE)
                for part in writer_parts:
                    part = part.strip()
                    if part and len(part) > 2 and len(part) < 100:
                        writers.append(part)

        # Remove duplicates while preserving order
        seen = set()
        unique_writers = []
        for w in writers:
            if w.lower() not in seen:
                seen.add(w.lower())
                unique_writers.append(w)

        return unique_writers[:5]  # Max 5 writers

    except:
        return []

async def extract_level3_script(page, url):
    """
    LEVEL 3: Extract script text and metadata from actual script page
    https://imsdb.com/scripts/10-Things-I-Hate-About-You.html
    """
    print(f"[LEVEL 3] Extracting script and metadata...")

    try:
        script_data = {
            "url": url,
            "title": None,
            "genre": None,
            "writers": [],
            "characters": [],
            "script_text": None,
            "crawled_at": datetime.now().isoformat()
        }

        # Extract title - PREFER URL extraction to avoid generic page titles
        url_path = urlparse(url).path
        # /scripts/Legend.html -> Legend
        title_from_url = url_path.split('/')[-1].replace('.html', '').replace('-', ' ').strip()

        title_elem = None

        # Try h1 or h2 if it looks like a real title (not generic)
        try:
            title_elem = await get_text_or_none(page.locator('h1'))
            if title_elem and len(title_elem) < 100 and 'IMSDb' not in title_elem:
                title_elem = title_elem.strip()
            else:
                title_elem = None
        except:
            pass

        # Try h2
        if not title_elem:
            try:
                title_elem = await get_text_or_none(page.locator('h2'))
                if title_elem and len(title_elem) < 100 and 'IMSDb' not in title_elem:
                    title_elem = title_elem.strip()
                else:
                    title_elem = None
            except:
                pass

        # If no good title found, use URL-based title (most reliable)
        if not title_elem:
            title_elem = title_from_url

        script_data['title'] = title_elem if title_elem else "Unknown"

        # Extract script text using multiple fallback selectors
        script_text = None

        # Try #scrtext
        try:
            script_text = await get_text_or_none(page.locator('#scrtext'), timeout=10000)
        except:
            pass

        # Try pre element
        if not script_text:
            try:
                script_text = await get_text_or_none(page.locator('pre'), timeout=10000)
            except:
                pass

        # Try .script-text or similar classes
        if not script_text:
            try:
                all_elements = await page.locator('div[class*="script"], div[class*="text"]').evaluate_all(
                    "(elements) => elements.map(el => el.innerText)"
                )
                if all_elements and all_elements[0]:
                    script_text = all_elements[0]
            except:
                pass

        # Try getting body text if very large (likely the script)
        if not script_text:
            try:
                body_text = await get_text_or_none(page.locator('body'), timeout=10000)
                if body_text and len(body_text) > 10000:
                    script_text = body_text
            except:
                pass

        if script_text:
            script_data['script_text'] = script_text
            print(f"  - [EXTRACTED] Script text: {len(script_text)} characters")
        else:
            print(f"  - [WARNING] Could not extract script text with any selector")

        # Extract writer info using improved parsing
        writers = extract_writers(script_text) if script_text else []
        if writers:
            script_data['writers'] = writers
            print(f"  - [EXTRACTED] Writers: {', '.join(writers)}")

        # Try to extract character names from script
        if script_text and len(script_text) > 1000:
            try:
                # Look for character names: all caps followed by dialogue (indented or in parentheses)
                character_pattern = r'^\s{20,}([A-Z][A-Z\s\-\'\.]+?)\s*$'
                characters = set()

                # Scene headings and transitions to filter out
                scene_keywords = {
                    'INT', 'EXT', 'INTERIOR', 'EXTERIOR', 'CONTINUED', 'CUT TO', 'FADE TO',
                    'FADE IN', 'FADE OUT', 'DISSOLVE TO', 'MATCH CUT', 'SMASH CUT',
                    'JUMP CUT', 'MONTAGE', 'FLASHBACK', 'TITLE', 'CREDITS', 'THE END',
                    'ACT', 'SCENE', 'ANGLE ON', 'CLOSE ON', 'POV', 'INSERT', 'BACK TO',
                    'LATER', 'MOMENTS LATER', 'SAME TIME', 'MEANWHILE', 'NIGHT', 'DAY',
                    'MORNING', 'EVENING', 'DAWN', 'DUSK', 'CONTINUOUS'
                }

                for match in re.finditer(character_pattern, script_text[:50000], re.MULTILINE):
                    char_name = match.group(1).strip()

                    # Clean up character name (remove parentheticals like (V.O.), (O.S.))
                    char_name = re.sub(r'\s*\([^)]*\)\s*', '', char_name).strip()

                    # Filter out false positives
                    if (2 < len(char_name) < 30 and  # Reasonable length
                        not any(keyword in char_name.upper() for keyword in scene_keywords) and  # Not a scene heading
                        not char_name.startswith('.') and  # Not a scene number
                        not re.search(r'\d{2,}', char_name) and  # Not containing multiple digits
                        not re.match(r'^[A-Z]+\s*-\s*[A-Z]+$', char_name) and  # Not "INT - ROOM" format
                        char_name.count(' ') < 3):  # Not too many words (likely scene description)
                        characters.add(char_name)

                if characters:
                    script_data['characters'] = sorted(list(characters))[:30]  # Increased from 20 to 30
                    print(f"  - [EXTRACTED] {len(script_data['characters'])} characters")
            except:
                pass

        return script_data

    except Exception as e:
        print(f"  - [ERROR] Error extracting level 3 data: {str(e)[:100]}")
        import traceback
        try:
            print(f"[DEBUG] {traceback.format_exc()[:300]}")
        except:
            pass
        return None

async def save_script_data(script_data):
    """Save extracted script data to JSON file and Redis (if available)"""
    try:
        if not script_data or not script_data.get('title'):
            print(f"  - [ERROR] No valid data to save")
            return False

        # Create safe filename from title
        safe_title = re.sub(r'[<>:"/\\|?*]', '', script_data['title'])
        safe_title = safe_title.replace(' ', '_')[:80]
        filename = f"{safe_title}.json"
        filepath = OUTPUT_DIR / filename

        # Save to JSON file
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(script_data, f, ensure_ascii=False, indent=2)

        print(f"  - [SAVED] JSON: {filepath}")

        # Save to Redis if available
        if redis_client:
            try:
                # Create a safe Redis key from the title
                redis_key = f"{REDIS_PREFIX}:{safe_title}"
                # Convert script_data to JSON string for Redis storage
                redis_value = json.dumps(script_data, ensure_ascii=False)
                # Save to Redis
                redis_client.set(redis_key, redis_value)
                print(f"  - [REDIS] Saved: {redis_key}")
            except Exception as redis_error:
                print(f"  - [REDIS_ERROR] Could not save to Redis: {str(redis_error)[:80]}")
                # Continue anyway - don't fail if Redis is having issues

        return True

    except Exception as e:
        print(f"  - [ERROR] Error saving script data: {str(e)[:100]}")
        return False

def save_state(level1_queue, level2_queue, level3_queue, visited, failed_urls=None):
    """Save crawler state for resuming"""
    state_data = {
        "level1_queue": level1_queue,
        "level2_queue": level2_queue,
        "level3_queue": level3_queue,
        "visited": list(visited),
        "failed_urls": failed_urls or []
    }
    with open(STATE_FILE, 'w') as f:
        json.dump(state_data, f)

def load_state():
    """Load crawler state for resuming"""
    try:
        with open(STATE_FILE, 'r') as f:
            state = json.load(f)
            return (
                state.get("level1_queue", []),
                state.get("level2_queue", []),
                state.get("level3_queue", []),
                set(state.get("visited", [])),
                state.get("failed_urls", [])
            )
    except FileNotFoundError:
        return [], [], [], set(), []

async def main():
    # Start URL can be passed as argument
    start_url = sys.argv[1] if len(sys.argv) > 1 else default_start_url

    # Load or initialize state
    level1_queue, level2_queue, level3_queue, visited, failed_urls = load_state()

    if not level1_queue and not level2_queue and not level3_queue:
        # First run - start with the list page
        level1_queue = [start_url]
        level2_queue = []
        level3_queue = []
        visited = set()
        failed_urls = []

    async with async_playwright() as p:
        try:
            browser = await p.chromium.launch(headless=False)
            page = await browser.new_page()

            # Helper function to ensure page is alive
            async def ensure_page():
                nonlocal page
                try:
                    # Check if page is already valid
                    if page and not page.is_closed():
                        return True
                except:
                    pass

                try:
                    page = await browser.new_page()
                    return True
                except Exception as e:
                    print(f"[DEBUG] Could not create new page: {e}")
                    return False

            # PHASE 1: Extract all movie links from list page
            if level1_queue:
                print(f"\n{'='*60}")
                print(f"PHASE 1: Extracting movie links from list page")
                print(f"{'='*60}")

                for list_url in level1_queue:
                    if list_url in visited:
                        continue

                    visited.add(list_url)

                    try:
                        if not await ensure_page():
                            print(f"  - [ERROR] Could not create page")
                            failed_urls.append(list_url)
                            continue

                        print(f"\n[WEB] {list_url}")
                        await page.goto(list_url, wait_until="domcontentloaded", timeout=30000)
                        await close_popups_and_ads(page)
                        await page.wait_for_timeout(2000)

                        movie_links = await extract_level1_links(page, list_url)
                        level2_queue.extend(movie_links)
                        print(f"  - [INFO] Added {len(movie_links)} movies to queue. Total: {len(level2_queue)}")

                    except PlaywrightTimeoutError:
                        print(f"  - [TIMEOUT] Page load timeout")
                        failed_urls.append(list_url)
                    except Exception as e:
                        print(f"  - [ERROR] {str(e)[:100]}")
                        failed_urls.append(list_url)

                level1_queue = []

            # PHASE 2: Extract script links from intermediate pages
            if level2_queue:
                print(f"\n{'='*60}")
                print(f"PHASE 2: Extracting script links from intermediate pages")
                print(f"{'='*60}")
                print(f"Queue size: {len(level2_queue)}")

                processed_urls = []
                for idx, movie_url in enumerate(level2_queue, 1):
                    if movie_url in visited:
                        processed_urls.append(movie_url)
                        continue

                    try:
                        if not await ensure_page():
                            print(f"  - [ERROR] Could not create page")
                            failed_urls.append(movie_url)
                            continue

                        print(f"\n[{idx}/{len(level2_queue)}] [WEB] {movie_url[:80]}...")
                        await page.goto(movie_url, wait_until="domcontentloaded", timeout=30000)
                        await close_popups_and_ads(page)
                        await page.wait_for_timeout(1500)

                        script_url, page_metadata = await extract_level2_link(page, movie_url)
                        if script_url:
                            if script_url in visited:
                                print(f"  - [INFO] Script already visited: {script_url[:60]}")
                            else:
                                # Add as dictionary with metadata
                                level3_queue.append({'url': script_url, 'metadata': page_metadata})
                                print(f"  - [INFO] Added to Level 3 queue: {script_url[:60]}")
                        else:
                            print(f"  - [WARNING] No script URL returned")

                        # Only mark as visited after successful processing
                        visited.add(movie_url)
                        processed_urls.append(movie_url)

                    except PlaywrightTimeoutError:
                        print(f"  - [TIMEOUT] Page load timeout")
                        failed_urls.append(movie_url)
                    except Exception as e:
                        error_str = str(e).lower()
                        if "closed" in error_str or "crashed" in error_str:
                            print(f"  - [ERROR] Browser closed/crashed, recovering...")
                        else:
                            print(f"  - [ERROR] {str(e)[:100]}")
                        failed_urls.append(movie_url)

                    await asyncio.sleep(0.5)  # Be nice to the server

                    # Save state periodically (every 10 URLs)
                    if len(processed_urls) % 10 == 0:
                        remaining_queue = [url for url in level2_queue if url not in processed_urls]
                        save_state([], remaining_queue, level3_queue, visited, failed_urls)

                # Clear processed URLs from queue
                level2_queue = [url for url in level2_queue if url not in processed_urls]

            # PHASE 3: Extract script text and metadata
            if level3_queue:
                print(f"\n{'='*60}")
                print(f"PHASE 3: Extracting script text and metadata")
                print(f"{'='*60}")
                print(f"Queue size: {len(level3_queue)}")

                processed_urls = []
                for idx, item in enumerate(level3_queue, 1):
                    # Handle both old string format and new dict format
                    if isinstance(item, dict):
                        script_url = item['url']
                        page_metadata = item.get('metadata', {})
                    else:
                        script_url = item
                        page_metadata = {}

                    if script_url in visited:
                        processed_urls.append(script_url)
                        continue

                    try:
                        if not await ensure_page():
                            print(f"  - [ERROR] Could not create page")
                            failed_urls.append(script_url)
                            continue

                        print(f"\n[{idx}/{len(level3_queue)}] [WEB] {script_url[:80]}...")
                        await page.goto(script_url, wait_until="domcontentloaded", timeout=30000)
                        await close_popups_and_ads(page)
                        await page.wait_for_timeout(1500)

                        script_data = await extract_level3_script(page, script_url)

                        if script_data:
                            # Merge page metadata into script_data
                            if page_metadata:
                                script_data.update(page_metadata)
                                print(f"  - [METADATA] Added: writers={len(page_metadata.get('writers', []))}, genres={len(page_metadata.get('genres', []))}")

                            success = await save_script_data(script_data)
                            if success:
                                print(f"  - [SUCCESS] Script saved with metadata")

                        # Only mark as visited after successful processing
                        visited.add(script_url)
                        processed_urls.append(script_url)

                    except PlaywrightTimeoutError:
                        print(f"  - [TIMEOUT] Page load timeout")
                        failed_urls.append(script_url)
                    except Exception as e:
                        error_str = str(e).lower()
                        if "closed" in error_str or "crashed" in error_str:
                            print(f"  - [ERROR] Browser closed/crashed, recovering...")
                        else:
                            print(f"  - [ERROR] {str(e)[:100]}")
                        failed_urls.append(script_url)

                    await asyncio.sleep(0.5)  # Be nice to the server

                    # Save state periodically (every 10 URLs)
                    if len(processed_urls) % 10 == 0:
                        remaining_queue = [url for url in level3_queue if url not in processed_urls]
                        save_state([], [], remaining_queue, visited, failed_urls)

                # Clear processed URLs from queue
                level3_queue = [url for url in level3_queue if url not in processed_urls]

        except Exception as main_error:
            print(f"[CRITICAL] {str(main_error)[:200]}")
            import traceback
            print(traceback.format_exc()[:500])

        finally:
            try:
                if page and not page.is_closed():
                    await page.close()
            except:
                pass
            try:
                await browser.close()
            except:
                pass
            save_state(level1_queue, level2_queue, level3_queue, visited, failed_urls)

            print(f"\n{'='*60}")
            print(f"CRAWLING COMPLETE")
            print(f"{'='*60}")
            print(f"Visited: {len(visited)}")
            print(f"Failed: {len(failed_urls)}")
            print(f"Output directory: {OUTPUT_DIR}")
            print(f"State saved for resuming")

if __name__ == "__main__":
    asyncio.run(main())
