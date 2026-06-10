'use strict';

const db = require('../db');
const executor = (tx) => tx || db;

async function listByProject(projectId, exec) {
    const r = await executor(exec).query(`SELECT * FROM qa_use_cases WHERE project_id = ?`, [projectId]);
    return r.rows;
}

async function listByProjectWithUSCount(projectId, exec) {
    const r = await executor(exec).query(
        `SELECT cu.*, (SELECT COUNT(*)::INT FROM qa_user_stories WHERE use_case_id = cu.id) AS us_count
         FROM qa_use_cases cu WHERE cu.project_id = ? ORDER BY cu.id DESC`, [projectId]
    );
    return r.rows;
}

async function findById(id, exec) {
    const r = await executor(exec).query(`SELECT * FROM qa_use_cases WHERE id = ?`, [id]);
    return r.rows[0] || null;
}

async function findByIdWithProject(id, exec) {
    const r = await executor(exec).query(
        `SELECT uc.*, p.name AS project_name FROM qa_use_cases uc
         JOIN qa_projects p ON uc.project_id = p.id WHERE uc.id = ?`, [id]
    );
    return r.rows[0] || null;
}

async function findProjectId(ucId, exec) {
    const r = await executor(exec).query(`SELECT project_id FROM qa_use_cases WHERE id = ?`, [ucId]);
    return r.rows[0]?.project_id;
}

async function create({ projectId, keyId, title, description, createdBy, updatedBy }, exec) {
    const r = await executor(exec).query(
        `INSERT INTO qa_use_cases (project_id, key_id, title, description, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [projectId, keyId, title, description, createdBy, updatedBy]
    );
    return r.lastID;
}

async function update(id, { title, description, status, keyId, updatedBy }, exec) {
    await executor(exec).query(
        `UPDATE qa_use_cases
         SET title = COALESCE(?, title), description = COALESCE(?, description), status = COALESCE(?, status),
             key_id = COALESCE(?, key_id), updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [title, description, status, keyId, updatedBy, id]
    );
}

async function remove(id, exec) {
    await executor(exec).query(`DELETE FROM qa_use_cases WHERE id = ?`, [id]);
}

async function coverageByProject(projectId, exec) {
    const r = await executor(exec).query(
        `SELECT cu.title, COUNT(tc.id)::INT AS total,
                COALESCE(SUM(CASE WHEN e.status IN ('OK', 'PASS') THEN 1 ELSE 0 END), 0)::INT AS ok
         FROM qa_use_cases cu
         LEFT JOIN qa_test_suites s ON cu.id = s.use_case_id
         LEFT JOIN qa_test_cases tc ON s.id = tc.suite_id
         LEFT JOIN (
             SELECT tc_id, status FROM qa_executions
             WHERE id IN (SELECT MAX(id) FROM qa_executions GROUP BY tc_id)
         ) e ON tc.id = e.tc_id
         WHERE cu.project_id = ?
         GROUP BY cu.id, cu.title ORDER BY cu.id`, [projectId]
    );
    return r.rows;
}

module.exports = {
    listByProject, listByProjectWithUSCount, findById, findByIdWithProject, findProjectId,
    create, update, remove, coverageByProject,
};
