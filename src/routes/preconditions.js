const express = require('express');
const { query } = require('../../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
    try {
        const { us_id } = req.query;
        if (!us_id) return res.status(400).json({ error: 'us_id requerido' });

        // Precondiciones vinculadas a TCs de las suites de esta US
        const result = await query(`
            SELECT DISTINCT p.* FROM qa_preconditions p
            JOIN qa_tc_preconditions tp ON tp.prc_id = p.id
            JOIN qa_test_cases tc ON tc.id = tp.tc_id
            JOIN qa_test_suites ts ON ts.id = tc.suite_id
            WHERE ts.us_id = ?
            ORDER BY p.id
        `, [us_id]);

        // También obtener precondiciones no vinculadas (globales disponibles)
        const all = await query(`SELECT * FROM qa_preconditions ORDER BY id`);

        res.json({ linked: result.rows, all: all.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        const { title, description, system_state } = req.body;
        if (!title) return res.status(400).json({ error: 'title requerido' });
        const result = await query(`INSERT INTO qa_preconditions (title, description, system_state) VALUES (?, ?, ?)`,
            [title, description || '', system_state || '']);
        res.json({ ok: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/link', requireAuth, async (req, res) => {
    try {
        const { tc_id, prc_id } = req.body;
        await query(`INSERT INTO qa_tc_preconditions (tc_id, prc_id) VALUES (?, ?) ON CONFLICT (tc_id, prc_id) DO NOTHING`, [tc_id, prc_id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await query(`DELETE FROM qa_preconditions WHERE id = ?`, [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
// ── TEST SUITES ──
// ══════════════════════════════════════════════════════════════

module.exports = router;
