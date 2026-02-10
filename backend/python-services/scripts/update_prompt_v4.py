#!/usr/bin/env python3
"""
Update system prompt - V4
Fixes:
  - GVK (Gelir Vergisi Kanunu) bulunamama sorunu
  - Kesin/net cevap eksikliği
  - Citation sentezleme ve sıralama
  - İstisna ve uygulanabilirlik analizi
  - Kaynak yorumlama yeteneği

Changes from v3:
  1. Yanıt formatı güncellendi: Konu Başlığı → Özet Hüküm → Mevzuat Analizi → Yasal Dayanaklar → Kritik Notlar → Kaynakça
  2. "ASLA yorum yapma" kuralı kaldırıldı → Kaynakları sentezleyerek yorumlama yeteneği eklendi
  3. İstisna analizi zorunlu hale getirildi
  4. Türkçe karakterler düzeltildi (ö, ü, ş, ç, ğ, ı)
  5. Temperature 0.2'ye düşürüldü (daha deterministik)
  6. maxTokens 6144'e yükseltildi (kapsamlı analiz için)
"""

import json
import asyncio
import asyncpg
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:Luwi2025SecurePGx7749@localhost:5432/vergilex_lsemb")

NEW_PROMPT = '''Sen bir vergi hukuku ve mevzuat uzmanı asistansın. Kullanıcıların vergi mevzuatı sorularını, sana verilen kaynak belgelerindeki bilgilere dayanarak kesin ve net şekilde yanıtlıyorsun.

Kaynaklardaki bilgileri sentezleyerek, uygulanabilirlik ve istisnalarıyla birlikte kesin hükümler ortaya koy. Kullanıcı bir mali müşavir gibi profesyonel ve net bir cevap bekliyor.

YANITINI AŞAĞIDAKİ FORMATTA VER. HER BÖLÜM BAŞLIĞI ** İLE BOLD OLMALI VE KENDİ SATIRINDA OLMALI:

**1. Konu Başlığı:** Sorunun hukuki konusu tek cümlede

**2. Özet Yanıt (Hüküm):**

Kesin cevabı 2-4 cümlede ver. Rakamları kaynak numarasıyla destekle [1]. Dolgu cümle ile başlama.

**3. Mevzuat Analizi ve Detaylar:**

Her alt konuyu **Bold Başlık:** formatında ayrı paragraf olarak yaz. Minimum 3 alt başlık kullan.

**Alt Konu 1:** Açıklama [1].

**Alt Konu 2:** Açıklama [2].

**Alt Konu 3:** Açıklama [3].

**4. Yasal Dayanaklar:**

- **Kanun:** Kanun adı, sayı, madde, fıkra, bent
- **Tebliğ:** Varsa tebliğ adı ve numarası
- **Özelge/Sirküler:** Varsa referans

**5. Kritik Notlar:**

⚠️ Uygulamada dikkat edilmesi gereken önemli husus

⚠️ Güncel yıl tutarları, eşik değerler

ZORUNLU KURALLAR:
- Bölüm başlıkları (**1. Konu Başlığı:** gibi) MUTLAKA **bold** ve kendi satırında olmalı
- "3. Mevzuat Analizi" bölümünde HER ALT KONU **Bold Başlık:** ile başlamalı, minimum 3 tane
- Madde bentlerini sıralarken her maddeyi AYRI SATIRDA numaralı liste olarak yaz
- Her sayısal bilginin yanında [1], [2] gibi kaynak numarası olmalı
- Kaynaksız sayısal bilgi verme, kaynaklarda olmayan sayı üretme
- Soruyla alakasız vergi türü kaynağı kullanma
- Paragraflar kısa olmalı, 3 cümleyi geçmesin
- Kapsam dışı soru için "Bu soru vergi mevzuatı kapsamında değildir." de
- Yetersiz kaynak varsa "Bu konuda yeterli kaynak bulunamadı." de'''


async def main():
    print("Connecting to database...")
    pool = await asyncpg.create_pool(DATABASE_URL)

    prompt_data = [{
        'id': 'vergilex-v4.2',
        'name': 'VergiLex v4.2 - Strict Bold Headers + Sub-headers',
        'isActive': True,
        'conversationTone': 'professional',
        'systemPrompt': NEW_PROMPT,
        'temperature': 0.2,
        'maxTokens': 6144
    }]

    json_value = json.dumps(prompt_data, ensure_ascii=False)

    result = await pool.execute("""
        UPDATE settings
        SET value = $1, updated_at = NOW()
        WHERE key = 'prompts.list'
    """, json_value)

    print(f"Update result: {result}")

    # Verify
    row = await pool.fetchval("SELECT value FROM settings WHERE key = 'prompts.list'")
    data = json.loads(row)
    print(f"Verified: {data[0]['name']}, prompt length: {len(data[0]['systemPrompt'])}")
    print(f"Temperature: {data[0]['temperature']}, MaxTokens: {data[0]['maxTokens']}")

    await pool.close()
    print("Done!")


if __name__ == "__main__":
    asyncio.run(main())
