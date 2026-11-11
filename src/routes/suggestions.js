const express = require('express');
const { query } = require('../../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { checkPermission } = require('../lib/sequences');

const router = express.Router();

// Valores permitidos (antes vivían sueltos en server.js).
const SUGGESTION_CATEGORIES = ['UX', 'Performance', 'Seguridad', 'Accesibilidad', 'Otro'];
const SUGGESTION_STATUSES = ['OPEN', 'IN_REVIEW', 'ACCEPTED', 'REJECTED', 'DONE'];
const SUGGESTION_PRIORITIES = ['Baja', 'Media', 'Alta'];

router.get('/', requireAuth, async (req, res) => {
    try {
        const { project_id } = req.query;
        if (!project_id) return res.status(400).json({ error: 'project_id requerido' });

        const result = await query(`
            SELECT s.*,
                   assignee.name as assignee_name,
                   creator.name as creator_name,
                   (SELECT COUNT(*) FROM qa_attachments WHERE suggestion_id = s.id) as evidence_count
            FROM qa_suggestions s
            LEFT JOIN qa_users assignee ON s.assigned_to = assignee.id
            LEFT JOIN qa_users creator  ON s.created_by  = creator.id
            WHERE s.project_id = ?
            ORDER BY s.id DESC
            LIMIT 500
        `, [project_id]);
        res.json({ suggestions: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        if (!(await checkPermission(req.user.id, 'can_create_cu')) && req.user.role !== 'Admin' && req.user.role !== 'Analista QA') {
            return res.status(403).json({ error: 'Permisos insuficientes' });
        }
        const { project_id, title, category, description, proposed_solution, priority, assigned_to } = req.body;
        if (!project_id || !title) return res.status(400).json({ error: 'project_id y title son requeridos' });

        const safeCategory = SUGGESTION_CATEGORIES.includes(category) ? category : 'UX';
        const safePriority = SUGGESTION_PRIORITIES.includes(priority) ? priority : 'Media';
        const safeAssignedTo = (assigned_to === null || assigned_to === undefined || assigned_to === '')
            ? null
            : parseInt(assigned_to, 10);

        const result = await query(
            `INSERT INTO qa_suggestions (project_id, title, category, description, proposed_solution, priority, assigned_to, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?) RETURNING id`,
            [project_id, title, safeCategory, description || '', proposed_solution || '', safePriority, safeAssignedTo, req.user.id]
        );
        res.json({ ok: true, id: result.rows[0].id });
    } catch (err) {
        console.error('Error creando sugerencia:', err);
        console.error('Body era:', JSON.stringify(req.body));
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', requireAuth, async (req, res) => {
    try {
        const { title, category, description, proposed_solution, priority, assigned_to } = req.body;
        const fields = [];
        const params = [];
        const map = { title, category, description, proposed_solution, priority, assigned_to };
        for (const f of Object.keys(map)) {
            if (map[f] !== undefined) {
                if (f === 'category' && !SUGGESTION_CATEGORIES.includes(map[f])) continue;
                if (f === 'priority' && !SUGGESTION_PRIORITIES.includes(map[f])) continue;
                fields.push(`${f} = ?`);
                params.push(map[f] === '' ? null : map[f]);
            }
        }
        if (fields.length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });
        fields.push('updated_at = CURRENT_TIMESTAMP');
        params.push(req.params.id);
        await query(`UPDATE qa_suggestions SET ${fields.join(', ')} WHERE id = ?`, params);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await query(`DELETE FROM qa_suggestions WHERE id = ?`, [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id/status', requireAuth, async (req, res) => {
    try {
        const { status } = req.body;
        if (!SUGGESTION_STATUSES.includes(status)) return res.status(400).json({ error: 'status inválido' });
        await query(`UPDATE qa_suggestions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id/assign', requireAuth, async (req, res) => {
    try {
        const { assigned_to } = req.body;
        await query(`UPDATE qa_suggestions SET assigned_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [assigned_to || null, req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id/evidence', requireAuth, async (req, res) => {
    try {
        const result = await query(`
            SELECT id, file_name, mime_type, evidence_category, created_at
            FROM qa_attachments WHERE suggestion_id = ? ORDER BY id
        `, [req.params.id]);
        res.json({ evidence: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
