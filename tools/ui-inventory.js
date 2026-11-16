#!/usr/bin/env node
/**
 * Inventario de la migración UI.
 * Mide lo que importa para decidir el próximo paso: legacy restante, pantallas
 * React, tamaño del design system, deuda de markup y peso del bundle.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const SRC = path.join(FRONTEND, 'src');
const UI = path.join(SRC, 'components', 'ui');
const LEGACY = path.join(ROOT, 'public', 'js', 'components');
const DIST = path.join(FRONTEND, 'dist', 'assets');

function walk(dir, filter) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...walk(full, filter));
    else if (!filter || filter(full)) out.push(full);
  }
  return out;
}

const lines = (file) => fs.readFileSync(file, 'utf8').split('\n').length;
const bytes = (dir, ext) => {
  if (!fs.existsSync(dir)) return 0;
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(ext))
    .reduce((acc, file) => acc + fs.statSync(path.join(dir, file)).size, 0);
};
const kb = (value) => `${(value / 1024).toFixed(1)} KB`;

const legacyFiles = walk(LEGACY, (file) => file.endsWith('.js'));
const legacyLines = legacyFiles.reduce((acc, file) => acc + lines(file), 0);
const legacyTop = legacyFiles
  .map((file) => ({ file: path.basename(file), lines: lines(file) }))
  .sort((a, b) => b.lines - a.lines)
  .slice(0, 6);

const primitives = walk(UI, (file) => file.endsWith('.tsx'));
const featurePages = walk(path.join(SRC, 'features'), (file) =>
  /-page\.tsx$/.test(file) && !file.includes(`${path.sep}components${path.sep}`),
);

const sourceFiles = walk(SRC, (file) => file.endsWith('.tsx') && !file.startsWith(UI));
const raw = { table: 0, textarea: 0, select: 0, dateInput: 0, pre: 0 };
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const code = text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
    })
    .join('\n');
  raw.table += (code.match(/<table/g) || []).length;
  raw.textarea += (code.match(/<textarea/g) || []).length;
  raw.select += (code.match(/<select/g) || []).length;
  raw.dateInput += (code.match(/type="(date|datetime-local)"/g) || []).length;
  raw.pre += (code.match(/<pre/g) || []).length;
}

const bundleJs = bytes(DIST, '.js');
const bundleCss = bytes(DIST, '.css');

console.log('\nUI inventory');
console.log('='.repeat(60));
console.log(`Legacy public/js/components : ${legacyFiles.length} archivos · ${legacyLines.toLocaleString('es-AR')} líneas`);
console.log(`Pantallas React            : ${featurePages.length}`);
console.log(`Primitivos design system   : ${primitives.length}`);
console.log(`Bundle dist (JS + CSS)     : ${kb(bundleJs)} + ${kb(bundleCss)}`);
console.log('\nMarkup ad hoc fuera de components/ui');
console.log(`  <table>                  : ${raw.table}`);
console.log(`  <textarea>               : ${raw.textarea}`);
console.log(`  <select>                 : ${raw.select}`);
console.log(`  inputs de fecha          : ${raw.dateInput}`);
console.log(`  <pre>                    : ${raw.pre}`);
console.log('\nLegacy más pesado');
for (const item of legacyTop) console.log(`  ${String(item.lines).padStart(6)}  ${item.file}`);
console.log('\nSugerencia: priorizar el legacy más pesado y las pantallas con más markup ad hoc.\n');
