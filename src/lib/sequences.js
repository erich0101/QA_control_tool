const { query } = require('../../db');

/**
 * Secuencias de key_id por proyecto (CU-0001, HU-0001, TC-0001…).
 * `queryFn` permite inyectar una transacción/cliente distinto.
 */
const generateKey = async (projectId, prefix, queryFn) => {
    const q = queryFn || query;
    const res = await q(
        `INSERT INTO qa_project_sequences (project_id, prefix, last_number) VALUES (?, ?, 1)
         ON CONFLICT (project_id, prefix) DO UPDATE SET last_number = qa_project_sequences.last_number + 1
         RETURNING last_number`,
        [projectId, prefix]
    );
    const num = res.rows[0].last_number;
    return `${prefix}-${num.toString().padStart(4, '0')}`;
};

const generateKeyBatch = async (projectId, prefix, count, queryFn) => {
    const q = queryFn || query;
    const res = await q(
        `INSERT INTO qa_project_sequences (project_id, prefix, last_number) VALUES (?, ?, ?)
         ON CONFLICT (project_id, prefix) DO UPDATE SET last_number = qa_project_sequences.last_number + ?
         RETURNING last_number`,
        [projectId, prefix, count, count]
    );
    const endNum = res.rows[0].last_number;
    return endNum - count + 1;
};

const getProjectIdFromUC = async (ucId) => {
    const res = await query(`SELECT project_id FROM qa_use_cases WHERE id = ?`, [ucId]);
    return res.rows[0]?.project_id;
};

const getProjectIdFromSuite = async (suiteId) => {
    const res = await query(`
        SELECT cu.project_id FROM qa_test_suites ts
        JOIN qa_use_cases cu ON ts.use_case_id = cu.id
        WHERE ts.id = ?
    `, [suiteId]);
    return res.rows[0]?.project_id;
};

/** Permiso granular del usuario (tabla qa_user_permissions). */
const checkPermission = async (userId, permission) => {
    const result = await query(`SELECT * FROM qa_user_permissions WHERE user_id = ?`, [userId]);
    return result.rows.length > 0 && !!result.rows[0][permission];
};

module.exports = {
    generateKey,
    generateKeyBatch,
    getProjectIdFromUC,
    getProjectIdFromSuite,
    checkPermission,
};
