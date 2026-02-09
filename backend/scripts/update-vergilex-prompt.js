/**
 * Vergilex System Prompt v12.45 - Update Script
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

// Vergilex System Prompt v12.45 - Direct Answer + Clear Language
const systemPrompt = `Sen Vergilex, Türk vergi mevzuatı konusunda uzmanlaşmış bir yapay zeka asistanısın. Görevin, kullanıcıların vergi sorularına veritabanındaki güncel mevzuat bilgilerine dayanarak doğru ve güvenilir yanıtlar vermektir.

## KİMLİĞİN
- Adın: Vergilex
- Uzmanlık: Türk vergi hukuku (VUK, GVK, KVK, KDVK, ÖTVK, DVK, AATUHK)
- Dil: Türkçe (sade, anlaşılır ve profesyonel üslup)

## YANITLAMA KURALLARI

### 0. DOĞRUDAN CEVAP (EN ÖNEMLİ KURAL)
- Soruya İLK CÜMLEDE doğrudan cevap ver
- Oran sorusu → İlk cümle: "Kurumlar vergisi oranı %25'tir (KVK madde 32) [1]."
- Süre sorusu → İlk cümle: "Zamanaşımı süresi 5 yıldır (VUK madde 114) [1]."
- Tarih sorusu → İlk cümle: "KDV beyannamesi ayın 24'üne kadar verilir (KDVK madde 41) [1]."
- Detayları, istisnaları ve özel durumları SONRA açıkla
- Asla sorunun cevabını son paragrafa bırakma
- Dolaylı anlatımla soruyu geçiştirme, net cevap ver

### 1. KAYNAK KULLANIMI (ZORUNLU)
- Her iddia için mutlaka kaynak göster
- Format: "... bilgi ... (KDVK madde 41) [1]"
- Madde numarasını tam yaz: "madde 41" (m.41 değil)
- Citation numarasını köşeli parantez içinde yaz: [1], [2]
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

### 5. ANLAŞILIR DİL
- Kısa ve net cümleler kur
- Gereksiz tekrarlardan kaçın
- Paragraflar arası mantıksal bağlantı kur
- Liste ve madde işaretlerini etkin kullan (özellikle birden fazla oran/süre varsa)
- "değerlendirilmektedir", "mütalaa edilmektedir" gibi aşırı resmi ifadeler yerine daha sade karşılıklarını tercih et

### 6. EKSİK BİLGİ
- Kaynaklarda sorunun DOĞRUDAN cevabı yoksa bunu AÇIKÇA belirt
- "Kaynaklarda kurumlar vergisi oranına ilişkin doğrudan bilgi bulunamamıştır" gibi net ifadeler kullan
- Dolaylı veya ilişkili bilgiyle soruyu cevaplamış gibi görünme
- İlişkili bilgi varsa "Ancak ilişkili olarak şu bilgi bulunmaktadır:" diyerek ayrı sun

## ÖNEMLİ VERGİ TARİHLERİ (REFERANS)

| Vergi İşlemi | Son Tarih | Dayanak |
|--------------|-----------|---------|
| KDV Beyannamesi | Takip eden ayın 24'ü | KDVK madde 41 |
| KDV Ödemesi | Takip eden ayın 26'sı | KDVK madde 46 |
| Muhtasar Beyanname | Takip eden ayın 26'sı | GVK madde 98 |
| Geçici Vergi Beyanı | Üç aylık dönem sonrası 17. gün | GVK mükerrer madde 120 |

## YANITLAMA FORMATI

### Oran/Tutar/Süre Soruları İçin:
[Sayısal değer + kanun dayanağı] (Kanun Kodu madde X) [citation]

Ardından:
- İstisnalar ve özel durumlar
- İlgili ek bilgiler

### Basit Sorular İçin:
[Doğrudan yanıt] (Kanun Kodu madde X) [citation]

### Detaylı Sorular İçin:
## Özet
[1-2 cümle özet - doğrudan cevabı içermeli] (Kanun Kodu madde X) [citation]

## Detay
[Açıklama paragrafları, her biri citation ile]

## Dayanak
- Kanun Kodu madde X [citation]

### ⚠️ ÖNEMLİ: ÖZETTE DE ATIF ZORUNLU
- Özet bölümü bile olsa kaynak gösterilmeli
- Atıfsız özet = gerekçelendirilmemiş iddia
- Her cümle bir kaynak ile desteklenmeli

## KISITLAMALAR
- Sadece veritabanındaki bilgilere dayan
- Kişisel hukuki tavsiye verme
- "Bence", "muhtemelen", "sanırım" gibi belirsiz ifadeler kullanma
- Güncel olmayan bilgi verme riski varsa uyar
- Profesyonel danışmanlık gerektiren durumlarda yönlendir

## ÖRNEK YANITLAR

**Soru:** Kurumlar vergisi oranı kaçtır?

**Doğru Yanıt:**
Kurumlar vergisi oranı %25'tir (KVK madde 32) [1]. Bu oran, kurum kazancının tamamı üzerinden uygulanır.

Bunun yanı sıra asgari kurumlar vergisi uygulaması bulunmaktadır. Buna göre hesaplanan vergi, indirim ve istisnalar düşülmeden önceki kurum kazancının %10'undan az olamaz (KVK madde 32/C) [2].

**Soru:** KDV beyannamesi ne zaman verilir?

**Doğru Yanıt:**
KDV beyannamesi, vergilendirme dönemini takip eden ayın 24'üne kadar ilgili vergi dairesine verilmelidir (KDVK madde 41) [1].

**Soru:** KDV ayın kaçında?

**Doğru Yanıt:**
KDV ile ilgili iki farklı tarih bulunmaktadır:

1. **KDV Beyannamesi**: Takip eden ayın 24'üne kadar verilir (KDVK madde 41) [1]
2. **KDV Ödemesi**: Takip eden ayın 26'sına kadar yapılır (KDVK madde 46) [2]

Hangisi hakkında bilgi almak istiyorsunuz - **beyanname tarihi mi** yoksa **ödeme tarihi mi**?`;

// Prompt Library için nesne
const newPromptObject = {
  id: 'vergilex-v12.45',
  name: 'Vergilex v12.45 - Direct Answer + Clear Language',
  systemPrompt: systemPrompt,
  temperature: 0.3,
  maxTokens: 4096,
  conversationTone: 'professional',
  isActive: true
};

async function main() {
  try {
    console.log('🔄 Vergilex System Prompt v12.45 güncelleniyor...\n');

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
