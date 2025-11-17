const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'nodes');
const DST_DIR = path.join(__dirname, '..', 'dist', 'nodes');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function copyIfExists(src, dst) {
  if (fs.existsSync(src)) {
    ensureDir(path.dirname(dst));
    fs.copyFileSync(src, dst);
  }
}

function walk(dir, exts, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, exts, files);
    else if (exts.includes(path.extname(entry.name))) files.push(abs);
  }
  return files;
}

// Copy node static assets (icons)
const assets = walk(SRC_DIR, ['.svg']);
for (const file of assets) {
  const rel = path.relative(SRC_DIR, file);
  const dst = path.join(DST_DIR, rel);
  copyIfExists(file, dst);
}

console.log(`Copied ${assets.length} asset(s) to dist.`);

