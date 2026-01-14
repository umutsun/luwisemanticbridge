// Script to update formatTemplate to simple, LLM-friendly version
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:12Kemal1221@localhost:5432/lsemb'
});

// Simple, clear formatTemplate that LLM can easily follow
const simpleFormat = `## Yasal Çerçeve

İlgili kanun ve tebliğleri açıkla [1][2]. Temel kuralları belirt.

Detaylı düzenlemeleri ve istisnaları açıkla [3][4].

## Uygulama

Pratikte nasıl uygulandığını örneklerle göster [5].`;

async function updateFormatTemplate() {
  try {
    console.log('📖 Reading current ragRoutingSchema...');
    const result = await pool.query(
      "SELECT value FROM settings WHERE key = 'ragRoutingSchema'"
    );

    if (!result.rows[0]) {
      console.error('❌ ragRoutingSchema not found in database!');
      process.exit(1);
    }

    const schema = JSON.parse(result.rows[0].value);
    console.log('✅ Current schema loaded');

    // Check current formatTemplate
    const currentTemplate = schema.routes?.FOUND?.format?.formatTemplate;
    if (currentTemplate) {
      console.log('⚠️  Current formatTemplate length:', currentTemplate.length, 'chars');
      console.log('📝 Updating to simple version...');
    }

    // Update formatTemplate
    if (!schema.routes) schema.routes = {};
    if (!schema.routes.FOUND) schema.routes.FOUND = {};
    if (!schema.routes.FOUND.format) schema.routes.FOUND.format = {};

    schema.routes.FOUND.format.formatTemplate = simpleFormat;
    schema.routes.FOUND.format.formatTemplateEn = simpleFormat;

    // Save to database
    console.log('💾 Updating database...');
    await pool.query(
      "UPDATE settings SET value = $1, updated_at = NOW() WHERE key = 'ragRoutingSchema'",
      [JSON.stringify(schema, null, 2)]
    );

    console.log('✅ formatTemplate updated successfully!');
    console.log('📄 New template:');
    console.log(simpleFormat);
    console.log('\n✅ Changes:');
    console.log('   - Removed complex instructions');
    console.log('   - Simplified to 2 sections: Yasal Çerçeve, Uygulama');
    console.log('   - Clear ## markdown headers');
    console.log('   - Easy for LLM to follow');

    // Verify
    const verify = await pool.query(
      "SELECT value FROM settings WHERE key = 'ragRoutingSchema'"
    );
    const updated = JSON.parse(verify.rows[0].value);

    if (updated.routes?.FOUND?.format?.formatTemplate === simpleFormat) {
      console.log('\n🎉 SUCCESS! formatTemplate verified in database.');
    } else {
      console.error('❌ Verification failed!');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

updateFormatTemplate();
