const testSuitesRepo = require('../repositories/testSuites.repository');
const testRunsRepo = require('../repositories/testRuns.repository');
const executionsRepo = require('../repositories/executions.repository');
const inconsistenciasRepo = require('../repositories/inconsistencias.repository');
const testCasesRepo = require('../repositories/testCases.repository');
const useCasesRepo = require('../repositories/useCases.repository');
const { ok, created, noContent } = require('../utils/responses');
const { checkPermission, generateKey, getProjectIdFromUC } = require('../services/key.service');
const { AppError } = require('../middleware/errors');
const testSuitesService = require('../services/testSuites.service');

exports.list = async (req, res) => {
    const result = await testSuitesService.list(req.query, req.log);
    return res.json(result);
};

exports.create = async (req, res) => {
    if (!(await checkPermission(req.user.id, 'can_create_suite')) && req.user.role !== 'Admin' && req.user.role !== 'Analista QA') {
        return res.status(403).json({ error: 'Permisos insuficientes' });
    }
    const { use_case_id, title, description, jira_epic_key } = req.body;
    if (!use_case_id || !title) return res.status(400).json({ error: 'use_case_id y title requeridos' });

    const projectId = await getProjectIdFromUC(use_case_id);
    const finalKeyId = await generateKey(projectId, 'TS');

    const id = await testSuitesRepo.create({
        useCaseId: use_case_id, title, description: description || '',
        createdBy: req.user.id, updatedBy: req.user.id,
        keyId: finalKeyId, jiraEpicKey: jira_epic_key || ''
    });
    return created(res, { id, key_id: finalKeyId });
};

exports.startExecution = async (req, res) => {
    const suiteId = req.params.id;
    const { execution_type, filters } = req.body;

    const eligibleRows = await testCasesRepo.findEligibleForExecution({
        suiteId, executionType: execution_type, filters
    });

    let finalEligible = eligibleRows;
    if (req.body.only_assigned) {
        finalEligible = finalEligible.filter(tc => tc.assigned_to === req.user.id);
    }

    if (finalEligible.length === 0) {
        return res.status(400).json({ error: 'No hay tests asignados a tu usuario en esta suite o no coinciden con los filtros.' });
    }

    const runId = await testRunsRepo.create({
        suiteId, createdBy: req.user.id, runType: execution_type || 'FULL',
        lastResumeAt: null, accumulatedSeconds: 0
    });

    await testSuitesRepo.setActiveRun(suiteId, runId);

    for (const tc of finalEligible) {
        await executionsRepo.create({
            tcId: tc.id, runId, tester: req.user.name, status: 'PENDING'
        });
    }

    res.json({ ok: true, runId, testCount: finalEligible.length });
};

exports.startAll = async (req, res) => {
    const ucId = parseInt(req.params.id);
    const onlyAssigned = req.body.only_assigned !== false;
    const executionType = req.body.execution_type || 'REGRESSION';

    const suitesRows = await testSuitesRepo.listAvailableForUC(ucId);

    if (suitesRows.length === 0) {
        return res.status(400).json({ error: 'No hay suites disponibles para ejecutar en este Caso de Uso' });
    }

    const results = [];
    let totalTests = 0;

    for (const suite of suitesRows) {
        try {
            const eligibleRows = await testCasesRepo.findEligibleForExecution({
                suiteId: suite.id, executionType, filters: undefined
            });

            let finalEligible = eligibleRows;
            if (onlyAssigned) {
                finalEligible = finalEligible.filter(tc => tc.assigned_to === req.user.id);
            }

            if (finalEligible.length === 0) {
                results.push({ suiteId: suite.id, title: suite.title, error: 'Sin tests asignados o que coincidan con el filtro', status: 'skip' });
                continue;
            }

            const runId = await testRunsRepo.create({
                suiteId: suite.id, createdBy: req.user.id, runType: executionType,
                lastResumeAt: null, accumulatedSeconds: 0
            });

            await testSuitesRepo.setActiveRun(suite.id, runId);

            for (const tc of finalEligible) {
                await executionsRepo.create({
                    tcId: tc.id, runId, tester: req.user.name, status: 'PENDING'
                });
            }

            results.push({ suiteId: suite.id, title: suite.title, runId, testCount: finalEligible.length, status: 'ok' });
            totalTests += finalEligible.length;
        } catch (err) {
            results.push({ suiteId: suite.id, title: suite.title, error: err.message, status: 'error' });
        }
    }

    const executed = results.filter(r => r.status === 'ok').length;
    const skipped = results.filter(r => r.status === 'skip').length;
    const failed = results.filter(r => r.status === 'error').length;

    res.json({
        ok: true,
        totalSuites: suitesRows.length,
        executedSuites: executed,
        skippedSuites: skipped,
        failedSuites: failed,
        totalTests,
        results
    });
};

exports.pauseRun = async (req, res) => {
    const runId = req.params.id;
    const run = await testRunsRepo.findActive(runId);
    if (!run) return res.status(400).json({ error: 'El ciclo no está en ejecución o no existe.' });

    const lastResume = new Date(run.last_resume_at);
    const now = new Date();
    const deltaSeconds = Math.floor((now - lastResume) / 1000);
    const newAccumulated = (run.accumulated_seconds || 0) + deltaSeconds;

    await testRunsRepo.pause(runId, newAccumulated);
    res.json({ ok: true, accumulated_seconds: newAccumulated });
};

exports.resumeRun = async (req, res) => {
    const runId = req.params.id;
    const run = await testRunsRepo.findPaused(runId);
    if (!run) return res.status(400).json({ error: 'El ciclo no está pausado o no existe.' });

    await testRunsRepo.resume(runId);
    return ok(res);
};

exports.finishExecution = async (req, res) => {
    const suiteId = req.params.id;
    const suite = await testSuitesRepo.findById(suiteId);

    if (!suite) return res.status(404).json({ error: 'Suite no encontrada' });

    const runId = suite.active_run_id;
    if (!runId) return res.status(400).json({ error: 'No hay un ciclo activo para esta suite' });

    const execs = await executionsRepo.findStatusesByRunId(runId);
    const stats = {
        total: execs.length,
        pass: execs.filter(e => e.status === 'PASS' || e.status === 'OK').length,
        fail: execs.filter(e => e.status === 'FAIL').length,
        warn: execs.filter(e => e.status === 'WARNING').length,
        block: execs.filter(e => e.status === 'BLOCK').length,
        skipped: execs.filter(e => e.status === 'SKIPPED' || e.status === 'SKIP').length
    };

    const run = await testRunsRepo.findById(runId);
    let finalSeconds = run.accumulated_seconds || 0;

    if (run.status === 'RUNNING') {
        const lastResume = new Date(run.last_resume_at);
        finalSeconds += Math.floor((new Date() - lastResume) / 1000);
    }

    await testRunsRepo.finish(runId, finalSeconds);
    await testSuitesRepo.clearActiveRun(suiteId);

    res.json({ ok: true, stats });
};

exports.retest = async (req, res) => {
    const oldRunId = req.params.id;
    const suiteId = await testRunsRepo.findSuiteId(oldRunId);
    if (suiteId === null || suiteId === undefined) return res.status(404).json({ error: 'Run no encontrado' });

    const failedTcIds = await executionsRepo.findFailedTcIds(oldRunId);

    if (failedTcIds.length === 0) {
        return res.status(400).json({ error: 'No hay tests fallidos o bloqueados para retestear.' });
    }

    const newRunId = await testRunsRepo.createRetest({
        suiteId, createdBy: req.user.id, parentRunId: oldRunId
    });

    await testSuitesRepo.setActiveRun(suiteId, newRunId);

    for (const tcId of failedTcIds) {
        await executionsRepo.create({
            tcId, runId: newRunId, tester: req.user.name,
            status: 'PENDING', observations: 'Pendiente de retest'
        });
    }

    res.json({ ok: true, runId: newRunId, suite_id: suiteId, testCount: failedTcIds.length });
};

exports.updateInconsistencies = async (req, res) => {
    const { inconsistencies } = req.body;
    if (!Array.isArray(inconsistencies)) return res.status(400).json({ error: 'inconsistencies debe ser un array' });

    const suiteId = req.params.id;

    await inconsistenciasRepo.deleteBySuiteId(suiteId);

    for (let i = 0; i < inconsistencies.length; i++) {
        const inc = inconsistencies[i];
        await inconsistenciasRepo.create({
            suiteId, title: inc.title, description: inc.description || '',
            severity: inc.severity || 'Alta', orderIndex: i
        });
    }

    return ok(res);
};

exports.remove = async (req, res) => {
    await testSuitesRepo.remove(req.params.id);
    return ok(res);
};

exports.getOne = async (req, res) => {
    const row = await testSuitesRepo.findById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Suite no encontrada' });
    res.json(row);
};

exports.move = async (req, res) => {
    const suiteId = req.params.id;
    const { new_use_case_id } = req.body;

    req.log?.debug({ suiteId, new_use_case_id, user: req.user.id }, '[MOVE SUITE] Request received');

    if (!new_use_case_id) return res.status(400).json({ error: 'new_use_case_id requerido' });

    const suite = await testSuitesRepo.findById(suiteId);
    if (!suite) return res.status(404).json({ error: 'Suite no encontrada' });

    req.log?.debug({ id: suite.id, current_uc: suite.use_case_id, active_run_id: suite.active_run_id }, '[MOVE SUITE] Suite found');

    if (suite.active_run_id) {
        return res.status(400).json({ error: 'La suite está en ejecución. No se puede mover.' });
    }

    const linkedCount = await testCasesRepo.countLinkedToUS(suiteId);
    if (linkedCount > 0) {
        return res.status(400).json({ error: `La suite tiene ${linkedCount} TC(s) vinculados a HU. Desvinculá las HU antes de mover.` });
    }

    const sourceCU = await useCasesRepo.findById(suite.use_case_id);
    if (!sourceCU) return res.status(404).json({ error: 'CU origen no encontrado' });

    const destCU = await useCasesRepo.findById(new_use_case_id);
    if (!destCU) return res.status(404).json({ error: 'CU destino no encontrado' });

    if (sourceCU.project_id !== destCU.project_id) {
        return res.status(400).json({ error: 'Solo se pueden mover suites entre CU del mismo proyecto.' });
    }

    const changes = await testSuitesRepo.moveToUC(suiteId, new_use_case_id, req.user.id);

    req.log?.debug({ rowCount: changes, suiteId, new_uc: new_use_case_id }, '[MOVE SUITE] UPDATE result');

    if (changes === 0) {
        req.log?.error({ suiteId }, '[MOVE SUITE] CRITICAL: UPDATE affected 0 rows');
        throw new AppError('La suite no pudo ser movida. El UPDATE no afectó ninguna fila.', 500);
    }

    res.json({ ok: true, moved: true, new_use_case_id });
};

exports.update = async (req, res) => {
    const { title, description, assigned_to, jira_epic_key } = req.body;
    await testSuitesRepo.update(req.params.id, {
        title, description, assignedTo: assigned_to,
        jiraEpicKey: jira_epic_key, updatedBy: req.user.id
    });
    return ok(res);
};

exports.assignAll = async (req, res) => {
    const { assigned_to } = req.body;
    const suiteId = parseInt(req.params.id);
    const userId = assigned_to ? parseInt(assigned_to) : null;
    await testCasesRepo.assignAllBySuite(suiteId, userId);
    res.json({ ok: true, updated_suite_id: suiteId });
};
