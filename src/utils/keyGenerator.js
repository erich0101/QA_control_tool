const { query } = require('../config/db');

const ALLOWED_PERMISSIONS = new Set([
    'can_create_cu', 'can_create_hu', 'can_create_suite', 'can_create_test',
    'can_assign_cu', 'can_assign_hu', 'can_assign_suite', 'can_execute_test',
    'can_manage_projects', 'can_manage_users', 'can_configure_jira'
]);

async function checkPermission(userId, permission) {
    if (!userId || !permission) return false;
    if (!ALLOWED_PERMISSIONS.has(permission)) return false;
    const result = await query(`SELECT ${permission} FROM qa_user_permissions WHERE user_id = ?`, [userId]);
    const row = result.rows[0];
    if (!row) return false;
    const v = row[permission];
    return v === true || v === 1;
}

async function generateKey(projectId, prefix, queryFn) {
    const q = queryFn || query;
    const res = await q(
        `INSERT INTO qa_project_sequences (project_id, prefix, last_number) VALUES (?, ?, 1)
         ON CONFLICT (project_id, prefix) DO UPDATE SET last_number = qa_project_sequences.last_number + 1
         RETURNING last_number`,
        [projectId, prefix]
    );
    const num = res.rows[0].last_number;
    return `${prefix}-${num.toString().padStart(4, '0')}`;
}

async function generateKeyBatch(projectId, prefix, count, queryFn) {
    const q = queryFn || query;
    const res = await q(
        `INSERT INTO qa_project_sequences (project_id, prefix, last_number) VALUES (?, ?, ?)
         ON CONFLICT (project_id, prefix) DO UPDATE SET last_number = qa_project_sequences.last_number + ?
         RETURNING last_number`,
        [projectId, prefix, count, count]
    );
    const endNum = res.rows[0].last_number;
    return endNum - count + 1;
}

async function getProjectIdFromUC(ucId) {
    const res = await query(`SELECT project_id FROM qa_use_cases WHERE id = ?`, [ucId]);
    return res.rows[0]?.project_id;
}

async function getProjectIdFromSuite(suiteId) {
    const res = await query(`
        SELECT cu.project_id FROM qa_test_suites ts
        JOIN qa_use_cases cu ON ts.use_case_id = cu.id
        WHERE ts.id = ?
    `, [suiteId]);
    return res.rows[0]?.project_id;
}

/**
 * Previene CSV/Excel formula injection (OWASP).
 * Si el string empieza con =, +, -, @, antepone una comilla simple.
 * NO es sanitización XSS ni SQL — el output parametrizado y el escape del DOM
 * se manejan en otras capas.
 */
function escapeForCsv(val) {
    if (val === null || val === undefined) return '';
    let str = String(val).trim();
    if (str.length > 0 && ['=', '+', '-', '@'].includes(str[0])) {
        str = "'" + str;
    }
    return str;
}

module.exports = {
    checkPermission,
    generateKey,
    generateKeyBatch,
    getProjectIdFromUC,
    getProjectIdFromSuite,
    escapeForCsv,
};
