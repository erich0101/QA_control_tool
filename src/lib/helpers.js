/**
 * Helpers de saneamiento y normalización usados por rutas, imports y reportes.
 */

/** Escapa tags y previene inyección de fórmulas en Excel/CSV. */
function sanitizeInput(val) {
    if (val === null || val === undefined) return '';
    let str = String(val).trim();

    // 1. Prevenir XSS básico (reemplazar etiquetas HTML)
    str = str.replace(/<[^>]*>?/gm, '');

    // 2. Prevenir Excel/CSV Formula Injection
    // Si empieza con =, +, -, @, le anteponemos una comilla simple
    if (['=', '+', '-', '@'].includes(str[0])) {
        str = "'" + str;
    }

    return str;
}

/** Normaliza el estado de Jira a los 4 buckets que usa el dashboard. */
function normalizeStatus(name, cat) {
    const n = (name || '').toLowerCase();
    const c = cat || '';
    if (c === 'new' || n.includes('to do') || n.includes('por hacer') || n.includes('tareas')) return 'To Do';
    if (c === 'indeterminate' || n.includes('progress') || n.includes('curso') || n.includes('desarrollo') || n.includes('en curso')) return 'In Progress';
    if (n.includes('review') || n.includes('revisión') || n.includes('revisar') || n.includes('en revisión')) return 'In Review';
    if (c === 'done' || n.includes('done') || n.includes('finaliz') || n.includes('cerrad') || n.includes('resolved')) return 'Done';
    return 'Other';
}

/** ¿La transición de estado de Jira corresponde al bucket pedido? */
function matchTransition(toName, targetStatus) {
    const n = (toName || '').toLowerCase();
    if (targetStatus === 'To Do') return n.includes('to do') || n.includes('por hacer') || n.includes('tareas');
    if (targetStatus === 'In Progress') return n.includes('progress') || n.includes('curso') || n.includes('desarrollo') || n.includes('en curso');
    if (targetStatus === 'In Review') return n.includes('review') || n.includes('revisión') || n.includes('revisar') || n.includes('en revisión');
    return false;
}

/** Última fecha en que el issue entró al estado indicado (según changelog). */
function getLastStatusChange(issue, targetStatus) {
    const histories = issue.changelog?.histories || [];
    let lastDate = null;
    histories.forEach(h => {
        h.items.forEach(item => {
            if (item.field === 'status') {
                const toName = item.toString || '';
                if (matchTransition(toName, targetStatus)) {
                    const d = new Date(h.created);
                    if (!lastDate || d > lastDate) lastDate = d;
                }
            }
        });
    });
    return lastDate;
}

module.exports = { sanitizeInput, normalizeStatus, matchTransition, getLastStatusChange };
