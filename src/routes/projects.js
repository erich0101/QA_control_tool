const express = require('express');
const { query } = require('../../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { checkPermission } = require('../lib/sequences');
const { encrypt } = require('../../utils/crypto-utils');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
    try {
        if (req.user.role === 'Admin' || req.user.role === 'Analista QA') {
            const result = await query(`SELECT * FROM qa_projects ORDER BY id DESC`);
            res.json({ projects: result.rows });
        } else {
            const result = await query(`
                SELECT p.* FROM qa_projects p
                JOIN qa_project_users pu ON p.id = pu.project_id
                WHERE pu.user_id = ? ORDER BY p.id DESC
            `, [req.user.id]);
            res.json({ projects: result.rows });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name) return res.status(400).json({ error: 'Nombre requerido' });
        const result = await query(`INSERT INTO qa_projects (name, description) VALUES (?, ?)`, [name, description || '']);
        res.json({ ok: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { name, description, status } = req.body;
        await query(`UPDATE qa_projects SET name = COALESCE(?, name), description = COALESCE(?, description), status = COALESCE(?, status) WHERE id = ?`,
            [name, description, status, req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await query(`DELETE FROM qa_projects WHERE id = ?`, [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── JIRA CONFIG ──
// ── JIRA CONFIG (Admin: domain + key) ──

router.get('/:id/jira-config', requireAuth, async (req, res) => {
    try {
        const projectId = req.params.id;
        // El token del usuario se consulta siempre: puede existir aunque el
        // proyecto todavía no tenga dominio/key (antes se devolvía
        // userHasToken=false por el early return y la UI mentía "Sin token").
        const [result, userConfig] = await Promise.all([
            query(`SELECT jira_domain, jira_project_key FROM qa_jira_configs WHERE project_id = ?`, [projectId]),
            query(`SELECT id FROM qa_jira_user_configs WHERE project_id = ? AND user_id = ?`, [projectId, req.user.id])
        ]);
        const row = result.rows[0];

        res.json({
            config: row ? {
                jira_domain: row.jira_domain,
                jira_project_key: row.jira_project_key
            } : null,
            userHasToken: userConfig.rows.length > 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/:id/jira-config', requireAuth, async (req, res) => {
    if (req.user.perfil !== 'admin' && !(await checkPermission(req.user.id, 'can_configure_jira'))) {
        return res.status(403).json({ error: 'No tienes permiso para configurar Jira' });
    }
    try {
        const { jira_domain, jira_project_key } = req.body;
        const projectId = req.params.id;

        if (!jira_domain || !jira_project_key) {
            return res.status(400).json({ error: 'Faltan campos requeridos: jira_domain y jira_project_key' });
        }

        const existing = await query(`SELECT project_id FROM qa_jira_configs WHERE project_id = ?`, [projectId]);
        
        if (existing.rows.length > 0) {
            await query(`
                UPDATE qa_jira_configs 
                SET jira_domain = ?, jira_project_key = ?, updated_at = CURRENT_TIMESTAMP
                WHERE project_id = ?
            `, [jira_domain, jira_project_key, projectId]);
        } else {
            await query(`
                INSERT INTO qa_jira_configs (project_id, jira_domain, jira_project_key)
                VALUES (?, ?, ?)
            `, [projectId, jira_domain, jira_project_key]);
        }

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── JIRA USER CONFIG (Per-user credentials) ──

router.get('/:id/jira-user-config', requireAuth, async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = req.user.id;

        const result = await query(`SELECT jira_user_email FROM qa_jira_user_configs WHERE project_id = ? AND user_id = ?`, [projectId, userId]);
        if (result.rows.length === 0) {
            return res.json({ hasConfig: false });
        }
        res.json({ hasConfig: true, email: result.rows[0].jira_user_email });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/:id/jira-user-config', requireAuth, async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = req.user.id;
        const { jira_user_email, jira_api_token } = req.body;

        if (!jira_user_email) {
            return res.status(400).json({ error: 'El email de Jira es obligatorio' });
        }

        const existing = await query(`SELECT id, encrypted_token FROM qa_jira_user_configs WHERE project_id = ? AND user_id = ?`, [projectId, userId]);

        let encToken;
        if (jira_api_token) {
            encToken = encrypt(jira_api_token);
        } else if (existing.rows.length > 0) {
            encToken = existing.rows[0].encrypted_token;
        } else {
            return res.status(400).json({ error: 'El API Token es obligatorio para una nueva configuración' });
        }

        if (existing.rows.length > 0) {
            await query(`
                UPDATE qa_jira_user_configs 
                SET jira_user_email = ?, encrypted_token = ?, updated_at = CURRENT_TIMESTAMP
                WHERE project_id = ? AND user_id = ?
            `, [jira_user_email, encToken, projectId, userId]);
        } else {
            await query(`
                INSERT INTO qa_jira_user_configs (project_id, user_id, jira_user_email, encrypted_token)
                VALUES (?, ?, ?, ?)
            `, [projectId, userId, jira_user_email, encToken]);
        }

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id/jira-user-config', requireAuth, async (req, res) => {
    try {
        await query(`DELETE FROM qa_jira_user_configs WHERE project_id = ? AND user_id = ?`, [req.params.id, req.user.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
