'use strict';

const db = require('../db');
const executor = (tx) => tx || db;

async function create({ suiteId, usId, title, description, severity, orderIndex }, exec) {
    const r = await executor(exec).query(
        `INSERT INTO qa_inconsistencias (suite_id, us_id, title, description, severity, order_index)
         VALUES (?, ?, ?, ?, ?, ?)`, [suiteId || null, usId || null, title, description || '', severity || 'Alta', orderIndex]
    );
    return r.lastID;
}

async function createForUS(usId, title, exec) {
    const r = await executor(exec).query(
        `INSERT INTO qa_inconsistencias (us_id, title, order_index) VALUES (?, ?, 0)`, [usId, title]
    );
    return r.lastID;
}

async function listBySuiteIds(suiteIds, exec) {
    const r = await executor(exec).query(
        `SELECT id, suite_id, title, description, severity, order_index
         FROM qa_inconsistencias WHERE suite_id = ANY(?) ORDER BY suite_id, order_index`,
        [suiteIds]
    );
    return r.rows;
}

async function update(id, { title, description, severity, orderIndex }, exec) {
    await executor(exec).query(
        `UPDATE qa_inconsistencias
         SET title = COALESCE(?, title), description = COALESCE(?, description),
             severity = COALESCE(?, severity), order_index = COALESCE(?, order_index)
         WHERE id = ?`, [title, description, severity, orderIndex, id]
    );
}

async function remove(id, exec) {
    await executor(exec).query(`DELETE FROM qa_inconsistencias WHERE id = ?`, [id]);
}

async function deleteBySuiteId(suiteId, exec) {
    await executor(exec).query(`DELETE FROM qa_inconsistencias WHERE suite_id = ?`, [suiteId]);
}

module.exports = { create, createForUS, listBySuiteIds, update, remove, deleteBySuiteId };
