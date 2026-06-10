'use strict';

const db = require('../db');
const executor = (tx) => tx || db;

async function increment(projectId, prefix, exec) {
    const r = await executor(exec).query(
        `INSERT INTO qa_project_sequences (project_id, prefix, last_number) VALUES (?, ?, 1)
         ON CONFLICT (project_id, prefix) DO UPDATE SET last_number = qa_project_sequences.last_number + 1
         RETURNING last_number`, [projectId, prefix]
    );
    return r.rows[0].last_number;
}

async function incrementBy(projectId, prefix, count, exec) {
    const r = await executor(exec).query(
        `INSERT INTO qa_project_sequences (project_id, prefix, last_number) VALUES (?, ?, ?)
         ON CONFLICT (project_id, prefix) DO UPDATE SET last_number = qa_project_sequences.last_number + ?
         RETURNING last_number`, [projectId, prefix, count, count]
    );
    return r.rows[0].last_number;
}

module.exports = { increment, incrementBy };
