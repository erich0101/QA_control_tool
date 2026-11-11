const XLSX = require('xlsx');
const { getClient } = require('../../db');
const { generateKeyBatch } = require('./sequences');

// Procesadores de importación XLSX/CSV (una fila por HU/test o formato dual).
async function processFlatImport(req, res, data, headers, ucId, projectId, normalize, tryFindColIndex, sanitizeInput, generateKey, query) {
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

    // Agrupar por HU
    const groups = {};
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        let usTitle = String(row[colMap.us_title] || '').trim();
        if (!usTitle || usTitle === 'Sin HU vinculada') continue;
        // Limpiar prefijo [US-XXX] si existe
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

            const getVal = (row, idx) => idx !== -1 && row[idx] !== undefined ? sanitizeInput(row[idx]) : '';

            // Crear Suite para esta HU
            const suiteKey = await generateKey(projectId, 'ST', q);
            const suiteRes = await q(`
                INSERT INTO qa_test_suites (use_case_id, project_id, title, description, key_id, created_by)
                VALUES (?, ?, ?, ?, ?, ?)
                RETURNING id
            `, [ucId, projectId, `Suite: ${usTitle}`, `Importación automática ${suiteKey}`, suiteKey, req.user.id]);
            const suiteId = suiteRes.rows[0].id;

            // Crear HU
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

async function processDualImport(req, res, workbook, isCSV, ucId, projectId, normalize, tryFindColIndex, sanitizeInput, generateKey, query) {
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
        const usTitle = sanitizeInput(row[tcColMap.us_title]);
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
                INSERT INTO qa_test_suites (use_case_id, project_id, title, description, key_id, created_by)
                VALUES (?, ?, ?, ?, ?, ?)
                RETURNING id
            `, [ucId, projectId, `Suite: ${usTitle}`, `Importación automática ${suiteKey}`, suiteKey, req.user.id]);
            const suiteId = suiteResNew.rows[0].id;

            const usKey = await generateKey(projectId, 'US', q);
            const usDesc = sanitizeInput(firstRow[tcColMap.us_desc]) || '';
            const usBR = sanitizeInput(firstRow[tcColMap.us_br]) || '';
            const usPre = sanitizeInput(firstRow[tcColMap.us_pre]) || '';

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
                const getVal = (idx) => idx !== -1 && row[idx] !== undefined ? sanitizeInput(row[idx]) : '';
                return getVal(tcColMap.title);
            });
            let tcKeyStart = null;
            if (validRows.length > 0) {
                tcKeyStart = await generateKeyBatch(projectId, 'TC', validRows.length, q);
            }
            let tcIdx = 0;
            for (const row of rows) {
                const getVal = (idx) => idx !== -1 && row[idx] !== undefined ? sanitizeInput(row[idx]) : '';

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

module.exports = { processFlatImport, processDualImport };
