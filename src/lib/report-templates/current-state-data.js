const { query } = require('../../../db');
const { getEvidenceBase64 } = require('../report-evidence');

const OPEN_DEFECT_STATUSES = new Set(['OPEN', 'ABIERTO', 'IN_PROGRESS', 'EN_PROGRESO', 'BLOQUEADO']);

function isPass(status) {
    return status === 'OK' || status === 'PASS';
}

function isOpenDefect(status) {
    return OPEN_DEFECT_STATUSES.has(String(status || 'OPEN').toUpperCase());
}

/**
 * Reporte de entrega "estado actual": una sola ejecución/sesión, con el
 * último resultado guardado de cada TC. No incluye la cadena histórica de
 * retests; para eso existe el reporte de estado de entrega por ciclo.
 */
async function buildCurrentStateReportData(runId) {
    const runRes = await query(`
        SELECT r.*, s.title AS suite_title, s.id AS suite_id,
               cu.title AS cu_title, cu.key_id AS cu_key_id,
               p.id AS project_id, p.name AS project_name,
               u.name AS created_by_name
          FROM qa_test_runs r
          JOIN qa_test_suites s ON r.suite_id = s.id
          LEFT JOIN qa_use_cases cu ON s.use_case_id = cu.id
          JOIN qa_projects p ON p.id = r.project_id
          LEFT JOIN qa_users u ON u.id = r.created_by
         WHERE r.id = ?
    `, [runId]);

    if (runRes.rows.length === 0) {
        const error = new Error('Ejecución no encontrada');
        error.status = 404;
        throw error;
    }
    const run = runRes.rows[0];
    const isExploratory = run.run_type === 'EXPLORATORY';

    // Exploratoria: solo los TC que participaron de la sesión.
    // Ejecución normal: todos los TC de la suite, incluso pendientes.
    const tcsRes = isExploratory
        ? await query(`
            SELECT DISTINCT tc.*, us.key_id AS us_key, us.title AS us_title
              FROM qa_test_cases tc
              JOIN qa_executions e ON e.tc_id = tc.id
              LEFT JOIN qa_user_stories us ON us.id = tc.us_id
             WHERE e.run_id = ?
             ORDER BY tc.id ASC
        `, [runId])
        : await query(`
            SELECT tc.*, us.key_id AS us_key, us.title AS us_title
              FROM qa_test_cases tc
              LEFT JOIN qa_user_stories us ON us.id = tc.us_id
             WHERE tc.suite_id = ?
             ORDER BY tc.id ASC
        `, [run.suite_id]);

    const execsRes = await query(`
        SELECT e.*, u.name AS tester_user_name
          FROM qa_executions e
          LEFT JOIN qa_users u ON u.id = e.tester_id
         WHERE e.run_id = ?
         ORDER BY e.id ASC
    `, [runId]);

    // Último estado guardado por TC.
    const latestExecByTc = new Map();
    for (const exec of execsRes.rows) {
        latestExecByTc.set(exec.tc_id, exec);
    }
    const latestExecs = [...latestExecByTc.values()];
    const executionIds = latestExecs.map((exec) => exec.id);

    const defectsRes = executionIds.length === 0 ? { rows: [] } : await query(`
        SELECT d.*, e.tc_id AS execution_tc_id
          FROM qa_defects d
          JOIN qa_executions e ON d.execution_id = e.id
         WHERE d.execution_id = ANY(?)
         ORDER BY d.id ASC
    `, [executionIds]);
    const defects = defectsRes.rows;
    const defectsByExec = new Map();
    for (const defect of defects) {
        if (!defectsByExec.has(defect.execution_id)) defectsByExec.set(defect.execution_id, []);
        defectsByExec.get(defect.execution_id).push(defect);
    }

    const hallazgosRes = isExploratory ? await query(`
        SELECT d.*, COALESCE(u.name, 'Sin tester') AS reporter_name
          FROM qa_defects d
          LEFT JOIN qa_users u ON u.id = d.created_by
         WHERE d.exploratory_run_id = ? AND d.execution_id IS NULL
         ORDER BY d.id ASC
    `, [runId]) : { rows: [] };
    const hallazgos = hallazgosRes.rows;

    const defectIds = [...defects.map((defect) => defect.id), ...hallazgos.map((hallazgo) => hallazgo.id)];
    const attachmentConditions = [];
    const attachmentParams = [];
    if (executionIds.length > 0) {
        attachmentConditions.push('execution_id = ANY(?)');
        attachmentParams.push(executionIds);
    }
    if (defectIds.length > 0) {
        attachmentConditions.push('defect_id = ANY(?)');
        attachmentParams.push(defectIds);
    }
    const attachmentsRes = attachmentConditions.length === 0 ? { rows: [] } : await query(`
        SELECT id, execution_id, defect_id, file_name, mime_type, evidence_category
          FROM qa_attachments
         WHERE ${attachmentConditions.join(' OR ')}
         ORDER BY id ASC
    `, attachmentParams);

    const evidByExec = {};
    const evidByDef = {};
    let omittedEvidence = 0;
    for (const attachment of attachmentsRes.rows) {
        const ev = await getEvidenceBase64(attachment.id);
        if (!ev) {
            omittedEvidence += 1;
            continue;
        }
        if (attachment.execution_id) {
            evidByExec[attachment.execution_id] = evidByExec[attachment.execution_id] || [];
            evidByExec[attachment.execution_id].push(ev);
        }
        if (attachment.defect_id) {
            evidByDef[attachment.defect_id] = evidByDef[attachment.defect_id] || [];
            evidByDef[attachment.defect_id].push(ev);
        }
    }

    const tests = tcsRes.rows.map((tc) => {
        const exec = latestExecByTc.get(tc.id) || null;
        const status = exec?.status || 'PENDING';
        const testDefects = exec ? (defectsByExec.get(exec.id) || []) : [];
        const evidence = exec ? (evidByExec[exec.id] || []) : [];
        return {
            ...tc,
            execution: exec,
            status,
            tester: exec?.tester_user_name || exec?.tester || null,
            executed_at: exec?.executed_at || null,
            observations: exec?.observations || '',
            obtained_result: exec?.obtained_result || '',
            defects: testDefects,
            open_defects: testDefects.filter((defect) => isOpenDefect(defect.status)),
            evidence,
        };
    });

    const counts = { OK: 0, FAIL: 0, WARNING: 0, BLOCK: 0, SKIP: 0, PENDING: 0 };
    for (const test of tests) {
        const status = String(test.status || 'PENDING').toUpperCase();
        if (status === 'OK' || status === 'PASS') counts.OK += 1;
        else if (status === 'FAIL') counts.FAIL += 1;
        else if (status === 'WARNING') counts.WARNING += 1;
        else if (status === 'BLOCK') counts.BLOCK += 1;
        else if (status === 'SKIP' || status === 'SKIPPED') counts.SKIP += 1;
        else counts.PENDING += 1;
    }

    const total = tests.length;
    const evaluated = counts.OK + counts.FAIL + counts.WARNING;
    const acceptanceTotalPct = total > 0 ? Math.round((counts.OK / total) * 100) : null;
    const acceptanceEvaluatedPct = evaluated > 0 ? Math.round((counts.OK / evaluated) * 100) : null;
    const evidenceCount = Object.values(evidByExec).reduce((acc, list) => acc + list.length, 0)
        + Object.values(evidByDef).reduce((acc, list) => acc + list.length, 0);
    const testByExec = new Map(
        tests.filter((test) => test.execution).map((test) => [test.execution.id, test]),
    );
    const openBugs = defects
        .filter((defect) => isOpenDefect(defect.status))
        .map((defect) => {
            const test = testByExec.get(defect.execution_id);
            return {
                ...defect,
                tc_key: test?.key_id ?? null,
                tc_title: test?.title ?? null,
                tc_status: test?.status ?? null,
            };
        });
    const openHallazgos = hallazgos.filter((hallazgo) => isOpenDefect(hallazgo.status));
    const criticalOpenBugs = openBugs.filter(
        (defect) => defect.severity === 'Crítica' || defect.severity === 'Alta',
    );

    let verdictTone = 'ok';
    if (total === 0) verdictTone = 'warn';
    else if (counts.FAIL > 0 || counts.BLOCK > 0 || criticalOpenBugs.length > 0) verdictTone = 'fail';
    else if (counts.WARNING > 0 || counts.PENDING > 0 || openBugs.length > 0 || openHallazgos.length > 0) {
        verdictTone = 'warn';
    }
    const verdictLabel = total === 0
        ? 'Sin TCs para evaluar'
        : verdictTone === 'ok'
            ? 'Listo para entrega'
            : verdictTone === 'warn'
                ? 'Con observaciones'
                : 'No apto / requiere atención';

    return {
        run,
        isExploratory,
        isFinished: run.status === 'FINISHED',
        project: { id: run.project_id, name: run.project_name },
        suite: { id: run.suite_id, title: run.suite_title },
        useCase: { key: run.cu_key_id, title: run.cu_title },
        tests,
        counts,
        total,
        acceptanceTotalPct,
        acceptanceEvaluatedPct,
        evidenceCount,
        omittedEvidence,
        defects,
        openBugs,
        criticalOpenBugs,
        hallazgos,
        openHallazgos,
        verdictTone,
        verdictLabel,
    };
}

module.exports = { buildCurrentStateReportData };
