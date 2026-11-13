/**
 * Histórico temporal de estados de ejecuciones de TC y hallazgos.
 *
 * Cada cambio real de estado (from !== to) se registra con el usuario, la
 * fecha y el motivo. Para FAIL/WARNING el motivo concatena el título y la
 * descripción del defecto reportado; para SKIP/BLOCK se usa la justificación
 * del salto/bloqueo. Los eventos iniciales (from_status NULL) sirven como
 * línea base para las comparaciones de re-test.
 */
const { query } = require('../../db');

const norm = (value) => (value == null ? '' : String(value).trim());

/** Arma el motivo que se guarda en el histórico según el estado. */
function buildStatusReason({ status, observations, obtained, bugs, bug_title, bug_description }) {
    const list = Array.isArray(bugs) ? bugs : [];
    if (status === 'FAIL' || status === 'WARNING') {
        const fromBugs = list
            .map((bug) => [norm(bug?.title), norm(bug?.description)].filter(Boolean).join(' — '))
            .filter(Boolean);
        if (fromBugs.length > 0) return fromBugs.join(' | ');
        const single = [norm(bug_title), norm(bug_description)].filter(Boolean).join(' — ');
        if (single) return single;
        return [norm(obtained), norm(observations)].filter(Boolean).join(' | ') || null;
    }
    if (status === 'SKIP' || status === 'BLOCK') {
        return norm(observations) || norm(obtained) || null;
    }
    return norm(obtained) || norm(observations) || null;
}

/**
 * Registra un evento de cambio de estado. Es idempotente frente a cambios
 * nulos o repetidos (no inserta si from === to).
 */
async function recordStatusChange({
    projectId,
    entityType,
    entityId,
    runId = null,
    tcId = null,
    fromStatus = null,
    toStatus,
    reason = null,
    changedBy = null,
    changedAt = null,
}) {
    if (!entityType || !entityId || !toStatus) return null;
    if (fromStatus && String(fromStatus) === String(toStatus)) return null;

    const res = await query(
        `INSERT INTO qa_status_history
            (project_id, entity_type, entity_id, run_id, tc_id,
             from_status, to_status, reason, changed_by, changed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
         RETURNING id`,
        [
            projectId || null,
            entityType,
            entityId,
            runId || null,
            tcId || null,
            fromStatus || null,
            toStatus,
            reason || null,
            changedBy || null,
            changedAt || null,
        ]
    );
    return res.rows[0]?.id ?? res.lastID ?? null;
}

/** Histórico de un TC a través de todas sus ejecuciones/re-tests. */
async function getTcStatusHistory(tcId, limit = 200) {
    const res = await query(
        `SELECT h.id, h.entity_type, h.entity_id, h.run_id, h.tc_id,
                h.from_status, h.to_status, h.reason, h.changed_at,
                u.name AS changed_by_name,
                r.name AS run_name, r.run_type
           FROM qa_status_history h
           LEFT JOIN qa_users u ON u.id = h.changed_by
           LEFT JOIN qa_test_runs r ON r.id = h.run_id
          WHERE h.tc_id = ?
          ORDER BY h.changed_at DESC, h.id DESC
          LIMIT ${Number(limit) || 200}`,
        [tcId]
    );
    return res.rows;
}

/** Histórico de un hallazgo (qa_defects sin ejecución). */
async function getHallazgoStatusHistory(hallazgoId, limit = 200) {
    const res = await query(
        `SELECT h.id, h.entity_type, h.entity_id, h.from_status, h.to_status,
                h.reason, h.changed_at, u.name AS changed_by_name
           FROM qa_status_history h
           LEFT JOIN qa_users u ON u.id = h.changed_by
          WHERE h.entity_type = 'hallazgo' AND h.entity_id = ?
          ORDER BY h.changed_at DESC, h.id DESC
          LIMIT ${Number(limit) || 200}`,
        [hallazgoId]
    );
    return res.rows;
}

/** Histórico de estados de un bug/defecto de ejecución. */
async function getDefectStatusHistory(defectId, limit = 200) {
    const res = await query(
        `SELECT h.id, h.entity_type, h.entity_id, h.from_status, h.to_status,
                h.reason, h.changed_at, u.name AS changed_by_name
           FROM qa_status_history h
           LEFT JOIN qa_users u ON u.id = h.changed_by
          WHERE h.entity_type = 'defect' AND h.entity_id = ?
          ORDER BY h.changed_at DESC, h.id DESC
          LIMIT ${Number(limit) || 200}`,
        [defectId]
    );
    return res.rows;
}

module.exports = {
    buildStatusReason,
    recordStatusChange,
    getTcStatusHistory,
    getHallazgoStatusHistory,
    getDefectStatusHistory,
};
