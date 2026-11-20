const express = require('express');
const { query } = require('../../db');
const { requireAuth } = require('../middleware/auth');
const { generateReport, generateMultiReport } = require('../../report-generator');
const { generateTesterReport, renderTesterReportHTML } = require('../lib/tester-report');
const { buildHallazgosReportData } = require('../lib/report-templates/hallazgos-data');
const { renderHallazgosReport } = require('../lib/report-templates/hallazgos-render');
const { buildDeliveryReportData } = require('../lib/report-templates/delivery-data');
const { renderDeliveryReport } = require('../lib/report-templates/delivery-render');

const router = express.Router();

// Orden importante: /multi, /hallazgos y /tester/* antes de /:runId.
router.get('/multi', requireAuth, async (req, res) => {
    try {
        const ids = (req.query.ids || '').split(',').map(Number).filter(n => n > 0);
        if (ids.length < 2) return res.status(400).json({ error: 'Se requieren al menos 2 IDs de ejecución' });
        const html = await generateMultiReport(ids);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/reports/hallazgos?ids=1,2,3 ──────────────────────────────────────
router.get('/hallazgos', requireAuth, async (req, res) => {
    try {
        const ids = (req.query.ids || '').split(',').map(Number).filter(n => !isNaN(n) && n > 0);
        if (ids.length === 0) return res.status(400).json({ error: 'Sin hallazgos seleccionados' });

        const data = await buildHallazgosReportData(ids);
        res.setHeader('Content-Type', 'text/html');
        res.send(renderHallazgosReport(data));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



router.get('/tester/daily', requireAuth, async (req, res) => {
    try {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
        const data = await generateTesterReport(req.user.id, { dateFrom: today, dateTo: today });
        const html = renderTesterReportHTML(data, req.user.name);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/tester/all', requireAuth, async (req, res) => {
    try {
        const data = await generateTesterReport(req.user.id, {});
        const html = renderTesterReportHTML(data, req.user.name);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/tester/custom', requireAuth, async (req, res) => {
    try {
        const { date_from, date_to, project_ids } = req.query;
        const projectIds = project_ids ? project_ids.split(',').map(Number).filter(n => !isNaN(n)) : [];
        const data = await generateTesterReport(req.user.id, {
            dateFrom: date_from || null,
            dateTo: date_to || null,
            projectIds: projectIds.length > 0 ? projectIds : null
        });
        const html = renderTesterReportHTML(data, req.user.name);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/tester/projects', requireAuth, async (req, res) => {
    try {
        const projects = await query(`
            SELECT DISTINCT p.id, p.name
            FROM qa_projects p
            WHERE EXISTS (
                SELECT 1 FROM qa_executions e
                JOIN qa_test_runs r ON e.run_id = r.id
                JOIN qa_test_suites s ON r.suite_id = s.id
                LEFT JOIN qa_use_cases uc ON s.use_case_id = uc.id
                WHERE e.tester_id = ? AND COALESCE(s.project_id, uc.project_id) = p.id
            ) OR EXISTS (
                SELECT 1 FROM qa_defects d
                WHERE d.created_by = ? AND d.project_id = p.id
            ) OR EXISTS (
                SELECT 1 FROM qa_project_users pu
                WHERE pu.user_id = ? AND pu.project_id = p.id
            )
            ORDER BY p.name
        `, [req.user.id, req.user.id, req.user.id]);
        res.json({ projects: projects.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/reports/:runId/delivery
// Estado de entrega del ciclo: resultados efectivos (incluye retest),
// defectos abiertos y adjuntos de todas las ejecuciones de la cadena.
router.get('/:runId/delivery', requireAuth, async (req, res) => {
    try {
        const data = await buildDeliveryReportData(parseInt(req.params.runId, 10));
        res.setHeader('Content-Type', 'text/html');
        res.send(renderDeliveryReport(data));
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

router.get('/:runId', requireAuth, async (req, res) => {
    try {
        const html = await generateReport(req.params.runId);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
