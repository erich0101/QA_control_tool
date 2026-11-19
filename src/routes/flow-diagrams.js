const express = require('express');
const { query } = require('../../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const MAX_NAME = 160;
const MAX_DESCRIPTION = 500;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const ENTITY_TYPES = new Set([
    'use_case',
    'user_story',
    'test_case',
    'test_suite',
    'defect',
    'exploratory_session',
]);

function normalizeEntityLink(body = {}) {
    const type = body.entity_type ? String(body.entity_type) : null;
    const rawId = body.entity_id;
    if (!type && (rawId === null || rawId === undefined || rawId === '')) {
        return { entity_type: null, entity_id: null };
    }
    if (!ENTITY_TYPES.has(type)) return { error: 'Tipo de vínculo inválido.' };
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) return { error: 'Entidad vinculada inválida.' };
    return { entity_type: type, entity_id: id };
}

async function entityBelongsToProject(type, id, projectId) {
    const queries = {
        use_case: `SELECT 1 FROM qa_use_cases WHERE id = ? AND project_id = ?`,
        user_story: `SELECT 1 FROM qa_user_stories WHERE id = ? AND project_id = ?`,
        test_case: `SELECT 1 FROM qa_test_cases WHERE id = ? AND project_id = ?`,
        test_suite: `SELECT 1 FROM qa_test_suites WHERE id = ? AND project_id = ?`,
        defect: `SELECT 1 FROM qa_defects WHERE id = ? AND project_id = ?`,
        exploratory_session: `SELECT 1 FROM qa_test_runs WHERE id = ? AND project_id = ? AND run_type = 'EXPLORATORY'`,
    };
    const sql = queries[type];
    if (!sql) return false;
    const res = await query(sql, [id, projectId]);
    return res.rows.length > 0;
}

function normalizeDiagramPayload(body = {}) {
    const name = String(body.name || '').trim();
    if (!name) return { error: 'El nombre del diagrama es obligatorio.' };
    if (name.length > MAX_NAME) {
        return { error: `El nombre no puede superar los ${MAX_NAME} caracteres.` };
    }

    const description = body.description == null ? null : String(body.description).trim();
    if (description && description.length > MAX_DESCRIPTION) {
        return { error: `La descripción no puede superar los ${MAX_DESCRIPTION} caracteres.` };
    }

    const nodes = body.nodes === undefined ? [] : body.nodes;
    const edges = body.edges === undefined ? [] : body.edges;
    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
        return { error: 'nodes y edges deben ser arrays.' };
    }

    const settings = body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings)
        ? body.settings
        : {};

    const bytes = Buffer.byteLength(JSON.stringify({ nodes, edges, settings }), 'utf8');
    if (bytes > MAX_JSON_BYTES) {
        return { error: 'El diagrama supera el tamaño máximo permitido (2 MB).' };
    }

    return { name, description, nodes, edges, settings };
}

async function canAccessProject(user, projectId) {
    if (!user) return false;
    if (user.role === 'Admin' || user.role === 'Analista QA') return true;
    const res = await query(
        `SELECT 1 FROM qa_project_users WHERE user_id = ? AND project_id = ?`,
        [user.id, projectId],
    );
    return res.rows.length > 0;
}

async function getDiagram(id) {
    const res = await query(`
        SELECT d.id, d.project_id, d.name, d.description, d.nodes, d.edges, d.settings, d.version,
               d.entity_type, d.entity_id,
               d.created_at, d.updated_at, d.created_by, d.updated_by,
               creator.name AS created_by_name,
               editor.name AS updated_by_name
        FROM qa_flow_diagrams d
        LEFT JOIN qa_users creator ON creator.id = d.created_by
        LEFT JOIN qa_users editor ON editor.id = d.updated_by
        WHERE d.id = ?
    `, [id]);
    return res.rows[0] || null;
}

router.get('/', requireAuth, async (req, res) => {
    try {
        const projectId = Number(req.query.project_id);
        if (!Number.isInteger(projectId) || projectId <= 0) {
            return res.status(400).json({ error: 'project_id requerido' });
        }
        if (!(await canAccessProject(req.user, projectId))) {
            return res.status(403).json({ error: 'Sin acceso a este proyecto.' });
        }

        const result = await query(`
            SELECT d.id, d.project_id, d.name, d.description, d.version,
                   d.entity_type, d.entity_id,
                   d.created_at, d.updated_at,
                   jsonb_array_length(d.nodes) AS node_count,
                   jsonb_array_length(d.edges) AS edge_count,
                   editor.name AS updated_by_name
            FROM qa_flow_diagrams d
            LEFT JOIN qa_users editor ON editor.id = d.updated_by
            WHERE d.project_id = ?
            ORDER BY d.updated_at DESC, d.id DESC
        `, [projectId]);

        res.json({ diagrams: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/link-targets', requireAuth, async (req, res) => {
    try {
        const projectId = Number(req.query.project_id);
        if (!Number.isInteger(projectId) || projectId <= 0) {
            return res.status(400).json({ error: 'project_id requerido' });
        }
        if (!(await canAccessProject(req.user, projectId))) {
            return res.status(403).json({ error: 'Sin acceso a este proyecto.' });
        }
        const search = String(req.query.q || '').trim();
        const like = `%${search}%`;
        const hasSearch = search.length > 0;

        const [useCases, userStories, testCases, suites, defects, sessions] = await Promise.all([
            query(`
                SELECT id, key_id, title FROM qa_use_cases
                 WHERE project_id = ? ${hasSearch ? 'AND (title ILIKE ? OR key_id ILIKE ?)' : ''}
                 ORDER BY id DESC LIMIT 40
            `, hasSearch ? [projectId, like, like] : [projectId]),
            query(`
                SELECT us.id, us.key_id, us.title, uc.title AS parent_title
                  FROM qa_user_stories us
                  LEFT JOIN qa_use_cases uc ON uc.id = us.use_case_id
                 WHERE us.project_id = ? ${hasSearch ? 'AND (us.title ILIKE ? OR us.key_id ILIKE ?)' : ''}
                 ORDER BY us.id DESC LIMIT 40
            `, hasSearch ? [projectId, like, like] : [projectId]),
            query(`
                SELECT tc.id, tc.key_id, tc.title, s.title AS parent_title
                  FROM qa_test_cases tc
                  LEFT JOIN qa_test_suites s ON s.id = tc.suite_id
                 WHERE tc.project_id = ? ${hasSearch ? 'AND (tc.title ILIKE ? OR tc.key_id ILIKE ?)' : ''}
                 ORDER BY tc.id DESC LIMIT 80
            `, hasSearch ? [projectId, like, like] : [projectId]),
            query(`
                SELECT id, key_id, title FROM qa_test_suites
                 WHERE project_id = ? ${hasSearch ? 'AND (title ILIKE ? OR key_id ILIKE ?)' : ''}
                 ORDER BY id DESC LIMIT 40
            `, hasSearch ? [projectId, like, like] : [projectId]),
            query(`
                SELECT id, title, CASE WHEN execution_id IS NULL THEN 'Hallazgo' ELSE 'Bug' END AS kind
                  FROM qa_defects
                 WHERE project_id = ? ${hasSearch ? 'AND title ILIKE ?' : ''}
                 ORDER BY id DESC LIMIT 40
            `, hasSearch ? [projectId, like] : [projectId]),
            query(`
                SELECT id, name, run_type FROM qa_test_runs
                 WHERE project_id = ? AND run_type = 'EXPLORATORY' ${hasSearch ? "AND (COALESCE(name, '') ILIKE ? OR CAST(id AS TEXT) ILIKE ?)" : ''}
                 ORDER BY id DESC LIMIT 40
            `, hasSearch ? [projectId, like, like] : [projectId]),
        ]);

        const targets = [];
        for (const row of useCases.rows) {
            targets.push({ type: 'use_case', id: row.id, label: `${row.key_id || `CU #${row.id}`} · ${row.title}` });
        }
        for (const row of userStories.rows) {
            targets.push({ type: 'user_story', id: row.id, label: `${row.key_id || `HU #${row.id}`} · ${row.title}` });
        }
        for (const row of testCases.rows) {
            targets.push({ type: 'test_case', id: row.id, label: `${row.key_id || `TC #${row.id}`} · ${row.title}` });
        }
        for (const row of suites.rows) {
            targets.push({ type: 'test_suite', id: row.id, label: `${row.key_id || `Suite #${row.id}`} · ${row.title}` });
        }
        for (const row of defects.rows) {
            targets.push({ type: 'defect', id: row.id, label: `${row.kind} #${row.id} · ${row.title}` });
        }
        for (const row of sessions.rows) {
            targets.push({ type: 'exploratory_session', id: row.id, label: `Sesión #${row.id} · ${row.name || 'Exploratoria'}` });
        }

        res.json({ targets });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id', requireAuth, async (req, res) => {
    try {
        const diagram = await getDiagram(Number(req.params.id));
        if (!diagram) return res.status(404).json({ error: 'Diagrama no encontrado.' });
        if (!(await canAccessProject(req.user, diagram.project_id))) {
            return res.status(403).json({ error: 'Sin acceso a este proyecto.' });
        }
        res.json({ diagram });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        const projectId = Number(req.body.project_id);
        if (!Number.isInteger(projectId) || projectId <= 0) {
            return res.status(400).json({ error: 'project_id requerido' });
        }

        const payload = normalizeDiagramPayload(req.body);
        if (payload.error) return res.status(400).json({ error: payload.error });
        const link = normalizeEntityLink(req.body);
        if (link.error) return res.status(400).json({ error: link.error });
        if (!(await canAccessProject(req.user, projectId))) {
            return res.status(403).json({ error: 'Sin acceso a este proyecto.' });
        }
        if (link.entity_type && !(await entityBelongsToProject(link.entity_type, link.entity_id, projectId))) {
            return res.status(400).json({ error: 'La entidad vinculada no pertenece al proyecto.' });
        }

        const project = await query(`SELECT id FROM qa_projects WHERE id = ?`, [projectId]);
        if (project.rows.length === 0) return res.status(404).json({ error: 'Proyecto no encontrado.' });

        const result = await query(`
            INSERT INTO qa_flow_diagrams
                (project_id, name, description, nodes, edges, settings, entity_type, entity_id, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            projectId,
            payload.name,
            payload.description,
            JSON.stringify(payload.nodes),
            JSON.stringify(payload.edges),
            JSON.stringify(payload.settings),
            link.entity_type,
            link.entity_id,
            req.user.id,
            req.user.id,
        ]);

        const diagram = await getDiagram(result.lastID);
        res.status(201).json({ diagram });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', requireAuth, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const current = await getDiagram(id);
        if (!current) return res.status(404).json({ error: 'Diagrama no encontrado.' });
        if (!(await canAccessProject(req.user, current.project_id))) {
            return res.status(403).json({ error: 'Sin acceso a este proyecto.' });
        }

        const payload = normalizeDiagramPayload(req.body);
        if (payload.error) return res.status(400).json({ error: payload.error });
        const link = normalizeEntityLink(req.body);
        if (link.error) return res.status(400).json({ error: link.error });
        if (link.entity_type && !(await entityBelongsToProject(link.entity_type, link.entity_id, current.project_id))) {
            return res.status(400).json({ error: 'La entidad vinculada no pertenece al proyecto.' });
        }

        await query(`
            UPDATE qa_flow_diagrams
               SET name = ?, description = ?, nodes = ?, edges = ?, settings = ?,
                   entity_type = ?, entity_id = ?,
                   version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?
        `, [
            payload.name,
            payload.description,
            JSON.stringify(payload.nodes),
            JSON.stringify(payload.edges),
            JSON.stringify(payload.settings),
            link.entity_type,
            link.entity_id,
            req.user.id,
            id,
        ]);

        const diagram = await getDiagram(id);
        res.json({ diagram });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const current = await getDiagram(id);
        if (!current) return res.status(404).json({ error: 'Diagrama no encontrado.' });
        if (!(await canAccessProject(req.user, current.project_id))) {
            return res.status(403).json({ error: 'Sin acceso a este proyecto.' });
        }

        await query(`DELETE FROM qa_flow_diagrams WHERE id = ?`, [id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
