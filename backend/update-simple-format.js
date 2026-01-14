// Script to update formatTemplate to simple, LLM-friendly version
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Simple, clear formatTemplate - NO HEADERS, clean continuous text with citations
const simpleFormat = `KRİTİK KURALLAR:

1. BAŞLIK KULLANMA - Direkt açıklamaya başla
2. İlgili mevzuatı ve yasal düzenlemeleri detaylı açıkla [1][2]
3. Şartları, oranları, tutarları somut örneklerle belirt [3][4]
4. Pratik uygulamayı, gerekli belgeleri, süreci detaylı anlat [5]
5. EN AZ 4-5 paragraf, her paragraf EN AZ 3-4 cümle
6. [1][2] formatında kaynak atıflarını metne yerleştir
7. Kısa cevap verme, uzun ve kapsamlı açıkla

Örnek format:
İlgili kanun X maddesine göre... [1]. Bu düzenleme şu şartları içerir... [2]. Oran %18'dir ve şu durumlarda uygulanır... [3].

Pratikte şirketler bu işlemi şöyle yapar... [4]. Gerekli belgeler A, B ve C'dir... [5].`;

async function updateFormatTemplate() {
  try {
    console.log('📖 Reading current ragRoutingSchema...');
    const result = await pool.query(
      `SELECT value FROM settings WHERE key = 'ragRoutingSchema'`
    );

    if (!result.rows[0]) {
      console.log('❌ ragRoutingSchema not found in settings');
      process.exit(1);
    }

    const schema = JSON.parse(result.rows[0].value);

    console.log('📝 Current formatTemplate:');
    console.log('---');
    console.log(schema.formatTemplate || 'EMPTY');
    console.log('---');
    console.log('Length:', (schema.formatTemplate || '').length);

    // Update formatTemplate in the correct nested location for backend
    if (!schema.routes) schema.routes = {};
    if (!schema.routes.FOUND) schema.routes.FOUND = {};
    if (!schema.routes.FOUND.format) schema.routes.FOUND.format = {};

    schema.routes.FOUND.format.formatTemplate = simpleFormat;
    schema.routes.FOUND.format.formatTemplateEn = simpleFormat;

    // Also set at root level for consistency
    schema.formatTemplate = simpleFormat;

    console.log('');
    console.log('✍️  New formatTemplate:');
    console.log('---');
    console.log(simpleFormat);
    console.log('---');
    console.log('Length:', simpleFormat.length);

    // Save back to database - use double quotes for column name
    await pool.query(
      `UPDATE settings SET "value" = $1 WHERE key = 'ragRoutingSchema'`,
      [JSON.stringify(schema)]
    );

    console.log('');
    console.log('✅ formatTemplate updated successfully!');
    console.log('');
    console.log('🔄 Remember to restart backend: pm2 restart vergilex-backend');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

updateFormatTemplate();
