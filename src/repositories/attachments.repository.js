'use strict';

const db = require('../db');
const executor = (tx) => tx || db;

async function findBinary(id, exec) {
    const r = await executor(exec).query(`SELECT mime_type, file_data FROM qa_attachments WHERE id = ?`, [id]);
    return r.rows[0] || null;
}

async function listByExecutionIds(execIds, exec) {
    const r = await executor(exec).query(
        `SELECT id, execution_id, evidence_category FROM qa_attachments WHERE execution_id = ANY(?)`,
        [execIds]
    );
    return r.rows;
}

async function listByExecution(executionId, exec) {
    const r = await executor(exec).query(
        `SELECT file_name, mime_type, file_data FROM qa_attachments WHERE execution_id = ?`, [executionId]
    );
    return r.rows;
}

async function create({ executionId, fileName, mimeType, fileData, evidenceCategory }, exec) {
    const r = await executor(exec).query(
        `INSERT INTO qa_attachments (execution_id, file_name, mime_type, file_data, evidence_category)
         VALUES (?, ?, ?, ?, ?)`, [executionId, fileName, mimeType, fileData, evidenceCategory]
    );
    return r.lastID;
}

async function createWithDefect({ executionId, defectId, fileName, mimeType, fileData, evidenceCategory }, exec) {
    await executor(exec).query(
        `INSERT INTO qa_attachments (execution_id, defect_id, file_name, mime_type, evidence_category, file_data)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [executionId, defectId, fileName, mimeType, evidenceCategory, fileData]
    );
}

async function deleteByExecutionAndCategory(executionId, category, exec) {
    await executor(exec).query(
        `DELETE FROM qa_attachments WHERE execution_id = ? AND evidence_category = ?`, [executionId, category]
    );
}

async function remove(id, exec) {
    await executor(exec).query(`DELETE FROM qa_attachments WHERE id = ?`, [id]);
}

module.exports = { findBinary, listByExecutionIds, listByExecution, create, createWithDefect, deleteByExecutionAndCategory, remove };
