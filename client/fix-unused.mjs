import fs from 'fs';
import path from 'path';
import { parse } from '@babel/parser';

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.jsx?$/.test(e.name)) files.push(p);
  }
})('src');

let changed = 0;
for (const f of files) {
  let code = fs.readFileSync(f, 'utf8');
  let ast;
  try { ast = parse(code, { sourceType: 'module', plugins: ['jsx'] }); } catch { continue; }
  const edits = [];
  for (const node of ast.program.body) {
    if (node.type !== 'ImportDeclaration') continue;
    const kept = [];
    for (const s of node.specifiers) {
      const rest = code.slice(0, node.start) + code.slice(node.end);
      const re = new RegExp(`\\b${s.local.name}\\b`);
      if (s.type === 'ImportDefaultSpecifier' || s.type === 'ImportNamespaceSpecifier') { kept.push(s); continue; }
      if (re.test(rest)) kept.push(s);
    }
    if (kept.length !== node.specifiers.length) {
      const names = kept.map((s) => s.imported.name);
      let replacement;
      if (names.length === 0) replacement = '';
      else replacement = `import { ${names.join(', ')} } from '${node.source.value}';`;
      edits.push({ start: node.start, end: node.end, replacement });
    }
  }
  if (!edits.length) continue;
  for (const e of edits.reverse()) code = code.slice(0, e.start) + e.replacement + code.slice(e.end);
  code = code.replace(/\n{3,}/g, '\n\n');
  fs.writeFileSync(f, code);
  changed++;
}
console.log('files updated:', changed);
