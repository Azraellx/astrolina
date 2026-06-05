// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Prepends the SPDX/AGPL license header to every authored source file under
// src/, functions/, and scripts/, plus the root configs. Idempotent: files that
// already contain the SPDX line are left untouched, so it is safe to re-run when
// new files are added. JSON (no comments) and index.html (doctype must stay first)
// are intentionally skipped.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT_DIRS = ['src', 'functions', 'scripts'];
const EXTS = new Set(['.ts', '.tsx', '.js', '.mjs', '.css']);
const SKIP = new Set(['node_modules', 'dist', '.git']);
const MARKER = 'SPDX-License-Identifier: AGPL-3.0-only';

const LINES = [
  'AstroLina: web-based astrocartography for curious minds.',
  'Copyright (C) 2026 AstroLina <https://astrolina.org>',
  'SPDX-License-Identifier: AGPL-3.0-only',
  'Licensed under the GNU AGPL v3.0 with an additional attribution term under',
  'AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.',
];

function header(ext) {
  if (ext === '.css') return '/*\n' + LINES.map((l) => ' * ' + l).join('\n') + '\n */\n\n';
  return LINES.map((l) => '// ' + l).join('\n') + '\n\n';
}

function gather() {
  const files = new Set();
  for (const dir of ROOT_DIRS) {
    let rels;
    try {
      rels = readdirSync(dir, { recursive: true });
    } catch {
      continue;
    }
    for (const rel of rels) {
      if (String(rel).split(/[\\/]/).some((p) => SKIP.has(p))) continue;
      const full = join(dir, String(rel));
      if (EXTS.has(extname(full)) && statSync(full).isFile()) files.add(full);
    }
  }
  for (const name of readdirSync('.')) {
    if (EXTS.has(extname(name)) && statSync(name).isFile()) files.add(name);
  }
  return [...files];
}

let added = 0;
let skipped = 0;
for (const file of gather()) {
  const content = readFileSync(file, 'utf8');
  if (content.includes(MARKER)) {
    skipped++;
    continue;
  }
  let prefix = '';
  let body = content;
  if (body.startsWith('#!')) {
    const nl = body.indexOf('\n');
    prefix = body.slice(0, nl + 1);
    body = body.slice(nl + 1);
  }
  writeFileSync(file, prefix + header(extname(file)) + body);
  added++;
  console.log('  + ' + file);
}
console.log(`\nLicense headers added to ${added} files; ${skipped} already had one.`);
