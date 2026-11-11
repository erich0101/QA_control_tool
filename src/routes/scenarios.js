const express = require('express');
const { query } = require('../../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/', requireAuth, async (req, res) => {
    try {
        const { us_id, title, description, order_index } = req.body;
        if (!us_id || !title) return res.status(400).json({ error: 'us_id y title requeridos' });
        
        const result = await query(`
            INSERT INTO qa_scenarios (us_id, title, description, order_index)
            VALUES (?, ?, ?, ?)
        `, [us_id, title, description || '', order_index || 0]);
        
        res.json({ ok: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', requireAuth, async (req, res) => {
    try {
        const { title, description, order_index } = req.body;
        const scenarioId = req.params.id;
        
        await query(`
            UPDATE qa_scenarios 
            SET title = COALESCE(?, title), 
                description = COALESCE(?, description), 
                order_index = COALESCE(?, order_index)
            WHERE id = ?
        `, [title, description, order_index, scenarioId]);

        // --- NUEVA LÓGICA: Sincronizar hacia el Test Case ---
        if (title !== undefined) {
            await query(`UPDATE qa_test_cases SET title = ? WHERE scenario_id = ?`, [title, scenarioId]);
        }
        // ---------------------------------------------------

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', requireAuth, async (req, res) => {
    try {
        await query(`DELETE FROM qa_scenarios WHERE id = ?`, [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── INCONSISTENCIAS ──

module.exports = router;
