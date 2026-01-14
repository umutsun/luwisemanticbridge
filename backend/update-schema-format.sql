-- Add formatTemplate to ragRoutingSchema.routes.FOUND.format
-- This SQL updates the existing JSON structure by adding the formatTemplate field

UPDATE settings
SET value = jsonb_set(
    value::jsonb,
    '{routes,FOUND,format,formatTemplate}',
    '"📚 MARKDOWN KURALLARI (KRİTİK - TAM BU FORMAT):\n```\nBir cümlede konuyu özetle [1]. İkinci cümlede kapsamı belirt.\n\n## Yasal Çerçeve\n\nHangi kanun ve tebliğlerin uygulandığını açıkla [2]. Temel kuralları belirt.\n\nDetaylı düzenlemeleri ve istisnaları açıkla [3][4]. Önemli madde numaralarını ver.\n\n## Uygulama\n\nPratikte nasıl uygulandığını örneklerle açıkla [5]. Somut durumları göster.\n```\n\n✅ MUTLAKA:\n- Her başlık ## ile başla\n- Her paragraftan sonra BOŞ SATIR\n- Her bölümde 2-4 paragraf\n- Her paragrafta [1] [2] atıf"'::jsonb
)::text
WHERE key = 'ragRoutingSchema';

-- Verify the update
SELECT key, value::jsonb->'routes'->'FOUND'->'format'->>'formatTemplate' as format_template_preview
FROM settings
WHERE key = 'ragRoutingSchema';
