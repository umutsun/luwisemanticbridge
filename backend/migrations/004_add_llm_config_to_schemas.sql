-- Migration: Add LLM Config Support to Schemas
-- Date: 2024-12-16
-- Description: Adds llm_config JSONB column to user_schemas and industry_presets
--              for comprehensive LLM integration across all processes

-- ============================================
-- 1. ADD LLM_CONFIG TO USER_SCHEMAS
-- ============================================
ALTER TABLE user_schemas
ADD COLUMN IF NOT EXISTS llm_config JSONB DEFAULT '{}'::jsonb;

-- ============================================
-- 2. ADD LLM_CONFIG TO INDUSTRY_PRESETS
-- ============================================
ALTER TABLE industry_presets
ADD COLUMN IF NOT EXISTS llm_config JSONB DEFAULT '{}'::jsonb;

-- ============================================
-- 3. COMMENT ON STRUCTURE
-- ============================================
COMMENT ON COLUMN user_schemas.llm_config IS 'LLM configuration for various processes. Structure:
{
  "analyzePrompt": "...",       -- Document analysis prompt
  "citationTemplate": "...",    -- Citation formatting template
  "chatbotContext": "...",      -- Chatbot system context
  "embeddingPrefix": "...",     -- Embedding generation prefix
  "transformRules": "...",      -- Transform process rules
  "questionGenerator": "...",   -- Follow-up question generation
  "searchContext": "..."        -- Semantic search context
}';

COMMENT ON COLUMN industry_presets.llm_config IS 'LLM configuration for industry preset. Same structure as user_schemas.llm_config';

-- ============================================
-- 4. UPDATE EXISTING PRESETS WITH DEFAULT LLM CONFIG
-- ============================================

-- Emlak Mevzuatı preset
UPDATE industry_presets
SET llm_config = '{
  "analyzePrompt": "Bu emlak mevzuatı belgesini analiz et. İmar kanunları, plan notları, emsal değerleri ve yapı kurallarına odaklan. Coğrafi kapsam (TR, il, ilçe) ve belge tipini (kanun, yönetmelik, plan notu) belirle.",
  "citationTemplate": "[{{doc_type}}] {{scope}} - {{topic}} ({{tarih}})",
  "chatbotContext": "Sen Türk emlak mevzuatı konusunda uzman bir asistansın. İmar kanunları, kat mülkiyeti, kentsel dönüşüm ve belediye yönetmelikleri hakkında bilgi ver. Yanıtlarında mutlaka kaynak belirt.",
  "embeddingPrefix": "Emlak Mevzuatı: ",
  "transformRules": "Metinde geçen emsal değerlerini, TAKS oranlarını, kat yüksekliklerini ve yasal referansları çıkar. Tarih formatlarını DD.MM.YYYY olarak standartlaştır.",
  "questionGenerator": "Bu belgede geçen {{topic}} konusu hakkında kullanıcının sorabileceği takip soruları öner.",
  "searchContext": "Türk emlak ve imar hukuku, gayrimenkul mevzuatı, belediye yönetmelikleri"
}'::jsonb
WHERE schema_name = 'emlak_mevzuati';

-- Emlak İlanları preset
UPDATE industry_presets
SET llm_config = '{
  "analyzePrompt": "Bu emlak ilanını analiz et. Fiyat, metrekare, oda sayısı, konum ve emlak özelliklerini çıkar. Fiyat/m2 oranını hesapla.",
  "citationTemplate": "{{emlak_tipi}} {{oda_sayisi}} - {{ilce}}/{{il}} - {{fiyat}} TL",
  "chatbotContext": "Sen bir emlak danışmanısın. Emlak ilanları hakkında sorulara yanıt ver. Fiyat karşılaştırmaları, konum analizleri ve piyasa değerlendirmeleri yap.",
  "embeddingPrefix": "Emlak İlanı: ",
  "transformRules": "Fiyatları TL cinsinden, metrekareleri sayısal olarak, oda sayısını standart formatta (3+1) çıkar. Konum bilgilerini il/ilçe/mahalle hiyerarşisinde düzenle.",
  "questionGenerator": "Bu ilanla ilgili {{ilce}} bölgesindeki benzer fiyatlı diğer ilanlar veya {{emlak_tipi}} piyasa analizi hakkında sorular öner.",
  "searchContext": "Türkiye emlak ilanları, gayrimenkul piyasası, konut fiyatları"
}'::jsonb
WHERE schema_name = 'emlak_ilanlari';

-- Vergi Mevzuatı preset
UPDATE industry_presets
SET llm_config = '{
  "analyzePrompt": "Bu vergi mevzuatı belgesini analiz et. Kanun numarası, madde, özelge veya Danıştay kararı bilgilerini çıkar. Vergi türünü ve konusunu belirle.",
  "citationTemplate": "[{{vergi_turu}}] {{kanun_no}} Sayılı Kanun Md.{{madde_no}} ({{tarih}})",
  "chatbotContext": "Sen Türk vergi hukuku uzmanısın. Gelir Vergisi, Kurumlar Vergisi, KDV ve diğer vergi konularında bilgi ver. Özelge ve Danıştay kararlarına atıf yap. Yasal referansları mutlaka belirt.",
  "embeddingPrefix": "Vergi Mevzuatı: ",
  "transformRules": "Kanun numaralarını, madde numaralarını, özelge numaralarını ve tarihleri standart formata çevir. Vergi oranlarını ve istisnalarını listele.",
  "questionGenerator": "Bu belgedeki {{vergi_turu}} konusu veya {{madde_no}}. madde hakkında kullanıcının merak edebileceği sorular öner.",
  "searchContext": "Türk vergi hukuku, gelir vergisi, kurumlar vergisi, KDV, VUK, özelge, Danıştay kararı"
}'::jsonb
WHERE schema_name = 'vergi_mevzuati';

-- Genel Doküman preset
UPDATE industry_presets
SET llm_config = '{
  "analyzePrompt": "Bu belgeyi analiz et. Ana konuyu, önemli bilgileri ve yapısal öğeleri çıkar.",
  "citationTemplate": "{{baslik}} ({{tarih}})",
  "chatbotContext": "Bu belge hakkında sorulara yanıt ver. Belgedeki bilgileri doğrudan referans alarak yanıtla.",
  "embeddingPrefix": "Doküman: ",
  "transformRules": "Metin içindeki anahtar bilgileri, tarihleri ve önemli kavramları çıkar.",
  "questionGenerator": "Bu belgenin içeriği hakkında kullanıcının ilgilenebileceği sorular öner.",
  "searchContext": "Genel doküman, metin analizi"
}'::jsonb
WHERE schema_name = 'genel_dokuman';

-- ============================================
-- 5. CREATE INDEX FOR JSONB QUERIES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_user_schemas_llm_config ON user_schemas USING gin(llm_config);
CREATE INDEX IF NOT EXISTS idx_industry_presets_llm_config ON industry_presets USING gin(llm_config);

-- ============================================
-- 6. UPDATE VIEW TO INCLUDE LLM_CONFIG
-- ============================================
DROP VIEW IF EXISTS user_available_schemas;

CREATE OR REPLACE VIEW user_available_schemas AS
SELECT
    ip.id,
    ip.industry_code,
    ip.industry_name,
    ip.industry_icon,
    ip.schema_name as name,
    ip.schema_display_name as display_name,
    ip.schema_description as description,
    ip.fields,
    ip.templates,
    ip.llm_guide,
    ip.llm_config,
    ip.tier,
    'preset' as schema_type,
    true as is_system,
    NULL::uuid as user_id,
    NULL::uuid as source_preset_id,
    ip.is_active,
    false as is_default,
    ip.created_at,
    ip.updated_at
FROM industry_presets ip
WHERE ip.is_active = true

UNION ALL

SELECT
    us.id,
    COALESCE(ip.industry_code, 'custom') as industry_code,
    COALESCE(ip.industry_name, 'Özel') as industry_name,
    COALESCE(ip.industry_icon, '📝') as industry_icon,
    us.name,
    us.display_name,
    us.description,
    us.fields,
    us.templates,
    us.llm_guide,
    us.llm_config,
    'custom' as tier,
    'custom' as schema_type,
    false as is_system,
    us.user_id,
    us.source_preset_id,
    us.is_active,
    us.is_default,
    us.created_at,
    us.updated_at
FROM user_schemas us
LEFT JOIN industry_presets ip ON us.source_preset_id = ip.id
WHERE us.is_active = true;

COMMENT ON VIEW user_available_schemas IS 'Combined view of all available schemas (presets + user schemas) with LLM config';
