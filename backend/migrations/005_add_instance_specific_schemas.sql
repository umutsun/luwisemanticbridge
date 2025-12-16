-- Migration: Add Instance-Specific Schemas with Enhanced LLM Config
-- Date: 2024-12-16
-- Description: Adds optimized schemas for Vergilex, EmlakAI, and Bookie instances
--              Each schema is designed for its specific domain to improve LLM accuracy

-- ============================================
-- 1. BOOKIE (Akademik Asistan) SCHEMA - NEW
-- ============================================
INSERT INTO industry_presets (
    industry_code, industry_name, industry_icon,
    schema_name, schema_display_name, schema_description,
    fields, templates, llm_guide, llm_config, tier, sort_order
) VALUES
(
    'akademik', 'Akademik', '📚',
    'akademik_arastirma', 'Akademik Araştırma', 'Bilimsel makaleler, tezler, kitap bölümleri ve akademik kaynaklar',
    '[
        {"key": "title", "label": "Başlık", "type": "string", "showInCitation": true, "extractionHint": "Makalenin veya çalışmanın başlığı"},
        {"key": "authors", "label": "Yazarlar", "type": "entity", "showInCitation": true, "extractionHint": "Yazar adları (Soyad, Ad formatında)"},
        {"key": "year", "label": "Yıl", "type": "number", "showInCitation": true, "extractionHint": "Yayın yılı (YYYY)"},
        {"key": "journal", "label": "Dergi/Yayın", "type": "string", "showInCitation": true, "extractionHint": "Dergi adı veya yayınevi"},
        {"key": "volume", "label": "Cilt", "type": "string", "extractionHint": "Cilt numarası"},
        {"key": "issue", "label": "Sayı", "type": "string", "extractionHint": "Sayı numarası"},
        {"key": "pages", "label": "Sayfa", "type": "string", "extractionHint": "Sayfa aralığı (örn: 123-145)"},
        {"key": "doi", "label": "DOI", "type": "reference", "showInCitation": true, "extractionHint": "Digital Object Identifier"},
        {"key": "abstract", "label": "Özet", "type": "string", "extractionHint": "Makalenin özeti"},
        {"key": "keywords", "label": "Anahtar Kelimeler", "type": "category", "showInTags": true, "extractionHint": "Virgülle ayrılmış anahtar kelimeler"},
        {"key": "field", "label": "Alan", "type": "category", "showInTags": true, "extractionHint": "Bilim dalı (Fizik, Kimya, Biyoloji, Tıp, Mühendislik vb.)"},
        {"key": "methodology", "label": "Metodoloji", "type": "category", "showInTags": true, "extractionHint": "Araştırma metodolojisi (Deneysel, Teorik, Meta-analiz, Sistematik Derleme)"},
        {"key": "citation_count", "label": "Atıf Sayısı", "type": "number", "extractionHint": "Toplam atıf sayısı"},
        {"key": "institution", "label": "Kurum", "type": "entity", "extractionHint": "Yazarların bağlı olduğu kurum/üniversite"}
    ]'::jsonb,
    '{
        "analyze": "Bu akademik metni analiz et:\n- Başlık ve yazarlar\n- Yayın bilgileri (dergi, yıl, cilt, sayı, sayfa)\n- DOI veya benzeri tanımlayıcı\n- Araştırma alanı ve metodoloji\n- Anahtar bulgular ve sonuçlar\n- Önemli referanslar",
        "citation": "{{authors}} ({{year}}). {{title}}. {{journal}}, {{volume}}({{issue}}), {{pages}}. {{doi}}",
        "questions": [
            "{{title}} araştırmasının ana bulguları nelerdir?",
            "{{field}} alanında benzer çalışmalar var mı?",
            "{{authors}} yazarlarının diğer çalışmaları nelerdir?",
            "Bu çalışmanın metodolojisi nedir?"
        ]
    }'::jsonb,
    'Bu veri akademik literatür ve bilimsel yayınları içermektedir.

KAYNAK TİPLERİ:
- Hakemli Dergi Makalesi: En güvenilir birincil kaynak
- Konferans Bildirisi: Güncel araştırma bulguları
- Tez/Disertasyon: Detaylı araştırma çalışmaları
- Kitap/Kitap Bölümü: Kapsamlı referans kaynakları
- Sistematik Derleme/Meta-analiz: Sentez çalışmaları

ATIF FORMATLARI:
- APA 7: Yazarlar (Yıl). Başlık. Dergi, Cilt(Sayı), Sayfa. DOI
- IEEE: [N] Yazarlar, "Başlık," Dergi, cilt, sayı, sayfa, yıl.

DEĞERLENDİRME KRİTERLERİ:
- Impact Factor: Derginin etki faktörü
- H-index: Yazarın akademik etkisi
- Atıf sayısı: Çalışmanın önemi

ALAN SINIFLAMA:
- STEM: Fen, Teknoloji, Mühendislik, Matematik
- Tıp: Klinik, Temel Tıp, Halk Sağlığı
- Sosyal Bilimler: Psikoloji, Sosyoloji, Ekonomi
- Beşeri Bilimler: Tarih, Felsefe, Edebiyat',
    '{
        "analyzePrompt": "Bu akademik metni detaylı analiz et. Yazar bilgileri, yayın yılı, dergi/konferans bilgisi, DOI, araştırma metodolojisi, ana bulgular ve sonuçları çıkar. Atıf formatı için gerekli tüm bilgileri topla.",
        "citationTemplate": "{{authors}} ({{year}}). {{title}}. {{journal}}, {{volume}}({{issue}}), {{pages}}. https://doi.org/{{doi}}",
        "chatbotContext": "Sen akademik araştırma asistanısın. Bilimsel makaleler, tezler ve akademik kaynaklar hakkında sorulara yanıt ver. Her zaman kaynak göster ve atıf formatını belirt. Metodoloji ve bulguları objektif değerlendir. Spekülatif yorumlardan kaçın.",
        "embeddingPrefix": "Akademik Kaynak: ",
        "transformRules": "Yazar adlarını Soyad, Ad formatına çevir. Yılı YYYY formatında standartlaştır. DOI''yu temizle (sadece numara). Sayfa aralığını n-m formatına çevir. Anahtar kelimeleri virgülle ayır.",
        "questionGenerator": "Bu akademik çalışma hakkında araştırmacının sorabileceği sorular öner: metodoloji, bulgular, karşılaştırmalı analiz, uygulama alanları.",
        "searchContext": "Bilimsel makale, akademik araştırma, tez, sistematik derleme, meta-analiz, hakemli dergi"
    }'::jsonb,
    'free', 1
),
(
    'akademik', 'Akademik', '📚',
    'ders_notlari', 'Ders Notları ve Eğitim Materyalleri', 'Üniversite ders notları, slaytlar, özet notlar',
    '[
        {"key": "course_name", "label": "Ders Adı", "type": "string", "showInCitation": true, "extractionHint": "Dersin tam adı"},
        {"key": "course_code", "label": "Ders Kodu", "type": "reference", "showInCitation": true, "extractionHint": "Ders kodu (örn: FIZ101)"},
        {"key": "instructor", "label": "Öğretim Üyesi", "type": "entity", "showInCitation": true, "extractionHint": "Dersi veren hoca"},
        {"key": "university", "label": "Üniversite", "type": "entity", "showInTags": true, "extractionHint": "Üniversite adı"},
        {"key": "department", "label": "Bölüm", "type": "category", "showInTags": true, "extractionHint": "Akademik bölüm"},
        {"key": "semester", "label": "Dönem", "type": "string", "extractionHint": "Akademik dönem (Güz 2024)"},
        {"key": "topic", "label": "Konu", "type": "category", "showInTags": true, "extractionHint": "Dersin konusu veya ünitesi"},
        {"key": "week", "label": "Hafta", "type": "number", "extractionHint": "Hangi hafta"},
        {"key": "content_type", "label": "İçerik Tipi", "type": "category", "showInTags": true, "extractionHint": "Ders notu, slayt, özet, soru bankası"}
    ]'::jsonb,
    '{
        "analyze": "Bu eğitim materyalini analiz et:\n- Ders adı ve kodu\n- Öğretim üyesi ve üniversite\n- Konu ve hafta bilgisi\n- İçerik tipi\n- Ana kavramlar ve terimler",
        "citation": "{{course_name}} ({{course_code}}) - {{topic}} - {{university}}",
        "questions": [
            "{{topic}} konusunun temel kavramları nelerdir?",
            "{{course_name}} dersindeki önemli noktalar nelerdir?",
            "Bu konuyla ilgili sınav soruları neler olabilir?"
        ]
    }'::jsonb,
    'Bu veri üniversite ders notları ve eğitim materyallerini içerir.

İÇERİK TİPLERİ:
- Ders Notu: Kapsamlı konu anlatımı
- Slayt: Özet sunum
- Özet: Sınav hazırlık notu
- Soru Bankası: Örnek sorular

KULLANIM ALANLARI:
- Ders takibi ve tekrar
- Sınav hazırlığı
- Araştırma ve proje hazırlama',
    '{
        "analyzePrompt": "Bu eğitim materyalini analiz et. Ders adı, öğretim üyesi, üniversite, konu, hafta ve içerik tipini belirle. Ana kavramları ve önemli noktaları çıkar.",
        "citationTemplate": "{{course_name}} ({{course_code}}) - {{topic}} - {{instructor}}, {{university}}",
        "chatbotContext": "Sen eğitim asistanısın. Ders notları ve akademik materyaller hakkında sorulara yanıt ver. Kavramları açık ve anlaşılır şekilde anlat. Örneklerle destekle.",
        "embeddingPrefix": "Ders Notu: ",
        "transformRules": "Ders kodlarını standart formata çevir. Dönem bilgisini Güz/Bahar YYYY formatına standartlaştır.",
        "questionGenerator": "Bu konu hakkında öğrencinin sınav için hazırlanırken sorması gereken sorular öner.",
        "searchContext": "Ders notu, eğitim materyali, üniversite, slayt, özet, sınav hazırlık"
    }'::jsonb,
    'free', 2
)
ON CONFLICT (industry_code, schema_name) DO UPDATE SET
    industry_name = EXCLUDED.industry_name,
    schema_display_name = EXCLUDED.schema_display_name,
    schema_description = EXCLUDED.schema_description,
    fields = EXCLUDED.fields,
    templates = EXCLUDED.templates,
    llm_guide = EXCLUDED.llm_guide,
    llm_config = EXCLUDED.llm_config,
    tier = EXCLUDED.tier,
    updated_at = NOW();

-- ============================================
-- 2. ENHANCE VERGILEX SCHEMA (Vergi Asistanı)
-- ============================================
UPDATE industry_presets
SET
    schema_description = 'Türk vergi mevzuatı, GİB özelgeleri, Danıştay kararları ve vergi uygulamaları',
    fields = '[
        {"key": "kanun_no", "label": "Kanun No", "type": "reference", "showInCitation": true, "extractionHint": "Kanun numarası (193, 3065, 5520, 213 vb.)"},
        {"key": "madde_no", "label": "Madde", "type": "reference", "showInCitation": true, "extractionHint": "Madde numarası veya madde aralığı"},
        {"key": "fikra_no", "label": "Fıkra", "type": "reference", "extractionHint": "Fıkra numarası"},
        {"key": "bent_no", "label": "Bent", "type": "reference", "extractionHint": "Bent harfi veya numarası"},
        {"key": "tarih", "label": "Tarih", "type": "date", "format": "DD.MM.YYYY", "showInCitation": true, "extractionHint": "Belge tarihi veya resmi gazete tarihi"},
        {"key": "resmi_gazete", "label": "Resmi Gazete", "type": "reference", "extractionHint": "Resmi Gazete sayısı ve tarihi"},
        {"key": "ozelge_no", "label": "Özelge No", "type": "reference", "showInCitation": true, "extractionHint": "GİB özelge numarası (tam format)"},
        {"key": "karar_no", "label": "Karar No", "type": "reference", "showInCitation": true, "extractionHint": "Danıştay karar numarası (E.2024/123, K.2024/456)"},
        {"key": "daire", "label": "Daire", "type": "category", "showInTags": true, "extractionHint": "Danıştay dairesi (4. Daire, VDDK vb.)"},
        {"key": "vergi_turu", "label": "Vergi Türü", "type": "category", "showInTags": true, "extractionHint": "GVK, KVK, KDV, ÖTV, BSMV, Damga, Harç vb."},
        {"key": "konu", "label": "Konu", "type": "category", "showInTags": true, "extractionHint": "Ana vergi konusu (indirim, istisna, muafiyet, oran, beyan, ceza vb.)"},
        {"key": "mukellef_tipi", "label": "Mükellef Tipi", "type": "category", "showInTags": true, "extractionHint": "Gerçek kişi, Kurumlar, KOBİ, Serbest meslek"},
        {"key": "donem", "label": "Vergilendirme Dönemi", "type": "string", "extractionHint": "Aylık, Üç aylık, Yıllık veya özel dönem"},
        {"key": "oran", "label": "Vergi Oranı", "type": "percentage", "showInCitation": true, "extractionHint": "Uygulanan vergi oranı (%)"},
        {"key": "tutar", "label": "Had/Tutar", "type": "currency", "extractionHint": "Yasal had veya eşik tutarı (TL)"}
    ]'::jsonb,
    templates = '{
        "analyze": "Bu vergi mevzuatı belgesini detaylı analiz et:\n- Kanun ve madde numarası (fıkra, bent dahil)\n- Tarih ve resmi gazete bilgisi\n- Özelge veya Danıştay karar numarası\n- Vergi türü ve konusu\n- Mükellef tipi ve vergilendirme dönemi\n- Vergi oranı veya had/tutar bilgisi\n- İstisna, muafiyet veya indirim koşulları",
        "citation": "[{{vergi_turu}}] {{kanun_no}} Sayılı Kanun Md.{{madde_no}}{{fikra_no ? \"/\" + fikra_no : \"\"}} ({{tarih}})",
        "questions": [
            "{{madde_no}}. maddenin uygulama esasları ve koşulları nelerdir?",
            "{{konu}} konusunda güncel vergi oranı nedir?",
            "{{vergi_turu}} için istisna ve muafiyet koşulları nelerdir?",
            "{{mukellef_tipi}} için geçerli beyanname süreleri nelerdir?"
        ]
    }'::jsonb,
    llm_guide = 'Bu veri Türk vergi hukuku ve mevzuatını içermektedir.

TEMEL VERGİ KANUNLARI:
- Gelir Vergisi Kanunu (GVK - 193)
- Kurumlar Vergisi Kanunu (KVK - 5520)
- Katma Değer Vergisi Kanunu (KDV - 3065)
- Özel Tüketim Vergisi Kanunu (ÖTV - 4760)
- Vergi Usul Kanunu (VUK - 213)
- Amme Alacaklarının Tahsil Usulü Hakkında Kanun (AATUHK - 6183)

KAYNAK HİYERARŞİSİ:
1. Anayasa
2. Kanunlar (VUK, GVK, KVK, KDV, ÖTV)
3. Cumhurbaşkanlığı Kararnameleri
4. Yönetmelikler ve Tebliğler
5. Genel Tebliğler ve Sirkülerler
6. Özelgeler (GİB görüşleri)
7. Danıştay Kararları (içtihat)

VERGİ TÜRLERİ VE ORANLARI (2024):
- Gelir Vergisi: %15-40 (dilimli)
- Kurumlar Vergisi: %25 (standart)
- KDV: %1, %10, %20
- ÖTV: Ürüne göre değişir
- Damga Vergisi: Binde 9.48 (standart oran)

ÖNEMLİ NOT: Vergi mevzuatı sık değişmektedir. Tarih ve dönem bilgisi kritik önem taşır.',
    llm_config = '{
        "analyzePrompt": "Bu vergi mevzuatı belgesini analiz et. Kanun numarası, madde, fıkra ve bent numaralarını tam olarak çıkar. Tarih, resmi gazete bilgisi, özelge/karar numarası, vergi türü, konu, mükellef tipi, oran ve tutar bilgilerini belirle. İstisna ve muafiyet koşullarını listele.",
        "citationTemplate": "[{{vergi_turu}}] {{kanun_no}} Sayılı Kanun Md.{{madde_no}} ({{tarih}})",
        "chatbotContext": "Sen Türk vergi hukuku uzmanı bir asistansın. Gelir Vergisi, Kurumlar Vergisi, KDV, ÖTV ve diğer vergi konularında detaylı ve güncel bilgi ver. Yanıtlarında mutlaka kaynak göster (kanun, madde, özelge veya Danıştay kararı). Vergi oranları ve hadler için yılı belirt. Spekülatif yorumlardan kaçın, mevzuata dayalı yanıt ver.",
        "embeddingPrefix": "Vergi Mevzuatı: ",
        "transformRules": "Kanun numaralarını sayısal formata çevir. Madde numaralarını tam format olarak sakla. Tarihleri DD.MM.YYYY formatına standartlaştır. Vergi oranlarını yüzde olarak belirt. Tutarları TL cinsinden göster.",
        "questionGenerator": "Bu vergi mevzuatı belgesi hakkında mükellefin veya mali müşavirin sorabileceği pratik uygulama soruları öner: beyan süreleri, oran uygulaması, istisna koşulları, cezai yaptırımlar.",
        "searchContext": "Türk vergi hukuku, GVK, KVK, KDV, ÖTV, VUK, vergi istisnası, muafiyet, özelge, Danıştay kararı, vergi oranı, beyanname"
    }'::jsonb,
    updated_at = NOW()
WHERE schema_name = 'vergi_mevzuati';

-- ============================================
-- 3. ENHANCE EMLAKAI SCHEMA (Emlak Mevzuat Asistanı)
-- ============================================
UPDATE industry_presets
SET
    schema_description = 'Türk emlak ve imar hukuku, imar planları, plan notları, belediye kararları ve tapu mevzuatı',
    fields = '[
        {"key": "scope", "label": "Kapsam", "type": "category", "showInTags": true, "extractionHint": "TR (Türkiye geneli), İL adı (IZMIR, ANKARA), veya İLÇE adı (BORNOVA, CANKAYA)"},
        {"key": "doc_type", "label": "Belge Tipi", "type": "category", "showInTags": true, "extractionHint": "Kanun, Yönetmelik, Plan_Notu, İmar_Planı, Meclis_Karari, Danıştay_Karari, Genelge, Teknik_Şartname"},
        {"key": "plan_type", "label": "Plan Türü", "type": "category", "showInTags": true, "extractionHint": "Nazım İmar Planı (NİP), Uygulama İmar Planı (UİP), Koruma Amaçlı İmar Planı, Revizyon"},
        {"key": "topic", "label": "Konu", "type": "category", "showInTags": true, "extractionHint": "İnşaat hakkı, emsal, TAKS, kat yüksekliği, çekme mesafesi, otopark, sığınak, kentsel dönüşüm, kat mülkiyeti, kiraci hukuku"},
        {"key": "validity_year", "label": "Geçerlilik Yılı", "type": "number", "showInCitation": true, "extractionHint": "Planın veya kararın geçerli olduğu yıl"},
        {"key": "kanun_no", "label": "Kanun No", "type": "reference", "showInCitation": true, "extractionHint": "İmar Kanunu (3194), Kat Mülkiyeti (634), Kentsel Dönüşüm (6306)"},
        {"key": "madde_no", "label": "Madde", "type": "reference", "showInCitation": true, "extractionHint": "Madde numarası"},
        {"key": "karar_no", "label": "Karar No", "type": "reference", "showInCitation": true, "extractionHint": "Belediye Meclis kararı veya Danıştay karar numarası"},
        {"key": "tarih", "label": "Tarih", "type": "date", "format": "DD.MM.YYYY", "showInCitation": true, "extractionHint": "Onay veya yürürlük tarihi"},
        {"key": "emsal", "label": "Emsal (E)", "type": "number", "showInCitation": true, "extractionHint": "İnşaat alanı katsayısı (0.30, 1.00, 1.50, 2.00 vb.)"},
        {"key": "taks", "label": "TAKS", "type": "percentage", "showInCitation": true, "extractionHint": "Taban alanı kat sayısı (%25, %30, %40 vb.)"},
        {"key": "max_kat", "label": "Max Kat (Yençok)", "type": "string", "extractionHint": "İzin verilen maksimum kat sayısı veya yükseklik (metre)"},
        {"key": "min_parsel", "label": "Min Parsel Büyüklüğü", "type": "number", "extractionHint": "Minimum parsel alanı (m²)"},
        {"key": "cekme_mesafesi", "label": "Çekme Mesafesi", "type": "string", "extractionHint": "Ön, arka, yan bahçe mesafeleri (metre)"},
        {"key": "ada_no", "label": "Ada/Parsel", "type": "reference", "extractionHint": "Ada ve parsel numarası"},
        {"key": "fonksiyon", "label": "Fonksiyon Alanı", "type": "category", "showInTags": true, "extractionHint": "Konut, Ticaret, Sanayi, Karma, Yeşil Alan, Sosyal Tesis"}
    ]'::jsonb,
    templates = '{
        "analyze": "Bu emlak/imar mevzuatı belgesini analiz et:\n- Coğrafi kapsam (Türkiye geneli, il veya ilçe)\n- Belge tipi ve plan türü\n- Ana konu (emsal, TAKS, kat yüksekliği, çekme mesafesi vb.)\n- Kanun ve madde numarası\n- Karar numarası ve tarihi\n- Sayısal değerler: Emsal, TAKS, kat adedi, çekme mesafesi, parsel boyutu\n- Ada/parsel bilgisi varsa\n- Fonksiyon alanı ve özel koşullar",
        "citation": "[{{doc_type}}] {{scope}} - {{topic}} ({{tarih}})",
        "questions": [
            "{{scope}} bölgesinde {{topic}} için güncel kurallar nelerdir?",
            "{{scope}} plan notlarında emsal ve TAKS değerleri nedir?",
            "{{kanun_no}} sayılı kanunun {{madde_no}}. maddesi ne diyor?",
            "{{ada_no}} numaralı ada için imar durumu nedir?"
        ]
    }'::jsonb,
    llm_guide = 'Bu veri Türk emlak ve imar mevzuatını içermektedir.

TEMEL MEVZUAT:
- İmar Kanunu (3194)
- Planlı Alanlar İmar Yönetmeliği (PAİY)
- Kat Mülkiyeti Kanunu (634)
- Kentsel Dönüşüm Kanunu (6306)
- Tapu Kanunu (2644)
- Yapı Denetimi Hakkında Kanun (4708)

KAPSAM HİYERARŞİSİ:
- TR: Türkiye geneli (Kanun, Yönetmelik)
- İL: İl geneli (Büyükşehir Belediye kararları)
- İLÇE: İlçe özel (Plan notları, parsel bazlı)

ÖNEMLİ KURAL: Çakışma durumunda yerel plan notu > İl yönetmeliği > Ulusal mevzuat

İMAR DEĞERLERİ:
- EMSAL (E): İnşaat alanı / Arsa alanı (0.30-3.00 arası)
- TAKS: Taban alanı / Arsa alanı (%25-%60)
- YENÇOK: Maksimum bina yüksekliği (kat veya metre)
- ÇEKME MESAFESİ: Ön/Arka/Yan bahçe (3-10m arası)

PLAN TİPLERİ:
- Çevre Düzeni Planı (ÇDP)
- Nazım İmar Planı (NİP): 1/5000 - 1/25000
- Uygulama İmar Planı (UİP): 1/1000
- Parselasyon Planı
- İmar Planı Değişikliği (İPD)
- Koruma Amaçlı İmar Planı (KAİP)',
    llm_config = '{
        "analyzePrompt": "Bu imar/emlak mevzuatı belgesini analiz et. Coğrafi kapsam, belge tipi, plan türü, konu, kanun referansları, tarih ve tüm sayısal değerleri (emsal, TAKS, kat, çekme mesafesi, parsel boyutu) detaylı olarak çıkar. Ada/parsel bilgisi varsa not et.",
        "citationTemplate": "[{{doc_type}}] {{scope}} - {{topic}} | {{kanun_no}} Md.{{madde_no}} ({{tarih}})",
        "chatbotContext": "Sen Türk imar ve emlak hukuku uzmanı bir asistansın. İmar kanunu, plan notları, emsal hesaplama, kat mülkiyeti ve kentsel dönüşüm konularında detaylı bilgi ver. Yanıtlarında coğrafi kapsamı belirt (hangi il/ilçe için geçerli). Sayısal değerleri net olarak ver. Çakışma durumunda hangi mevzuatın geçerli olduğunu açıkla.",
        "embeddingPrefix": "Emlak Mevzuatı: ",
        "transformRules": "Emsal değerlerini ondalık formatta sakla. TAKS değerlerini yüzde olarak göster. Kat sayılarını tam sayı olarak belirt. Çekme mesafelerini metre cinsinden standartlaştır. İl ve ilçe isimlerini büyük harfe çevir.",
        "questionGenerator": "Bu imar belgesi hakkında mimar, mühendis veya vatandaşın sorabileceği pratik uygulama soruları öner: yapı ruhsatı, emsal hesabı, kat irtifakı, inşaat izni.",
        "searchContext": "İmar kanunu, imar planı, plan notu, emsal, TAKS, kat yüksekliği, çekme mesafesi, kat mülkiyeti, kentsel dönüşüm, tapu, belediye kararı"
    }'::jsonb,
    updated_at = NOW()
WHERE schema_name = 'emlak_mevzuati';

-- ============================================
-- 4. ADD NEW AKADEMIK INDUSTRY TO INDUSTRIES LIST
-- ============================================
-- (Automatically handled by industry_presets insert)

-- ============================================
-- 5. ADD COMMENT
-- ============================================
COMMENT ON TABLE industry_presets IS 'System-provided industry-specific schema templates with LLM config for Vergilex, EmlakAI, and Bookie instances';
