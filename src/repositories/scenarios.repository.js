'use strict';

const db = require('../db');
const executor = (tx) => tx || db;

async function create({ usId, title, description, orderIndex }, exec) {
    const r = await executor(exec).query(
        `INSERT INTO qa_scenarios (us_id, title, description, order_index) VALUES (?, ?, ?, ?)`,
        [usId, title, description || '', orderIndex || 0]
    );
    return r.lastID;
}

async function createReturning({ usId, title, orderIndex }, exec) {
    const r = await executor(exec).query(
        `INSERT INTO qa_scenarios (us_id, title, order_index) VALUES (?, ?, ?) RETURNING id`,
        [usId, title, orderIndex]
    );
    return r.rows[0]?.id;
}

async function createNextForUS(usId, title, exec) {
    const r = await executor(exec).query(
        `INSERT INTO qa_scenarios (us_id, title, order_index)
         VALUES (?, ?, (SELECT COALESCE(MAX(order_index) + 1, 0) FROM qa_scenarios WHERE us_id = ?))
         RETURNING id`, [usId, title, usId]
    );
    return r.rows[0]?.id;
}

async function update(id, { title, description, orderIndex }, exec) {
    await executor(exec).query(
        `UPDATE qa_scenarios
         SET title = COALESCE(?, title), description = COALESCE(?, description),
             order_index = COALESCE(?, order_index)
         WHERE id = ?`,
        [title, description, orderIndex, id]
    );
}

async function updateTitle(id, title, exec) {
    await executor(exec).query(`UPDATE qa_scenarios SET title = ? WHERE id = ?`, [title, id]);
}

async function remove(id, exec) {
    await executor(exec).query(`DELETE FROM qa_scenarios WHERE id = ?`, [id]);
}

module.exports = { create, createReturning, createNextForUS, update, updateTitle, remove };
