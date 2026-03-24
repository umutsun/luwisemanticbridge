const sectionHeaders = [
  '**1. Konu Başlığı:**',
  '**2. Özet Yanıt (Hüküm):**',
  '**3. Mevzuat Analizi ve Detaylar:**',
  '**4. Yasal Dayanaklar:**',
  '**5. Kritik Notlar:**'
];

// Full simulated response matching screenshot 2
let fixed = `**1. [1] Konu Başlığı:2.

Özet Yanıt (Hüküm):** Murisin sağlığında icra takibinde olan alacakların, veraset ve intikal vergisi beyannamesine dahil edilmesi gerekmektedir. Bu alacaklar, murisin ölümünden önce icra dairesine veya mahkemeye intikal etmiş olduğundan, beyannameye açıkça eklenmesi ve vergilerin hesaplanması zorunludur [3]. **3.

Mevzuat Analizi ve Bold:** İhtilaflı Borçların Beyanı Veraset ve intikal vergisi mükellefleri content [3].

Vergi Hesaplama ve Tecil content [3].

Beyannameye Dahil Edilmesi Gereken Diğer Hususlar content [3].

**4.

Yasal Dayanaklar:** - 7338 sayılı Veraset ve İntikal Vergisi Kanunu

5. Kritik Notlar:

⚠️ İhtilaflı alacakların beyan edilmemesi durumunda warning.`;

console.log('=== INPUT ===');
console.log(fixed);
console.log('\n' + '='.repeat(60) + '\n');

// Step 1: Fix broken bold headers (line break inside)
fixed = fixed.replace(/\*\*(\d)\.\s*\n\s*/g, '**$1. ');

// Step 2: Fix split bold headers
fixed = fixed.replace(/\*\*(\d+\.\s+[^*:]+?)\s*\*\*\s*\n\s*\*\*([^*]+?:\*\*)/g, '**$1 $2');

// Step 3: Fix citation inside bold header
fixed = fixed.replace(/\*\*(\d)\.\s*\[\d+\]\s*([^*:\n]+:)\*\*/gm, '**$1. $2**');

// Step 4: Fix citation in non-bold section header
fixed = fixed.replace(/^(\d)\.\s*\[\d+\]\s*([^:\n]+:)/gm, '**$1. $2**');

// Step 5: Ensure bold headers get own line
fixed = fixed.replace(/([^\n])\s*(\*\*[1-9]\.\s+[^*]+:\*\*)/g, '$1\n\n$2');

// Step 6: Pass 1 - inline non-bold headers
fixed = fixed.replace(
  /([.!?\]])\s+([1-9])\.\s+([A-Z\u00C0-\u024F][^:\n]{3,80}:)/g,
  (match, prefix, num, rest) => {
    if (match.includes('**')) return match;
    return `${prefix}\n\n**${num}. ${rest}**`;
  }
);

// Step 7: Pass 2 - line start non-bold headers
fixed = fixed.replace(
  /(?:^|\n\n)([1-9])\.\s+([A-Z\u00C0-\u024F][^:\n]{3,80}:)/gm,
  (match, num, rest) => {
    if (match.includes('**')) return match;
    const prefix = match.startsWith('\n') ? '\n\n' : '';
    return `${prefix}**${num}. ${rest}**`;
  }
);

// Step 8: Schema-driven reconstruction
for (const header of sectionHeaders) {
  const headerMatch = header.match(/\*\*(\d+)\.\s+(.+?):\*\*/);
  if (!headerMatch) continue;
  const [, num, title] = headerMatch;
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const titleWords = title.split(/\s+/);
  const firstWord = titleWords.find(w => w.length >= 3) || titleWords[0];
  const escapedFirstWord = firstWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const mangledBoldPattern = new RegExp(
    `\\*\\*${num}\\.\\s*(?:\\[\\d+\\]\\s*)?(?:[\\s\\S]*?)${escapedFirstWord}[^\\n]*?(?::\\*\\*|:\\d+\\.?|:\\s*\\n)`,
    'gm'
  );
  fixed = fixed.replace(mangledBoldPattern, `**${num}. ${title}:**`);

  const nonBoldPattern = new RegExp(
    `(?:^|\\n)\\s*${num}\\.\\s+${escapedTitle}[^:\\n]*:(?!\\*\\*)`,
    'gm'
  );
  fixed = fixed.replace(nonBoldPattern, (match) => {
    if (match.includes('**')) return match;
    return `\n\n**${num}. ${title}:**`;
  });

  const citationLeakPattern = new RegExp(
    `(?:^|\\n)\\s*${num}\\.\\s+\\[\\d+\\]\\s*${escapedTitle}[^:\\n]*:`,
    'gm'
  );
  fixed = fixed.replace(citationLeakPattern, `\n\n**${num}. ${title}:**`);
}

// Ensure bold headers get own line (re-apply)
fixed = fixed.replace(/([^\n])\s*(\*\*[1-9]\.\s+[^*]+:\*\*)/g, '$1\n\n$2');

// Bold sub-headers own line
fixed = fixed.replace(/([^\n])(\s)(\*\*[^*]{2,50}:\*\*)/g, '$1\n\n$3');

// Clean up
fixed = fixed.replace(/\n{4,}/g, '\n\n\n');

console.log('=== OUTPUT ===');
console.log(fixed);
