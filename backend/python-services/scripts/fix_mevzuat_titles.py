#!/usr/bin/env python3
"""
Fix mevzuat entry titles in Redis
Updates entries that have empty or generic titles with proper extracted titles
"""
import redis
import json
import re

r = redis.Redis(host="localhost", port=6379, db=2)

# Title extraction patterns
title_patterns = [
    # Full law names ending with KANUNU/KANUN
    r'([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s]+(?:KANUNU|KANUN))',
    # Law names with number
    r'(\d+\s*(?:SAYILI|Sayılı)\s+[A-ZÇĞİÖŞÜa-zçğıöşü\s]+(?:KANUNU?|Kanunu?))',
    # Tebliğ names
    r'([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s]+(?:GENEL\s*)?(?:TEBLİĞİ?|Tebliği?))',
    # Yönetmelik names
    r'([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s]+(?:YÖNETMELİĞİ?|Yönetmeliği?))',
    # HAKKINDA KANUN pattern
    r'([A-ZÇĞİÖŞÜa-zçğıöşü\s]+HAKKINDA\s+KANUN)',
]

def extract_title(content, mevzuat_no, source_type):
    """Extract title from content"""
    if not content:
        return None

    # Clean content - replace newlines with spaces
    clean_content = re.sub(r'[\n\r\t]+', ' ', content)
    clean_content = re.sub(r'\s+', ' ', clean_content).strip()

    for pattern in title_patterns:
        match = re.search(pattern, clean_content[:2000], re.IGNORECASE)
        if match:
            title = match.group(1).strip()
            # Clean title
            title = re.sub(r'\s+', ' ', title)
            if len(title) > 10 and len(title) < 200:
                if 'Mevzuat Bilgi Sistemi' not in title:
                    return title

    # Fallback to type + number
    if mevzuat_no:
        if source_type == 'kanun':
            return f'Kanun No: {mevzuat_no}'
        elif source_type == 'teblig':
            return f'Tebliğ No: {mevzuat_no}'
    return None

def main():
    # Get all mevzuat keys
    keys = r.keys('crawl4ai:vergilex_mevzuat:*')
    print(f'Found {len(keys)} mevzuat entries')

    updated = 0
    already_has_title = 0
    no_title_found = 0

    for key in keys:
        try:
            data = json.loads(r.get(key))
            current_title = data.get('title', '')

            # Skip if already has good title
            if current_title and len(current_title) > 5 and 'Mevzuat Bilgi Sistemi' not in current_title:
                already_has_title += 1
                continue

            content = data.get('content', '')
            mevzuat_no = data.get('mevzuat_no', '')
            source_type = data.get('source_type', '')

            new_title = extract_title(content, mevzuat_no, source_type)

            if new_title:
                data['title'] = new_title
                r.set(key, json.dumps(data, ensure_ascii=False))
                updated += 1
                print(f'Updated: {key.decode()} -> {new_title[:60]}...')
            else:
                no_title_found += 1

        except Exception as e:
            print(f'Error processing {key}: {e}')

    print(f'\n=== Summary ===')
    print(f'Already had good title: {already_has_title}')
    print(f'Updated with new title: {updated}')
    print(f'No title could be extracted: {no_title_found}')

if __name__ == '__main__':
    main()
