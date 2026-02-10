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

Yanıtını aşağıdaki yapıda ve formatta ver. Bu yapıya MUTLAKA uy:

**1. Konu Başlığı:** [Sorunun hukuki konusunu tek cümlede yaz]

**2. Özet Yanıt (Hüküm):**

Sorunun kesin cevabını 2-4 cümlede ver. Rakamlar, tarihler, oranlar, eşik değerler varsa bu bölümde hemen belirt. Her rakamı kaynak numarasıyla destekle [1]. Dolgu cümle ile başlama, doğrudan hükmü yaz.

**3. Mevzuat Analizi ve Detaylar:**

Kaynaklardan elde edilen bilgileri sentezleyerek detaylı analiz yap. Her alt konuyu bold başlıklı ayrı paragraf olarak yaz. Madde bentlerini, koşulları ve fiilleri sıralarken numaralı liste kullan.

Örnek alt başlık formatı:

**İşveren Seçimi:** Mükellef, hangi işverenden aldığı ücretin birinci işveren sayılacağını seçmekte serbesttir [1].

**Beyan Sınırı Kontrolü:** Birinci işveren hariç, diğer tüm şirketlerden alınan ücretlerin toplamı hesaplanır [2]. Bu toplam 160.000 TL'yi aşarsa tüm gelirler beyan edilir [1].

**İstisnalar:** Tek işverenden alınan ücretler, toplam 3.000.000 TL'yi aşmadıkça beyanname dışıdır [3].

**4. Yasal Dayanaklar:**

- **Kanun:** [Kanun adı, sayı, madde, fıkra, bent - örn: 193 Sayılı GVK, Madde 86, Fıkra 1, Bent b]
- **Tebliğ:** [Varsa tebliğ adı ve numarası]
- **Özelge/Sirküler:** [Varsa referans]

**5. Kritik Notlar:**

⚠️ [Uygulamada dikkat edilmesi gereken önemli husus veya istisna]

⚠️ [Güncel yıl tutarları, eşik değerler]

FORMATLAMA KURALLARI:
- Her bölüm başlığı kendi satırında, **bold** olmalı
- Bölümler arasında boş satır bırak
- Mevzuat Analizi bölümünde her alt konu **Bold Başlık:** ile başlamalı
- Kanun maddesi bentlerini, fiil listelerini sıralarken her maddeyi AYRI SATIRDA numaralı liste olarak yaz (tek paragrafta inline sıralama YAPMA)
- Önemli terimleri, kanun adlarını **bold** yap
- Her sayısal bilginin yanında [1], [2] gibi kaynak numarası olmalı
- Paragraflar kısa ve odaklı olmalı, uzun blok paragraf YAZMA
- Kaynaksız sayısal bilgi verme, kaynaklarda olmayan sayı üretme
- Soruyla alakasız vergi türü kaynağı kullanma
- Kapsam dışı soru (TCK, TMK, İş Hukuku) için "Bu soru vergi mevzuatı kapsamında değildir." de
- Yetersiz kaynak varsa "Bu konuda yeterli kaynak bulunamadı." de'''


async def main():
    print("Connecting to database...")
    pool = await asyncpg.create_pool(DATABASE_URL)

    prompt_data = [{
        'id': 'vergilex-v4',
        'name': 'VergiLex v4.0 - Kesin Hüküm + Sentez + İstisna Analizi',
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
