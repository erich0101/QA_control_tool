/**
 * Presentación del reporte de estatus (HTML autocontenido).
 *
 * Este módulo solo transforma datos ya calculados en fragmentos HTML. No hace
 * consultas ni decide métricas: esa separación permite reutilizar el mismo
 * render en otros canales (PDF, email) sin arrastrar la capa de datos.
 */

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

const STATUS_STYLE = {
    OK: { bg: '#dcfce7', fg: '#15803d', chart: '#16a34a' },
    FAIL: { bg: '#fee2e2', fg: '#dc2626', chart: '#dc2626' },
    WARNING: { bg: '#fef3c7', fg: '#b45309', chart: '#d97706' },
    BLOCK: { bg: '#fff7ed', fg: '#c2410c', chart: '#f97316' },
    SKIP: { bg: '#e5e7eb', fg: '#4b5563', chart: '#94a3b8' },
    PENDING: { bg: '#f3f4f6', fg: '#6b7280', chart: '#cbd5e1' },
};

const STATUS_ORDER = ['FAIL', 'WARNING', 'BLOCK', 'SKIP', 'OK'];
const DISTRIBUTION_ORDER = ['OK', 'FAIL', 'WARNING', 'BLOCK', 'SKIP', 'PENDING'];
const TRANSITION_ORDER = [
    'OK', 'PASS', 'FAIL', 'WARNING', 'BLOCK', 'SKIP',
    'OPEN', 'IN_PROGRESS', 'FIXED', 'CLOSED', 'WONT_FIX',
];

const TRANSITION_TONE = {
    OK: { fg: '#15803d', bg: '#dcfce7' },
    PASS: { fg: '#15803d', bg: '#dcfce7' },
    FIXED: { fg: '#15803d', bg: '#dcfce7' },
    CLOSED: { fg: '#15803d', bg: '#dcfce7' },
    FAIL: { fg: '#dc2626', bg: '#fee2e2' },
    WARNING: { fg: '#b45309', bg: '#fef3c7' },
    BLOCK: { fg: '#c2410c', bg: '#fff7ed' },
    DEFAULT: { fg: '#4b5563', bg: '#f3f4f6' },
};

const transitionTone = (status) => TRANSITION_TONE[status] || TRANSITION_TONE.DEFAULT;

const acceptanceColor = (pct) =>
    pct == null ? '#6b7280' : pct >= 80 ? '#15803d' : pct >= 50 ? '#b45309' : '#dc2626';

const sessionLink = (id) =>
    `<a href="#sesion-${id}" style="color:#4f46e5;font-weight:700;text-decoration:none;">#${id}</a>`;

const distributionBar = (statusCounts, total) => {
    const sum = DISTRIBUTION_ORDER.reduce((acc, status) => acc + (statusCounts[status] || 0), 0) || total;
    if (!sum) return '<div style="font-size:.72rem;color:#6b7280;">Sin datos para mostrar.</div>';
    return `<div style="display:flex;height:16px;border-radius:8px;overflow:hidden;background:#eef2f7;">
        ${DISTRIBUTION_ORDER.map((status) => {
            const value = statusCounts[status] || 0;
            if (!value) return '';
            return `<div title="${status}: ${value}" style="width:${(value / sum) * 100}%;background:${STATUS_STYLE[status].chart};"></div>`;
        }).join('')}
    </div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;">
        ${DISTRIBUTION_ORDER.map((status) => {
            const value = statusCounts[status] || 0;
            const pct = sum > 0 ? Math.round((value / sum) * 100) : 0;
            return `<div style="display:flex;align-items:center;gap:6px;font-size:.7rem;color:#4b5563;">
                <span style="width:9px;height:9px;border-radius:50%;background:${STATUS_STYLE[status].chart};"></span>
                <strong style="color:#111827;">${value}</strong>
                <span>${status} (${pct}%)</span>
            </div>`;
        }).join('')}
    </div>`;
};

const sessionDonut = (statusCounts, total) => {
    const size = 78;
    const radius = 30;
    const center = 39;
    const stroke = 11;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    const rings = DISTRIBUTION_ORDER.map((status) => {
        const value = statusCounts[status] || 0;
        const length = total > 0 ? (value / total) * circumference : 0;
        if (!length) return '';
        const ring = `<circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${STATUS_STYLE[status].chart}" stroke-width="${stroke}" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${center} ${center})"></circle>`;
        offset += length;
        return ring;
    }).join('');
    const okPct = total > 0 ? Math.round(((statusCounts.OK || 0) / total) * 100) : 0;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Estado general de la sesión">
        <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="#eef2f7" stroke-width="${stroke}"></circle>
        ${rings}
        <text x="${center}" y="${center - 2}" text-anchor="middle" font-size="14" font-weight="800" fill="#111827">${okPct}%</text>
        <text x="${center}" y="${center + 10}" text-anchor="middle" font-size="7" fill="#6b7280">OK</text>
    </svg>`;
};

const acceptanceBar = (label, pct) => {
    const color = acceptanceColor(pct);
    const width = pct == null ? 0 : pct;
    return `<div style="min-width:150px;flex:1;">
        <div style="display:flex;justify-content:space-between;gap:8px;font-size:.62rem;color:#6b7280;">
            <span>${escapeHtml(label)}</span>
            <strong style="color:${color};">${pct == null ? '—' : `${pct}%`}</strong>
        </div>
        <div style="height:6px;border-radius:3px;background:#eef2f7;overflow:hidden;margin-top:2px;">
            <div style="width:${width}%;height:100%;background:${color};"></div>
        </div>
    </div>`;
};

const transitionsTable = (rows, entityType) => {
    const filtered = rows.filter((row) => row.entity_type === entityType);
    if (filtered.length === 0) {
        return '<div style="font-size:.72rem;color:#6b7280;">Sin cambios de estado registrados en el rango.</div>';
    }
    const orderIndex = (status) => {
        const index = TRANSITION_ORDER.indexOf(status);
        return index === -1 ? TRANSITION_ORDER.length : index;
    };
    const froms = [...new Set(filtered.map((row) => row.prev_status))].sort((a, b) => orderIndex(a) - orderIndex(b));
    const tos = [...new Set(filtered.map((row) => row.to_status))].sort((a, b) => orderIndex(a) - orderIndex(b));
    const cell = (from, to) => filtered.find((row) => row.prev_status === from && row.to_status === to)?.total || 0;
    return `<table style="width:100%;border-collapse:collapse;font-size:.66rem;">
        <thead>
            <tr>
                <th style="text-align:left;padding:4px 6px;color:#6b7280;font-weight:700;border-bottom:1px solid #e5e7eb;">Desde / Hacia</th>
                ${tos.map((to) => `<th style="padding:4px 6px;color:#6b7280;font-weight:700;border-bottom:1px solid #e5e7eb;">${escapeHtml(to)}</th>`).join('')}
            </tr>
        </thead>
        <tbody>
            ${froms.map((from) => `<tr>
                <td style="padding:4px 6px;font-weight:700;border-bottom:1px solid #f3f4f6;">${escapeHtml(from)}</td>
                ${tos.map((to) => {
                    const value = cell(from, to);
                    return `<td style="padding:4px 6px;text-align:center;border-bottom:1px solid #f3f4f6;${value ? 'font-weight:700;color:#111827;' : 'color:#d1d5db;'}">${value || '·'}</td>`;
                }).join('')}
            </tr>`).join('')}
        </tbody>
    </table>`;
};

const distributionSection = ({
    rangeCounts,
    rangeTotal,
    accumulatedCounts,
    accumulatedTotal,
}) => `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-bottom:18px;">
    <div style="font-size:.64rem;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;">Distribución de resultados</div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;margin:8px 0 6px;">
        <div style="font-size:.7rem;font-weight:700;color:#4b5563;">Actividad del rango</div>
        <div style="font-size:.66rem;color:#6b7280;">${rangeTotal} ejecución(es) con resultado en el rango</div>
    </div>
    ${distributionBar(rangeCounts, rangeTotal)}
    <div style="margin-top:14px;border-top:1px dashed #e5e7eb;padding-top:10px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:6px;">
            <div style="font-size:.7rem;font-weight:700;color:#4b5563;">Estado acumulado de las sesiones incluidas</div>
            <div style="font-size:.66rem;color:#6b7280;">${accumulatedTotal} TC · incluye PENDING</div>
        </div>
        ${distributionBar(accumulatedCounts, accumulatedTotal)}
    </div>
</div>`;

module.exports = {
    STATUS_STYLE,
    STATUS_ORDER,
    DISTRIBUTION_ORDER,
    acceptanceColor,
    sessionLink,
    transitionTone,
    distributionBar,
    distributionSection,
    sessionDonut,
    acceptanceBar,
    transitionsTable,
};
