/**
 * excel_to_csv.js
 * Convierte Matriz LImpiade PLATAFORMA-SIGMA-QA.xlsx → sigma_qa_import.csv
 * Formato destino: test_multi_hu_import.csv
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '..', 'Matriz LImpiade PLATAFORMA-SIGMA-QA.xlsx');
const OUTPUT_FILE = path.join(__dirname, '..', 'sigma_qa_import.csv');

const CSV_HEADER = [
  'Suposiciones',
  'Escenario',
  'Precondiciones',
  'Datos de Prueba',
  'Pasos',
  'Criterios de Aceptacion',
  'Resultado Esperado',
  'Titulo de la Historia de Usuario'
];

function loadSheet(wb, name) {
  const ws = wb.Sheets[name];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    .filter(r => r.some(c => String(c).trim() !== ''));
}

function escapeCSV(value) {
  const str = String(value ?? '');
  // Siempre entrecomillar para evitar problemas con comas y saltos de línea
  return `"${str.replace(/"/g, '""')}"`;
}

function main() {
  const wb = XLSX.readFile(INPUT_FILE);

  // --- Cargar hojas ---
  const [, ...usRows]  = loadSheet(wb, '1_user_storie');  // US_ID, Nombre_US, Estado, Prioridad, Reglas_Negocio
  const [, ...prcRows] = loadSheet(wb, '3_precondition'); // PRC_ID, Titulo_PRC, Descripcion, Datos_Requeridos, Estado_Sistema, TC_Asociados
  const [, ...tcRows]  = loadSheet(wb, '4_test_cases');   // ID_TC, US_ID, TS_ID, Titulo_TC, PRC_Asociadas, Paso_Accion, Resultado Esperado, Prioridad

  // --- Build lookup: US_ID → Reglas_Negocio ---
  const usMap = {};
  for (const r of usRows) {
    usMap[String(r[0]).trim()] = {
      nombre: String(r[1]).trim(),
      reglas: String(r[4]).trim()
    };
  }

  // --- Build lookup inverso: ID_TC → [ { titulo, datosRequeridos } ] ---
  const prcByTC = {};
  for (const r of prcRows) {
    const titulo = String(r[1]).trim();
    const datos  = String(r[3]).trim();
    const tcList = String(r[5]).split('|').map(s => s.trim()).filter(Boolean);
    for (const tcId of tcList) {
      if (!prcByTC[tcId]) prcByTC[tcId] = [];
      prcByTC[tcId].push({ titulo, datos });
    }
  }

  // --- Construir filas CSV ---
  const csvRows = [CSV_HEADER.map(escapeCSV).join(',')];

  let count = 0;
  for (const r of tcRows) {
    const tcId    = String(r[0]).trim();
    const usId    = String(r[1]).trim();
    const titulo  = String(r[3]).trim();
    const paso    = String(r[5]).trim();
    const result  = String(r[6]).trim();

    // Suposiciones: campo obligatorio, valor opcional (vacío)
    const suposiciones = '';

    // Escenario: título del TC
    const escenario = titulo;

    // Precondiciones: PRCs asociadas a este TC (join inverso)
    const prcs = prcByTC[tcId] ?? [];
    const precondiciones = prcs.map(p => p.titulo).join(' | ');

    // Datos de Prueba: Datos_Requeridos de la primera PRC
    const datosPrueba = prcs.length > 0 ? prcs[0].datos : '';

    // Pasos: formatear con numeración si no la tiene
    const pasos = paso.startsWith('1.') ? paso : `1. ${paso}`;

    // Criterios de Aceptación = Resultado Esperado
    const criterios = result;

    // Resultado Esperado
    const resultadoEsperado = result;

    // Titulo HU: usar US_ID como clave de agrupación de suites
    const tituloHU = usId;

    const row = [
      suposiciones,
      escenario,
      precondiciones,
      datosPrueba,
      pasos,
      criterios,
      resultadoEsperado,
      tituloHU
    ].map(escapeCSV).join(',');

    csvRows.push(row);
    count++;
  }

  // Escribir con BOM UTF-8 para compatibilidad Excel
  const bom = '\uFEFF';
  fs.writeFileSync(OUTPUT_FILE, bom + csvRows.join('\n'), 'utf8');

  console.log(`✓ CSV generado: ${OUTPUT_FILE}`);
  console.log(`✓ Filas escritas: ${count}`);
  console.log(`✓ HUs únicas: ${new Set(tcRows.map(r => String(r[1]).trim())).size}`);
}

main();
