/**
 * Vergilex RAG Routing Schema - Update Script
 *
 * Bu script, RAG routing schema'yı (grounding rules, article sections, vb.)
 * database'e yazar. Böylece grounding rules değişiklikleri için
 * code deploy/restart gerekmez - sadece bu script çalıştırılır.
 *
 * Schema 1 dakika cache'lenir, değişiklikler max 1 dk içinde aktif olur.
 *
 * Kullanım:
 *   node backend/scripts/update-vergilex-routing-schema.js
 *
 * veya Production'da (SSH ile):
 *   ssh -p 2222 root@49.13.38.58
 *   cd /var/www/vergilex/backend
 *   node scripts/update-vergilex-routing-schema.js
 */

require("dotenv").config();
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ═══════════════════════════════════════════════════════════════
// GROUNDING RULES - Burası en sık güncellenen bölüm
// ═══════════════════════════════════════════════════════════════

const groundingRulesTr = `⛔ ASLA YAPMA (Numaralı Liste):
1. "Bu konu kapsam dışı" YAZMA
2. "Kaynak bulunamadı / yeterli kaynak yok / yanıt verecek kaynak yok" YAZMA - backend söyler
3. "KONU:", "DEĞERLENDİRME:", "ANAHTAR_TERİMLER:", "SONUÇ:", "ÖZET:", "DETAY:", "GİRİŞ:" gibi BAŞLIK/ETİKET YAZMA
4. "NEEDS_CLARIFICATION / OUT_OF_SCOPE / NOT_FOUND / FOUND" sınıflandırma YAZMA
5. Scope/kapsam kontrolü yapma
6. Soruda geçmeyen madde numarasını ana dayanak olarak gösterme
7. Kaynaklarda GEÇMEDİKÇE süre (2 yıl, 5 yıl), oran (%18, %1), tutar (10.000 TL) gibi RAKAMSAL İDDİA YAZMA
8. "Uzman görüşü alınması önerilir", "ilgili mevzuatın incelenmesi tavsiye edilir" gibi dolgu cümleleri YAZMA

✅ SEN SADECE (KOMPOZİSYON YAPISI):
1. GİRİŞ: Soruya İLK CÜMLEDE doğrudan cevap ver (oran, süre, tutar, evet/hayır) ve konuyu çerçevele
2. AÇIKLAMA: Kapsam, koşullar, istisnalar - her paragraf YENİ bilgi eklemeli
3. PRATİK: Uygulama detayları, süreler, usul bilgisi (kaynaklarda varsa)
- Sources'tan metin üret, atıf yap [1], [2], [3]
- Direkt metne başla, başlık yok
- Sade ve anlaşılır Türkçe kullan
- Aynı bilgiyi tekrarlama, soyut yerine somut yaz

🚨 MADDE TUTARLILIK KURALI (KRİTİK):
Soru spesifik bir madde içeriyorsa (örn: "VUK 114", "KDVK 29", "GVK 40"):
1. Atıfların EN AZ BİRİNDE o madde numarası geçmeli (Madde 114, Madde 29 vb.)
2. Sources'ta o madde metni YOKSA: "Kaynaklarda [Kanun] Madde [X]'e ilişkin doğrudan metin bulunamamıştır" yaz
3. ASLA farklı bir maddeyi (Madde 1, Madde 19 vb.) sorulan madde gibi sunma
4. Alakasız maddeleri "ek bilgi" olarak verebilirsin ama ana cevap sorulan maddeye dayanmalı

📌 INTENT SABİTLEME KURALI (KRİTİK):
Soruda geçen ANAHTAR KAVRAM (indirim, iade, istisna, muafiyet vb.) cevabın ANA ODAĞI olmalı:
- "KDV indirimi" soruluyorsa → İNDİRİM şartlarını anlat (KDVK 29/1 odağı)
- "KDV iadesi" soruluyorsa → İADE şartlarını anlat (KDVK 29/2 veya 32 odağı)
- Soru "indirim" iken cevap "iade"ye KAYMAMALI
- Farklı kavramdan bahsedeceksen "Ayrıca iade konusunda..." diye AÇIKça ayır
- İNDİRİM ≠ İADE: Bunlar farklı kavramlar, birbirinin yerine KULLANMA

🔢 CLAIM-TO-CITE ZORUNLULUĞU (KRİTİK):
Aşağıdaki "kesin iddia" türleri SADECE kaynak metinde geçiyorsa yazılabilir:
- SÜRE: "2 yıl", "5 yıl", "30 gün", "takvim yılı" → Kaynak [X]'te geçmeli
- ORAN: "%18", "%1", "onda biri" → Kaynak [X]'te geçmeli
- TUTAR: "10.000 TL", "50.000 Euro" → Kaynak [X]'te geçmeli
- TARİH: "01.01.2024'ten itibaren" → Kaynak [X]'te geçmeli
- ŞART: "zorunludur", "yasaktır", "şarttır" → Kaynak [X]'te geçmeli
- PROSEDÜR: "başvuru yapılmalı", "hak kaybı", "süre içinde" → Kaynak [X]'te geçmeli
- SONUÇ: "kaybedilir", "düşer", "sona erer" → Kaynak [X]'te geçmeli

Kaynaklarda bu rakam/süre/prosedür YOKSA:
✗ YAZMA: "2 yıl içinde indirilmelidir"
✗ YAZMA: "aksi takdirde hak kaybedilir"
✗ YAZMA: "belirli süre içinde başvuru yapılmazsa..."
✓ YAZ: "İndirim süresi ve prosedürü konusunda kaynaklarda açık bilgi bulunamamıştır"

⚠️ KESİN FİİL KISITLAMASI:
Aşağıdaki kesin/zorunluluk fiilleri SADECE source'ta kelimesi kelimesine geçiyorsa kullanılabilir:
- "gerekmektedir", "zorunludur", "şarttır", "mecburidir"
- "belirtmektedir", "düzenlemektedir", "hükme bağlamaktadır", "emretmektedir"
- "ibraz edilmesi gerekmektedir", "saklanması gerekmektedir"
- "beyanname verilmelidir", "bildirilmelidir", "başvurulmalıdır"
- "aksi takdirde", "unutulmamalıdır", "dikkat edilmelidir"

Bu kelimeler kaynakta YOKSA:
✗ YAZMA: "fatura ile belgelenmiş olması gerekmektedir"
✗ YAZMA: "belgelerin saklanması zorunludur"
✗ YAZMA: "aksi takdirde hak kaybedilir"
✓ YAZ: "Belgeleme ve saklama yükümlülükleri hakkında kaynaklarda detaylı bilgi bulunamamıştır"

Aksi halde şu fiilleri kullan: "değerlendirilebilir", "ifade edilmektedir", "olabilir", "söylenebilir"

KRİTİK KURAL (Karar sende değil):
- Yalnızca sources içeriğine dayan. Kaynakta olmayanı ekleme.
- Çelişki varsa açıkça belirt; öncelik sıralamasıyla ağırlıklandır:
  1) Kanun / CBK / Yönetmelik
  2) Tebliğ / Genel Tebliğ / Uygulama Tebliği
  3) Rehber / Sirküler / İdari açıklamalar
  4) Yargı kararları
  5) Özelgeler
  6) Makaleler / ikincil yorum ve Dokümanlar
  7) Soru/Cevap
- Aynı seviyede birden fazla kaynak varsa: tarih olarak daha yeni olanı öncele.
- Metin içinde dipnotları [1], [2] şeklinde kullan. Dipnot numarası sources sırasına bağlı kalmalı (sources sırasını değiştirme).
- Kesin hüküm (evet/hayır) isteyen sorularda: kaynak açık ve net demiyorsa kesin konuşma; "kaynaklarda doğrudan net ifade bulunamadı" diye temkinli yaz.`;

const groundingRulesEn = `1. Only cite law/article numbers if they EXPLICITLY appear in source text. Do NOT invent references not in sources.
2. For verdict questions ("must I", "can I", "is it prohibited"): If no EXPLICIT ruling in sources, say "No clear regulation found in sources on this matter."
3. Use definitive statements ("required", "prohibited", "possible", "mandatory") ONLY if source explicitly states so verbatim.
4. When uncertain: Use hedged academic language like "According to sources...", "...may be considered as", "...appears to be".
5. For conflicting sources: Present both views, explain which is more recent/higher norm.
6. NEVER write numerical claims (durations, rates, amounts, dates) unless they appear verbatim in sources.

🚨 ARTICLE MATCHING RULE (CRITICAL):
If question mentions a specific article (e.g., "VUK 114", "KDVK 29"):
1. At least ONE citation MUST reference that article number
2. If source text for that article is NOT in sources: State "No direct text found for [Law] Article [X] in sources"
3. NEVER present a different article as if it were the asked article
4. Unrelated articles can be "additional info" but main answer must cite the asked article

📌 INTENT STABILIZATION RULE (CRITICAL):
The KEY CONCEPT in the question (deduction, refund, exemption, etc.) MUST be the MAIN FOCUS of the answer:
- If asked about "VAT deduction" → Focus on DEDUCTION conditions
- If asked about "VAT refund" → Focus on REFUND conditions
- Answer MUST NOT drift from "deduction" to "refund" when question asks about "deduction"
- If mentioning a different concept, clearly separate: "Additionally, regarding refund..."
- DEDUCTION ≠ REFUND: These are different concepts, do NOT use interchangeably

🔢 CLAIM-TO-CITE REQUIREMENT (CRITICAL):
These "definitive claim" types can ONLY be written if they appear in source text:
- DURATION: "2 years", "5 years", "30 days" → Must cite source [X]
- RATE: "18%", "1%", "one-tenth" → Must cite source [X]
- AMOUNT: "$10,000", "€50,000" → Must cite source [X]
- DATE: "as of 01/01/2024" → Must cite source [X]
- CONDITION: "mandatory", "prohibited", "required" → Must cite source [X]

If these numbers/durations/rates are NOT in sources:
✗ DON'T WRITE: "must be deducted within 2 years"
✓ DO WRITE: "No explicit duration found in sources regarding the deduction period"

⚠️ DEFINITIVE VERB RESTRICTION:
Words like "states", "mandates", "requires", "prohibits" can ONLY be used when source text contains verbatim ruling.
Otherwise use: "may be interpreted as", "suggests", "indicates", "could be considered"`;

// ═══════════════════════════════════════════════════════════════
// ASSESSMENT SECTION - LLM'e verilen yazım talimatları
// ═══════════════════════════════════════════════════════════════

const assessmentDescriptionTr = 'Kompozisyon yapısında yaz: 1) Giriş paragrafı - soruya doğrudan cevap ver ve konuyu çerçevele [1]. 2) Açıklama paragrafları - kapsam, koşullar, istisnalar, her paragraf YENİ bilgi eklemeli. 3) Pratik bilgi - uygulama detayları, süreler, usul (varsa). SADECE sources\'tan hareketle yaz. Her önemli bilgiden sonra dipnot ekle [1], [2]. Sayısal sorularda (oran, süre, tutar) ilk cümlede rakamı ver. Aynı bilgiyi tekrarlama, soyut yerine somut yaz. VERDICT SORULARINDA: Kaynaklarda AÇIK hüküm yoksa "Kaynaklarda bu konuda açık bir düzenleme bulunamamıştır" yaz.';

const assessmentDescriptionEn = 'Write in composition structure: 1) Opening paragraph - answer directly and frame the topic [1]. 2) Explanation paragraphs - scope, conditions, exceptions, each paragraph adds NEW info. 3) Practical info - deadlines, procedures (if available). Write based ONLY on sources. Add footnotes [1], [2]. For numerical questions, state the number in first sentence. No repetition, prefer concrete over abstract. VERDICT QUESTIONS: If no explicit ruling in sources, write "No clear regulation found in sources on this matter."';

// ═══════════════════════════════════════════════════════════════
// SCHEMA OVERRIDE OBJECT - Sadece FOUND route'u override eder
// Diğer route'lar (NEEDS_CLARIFICATION, OUT_OF_SCOPE, NOT_FOUND)
// hardcoded default'lardan gelir
// ═══════════════════════════════════════════════════════════════

const schemaOverride = {
  version: '1.1-db',
  routes: {
    FOUND: {
      triggers: {
        conditions: ['hasResults']
      },
      format: {
        type: 'article',
        showSources: true,
        articleSections: [
          {
            id: 'keywords',
            title: 'Anahtar Terimler',
            titleEn: 'Key Terms',
            required: false,
            systemGenerated: true,
            description: '5-10 terim: soru + kaynaklarda geçen temel terimler.',
            descriptionEn: '5-10 terms: key terms from question + sources.'
          },
          {
            id: 'assessment',
            title: 'Değerlendirme',
            titleEn: 'Assessment',
            required: true,
            systemGenerated: false,
            description: assessmentDescriptionTr,
            descriptionEn: assessmentDescriptionEn
          }
        ],
        groundingRules: {
          tr: groundingRulesTr,
          en: groundingRulesEn
        },
        sourcePriority: [
          { type: 'kanun', label: 'Kanun/Yönetmelik', priority: 1 },
          { type: 'teblig', label: 'Tebliğ/Genel Tebliğ/Sirküler', priority: 2 },
          { type: 'rehber', label: 'Resmî rehber', priority: 3 },
          { type: 'yargi', label: 'Yargı kararı', priority: 4 },
          { type: 'ozelge', label: 'Özelge', priority: 5 },
          { type: 'makale', label: 'Makale', priority: 6 }
        ],
        footnoteFormat: {
          makale: 'yazar, başlık, dergi adı, tarih, sayı (+ varsa cilt/sayfa)',
          ozelge: 'tarih + sayı (+ mümkünse birim)',
          yargi: 'daire, tarih, E. No, K. No',
          pdf: 'doküman adı + yayımlayan kurum + tarih (+ varsa sayfa/bölüm)',
          kanun: 'kanun adı, madde numarası, fıkra (varsa)',
          teblig: 'tebliğ adı, tarih, sayı',
          sorucevap: ''
        },
        conflictHandling: {
          showConflict: true,
          preferNewer: true,
          preferHigherNorm: true
        },
        prohibitedContent: [
          'Arama sonucu',
          'X belge bulundu',
          'ALINTI',
          'Bulunan belgeler',
          'Dipnotlar',
          'Dipnot',
          'Footnotes',
          'Kaynaklar listesi'
        ],
        template: ''
      }
    }
  }
};

async function main() {
  try {
    console.log('🔄 Vergilex RAG Routing Schema güncelleniyor...\n');

    // Mevcut schema'yı kontrol et
    const existing = await pool.query(
      "SELECT value FROM settings WHERE key = 'ragRoutingSchema'"
    );

    if (existing.rows[0]) {
      console.log('   Mevcut schema bulundu, güncelleniyor...');
    } else {
      console.log('   Mevcut schema yok, yeni oluşturuluyor...');
    }

    // Schema'yı DB'ye yaz
    await pool.query(
      `INSERT INTO settings (key, value, category, description, updated_at)
       VALUES ('ragRoutingSchema', $1, 'rag', 'RAG Response Routing Schema (dynamic override)', NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify(schemaOverride)]
    );

    console.log('✅ ragRoutingSchema güncellendi');

    // Özet
    console.log('\n📊 Özet:');
    console.log(`   Schema version: ${schemaOverride.version}`);
    console.log(`   Grounding rules (TR): ${groundingRulesTr.length} karakter`);
    console.log(`   Grounding rules (EN): ${groundingRulesEn.length} karakter`);
    console.log(`   Override route'lar: ${Object.keys(schemaOverride.routes).join(', ')}`);
    console.log(`   Cache TTL: 1 dakika (değişiklikler max 1 dk içinde aktif)`);

    console.log('\n✨ Güncelleme tamamlandı!');
    console.log('   ℹ️  Backend restart GEREKMEZ - 1 dk içinde otomatik yüklenir.');

  } catch (e) {
    console.error("❌ Hata:", e.message);
  } finally {
    await pool.end();
  }
}

main();
