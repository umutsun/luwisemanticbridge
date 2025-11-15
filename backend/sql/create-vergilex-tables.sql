-- Vergilex Specialized Database Schema
-- For granular Turkish tax law document management
-- Created: 2025-01-16
-- Based on Gemini's feedback for improved article-level extraction

-- Drop tables if they exist (for clean setup)
DROP TABLE IF EXISTS vergi_maddeler CASCADE;
DROP TABLE IF EXISTS vergi_mevzuati CASCADE;

-- 1. Main legislation table (vergi_mevzuati)
CREATE TABLE IF NOT EXISTS vergi_mevzuati (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,

    -- Basic Information
    mevzuat_no VARCHAR(50),  -- e.g., "193", "3065", "213"
    mevzuat_adi TEXT NOT NULL,  -- e.g., "Gelir Vergisi Kanunu"
    mevzuat_turu VARCHAR(100),  -- Kanun, Tebliğ, Yönetmelik, Genelge, etc.

    -- Official Gazette Information
    resmi_gazete_tarihi DATE,
    resmi_gazete_sayisi VARCHAR(50),
    resmi_gazete_url TEXT,

    -- Dates
    kabul_tarihi DATE,
    yururluk_tarihi DATE,
    yayim_tarihi DATE,

    -- Content Summary
    konu TEXT,  -- Subject/topic
    amac TEXT,  -- Purpose
    kapsam TEXT,  -- Scope
    dayanak TEXT,  -- Legal basis

    -- Change History
    degistiren_mevzuat JSONB,  -- Array of modifying legislations
    degisiklik_tarihleri JSONB,  -- Array of modification dates
    mulgalik_durumu VARCHAR(50),  -- Yürürlükte, Kısmen Mülga, Tamamen Mülga
    mulga_eden_mevzuat VARCHAR(255),
    mulga_tarihi DATE,

    -- Structural Information
    toplam_madde_sayisi INTEGER,
    gecici_madde_sayisi INTEGER,
    ek_madde_sayisi INTEGER,
    kisim_sayisi INTEGER,
    bolum_sayisi INTEGER,

    -- Metadata
    kategori VARCHAR(100),  -- Gelir Vergisi, KDV, Damga Vergisi, etc.
    alt_kategori VARCHAR(100),
    etiketler TEXT[],  -- Tags for search
    ilgili_kurumlar TEXT[],  -- Related institutions

    -- Full Text Search
    tam_metin TEXT,  -- Full text for search
    ozet TEXT,  -- Summary
    anahtar_kelimeler TEXT[],  -- Keywords

    -- System Fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    extraction_metadata JSONB,  -- Store extraction details, confidence scores

    CONSTRAINT unique_mevzuat_no UNIQUE(mevzuat_no, mevzuat_turu)
);

-- 2. Article-level table (vergi_maddeler)
CREATE TABLE IF NOT EXISTS vergi_maddeler (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mevzuat_id UUID REFERENCES vergi_mevzuati(id) ON DELETE CASCADE,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,

    -- Article Identification
    madde_no VARCHAR(50) NOT NULL,  -- "1", "Geçici 1", "Ek 3", etc.
    madde_tipi VARCHAR(50) DEFAULT 'normal',  -- normal, gecici, ek, mukerrer

    -- Article Content
    baslik TEXT,  -- Article title/heading
    metin TEXT NOT NULL,  -- Full article text

    -- Structured Components
    fikralar JSONB,  -- Paragraphs: ["(1) First paragraph...", "(2) Second..."]
    bentler JSONB,  -- Sub-items: ["a) First item...", "b) Second..."]
    alt_bentler JSONB,  -- Sub-sub-items: nested structure

    -- References and Relations
    atiflar JSONB,  -- References to other laws/articles
    ilgili_maddeler UUID[],  -- Related articles in same law
    dis_atiflar JSONB,  -- External references with details

    -- Change Tracking
    degisiklik_durumu VARCHAR(50),  -- Original, Değişik, Ek, İptal
    degistiren_kanun VARCHAR(255),
    degisiklik_tarihi DATE,
    degisiklik_detayi TEXT,
    eski_hali TEXT,  -- Previous version of the article

    -- Semantic Information
    konu_basliklari TEXT[],  -- Topic headers
    vergi_turleri TEXT[],  -- Tax types mentioned
    oranlar JSONB,  -- Tax rates: {"kdv": "18", "stopaj": "15"}
    tutarlar JSONB,  -- Amounts: {"muafiyet": "50000", "birim": "TL"}
    sureler JSONB,  -- Deadlines: {"beyan": "30 gün", "odeme": "15 gün"}

    -- Application Details
    uygulama_esaslari TEXT,
    istisnalar TEXT,
    muafiyetler TEXT,
    ceza_hukumleri TEXT,

    -- Search and Analysis
    madde_ozeti TEXT,  -- Article summary
    anahtar_kavramlar TEXT[],  -- Key concepts
    madde_puani NUMERIC,  -- Importance score (0-100)
    sik_kullanilan BOOLEAN DEFAULT false,

    -- Embeddings and Vectors (for semantic search)
    embedding VECTOR(1536),  -- For similarity search
    embedding_model VARCHAR(100),

    -- System Fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    extraction_confidence NUMERIC,  -- Confidence score of extraction

    CONSTRAINT unique_madde_per_mevzuat UNIQUE(mevzuat_id, madde_no, madde_tipi)
);

-- 3. Indexes for performance
CREATE INDEX idx_mevzuati_mevzuat_no ON vergi_mevzuati(mevzuat_no);
CREATE INDEX idx_mevzuati_turu ON vergi_mevzuati(mevzuat_turu);
CREATE INDEX idx_mevzuati_kategori ON vergi_mevzuati(kategori);
CREATE INDEX idx_mevzuati_yururluk ON vergi_mevzuati(yururluk_tarihi);
CREATE INDEX idx_mevzuati_document_id ON vergi_mevzuati(document_id);

CREATE INDEX idx_maddeler_mevzuat_id ON vergi_maddeler(mevzuat_id);
CREATE INDEX idx_maddeler_madde_no ON vergi_maddeler(madde_no);
CREATE INDEX idx_maddeler_madde_tipi ON vergi_maddeler(madde_tipi);
CREATE INDEX idx_maddeler_degisiklik ON vergi_maddeler(degisiklik_durumu);
CREATE INDEX idx_maddeler_document_id ON vergi_maddeler(document_id);

-- Full text search indexes
CREATE INDEX idx_mevzuati_fulltext ON vergi_mevzuati USING gin(to_tsvector('turkish', tam_metin));
CREATE INDEX idx_maddeler_fulltext ON vergi_maddeler USING gin(to_tsvector('turkish', metin));
CREATE INDEX idx_madde_baslik_fulltext ON vergi_maddeler USING gin(to_tsvector('turkish', baslik));

-- Array field indexes
CREATE INDEX idx_mevzuati_etiketler ON vergi_mevzuati USING gin(etiketler);
CREATE INDEX idx_mevzuati_keywords ON vergi_mevzuati USING gin(anahtar_kelimeler);
CREATE INDEX idx_maddeler_kavramlar ON vergi_maddeler USING gin(anahtar_kavramlar);

-- JSONB indexes for faster queries
CREATE INDEX idx_maddeler_atiflar ON vergi_maddeler USING gin(atiflar);
CREATE INDEX idx_maddeler_oranlar ON vergi_maddeler USING gin(oranlar);
CREATE INDEX idx_maddeler_sureler ON vergi_maddeler USING gin(sureler);

-- 4. Helper functions

-- Function to search articles by reference
CREATE OR REPLACE FUNCTION search_by_reference(ref_text TEXT)
RETURNS TABLE(
    madde_id UUID,
    mevzuat_adi TEXT,
    madde_no VARCHAR,
    madde_metni TEXT,
    atiflar JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        v.mevzuat_adi,
        m.madde_no,
        m.metin,
        m.atiflar
    FROM vergi_maddeler m
    JOIN vergi_mevzuati v ON m.mevzuat_id = v.id
    WHERE m.atiflar::text ILIKE '%' || ref_text || '%'
    OR m.dis_atiflar::text ILIKE '%' || ref_text || '%';
END;
$$ LANGUAGE plpgsql;

-- Function to get article with its modifications history
CREATE OR REPLACE FUNCTION get_article_history(p_mevzuat_no VARCHAR, p_madde_no VARCHAR)
RETURNS TABLE(
    madde_no VARCHAR,
    baslik TEXT,
    metin TEXT,
    degisiklik_durumu VARCHAR,
    degistiren_kanun VARCHAR,
    degisiklik_tarihi DATE,
    eski_hali TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.madde_no,
        m.baslik,
        m.metin,
        m.degisiklik_durumu,
        m.degistiren_kanun,
        m.degisiklik_tarihi,
        m.eski_hali
    FROM vergi_maddeler m
    JOIN vergi_mevzuati v ON m.mevzuat_id = v.id
    WHERE v.mevzuat_no = p_mevzuat_no
    AND m.madde_no = p_madde_no
    ORDER BY m.degisiklik_tarihi DESC;
END;
$$ LANGUAGE plpgsql;

-- 5. Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_vergi_mevzuati_updated_at
    BEFORE UPDATE ON vergi_mevzuati
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vergi_maddeler_updated_at
    BEFORE UPDATE ON vergi_maddeler
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 6. View for commonly accessed data
CREATE OR REPLACE VIEW v_mevzuat_overview AS
SELECT
    m.id,
    m.mevzuat_no,
    m.mevzuat_adi,
    m.mevzuat_turu,
    m.kategori,
    m.yururluk_tarihi,
    m.mulgalik_durumu,
    m.toplam_madde_sayisi,
    COUNT(DISTINCT md.id) as extracted_madde_sayisi,
    m.created_at,
    m.updated_at
FROM vergi_mevzuati m
LEFT JOIN vergi_maddeler md ON m.id = md.mevzuat_id
GROUP BY m.id;

-- 7. Comments for documentation
COMMENT ON TABLE vergi_mevzuati IS 'Main table for Turkish tax legislation documents';
COMMENT ON TABLE vergi_maddeler IS 'Granular table for individual articles within legislation';
COMMENT ON COLUMN vergi_mevzuati.mevzuat_no IS 'Unique legislation number (e.g., 193 for Income Tax Law)';
COMMENT ON COLUMN vergi_maddeler.madde_no IS 'Article number including temporary and additional articles';
COMMENT ON COLUMN vergi_maddeler.atiflar IS 'Internal and external references in JSON format';
COMMENT ON COLUMN vergi_maddeler.oranlar IS 'Tax rates mentioned in the article';
COMMENT ON COLUMN vergi_maddeler.sureler IS 'Deadlines and time periods mentioned';