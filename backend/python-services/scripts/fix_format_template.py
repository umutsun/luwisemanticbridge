#!/usr/bin/env python3
"""
Fix formatTemplate prompt leakage issue

Problem: The formatTemplate in ragRoutingSchema contains example text that
the LLM copies verbatim into responses ("Üç cümle tamamlandı", "Süreç detayları", etc.)

Solution: Update formatTemplate with clean instructions that don't contain
copyable example content.
"""

import json
import asyncio
import asyncpg
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:Luwi2025SecurePGx7749@localhost:5432/vergilex_lsemb")

# Clean formatTemplate - instructions only, no example text to copy
NEW_FORMAT_TEMPLATE = """📚 MARKDOWN FORMATI KURALLARI:

1. BAŞLIK YAPISI:
   - ## ile ana başlık kullan
   - ### ile alt başlık kullan (gerekirse)

2. PARAGRAF KURALLARI:
   - Her paragraftan sonra 1 boş satır bırak
   - Her bölümde 2-4 paragraf olsun
   - Paragraflar 2-4 cümle içersin

3. ATIF KURALLARI:
   - Her bilgi cümlesinin sonuna [1], [2] gibi kaynak numarası ekle
   - Aynı cümlede birden fazla kaynak kullanılabilir [1][2]
   - Atıfsız bilgi verme

4. İÇERİK YAPISI:
   - İlk paragrafta konuyu özetle
   - Orta paragraflarda detayları açıkla
   - Son paragrafta sonuç veya özet ver

5. YASAKLAR:
   - Örnek metin kopyalama
   - Şablon cümleler kullanma
   - "Üç cümle tamamlandı" gibi meta-ifadeler kullanma"""


async def main():
    print("Connecting to database...")
    pool = await asyncpg.create_pool(DATABASE_URL)

    try:
        # Get current ragRoutingSchema
        print("\n📖 Reading current ragRoutingSchema...")
        row = await pool.fetchval("SELECT value FROM settings WHERE key = 'ragRoutingSchema'")

        if not row:
            print("❌ ragRoutingSchema not found in settings!")
            return

        schema = json.loads(row)

        # Show current formatTemplate
        current_template = schema.get('routes', {}).get('FOUND', {}).get('format', {}).get('formatTemplate', '')
        print(f"\n📄 Current formatTemplate:\n{current_template[:500]}...")

        # Update formatTemplate
        print("\n✏️ Updating formatTemplate...")
        if 'routes' not in schema:
            schema['routes'] = {}
        if 'FOUND' not in schema['routes']:
            schema['routes']['FOUND'] = {}
        if 'format' not in schema['routes']['FOUND']:
            schema['routes']['FOUND']['format'] = {}

        schema['routes']['FOUND']['format']['formatTemplate'] = NEW_FORMAT_TEMPLATE

        # Also update English version if it exists
        if 'formatTemplateEn' in schema['routes']['FOUND']['format']:
            schema['routes']['FOUND']['format']['formatTemplateEn'] = """📚 MARKDOWN FORMAT RULES:

1. HEADING STRUCTURE:
   - Use ## for main headings
   - Use ### for subheadings (if needed)

2. PARAGRAPH RULES:
   - Leave 1 blank line after each paragraph
   - Each section should have 2-4 paragraphs
   - Paragraphs should contain 2-4 sentences

3. CITATION RULES:
   - Add source number [1], [2] at the end of each information sentence
   - Multiple sources can be used in the same sentence [1][2]
   - Do not provide information without citations

4. CONTENT STRUCTURE:
   - Summarize the topic in the first paragraph
   - Explain details in middle paragraphs
   - Provide conclusion or summary in the last paragraph

5. PROHIBITIONS:
   - Do not copy example text
   - Do not use template sentences
   - Do not use meta-expressions like "Three sentences completed" """

        # Save updated schema
        json_value = json.dumps(schema, ensure_ascii=False)

        result = await pool.execute("""
            UPDATE settings
            SET value = $1, updated_at = NOW()
            WHERE key = 'ragRoutingSchema'
        """, json_value)

        print(f"✅ Update result: {result}")

        # Verify
        row = await pool.fetchval("SELECT value FROM settings WHERE key = 'ragRoutingSchema'")
        data = json.loads(row)
        new_template = data.get('routes', {}).get('FOUND', {}).get('format', {}).get('formatTemplate', '')
        print(f"\n📋 New formatTemplate:\n{new_template}")

    finally:
        await pool.close()

    print("\n✅ Done!")


if __name__ == "__main__":
    asyncio.run(main())
