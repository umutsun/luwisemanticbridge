require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Test cases
const tests = [
  { id: 'T1-ODEME', query: "KDV'nin ödemesi ayın kaçına kadar yapılır?", expected: { day: 26, article: 'madde 46' } },
  { id: 'T2-BEYANNAME', query: "KDV beyannamesi ne zaman verilir?", expected: { day: 24, article: 'madde 41' } },
  { id: 'T3-AMBIGUOUS', query: "KDV beyanname 24 mü 26 mı?", expected: { type: 'ambiguous', both: true } },
  { id: 'T4-CROSSLAW', query: "KDV beyanname süresi nedir?", expected: { noDVK: true, noGVK: true } },
];

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  VERGILEX RAG v12.20 TEST REPORT');
  console.log('  Date:', new Date().toISOString());
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Import RAG service dynamically
  const ragPath = '../dist/services/rag-chat.service.js';
  let RagChatService;
  try {
    RagChatService = require(ragPath).RagChatService;
  } catch (e) {
    console.error('Failed to load RAG service. Run: npm run build');
    console.error(e.message);
    process.exit(1);
  }

  const ragService = new RagChatService();

  // Get a user ID for testing
  const userResult = await pool.query("SELECT id FROM users LIMIT 1");
  const userId = userResult.rows[0]?.id || 1;
  console.log('Using user ID:', userId, '\n');

  const results = [];

  for (const test of tests) {
    console.log('\n─── TEST:', test.id, '───');
    console.log('Query:', JSON.stringify(test.query));

    try {
      const startTime = Date.now();
      const response = await ragService.chat(test.query, userId, null, {});
      const elapsed = Date.now() - startTime;

      // Analyze response
      const content = response.content || '';
      const sources = response.sources || [];

      // Check expected values
      const checks = [];

      if (test.expected.day) {
        const hasDay = content.includes(String(test.expected.day));
        checks.push({ check: 'Contains "' + test.expected.day + '"', pass: hasDay });
      }

      if (test.expected.article) {
        const hasArticle = content.toLowerCase().includes(test.expected.article);
        checks.push({ check: 'Contains "' + test.expected.article + '"', pass: hasArticle });
      }

      if (test.expected.both) {
        const has24 = content.includes('24');
        const has26 = content.includes('26');
        checks.push({ check: 'Contains both 24 and 26', pass: has24 && has26 });
      }

      if (test.expected.noDVK) {
        const topSources = sources.slice(0, 5);
        const hasDVK = topSources.some(function(s) {
          return (s.title || '').toLowerCase().includes('damga') ||
            (s.content || '').toLowerCase().includes('damga vergisi kanunu');
        });
        checks.push({ check: 'No DVK in top 5 sources', pass: !hasDVK });
      }

      // Check KDVK sources are top
      const kdvkInTop3 = sources.slice(0, 3).some(function(s) {
        return (s.title || '').toLowerCase().includes('katma değer') ||
          (s.title || '').toLowerCase().includes('kdv');
      });
      checks.push({ check: 'KDVK in top 3 sources', pass: kdvkInTop3 });

      const allPassed = checks.every(function(c) { return c.pass; });

      console.log('Response (' + elapsed + 'ms):');
      console.log('  "' + content.substring(0, 150) + '..."');
      console.log('\nChecks:');
      checks.forEach(function(c) {
        console.log('  ' + (c.pass ? '✅' : '❌') + ' ' + c.check);
      });
      console.log('\nResult:', allPassed ? '✅ PASS' : '❌ FAIL');

      results.push({ test: test.id, passed: allPassed, elapsed: elapsed, checks: checks });

    } catch (error) {
      console.log('❌ ERROR:', error.message);
      results.push({ test: test.id, passed: false, error: error.message });
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  const passed = results.filter(function(r) { return r.passed; }).length;
  const total = results.length;
  console.log('\nTotal: ' + passed + '/' + total + ' tests passed');
  results.forEach(function(r) {
    console.log('  ' + (r.passed ? '✅' : '❌') + ' ' + r.test + (r.elapsed ? ' (' + r.elapsed + 'ms)' : ''));
  });

  console.log('\n═══════════════════════════════════════════════════════════════');

  await pool.end();
  process.exit(passed === total ? 0 : 1);
}

runTests().catch(function(e) {
  console.error('Test runner failed:', e);
  process.exit(1);
});
