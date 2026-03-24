const sectionHeaders = [
  '**1. Konu Başlığı:**',
  '**2. Özet Yanıt (Hüküm):**',
  '**3. Mevzuat Analizi ve Detaylar:**',
  '**4. Yasal Dayanaklar:**',
  '**5. Kritik Notlar:**'
];

// Simulated broken LLM outputs
const testCases = [
  {
    name: 'Pattern 1: Citation + next num leaked into header',
    input: '**1. [1] Konu Başlığı:2.\n\nÖzet Yanıt (Hüküm):** Content here'
  },
  {
    name: 'Pattern 2: Newline in header + Bold garbage',
    input: 'content [3]. **3.\nMevzuat Analizi ve Bold:** Content here'
  },
  {
    name: 'Pattern 3: Newline in header',
    input: '**4.\nYasal Dayanaklar:** - 7338 sayılı kanun'
  },
  {
    name: 'Pattern 4: Bold citation leak',
    input: '**1. [1] Konu Başlığı:** Content here'
  },
  {
    name: 'Pattern 5: Correctly formatted (should not change)',
    input: '**1. Konu Başlığı:** Content here'
  }
];

for (const tc of testCases) {
  let fixed = tc.input;

  for (const header of sectionHeaders) {
    const headerMatch = header.match(/\*\*(\d+)\.\s+(.+?):\*\*/);
    if (!headerMatch) continue;
    const [, num, title] = headerMatch;
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const titleWords = title.split(/\s+/);
    const firstWord = titleWords.find(w => w.length >= 3) || titleWords[0];
    const escapedFirstWord = firstWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Pattern A: mangled bold header
    const mangledBoldPattern = new RegExp(
      `\\*\\*${num}\\.\\s*(?:\\[\\d+\\]\\s*)?(?:[\\s\\S]*?)${escapedFirstWord}[^\\n]*?(?::\\*\\*|:\\d+\\.?|:\\s*\\n)`,
      'gm'
    );
    fixed = fixed.replace(mangledBoldPattern, `**${num}. ${title}:**`);

    // Pattern B: Non-bold
    const nonBoldPattern = new RegExp(
      `(?:^|\\n)\\s*${num}\\.\\s+${escapedTitle}[^:\\n]*:(?!\\*\\*)`,
      'gm'
    );
    fixed = fixed.replace(nonBoldPattern, (match) => {
      if (match.includes('**')) return match;
      return `\n\n**${num}. ${title}:**`;
    });

    // Pattern C: Citation leak in non-bold
    const citationLeakPattern = new RegExp(
      `(?:^|\\n)\\s*${num}\\.\\s+\\[\\d+\\]\\s*${escapedTitle}[^:\\n]*:`,
      'gm'
    );
    fixed = fixed.replace(citationLeakPattern, `\n\n**${num}. ${title}:**`);
  }

  // Ensure bold headers get own line
  fixed = fixed.replace(/([^\n])\s*(\*\*[1-9]\.\s+[^*]+:\*\*)/g, '$1\n\n$2');

  console.log(`\n--- ${tc.name} ---`);
  console.log(`IN:  ${JSON.stringify(tc.input)}`);
  console.log(`OUT: ${JSON.stringify(fixed)}`);
  console.log(`OK:  ${!fixed.includes('[1] Konu') && !fixed.includes('Bold:') && !fixed.includes(':\n')}`);
}
