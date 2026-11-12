// Chequeo de convenciones de UI (sin dependencias).
// Corre en `prebuild` para que un patrón fuera del design system no llegue a main.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src', import.meta.url));

/** Devuelve rutas .tsx bajo src/. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const rel = (file) => relative(root, file).split(sep).join('/');

// Archivos donde sí se permite el patrón (viewers de código y cuerpos de
// comentarios). Cualquier campo nuevo con label debe usar <ReadField>.
const PRE_WRAP_ALLOWLIST = new Set([
  'components/ui/read-field.tsx',
  'features/jira-tracking/components/jira-ticket-drawer.tsx',
  'features/mi-jira/mi-jira-page.tsx',
]);

const isToolsViewer = (path) => path.startsWith('features/tools/');

const violations = [];

for (const file of walk(root)) {
  const path = rel(file);
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');

  const report = (lineIndex, rule, extra = '') => {
    violations.push(`${path}:${lineIndex + 1}  ${rule}${extra ? ` — ${extra}` : ''}`);
  };

  lines.forEach((line, index) => {
    // 1) Tablas: solo DataTable.
    if (line.includes('<table') && !path.startsWith('components/ui/')) {
      report(index, 'Usá <DataTable> en vez de <table>');
    }

    // 2) Textareas: solo el primitivo Input.
    if (line.includes('<textarea') && path !== 'components/ui/input.tsx') {
      report(index, 'Usá <Textarea> en vez de <textarea>');
    }

    // 3) Valores multilínea con label: solo ReadField (o viewers de código).
    if (
      line.includes('whitespace-pre-wrap') &&
      !PRE_WRAP_ALLOWLIST.has(path) &&
      !isToolsViewer(path)
    ) {
      report(index, 'Usá <ReadField> para mostrar un valor de solo lectura');
    }

    // 4) Bloques preformateados: solo viewers de código.
    if (line.includes('<pre') && !isToolsViewer(path) && !path.startsWith('components/ui/')) {
      report(index, 'Usá <ReadField> en vez de <pre> para texto de un campo');
    }
  });
}

if (violations.length > 0) {
  console.error(`❌ Convenciones de UI (${violations.length}):\n`);
  for (const violation of violations) console.error(` - ${violation}`);
  console.error('\nReglas: docs/ui-refactor-plan.md › Reglas de UI (design system)');
  process.exit(1);
}

console.log('✅ Convenciones de UI OK');
