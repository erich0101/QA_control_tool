'use strict';

const db = require('../db');
const executor = (tx) => tx || db;

async function listLinkedByUS(usId, exec) {
    const r = await executor(exec).query(
        `SELECT DISTINCT p.* FROM qa_preconditions p
         JOIN qa_tc_preconditions tp ON tp.prc_id = p.id
         JOIN qa_test_cases tc ON tc.id = tp.tc_id
         JOIN qa_test_suites ts ON ts.id = tc.suite_id
         WHERE ts.us_id = ? ORDER BY p.id`, [usId]
    );
    return r.rows;
}

async function listAll(exec) {
    const r = await executor(exec).query(`SELECT * FROM qa_preconditions ORDER BY id`);
    return r.rows;
}

async function create({ title, description, systemState }, exec) {
    const r = await executor(exec).query(
        `INSERT INTO qa_preconditions (title, description, system_state) VALUES (?, ?, ?)`,
        [title, description || '', systemState || '']
    );
    return r.lastID;
}

async function remove(id, exec) {
    await executor(exec).query(`DELETE FROM qa_preconditions WHERE id = ?`, [id]);
}

const tcPreconditions = {
    async link(tcId, prcId, exec) {
        await executor(exec).query(
            `INSERT INTO qa_tc_preconditions (tc_id, prc_id) VALUES (?, ?)
             ON CONFLICT (tc_id, prc_id) DO NOTHING`, [tcId, prcId]
        );
    }
};

module.exports = { listLinkedByUS, listAll, create, remove, tcPreconditions };
