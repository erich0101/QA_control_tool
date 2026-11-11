const express = require('express');
const { query } = require('../../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/', requireAuth, async (req, res) => {
    try {
        const { suite_id, us_id, title, description, severity, order_index } = req.body;
        if (!title) return res.status(400).json({ error: 'title requerido' });
        if (!suite_id && !us_id) return res.status(400).json({ error: 'suite_id o us_id requerido' });

        const result = await query(`
            INSERT INTO qa_inconsistencias (suite_id, us_id, title, description, severity, order_index)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [suite_id || null, us_id || null, title, description || '', severity || 'Alta', order_index || 0]);

        res.json({ ok: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', requireAuth, async (req, res) => {
    try {
        const { title, description, severity, order_index } = req.body;
        await query(`
            UPDATE qa_inconsistencias
            SET title = COALESCE(?, title),
                description = COALESCE(?, description),
                severity = COALESCE(?, severity),
                order_index = COALESCE(?, order_index)
            WHERE id = ?
        `, [title, description, severity, order_index, req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', requireAuth, async (req, res) => {
    try {
        await query(`DELETE FROM qa_inconsistencias WHERE id = ?`, [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
