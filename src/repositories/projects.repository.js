'use strict';

const db = require('../db');
const executor = (tx) => tx || db;

async function listAll(exec) {
    const r = await executor(exec).query(`SELECT * FROM qa_projects ORDER BY id DESC`);
    return r.rows;
}

async function listForUser(userId, exec) {
    const r = await executor(exec).query(
        `SELECT p.* FROM qa_projects p
         JOIN qa_project_users pu ON p.id = pu.project_id
         WHERE pu.user_id = ? ORDER BY p.id DESC`, [userId]
    );
    return r.rows;
}

async function findById(id, exec) {
    const r = await executor(exec).query(`SELECT * FROM qa_projects WHERE id = ?`, [id]);
    return r.rows[0] || null;
}

async function findFirstActive(exec) {
    const r = await executor(exec).query(
        `SELECT id FROM qa_projects WHERE status = 'ACTIVE' ORDER BY id LIMIT 1`
    );
    return r.rows[0] || null;
}

async function create({ name, description }, exec) {
    const r = await executor(exec).query(
        `INSERT INTO qa_projects (name, description) VALUES (?, ?)`, [name, description]
    );
    return r.lastID;
}

async function update(id, { name, description, status }, exec) {
    await executor(exec).query(
        `UPDATE qa_projects SET name = COALESCE(?, name), description = COALESCE(?, description), status = COALESCE(?, status) WHERE id = ?`,
        [name, description, status, id]
    );
}

async function remove(id, exec) {
    await executor(exec).query(`DELETE FROM qa_projects WHERE id = ?`, [id]);
}

async function overviewSummary(projectId, exec) {
    const useCases = await executor(exec).query(`SELECT COUNT(*)::INT AS cnt FROM qa_use_cases WHERE project_id = ?`, [projectId]);
    const suites = await executor(exec).query(
        `SELECT COUNT(*)::INT AS cnt FROM qa_test_suites s JOIN qa_use_cases cu ON s.use_case_id = cu.id WHERE cu.project_id = ?`,
        [projectId]
    );
    const tests = await executor(exec).query(
        `SELECT COUNT(*)::INT AS cnt FROM qa_test_cases tc
         JOIN qa_test_suites s ON tc.suite_id = s.id
         JOIN qa_use_cases cu ON s.use_case_id = cu.id WHERE cu.project_id = ?`,
        [projectId]
    );
    return {
        use_cases: useCases.rows[0].cnt,
        test_suites: suites.rows[0].cnt,
        test_cases: tests.rows[0].cnt,
    };
}

async function overviewSummaryLegacy(projectId, exec) {
    const r = await executor(exec).query(`
        SELECT
            (SELECT COUNT(*) FROM qa_use_cases WHERE project_id = ?) as total_cu,
            (SELECT COUNT(*) FROM qa_test_suites s JOIN qa_use_cases cu ON s.use_case_id = cu.id WHERE cu.project_id = ?) as total_suites,
            (SELECT COUNT(*) FROM qa_test_cases tc JOIN qa_test_suites s ON tc.suite_id = s.id JOIN qa_use_cases cu ON s.use_case_id = cu.id WHERE cu.project_id = ?) as total_tc
    `, [projectId, projectId, projectId]);
    return r.rows[0];
}

module.exports = { listAll, listForUser, findById, findFirstActive, create, update, remove, overviewSummary, overviewSummaryLegacy };
