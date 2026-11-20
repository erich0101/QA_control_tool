const { query } = require('../../../db');
const { getEvidenceBase64 } = require('../report-evidence');

/**
 * Estados que cuentan como trabajo abierto para el estado de entrega.
 * Un bug FIXED/CLOSED/WONT_FIX/DISMISSED no bloquea la entrega.
 */
const OPEN_DEFECT_STATUSES = new Set(['OPEN', 'IN_PROGRESS']);

function isPass(status) {
    return status === 'OK' || status === 'PASS';
}

function isFail(status) {
    return status === 'FAIL' || status === 'BLOCK';
}

function isPending(status) {
    return !status || status === 'PENDING';
}

async function fetchRun(runId) {
    const res = await query(`
        SELECT r.*, s.title AS suite_title, s.id AS suite_id,
               cu.title AS cu_title, cu.key_id AS cu_key_id,
               p.id AS project_id, p.name AS project_name,
               u.name AS created_by_name
          FROM qa_test_runs r
          JOIN qa_test_suites s ON r.suite_id = s.id
          JOIN qa_use_cases cu ON s.use_case_id = cu.id
          JOIN qa_projects p ON cu.project_id = p.id
          LEFT JOIN qa_users u ON r.created_by = u.id
         WHERE r.id = ?
    `, [runId]);
    return res.rows[0] || null;
}

/**
 * Dado un run (FULL o RETEST), arma la cadena completa: run original + todos
 * sus retests. Así el estado de entrega se evalúa con el último resultado de
 * cada TC y no solo con el ciclo seleccionado.
 */
async function fetchRunChain(runId) {
    const selected = await fetchRun(runId);
    if (!selected) {
        const error = new Error('Ejecución no encontrada');
        error.status = 404;
        throw error;
    }

    // Subir hasta el run raíz (soporta retest de retest).
    let root = selected;
    const seenUp = new Set([root.id]);
    while (root.parent_run_id && !seenUp.has(root.parent_run_id)) {
        seenUp.add(root.parent_run_id);
        const parent = await fetchRun(root.parent_run_id);
        if (!parent) break;
        root = parent;
    }

    // Bajar por todos los descendientes.
    const chain = [];
    const queue = [root.id];
    const seen = new Set();
    while (queue.length > 0) {
        const id = queue.shift();
        if (seen.has(id)) continue;
        seen.add(id);
        const run = id === root.id ? root : await fetchRun(id);
        if (!run) continue;
        chain.push(run);
        const children = await query(
            `SELECT id FROM qa_test_runs WHERE parent_run_id = ? ORDER BY id ASC`,
            [id]
        );
        queue.push(...children.rows.map((row) => row.id));
    }

    chain.sort((a, b) => {
        const aTime = a.started_at ? new Date(a.started_at).getTime() : 0;
        const bTime = b.started_at ? new Date(b.started_at).getTime() : 0;
        if (aTime !== bTime) return aTime - bTime;
        return a.id - b.id;
    });

    return { selected, root, chain };
}

/**
 * Datos del reporte de estado de entrega de un ciclo (incluye retest).
 * Une resultados, defectos y adjuntos de todas las ejecuciones de la cadena.
 */
async function buildDeliveryReportData(runId) {
    const { selected, root, chain } = await fetchRunChain(runId);

    const suiteId = root.suite_id;
    const runIds = chain.map((run) => run.id);

    const tcsRes = await query(
        `SELECT * FROM qa_test_cases WHERE suite_id = ? ORDER BY id ASC`,
        [suiteId]
    );
    const testCases = tcsRes.rows;

    const execsRes = testCases.length === 0 ? { rows: [] } : await query(`
        SELECT e.*, r.run_type, r.started_at AS run_started_at
          FROM qa_executions e
          JOIN qa_test_runs r ON e.run_id = r.id
         WHERE e.run_id = ANY(?) AND e.tc_id = ANY(?)
         ORDER BY e.executed_at ASC, e.id ASC
    `, [runIds, testCases.map((tc) => tc.id)]);

    const execsByTc = new Map();
    for (const exec of execsRes.rows) {
        if (!execsByTc.has(exec.tc_id)) execsByTc.set(exec.tc_id, []);
        execsByTc.get(exec.tc_id).push(exec);
    }

    const executionIds = execsRes.rows.map((exec) => exec.id);
    const defectsRes = executionIds.length === 0 ? { rows: [] } : await query(`
        SELECT d.*, e.tc_id
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

    const defectIds = defects.map((defect) => defect.id);
    const attachmentsRes = (executionIds.length === 0 && defectIds.length === 0) ? { rows: [] } : await query(`
        SELECT a.id, a.execution_id, a.defect_id, a.file_name, a.mime_type, a.evidence_category
          FROM qa_attachments a
         WHERE a.execution_id = ANY(?)
            OR a.defect_id = ANY(?)
         ORDER BY a.id ASC
    `, [executionIds, defectIds]);

    const evidByExec = {};
    const evidByDef = {};
    const uniqueEvidence = new Set();
    let omittedEvidence = 0;
    for (const attachment of attachmentsRes.rows) {
        const ev = await getEvidenceBase64(attachment.id);
        if (!ev) {
            omittedEvidence += 1;
            continue;
        }
        uniqueEvidence.add(attachment.id);
        if (attachment.execution_id) {
            evidByExec[attachment.execution_id] = evidByExec[attachment.execution_id] || [];
            evidByExec[attachment.execution_id].push(ev);
        }
        if (attachment.defect_id) {
            evidByDef[attachment.defect_id] = evidByDef[attachment.defect_id] || [];
            evidByDef[attachment.defect_id].push(ev);
        }
    }

    for (const defect of defects) {
        defect.evidence = evidByDef[defect.id] || [];
    }

    // En sesiones exploratorias la suite puede contener TC de todo el
    // proyecto; el reporte solo evalúa los que participaron de la sesión.
    const isExploratory = chain.some((run) => run.run_type === 'EXPLORATORY');
    const reportTestCases = isExploratory
        ? testCases.filter((tc) => execsByTc.has(tc.id))
        : testCases;

    const tests = reportTestCases.map((tc) => {
        const execs = execsByTc.get(tc.id) || [];
        const first = execs[0] || null;
        const latest = execs[execs.length - 1] || null;
        const firstStatus = first?.status || 'PENDING';
        const effectiveStatus = latest?.status || 'PENDING';
        const wasRetested = Boolean(first && latest && first.run_id !== latest.run_id);

        const tcDefects = [];
        const seenDefects = new Set();
        for (const exec of execs) {
            for (const defect of defectsByExec.get(exec.id) || []) {
                if (seenDefects.has(defect.id)) continue;
                seenDefects.add(defect.id);
                tcDefects.push(defect);
            }
        }

        const evidence = [];
        const seenEvidence = new Set();
        for (const exec of execs) {
            for (const ev of evidByExec[exec.id] || []) {
                if (seenEvidence.has(ev.data)) continue;
                seenEvidence.add(ev.data);
                evidence.push(ev);
            }
        }
        for (const defect of tcDefects) {
            for (const ev of evidByDef[defect.id] || []) {
                if (seenEvidence.has(ev.data)) continue;
                seenEvidence.add(ev.data);
                evidence.push(ev);
            }
        }

        return {
            ...tc,
            executions: execs,
            first_exec: first,
            latest_exec: latest,
            first_status: firstStatus,
            effective_status: effectiveStatus,
            was_retested: wasRetested,
            resolved_by_retest: wasRetested && isFail(firstStatus) && isPass(effectiveStatus),
            regressed: wasRetested && isPass(firstStatus) && ['FAIL', 'WARNING', 'BLOCK'].includes(effectiveStatus),
            defects: tcDefects,
            open_defects: tcDefects.filter((defect) => OPEN_DEFECT_STATUSES.has(String(defect.status || 'OPEN').toUpperCase())),
            evidence,
        };
    });

    const counts = { OK: 0, FAIL: 0, WARNING: 0, BLOCK: 0, SKIP: 0, PENDING: 0 };
    for (const test of tests) {
        const status = test.effective_status;
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

    const retestedTests = tests.filter((test) => test.was_retested);
    const resolvedByRetest = tests.filter((test) => test.resolved_by_retest);
    const regressions = tests.filter((test) => test.regressed);
    const openDefects = defects.filter((defect) =>
        OPEN_DEFECT_STATUSES.has(String(defect.status || 'OPEN').toUpperCase())
    );
    const resolvedDefects = defects.filter((defect) =>
        !OPEN_DEFECT_STATUSES.has(String(defect.status || 'OPEN').toUpperCase())
    );
    const criticalOpenDefects = openDefects.filter((defect) =>
        defect.severity === 'Crítica' || defect.severity === 'Alta'
    );

    const retestRuns = chain.filter((run) => run.run_type === 'RETEST');
    const testers = [...new Set(chain.map((run) => run.created_by_name).filter(Boolean))];

    let verdictTone = 'ok';
    if (total === 0) verdictTone = 'warn';
    else if (counts.FAIL > 0 || counts.BLOCK > 0 || criticalOpenDefects.length > 0) verdictTone = 'fail';
    else if (counts.WARNING > 0 || counts.PENDING > 0 || counts.SKIP > 0 || openDefects.length > 0) verdictTone = 'warn';

    const verdictLabel = total === 0
        ? 'Sin datos para evaluar'
        : verdictTone === 'ok'
            ? 'Listo para entrega'
            : verdictTone === 'warn'
                ? 'Con observaciones'
                : 'No apto / requiere atención';

    return {
        selected, root, chain, retestRuns,
        project: { id: root.project_id, name: root.project_name },
        suite: { id: root.suite_id, title: root.suite_title },
        useCase: { title: root.cu_title, key: root.cu_key_id },
        testers,
        tests, counts, total,
        acceptanceTotalPct, acceptanceEvaluatedPct,
        retestedTests, resolvedByRetest, regressions,
        defects, openDefects, resolvedDefects, criticalOpenDefects,
        evidenceCount: uniqueEvidence.size,
        omittedEvidence,
        verdictTone, verdictLabel,
    };
}

module.exports = { buildDeliveryReportData };
