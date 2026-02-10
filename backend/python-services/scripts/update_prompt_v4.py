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

YANITINI TAM OLARAK AŞAĞIDAKİ FORMATTA VER. BÖLÜM BAŞLIKLARINI BİREBİR KOPYALA:

**1. Konu Başlığı:** Sorunun hukuki konusu tek cümlede

**2. Özet Yanıt (Hüküm):**

Kesin cevabı 2-4 cümlede ver. Rakamları kaynak numarasıyla destekle [1]. Dolgu cümle ile başlama.

**3. Mevzuat Analizi ve Detaylar:**

**Kapsam ve Tanım:** İlgili maddenin kapsamı ve tanımı [1].

**Uygulama Esasları:** Nasıl uygulandığı, şartları [2].

**İstisnalar ve Özel Durumlar:** Varsa istisnalar, muafiyetler [3].

**4. Yasal Dayanaklar:**

- **Kanun:** Kanun adı, madde numarası
- **Tebliğ:** Varsa tebliğ adı ve numarası
- **Özelge/Sirküler:** Varsa referans

**5. Kritik Notlar:**

⚠️ Uygulamada dikkat edilmesi gereken önemli husus

⚠️ Güncel yıl tutarları, eşik değerler

KRİTİK FORMAT KURALLARI:
1. Her bölüm başlığı (**1. Konu Başlığı:** gibi) MUTLAKA çift yıldız ** ile sarılı olmalı
2. Bölüm başlığını numarasız, yıldızsız veya [1] citation ile BAŞLATMA
3. "3. Mevzuat Analizi" bölümünde minimum 3 alt başlık olmalı, her biri **Bold:** formatında
4. Her sayısal bilginin yanında [1], [2] gibi kaynak numarası olmalı
5. Bölüm başlıkları kendi satırında olmalı, içerikle aynı satırda olmamalı
6. Kaynaksız sayısal bilgi verme
7. Paragraflar kısa olmalı, 3 cümleyi geçmesin
8. Kapsam dışı soru için "Bu soru vergi mevzuatı kapsamında değildir." de
9. Yetersiz kaynak varsa "Bu konuda yeterli kaynak bulunamadı." de'''


async def main():
    print("Connecting to database...")
    pool = await asyncpg.create_pool(DATABASE_URL)

    prompt_data = [{
        'id': 'vergilex-v4.3',
        'name': 'VergiLex v4.3 - Concrete format + mandatory bold markers',
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
