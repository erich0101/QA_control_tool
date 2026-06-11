'use strict';

const ProjectRepository = require('../../contracts/ProjectRepository');
const { PostgresBaseRepository } = require('./PostgresBaseRepository');

class PostgresProjectRepository extends ProjectRepository {
    constructor({ base } = {}) {
        super();
        this._base = base || new PostgresBaseRepository();
    }
    _query(sql, params) { return this._base._query(sql, params); }

    async listAll(exec) {
        const r = await this._query(`SELECT * FROM qa_projects ORDER BY id DESC`);
        return r.rows;
    }
    async listForUser(userId, exec) {
        const r = await this._query(
            `SELECT p.* FROM qa_projects p
             JOIN qa_project_users pu ON p.id = pu.project_id
             WHERE pu.user_id = ? ORDER BY p.id DESC`, [userId]
        );
        return r.rows;
    }
    async findById(id, exec) {
        const r = await this._query(`SELECT * FROM qa_projects WHERE id = ?`, [id]);
        return r.rows[0] || null;
    }
    async findFirstActive(exec) {
        const r = await this._query(
            `SELECT id FROM qa_projects WHERE status = 'ACTIVE' ORDER BY id LIMIT 1`
        );
        return r.rows[0] || null;
    }
    async create({ name, description }, exec) {
        const r = await this._query(
            `INSERT INTO qa_projects (name, description) VALUES (?, ?)`, [name, description]
        );
        return r.lastID;
    }
    async update(id, { name, description, status }, exec) {
        await this._query(
            `UPDATE qa_projects SET name = COALESCE(?, name), description = COALESCE(?, description), status = COALESCE(?, status) WHERE id = ?`,
            [name, description, status, id]
        );
    }
    async remove(id, exec) {
        await this._query(`DELETE FROM qa_projects WHERE id = ?`, [id]);
    }
    async overviewSummary(projectId, exec) {
        const useCases = await this._query(`SELECT COUNT(*)::INT AS cnt FROM qa_use_cases WHERE project_id = ?`, [projectId]);
        const suites = await this._query(
            `SELECT COUNT(*)::INT AS cnt FROM qa_test_suites s JOIN qa_use_cases cu ON s.use_case_id = cu.id WHERE cu.project_id = ?`,
            [projectId]
        );
        const tests = await this._query(
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
    async overviewSummaryLegacy(projectId, exec) {
        const r = await this._query(`
            SELECT
                (SELECT COUNT(*) FROM qa_use_cases WHERE project_id = ?) as total_cu,
                (SELECT COUNT(*) FROM qa_test_suites s JOIN qa_use_cases cu ON s.use_case_id = cu.id WHERE cu.project_id = ?) as total_suites,
                (SELECT COUNT(*) FROM qa_test_cases tc JOIN qa_test_suites s ON tc.suite_id = s.id JOIN qa_use_cases cu ON s.use_case_id = cu.id WHERE cu.project_id = ?) as total_tc
        `, [projectId, projectId, projectId]);
        return r.rows[0];
    }
}

module.exports = { PostgresProjectRepository };
