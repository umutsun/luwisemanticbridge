const { Pool } = require('pg');

const pool = new Pool({
  host: '91.99.229.96',
  port: 5432,
  database: 'lsemb',
  user: 'postgres',
  password: '12Kemal1221'
});

async function testSuggestions() {
  try {
    console.log('=== Testing Generated Questions ===\n');

    // Test 1: Count messages with sources
    const result1 = await pool.query(`
      SELECT COUNT(*) as total
      FROM messages
      WHERE role = 'assistant'
        AND sources IS NOT NULL
        AND sources::text != '[]'
        AND created_at > NOW() - INTERVAL '30 days'
    `);
    console.log('✅ Messages with sources (last 30 days):', result1.rows[0].total);

    // Test 2: Sample sources to see structure
    const result2 = await pool.query(`
      SELECT sources, created_at
      FROM messages
      WHERE role = 'assistant'
        AND sources IS NOT NULL
        AND sources::text != '[]'
      ORDER BY created_at DESC
      LIMIT 2
    `);
    console.log('\n📦 Sample sources structure:');
    result2.rows.forEach((row, i) => {
      console.log(`\n  Sample ${i + 1} (${row.created_at}):`);
      const sources = typeof row.sources === 'string' ? JSON.parse(row.sources) : row.sources;
      console.log('  - Total sources:', sources.length);
      if (sources.length > 0) {
        console.log('  - First source has question?', !!sources[0].question);
        if (sources[0].question) {
          console.log('  - Question:', sources[0].question);
        }
        console.log('  - Keys in source:', Object.keys(sources[0]));
      }
    });

    // Test 3: Try the actual query from getPopularQuestions
    const result3 = await pool.query(`
      SELECT DISTINCT jsonb_array_elements(sources::jsonb)->>'question' as question
      FROM messages
      WHERE role = 'assistant'
        AND sources IS NOT NULL
        AND sources::text != '[]'
        AND created_at > NOW() - INTERVAL '30 days'
        AND jsonb_array_elements(sources::jsonb)->>'question' IS NOT NULL
      ORDER BY RANDOM()
      LIMIT 20
    `);

    const questions = result3.rows.map(r => r.question).filter(q => q && q.length > 15);
    console.log(`\n✨ Generated questions found: ${questions.length}`);
    if (questions.length > 0) {
      console.log('\n📝 Sample generated questions:');
      questions.slice(0, 5).forEach((q, i) => {
        console.log(`  ${i + 1}. ${q}`);
      });
    } else {
      console.log('❌ No generated questions found!');
      console.log('   This means sources don\'t have "question" field');
    }

    await pool.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

testSuggestions();
