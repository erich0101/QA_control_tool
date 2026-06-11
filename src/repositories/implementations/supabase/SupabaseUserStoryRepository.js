'use strict';

const { UserStoryRepository, ScenarioRepository, InconsistenciaRepository } = require('../../contracts/UserStoryRepository');
const { SupabaseBaseRepository } = require('./SupabaseBaseRepository');

class SupabaseUserStoryRepository extends UserStoryRepository {
    constructor({ base } = {}) {
        super();
        this._base = base || new SupabaseBaseRepository({ client: undefined });
    }
    _query(sql, params) { return this._base._query(sql, params); }

    async listByUseCaseIds(useCaseIds, exec) {
        const r = await this._query(
            `SELECT * FROM qa_user_stories WHERE use_case_id = ANY(?)`, [useCaseIds]
        );
        return r.rows;
    }
    async listByUseCase(useCaseId, exec) {
        const r = await this._query(
            `SELECT us.*,
                    (SELECT COUNT(*)::INT FROM qa_test_cases WHERE us_id = us.id) AS test_count,
                    COALESCE((SELECT json_agg(s ORDER BY s.order_index) FROM qa_scenarios s WHERE s.us_id = us.id), '[]') AS scenarios,
                    COALESCE((SELECT json_agg(json_build_object('id', i.id, 'title', i.title, 'description', i.description, 'severity', i.severity, 'order_index', i.order_index) ORDER BY i.order_index)
                              FROM qa_inconsistencias i
                              JOIN qa_test_suites s ON i.suite_id = s.id
                              JOIN qa_test_cases tc ON tc.suite_id = s.id
                              WHERE tc.us_id = us.id), '[]') AS inconsistencies,
                    us.recommendations
             FROM qa_user_stories us WHERE us.use_case_id = ? ORDER BY us.id DESC`, [useCaseId]
        );
        return r.rows;
    }
    async create({ useCaseId, projectId, keyId, title, huDetallada, priority, status, escenariosPrueba, reglasNegocio, precondiciones, linkDocumentacion, createdBy, updatedBy }, exec) {
        const r = await this._query(
            `INSERT INTO qa_user_stories
             (use_case_id, key_id, title, hu_detallada, priority, status, escenarios_prueba, reglas_negocio, precondiciones, link_documentacion, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [useCaseId, keyId, title, huDetallada, priority, status, escenariosPrueba, reglasNegocio, precondiciones, linkDocumentacion, createdBy, updatedBy]
        );
        return r.lastID;
    }
    async upsertReturning({ useCaseId, projectId, keyId, title, huDetallada, reglasNegocio, precondiciones, createdBy }, exec) {
        const r = await this._query(
            `INSERT INTO qa_user_stories (use_case_id, project_id, key_id, title, hu_detallada, reglas_negocio, precondiciones, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (key_id) DO UPDATE SET title = EXCLUDED.title
             RETURNING id`, [useCaseId, projectId, keyId, title, huDetallada, reglasNegocio, precondiciones, createdBy]
        );
        return r.rows[0]?.id;
    }
    async setEscenariosPrueba(id, text, exec) {
        await this._query(`UPDATE qa_user_stories SET escenarios_prueba = ? WHERE id = ?`, [text, id]);
    }
    async appendEscenario(id, escenario, exec) {
        await this._query(
            `UPDATE qa_user_stories
             SET escenarios_prueba = CASE
                 WHEN escenarios_prueba = '' OR escenarios_prueba IS NULL THEN ?
                 ELSE escenarios_prueba || CHR(10) || ?
             END WHERE id = ?`, [escenario, escenario, id]
        );
    }
    async updateRecommendations(id, recommendations, exec) {
        await this._query(
            `UPDATE qa_user_stories SET recommendations = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [recommendations, id]
        );
    }
    async updateDynamic(id, fields, exec) {
        const ALLOWED_UPDATE_FIELDS = new Set([
            'title', 'hu_detallada', 'reglas_negocio', 'precondiciones',
            'priority', 'status', 'link_documentacion', 'recommendations',
            'escenarios_prueba', 'key_id',
        ]);
        const entries = Object.entries(fields).filter(([k]) => ALLOWED_UPDATE_FIELDS.has(k));
        if (entries.length === 0) return;
        const setClause = entries.map(([k], i) => `${k} = ?`).join(', ');
        const values = entries.map(([, v]) => v);
        await this._query(
            `UPDATE qa_user_stories SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [...values, id]
        );
    }
    async updateDynamicWithUpdatedBy(id, fields, updatedBy, exec) {
        const ALLOWED_UPDATE_FIELDS = new Set([
            'title', 'hu_detallada', 'reglas_negocio', 'precondiciones',
            'priority', 'status', 'link_documentacion', 'recommendations',
            'escenarios_prueba', 'key_id',
        ]);
        const entries = Object.entries(fields).filter(([k]) => ALLOWED_UPDATE_FIELDS.has(k));
        if (entries.length === 0) return;
        const setClause = entries.map(([k]) => `${k} = ?`).join(', ');
        const values = entries.map(([, v]) => v);
        await this._query(
            `UPDATE qa_user_stories SET ${setClause}, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [...values, updatedBy, id]
        );
    }
    async remove(id, exec) {
        await this._query(`DELETE FROM qa_user_stories WHERE id = ?`, [id]);
    }
}

class SupabaseScenarioRepository extends ScenarioRepository {
    constructor({ base } = {}) {
        super();
        this._base = base || new SupabaseBaseRepository({ client: undefined });
    }
    _query(sql, params) { return this._base._query(sql, params); }

    async create({ usId, title, description, orderIndex }, exec) {
        const r = await this._query(
            `INSERT INTO qa_scenarios (us_id, title, description, order_index) VALUES (?, ?, ?, ?)`,
            [usId, title, description || '', orderIndex || 0]
        );
        return r.lastID;
    }
    async createReturning({ usId, title, orderIndex }, exec) {
        const r = await this._query(
            `INSERT INTO qa_scenarios (us_id, title, order_index) VALUES (?, ?, ?) RETURNING id`,
            [usId, title, orderIndex]
        );
        return r.rows[0]?.id;
    }
    async createNextForUS(usId, title, exec) {
        const r = await this._query(
            `INSERT INTO qa_scenarios (us_id, title, order_index)
             VALUES (?, ?, (SELECT COALESCE(MAX(order_index) + 1, 0) FROM qa_scenarios WHERE us_id = ?))
             RETURNING id`, [usId, title, usId]
        );
        return r.rows[0]?.id;
    }
    async update(id, { title, description, orderIndex }, exec) {
        await this._query(
            `UPDATE qa_scenarios
             SET title = COALESCE(?, title), description = COALESCE(?, description),
                 order_index = COALESCE(?, order_index)
             WHERE id = ?`,
            [title, description, orderIndex, id]
        );
    }
    async updateTitle(id, title, exec) {
        await this._query(`UPDATE qa_scenarios SET title = ? WHERE id = ?`, [title, id]);
    }
    async remove(id, exec) {
        await this._query(`DELETE FROM qa_scenarios WHERE id = ?`, [id]);
    }
}

class SupabaseInconsistenciaRepository extends InconsistenciaRepository {
    constructor({ base } = {}) {
        super();
        this._base = base || new SupabaseBaseRepository({ client: undefined });
    }
    _query(sql, params) { return this._base._query(sql, params); }

    async create({ suiteId, usId, title, description, severity, orderIndex }, exec) {
        const r = await this._query(
            `INSERT INTO qa_inconsistencias (suite_id, us_id, title, description, severity, order_index)
             VALUES (?, ?, ?, ?, ?, ?)`, [suiteId || null, usId || null, title, description || '', severity || 'Alta', orderIndex]
        );
        return r.lastID;
    }
    async createForUS(usId, title, exec) {
        const r = await this._query(
            `INSERT INTO qa_inconsistencias (us_id, title, order_index) VALUES (?, ?, 0)`, [usId, title]
        );
        return r.lastID;
    }
    async listBySuiteIds(suiteIds, exec) {
        const r = await this._query(
            `SELECT id, suite_id, title, description, severity, order_index
             FROM qa_inconsistencias WHERE suite_id = ANY(?) ORDER BY suite_id, order_index`,
            [suiteIds]
        );
        return r.rows;
    }
    async update(id, { title, description, severity, orderIndex }, exec) {
        await this._query(
            `UPDATE qa_inconsistencias
             SET title = COALESCE(?, title), description = COALESCE(?, description),
                 severity = COALESCE(?, severity), order_index = COALESCE(?, order_index)
             WHERE id = ?`, [title, description, severity, orderIndex, id]
        );
    }
    async remove(id, exec) {
        await this._query(`DELETE FROM qa_inconsistencias WHERE id = ?`, [id]);
    }
    async deleteBySuiteId(suiteId, exec) {
        await this._query(`DELETE FROM qa_inconsistencias WHERE suite_id = ?`, [suiteId]);
    }
}

module.exports = {
    SupabaseUserStoryRepository,
    SupabaseScenarioRepository,
    SupabaseInconsistenciaRepository,
};
