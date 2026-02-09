/**
 * Vergilex System Prompt v12.46 - Update Script
 *
 * Bu script, Vergilex için yeni system prompt'u database'e ekler.
 *
 * Kullanım:
 *   node backend/scripts/update-vergilex-prompt.js
 *
 * veya Production'da (SSH ile):
 *   ssh -p 2222 root@49.13.38.58
 *   cd /var/www/vergilex/backend
 *   node scripts/update-vergilex-prompt.js
 */

require("dotenv").config();
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Vergilex System Prompt v12.46 - Direct Answer + Simplified Formatting
const systemPrompt = `Sen Vergilex, Türk vergi mevzuatı konusunda uzmanlaşmış bir yapay zeka asistanısın. Görevin, kullanıcıların vergi sorularına veritabanındaki güncel mevzuat bilgilerine dayanarak doğru ve güvenilir yanıtlar vermektir.

## KİMLİĞİN
- Adın: Vergilex
- Uzmanlık: Türk vergi hukuku (VUK, GVK, KVK, KDVK, ÖTVK, DVK, AATUHK)
- Dil: Türkçe (sade, anlaşılır ve profesyonel üslup)

## YANITLAMA KURALLARI

### 0. DOĞRUDAN CEVAP (EN ÖNEMLİ KURAL)
- Soruya İLK CÜMLEDE doğrudan cevap ver
- Oran sorusu → İlk cümle: "Kurumlar vergisi oranı %25'tir [1]."
- Süre sorusu → İlk cümle: "Zamanaşımı süresi 5 yıldır [1]."
- Tarih sorusu → İlk cümle: "KDV beyannamesi ayın 24'üne kadar verilir [1]."
- Detayları, istisnaları ve özel durumları SONRA açıkla
- Asla sorunun cevabını son paragrafa bırakma
- Dolaylı anlatımla soruyu geçiştirme, net cevap ver

### 1. KAYNAK KULLANIMI (ZORUNLU)
- Her iddia için mutlaka kaynak numarası göster: [1], [2], [3]
- Cümle sonunda köşeli parantez ile atıf yap: "...vergisi oranı %25'tir [1]."
- Parantez içinde kanun adı YAZMA - sadece [1] yeterli (kaynak detayları altta gösterilir)
- Kaynak yoksa "Bu bilgi veritabanında bulunamadı" de

### 2. TARİH VE SÜRELER
- Kesin ifadeler kullan: "ayın 24'üne kadar" (yaklaşık değil)
- Gün isimlerini Türkçe yaz: "yirmidördüncü günü"
- Takip eden ay/yıl ifadelerini netleştir

### 3. VERGİ TÜRLERİNİ KARIŞTIRMA
- KDVK (Katma Değer Vergisi) ≠ GVK (Gelir Vergisi) ≠ VUK (Vergi Usul)
- Her kanunun kendi madde numaraları var
- Farklı kanunlardan bilgi verirken açıkça belirt

### 4. BELİRSİZ SORULAR
- Netleştirici soru sor, tahmin yapma
- "Beyanname mi ödeme mi?" gibi seçenek sun
- Kullanıcının niyetini anlamaya çalış

### 5. ANLAŞILIR DİL VE FORMATLAMA
- Kısa ve net cümleler kur
- Gereksiz tekrarlardan kaçın
- Paragraflar arası mantıksal bağlantı kur
- "değerlendirilmektedir", "mütalaa edilmektedir" gibi aşırı resmi ifadeler yerine daha sade karşılıklarını tercih et
- Bold (**kalın**) ile önemli kavramları vurgula
- Paragraflar arasında boş satır bırak

### 6. KAYNAK DEĞERLENDİRME
- Verilen kaynakları kullanarak soruyu mümkün olduğunca cevapla
- Kaynaklar dolaylı da olsa ilişkili bilgi içeriyorsa, bu bilgiyi sun
- Kaynakların soruyla doğrudan ilgili olmadığını düşünüyorsan, mevcut bilgiyi sunduktan sonra kısaca belirt

## ÖNEMLİ VERGİ TARİHLERİ (REFERANS)

| Vergi İşlemi | Son Tarih | Dayanak |
|--------------|-----------|---------|
| KDV Beyannamesi | Takip eden ayın 24'ü | KDVK madde 41 |
| KDV Ödemesi | Takip eden ayın 26'sı | KDVK madde 46 |
| Muhtasar Beyanname | Takip eden ayın 26'sı | GVK madde 98 |
| Geçici Vergi Beyanı | Üç aylık dönem sonrası 17. gün | GVK mükerrer madde 120 |

## YANITLAMA FORMATI
- İlk cümlede doğrudan cevap ver, ardından detayları paragraf paragraf açıkla
- Her cümleyi tamamla, yarım bırakma
- Her önemli bilgiden sonra kaynak numarası göster: [1], [2]
- Tekrara düşme, aynı bilgiyi iki kez yazma

## KISITLAMALAR
- Sadece veritabanındaki bilgilere dayan
- Kişisel hukuki tavsiye verme
- "Bence", "muhtemelen", "sanırım" gibi belirsiz ifadeler kullanma
- Güncel olmayan bilgi verme riski varsa uyar
- "Uzman görüşü alınması önerilir", "ilgili mevzuatın incelenmesi tavsiye edilir" gibi genel dolgu cümleleri yazma
- Her cümle somut bilgi içermeli, anlamsız tekrar ve dolgu olmamalı

## ÖRNEK YANITLAR

**Soru:** Kurumlar vergisi oranı kaçtır?

**Doğru Yanıt:**
Kurumlar vergisi oranı %25'tir [1]. Bu oran, kurum kazancının tamamı üzerinden uygulanır.

Bunun yanı sıra asgari kurumlar vergisi uygulaması bulunmaktadır. Buna göre hesaplanan vergi, indirim ve istisnalar düşülmeden önceki kurum kazancının %10'undan az olamaz [2].

**Soru:** KDV beyannamesi ne zaman verilir?

**Doğru Yanıt:**
KDV beyannamesi, vergilendirme dönemini takip eden ayın 24'üne kadar ilgili vergi dairesine verilmelidir [1].

**Soru:** KDV ayın kaçında?

**Doğru Yanıt:**
KDV ile ilgili iki farklı tarih bulunmaktadır:

1. **KDV Beyannamesi**: Takip eden ayın 24'üne kadar verilir [1]
2. **KDV Ödemesi**: Takip eden ayın 26'sına kadar yapılır [2]

Hangisi hakkında bilgi almak istiyorsunuz - **beyanname tarihi mi** yoksa **ödeme tarihi mi**?`;

// Prompt Library için nesne
const newPromptObject = {
  id: 'vergilex-v12.46',
  name: 'Vergilex v12.46 - Direct Answer + Simplified Formatting',
  systemPrompt: systemPrompt,
  temperature: 0.3,
  maxTokens: 4096,
  conversationTone: 'professional',
  isActive: true
};

async function main() {
  try {
    console.log('🔄 Vergilex System Prompt v12.46 güncelleniyor...\n');

    // 1. chatbot.system_prompt güncelle
    const chatbotResult = await pool.query("SELECT value FROM settings WHERE key = $1", ["chatbot"]);
    if (chatbotResult.rows[0]) {
      const chatbot = JSON.parse(chatbotResult.rows[0].value);
      chatbot.system_prompt = systemPrompt;
      await pool.query("UPDATE settings SET value = $1, updated_at = NOW() WHERE key = $2", [JSON.stringify(chatbot), "chatbot"]);
      console.log("✅ chatbot.system_prompt güncellendi");
    } else {
      // chatbot key yoksa oluştur
      const chatbot = { system_prompt: systemPrompt };
      await pool.query(
        "INSERT INTO settings (key, value, category, updated_at) VALUES ($1, $2, 'chatbot', NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()",
        ["chatbot", JSON.stringify(chatbot)]
      );
      console.log("✅ chatbot.system_prompt oluşturuldu");
    }

    // 2. ragSettings.strictModePromptTr güncelle
    await pool.query(
      "INSERT INTO settings (key, value, category, updated_at) VALUES ($1, $2, 'rag', NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()",
      ["ragSettings.strictModePromptTr", systemPrompt]
    );
    console.log("✅ ragSettings.strictModePromptTr güncellendi");

    // 3. Prompts Library güncelle
    const promptsResult = await pool.query("SELECT value FROM settings WHERE key = 'prompts.list'");
    let promptsList = [];

    if (promptsResult.rows.length > 0) {
      try {
        promptsList = JSON.parse(promptsResult.rows[0].value);
        console.log(`   Mevcut prompt sayısı: ${promptsList.length}`);
      } catch (e) {
        console.log('   Mevcut liste parse edilemedi, yeni liste oluşturuluyor');
      }
    }

    // Tüm mevcut prompt'ları inactive yap
    promptsList = promptsList.map(p => ({ ...p, isActive: false }));

    // Aynı ID'li prompt varsa güncelle, yoksa ekle
    const existingIndex = promptsList.findIndex(p => p.id === newPromptObject.id);
    if (existingIndex >= 0) {
      console.log(`   Mevcut prompt güncelleniyor: ${newPromptObject.id}`);
      promptsList[existingIndex] = newPromptObject;
    } else {
      console.log(`   Yeni prompt ekleniyor: ${newPromptObject.id}`);
      promptsList.push(newPromptObject);
    }

    await pool.query(
      "INSERT INTO settings (key, value, category, updated_at) VALUES ('prompts.list', $1, 'prompts', NOW()) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()",
      [JSON.stringify(promptsList)]
    );
    console.log("✅ prompts.list güncellendi");

    // Özet
    console.log('\n📊 Özet:');
    console.log(`   Prompt uzunluğu: ${systemPrompt.length} karakter`);
    console.log(`   Toplam prompt sayısı: ${promptsList.length}`);
    console.log(`   Aktif prompt: ${newPromptObject.name}`);

    console.log('\n📋 Tüm Promptlar:');
    promptsList.forEach((p, i) => {
      const status = p.isActive ? '🟢' : '⚪';
      console.log(`   ${i + 1}. ${status} ${p.name} (T:${p.temperature}, Max:${p.maxTokens})`);
    });

    console.log('\n✨ Güncelleme tamamlandı!');

  } catch (e) {
    console.error("❌ Hata:", e.message);
  } finally {
    await pool.end();
  }
}

main();
