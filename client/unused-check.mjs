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

const report = [];
for (const f of files) {
  const code = fs.readFileSync(f, 'utf8');
  let ast;
  try { ast = parse(code, { sourceType: 'module', plugins: ['jsx'] }); } catch { continue; }
  for (const node of ast.program.body) {
    if (node.type !== 'ImportDeclaration') continue;
    const locals = [];
    for (const s of node.specifiers) locals.push({ name: s.local.name, start: s.start, end: s.end });
    for (const l of locals) {
      // count occurrences outside the import declaration
      const before = code.slice(0, node.start);
      const after = code.slice(node.end);
      const rest = before + after;
      const re = new RegExp(`\\b${l.name.replace(/[$]/g, '\\$')}\\b`);
      if (!re.test(rest)) report.push({ file: f, name: l.name, line: node.loc.start.line });
    }
  }
}
const byFile = {};
for (const r of report) (byFile[r.file] ||= []).push(r.name);
for (const [f, names] of Object.entries(byFile)) console.log(f, '->', names.join(', '));
console.log('\ntotal unused import symbols:', report.length);
