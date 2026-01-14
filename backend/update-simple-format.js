// Script to update formatTemplate to simple, LLM-friendly version
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Simple, clear formatTemplate with explicit structure that LLM must follow
const simpleFormat = `KRİTİK: Cevabınız TAM BU YAPIYI İZLEMELİ:

## Yasal Çerçeve

[İlgili kanun ve tebliğleri açıkla [1][2]. Temel kuralları belirt.]

[Detaylı düzenlemeleri ve istisnaları açıkla [3][4].]

## Uygulama

[Pratikte nasıl uygulandığını örneklerle göster [5].]

NOT: ## başlıklarını aynen kullan, [] içindeki açıklamalar yerine gerçek içeriği yaz.`;

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

    // Update formatTemplate
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
