const { query } = require('../../../db');
const { getEvidenceBase64 } = require('../../../src/lib/report-evidence');

const REPORT_TZ = 'America/Argentina/Buenos_Aires';

/**
 * Construye los datos del reporte de estatus (sin HTML).
 * Consulta ejecuciones, defectos, hallazgos, fechas y evidencias, y deriva
 * métricas/alertas. La presentación vive en ./render.js.
 */
async function buildStatusReportData({ projectId, from, to, testerId, testerName }) {


        const projectRes = await query(`SELECT id, name FROM qa_projects WHERE id = ?`, [projectId]);
        if (projectRes.rows.length === 0) {
            const error = new Error('Proyecto no encontrado');
            error.status = 404;
            throw error;
        }
        const project = projectRes.rows[0];

        // Ejecuciones del rango (se excluyen PENDING: no representan trabajo hecho).
        let execFilter = '';
        const execParams = [projectId, from, to];
        if (testerId && testerName) {
            execFilter = 'AND (e.tester_id = ? OR e.tester = ?)';
            execParams.push(testerId, testerName);
        } else if (testerId) {
            execFilter = 'AND e.tester_id = ?';
            execParams.push(testerId);
        } else if (testerName) {
            execFilter = 'AND e.tester = ?';
            execParams.push(testerName);
        }

        const execs = await query(`
            SELECT e.id, e.status, e.observations, e.obtained_result, e.executed_at,
                   e.tester, e.tester_id,
                   tc.id AS tc_id, tc.title AS tc_title, tc.key_id,
                   r.id AS run_id, r.name AS run_name
              FROM qa_executions e
              JOIN qa_test_cases tc ON e.tc_id = tc.id
              JOIN qa_test_runs r ON e.run_id = r.id
             WHERE r.project_id = ? AND r.run_type = 'EXPLORATORY' AND e.status <> 'PENDING'
               AND (e.executed_at AT TIME ZONE '${REPORT_TZ}')::date BETWEEN ? AND ?
               ${execFilter}
             ORDER BY e.executed_at ASC
        `, execParams);

        const defects = execs.rows.length === 0 ? { rows: [] } : await query(`
            SELECT d.id, d.execution_id, d.title, d.severity, d.status, d.actual_result,
                   d.jira_key, d.jira_url
              FROM qa_defects d
             WHERE d.execution_id IN (${execs.rows.map(() => '?').join(',')})
             ORDER BY d.id
        `, execs.rows.map(e => e.id));

        // Hallazgos creados en sesiones exploratorias dentro del rango.
        let hallazgoFilter = '';
        const hallazgoParams = [projectId, from, to];
        if (testerId) {
            hallazgoFilter = 'AND d.created_by = ?';
            hallazgoParams.push(testerId);
        } else if (testerName) {
            hallazgoFilter = 'AND rep.name = ?';
            hallazgoParams.push(testerName);
        }

        const hallazgos = await query(`
            SELECT d.id, d.title, d.severity, d.status, d.created_at, d.exploratory_run_id,
                   COALESCE(rep.name, 'Sin tester') AS reporter_name
              FROM qa_defects d
              JOIN qa_test_runs r ON d.exploratory_run_id = r.id
              LEFT JOIN qa_users rep ON rep.id = d.created_by
             WHERE r.project_id = ? AND r.run_type = 'EXPLORATORY' AND d.execution_id IS NULL
               AND (d.created_at AT TIME ZONE '${REPORT_TZ}')::date BETWEEN ? AND ?
               ${hallazgoFilter}
             ORDER BY d.created_at ASC
        `, hallazgoParams);

        // Sesiones con bloqueos o cambios de fechas en el rango: deben
        // aparecer en el informe aunque no tengan tests ejecutados (por
        // ejemplo, una sesión que estuvo bloqueada todo el período).
        const traceParams = [projectId, to, from];
        const extTraceParams = [projectId, from, to];
        let blockAuthor = '';
        let extAuthor = '';
        if (testerId && testerName) {
            blockAuthor = 'AND (b.created_by = ? OR bu.name = ?)';
            extAuthor = 'AND (e.created_by = ? OR eu.name = ?)';
            traceParams.push(testerId, testerName);
            extTraceParams.push(testerId, testerName);
        } else if (testerId) {
            blockAuthor = 'AND b.created_by = ?';
            extAuthor = 'AND e.created_by = ?';
            traceParams.push(testerId);
            extTraceParams.push(testerId);
        } else if (testerName) {
            blockAuthor = 'AND bu.name = ?';
            extAuthor = 'AND eu.name = ?';
            traceParams.push(testerName);
            extTraceParams.push(testerName);
        }
        const traceRunsRes = await query(`
            SELECT DISTINCT x.run_id FROM (
                SELECT b.run_id
                  FROM qa_exploratory_blocks b
                  JOIN qa_test_runs r ON r.id = b.run_id
                  LEFT JOIN qa_users bu ON bu.id = b.created_by
                 WHERE r.project_id = ? AND r.run_type = 'EXPLORATORY'
                   AND (b.blocked_from AT TIME ZONE '${REPORT_TZ}')::date <= ?
                   AND (COALESCE(b.blocked_to, CURRENT_TIMESTAMP) AT TIME ZONE '${REPORT_TZ}')::date >= ?
                   ${blockAuthor}
                UNION
                SELECT e.run_id
                  FROM qa_exploratory_extensions e
                  JOIN qa_test_runs r ON r.id = e.run_id
                  LEFT JOIN qa_users eu ON eu.id = e.created_by
                 WHERE r.project_id = ? AND r.run_type = 'EXPLORATORY'
                   AND (e.created_at AT TIME ZONE '${REPORT_TZ}')::date BETWEEN ? AND ?
                   ${extAuthor}
            ) x
        `, [...traceParams, ...extTraceParams]);

        const runIds = [...new Set([
            ...execs.rows.map(e => e.run_id),
            ...hallazgos.rows.map(h => h.exploratory_run_id),
            ...traceRunsRes.rows.map(r => r.run_id),
        ])];
        const runsRes = runIds.length === 0 ? { rows: [] } : await query(`
            SELECT id, name, charter, started_at, finished_at, status, coverage_ready, deadline_at,
                   planned_start_at, planned_end_at
              FROM qa_test_runs WHERE id IN (${runIds.map(() => '?').join(',')})
        `, runIds);
        const runsById = new Map(runsRes.rows.map(r => [r.id, r]));

        // Totales de la sesión (independientes del rango): permiten mostrar
        // avance real y cuántos flujos siguen pendientes.
        const runTotalsRes = runIds.length === 0 ? { rows: [] } : await query(`
            SELECT run_id,
                   count(*)::int AS total,
                   count(*) FILTER (WHERE status = 'OK')::int AS ok,
                   count(*) FILTER (WHERE status = 'FAIL')::int AS fail,
                   count(*) FILTER (WHERE status = 'WARNING')::int AS warning,
                   count(*) FILTER (WHERE status = 'BLOCK')::int AS block,
                   count(*) FILTER (WHERE status = 'SKIP')::int AS skip,
                   count(*) FILTER (WHERE status = 'PENDING')::int AS pending,
                   count(*) FILTER (WHERE status <> 'PENDING')::int AS executed
              FROM qa_executions
             WHERE run_id IN (${runIds.map(() => '?').join(',')})
             GROUP BY run_id
        `, runIds);
        const totalsByRun = new Map(runTotalsRes.rows.map(r => [r.run_id, r]));
        const totalPending = runTotalsRes.rows.reduce((acc, row) => acc + row.pending, 0);

        // Pendientes por sesión: se listan para que el reporte no omita el
        // estado PENDING aunque no tengan fecha de ejecución en el rango.
        const pendingByRunRes = runIds.length === 0 ? { rows: [] } : await query(`
            SELECT e.run_id, e.id AS execution_id, e.tc_id, tc.key_id, tc.title
              FROM qa_executions e
              JOIN qa_test_cases tc ON tc.id = e.tc_id
             WHERE e.run_id IN (${runIds.map(() => '?').join(',')})
               AND e.status = 'PENDING'
             ORDER BY e.run_id, tc.id
        `, runIds);
        const pendingByRun = new Map();
        for (const row of pendingByRunRes.rows) {
            if (!pendingByRun.has(row.run_id)) pendingByRun.set(row.run_id, []);
            pendingByRun.get(row.run_id).push(row);
        }

        // Trazabilidad de fechas: postergaciones del límite y cambios de plan.
        const extRes = runIds.length === 0 ? { rows: [] } : await query(`
            SELECT e.run_id, e.field, e.previous_deadline, e.new_deadline, e.reason, e.created_at,
                   u.name AS created_by_name
              FROM qa_exploratory_extensions e
              LEFT JOIN qa_users u ON u.id = e.created_by
             WHERE e.run_id IN (${runIds.map(() => '?').join(',')})
             ORDER BY e.run_id, e.id ASC
        `, runIds);
        const extensionsByRun = new Map();
        const planChangesByRun = new Map();
        for (const ext of extRes.rows) {
            const target = ext.field === 'deadline' ? extensionsByRun : planChangesByRun;
            if (!target.has(ext.run_id)) target.set(ext.run_id, []);
            target.get(ext.run_id).push(ext);
        }
        const totalExtensions = extRes.rows.filter(ext => ext.field === 'deadline').length;
        const totalPlanChanges = extRes.rows.length - totalExtensions;

        // Bloqueos por fuerza mayor (no modifican fechas).
        const blocksRes = runIds.length === 0 ? { rows: [] } : await query(`
            SELECT b.run_id, b.blocked_from, b.blocked_to, b.reason, b.created_at,
                   c.name AS created_by_name, e.name AS ended_by_name
              FROM qa_exploratory_blocks b
              LEFT JOIN qa_users c ON c.id = b.created_by
              LEFT JOIN qa_users e ON e.id = b.ended_by
             WHERE b.run_id IN (${runIds.map(() => '?').join(',')})
             ORDER BY b.run_id, b.id ASC
        `, runIds);
        const blocksByRun = new Map();
        for (const block of blocksRes.rows) {
            if (!blocksByRun.has(block.run_id)) blocksByRun.set(block.run_id, []);
            blocksByRun.get(block.run_id).push(block);
        }
        const totalBlocks = blocksRes.rows.length;
        const totalBlockedMs = blocksRes.rows.reduce((acc, block) => {
            const from = new Date(block.blocked_from).getTime();
            const to = block.blocked_to ? new Date(block.blocked_to).getTime() : Date.now();
            return acc + Math.max(0, to - from);
        }, 0);
        const totalBlockedDays = Math.round((totalBlockedMs / 86_400_000) * 10) / 10;

        // Evolución temporal de estados (re-tests). Se calcula por TC
        // (a través de todos sus runs) y por hallazgo, usando LAG sobre el
        // histórico. Se excluye PENDING para no ensuciar las transiciones.
        let historyUserFilter = '';
        const historyParams = [projectId];
        if (testerId) {
            historyUserFilter = 'AND h.changed_by = ?';
            historyParams.push(testerId);
        } else if (testerName) {
            historyUserFilter = 'AND hu.name = ?';
            historyParams.push(testerName);
        }
        const historyRangeParams = [...historyParams, from, to];
        const transitionsRes = await query(`
            WITH ev AS (
                SELECT h.entity_type, h.tc_id, h.entity_id, h.changed_at, h.to_status,
                       LAG(h.to_status) OVER (
                           PARTITION BY h.entity_type,
                               CASE WHEN h.entity_type = 'execution' THEN h.tc_id ELSE h.entity_id END
                           ORDER BY h.changed_at, h.id
                       ) AS prev_status
                  FROM qa_status_history h
                  LEFT JOIN qa_users hu ON hu.id = h.changed_by
                 WHERE h.project_id = ? AND h.to_status <> 'PENDING'
                   ${historyUserFilter}
            )
            SELECT entity_type, prev_status, to_status, count(*)::int AS total
              FROM ev
             WHERE prev_status IS NOT NULL AND prev_status <> to_status
               AND (changed_at AT TIME ZONE '${REPORT_TZ}')::date BETWEEN ? AND ?
             GROUP BY entity_type, prev_status, to_status
             ORDER BY entity_type, total DESC
        `, historyRangeParams);
        const totalTransitions = transitionsRes.rows.reduce((acc, row) => acc + row.total, 0);

        // Historial por TC/hallazgo para mostrarlo dentro de cada ficha.
        const execTcIds = [...new Set(execs.rows.map(e => e.tc_id))];
        const execHistoryRes = execTcIds.length === 0 ? { rows: [] } : await query(`
            SELECT h.entity_type, h.entity_id, h.tc_id, h.run_id, h.changed_at,
                   h.from_status, h.to_status, h.reason, u.name AS changed_by_name
              FROM qa_status_history h
              LEFT JOIN qa_users u ON u.id = h.changed_by
              LEFT JOIN qa_users hu ON hu.id = h.changed_by
             WHERE h.entity_type = 'execution'
               AND h.tc_id IN (${execTcIds.map(() => '?').join(',')})
               AND (h.changed_at AT TIME ZONE '${REPORT_TZ}')::date BETWEEN ? AND ?
               ${historyUserFilter}
             ORDER BY h.changed_at ASC, h.id ASC
        `, [...execTcIds, from, to, ...(testerId ? [testerId] : testerName ? [testerName] : [])]);
        const execHistoryByTc = new Map();
        for (const row of execHistoryRes.rows) {
            if (!execHistoryByTc.has(row.tc_id)) execHistoryByTc.set(row.tc_id, []);
            execHistoryByTc.get(row.tc_id).push(row);
        }

        const hallazgoIds = hallazgos.rows.map(h => h.id);
        const hallazgoHistoryRes = hallazgoIds.length === 0 ? { rows: [] } : await query(`
            SELECT h.entity_type, h.entity_id, h.changed_at, h.from_status, h.to_status,
                   h.reason, u.name AS changed_by_name
              FROM qa_status_history h
              LEFT JOIN qa_users u ON u.id = h.changed_by
              LEFT JOIN qa_users hu ON hu.id = h.changed_by
             WHERE h.entity_type = 'hallazgo'
               AND h.entity_id IN (${hallazgoIds.map(() => '?').join(',')})
               AND (h.changed_at AT TIME ZONE '${REPORT_TZ}')::date BETWEEN ? AND ?
               ${historyUserFilter}
             ORDER BY h.changed_at ASC, h.id ASC
        `, [...hallazgoIds, from, to, ...(testerId ? [testerId] : testerName ? [testerName] : [])]);
        const hallazgoHistoryById = new Map();
        for (const row of hallazgoHistoryRes.rows) {
            if (!hallazgoHistoryById.has(row.entity_id)) hallazgoHistoryById.set(row.entity_id, []);
            hallazgoHistoryById.get(row.entity_id).push(row);
        }

        const sessionTotals = runTotalsRes.rows.reduce(
            (acc, row) => ({
                total: acc.total + row.total,
                ok: acc.ok + row.ok,
                fail: acc.fail + row.fail,
                warning: acc.warning + row.warning,
                block: acc.block + row.block,
                skip: acc.skip + row.skip,
                pending: acc.pending + row.pending,
                executed: acc.executed + row.executed,
            }),
            { total: 0, ok: 0, fail: 0, warning: 0, block: 0, skip: 0, pending: 0, executed: 0 }
        );
        const sessionEvaluables = sessionTotals.ok + sessionTotals.fail + sessionTotals.warning;
        const acceptanceEvaluatedPct = sessionEvaluables > 0
            ? Math.round((sessionTotals.ok / sessionEvaluables) * 100) : null;
        const acceptanceTotalPct = sessionTotals.total > 0
            ? Math.round((sessionTotals.ok / sessionTotals.total) * 100) : null;
        const uncoveredRuns = [...runsById.values()].filter(r => !r.coverage_ready);
        const coveredCount = runsById.size - uncoveredRuns.length;
        const coveragePct = runsById.size > 0 ? Math.round((coveredCount / runsById.size) * 100) : null;

        // Señales para la toma de decisiones: qué requiere atención hoy.
        const now = Date.now();
        const activeBlockRuns = [...blocksByRun.entries()]
            .filter(([, list]) => list.some(block => !block.blocked_to))
            .map(([runId]) => runId);
        const overdueRuns = [...runsById.values()].filter(
            run => run.status === 'RUNNING' && run.deadline_at && new Date(run.deadline_at).getTime() < now,
        );
        const pendingRuns = runTotalsRes.rows.filter(row => row.pending > 0);
        const regressions = transitionsRes.rows.filter(
            row => row.entity_type === 'execution'
                && row.prev_status === 'OK'
                && ['FAIL', 'WARNING', 'BLOCK'].includes(row.to_status),
        );
        const regressionTotal = regressions.reduce((acc, row) => acc + row.total, 0);

        const alerts = [];
        if (uncoveredRuns.length > 0) {
            alerts.push({
                tone: 'warn',
                title: 'Cobertura del regresivo incompleta',
                detail: `${uncoveredRuns.length} de ${runsById.size} sesión(es) no declararon los TC de cobertura. Los resultados muestran ejecución, no aceptación del regresivo.`,
                refs: uncoveredRuns.map(run => run.id),
            });
        }
        if (sessionTotals.fail > 0) {
            alerts.push({
                tone: 'fail',
                title: `${sessionTotals.fail} TC en FAIL`,
                detail: 'Hay resultados fallidos en las sesiones incluidas. Revisá los defectos y su estado antes de decidir la entrega.',
                refs: [],
            });
        }
        if (activeBlockRuns.length > 0) {
            alerts.push({
                tone: 'fail',
                title: `${activeBlockRuns.length} sesión(es) bloqueada(s)`,
                detail: 'El testing está detenido por fuerza mayor. El bloqueo no extiende la fecha límite automáticamente.',
                refs: activeBlockRuns,
            });
        }
        const pendingRunIds = [...new Set(pendingRuns.map(row => row.run_id))];
        const followUpIds = [...new Set([...overdueRuns.map(run => run.id), ...pendingRunIds])];
        if (followUpIds.length > 0) {
            alerts.push({
                tone: 'warn',
                title: 'Sesiones con trabajo pendiente',
                detail: `${overdueRuns.length} vencida(s) · ${sessionTotals.pending} TC pendientes en ${pendingRunIds.length} sesión(es).`,
                refs: followUpIds,
            });
        }
        if (regressionTotal > 0) {
            alerts.push({
                tone: 'warn',
                title: `${regressionTotal} regresión(es) en re-tests`,
                detail: 'TC que estaban OK y pasaron a FAIL/WARNING/BLOCK. Es la señal más importante para priorizar la revisión.',
                refs: [],
            });
        }

        const hasActivity = runIds.length > 0;
        const verdictTone = !hasActivity
            ? 'warn'
            : uncoveredRuns.length > 0
                || activeBlockRuns.length > 0
                || (acceptanceTotalPct ?? 100) < 50
                ? 'fail'
                : alerts.length > 0 ? 'warn' : 'ok';
        const verdictLabel = !hasActivity
            ? 'Sin actividad en el rango'
            : verdictTone === 'ok'
                ? 'Listo para entrega'
                : verdictTone === 'warn' ? 'Con observaciones' : 'No apto / requiere atención';
        const verdictDetail = !hasActivity
            ? 'No se encontraron sesiones con actividad ni cambios de fechas en el rango seleccionado.'
            : `Aceptación total ${acceptanceTotalPct ?? '—'}% · Cobertura TC ${coveragePct ?? '—'}% · Acumulado de sesión: ${sessionTotals.executed}/${sessionTotals.total} TC ejecutados`;

        const defectIds = defects.rows.map(d => d.id);
        const attachments = (execs.rows.length === 0 && defectIds.length === 0) ? { rows: [] } : await query(`
            SELECT id, execution_id, defect_id
              FROM qa_attachments
             WHERE execution_id IN (${execs.rows.map(() => '?').join(',') || 'NULL'})
                OR defect_id IN (${defectIds.map(() => '?').join(',') || 'NULL'})
        `, [...execs.rows.map(e => e.id), ...defectIds]);

        const evidByExec = {};
        const evidByDef = {};
        let omittedEvidence = 0;
        for (const a of attachments.rows) {
            const ev = await getEvidenceBase64(a.id);
            if (!ev) { omittedEvidence += 1; continue; }
            if (a.execution_id) { evidByExec[a.execution_id] = evidByExec[a.execution_id] || []; evidByExec[a.execution_id].push(ev); }
            if (a.defect_id) { evidByDef[a.defect_id] = evidByDef[a.defect_id] || []; evidByDef[a.defect_id].push(ev); }
        }

        const defectsByExec = new Map();
        for (const d of defects.rows) {
            if (!defectsByExec.has(d.execution_id)) defectsByExec.set(d.execution_id, []);
            defectsByExec.get(d.execution_id).push(d);
        }
        const runIdByExec = new Map(execs.rows.map((exec) => [exec.id, exec.run_id]));
        const defectsByRun = new Map();
        for (const defect of defects.rows) {
            const runId = runIdByExec.get(defect.execution_id);
            if (runId) defectsByRun.set(runId, (defectsByRun.get(runId) || 0) + 1);
        }
        const totalDefects = defects.rows.length;
        const totalFindings = totalDefects + hallazgos.rows.length;

        const counts = { OK: 0, FAIL: 0, WARNING: 0, BLOCK: 0, SKIP: 0 };
        for (const e of execs.rows) {
            if (counts[e.status] !== undefined) counts[e.status] += 1;
        }
        const totalTests = execs.rows.length;


        const execByRun = new Map();
        for (const e of execs.rows) {
            if (!execByRun.has(e.run_id)) execByRun.set(e.run_id, []);
            execByRun.get(e.run_id).push(e);
        }
        const hallazgosByRun = new Map();
        for (const h of hallazgos.rows) {
            if (!hallazgosByRun.has(h.exploratory_run_id)) hallazgosByRun.set(h.exploratory_run_id, []);
            hallazgosByRun.get(h.exploratory_run_id).push(h);
        }

        const accumulatedCounts = {
            OK: sessionTotals.ok,
            FAIL: sessionTotals.fail,
            WARNING: sessionTotals.warning,
            BLOCK: sessionTotals.block,
            SKIP: sessionTotals.skip,
            PENDING: sessionTotals.pending,
        };
                const testerLabel = testerName || 'Todos los testers';

        return {
            project, from, to, testerId, testerName, testerLabel,
            execs, defects, hallazgos,
            runIds, runsById, extensionsByRun, planChangesByRun, blocksByRun,
            totalsByRun, totalPending, totalExtensions, totalPlanChanges,
            totalBlocks, totalBlockedDays,
            transitionsRes, totalTransitions,
            execHistoryByTc, hallazgoHistoryById,
            evidByExec, evidByDef, omittedEvidence,
            defectsByExec, defectsByRun, totalDefects, totalFindings,
            counts, totalTests, execByRun, hallazgosByRun,
            sessionTotals, acceptanceEvaluatedPct, acceptanceTotalPct,
            coveredCount, coveragePct, uncoveredRuns, alerts, hasActivity,
            verdictTone, verdictLabel, verdictDetail, pendingByRun,
            accumulatedCounts,
        };
}

module.exports = { buildStatusReportData };
