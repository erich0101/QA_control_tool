const { query } = require('../config/db');
const { generateReport, generateMultiReport } = require('../../report-generator');
const { AppError } = require('../middleware/errors');

exports.getMultiReport = async (req, res) => {
    const ids = (req.query.ids || '').split(',').map(Number).filter(n => n > 0);
    if (ids.length < 2) return res.status(400).json({ error: 'Se requieren al menos 2 IDs de ejecución' });
    const html = await generateMultiReport(ids);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
};

exports.getRunReport = async (req, res) => {
    const html = await generateReport(req.params.runId);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
};

exports.generateReport = async (req, res) => {
    throw new AppError(
        'Generación de reporte vía Python no disponible en este despliegue. Usa GET /api/reports/:runId para reportes en Node.',
        501
    );
};

exports.getData = async (req, res) => {
    const { project_id } = req.query;
    if (!project_id) {
        const proj = await query(`SELECT id FROM qa_projects WHERE status = 'ACTIVE' ORDER BY id LIMIT 1`);
        if (proj.rows.length === 0) return res.json({ pruebas: [] });
        return res.redirect(`/api/data?project_id=${proj.rows[0].id}`);
    }

    const useCasesRes = await query(
        `SELECT * FROM qa_use_cases WHERE project_id = ?`,
        [project_id]
    );
    const useCases = useCasesRes.rows;
    if (useCases.length === 0) return res.json({ pruebas: [] });

    const useCaseIds = useCases.map(cu => cu.id);

    const storiesRes = await query(
        `SELECT * FROM qa_user_stories WHERE use_case_id = ANY(?)`,
        [useCaseIds]
    );
    const stories = storiesRes.rows;

    const storyIds = stories.map(us => us.id);

    const suitesRes = await query(
        `SELECT * FROM qa_test_suites WHERE us_id = ANY(?)`,
        [storyIds]
    );
    const suites = suitesRes.rows;

    const suiteIds = suites.map(s => s.id);
    const activeRunIds = suites.map(s => s.active_run_id).filter(id => id != null);

    let cases = [];
    if (suiteIds.length > 0) {
        const casesRes = await query(
            `SELECT * FROM qa_test_cases WHERE suite_id = ANY(?) ORDER BY id`,
            [suiteIds]
        );
        cases = casesRes.rows;
    }

    const tcIds = cases.map(tc => tc.id);

    let activeRuns = [];
    if (activeRunIds.length > 0) {
        const runsRes = await query(
            `SELECT * FROM qa_test_runs WHERE id = ANY(?) AND status = 'ACTIVE'`,
            [activeRunIds]
        );
        activeRuns = runsRes.rows;
    }

    let executions = [];
    if (tcIds.length > 0) {
        const execRes = await query(
            `SELECT * FROM qa_executions WHERE tc_id = ANY(?)`,
            [tcIds]
        );
        executions = execRes.rows;
    }

    let defects = [];
    if (executions.length > 0) {
        const execIds = executions.map(e => e.id);
        const defRes = await query(
            `SELECT * FROM qa_defects WHERE execution_id = ANY(?)`,
            [execIds]
        );
        defects = defRes.rows;
    }

    const activeRunById = new Map(activeRuns.map(r => [r.id, r]));
    const executionsByTc = new Map();
    for (const e of executions) {
        if (!executionsByTc.has(e.tc_id)) executionsByTc.set(e.tc_id, []);
        executionsByTc.get(e.tc_id).push(e);
    }
    for (const list of executionsByTc.values()) {
        list.sort((a, b) => b.id - a.id);
    }
    const defectsByExec = new Map();
    for (const d of defects) {
        if (!defectsByExec.has(d.execution_id)) defectsByExec.set(d.execution_id, []);
        defectsByExec.get(d.execution_id).push(d);
    }
    const casesBySuite = new Map();
    for (const tc of cases) {
        if (!casesBySuite.has(tc.suite_id)) casesBySuite.set(tc.suite_id, []);
        casesBySuite.get(tc.suite_id).push(tc);
    }
    const suitesByStory = new Map();
    for (const s of suites) {
        if (!suitesByStory.has(s.us_id)) suitesByStory.set(s.us_id, []);
        suitesByStory.get(s.us_id).push(s);
    }
    const storiesByUseCase = new Map();
    for (const us of stories) {
        if (!storiesByUseCase.has(us.use_case_id)) storiesByUseCase.set(us.use_case_id, []);
        storiesByUseCase.get(us.use_case_id).push(us);
    }

    const pruebas = [];
    for (const cu of useCases) {
        const storyList = storiesByUseCase.get(cu.id) || [];
        for (const us of storyList) {
            const suiteList = suitesByStory.get(us.id) || [];
            for (const suite of suiteList) {
                const testList = [];
                const activeRun = activeRunById.get(suite.active_run_id) || null;
                const caseList = casesBySuite.get(suite.id) || [];

                for (const tc of caseList) {
                    let exec = null;
                    if (activeRun) {
                        const tcExecs = executionsByTc.get(tc.id) || [];
                        const inActive = tcExecs.find(e => e.run_id === activeRun.id);
                        if (inActive) {
                            exec = inActive;
                        } else if (activeRun.run_type === 'RETEST' && activeRun.parent_run_id) {
                            const inParent = tcExecs.find(e => e.run_id === activeRun.parent_run_id);
                            if (inParent) {
                                exec = { ...inParent, is_from_parent: true };
                            }
                        }
                    } else {
                        const tcExecs = executionsByTc.get(tc.id) || [];
                        exec = tcExecs.length > 0 ? tcExecs[0] : null;
                    }

                    const defs = exec ? (defectsByExec.get(exec.id) || []) : [];

                    testList.push({
                        id: tc.id,
                        title: tc.title,
                        status: exec ? exec.status : 'PENDING',
                        execution_id: exec ? exec.id : null,
                        is_from_parent: exec ? !!exec.is_from_parent : false,
                        defects: defs,
                        isSection: false,
                        sbs: [{ figma: null, dev: null }]
                    });
                }

                pruebas.push({
                    id: suite.id,
                    feature: suite.title,
                    modulo: us.title,
                    status: testList.every(t => t.status === 'OK' || t.status === 'PASS')
                        ? 'OK'
                        : (testList.some(t => t.status === 'FAIL') ? 'FAIL' : 'PENDING'),
                    test_list_v2: testList
                });
            }
        }
    }

    res.json({ pruebas });
};
