export async function isAllowedByRobots(urlStr: string): Promise<boolean> {
  try {
    const url = new URL(urlStr);
    const robotsUrl = `${url.origin}/robots.txt`;
    const res = await fetch(robotsUrl, { headers: { 'User-Agent': 'n8n-node-robots/1.0' } });
    if (!res.ok) return true; // be lenient if robots not reachable
    const text = await res.text();
    return evaluateRobots(text, url.pathname);
  } catch {
    return true;
  }
}

export function evaluateRobots(robotsTxt: string, path: string): boolean {
  // Very simple parser: use rules under User-agent: *; Disallow takes precedence; Allow overrides
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.trim());
  let applies = false;
  const rules: { type: 'allow'|'disallow'; value: string }[] = [];
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const [kRaw, vRaw] = line.split(':', 2);
    if (!kRaw || typeof vRaw === 'undefined') continue;
    const k = kRaw.trim().toLowerCase();
    const v = vRaw.trim();
    if (k === 'user-agent') {
      applies = (v === '*');
    } else if (applies && (k === 'disallow' || k === 'allow')) {
      rules.push({ type: k as any, value: v });
    }
  }
  // Longest match wins; check Allow last to override Disallow
  const matches = rules
    .filter((r) => r.value === '' || path.startsWith(r.value))
    .sort((a, b) => b.value.length - a.value.length);
  for (const r of matches) {
    if (r.type === 'allow') return true;
    if (r.type === 'disallow') return r.value === '' ? true : false;
  }
  return true;
}

