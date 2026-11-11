const express = require('express');
const { query } = require('../../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { checkPermission, generateKey, getProjectIdFromUC } = require('../lib/sequences');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
    try {
        const { use_case_id } = req.query;
        if (!use_case_id) return res.status(400).json({ error: 'use_case_id requerido' });

        const stories = await query(`
            SELECT us.*,
                (SELECT COUNT(*) FROM qa_test_cases WHERE us_id = us.id) as test_count,
                COALESCE((
                    SELECT json_agg(s ORDER BY s.order_index)
                    FROM qa_scenarios s
                    WHERE s.us_id = us.id
                ), '[]') as scenarios,
                COALESCE((
                    SELECT json_agg(json_build_object(
                        'id', i.id, 'title', i.title, 'description', i.description, 'severity', COALESCE(i.severity, 'Alta')
                    ) ORDER BY i.order_index)
                    FROM qa_inconsistencias i
                    JOIN qa_test_suites s ON i.suite_id = s.id
                    JOIN qa_test_cases tc ON tc.suite_id = s.id
                    WHERE tc.us_id = us.id
                ), '[]') as inconsistencies,
                us.recommendations
            FROM qa_user_stories us
            WHERE us.use_case_id = ?
            ORDER BY us.id DESC
        `, [use_case_id]);

        res.json({ userStories: stories.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── SCENARIOS ──

router.post('/', requireAuth, async (req, res) => {
    try {
        if (!(await checkPermission(req.user.id, 'can_create_hu')) && req.user.role !== 'Admin' && req.user.role !== 'Analista QA') {
            return res.status(403).json({ error: 'Permisos insuficientes' });
        }
        const { use_case_id, key_id, title, hu_detallada, priority, status,
                escenarios_prueba, reglas_negocio, precondiciones, link_documentacion } = req.body;
        if (!use_case_id || !title) return res.status(400).json({ error: 'use_case_id y title requeridos' });

        const projectId = await getProjectIdFromUC(use_case_id);
        const finalKeyId = key_id || await generateKey(projectId, 'HU');
        const result = await query(
            `INSERT INTO qa_user_stories (use_case_id, key_id, title, hu_detallada, priority, status, escenarios_prueba, reglas_negocio, precondiciones, link_documentacion, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [use_case_id, finalKeyId, title, hu_detallada || '', priority || 'Media', status || 'En Análisis',
             escenarios_prueba || '', reglas_negocio || '', precondiciones || '', link_documentacion || '', req.user.id, req.user.id]
        );
        const usId = result.lastID;

        // Si se envió detalle, lo creamos como la primera inconsistencia
        if (hu_detallada) {
            await query(`INSERT INTO qa_inconsistencias (us_id, title, order_index) VALUES (?, ?, 0)`, [usId, hu_detallada]);
        }

        res.json({ ok: true, id: usId, key_id: finalKeyId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id/recommendations', requireAuth, async (req, res) => {
    try {
        const { recommendations } = req.body;
        if (!Array.isArray(recommendations)) return res.status(400).json({ error: 'recommendations debe ser un array' });
        await query(`UPDATE qa_user_stories SET recommendations = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [JSON.stringify(recommendations), req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', requireAuth, async (req, res) => {
    try {
        const usId = req.params.id;
        const allowedFields = [
            'title', 'status', 'priority', 'key_id',
            'hu_detallada', 'escenarios_prueba', 'reglas_negocio',
            'precondiciones', 'link_documentacion', 'recommendations'
        ];

        const fields = [];
        const params = [];

        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                fields.push(`${field} = ?`);
                params.push(req.body[field]);
            }
        });

        if (fields.length === 0) {
            return res.json({ ok: true, message: 'No fields to update' });
        }

        fields.push(`updated_by = ?`);
        params.push(req.user.id);
        params.push(usId);

        await query(`UPDATE qa_user_stories SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await query(`DELETE FROM qa_user_stories WHERE id = ?`, [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
// ── PRECONDICIONES ──
// ══════════════════════════════════════════════════════════════

module.exports = router;
