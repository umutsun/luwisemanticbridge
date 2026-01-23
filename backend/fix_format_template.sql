-- Fix formatTemplate prompt leakage issue
-- Problem: The formatTemplate contains example text that LLM copies verbatim
-- ("Üç cümle tamamlandı", "Süreç detayları", "Ek bilgiler")
-- Solution: Update with clean instructions that don't contain copyable examples

-- First, let's see the current formatTemplate
SELECT
    key,
    value::jsonb->'routes'->'FOUND'->'format'->>'formatTemplate' as current_template
FROM settings
WHERE key = 'ragRoutingSchema';

-- Update the formatTemplate with clean instructions
UPDATE settings
SET value = jsonb_set(
    value::jsonb,
    '{routes,FOUND,format,formatTemplate}',
    '"📚 MARKDOWN FORMATI KURALLARI:\n\n1. BAŞLIK YAPISI:\n   - ## ile ana başlık kullan\n   - ### ile alt başlık kullan (gerekirse)\n\n2. PARAGRAF KURALLARI:\n   - Her paragraftan sonra 1 boş satır bırak\n   - Her bölümde 2-4 paragraf olsun\n   - Paragraflar 2-4 cümle içersin\n\n3. ATIF KURALLARI:\n   - Her bilgi cümlesinin sonuna [1], [2] gibi kaynak numarası ekle\n   - Aynı cümlede birden fazla kaynak kullanılabilir [1][2]\n   - Atıfsız bilgi verme\n\n4. İÇERİK YAPISI:\n   - İlk paragrafta konuyu özetle\n   - Orta paragraflarda detayları açıkla\n   - Son paragrafta sonuç veya özet ver\n\n5. YASAKLAR:\n   - Örnek metin kopyalama\n   - Şablon cümleler kullanma\n   - Meta-ifadeler kullanma (\"Üç cümle tamamlandı\" gibi)"'::jsonb
)::text,
    updated_at = NOW()
WHERE key = 'ragRoutingSchema';

-- Verify the update
SELECT
    key,
    value::jsonb->'routes'->'FOUND'->'format'->>'formatTemplate' as new_template
FROM settings
WHERE key = 'ragRoutingSchema';
