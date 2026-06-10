const db = require('../db');
const XLSX = require('xlsx');
const { escapeForCsv } = require('../utils/keyGenerator');
const testSuitesRepo = require('../repositories/testSuites.repository');
const userStoriesRepo = require('../repositories/userStories.repository');
const scenariosRepo = require('../repositories/scenarios.repository');
const testCasesRepo = require('../repositories/testCases.repository');
const useCasesRepo = require('../repositories/useCases.repository');
const projectsRepo = require('../repositories/projects.repository');
const projectSequencesRepo = require('../repositories/projectSequences.repository');

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

    await db.withTransaction(async (tx) => {
        for (const usTitle in groups) {
            const rows = groups[usTitle];
            const firstRow = rows[0];

            const getVal = (row, idx) => idx !== -1 && row[idx] !== undefined ? escapeForCsv(row[idx]) : '';

            const suiteKeyNum = await projectSequencesRepo.increment(projectId, 'ST', tx);
            const suiteKey = `ST-${suiteKeyNum.toString().padStart(4, '0')}`;
            const suiteId = await testSuitesRepo.createReturning({
                useCaseId: ucId, title: `Suite: ${usTitle}`,
                description: `Importación automática ${suiteKey}`,
                keyId: suiteKey, createdBy: req.user.id
            }, tx);

            const usKeyNum = await projectSequencesRepo.increment(projectId, 'US', tx);
            const usKey = `US-${usKeyNum.toString().padStart(4, '0')}`;
            const usDesc = getVal(firstRow, colMap.data) || '';
            const usBR = '';
            const usPre = getVal(firstRow, colMap.pre) || '';

            const usId = await userStoriesRepo.upsertReturning({
                useCaseId: ucId, projectId, keyId: usKey, title: usTitle,
                huDetallada: usDesc, reglasNegocio: usBR, precondiciones: usPre,
                createdBy: req.user.id
            }, tx);
            usCount++;

            let escenariosText = [];
            const validRows = rows.filter(row => getVal(row, colMap.title));
            let tcKeyStart = null;
            if (validRows.length > 0) {
                tcKeyStart = await projectSequencesRepo.incrementBy(projectId, 'TC', validRows.length, tx);
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

                const scenarioId = await scenariosRepo.createReturning({
                    usId, title, orderIndex: totalImported
                }, tx);

                const tcNum = tcKeyStart + tcIdx;
                const tcKey = `TC-${tcNum.toString().padStart(4, '0')}`;
                tcIdx++;
                await testCasesRepo.create({
                    suiteId, usId, scenarioId, keyId: tcKey, title, steps, preconditions: pre,
                    expectedResult: expected, assumptions, testData, acceptanceCriteria: criteria,
                    createdBy: req.user.id
                }, tx);

                totalImported++;
            }

            if (escenariosText.length > 0) {
                await userStoriesRepo.setEscenariosPrueba(usId, escenariosText.join('\n'), tx);
            }
        }
    });

    return res.json({
        ok: true,
        message: `Importación exitosa (formato unificado). ${usCount} historias de usuario y ${totalImported} tests importados.`
    });
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

    await db.withTransaction(async (tx) => {
        for (const usTitle in groups) {
            const rows = groups[usTitle];
            const firstRow = rows[0];

            const suiteKeyNum = await projectSequencesRepo.increment(projectId, 'ST', tx);
            const suiteKey = `ST-${suiteKeyNum.toString().padStart(4, '0')}`;
            const suiteId = await testSuitesRepo.createReturning({
                useCaseId: ucId, title: `Suite: ${usTitle}`,
                description: `Importación automática ${suiteKey}`,
                keyId: suiteKey, createdBy: req.user.id
            }, tx);

            const usKeyNum = await projectSequencesRepo.increment(projectId, 'US', tx);
            const usKey = `US-${usKeyNum.toString().padStart(4, '0')}`;
            const usDesc = escapeForCsv(firstRow[tcColMap.us_desc]) || '';
            const usBR = escapeForCsv(firstRow[tcColMap.us_br]) || '';
            const usPre = escapeForCsv(firstRow[tcColMap.us_pre]) || '';

            const usId = await userStoriesRepo.upsertReturning({
                useCaseId: ucId, projectId, keyId: usKey, title: usTitle,
                huDetallada: usDesc, reglasNegocio: usBR, precondiciones: usPre,
                createdBy: req.user.id
            }, tx);
            usCount++;

            let escenariosText = [];
            const validRows = rows.filter(row => {
                const getVal = (idx) => idx !== -1 && row[idx] !== undefined ? escapeForCsv(row[idx]) : '';
                return getVal(tcColMap.title);
            });
            let tcKeyStart = null;
            if (validRows.length > 0) {
                tcKeyStart = await projectSequencesRepo.incrementBy(projectId, 'TC', validRows.length, tx);
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

                const scenarioId = await scenariosRepo.createReturning({
                    usId, title, orderIndex: totalImported
                }, tx);
                escenariosText.push(title);

                const tcNum = tcKeyStart + tcIdx;
                const tcKey = `TC-${tcNum.toString().padStart(4, '0')}`;
                tcIdx++;
                await testCasesRepo.create({
                    suiteId, usId, scenarioId, keyId: tcKey, title, steps, preconditions: pre,
                    expectedResult: expected, assumptions, testData, acceptanceCriteria: criteria,
                    createdBy: req.user.id
                }, tx);

                totalImported++;
            }

            if (escenariosText.length > 0) {
                await userStoriesRepo.setEscenariosPrueba(usId, escenariosText.join('\n'), tx);
            }
        }
    });

    return res.json({
        ok: true,
        message: `Importación exitosa. Se creó la suite "${file.originalname}" con ${usCount} historias de usuario y ${totalImported} tests.`
    });
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
        const suite = await testSuitesRepo.findUseCaseId(ucId);
        if (suite) ucId = suite;
        else return res.status(404).json({ error: 'Suite no encontrada' });
    }

    const projectId = await useCasesRepo.findProjectId(ucId);
    if (!projectId) return res.status(404).json({ error: 'Caso de Uso no encontrado' });

    if (isFlatFormat) {
        return await processFlatImport(req, res, dataFlat, headersFlat, ucId, projectId);
    }

    return await processDualImport(req, res, workbook, isCSV, ucId, projectId, file);
};

exports.exportUseCaseExcel = async (req, res) => {
    const useCaseId = req.params.id;

    const useCase = await useCasesRepo.findByIdWithProject(useCaseId);

    if (!useCase) return res.status(404).json({ error: 'Caso de Uso no encontrado' });

    const cases = await testCasesRepo.exportByUseCase(useCaseId);

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
    cases.forEach((tc) => {
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

    const project = await projectsRepo.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' });

    const cases = await testCasesRepo.exportByProject(projectId);

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
    cases.forEach((tc) => {
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
