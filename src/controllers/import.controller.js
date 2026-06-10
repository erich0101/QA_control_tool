const { query, getClient } = require('../config/db');
const XLSX = require('xlsx');
const { generateKey, generateKeyBatch, escapeForCsv } = require('../utils/keyGenerator');
const logger = require('../utils/logger');

function normalize(str) {
    if (!str) return '';
    return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function tryFindColIndex(headers, keywords) {
    if (!headers || headers.length === 0) return -1;
    for (let i = 0; i < headers.length; i++) {
        const nh = normalize(headers[i]);
        if (keywords.every(k => nh.includes(k))) return i;
    }
    return -1;
}

async function processFlatImport(req, res, data, headers, ucId, projectId) {
    const colMap = {
        uc_title: tryFindColIndex(headers, ['cu', 'vinculad']),
        suite: tryFindColIndex(headers, ['suite', 'grupo']),
        key_id: tryFindColIndex(headers, ['id test']),
        us_title: tryFindColIndex(headers, ['hu', 'requerimiento']),
        title: tryFindColIndex(headers, ['escenario']),
        pre: tryFindColIndex(headers, ['precondicion']),
        steps: tryFindColIndex(headers, ['paso']),
        data: tryFindColIndex(headers, ['datos de prueba']),
        expected: tryFindColIndex(headers, ['resultado esperado']),
        criteria: tryFindColIndex(headers, ['criterio', 'aceptacion']),
        assumptions: tryFindColIndex(headers, ['assumption', 'suposicion']),
        status: tryFindColIndex(headers, ['estado']),
        obtained: tryFindColIndex(headers, ['resultado obtenid']),
        obs: tryFindColIndex(headers, ['observacion', 'hallazgo']),
        tester: tryFindColIndex(headers, ['tester']),
        date: tryFindColIndex(headers, ['fecha ejecucion'])
    };

    if (colMap.title === -1 || colMap.steps === -1 || colMap.expected === -1 || colMap.us_title === -1) {
        return res.status(400).json({
            error: 'Faltan columnas obligatorias en formato unificado',
            detalle: 'Se requieren: CU Vinculado, HU/Requerimiento, Escenario, Pasos, Resultado Esperado'
        });
    }

    const groups = {};
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        let usTitle = String(row[colMap.us_title] || '').trim();
        if (!usTitle || usTitle === 'Sin HU vinculada') continue;
        usTitle = usTitle.replace(/^\[.*?\]\s*/, '');
        if (!groups[usTitle]) groups[usTitle] = [];
        groups[usTitle].push(row);
    }

    let totalImported = 0;
    let usCount = 0;

    const client = await getClient();
    const q = client.query;
    try {
        await q('BEGIN');
        for (const usTitle in groups) {
            const rows = groups[usTitle];
            const firstRow = rows[0];

            const getVal = (row, idx) => idx !== -1 && row[idx] !== undefined ? escapeForCsv(row[idx]) : '';

            const suiteKey = await generateKey(projectId, 'ST', q);
            const suiteRes = await q(`
                INSERT INTO qa_test_suites (use_case_id, title, description, key_id, created_by)
                VALUES (?, ?, ?, ?, ?)
                RETURNING id
            `, [ucId, `Suite: ${usTitle}`, `Importación automática ${suiteKey}`, suiteKey, req.user.id]);
            const suiteId = suiteRes.rows[0].id;

            const usKey = await generateKey(projectId, 'US', q);
            const usDesc = getVal(firstRow, colMap.data) || '';
            const usBR = '';
            const usPre = getVal(firstRow, colMap.pre) || '';

            const usRes = await q(`
                INSERT INTO qa_user_stories (use_case_id, project_id, key_id, title, hu_detallada, reglas_negocio, precondiciones, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (key_id) DO UPDATE SET title = EXCLUDED.title
                RETURNING id
            `, [ucId, projectId, usKey, usTitle, usDesc, usBR, usPre, req.user.id]);
            const usId = usRes.rows[0].id;
            usCount++;

            let escenariosText = [];
            const validRows = rows.filter(row => getVal(row, colMap.title));
            let tcKeyStart = null;
            if (validRows.length > 0) {
                tcKeyStart = await generateKeyBatch(projectId, 'TC', validRows.length, q);
            }
            let tcIdx = 0;
            for (const row of rows) {
                const title = getVal(row, colMap.title);
                if (!title) continue;

                const steps = getVal(row, colMap.steps);
                const pre = getVal(row, colMap.pre);
                const expected = getVal(row, colMap.expected);
                const assumptions = getVal(row, colMap.assumptions);
                const testData = getVal(row, colMap.data);
                const criteria = getVal(row, colMap.criteria);

                const scenarioRes = await q(
                    `INSERT INTO qa_scenarios (us_id, title, order_index) VALUES (?, ?, ?) RETURNING id`,
                    [usId, title, totalImported]
                );
                const scenarioId = scenarioRes.rows[0].id;

                const tcNum = tcKeyStart + tcIdx;
                const tcKey = `TC-${tcNum.toString().padStart(4, '0')}`;
                tcIdx++;
                await q(`
                    INSERT INTO qa_test_cases (suite_id, us_id, scenario_id, key_id, title, steps, preconditions, expected_result, assumptions, test_data, acceptance_criteria, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [suiteId, usId, scenarioId, tcKey, title, steps, pre, expected, assumptions, testData, criteria, req.user.id]);

                totalImported++;
            }

            if (escenariosText.length > 0) {
                await q(`UPDATE qa_user_stories SET escenarios_prueba = ? WHERE id = ?`, [escenariosText.join('\n'), usId]);
            }
        }

        await q('COMMIT');
        client.release();
        return res.json({
            ok: true,
            message: `Importación exitosa (formato unificado). ${usCount} historias de usuario y ${totalImported} tests importados.`
        });
    } catch (err) {
        await q('ROLLBACK');
        client.release();
        throw err;
    }
}

async function processDualImport(req, res, workbook, isCSV, ucId, projectId, file) {
    let sheetUSName, sheetTCName;

    if (isCSV) {
        sheetUSName = workbook.SheetNames[0];
        sheetTCName = workbook.SheetNames[0];
    } else {
        sheetUSName = 'historia de usuario';
        sheetTCName = 'Casos de Prueba';
        const realUS = workbook.SheetNames.find(n => n.toLowerCase() === sheetUSName);
        const realTC = workbook.SheetNames.find(n => n.toLowerCase() === sheetTCName);
        if (realUS) sheetUSName = realUS;
        if (realTC) sheetTCName = realTC;

        if (!workbook.SheetNames.includes(sheetUSName) || !workbook.SheetNames.includes(sheetTCName)) {
            return res.status(400).json({ error: `El archivo XLSX debe contener las hojas "${sheetUSName}" y "${sheetTCName}"` });
        }
    }

    let dataUS = XLSX.utils.sheet_to_json(workbook.Sheets[sheetUSName], { header: 1 });
    let dataTC = XLSX.utils.sheet_to_json(workbook.Sheets[sheetTCName], { header: 1 });

    if (dataUS.length < 2) return res.status(400).json({ error: 'El archivo está vacío o no tiene datos suficientes' });

    const tryFindCol = (data, keywords) => {
        if (!data || data.length === 0) return null;
        let headers = data[0].map(h => normalize(h));

        let found = data[0].find(h => {
            const nh = normalize(h);
            return keywords.every(k => nh.includes(k));
        });
        if (found) return found;

        if (isCSV && data[0].length === 1) {
            const line = String(data[0][0]);
            const delims = [',', ';'];
            for (let d of delims) {
                if (line.includes(d)) {
                    const parts = line.split(d);
                    const nhParts = parts.map(p => normalize(p));
                    if (keywords.every(k => nhParts.some(p => p.includes(k)))) {
                        if (data === dataUS) {
                            dataUS.forEach((r, idx) => {
                                if (r.length === 1) dataUS[idx] = String(r[0]).split(d);
                            });
                        }
                        if (data === dataTC) {
                            dataTC.forEach((r, idx) => {
                                if (r.length === 1) dataTC[idx] = String(r[0]).split(d);
                            });
                        }
                        return parts.find(p => keywords.every(k => normalize(p).includes(k)));
                    }
                }
            }
        }
        return null;
    };

    const colUS_Title = tryFindCol(dataUS, ['titulo', 'historia']);

    const headersUS = dataUS[0].map(h => String(h || '').trim());
    const headersTC = dataTC[0].map(h => String(h || '').trim());

    if (!colUS_Title) {
        return res.status(400).json({
            error: 'Faltan columnas obligatorias (Título de la HU)',
            detalle: `Columnas detectadas: [${headersUS.join(' | ')}]`
        });
    }

    const tcColMap = {
        us_title: headersTC.indexOf(colUS_Title),
        title: tryFindCol(dataTC, ['escenario']),
        pre: tryFindCol(dataTC, ['precondicion']),
        data: tryFindCol(dataTC, ['datos de prueba']),
        steps: tryFindCol(dataTC, ['paso']),
        criteria: tryFindCol(dataTC, ['criterio']),
        expected: tryFindCol(dataTC, ['resultado esperado']),
        assumptions: tryFindCol(dataTC, ['suposicion']),
        us_desc: headersUS.find(h => normalize(h).includes('descripcion')),
        us_br: headersUS.find(h => normalize(h).includes('reglas de negocio')),
        us_pre: headersUS.find(h => normalize(h).includes('precondiciones'))
    };

    Object.keys(tcColMap).forEach(k => {
        if (typeof tcColMap[k] === 'string') tcColMap[k] = headersTC.indexOf(tcColMap[k]);
    });

    if (tcColMap.title === -1 || tcColMap.steps === -1 || tcColMap.expected === -1) {
        return res.status(400).json({ error: 'Faltan columnas obligatorias (Escenario, Pasos, Resultado Esperado)' });
    }

    const groups = {};
    for (let i = 1; i < dataTC.length; i++) {
        const row = dataTC[i];
        const usTitle = escapeForCsv(row[tcColMap.us_title]);
        if (!usTitle) continue;
        if (!groups[usTitle]) groups[usTitle] = [];
        groups[usTitle].push(row);
    }

    let totalImported = 0;
    let usCount = 0;

    const client = await getClient();
    const q = client.query;
    try {
        await q('BEGIN');
        for (const usTitle in groups) {
            const rows = groups[usTitle];
            const firstRow = rows[0];

            const suiteKey = await generateKey(projectId, 'ST', q);
            const suiteResNew = await q(`
                INSERT INTO qa_test_suites (use_case_id, title, description, key_id, created_by)
                VALUES (?, ?, ?, ?, ?)
                RETURNING id
            `, [ucId, `Suite: ${usTitle}`, `Importación automática ${suiteKey}`, suiteKey, req.user.id]);
            const suiteId = suiteResNew.rows[0].id;

            const usKey = await generateKey(projectId, 'US', q);
            const usDesc = escapeForCsv(firstRow[tcColMap.us_desc]) || '';
            const usBR = escapeForCsv(firstRow[tcColMap.us_br]) || '';
            const usPre = escapeForCsv(firstRow[tcColMap.us_pre]) || '';

            const usRes = await q(`
                INSERT INTO qa_user_stories (use_case_id, project_id, key_id, title, hu_detallada, reglas_negocio, precondiciones, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (key_id) DO UPDATE SET title = EXCLUDED.title
                RETURNING id
            `, [ucId, projectId, usKey, usTitle, usDesc, usBR, usPre, req.user.id]);
            const usId = usRes.rows[0].id;
            usCount++;

            let escenariosText = [];
            const validRows = rows.filter(row => {
                const getVal = (idx) => idx !== -1 && row[idx] !== undefined ? escapeForCsv(row[idx]) : '';
                return getVal(tcColMap.title);
            });
            let tcKeyStart = null;
            if (validRows.length > 0) {
                tcKeyStart = await generateKeyBatch(projectId, 'TC', validRows.length, q);
            }
            let tcIdx = 0;
            for (const row of rows) {
                const getVal = (idx) => idx !== -1 && row[idx] !== undefined ? escapeForCsv(row[idx]) : '';

                const title = getVal(tcColMap.title);
                if (!title) continue;

                const steps = getVal(tcColMap.steps);
                const pre = getVal(tcColMap.pre);
                const expected = getVal(tcColMap.expected);
                const assumptions = getVal(tcColMap.assumptions);
                const testData = getVal(tcColMap.data);
                const criteria = getVal(tcColMap.criteria);

                const scenarioRes = await q(
                    `INSERT INTO qa_scenarios (us_id, title, order_index) VALUES (?, ?, ?) RETURNING id`,
                    [usId, title, totalImported]
                );
                const scenarioId = scenarioRes.rows[0].id;
                escenariosText.push(title);

                const tcNum = tcKeyStart + tcIdx;
                const tcKey = `TC-${tcNum.toString().padStart(4, '0')}`;
                tcIdx++;
                await q(`
                    INSERT INTO qa_test_cases (suite_id, us_id, scenario_id, key_id, title, steps, preconditions, expected_result, assumptions, test_data, acceptance_criteria, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [suiteId, usId, scenarioId, tcKey, title, steps, pre, expected, assumptions, testData, criteria, req.user.id]);

                totalImported++;
            }

            if (escenariosText.length > 0) {
                await q(`UPDATE qa_user_stories SET escenarios_prueba = ? WHERE id = ?`, [escenariosText.join('\n'), usId]);
            }
        }

        await q('COMMIT');
        client.release();
        return res.json({
            ok: true,
            message: `Importación exitosa. Se creó la suite "${file.originalname}" con ${usCount} historias de usuario y ${totalImported} tests.`
        });
    } catch (err) {
        await q('ROLLBACK');
        client.release();
        throw err;
    }
}

exports.importDual = async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Archivo no recibido' });

    let workbook;
    try {
        workbook = XLSX.read(file.buffer, { type: 'buffer' });
    } catch (e) {
        const content = file.buffer.toString('utf-8');
        workbook = XLSX.read(content, { type: 'string' });
    }

    const isCSV = file.originalname.toLowerCase().endsWith('.csv');
    let isFlatFormat = false;
    let dataFlat = null;
    let headersFlat = null;

    if (!isCSV && workbook.SheetNames.length === 1) {
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (data.length > 0) {
            const headers = data[0].map(h => normalize(h));
            const hasCU = headers.some(h => h.includes('cu') && h.includes('vinculad'));
            const hasHU = headers.some(h => h.includes('hu') || h.includes('requerimiento'));
            const hasEscenario = headers.some(h => h.includes('escenario'));
            const hasPasos = headers.some(h => h.includes('paso'));
            if (hasCU && hasHU && hasEscenario && hasPasos) {
                isFlatFormat = true;
                dataFlat = data;
                headersFlat = data[0].map(h => String(h || '').trim());
            }
        }
    }

    let ucId = req.params.id;
    const isUseCasePath = req.url.includes('/use-cases/');

    if (!isUseCasePath) {
        const sRes = await query(`SELECT use_case_id FROM qa_test_suites WHERE id = ?`, [ucId]);
        if (sRes.rows.length > 0) ucId = sRes.rows[0].use_case_id;
        else return res.status(404).json({ error: 'Suite no encontrada' });
    }

    const ucRes = await query(`SELECT project_id FROM qa_use_cases WHERE id = ?`, [ucId]);
    if (ucRes.rows.length === 0) return res.status(404).json({ error: 'Caso de Uso no encontrado' });
    const projectId = ucRes.rows[0].project_id;

    if (isFlatFormat) {
        return await processFlatImport(req, res, dataFlat, headersFlat, ucId, projectId);
    }

    return await processDualImport(req, res, workbook, isCSV, ucId, projectId, file);
};

exports.exportUseCaseExcel = async (req, res) => {
    const useCaseId = req.params.id;

    const ucRes = await query(`
        SELECT uc.*, p.name as project_name
        FROM qa_use_cases uc
        JOIN qa_projects p ON uc.project_id = p.id
        WHERE uc.id = ?
    `, [useCaseId]);

    if (ucRes.rows.length === 0) return res.status(404).json({ error: 'Caso de Uso no encontrado' });
    const useCase = ucRes.rows[0];

    const casesRes = await query(`
        SELECT tc.*, us.title as us_title, us.key_id as us_key, s.title as suite_title,
               uc.title as uc_title,
               e.status as last_status, e.observations, e.obtained_result, e.tester, e.executed_at
        FROM qa_test_cases tc
        JOIN qa_test_suites s ON tc.suite_id = s.id
        LEFT JOIN qa_user_stories us ON tc.us_id = us.id
        LEFT JOIN qa_use_cases uc ON s.use_case_id = uc.id
        LEFT JOIN LATERAL (
            SELECT status, observations, obtained_result, tester, executed_at
            FROM qa_executions
            WHERE tc_id = tc.id
            ORDER BY executed_at DESC
            LIMIT 1
        ) e ON true
        WHERE s.use_case_id = ?
        ORDER BY s.id, us.id, tc.id
    `, [useCaseId]);

    const wb = XLSX.utils.book_new();

    const headers = [
        'CU Vinculado',
        'Suite / Grupo',
        'ID Test',
        'HU / Requerimiento',
        'Escenario / Título',
        'Precondiciones',
        'Pasos de Reproducción',
        'Datos de Prueba',
        'Resultado Esperado',
        'Criterios Aceptación',
        'Assumptions',
        'Estado',
        'Resultado Obtenido',
        'Observaciones / Hallazgos',
        'Tester',
        'Fecha Ejecución'
    ];

    const data = [headers];
    casesRes.rows.forEach((tc) => {
        data.push([
            tc.uc_title || useCase.title || '',
            tc.suite_title || '',
            tc.key_id || `TC-${tc.id}`,
            tc.us_title ? `[${tc.us_key || 'N/A'}] ${tc.us_title}` : 'Sin HU vinculada',
            tc.title || '',
            tc.preconditions || '',
            tc.steps || tc.description || '',
            tc.test_data || '',
            tc.expected_result || '',
            tc.acceptance_criteria || '',
            tc.assumptions || '',
            tc.last_status || 'PENDIENTE',
            tc.obtained_result || '',
            tc.observations || '',
            tc.tester || '',
            tc.executed_at ? new Date(tc.executed_at).toLocaleString() : '-'
        ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);

    ws['!cols'] = [
        { wch: 30 }, { wch: 25 }, { wch: 15 }, { wch: 35 },
        { wch: 45 }, { wch: 40 }, { wch: 55 }, { wch: 40 },
        { wch: 45 }, { wch: 40 }, { wch: 40 }, { wch: 15 },
        { wch: 45 }, { wch: 45 }, { wch: 15 }, { wch: 22 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Matriz de Pruebas');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Matriz_${useCase.key_id || 'CU'}_${new Date().toISOString().split('T')[0]}.xlsx"`);
    res.send(buf);
};

exports.exportProjectExcel = async (req, res) => {
    const projectId = req.params.id;

    const projRes = await query(`SELECT * FROM qa_projects WHERE id = ?`, [projectId]);
    if (projRes.rows.length === 0) return res.status(404).json({ error: 'Proyecto no encontrado' });
    const project = projRes.rows[0];

    const casesRes = await query(`
        SELECT tc.*, us.title as us_title, us.key_id as us_key, s.title as suite_title,
               uc.title as uc_title, uc.key_id as uc_key,
               e.status as last_status, e.observations, e.obtained_result, e.tester, e.executed_at
        FROM qa_test_cases tc
        JOIN qa_test_suites s ON tc.suite_id = s.id
        JOIN qa_use_cases uc ON s.use_case_id = uc.id
        LEFT JOIN qa_user_stories us ON tc.us_id = us.id
        LEFT JOIN LATERAL (
            SELECT status, observations, obtained_result, tester, executed_at
            FROM qa_executions
            WHERE tc_id = tc.id
            ORDER BY executed_at DESC
            LIMIT 1
        ) e ON true
        WHERE uc.project_id = ?
        ORDER BY uc.id, s.id, us.id, tc.id
    `, [projectId]);

    const wb = XLSX.utils.book_new();

    const headers = [
        'CU Vinculado',
        'Suite / Grupo',
        'ID Test',
        'HU / Requerimiento',
        'Escenario / Título',
        'Precondiciones',
        'Pasos de Reproducción',
        'Datos de Prueba',
        'Resultado Esperado',
        'Criterios Aceptación',
        'Assumptions',
        'Estado',
        'Resultado Obtenido',
        'Observaciones / Hallazgos',
        'Tester',
        'Fecha Ejecución'
    ];

    const data = [headers];
    casesRes.rows.forEach((tc) => {
        data.push([
            tc.uc_title || '',
            tc.suite_title || '',
            tc.key_id || `TC-${tc.id}`,
            tc.us_title ? `[${tc.us_key || 'N/A'}] ${tc.us_title}` : 'Sin HU vinculada',
            tc.title || '',
            tc.preconditions || '',
            tc.steps || tc.description || '',
            tc.test_data || '',
            tc.expected_result || '',
            tc.acceptance_criteria || '',
            tc.assumptions || '',
            tc.last_status || 'PENDIENTE',
            tc.obtained_result || '',
            tc.observations || '',
            tc.tester || '',
            tc.executed_at ? new Date(tc.executed_at).toLocaleString() : '-'
        ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);

    ws['!cols'] = [
        { wch: 30 }, { wch: 25 }, { wch: 15 }, { wch: 35 },
        { wch: 45 }, { wch: 40 }, { wch: 55 }, { wch: 40 },
        { wch: 45 }, { wch: 40 }, { wch: 40 }, { wch: 15 },
        { wch: 45 }, { wch: 45 }, { wch: 15 }, { wch: 22 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Matriz de Pruebas');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Matriz_Proyecto_${project.key_id || project.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx"`);
    res.send(buf);
};
