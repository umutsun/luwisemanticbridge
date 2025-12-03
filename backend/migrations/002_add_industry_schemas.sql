-- Migration: Add Industry Schema Support
-- Date: 2024-12-03
-- Description: Adds industry presets and user-specific schema support

-- ============================================
-- 1. INDUSTRY PRESETS TABLE
-- Read-only sector templates provided by system
-- ============================================
CREATE TABLE IF NOT EXISTS industry_presets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Industry identification
    industry_code VARCHAR(50) NOT NULL,      -- 'emlak', 'hukuk', 'finans', 'saglik'
    industry_name VARCHAR(100) NOT NULL,     -- 'Gayrimenkul', 'Hukuk', 'Finans', 'Sağlık'
    industry_icon VARCHAR(50),               -- Emoji or icon name

    -- Schema definition
    schema_name VARCHAR(100) NOT NULL,       -- 'emlak_mevzuati', 'vergi_mevzuati'
    schema_display_name VARCHAR(200) NOT NULL,
    schema_description TEXT,

    -- Schema content (JSON)
    fields JSONB NOT NULL DEFAULT '[]',
    templates JSONB NOT NULL DEFAULT '{}',   -- citation, questions, analyze
    llm_guide TEXT,

    -- Pricing tier
    tier VARCHAR(20) DEFAULT 'free',         -- 'free', 'pro', 'enterprise'

    -- Metadata
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Unique constraint: one schema per industry
    UNIQUE(industry_code, schema_name)
);

-- ============================================
-- 2. USER SCHEMAS TABLE
-- User's custom or cloned schemas
-- ============================================
CREATE TABLE IF NOT EXISTS user_schemas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    -- Schema identification
    name VARCHAR(100) NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    description TEXT,

    -- Source tracking
    source_type VARCHAR(20) DEFAULT 'custom', -- 'custom', 'cloned', 'imported'
    source_preset_id UUID REFERENCES industry_presets(id) ON DELETE SET NULL,

    -- Schema content (JSON)
    fields JSONB NOT NULL DEFAULT '[]',
    templates JSONB NOT NULL DEFAULT '{}',
    llm_guide TEXT,

    -- User preferences
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Unique: one schema name per user
    UNIQUE(user_id, name)
);

-- ============================================
-- 3. USER INDUSTRY PREFERENCE
-- Add industry preference to users table
-- ============================================
ALTER TABLE users
ADD COLUMN IF NOT EXISTS industry VARCHAR(50),
ADD COLUMN IF NOT EXISTS active_schema_id UUID,
ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) DEFAULT 'free';

-- ============================================
-- 4. USER SCHEMA SETTINGS
-- Additional settings per user for schema behavior
-- ============================================
CREATE TABLE IF NOT EXISTS user_schema_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,

    -- Active selections
    active_schema_id UUID,                   -- Can be user_schema or preset
    active_schema_type VARCHAR(20),          -- 'preset' or 'custom'

    -- Global settings
    enable_auto_detect BOOLEAN DEFAULT true,
    max_fields_in_citation INTEGER DEFAULT 4,
    max_questions INTEGER DEFAULT 3,

    -- Preferences
    preferred_industry VARCHAR(50),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 5. INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_industry_presets_code ON industry_presets(industry_code);
CREATE INDEX IF NOT EXISTS idx_industry_presets_tier ON industry_presets(tier);
CREATE INDEX IF NOT EXISTS idx_user_schemas_user_id ON user_schemas(user_id);
CREATE INDEX IF NOT EXISTS idx_user_schemas_source ON user_schemas(source_preset_id);
CREATE INDEX IF NOT EXISTS idx_users_industry ON users(industry);

-- ============================================
-- 6. INSERT DEFAULT INDUSTRY PRESETS
-- ============================================

-- Emlak (Gayrimenkul) Industry
INSERT INTO industry_presets (
    industry_code, industry_name, industry_icon,
    schema_name, schema_display_name, schema_description,
    fields, templates, llm_guide, tier, sort_order
) VALUES
(
    'emlak', 'Gayrimenkul', '🏠',
    'emlak_mevzuati', 'Emlak Mevzuatı', 'İmar kanunları, plan notları, belediye kararları ve emlak hukuku',
    '[
        {"key": "scope", "label": "Kapsam", "type": "category", "showInTags": true, "extractionHint": "TR (Türkiye geneli), İL adı (IZMIR), veya İLÇE adı (BORNOVA, KARSIYAKA)"},
        {"key": "doc_type", "label": "Belge Tipi", "type": "category", "showInTags": true, "extractionHint": "Kanun, Yönetmelik, Plan_Notu, Meclis_Karari, Emsal_Karar, Teknik_Sartname"},
        {"key": "topic", "label": "Konu", "type": "category", "showInTags": true, "extractionHint": "Insaat_Hakki, Emsal, Kentsel_Donusum, Kiraci_Hukuku, Otopark, Siginak"},
        {"key": "validity_year", "label": "Geçerlilik Yılı", "type": "number", "showInCitation": true},
        {"key": "kanun_no", "label": "Kanun No", "type": "reference", "showInCitation": true},
        {"key": "madde_no", "label": "Madde", "type": "reference", "showInCitation": true},
        {"key": "tarih", "label": "Tarih", "type": "date", "format": "DD.MM.YYYY", "showInCitation": true},
        {"key": "emsal", "label": "Emsal", "type": "number"},
        {"key": "taks", "label": "TAKS", "type": "percentage"},
        {"key": "max_kat", "label": "Max Kat", "type": "number"}
    ]'::jsonb,
    '{
        "analyze": "Bu belgeyi analiz et ve aşağıdaki bilgileri çıkar:\n- Coğrafi kapsam (Türkiye geneli mi, hangi il/ilçe?)\n- Belge tipi (Kanun, Yönetmelik, Plan Notu, Meclis Kararı?)\n- Ana konu (İnşaat hakkı, emsal, kentsel dönüşüm?)\n- Geçerlilik yılı\n- Kanun/madde numaraları\n- Emsal, TAKS, kat yüksekliği gibi sayısal değerler",
        "citation": "{{doc_type}} - {{scope}} - {{topic}}",
        "questions": [
            "{{scope}} bölgesinde {{topic}} hakkında güncel kurallar nelerdir?",
            "{{kanun_no}} sayılı kanunun {{madde_no}}. maddesi ne diyor?",
            "{{scope}} için emsal ve TAKS değerleri nedir?"
        ]
    }'::jsonb,
    'Bu veri Türk emlak ve imar mevzuatını içermektedir.

KAPSAM HİYERARŞİSİ (scope):
- TR: Türkiye geneli geçerli (Anayasa, İmar Kanunu, Planlı Alanlar Yönetmeliği)
- İL (örn: IZMIR): İl geneli (Büyükşehir Belediye yönetmelikleri)
- İLÇE (örn: BORNOVA): İlçe özel (Plan notları, parsel bazlı kararlar)

ÇAKIŞMA KURALI: Yerel plan notu > İl yönetmeliği > Ulusal mevzuat

TEMEL KAYNAKLAR:
- İmar Kanunu (3194)
- Planlı Alanlar İmar Yönetmeliği
- Kat Mülkiyeti Kanunu (634)
- Kentsel Dönüşüm Kanunu (6306)',
    'free', 1
),
(
    'emlak', 'Gayrimenkul', '🏠',
    'emlak_ilanlari', 'Emlak İlanları', 'Gayrimenkul satış ve kiralama ilanları analizi',
    '[
        {"key": "fiyat", "label": "Fiyat", "type": "currency", "showInCitation": true},
        {"key": "metrekare", "label": "m²", "type": "number", "showInCitation": true},
        {"key": "oda_sayisi", "label": "Oda", "type": "string", "showInCitation": true},
        {"key": "il", "label": "İl", "type": "string", "showInTags": true},
        {"key": "ilce", "label": "İlçe", "type": "string", "showInTags": true},
        {"key": "mahalle", "label": "Mahalle", "type": "string"},
        {"key": "emlak_tipi", "label": "Emlak Tipi", "type": "category", "showInTags": true}
    ]'::jsonb,
    '{
        "analyze": "Bu emlak ilanını analiz et:\n- Fiyat (TL)\n- Metrekare\n- Oda sayısı\n- Konum (il, ilçe, mahalle)\n- Emlak tipi",
        "citation": "{{emlak_tipi}} - {{oda_sayisi}} - {{metrekare}}m² - {{fiyat}}",
        "questions": [
            "{{ilce}} bölgesinde benzer fiyatlı ilanlar var mı?",
            "{{metrekare}}m² civarı emlakların fiyat ortalaması nedir?"
        ]
    }'::jsonb,
    'Türkiye emlak piyasası ilan verileri. Fiyatlar TL cinsindendir. Oda sayısı 3+1 formatındadır.',
    'pro', 2
),

-- Hukuk Industry
(
    'hukuk', 'Hukuk', '⚖️',
    'vergi_mevzuati', 'Vergi Mevzuatı', 'Türk vergi kanunları, özelgeler ve Danıştay kararları',
    '[
        {"key": "kanun_no", "label": "Kanun No", "type": "reference", "showInCitation": true},
        {"key": "madde_no", "label": "Madde", "type": "reference", "showInCitation": true},
        {"key": "tarih", "label": "Tarih", "type": "date", "format": "DD.MM.YYYY", "showInCitation": true},
        {"key": "ozelge_no", "label": "Özelge No", "type": "reference"},
        {"key": "karar_no", "label": "Karar No", "type": "reference"},
        {"key": "konu", "label": "Konu", "type": "category", "showInTags": true},
        {"key": "vergi_turu", "label": "Vergi Türü", "type": "category", "showInTags": true}
    ]'::jsonb,
    '{
        "analyze": "Bu belgeyi analiz et:\n- Kanun ve madde numarası\n- Tarih\n- Özelge veya karar numarası\n- Konu ve vergi türü",
        "citation": "{{vergi_turu}} - {{kanun_no}} Md.{{madde_no}}",
        "questions": [
            "{{madde_no}}. maddenin uygulama esasları nelerdir?",
            "{{kanun_no}} sayılı kanundaki istisnalar nelerdir?"
        ]
    }'::jsonb,
    'Türk vergi mevzuatı verileri. Kaynaklar: GVK (193), KVK (5520), KDV (3065), VUK (213).',
    'free', 1
),

-- Genel (Default)
(
    'genel', 'Genel', '📄',
    'genel_dokuman', 'Genel Doküman', 'Varsayılan genel amaçlı şema',
    '[
        {"key": "baslik", "label": "Başlık", "type": "string", "showInCitation": true},
        {"key": "tarih", "label": "Tarih", "type": "date", "format": "DD.MM.YYYY"},
        {"key": "kategori", "label": "Kategori", "type": "category", "showInTags": true},
        {"key": "yazar", "label": "Yazar", "type": "entity"},
        {"key": "kaynak", "label": "Kaynak", "type": "string"}
    ]'::jsonb,
    '{
        "analyze": "Bu belgeyi analiz et:\n- Başlık veya ana konu\n- Tarih\n- Kategori\n- Yazar veya kaynak",
        "citation": "{{baslik}}",
        "questions": [
            "{{baslik}} hakkında daha fazla bilgi",
            "{{kategori}} konusunda başka kaynaklar var mı?"
        ]
    }'::jsonb,
    'Genel amaçlı doküman. Yapısal bilgiler mevcut değilse içerikten anlam çıkar.',
    'free', 99
)
ON CONFLICT (industry_code, schema_name) DO UPDATE SET
    industry_name = EXCLUDED.industry_name,
    schema_display_name = EXCLUDED.schema_display_name,
    schema_description = EXCLUDED.schema_description,
    fields = EXCLUDED.fields,
    templates = EXCLUDED.templates,
    llm_guide = EXCLUDED.llm_guide,
    tier = EXCLUDED.tier,
    updated_at = NOW();

-- ============================================
-- 7. UPDATE TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_schema_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_industry_presets_timestamp ON industry_presets;
CREATE TRIGGER update_industry_presets_timestamp
    BEFORE UPDATE ON industry_presets
    FOR EACH ROW EXECUTE FUNCTION update_schema_timestamp();

DROP TRIGGER IF EXISTS update_user_schemas_timestamp ON user_schemas;
CREATE TRIGGER update_user_schemas_timestamp
    BEFORE UPDATE ON user_schemas
    FOR EACH ROW EXECUTE FUNCTION update_schema_timestamp();

-- ============================================
-- 8. HELPER VIEW
-- Combined view of all available schemas for a user
-- ============================================
CREATE OR REPLACE VIEW user_available_schemas AS
SELECT
    ip.id,
    ip.industry_code,
    ip.schema_name as name,
    ip.schema_display_name as display_name,
    ip.schema_description as description,
    ip.fields,
    ip.templates,
    ip.llm_guide,
    ip.tier,
    'preset' as schema_type,
    NULL::uuid as user_id,
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
    us.name,
    us.display_name,
    us.description,
    us.fields,
    us.templates,
    us.llm_guide,
    'custom' as tier,
    'custom' as schema_type,
    us.user_id,
    us.is_active,
    us.is_default,
    us.created_at,
    us.updated_at
FROM user_schemas us
LEFT JOIN industry_presets ip ON us.source_preset_id = ip.id
WHERE us.is_active = true;

COMMENT ON TABLE industry_presets IS 'System-provided industry-specific schema templates';
COMMENT ON TABLE user_schemas IS 'User-created or cloned custom schemas';
COMMENT ON TABLE user_schema_settings IS 'User preferences for schema selection and behavior';
