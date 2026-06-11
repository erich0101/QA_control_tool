const { testRuns, defects, executions } = require('../repositories');

exports.getHistory = async (req, res) => {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id requerido' });

    const runs = await testRuns.listFinishedByProject(project_id);

    const result = [];
    for (const run of runs) {
        const execs = await executions.findStatusesByRunId(run.id);
        result.push({
            ...run,
            stats: {
                total: execs.length,
                pass: execs.filter(e => e.status === 'PASS' || e.status === 'OK').length,
                fail: execs.filter(e => e.status === 'FAIL').length,
                warn: execs.filter(e => e.status === 'WARNING').length,
                block: execs.filter(e => e.status === 'BLOCK').length,
                skipped: execs.filter(e => e.status === 'SKIPPED' || e.status === 'SKIP').length
            }
        });
    }

    res.json({ runs: result });
};

exports.getRunBugs = async (req, res) => {
    const bugs = await defects.listByRunId(req.params.id);
    res.json({ bugs });
};
