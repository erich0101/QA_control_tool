'use strict';

const db = require('../db');
const executor = (tx) => tx || db;

async function listByUseCaseIds(useCaseIds, exec) {
    const r = await executor(exec).query(
        `SELECT * FROM qa_user_stories WHERE use_case_id = ANY(?)`, [useCaseIds]
    );
    return r.rows;
}

async function listByUseCase(useCaseId, exec) {
    const r = await executor(exec).query(
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

async function create({ useCaseId, projectId, keyId, title, huDetallada, priority, status, escenariosPrueba, reglasNegocio, precondiciones, linkDocumentacion, createdBy, updatedBy }, exec) {
    const r = await executor(exec).query(
        `INSERT INTO qa_user_stories
         (use_case_id, key_id, title, hu_detallada, priority, status, escenarios_prueba, reglas_negocio, precondiciones, link_documentacion, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [useCaseId, keyId, title, huDetallada, priority, status, escenariosPrueba, reglasNegocio, precondiciones, linkDocumentacion, createdBy, updatedBy]
    );
    return r.lastID;
}

async function upsertReturning({ useCaseId, projectId, keyId, title, huDetallada, reglasNegocio, precondiciones, createdBy }, exec) {
    const r = await executor(exec).query(
        `INSERT INTO qa_user_stories (use_case_id, project_id, key_id, title, hu_detallada, reglas_negocio, precondiciones, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (key_id) DO UPDATE SET title = EXCLUDED.title
         RETURNING id`, [useCaseId, projectId, keyId, title, huDetallada, reglasNegocio, precondiciones, createdBy]
    );
    return r.rows[0]?.id;
}

async function setEscenariosPrueba(id, text, exec) {
    await executor(exec).query(`UPDATE qa_user_stories SET escenarios_prueba = ? WHERE id = ?`, [text, id]);
}

async function appendEscenario(id, escenario, exec) {
    await executor(exec).query(
        `UPDATE qa_user_stories
         SET escenarios_prueba = CASE
             WHEN escenarios_prueba = '' OR escenarios_prueba IS NULL THEN ?
             ELSE escenarios_prueba || CHR(10) || ?
         END WHERE id = ?`, [escenario, escenario, id]
    );
}

async function updateRecommendations(id, recommendations, exec) {
    await executor(exec).query(
        `UPDATE qa_user_stories SET recommendations = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [recommendations, id]
    );
}

const ALLOWED_UPDATE_FIELDS = new Set([
    'title', 'hu_detallada', 'reglas_negocio', 'precondiciones',
    'priority', 'status', 'link_documentacion', 'recommendations',
    'escenarios_prueba', 'key_id',
]);

async function updateDynamic(id, fields, exec) {
    const entries = Object.entries(fields).filter(([k]) => ALLOWED_UPDATE_FIELDS.has(k));
    if (entries.length === 0) return;
    const setClause = entries.map(([k], i) => `${k} = ?`).join(', ');
    const values = entries.map(([, v]) => v);
    await executor(exec).query(
        `UPDATE qa_user_stories SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...values, id]
    );
}

async function updateDynamicWithUpdatedBy(id, fields, updatedBy, exec) {
    const entries = Object.entries(fields).filter(([k]) => ALLOWED_UPDATE_FIELDS.has(k));
    if (entries.length === 0) return;
    const setClause = entries.map(([k]) => `${k} = ?`).join(', ');
    const values = entries.map(([, v]) => v);
    await executor(exec).query(
        `UPDATE qa_user_stories SET ${setClause}, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...values, updatedBy, id]
    );
}

async function remove(id, exec) {
    await executor(exec).query(`DELETE FROM qa_user_stories WHERE id = ?`, [id]);
}

module.exports = {
    listByUseCaseIds, listByUseCase, create, upsertReturning, setEscenariosPrueba,
    appendEscenario, updateRecommendations, updateDynamic, updateDynamicWithUpdatedBy, remove,
};
