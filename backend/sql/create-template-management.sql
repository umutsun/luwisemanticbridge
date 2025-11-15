-- Template Management System for LSEMB
-- Store document analysis templates in master database
-- Created: 2025-11-16

-- Drop existing table if needed
DROP TABLE IF EXISTS document_templates CASCADE;

-- Create templates table
CREATE TABLE document_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),

    -- Template configuration
    focus_keywords TEXT[],
    subcategories JSONB,
    target_fields TEXT[],
    extraction_prompt TEXT,

    -- Folder mapping for smart categorization
    folder_patterns TEXT[], -- e.g., ['docs/murgan/*', 'docs/vergi/*']
    auto_detect_rules JSONB, -- Rules for automatic template detection

    -- SQL Schema generation
    table_schema JSONB, -- Define table structure for this template
    custom_extractors JSONB, -- Custom extraction logic

    -- Metadata
    is_active BOOLEAN DEFAULT true,
    is_system BOOLEAN DEFAULT false, -- System templates can't be deleted
    priority INTEGER DEFAULT 100, -- Higher priority templates are checked first

    -- Versioning
    version INTEGER DEFAULT 1,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_templates_template_id ON document_templates(template_id);
CREATE INDEX idx_templates_category ON document_templates(category);
CREATE INDEX idx_templates_is_active ON document_templates(is_active);
CREATE INDEX idx_templates_priority ON document_templates(priority DESC);

-- Insert default templates
INSERT INTO document_templates (
    template_id, name, description, category,
    focus_keywords, subcategories, target_fields, extraction_prompt,
    folder_patterns, table_schema, is_system
) VALUES
-- Turkish Tax Law Template (formerly murgan)
(
    'turkish_tax_law',
    'Turkish Tax Law (Vergi Hukuku)',
    'Template for Turkish tax legislation documents',
    'Legal',
    ARRAY['vergi', 'kanun', 'madde', 'resmi gazete', 'tebliğ', 'yönetmelik'],
    '{
        "kanun": "Vergi Kanunu",
        "genel_teblig": "Genel Tebliğ",
        "sirkuler": "Sirküler",
        "ozelge": "Özelge",
        "kararname": "Kararname",
        "yonetmelik": "Yönetmelik",
        "genelge": "Genelge",
        "danistay": "Danıştay Kararı"
    }'::jsonb,
    ARRAY['title', 'mevzuatNo', 'mevzuatAdi', 'maddeler', 'resmiGazete', 'yururlukTarihi'],
    'Extract Turkish tax law metadata including all articles (maddeler) as structured objects',
    ARRAY['docs/murgan/**', 'docs/vergi/**', 'docs/*MEVZUAT*/**'],
    '{
        "tables": [
            {
                "name": "vergi_mevzuati",
                "fields": [
                    {"name": "mevzuat_no", "type": "VARCHAR(50)"},
                    {"name": "mevzuat_adi", "type": "TEXT"},
                    {"name": "mevzuat_turu", "type": "VARCHAR(100)"},
                    {"name": "tam_metin", "type": "TEXT"}
                ]
            },
            {
                "name": "vergi_maddeler",
                "fields": [
                    {"name": "madde_no", "type": "VARCHAR(50)"},
                    {"name": "metin", "type": "TEXT"},
                    {"name": "atiflar", "type": "JSONB"}
                ]
            }
        ]
    }'::jsonb,
    true
),
-- General Legal Template
(
    'legal',
    'General Legal Document',
    'Template for general legal documents',
    'Legal',
    ARRAY['kanun', 'madde', 'yönetmelik', 'tüzük', 'resmi gazete'],
    '{
        "kanun": "Kanun",
        "yonetmelik": "Yönetmelik",
        "tuzuk": "Tüzük",
        "kararname": "Kararname"
    }'::jsonb,
    ARRAY['title', 'kanunNo', 'maddeler', 'yürürlükTarihi'],
    'Extract legal document metadata with articles',
    ARRAY['docs/legal/**', 'docs/hukuk/**'],
    '{
        "tables": [
            {
                "name": "legal_documents",
                "fields": [
                    {"name": "document_no", "type": "VARCHAR(100)"},
                    {"name": "document_name", "type": "TEXT"},
                    {"name": "content", "type": "TEXT"}
                ]
            }
        ]
    }'::jsonb,
    true
),
-- Novel/Book Template
(
    'novel',
    'Novel / E-Book',
    'Template for books and novels',
    'Literature',
    ARRAY['character', 'plot', 'chapter', 'protagonist', 'yazar'],
    '{
        "roman": "Roman",
        "hikaye": "Hikaye",
        "deneme": "Deneme",
        "siir": "Şiir"
    }'::jsonb,
    ARRAY['title', 'author', 'summary', 'chapters', 'characters'],
    'Extract book metadata including chapters and characters',
    ARRAY['docs/books/**', 'docs/kitaplar/**'],
    NULL,
    true
),
-- Sheet Music Template
(
    'sheet_music',
    'Sheet Music / Musical Score',
    'Template for musical scores and sheet music',
    'Music',
    ARRAY['composer', 'makam', 'usul', 'nota', 'beste'],
    '{
        "klasik": "Klasik Türk Müziği",
        "halk": "Türk Halk Müziği",
        "pop": "Pop Müzik"
    }'::jsonb,
    ARRAY['title', 'composer', 'makam', 'usul', 'lyrics'],
    'Extract musical metadata including makam and usul',
    ARRAY['docs/music/**', 'docs/muzik/**', 'docs/notalar/**'],
    NULL,
    true
);

-- Function to get template by folder path
CREATE OR REPLACE FUNCTION get_template_by_path(file_path TEXT)
RETURNS document_templates AS $$
DECLARE
    template_record document_templates;
    pattern TEXT;
BEGIN
    -- Check each template's folder patterns
    FOR template_record IN
        SELECT * FROM document_templates
        WHERE is_active = true
        ORDER BY priority DESC, created_at ASC
    LOOP
        IF template_record.folder_patterns IS NOT NULL THEN
            FOREACH pattern IN ARRAY template_record.folder_patterns
            LOOP
                -- Convert glob pattern to SQL LIKE pattern
                IF file_path LIKE REPLACE(REPLACE(pattern, '**', '%'), '*', '%') THEN
                    RETURN template_record;
                END IF;
            END LOOP;
        END IF;
    END LOOP;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to get template by keywords
CREATE OR REPLACE FUNCTION get_template_by_keywords(content_text TEXT, limit_count INT DEFAULT 1)
RETURNS TABLE(
    template_id VARCHAR,
    name VARCHAR,
    match_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        dt.template_id,
        dt.name,
        COUNT(*) as match_count
    FROM document_templates dt,
         UNNEST(dt.focus_keywords) as keyword
    WHERE dt.is_active = true
    AND content_text ILIKE '%' || keyword || '%'
    GROUP BY dt.template_id, dt.name, dt.priority
    ORDER BY dt.priority DESC, match_count DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update timestamp
CREATE OR REPLACE FUNCTION update_template_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_document_templates_timestamp
    BEFORE UPDATE ON document_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_template_timestamp();

-- Comments for documentation
COMMENT ON TABLE document_templates IS 'Stores document analysis templates for different document types';
COMMENT ON COLUMN document_templates.template_id IS 'Unique identifier for the template (e.g., turkish_tax_law)';
COMMENT ON COLUMN document_templates.folder_patterns IS 'Glob patterns for automatic template detection based on file path';
COMMENT ON COLUMN document_templates.table_schema IS 'JSON schema defining tables to create for this template type';
COMMENT ON COLUMN document_templates.is_system IS 'System templates cannot be deleted by users';