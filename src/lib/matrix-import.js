const XLSX = require('xlsx');
const { query } = require('../../db');
const { generateKey, generateKeyBatch } = require('./sequences');

/**
 * Importación de matrices QA (una fila por TC).
 *
 * La matriz puede traer CU/Módulo y HU/Feature. Ambos vínculos son opcionales:
 * - Si se crean CU/HU, los TC se agrupan por HU y se crea una suite por HU.
 * - Si no, se importan los TC en un CU/suite existente sin jerarquía nueva.
 */

const COLUMN_ALIASES = {
  cu: ['cu vinculado', 'cu/modulo', 'cu modulo', 'modulo'],
  suite: ['suite / grupo', 'suite', 'grupo'],
  idTest: ['id test', 'id de test', 'test id'],
  hu: ['hu / requerimiento', 'hu requerimiento', 'hu', 'requerimiento', 'feature'],
  title: ['escenario', 'titulo', 'titulo / escenario'],
  pre: ['precondiciones', 'precondicion'],
  steps: ['pasos de reproduccion', 'pasos', 'steps'],
  data: ['datos de prueba'],
  expected: ['resultado esperado'],
  criteria: ['criterios aceptacion', 'criterio de aceptacion', 'criterios'],
  assumptions: ['assumptions', 'supuestos', 'suposiciones'],
  status: ['estado'],
  obtained: ['resultado obtenido'],
  obs: ['observaciones', 'hallazgos', 'observaciones / hallazgos'],
};

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function clean(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

function findColumn(headers, aliases) {
  const normalized = headers.map((header) => normalizeText(header));
  for (let index = 0; index < normalized.length; index += 1) {
    if (aliases.some((alias) => normalized[index] === alias || normalized[index].includes(alias))) {
      return index;
    }
  }
  return -1;
}

function detectHeaderRow(rows) {
  for (let index = 0; index < Math.min(rows.length, 10); index += 1) {
    const normalized = (rows[index] || []).map((cell) => normalizeText(cell));
    const hasScenario = normalized.some((cell) => cell.includes('escenario'));
    const hasSteps = normalized.some((cell) => cell.includes('paso'));
    if (hasScenario && hasSteps) return index;
  }
  return 0;
}

/**
 * Separa una etiqueta tipo "EP-SUR-01 - Sistema General" o
 * "HU-DF1-01 - Autenticación..." en key + título.
 */
function parseEntity(raw, kind) {
  const value = clean(raw);
  if (!value) {
    return { raw: value, key: null, title: null, valid: false, reason: 'vacío' };
  }
  if (value.includes('###')) {
    return { raw: value, key: null, title: null, valid: false, reason: 'placeholder de plantilla' };
  }

  // Algunos CU vienen con metadata separada por "|": usamos el primer tramo.
  const candidate = value.split('|')[0].trim();
  const match = candidate.match(/^([A-Za-z]{2,}[A-Za-z0-9._-]*-\d+)\s*[-–—]\s*(.+)$/);
  if (match) {
    return {
      raw: value,
      key: match[1].trim(),
      title: match[2].trim(),
      valid: true,
      reason: null,
    };
  }

  const keyOnly = candidate.match(/^([A-Za-z]{2,}[A-Za-z0-9._-]*-\d+)$/);
  if (keyOnly) {
    return {
      raw: value,
      key: keyOnly[1].trim(),
      title: null,
      valid: false,
      reason: 'tiene key pero no título',
    };
  }

  return {
    raw: value,
    key: null,
    title: null,
    valid: false,
    reason: kind === 'cu' ? 'formato de CU no reconocido' : 'formato de HU no reconocido',
  };
}

function boolOption(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'on', 'yes', 'si', 'sí'].includes(String(value).toLowerCase());
}

function numberOption(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseMapping(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeOptions(body = {}) {
  const conflict = String(body.conflict_policy ?? 'skip').toLowerCase();
  return {
    createUseCases: boolOption(body.create_use_cases, true),
    createUserStories: boolOption(body.create_user_stories, true),
    groupByHu: boolOption(body.group_by_hu, true),
    existingUseCaseId: numberOption(body.existing_use_case_id),
    existingSuiteId: numberOption(body.existing_suite_id),
    conflictPolicy: ['skip', 'update', 'duplicate'].includes(conflict) ? conflict : 'skip',
    cuMapping: parseMapping(body.cu_mapping),
    dryRun: boolOption(body.dry_run, true),
    createdBy: numberOption(body.user_id),
  };
}

function parseWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  if (!workbook.SheetNames.length) throw new Error('El archivo no tiene hojas.');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  if (matrix.length === 0) throw new Error('El archivo está vacío.');

  const headerIndex = detectHeaderRow(matrix);
  const headers = (matrix[headerIndex] || []).map((header) => clean(header));

  const columns = {};
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    columns[key] = findColumn(headers, aliases);
  }

  if (columns.title === -1) throw new Error('No se encontró la columna "Escenario / Título".');

  const rows = [];
  for (let index = headerIndex + 1; index < matrix.length; index += 1) {
    const raw = matrix[index] || [];
    const title = columns.title >= 0 ? clean(raw[columns.title]) : '';
    const huRaw = columns.hu >= 0 ? clean(raw[columns.hu]) : '';
    const cuRaw = columns.cu >= 0 ? clean(raw[columns.cu]) : '';

    // Ignorar filas totalmente vacías o filas de separación.
    if (!title && !huRaw && !cuRaw) continue;

    rows.push({
      excelRow: index + 1,
      cu: parseEntity(cuRaw, 'cu'),
      hu: parseEntity(huRaw, 'hu'),
      suiteRaw: columns.suite >= 0 ? clean(raw[columns.suite]) : '',
      idTest: columns.idTest >= 0 ? clean(raw[columns.idTest]) : '',
      title,
      pre: columns.pre >= 0 ? clean(raw[columns.pre]) : '',
      steps: columns.steps >= 0 ? clean(raw[columns.steps]) : '',
      data: columns.data >= 0 ? clean(raw[columns.data]) : '',
      expected: columns.expected >= 0 ? clean(raw[columns.expected]) : '',
      criteria: columns.criteria >= 0 ? clean(raw[columns.criteria]) : '',
      assumptions: columns.assumptions >= 0 ? clean(raw[columns.assumptions]) : '',
      status: columns.status >= 0 ? clean(raw[columns.status]) : '',
      obtained: columns.obtained >= 0 ? clean(raw[columns.obtained]) : '',
      obs: columns.obs >= 0 ? clean(raw[columns.obs]) : '',
    });
  }

  if (rows.length === 0) throw new Error('No se encontraron filas de test cases.');

  return { headers, columns, rows };
}

async function loadContext(projectId, options, q = query) {
  const projectRes = await q(`SELECT id, name FROM qa_projects WHERE id = ?`, [projectId]);
  if (projectRes.rows.length === 0) {
    const error = new Error('Proyecto no encontrado.');
    error.status = 404;
    throw error;
  }

  let existingSuite = null;
  let inferredUseCaseId = null;
  if (options.existingSuiteId) {
    const suiteRes = await q(
      `SELECT id, use_case_id, title, project_id FROM qa_test_suites WHERE id = ? AND project_id = ?`,
      [options.existingSuiteId, projectId],
    );
    if (suiteRes.rows.length === 0) {
      throw new Error('La suite seleccionada no existe en este proyecto.');
    }
    existingSuite = suiteRes.rows[0];
    inferredUseCaseId = existingSuite.use_case_id || null;
  }

  const existingUseCaseId = options.existingUseCaseId || inferredUseCaseId;
  let existingUseCase = null;
  if (existingUseCaseId) {
    const ucRes = await q(`SELECT id, key_id, title FROM qa_use_cases WHERE id = ? AND project_id = ?`, [
      existingUseCaseId,
      projectId,
    ]);
    if (ucRes.rows.length === 0) {
      throw new Error('El caso de uso seleccionado no existe en este proyecto.');
    }
    existingUseCase = ucRes.rows[0];
  }

  return { project: projectRes.rows[0], existingSuite, existingUseCase };
}

function buildPlan(parsed, options, context) {
  const errors = [];
  const warnings = [];
  const useCaseValues = new Map();
  const huValues = new Map();
  const rows = [];

  const useCreateHierarchy = !options.existingSuiteId && !options.existingUseCaseId;
  const useCasesMode = options.createUseCases && useCreateHierarchy;
  const userStoriesMode = options.createUserStories;

  for (const row of parsed.rows) {
    if (!row.title) {
      errors.push({ row: row.excelRow, field: 'Escenario / Título', message: 'El título del TC está vacío.' });
      continue;
    }

    if (userStoriesMode && !row.hu.valid) {
      errors.push({
        row: row.excelRow,
        field: 'HU / Requerimiento',
        message: row.hu.reason || 'La HU no tiene formato KEY - Título.',
      });
    }

    const cuKeyRaw = row.cu.raw || '(sin CU)';
    if (!useCaseValues.has(cuKeyRaw)) {
      useCaseValues.set(cuKeyRaw, {
        raw: row.cu.raw,
        parsed: row.cu,
        count: 0,
        mappedUseCaseId: null,
        action: 'error',
      });
    }
    useCaseValues.get(cuKeyRaw).count += 1;

    if (userStoriesMode) {
      const huKeyRaw = row.hu.key || row.hu.raw || '(sin HU)';
      if (!huValues.has(huKeyRaw)) {
        huValues.set(huKeyRaw, {
          key: row.hu.key,
          title: row.hu.title,
          raw: row.hu.raw,
          count: 0,
        });
      }
      huValues.get(huKeyRaw).count += 1;
    }

    rows.push(row);
  }

  // Validar CU solo cuando se va a crear/importar jerarquía desde la matriz.
  if (useCasesMode) {
    for (const cu of useCaseValues.values()) {
      const mapping = cu.raw ? options.cuMapping[cu.raw] : null;
      if (cu.parsed.valid) {
        cu.action = 'resolve_or_create';
      } else if (mapping && numberOption(mapping.use_case_id)) {
        cu.action = 'map_existing';
        cu.mappedUseCaseId = numberOption(mapping.use_case_id);
      } else if (mapping && mapping.key && mapping.title) {
        cu.action = 'mapped_create';
        cu.parsed = {
          ...cu.parsed,
          key: String(mapping.key).trim(),
          title: String(mapping.title).trim(),
          valid: true,
        };
      } else {
        cu.action = 'error';
        errors.push({
          row: null,
          field: 'CU Vinculado',
          message: `El CU "${cu.raw || '(vacío)'}" no tiene formato válido y no fue mapeado (${cu.count} fila(s)).`,
        });
      }
    }
  } else if (options.createUseCases) {
    warnings.push({
      message: 'La creación de CU se ignoró porque se importa dentro de un CU/suite existente.',
    });
  }

  if (!useCasesMode && !context.existingUseCase && !context.existingSuite) {
    errors.push({
      row: null,
      field: 'Destino',
      message: 'Seleccioná un CU existente o activá la creación automática de CU.',
    });
  }

  const summary = {
    rows: parsed.rows.length,
    valid_rows: rows.length,
    errors: errors.length,
    warnings: warnings.length,
    use_cases: useCasesMode ? useCaseValues.size : (context.existingUseCase ? 1 : 0),
    user_stories: userStoriesMode ? huValues.size : 0,
    suites_to_create: options.existingSuiteId
      ? 0
      : userStoriesMode && options.groupByHu
        ? huValues.size
        : Math.max(1, useCasesMode ? useCaseValues.size : 1),
    test_cases: {
      total: rows.length,
      create: rows.length,
      update: 0,
      skip: 0,
    },
  };

  return {
    plan: {
      rows,
      useCaseValues: [...useCaseValues.values()],
      huValues: [...huValues.values()],
      useCasesMode,
      userStoriesMode,
      useCasesModeLabel: useCasesMode ? 'create' : 'existing',
    },
    summary,
    errors,
    warnings,
    options,
    context,
  };
}

async function previewMatrixImport(projectId, buffer, body = {}) {
  const options = normalizeOptions(body);
  const parsed = parseWorkbook(buffer);
  const context = await loadContext(projectId, options);
  const built = buildPlan(parsed, options, context);

  // Estimación de conflictos contra TC ya existentes (por suite + key/título).
  try {
    const existingRes = await query(`
      SELECT tc.key_id, tc.title, ts.title AS suite_title
        FROM qa_test_cases tc
        JOIN qa_test_suites ts ON ts.id = tc.suite_id
       WHERE ts.project_id = ?
    `, [projectId]);
    const existingBySuite = new Map();
    for (const row of existingRes.rows) {
      const suiteKey = String(row.suite_title || '');
      if (!existingBySuite.has(suiteKey)) existingBySuite.set(suiteKey, new Set());
      if (row.key_id) existingBySuite.get(suiteKey).add(`k:${row.key_id}`);
      if (row.title) existingBySuite.get(suiteKey).add(`t:${row.title}`);
    }

    let create = 0;
    let update = 0;
    let skip = 0;
    for (const row of built.plan.rows) {
      let suiteTitle;
      if (options.existingSuiteId) {
        suiteTitle = context.existingSuite.title;
      } else if (built.plan.userStoriesMode && options.groupByHu) {
        suiteTitle = `${row.hu.key || 'HU'} - ${row.hu.title || row.hu.raw}`;
      } else {
        suiteTitle = `Importación ${row.cu.parsed.key || row.cu.parsed.title || 'general'}`;
      }
      const existing = existingBySuite.get(suiteTitle);
      const conflict = Boolean(
        (row.idTest && existing?.has(`k:${row.idTest}`)) ||
        (row.title && existing?.has(`t:${row.title}`)),
      );
      if (!conflict) create += 1;
      else if (options.conflictPolicy === 'update') update += 1;
      else if (options.conflictPolicy === 'duplicate') create += 1;
      else skip += 1;
    }

    built.summary.test_cases = {
      total: built.plan.rows.length,
      create,
      update,
      skip,
    };
  } catch (error) {
    built.warnings.push({
      message: `No se pudieron estimar conflictos de TC: ${error.message}`,
    });
  }

  return {
    ok: true,
    dry_run: true,
    options,
    filename: body.filename || null,
    headers: parsed.headers,
    summary: built.summary,
    use_case_values: built.plan.useCaseValues.map((cu) => ({
      raw: cu.raw,
      key: cu.parsed.key,
      title: cu.parsed.title,
      count: cu.count,
      action: cu.action,
      valid: cu.parsed.valid,
      mapped_use_case_id: cu.mappedUseCaseId,
    })),
    user_story_values: built.plan.huValues.map((hu) => ({
      key: hu.key,
      title: hu.title,
      count: hu.count,
      valid: Boolean(hu.key && hu.title),
    })),
    errors: built.errors,
    warnings: built.warnings,
  };
}

async function resolveOrCreateUseCase(raw, parsedCu, options, projectId, q, cache) {
  const cacheKey = raw || '(sin CU)';
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const mapping = raw ? options.cuMapping[raw] : null;
  if (mapping && numberOption(mapping.use_case_id)) {
    const res = await q(`SELECT id, key_id, title FROM qa_use_cases WHERE id = ? AND project_id = ?`, [
      numberOption(mapping.use_case_id),
      projectId,
    ]);
    if (res.rows.length === 0) throw new Error(`El CU mapeado para "${raw}" no existe.`);
    const mapped = { ...res.rows[0], __created: false };
    cache.set(cacheKey, mapped);
    return mapped;
  }

  let key = parsedCu.key;
  let title = parsedCu.title;
  if (mapping && mapping.key && mapping.title) {
    key = String(mapping.key).trim();
    title = String(mapping.title).trim();
  }
  if (!title) throw new Error(`El CU "${raw}" no tiene título válido.`);

  if (key) {
    const byKey = await q(
      `SELECT id, key_id, title FROM qa_use_cases WHERE key_id = ? AND project_id = ?`,
      [key, projectId],
    );
    if (byKey.rows.length > 0) {
      const found = { ...byKey.rows[0], __created: false };
      cache.set(cacheKey, found);
      return found;
    }
  }

  const byTitle = await q(
    `SELECT id, key_id, title FROM qa_use_cases WHERE project_id = ? AND title = ? LIMIT 1`,
    [projectId, title],
  );
  if (byTitle.rows.length > 0) {
    const found = { ...byTitle.rows[0], __created: false };
    cache.set(cacheKey, found);
    return found;
  }

  let finalKey = key;
  if (finalKey) {
    const elsewhere = await q(`SELECT 1 FROM qa_use_cases WHERE key_id = ?`, [finalKey]);
    if (elsewhere.rows.length > 0) finalKey = null;
  }
  if (!finalKey) finalKey = await generateKey(projectId, 'CU', q);

  const inserted = await q(
    `INSERT INTO qa_use_cases (project_id, key_id, title, description, created_by)
     VALUES (?, ?, ?, ?, ?) RETURNING id, key_id, title`,
    [projectId, finalKey, title, 'Importado desde matriz de pruebas', options.createdBy || null],
  );
  const created = { ...inserted.rows[0], __created: true };
  cache.set(cacheKey, created);
  return created;
}

async function resolveOrCreateUserStory(hu, useCaseId, projectId, q, cache, createdBy = null) {
  const key = hu.key;
  if (!key) throw new Error(`La HU "${hu.raw}" no tiene key.`);
  const cacheKey = `${useCaseId}:${key}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const byKey = await q(
    `SELECT id, key_id, title, use_case_id FROM qa_user_stories WHERE key_id = ? AND project_id = ?`,
    [key, projectId],
  );
  if (byKey.rows.length > 0) {
    const existing = byKey.rows[0];
    if (existing.use_case_id !== useCaseId) {
      await q(`UPDATE qa_user_stories SET use_case_id = ?, project_id = ? WHERE id = ?`, [
        useCaseId,
        projectId,
        existing.id,
      ]);
      existing.use_case_id = useCaseId;
    }
    const found = { ...existing, __created: false };
    cache.set(cacheKey, found);
    return found;
  }

  let finalKey = key;
  const elsewhere = await q(`SELECT 1 FROM qa_user_stories WHERE key_id = ?`, [finalKey]);
  if (elsewhere.rows.length > 0) finalKey = await generateKey(projectId, 'US', q);

  const inserted = await q(
    `INSERT INTO qa_user_stories (use_case_id, project_id, key_id, title, status, created_by)
     VALUES (?, ?, ?, ?, 'En Análisis', ?) RETURNING id, key_id, title, use_case_id`,
    [useCaseId, projectId, finalKey, hu.title || hu.raw, createdBy],
  );
  const created = { ...inserted.rows[0], __created: true };
  cache.set(cacheKey, created);
  return created;
}

async function resolveOrCreateSuite({ title, useCaseId, projectId, q, cache, createdBy = null }) {
  const cacheKey = `${useCaseId || 'none'}:${title}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const existing = useCaseId
    ? await q(
        `SELECT id, title, use_case_id FROM qa_test_suites WHERE project_id = ? AND use_case_id = ? AND title = ? LIMIT 1`,
        [projectId, useCaseId, title],
      )
    : await q(
        `SELECT id, title, use_case_id FROM qa_test_suites WHERE project_id = ? AND use_case_id IS NULL AND title = ? LIMIT 1`,
        [projectId, title],
      );

  if (existing.rows.length > 0) {
    const found = { ...existing.rows[0], __created: false };
    cache.set(cacheKey, found);
    return found;
  }

  const key = await generateKey(projectId, 'ST', q);
  const inserted = await q(
    `INSERT INTO qa_test_suites (use_case_id, project_id, title, description, key_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING id, title, use_case_id`,
    [useCaseId, projectId, title, 'Importada desde matriz de pruebas', key, createdBy],
  );
  const created = { ...inserted.rows[0], __created: true };
  cache.set(cacheKey, created);
  return created;
}

async function commitMatrixImport(projectId, buffer, body = {}) {
  const options = normalizeOptions({ ...body, dry_run: false });
  const parsed = parseWorkbook(buffer);
  const context = await loadContext(projectId, options);
  const built = buildPlan(parsed, options, context);

  if (built.errors.length > 0) {
    const error = new Error('La matriz tiene errores que impiden la importación.');
    error.status = 400;
    error.details = built.errors;
    throw error;
  }

  const result = {
    use_cases_created: 0,
    user_stories_created: 0,
    suites_created: 0,
    test_cases_created: 0,
    test_cases_updated: 0,
    test_cases_skipped: 0,
    scenarios_created: 0,
  };

  const useCaseCache = new Map();
  const userStoryCache = new Map();
  const suiteCache = new Map();

  let existingUseCase = context.existingUseCase;
  if (options.existingSuiteId && !existingUseCase && context.existingSuite?.use_case_id) {
    const ucRes = await query(`SELECT id, key_id, title FROM qa_use_cases WHERE id = ?`, [
      context.existingSuite.use_case_id,
    ]);
    existingUseCase = ucRes.rows[0] || null;
  }

  const useCaseByRaw = new Map();
  if (options.existingUseCaseId || context.existingSuite) {
    for (const cu of built.plan.useCaseValues) {
      useCaseByRaw.set(cu.raw, existingUseCase || null);
    }
  } else {
    for (const cu of built.plan.useCaseValues) {
      const useCase = await resolveOrCreateUseCase(
        cu.raw,
        cu.parsed,
        options,
        projectId,
        query,
        useCaseCache,
      );
      if (useCase.__created) result.use_cases_created += 1;
      useCaseByRaw.set(cu.raw, useCase);
    }
  }

  // Cada HU pertenece a un CU: la resolvemos con la primera fila que la usa.
  const huToCuRaw = new Map();
  for (const row of built.plan.rows) {
    if (row.hu.raw) huToCuRaw.set(row.hu.raw, row.cu.raw);
    if (row.hu.key) huToCuRaw.set(row.hu.key, row.cu.raw);
  }

  const userStoriesByKey = new Map();
  if (built.plan.userStoriesMode) {
    for (const hu of built.plan.huValues) {
      const cuRaw = huToCuRaw.get(hu.raw) || huToCuRaw.get(hu.key) || null;
      const useCase = cuRaw ? useCaseByRaw.get(cuRaw) : existingUseCase;
      const story = await resolveOrCreateUserStory(
        hu,
        useCase?.id ?? null,
        projectId,
        query,
        userStoryCache,
        options.createdBy,
      );
      if (story.__created) result.user_stories_created += 1;
      userStoriesByKey.set(hu.key || hu.raw, story);
    }
  }

  const rowsBySuite = new Map();
  for (const row of built.plan.rows) {
    const useCase = useCaseByRaw.get(row.cu.raw) || existingUseCase || null;

    let suiteTitle;
    if (options.existingSuiteId) {
      suiteTitle = context.existingSuite.title;
    } else if (built.plan.userStoriesMode && options.groupByHu) {
      suiteTitle = `${row.hu.key || 'HU'} - ${row.hu.title || row.hu.raw}`;
    } else {
      suiteTitle = `Importación ${useCase?.key_id || useCase?.title || 'general'}`;
    }

    const suiteKey = `${useCase?.id || 'none'}:${suiteTitle}`;
    if (!rowsBySuite.has(suiteKey)) {
      let suite;
      if (options.existingSuiteId) {
        suite = context.existingSuite;
      } else {
        suite = await resolveOrCreateSuite({
          title: suiteTitle,
          useCaseId: useCase?.id ?? null,
          projectId,
          q: query,
          cache: suiteCache,
          createdBy: options.createdBy,
        });
        if (suite.__created) result.suites_created += 1;
      }
      rowsBySuite.set(suiteKey, { suite, useCase, rows: [] });
    }
    rowsBySuite.get(suiteKey).rows.push(row);
  }

  for (const group of rowsBySuite.values()) {
    const { suite, rows } = group;
    const tcRes = await query(
      `SELECT id, key_id, title FROM qa_test_cases WHERE suite_id = ?`,
      [suite.id],
    );
    const existingByKey = new Map();
    const existingByTitle = new Map();
    for (const tc of tcRes.rows) {
      if (tc.key_id) existingByKey.set(String(tc.key_id), tc);
      if (tc.title) existingByTitle.set(String(tc.title), tc);
    }

    const toInsert = [];
    for (const row of rows) {
      const story = built.plan.userStoriesMode
        ? userStoriesByKey.get(row.hu.key || row.hu.raw)
        : null;
      const existing = (row.idTest && existingByKey.get(row.idTest)) || existingByTitle.get(row.title);

      if (existing) {
        if (options.conflictPolicy === 'skip') {
          result.test_cases_skipped += 1;
          continue;
        }
        if (options.conflictPolicy === 'update') {
          await query(
            `UPDATE qa_test_cases
                SET title = ?, steps = ?, preconditions = ?, expected_result = ?,
                    assumptions = ?, test_data = ?, acceptance_criteria = ?,
                    us_id = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
            [
              row.title,
              row.steps,
              row.pre,
              row.expected,
              row.assumptions,
              row.data,
              row.criteria,
              story?.id || null,
              existing.id,
            ],
          );
          result.test_cases_updated += 1;
          continue;
        }
      }

      toInsert.push({ row, story });
    }

    let tcStart = null;
    if (toInsert.length > 0) {
      tcStart = await generateKeyBatch(projectId, 'TC', toInsert.length, query);
    }

    for (let index = 0; index < toInsert.length; index += 1) {
      const { row, story } = toInsert[index];
      let scenarioId = null;
      if (story?.id) {
        const scenario = await query(
          `INSERT INTO qa_scenarios (us_id, title, order_index) VALUES (?, ?, ?) RETURNING id`,
          [story.id, row.title, row.excelRow],
        );
        scenarioId = scenario.rows[0].id;
        result.scenarios_created += 1;
      }

      const key = row.idTest || `TC-${(tcStart + index).toString().padStart(4, '0')}`;
      await query(
        `INSERT INTO qa_test_cases
            (suite_id, us_id, scenario_id, key_id, title, steps, preconditions,
             expected_result, assumptions, test_data, acceptance_criteria,
             project_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          suite.id,
          story?.id || null,
          scenarioId,
          key,
          row.title,
          row.steps,
          row.pre,
          row.expected,
          row.assumptions,
          row.data,
          row.criteria,
          projectId,
          options.createdBy,
        ],
      );
      result.test_cases_created += 1;

      if (story?.id) {
        await query(
          `UPDATE qa_user_stories
              SET escenarios_prueba = COALESCE(NULLIF(escenarios_prueba, ''), ?)
            WHERE id = ?`,
          [row.title, story.id],
        );
      }
    }
  }

  return {
    ok: true,
    dry_run: false,
    summary: {
      rows: parsed.rows.length,
      use_cases: useCaseByRaw.size,
      user_stories: userStoriesByKey.size,
      suites: rowsBySuite.size,
      test_cases: {
        total: built.plan.rows.length,
        create: result.test_cases_created,
        update: result.test_cases_updated,
        skip: result.test_cases_skipped,
      },
    },
    result,
  };
}

function preparedCount(map) {
  return map instanceof Map ? map.size : 0;
}

module.exports = {
  parseWorkbook,
  parseEntity,
  normalizeOptions,
  previewMatrixImport,
  commitMatrixImport,
};
