require('dotenv').config();
const https = require('http');

const TOKEN = process.env.TEST_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJlZTE4MmU5Zi02YzAwLTRhZjgtYmQzMi0xOTI2MWU0MzJlYjAiLCJlbWFpbCI6ImFkbWluQHZlcmdpbGV4LmNvbSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc2OTUyNjkxMSwiZXhwIjoxNzY5NTMwNTExfQ.ZY5E35o-b2yy_FGuULuKkymFOAH_nTzPB2npJOBA3Ig';

const tests = [
  {
    id: 'T1-ODEME',
    name: 'KDV Ödeme Süresi',
    query: "KDV ödemesi ayın kaçına kadar yapılır?",
    expected: { day: '26', article: 'madde 46' }
  },
  {
    id: 'T2-BEYANNAME',
    name: 'KDV Beyanname Süresi',
    query: "KDV beyannamesi ne zaman verilir?",
    expected: { day: '24', article: 'madde 41' }
  },
  {
    id: 'T3-AMBIGUOUS',
    name: 'Ambiguous Sorgu',
    query: "KDV beyanname 24 mü 26 mı?",
    expected: { both: true }
  },
  {
    id: 'T4-CROSSLAW',
    name: 'Cross-Law Isolation',
    query: "KDV beyanname süresi nedir?",
    expected: { no_dvk: true }
  }
];

function makeRequest(query) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ message: query, conversationId: null });

    const options = {
      hostname: 'localhost',
      port: 8087,
      path: '/api/v2/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + TOKEN,
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error('Invalid JSON: ' + body.substring(0, 200)));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(data);
    req.end();
  });
}

function analyzeResponse(data, expected) {
  const content = data.response || '';
  const sources = data.sources || [];
  const checks = [];

  if (expected.day) {
    const hasDay = content.includes(expected.day);
    checks.push({ name: 'Contains ' + expected.day, pass: hasDay });
  }

  if (expected.article) {
    const hasArticle = content.toLowerCase().includes(expected.article);
    checks.push({ name: 'Contains ' + expected.article, pass: hasArticle });
  }

  if (expected.both) {
    const hasBoth = content.includes('24') && content.includes('26');
    checks.push({ name: 'Contains both 24 & 26', pass: hasBoth });
  }

  const topTitles = sources.slice(0, 5).map(s => (s.title || '').toUpperCase());
  const kdvkTop = topTitles.slice(0, 3).some(t => t.includes('KATMA') || t.includes('KDV'));
  checks.push({ name: 'KDVK in top 3', pass: kdvkTop });

  if (expected.no_dvk) {
    const noDvk = !topTitles.some(t => t.includes('DAMGA'));
    checks.push({ name: 'No DVK in top 5', pass: noDvk });
  }

  return { content, sources, checks };
}

async function runTests() {
  console.log('═'.repeat(65));
  console.log('  VERGILEX RAG v12.20 - KAPSAMLI TEST RAPORU');
  console.log('  Tarih:', new Date().toISOString());
  console.log('  Build: v12.20 (031759d5)');
  console.log('═'.repeat(65));
  console.log();

  const results = [];

  for (const test of tests) {
    console.log('─── ' + test.id + ': ' + test.name + ' ───');
    console.log('Sorgu:', test.query);

    try {
      const data = await makeRequest(test.query);
      const { content, sources, checks } = analyzeResponse(data, test.expected);

      console.log('Cevap:', content.substring(0, 150) + '...');
      console.log();
      console.log('Kontroller:');

      for (const check of checks) {
        const status = check.pass ? '✅' : '❌';
        console.log('  ' + status + ' ' + check.name);
      }

      const allPass = checks.every(c => c.pass);
      results.push({ id: test.id, pass: allPass });
      console.log();
      console.log('Sonuç:', allPass ? '✅ PASS' : '❌ FAIL');

    } catch (error) {
      console.log('HATA:', error.message);
      results.push({ id: test.id, pass: false });
    }

    console.log();
  }

  console.log('═'.repeat(65));
  console.log('  ÖZET');
  console.log('═'.repeat(65));

  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  console.log();
  console.log('Toplam: ' + passed + '/' + total + ' test başarılı');
  console.log();

  for (const r of results) {
    const status = r.pass ? '✅' : '❌';
    console.log('  ' + status + ' ' + r.id);
  }

  console.log();
  console.log('═'.repeat(65));

  process.exit(passed === total ? 0 : 1);
}

runTests().catch(e => {
  console.error('Test runner failed:', e);
  process.exit(1);
});
