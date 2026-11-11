const express = require('express');
const { query } = require('../../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { checkPermission, generateKey } = require('../lib/sequences');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
    try {
        const { project_id } = req.query;
        if (!project_id) return res.status(400).json({ error: 'project_id requerido' });

        const result = await query(`
            SELECT cu.*,
                (SELECT COUNT(*) FROM qa_user_stories WHERE use_case_id = cu.id) as us_count
            FROM qa_use_cases cu
            WHERE cu.project_id = ?
            ORDER BY cu.id DESC
        `, [project_id]);

        res.json({ useCases: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        if (req.user.role !== 'Admin' && req.user.role !== 'Analista QA') {
            const allowed = await checkPermission(req.user.id, 'can_create_cu');
            if (!allowed) return res.status(403).json({ error: 'No tienes permiso para crear Casos de Uso' });
        }

        const { project_id, key_id, title, description } = req.body;
        if (!project_id || !title) return res.status(400).json({ error: 'project_id y title requeridos' });

        const finalKeyId = key_id || await generateKey(project_id, 'CU');
        const result = await query(
            `INSERT INTO qa_use_cases (project_id, key_id, title, description, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)`,
            [project_id, finalKeyId, title, description || '', req.user.id, req.user.id]
        );
        res.json({ ok: true, id: result.lastID, key_id: finalKeyId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', requireAuth, async (req, res) => {
    try {
        const { title, description, status, key_id } = req.body;
        await query(`UPDATE qa_use_cases SET title = COALESCE(?, title), description = COALESCE(?, description), status = COALESCE(?, status), key_id = COALESCE(?, key_id), updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [title, description, status, key_id, req.user.id, req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await query(`DELETE FROM qa_use_cases WHERE id = ?`, [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
// ── USER STORIES (hijas de Caso de Uso) ──
// ══════════════════════════════════════════════════════════════

module.exports = router;
