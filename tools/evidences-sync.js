#!/usr/bin/env node
/**
 * Auditoría / respaldo de evidencias locales.
 *
 * Contexto: los binarios viven en `data/evidences/<proyecto>/YYYY-MM/<sha>.ext`
 * de la máquina donde se subieron, mientras que `qa_attachments` está en
 * Supabase (compartida). Una evidencia subida en otra máquina no se ve acá
 * salvo que tenga copia en `file_data` (PG).
 *
 * Uso:
 *   node tools/evidences-sync.js                 # solo audita (no escribe)
 *   node tools/evidences-sync.js --publish       # copia a PG los archivos locales
 *   node tools/evidences-sync.js --publish --force
 *   node tools/evidences-sync.js --max-mb=20     # tope de respaldo (default 10)
 *
 * Cada integrante debería correr `--publish` una vez en su máquina para que
 * todas las evidencias queden respaldadas en la base compartida.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { query } = require('../db');
const evidenceStore = require('../modules/evidence-store');

const args = process.argv.slice(2);
const publish = args.includes('--publish');
const force = args.includes('--force');
const maxArg = args.find((arg) => arg.startsWith('--max-mb='));
const maxMb = maxArg ? Number(maxArg.split('=')[1]) : 10;
const MAX_BYTES = (Number.isFinite(maxMb) ? maxMb : 10) * 1024 * 1024;

const fmtMb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function main() {
  evidenceStore.init({ baseDir: path.join(__dirname, '..') });

  const rows = (
    await query(
      `SELECT id, project_id, file_name, mime_type, storage_kind, storage_path, sha256,
              size_bytes, (file_data IS NOT NULL) AS has_data
         FROM qa_attachments
        ORDER BY id`,
    )
  ).rows;

  const stats = {
    total: rows.length,
    local: 0,
    present: 0,
    presentWithBackup: 0,
    presentWithoutBackup: 0,
    missing: 0,
    missingRecoverable: 0,
    missingLost: 0,
    published: 0,
    publishedSkipped: 0,
    publishErrors: 0,
  };
  const lostSamples = [];
  const missingSamples = [];

  for (const row of rows) {
    const isLocal = Boolean(row.storage_path) && row.storage_kind !== 'legacy_pg';
    if (!isLocal) continue;
    stats.local += 1;

    const abs = evidenceStore.absolutePath(row.storage_path);
    const exists = fs.existsSync(abs);

    if (!exists) {
      stats.missing += 1;
      if (row.has_data) stats.missingRecoverable += 1;
      else {
        stats.missingLost += 1;
        if (lostSamples.length < 10) lostSamples.push(row);
      }
      if (missingSamples.length < 10) missingSamples.push(row);
      continue;
    }

    stats.present += 1;
    if (row.has_data) {
      stats.presentWithBackup += 1;
      continue;
    }
    stats.presentWithoutBackup += 1;

    if (!publish) continue;

    const size = fs.statSync(abs).size;
    if (size > MAX_BYTES) {
      stats.publishedSkipped += 1;
      console.warn(
        `[skip] #${row.id} ${row.file_name || ''} (${fmtMb(size)}) supera --max-mb=${maxMb}`,
      );
      continue;
    }

    const buffer = fs.readFileSync(abs);
    const sha = crypto.createHash('sha256').update(buffer).digest('hex');
    if (row.sha256 && sha !== row.sha256 && !force) {
      stats.publishErrors += 1;
      console.error(`[error] #${row.id}: sha256 no coincide (archivo corrupto o reemplazado)`);
      continue;
    }

    try {
      await query(`UPDATE qa_attachments SET file_data = ? WHERE id = ?`, [buffer, row.id]);
      stats.published += 1;
    } catch (error) {
      stats.publishErrors += 1;
      console.error(`[error] #${row.id}: ${error.message}`);
    }
  }

  console.log('\n── Evidencias ──────────────────────────────────────────────');
  console.log(`total en qa_attachments : ${stats.total}`);
  console.log(`locales (storage_path)  : ${stats.local}`);
  console.log(`  archivo en esta máquina: ${stats.present}`);
  console.log(`    con respaldo en PG   : ${stats.presentWithBackup}`);
  console.log(`    sin respaldo en PG   : ${stats.presentWithoutBackup}`);
  console.log(`  archivo faltante       : ${stats.missing}`);
  console.log(`    recuperable desde PG : ${stats.missingRecoverable}`);
  console.log(`    sin copia (perdida)  : ${stats.missingLost}`);

  if (publish) {
    console.log(`\nrespaldadas en PG        : ${stats.published}`);
    console.log(`salteadas por tamaño     : ${stats.publishedSkipped}`);
    console.log(`errores                  : ${stats.publishErrors}`);
  }

  if (missingSamples.length > 0) {
    console.log('\nEjemplos de archivos faltantes en esta máquina:');
    for (const row of missingSamples) {
      console.log(
        `  #${row.id} ${row.has_data ? '[en PG]' : '[SIN COPIA]'} (proyecto ${row.project_id ?? '-'}) ${row.storage_path}`,
      );
    }
  }

  if (stats.presentWithoutBackup > 0 && !publish) {
    console.log(
      '\n👉 Corré `node tools/evidences-sync.js --publish` en cada máquina para respaldar sus archivos locales.',
    );
  }
  if (stats.missingLost > 0) {
    console.log(
      `\n⚠️  ${stats.missingLost} evidencias no están en esta máquina ni en PG. ` +
        'Solo se recuperan desde la máquina donde se subieron (corré ahí `--publish`).',
    );
  }

  evidenceStore.close();
  process.exit(stats.publishErrors > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
