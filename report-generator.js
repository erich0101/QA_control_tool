const { query } = require('./db');

const ICONS = {
    dashboard: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>',
    folder: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
    check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    fail: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
    warn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    external: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>',
    rocket: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"></path><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"></path></svg>',
};

// ══════════════════════════════════════════════════════════════
// ── DATA FETCHING HELPERS ──
// ══════════════════════════════════════════════════════════════

async function fetchRunData(runId) {
    const runRes = await query(`
        SELECT r.*, s.title as suite_title, cu.title as cu_title, p.id as project_id, p.name as project_name, u.name as auditor_name
        FROM qa_test_runs r
        JOIN qa_test_suites s ON r.suite_id = s.id
        JOIN qa_use_cases cu ON s.use_case_id = cu.id
        JOIN qa_projects p ON cu.project_id = p.id
        JOIN qa_users u ON r.created_by = u.id
        WHERE r.id = ?
    `, [runId]);
    if (runRes.rows.length === 0) throw new Error('Ejecución no encontrada');
    return runRes.rows[0];
}

async function fetchRunsDataBatch(runIds) {
    if (!runIds.length) return [];
    const rows = await query(`
        SELECT r.*, s.title as suite_title, cu.title as cu_title, p.id as project_id, p.name as project_name, u.name as auditor_name
        FROM qa_test_runs r
        JOIN qa_test_suites s ON r.suite_id = s.id
        JOIN qa_use_cases cu ON s.use_case_id = cu.id
        JOIN qa_projects p ON cu.project_id = p.id
        JOIN qa_users u ON r.created_by = u.id
        WHERE r.id = ANY(?)
        ORDER BY r.finished_at DESC
    `, [runIds]);
    return rows.rows;
}

async function fetchHUsForRun(runId) {
    const husRes = await query(`
        SELECT DISTINCT cu.id, cu.title, cu.key_id
        FROM qa_use_cases cu
        JOIN qa_test_suites s ON s.use_case_id = cu.id
        JOIN qa_test_cases tc ON tc.suite_id = s.id
        JOIN qa_executions e ON e.tc_id = tc.id
        WHERE e.run_id = ?
        ORDER BY cu.id
    `, [runId]);
    return husRes.rows;
}

async function fetchExecutionsWithMedia(runId) {
    const allTests = await query(`
        SELECT tc.*, s.use_case_id as hus_id, e.status, e.observations, e.obtained_result, e.id as exec_id, e.executed_at
        FROM qa_executions e
        JOIN qa_test_cases tc ON e.tc_id = tc.id
        JOIN qa_test_suites s ON tc.suite_id = s.id
        WHERE e.run_id = ?
        ORDER BY tc.id
    `, [runId]);

    const testsWithMedia = [];
    for (let tc of allTests.rows) {
        if (tc.exec_id) {
            const atts = await query(`SELECT id, execution_id, defect_id, file_name, mime_type, evidence_category, encode(file_data, 'base64') as file_data, created_at FROM qa_attachments WHERE execution_id = ?`, [tc.exec_id]);
            tc.attachments = atts.rows.map(a => ({ mime_type: a.mime_type, category: a.evidence_category, data: a.file_data }));
            const defects = await query(`SELECT * FROM qa_defects WHERE execution_id = ?`, [tc.exec_id]);
            tc.defects = defects.rows;
        } else {
            tc.attachments = [];
            tc.defects = [];
        }
        testsWithMedia.push(tc);
    }
    return testsWithMedia;
}

function computeStats(hus, executions) {
    const huStats = hus.map(hu => {
        const tests = executions.filter(r => r.hus_id === hu.id);
        const pass = tests.filter(t => t.status === 'OK' || t.status === 'PASS').length;
        const total = tests.length;
        const score = total > 0 ? Math.round((pass / total) * 100) : 100;
        return { ...hu, total, pass, score };
    });

    const totalTests = executions.length;
    const totalPass = executions.filter(t => t.status === 'OK' || t.status === 'PASS').length;
    const totalFail = executions.filter(t => t.status === 'FAIL').length;
    const totalPending = executions.filter(t => !t.status || t.status === 'PENDING').length;
    const globalHealth = totalTests > 0 ? Math.round((totalPass / totalTests) * 100) : 100;

    return { huStats, totalTests, totalPass, totalFail, totalPending, globalHealth };
}

// ══════════════════════════════════════════════════════════════
// ── SHARED CSS (reused by both report types) ──
// ══════════════════════════════════════════════════════════════

const SHARED_CSS = `
        :root {
            --bg: #f2f2f7; --surface: #ffffff; --sidebar: #1c1c1e; --brand: #007AFF; --brand-soft: rgba(0, 122, 255, 0.08);
            --text-main: #1d1d1f; --text-muted: #6e6e73; --ok: #34C759; --fail: #FF3B30; --warn: #FF9500;
            --border: rgba(0, 0, 0, 0.08); --radius: 12px; --shadow: 0 2px 12px rgba(0,0,0,0.04);
        }
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif; background: var(--bg); color: var(--text-main); margin: 0; display: flex; height: 100vh; overflow: hidden; }

        aside { width: 300px; background: var(--sidebar); color: white; display: flex; flex-direction: column; flex-shrink: 0; z-index: 100; }
        .sidebar-header { padding: 40px 24px; }
        .sidebar-brand { font-size: 0.9rem; font-weight: 600; letter-spacing: 0.02em; color: rgba(255,255,255,0.7); }
        .sidebar-nav { flex: 1; overflow-y: auto; padding: 0 16px; }
        .nav-group-title { padding: 32px 12px 12px; font-size: 0.65rem; font-weight: 700; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.08em; }
        .nav-item { 
            padding: 10px 14px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 12px; margin-bottom: 4px; 
            transition: all 0.15s ease; font-size: 0.82rem; font-weight: 500; border: 1px solid transparent;
        }
        .nav-item:hover { background: rgba(255,255,255,0.06); }
        .nav-item.active { background: var(--brand-soft); color: white; border-color: rgba(255,255,255,0.08); }
        .nav-item-status { margin-left: auto; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; }
        .nav-item-status.ok { background: var(--ok); color: white; }

        main { flex: 1; overflow-y: auto; display: flex; flex-direction: column; position: relative; }
        .top-bar { padding: 16px 32px; display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.72); backdrop-filter: blur(20px) saturate(180%); position: sticky; top: 0; z-index: 50; border-bottom: 1px solid rgba(0,0,0,0.06); }
        .top-bar-title { font-size: 0.75rem; font-weight: 600; color: var(--text-muted); }

        .content-wrap { padding: 40px; max-width: 1400px; margin: 0 auto; width: 100%; }

        .header-meta { margin-bottom: 32px; }
        .date-pill { display: inline-flex; align-items: center; gap: 8px; padding: 5px 12px; background: white; border-radius: 20px; font-size: 0.72rem; font-weight: 600; color: var(--text-muted); border: 1px solid var(--border); margin-bottom: 12px; }
        .main-title { font-size: 1.5rem; font-weight: 700; margin: 0; letter-spacing: -0.01em; color: var(--text-main); }

        .bento-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 40px; }
        .bento-card { background: white; border-radius: var(--radius); border: 1px solid var(--border); padding: 24px; box-shadow: var(--shadow); position: relative; overflow: hidden; }
        .bento-label { font-size: 0.68rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 10px; }
        .bento-value { font-size: 2rem; font-weight: 700; margin-bottom: 12px; display: block; }
        .health-bar { height: 4px; background: rgba(0,0,0,0.06); border-radius: 2px; overflow: hidden; }
        .health-bar-fill { height: 100%; transition: width 1s ease-out; }

        .audit-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; padding: 20px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); margin-bottom: 40px; }
        .audit-info-item label { font-size: 0.68rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; display: block; margin-bottom: 4px; }
        .audit-info-item span { font-weight: 600; font-size: 0.85rem; color: var(--text-main); }
        .audit-info-item a { color: var(--brand); text-decoration: none; display: inline-flex; align-items: center; gap: 4px; }

        .section-title { font-size: 1rem; font-weight: 700; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
        .module-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
        .module-card { background: white; border-radius: var(--radius); border: 1px solid var(--border); padding: 20px; transition: all 0.15s ease; cursor: pointer; }
        .module-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.06); border-color: var(--brand); }
        .module-card-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
        .module-card-title { font-size: 0.85rem; font-weight: 600; flex: 1; }
        .module-card-stats { text-align: right; font-size: 0.68rem; font-weight: 600; color: var(--text-muted); }

        .hu-header-card { background: white; border-radius: var(--radius); border: 1px solid var(--border); padding: 24px; display: flex; align-items: center; gap: 20px; margin-bottom: 32px; box-shadow: var(--shadow); }
        .hu-icon-box { width: 56px; height: 56px; background: var(--text-main); border-radius: 14px; display: flex; align-items: center; justify-content: center; color: white; }
        .hu-title-box h2 { margin: 0; font-size: 1.1rem; font-weight: 700; }

        .tc-group { margin-bottom: 32px; }
        .tc-group-title { font-size: 0.72rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 8px; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
        .tc-item { background: white; border-radius: 10px; border: 1px solid var(--border); padding: 18px; margin-bottom: 12px; transition: all 0.15s ease; }
        .tc-item:hover { border-color: rgba(0,122,255,0.3); }
        .tc-row { display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 1px solid var(--border); margin-bottom: 12px; }
        .tc-title { font-size: 0.92rem; font-weight: 600; flex: 1; color: var(--text-main); }
        .tc-id { font-weight: 700; color: var(--brand); margin-right: 12px; font-size: 0.82rem; }

        .exec-section { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border); }
        .exec-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 20px; font-size: 0.62rem; font-weight: 700; margin-bottom: 10px; }
        .exec-badge.orig { background: var(--brand-soft); color: var(--brand); }
        .exec-badge.retest { background: rgba(52, 199, 89, 0.08); color: var(--ok); }

        .media-section { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); }
        .media-title { font-size: 0.68rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 12px; }
        .media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
        .media-card { background: #000; border-radius: 8px; overflow: hidden; border: 1px solid var(--border); }
        .media-card img, .media-card video { width: 100%; display: block; max-height: 180px; object-fit: cover; }
        .media-card video { background: #000; }

        .right-index { width: 280px; padding: 40px 20px; border-left: 1px solid var(--border); background: rgba(255,255,255,0.5); overflow-y: auto; flex-shrink: 0; }
        .index-title { font-size: 0.68rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 20px; }
        .index-group { margin-bottom: 28px; }
        .index-group-title { font-size: 0.68rem; font-weight: 700; color: var(--brand); margin-bottom: 10px; text-transform: uppercase; opacity: 0.8; }
        .index-link { display: block; font-size: 0.72rem; color: var(--text-muted); text-decoration: none; margin-bottom: 6px; line-height: 1.4; padding: 4px 0; }
        .index-link:hover { color: var(--brand); }

        .hidden { display: none !important; }

        .lightbox {
            position: fixed; inset: 0; background: rgba(0,0,0,0.92);
            display: none; align-items: center; justify-content: center;
            z-index: 10000; cursor: zoom-out; backdrop-filter: blur(20px);
        }
        .lightbox.active { display: flex; }
        .lightbox img {
            max-width: 95%; max-height: 95%; border-radius: 10px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            transform: scale(0.9); transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .lightbox.active img { transform: scale(1); }

        /* Multi-report tabs - macOS Style */
        .multi-body { display: block; height: auto; overflow: auto; }
        .multi-top-bar { padding: 12px 24px; display: flex; gap: 24px; align-items: center; flex-wrap: wrap; background: rgba(255,255,255,0.72); backdrop-filter: blur(20px) saturate(180%); border-bottom: 1px solid rgba(0,0,0,0.06); position: sticky; top: 0; z-index: 100; }
        .multi-top-bar-title { font-size: 0.9rem; font-weight: 700; white-space: nowrap; color: var(--text-main); }
        .tab-pills { display: flex; gap: 6px; flex-wrap: wrap; }
        .tab-pill { padding: 6px 14px; border-radius: 20px; border: 1px solid var(--border); background: white; color: var(--text-muted); font-size: 0.72rem; font-weight: 500; cursor: pointer; transition: all 0.15s ease; white-space: nowrap; }
        .tab-pill:hover { background: var(--brand-soft); color: var(--brand); border-color: transparent; }
        .tab-pill.active { background: var(--brand); color: white; border-color: transparent; box-shadow: 0 2px 8px rgba(0,122,255,0.3); }
        .tab-content { padding: 32px; max-width: 1400px; margin: 0 auto; }
        .tab-panel { display: none; }
        .tab-panel.active { display: block; }

        .summary-table { width: 100%; border-collapse: collapse; background: white; border-radius: var(--radius); border: 1px solid var(--border); overflow: hidden; box-shadow: var(--shadow); margin-bottom: 24px; }
        .summary-table th { background: var(--bg); padding: 10px 14px; font-size: 0.68rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; text-align: left; border-bottom: 1px solid var(--border); }
        .summary-table td { padding: 12px 14px; font-size: 0.8rem; border-bottom: 1px solid var(--border); }
        .summary-table tr:last-child td { border-bottom: none; }
        .summary-table tr:hover td { background: var(--brand-soft); cursor: pointer; }
        .health-evo { display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 0.75rem; padding: 3px 10px; border-radius: 20px; }
        .health-evo.up { color: var(--ok); background: rgba(52, 199, 89, 0.08); }
        .health-evo.down { color: var(--fail); background: rgba(255, 59, 48, 0.08); }
        .health-evo.same { color: var(--text-muted); background: rgba(0,0,0,0.04); }

        .retest-label { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 0.6rem; font-weight: 700; text-transform: uppercase; }
        .retest-label.orig { background: var(--brand-soft); color: var(--brand); }
        .retest-label.retest { background: rgba(52, 199, 89, 0.08); color: var(--ok); }
`;

// ══════════════════════════════════════════════════════════════
// ── SHARED RENDERERS ──
// ══════════════════════════════════════════════════════════════

function renderEvidenceMedia(attachments) {
    if (!attachments || attachments.length === 0) return '';
    return `
        <div class="media-section">
            <div class="media-title">📷 Evidencia Multimedia</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;">
                ${attachments.map(a => {
                    const isVideo = a.mime_type.startsWith('video/');
                    if (isVideo) {
                        return `
                            <div class="media-card" style="border-radius:8px;">
                                <video controls preload="metadata" onclick="zoomVideo(this.querySelector('source').src, '${a.mime_type}')" style="cursor:zoom-in;max-height:180px;object-fit:cover;width:100%;">
                                    <source src="data:${a.mime_type};base64,${a.data}" type="${a.mime_type}">
                                </video>
                            </div>`;
                    }
                    return `
                        <div class="media-card" style="border-radius:8px;">
                            <img src="data:${a.mime_type};base64,${a.data}" onclick="zoomImage(this.src)" style="cursor:zoom-in;max-height:180px;object-fit:cover;width:100%;">
                        </div>`;
                }).join('')}
            </div>
        </div>`;
}

function renderDefectDetail(defect) {
    if (!defect) return '';
    return `
        <div style="margin-top: 16px; border: 1px solid rgba(255,59,48,0.12); border-radius: 10px; overflow: hidden; background: white;">
            <div style="background: rgba(255,59,48,0.06); padding: 10px 16px; font-size: 0.68rem; font-weight: 700; color: var(--fail); text-transform: uppercase; letter-spacing: 0.04em; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,59,48,0.08);">
                <span>🐞 Detalle de Defecto</span>
                <span style="opacity: 0.7;">#${defect.id}</span>
            </div>
            <div style="padding: 16px;">
                <div style="margin-bottom: 14px;">
                    <label style="font-size: 0.68rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; display: block; margin-bottom: 4px;">Título</label>
                    <div style="font-size: 0.92rem; font-weight: 700; color: var(--fail);">${defect.title}</div>
                </div>
                ${defect.description ? `
                <div style="margin-bottom: 14px;">
                    <label style="font-size: 0.68rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; display: block; margin-bottom: 4px;">Descripción</label>
                    <div style="font-size: 0.85rem; line-height: 1.5; color: var(--text-main); background: var(--bg); padding: 10px 12px; border-radius: 6px;">${defect.description}</div>
                </div>` : ''}
                ${defect.steps_to_reproduce ? `
                <div style="margin-bottom: 14px;">
                    <label style="font-size: 0.68rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; display: block; margin-bottom: 4px;">Pasos para Reproducir</label>
                    <div style="font-size: 0.85rem; line-height: 1.5; color: var(--text-main); background: var(--bg); padding: 10px 12px; border-radius: 6px;">${defect.steps_to_reproduce}</div>
                </div>` : ''}
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
                    <div style="background: rgba(52,199,89,0.04); border: 1px solid rgba(52,199,89,0.12); padding: 10px 12px; border-radius: 6px;">
                        <label style="font-size: 0.65rem; font-weight: 700; color: var(--ok); text-transform: uppercase; display: block; margin-bottom: 4px;">Resultado Esperado</label>
                        <div style="font-size: 0.85rem; line-height: 1.4;">${defect.expected_result || '—'}</div>
                    </div>
                    <div style="background: rgba(255,59,48,0.04); border: 1px solid rgba(255,59,48,0.12); padding: 10px 12px; border-radius: 6px;">
                        <label style="font-size: 0.65rem; font-weight: 700; color: var(--fail); text-transform: uppercase; display: block; margin-bottom: 4px;">Resultado Real</label>
                        <div style="font-size: 0.85rem; line-height: 1.4;">${defect.actual_result || '—'}</div>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px;">
                    <div><label style="font-size: 0.65rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; display: block; margin-bottom: 3px;">Severidad</label><span style="font-size: 0.85rem; font-weight: 700; color: var(--fail);">${defect.severity || '—'}</span></div>
                    <div><label style="font-size: 0.65rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; display: block; margin-bottom: 3px;">Frecuencia</label><span style="font-size: 0.85rem; font-weight: 600; color: var(--text-main);">${defect.frequency || '—'}</span></div>
                    <div><label style="font-size: 0.65rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; display: block; margin-bottom: 3px;">Impacto</label><span style="font-size: 0.85rem; font-weight: 600; color: var(--text-main);">${defect.business_impact || '—'}</span></div>
                </div>
            </div>
        </div>`;
}

function renderExecutionDetail(tc, label, labelClass, showDate) {
    const statusColor = tc.status === 'OK' || tc.status === 'PASS' ? 'var(--ok)' : tc.status === 'FAIL' ? 'var(--fail)' : 'var(--warn)';
    const statusBg = tc.status === 'OK' || tc.status === 'PASS' ? 'rgba(16, 185, 129, 0.1)' : tc.status === 'FAIL' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)';
    const statusIcon = tc.status === 'OK' || tc.status === 'PASS' ? ICONS.check : tc.status === 'FAIL' ? ICONS.fail : ICONS.warn;

    return `
        <div class="exec-section">
            <div class="exec-badge ${labelClass}">
                ${label}
                ${showDate && tc.executed_at ? `<span style="opacity:0.7;font-weight:500;">· 📅 ${new Date(tc.executed_at).toLocaleString()}</span>` : ''}
            </div>
            <div style="margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div style="background: #f8fafc; border-left: 3px solid var(--brand); padding: 12px; border-radius: 4px;">
                    <div style="font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">Resultado Esperado</div>
                    <div style="font-size: 0.85rem; line-height: 1.4;">${tc.expected_result || tc.tc_expected || '—'}</div>
                </div>
                <div style="background: ${tc.status === 'OK' || tc.status === 'PASS' ? '#f0fdf4' : '#fff1f2'}; border-left: 3px solid ${statusColor}; padding: 12px; border-radius: 4px;">
                    <div style="font-size: 0.65rem; font-weight: 800; color: ${statusColor}; text-transform: uppercase; margin-bottom: 4px;">Resultado Real</div>
                    <div style="font-size: 0.85rem; line-height: 1.4;">${tc.obtained_result || 'No se registró un resultado detallado.'}</div>
                </div>
            </div>
            ${tc.observations ? `
                <div style="margin-top: 16px; background: #fffbeb; border: 1px solid #fde68a; padding: 12px; border-radius: 8px;">
                    <div style="font-size: 0.65rem; font-weight: 800; color: #b45309; text-transform: uppercase; margin-bottom: 4px;">Observaciones del Tester</div>
                    <div style="font-size: 0.85rem; line-height: 1.4; color: #92400e;">${tc.observations}</div>
                </div>` : ''}
            ${tc.defects && tc.defects.length > 0 ? renderDefectDetail(tc.defects[0]) : ''}
            ${renderEvidenceMedia(tc.attachments)}
        </div>`;
}

function renderDashboard(run, huStats, testsWithMedia, totalTests, totalPass, totalFail, totalPending, globalHealth) {
    return `
        <div class="top-bar">
            <div class="top-bar-title">Reporte de Auditoría</div>
        </div>
        <div class="content-wrap">
            <div id="view-dashboard" class="view-content">
                <div class="header-meta">
                    <div class="date-pill">📅 ${new Date(run.finished_at || Date.now()).toLocaleString()}</div>
                    <h1 class="main-title">${run.project_name}</h1>
                </div>
                <div class="bento-grid">
                    <div class="bento-card">
                        <div class="bento-label">Health Score</div>
                        <span class="bento-value" style="color: var(--ok)">${globalHealth}%</span>
                        <div class="health-bar"><div class="health-bar-fill" style="background: var(--ok); width: ${globalHealth}%"></div></div>
                    </div>
                    <div class="bento-card">
                        <div class="bento-label">Total Escenarios</div>
                        <span class="bento-value">${totalTests}</span>
                    </div>
                    <div class="bento-card">
                        <div class="bento-label">Estado de Ejecución</div>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <div style="display: flex; align-items: baseline; gap: 8px;">
                                <span style="font-size: 1.5rem; font-weight: 900; color: var(--fail);">${totalFail}</span>
                                <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted);">Fallos</span>
                            </div>
                            <div style="display: flex; gap: 24px; font-size: 0.7rem; font-weight: 700; color: var(--text-muted); opacity: 0.8; margin-top: 4px;">
                                <span>0 Alertas</span><span>${totalPending} Pendientes</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="audit-info-grid">
                    <div class="audit-info-item"><label>AUDITOR:</label><span>${run.auditor_name}</span></div>
                    <div class="audit-info-item"><label>AMBIENTE:</label><span><a href="#">Acceso al Sistema ${ICONS.external}</a></span></div>
                </div>
                <div class="section-title">Estado de Salud por Módulo / HU<span style="font-size: 0.65rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">${huStats.length} MÓDULOS AUDITADOS</span></div>
                <div class="module-grid">
                    ${huStats.map(hu => `
                        <div class="module-card" onclick="switchView('hu-${hu.id}')">
                            <div class="module-card-header">
                                ${ICONS.folder}
                                <div class="module-card-title">${hu.title}</div>
                                <div class="module-card-stats">${hu.total} Tests<br><span style="color: ${hu.score === 100 ? 'var(--ok)' : 'var(--text-muted)'}">${hu.score === 100 ? 'Todo OK' : 'En proceso'}</span></div>
                            </div>
                            <div class="health-bar"><div class="health-bar-fill" style="background: var(--ok); width: ${hu.score}%"></div></div>
                            ${hu.score === 100 ? `<div style="text-align:right; margin-top:8px; color:var(--ok);">${ICONS.check}</div>` : ''}
                        </div>`).join('')}
                </div>
            </div>
            ${huStats.map(hu => {
                const huTests = testsWithMedia.filter(t => t.hus_id === hu.id);
                return `
                <div id="view-hu-${hu.id}" class="view-content hidden">
                    <div class="header-meta">
                        <div class="date-pill">📅 ${new Date(run.finished_at || Date.now()).toLocaleString()}</div>
                        <h1 class="main-title">${run.project_name}</h1>
                    </div>
                    <div class="hu-header-card">
                        <div class="hu-icon-box">${ICONS.rocket}</div>
                        <div class="hu-title-box">
                            <h2>${hu.title}</h2>
                            <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); margin-top: 4px;">ID: ${hu.key_id || 'HU-00'}</div>
                        </div>
                    </div>
                    <div class="tc-group">
                        <div class="tc-group-title">▼ EJECUCIÓN DE PRUEBAS AUDITADAS</div>
                        ${huTests.map(tc => {
                            const tcStatus = tc.status || 'PENDING';
                            return `
                            <div class="tc-item" id="tc-anchor-${tc.id}">
                                <div class="tc-row">
                                    <div class="tc-id">TC - ${tc.key_id?.split('-')[1] || tc.id}</div>
                                    <div class="tc-title">${tc.title}</div>
                                    <div class="nav-item-status" style="background:${tcStatus === 'OK' || tcStatus === 'PASS' ? 'rgba(16, 185, 129, 0.1)' : tcStatus === 'FAIL' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)'}; color:${tcStatus === 'OK' || tcStatus === 'PASS' ? 'var(--ok)' : tcStatus === 'FAIL' ? 'var(--fail)' : 'var(--warn)'};">
                                        ${tcStatus === 'OK' || tcStatus === 'PASS' ? ICONS.check : tcStatus === 'FAIL' ? ICONS.fail : ICONS.warn}
                                    </div>
                                </div>
                                <div style="margin-top: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                                    <div style="background: #f8fafc; border-left: 3px solid var(--brand); padding: 12px; border-radius: 4px;">
                                        <div style="font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">Resultado Esperado</div>
                                        <div style="font-size: 0.85rem; line-height: 1.4;">${tc.expected_result || tc.tc_expected || '—'}</div>
                                    </div>
                                    <div style="background: ${tcStatus === 'OK' || tcStatus === 'PASS' ? '#f0fdf4' : '#fff1f2'}; border-left: 3px solid ${tcStatus === 'OK' || tcStatus === 'PASS' ? 'var(--ok)' : 'var(--fail)'}; padding: 12px; border-radius: 4px;">
                                        <div style="font-size: 0.65rem; font-weight: 800; color: ${tcStatus === 'OK' || tcStatus === 'PASS' ? 'var(--ok)' : 'var(--fail)'}; text-transform: uppercase; margin-bottom: 4px;">Resultado Real</div>
                                        <div style="font-size: 0.85rem; line-height: 1.4;">${tc.obtained_result || 'No se registró un resultado detallado.'}</div>
                                    </div>
                                </div>
                                ${tc.observations ? `<div style="margin-top: 16px; background: #fffbeb; border: 1px solid #fde68a; padding: 12px; border-radius: 8px;"><div style="font-size: 0.65rem; font-weight: 800; color: #b45309; text-transform: uppercase; margin-bottom: 4px;">Observaciones del Tester</div><div style="font-size: 0.85rem; line-height: 1.4; color: #92400e;">${tc.observations}</div></div>` : ''}
                                ${tc.defects && tc.defects.length > 0 ? renderDefectDetail(tc.defects[0]) : ''}
                                ${renderEvidenceMedia(tc.attachments)}
                            </div>`;
                        }).join('')}
                    </div>
                </div>`;
            }).join('')}
        </div>`;
}

// ══════════════════════════════════════════════════════════════
// ── SUITE-GROUPED DATA FOR MULTI REPORT ──
// ══════════════════════════════════════════════════════════════

async function fetchSuiteGroupedData(runIds) {
    const runs = await fetchRunsDataBatch(runIds);
    if (runs.length === 0) throw new Error('No se encontraron ejecuciones');

    // Group runs by suite_id
    const suiteMap = {};
    for (const run of runs) {
        if (!suiteMap[run.suite_id]) {
            suiteMap[run.suite_id] = { suite_id: run.suite_id, suite_title: run.suite_title, runs: [] };
        }
        suiteMap[run.suite_id].runs.push(run);
    }

    const suites = [];
    for (const [suiteId, group] of Object.entries(suiteMap)) {
        const runsSorted = group.runs.sort((a, b) => new Date(a.finished_at) - new Date(b.finished_at));
        const origRun = runsSorted.find(r => !r.parent_run_id || r.run_type !== 'RETEST') || runsSorted[0];
        const retestRun = runsSorted.find(r => r.parent_run_id && r.run_type === 'RETEST');

        // Get all test cases for this suite
        const allTCs = await query(`SELECT * FROM qa_test_cases WHERE suite_id = ? ORDER BY id`, [suiteId]);

        const tcsWithExecutions = [];
        for (const tc of allTCs.rows) {
            // Original execution
            const origExec = await query(
                `SELECT * FROM qa_executions WHERE tc_id = ? AND run_id = ? ORDER BY id DESC LIMIT 1`,
                [tc.id, origRun.id]
            );

            // Retest execution (if exists)
            let retestExec = null;
            if (retestRun) {
                const rExec = await query(
                    `SELECT * FROM qa_executions WHERE tc_id = ? AND run_id = ? ORDER BY id DESC LIMIT 1`,
                    [tc.id, retestRun.id]
                );
                if (rExec.rows.length > 0) retestExec = rExec.rows[0];
            }

            const origData = origExec.rows.length > 0 ? origExec.rows[0] : null;
            const enriched = {
                ...tc,
                orig_status: origData ? origData.status : null,
                orig_observations: origData ? origData.observations : null,
                orig_obtained_result: origData ? origData.obtained_result : null,
                orig_executed_at: origData ? origData.executed_at : null,
                orig_exec_id: origData ? origData.id : null,
                retest_status: retestExec ? retestExec.status : null,
                retest_observations: retestExec ? retestExec.observations : null,
                retest_obtained_result: retestExec ? retestExec.obtained_result : null,
                retest_executed_at: retestExec ? retestExec.executed_at : null,
                retest_exec_id: retestExec ? retestExec.id : null,
            };

            // Load attachments & defects for both executions
            if (enriched.orig_exec_id) {
                const origAtts = await query(`SELECT id, execution_id, defect_id, file_name, mime_type, evidence_category, encode(file_data, 'base64') as file_data, created_at FROM qa_attachments WHERE execution_id = ?`, [enriched.orig_exec_id]);
                enriched.orig_attachments = origAtts.rows.map(a => ({ mime_type: a.mime_type, category: a.evidence_category, data: a.file_data }));
                const origDefs = await query(`SELECT * FROM qa_defects WHERE execution_id = ?`, [enriched.orig_exec_id]);
                enriched.orig_defects = origDefs.rows;
            } else {
                enriched.orig_attachments = [];
                enriched.orig_defects = [];
            }

            if (enriched.retest_exec_id) {
                const retAtts = await query(`SELECT id, execution_id, defect_id, file_name, mime_type, evidence_category, encode(file_data, 'base64') as file_data, created_at FROM qa_attachments WHERE execution_id = ?`, [enriched.retest_exec_id]);
                enriched.retest_attachments = retAtts.rows.map(a => ({ mime_type: a.mime_type, category: a.evidence_category, data: a.file_data }));
                const retDefs = await query(`SELECT * FROM qa_defects WHERE execution_id = ?`, [enriched.retest_exec_id]);
                enriched.retest_defects = retDefs.rows;
            } else {
                enriched.retest_attachments = [];
                enriched.retest_defects = [];
            }

            tcsWithExecutions.push(enriched);
        }

        // Compute stats for original and retest
        const origStats = computeStatsFromTCs(tcsWithExecutions, 'orig');
        const retestStats = retestRun ? computeStatsFromTCs(tcsWithExecutions, 'retest') : null;

        // Get HUs involved in this suite
        const husRes = await query(`
            SELECT DISTINCT cu.id, cu.title, cu.key_id
            FROM qa_use_cases cu
            JOIN qa_test_suites s ON s.use_case_id = cu.id
            WHERE s.id = ?
        `, [suiteId]);

        suites.push({
            suite_id: parseInt(suiteId),
            suite_title: group.suite_title,
            origRun,
            retestRun,
            tcsWithExecutions,
            hus: husRes.rows,
            origStats,
            retestStats,
        });
    }

    return { projectName: runs[0].project_name, suites };
}

function computeStatsFromTCs(tcs, prefix) {
    const statusField = prefix + '_status';
    const total = tcs.length;
    const pass = tcs.filter(t => t[statusField] === 'OK' || t[statusField] === 'PASS').length;
    const fail = tcs.filter(t => t[statusField] === 'FAIL').length;
    const block = tcs.filter(t => t[statusField] === 'BLOCK').length;
    const skip = tcs.filter(t => t[statusField] === 'SKIPPED' || t[statusField] === 'SKIP').length;
    const pending = tcs.filter(t => !t[statusField] || t[statusField] === 'PENDING').length;
    const health = total > 0 ? Math.round((pass / total) * 100) : 0;
    return { total, pass, fail, block, skip, pending, health };
}

function getJiraTicketsFromSuite(suite) {
    const tickets = [];
    const seen = new Set();
    for (const tc of suite.tcsWithExecutions) {
        if (tc.orig_defects) {
            for (const defect of tc.orig_defects) {
                if (defect.jira_key && !seen.has(defect.jira_key)) {
                    seen.add(defect.jira_key);
                    tickets.push({
                        jira_key: defect.jira_key,
                        jira_url: defect.jira_url || '#',
                        tc_key: tc.key_id,
                        tc_title: tc.title
                    });
                }
            }
        }
    }
    return tickets;
}

function renderSuiteTCItem(tc) {
    const hasOriginal = tc.orig_status;
    const hasRetest = tc.retest_status;

    return `
        <div class="tc-item">
            <div class="tc-row">
                <div class="tc-id">TC - ${tc.key_id?.split('-')[1] || tc.id}</div>
                <div class="tc-title">${tc.title}</div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    ${hasOriginal ? `<span class="retest-label orig">ORIG</span>` : ''}
                    ${hasRetest ? `<span class="retest-label retest">RETEST</span>` : ''}
                </div>
            </div>

            ${hasOriginal ? renderSuiteExecDetail(tc, 'EJECUCIÓN ORIGINAL', 'orig', tc.orig_status, tc.orig_observations, tc.orig_obtained_result, tc.orig_executed_at, tc.orig_attachments, tc.orig_defects, tc.expected_result) : ''}

            ${hasRetest ? renderSuiteExecDetail(tc, 'RETEST', 'retest', tc.retest_status, tc.retest_observations, tc.retest_obtained_result, tc.retest_executed_at, tc.retest_attachments, tc.retest_defects, tc.expected_result) : ''}
        </div>`;
}

function renderSuiteExecDetail(tc, label, labelClass, status, observations, obtainedResult, executedAt, attachments, defects, expectedResult) {
    const statusColor = status === 'OK' || status === 'PASS' ? 'var(--ok)' : status === 'FAIL' ? 'var(--fail)' : 'var(--warn)';
    const statusBg = status === 'OK' || status === 'PASS' ? 'rgba(52, 199, 89, 0.1)' : status === 'FAIL' ? 'rgba(255, 59, 48, 0.1)' : 'rgba(255, 149, 0, 0.1)';
    const statusIcon = status === 'OK' || status === 'PASS' ? ICONS.check : status === 'FAIL' ? ICONS.fail : ICONS.warn;

    return `
        <div class="exec-section">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
                <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:0.68rem;font-weight:700;background:${statusBg};color:${statusColor};">
                    <span style="width:6px;height:6px;border-radius:50%;background:currentColor;"></span>
                    ${status}
                </span>
                <span style="font-size:0.72rem;color:var(--text-muted);">${label}</span>
                ${executedAt ? `<span style="font-size:0.7rem;color:var(--text-muted);">📅 ${new Date(executedAt).toLocaleString()}</span>` : ''}
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                <div style="background: var(--bg); border-left: 3px solid var(--brand); padding: 12px 14px; border-radius: 6px;">
                    <div style="font-size: 0.68rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px;">Resultado Esperado</div>
                    <div style="font-size: 0.88rem; line-height: 1.5; color: var(--text-main);">${expectedResult || tc.tc_expected || '—'}</div>
                </div>
                <div style="background: ${status === 'OK' || status === 'PASS' ? 'rgba(52,199,89,0.04)' : 'rgba(255,59,48,0.04)'}; border-left: 3px solid ${statusColor}; padding: 12px 14px; border-radius: 6px;">
                    <div style="font-size: 0.68rem; font-weight: 700; color: ${statusColor}; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px;">Resultado Real</div>
                    <div style="font-size: 0.88rem; line-height: 1.5; color: var(--text-main);">${obtainedResult || 'No se registró un resultado detallado.'}</div>
                </div>
            </div>
            ${observations ? `<div style="margin-top: 14px; background: rgba(255,149,0,0.04); border: 1px solid rgba(255,149,0,0.12); border-left: 3px solid var(--warn); padding: 12px 14px; border-radius: 6px;"><div style="font-size: 0.68rem; font-weight: 700; color: var(--warn); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px;">Observaciones del Tester</div><div style="font-size: 0.88rem; line-height: 1.5; color: var(--text-main);">${observations}</div></div>` : ''}
            ${defects && defects.length > 0 ? renderDefectDetail(defects[0]) : ''}
            ${renderEvidenceMedia(attachments)}
        </div>`;
}

// ══════════════════════════════════════════════════════════════
// ── SINGLE-RUN REPORT ──
// ══════════════════════════════════════════════════════════════

async function generateReport(runId) {
    const run = await fetchRunData(runId);
    const hus = await fetchHUsForRun(runId);
    const testsWithMedia = await fetchExecutionsWithMedia(runId);
    const { huStats, totalTests, totalPass, totalFail, totalPending, globalHealth } = computeStats(hus, testsWithMedia);

    const dashboardHTML = renderDashboard(run, huStats, testsWithMedia, totalTests, totalPass, totalFail, totalPending, globalHealth);

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Auditoría QA - ${run.project_name}</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <style>${SHARED_CSS}</style>
</head>
<body>
    <aside>
        <div class="sidebar-header"><div class="sidebar-brand">QA AUDITOR</div></div>
        <div class="sidebar-nav">
            <div class="nav-item active" data-view="dashboard" onclick="switchView('dashboard')">${ICONS.dashboard} <span>DASHBOARD GENERAL</span></div>
            <div class="nav-group-title">MÓDULOS / HUS</div>
            ${huStats.map(hu => `
                <div class="nav-item" data-view="hu-${hu.id}" onclick="switchView('hu-${hu.id}')">
                    ${ICONS.folder} <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${hu.title}</span>
                    ${hu.score === 100 ? `<div class="nav-item-status ok">${ICONS.check}</div>` : ''}
                </div>`).join('')}
        </div>
        <div style="padding: 24px; font-size: 0.65rem; color: rgba(255,255,255,0.3); font-weight: 500;">QA Tools By Erich Petrocelli</div>
    </aside>
    <main>${dashboardHTML}</main>
    <div class="right-index hidden" id="right-index">
        <div class="index-title">INDICE DE TESTS</div>
        <div id="index-content"></div>
    </div>
    <div class="lightbox" id="lightbox" onclick="this.classList.remove('active')"><img id="lightbox-img" src=""></div>
    <div class="lightbox" id="lightbox-video" onclick="this.classList.remove('active')">
        <video id="lightbox-video-player" controls style="max-width: 95%; max-height: 95%; border-radius: 8px; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
            <source src="" id="lightbox-video-source">
        </video>
    </div>
    <script>
        const testsData = ${JSON.stringify(huStats.map(hu => ({
            id: hu.id,
            tests: testsWithMedia.filter(t => t.hus_id === hu.id).map(t => ({ id: t.id, title: t.title, key: t.key_id }))
        })))};
        function zoomImage(src) { const lb = document.getElementById('lightbox'); const img = document.getElementById('lightbox-img'); img.src = src; lb.classList.add('active'); }
        function zoomVideo(src, type) { const lb = document.getElementById('lightbox-video'); const player = document.getElementById('lightbox-video-player'); const source = document.getElementById('lightbox-video-source'); player.pause(); source.src = src; source.type = type; player.load(); player.play(); lb.classList.add('active'); }
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { document.getElementById('lightbox').classList.remove('active'); const vl = document.getElementById('lightbox-video'); vl.classList.remove('active'); document.getElementById('lightbox-video-player').pause(); } });
        function switchView(viewId) {
            document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === viewId));
            document.querySelectorAll('.view-content').forEach(el => el.classList.toggle('hidden', el.id !== 'view-' + viewId));
            const idx = document.getElementById('right-index'); const ic = document.getElementById('index-content');
            if (viewId === 'dashboard') { idx.classList.add('hidden'); } else {
                const huId = parseInt(viewId.replace('hu-', ''));
                const huData = testsData.find(h => h.id === huId);
                if (huData && huData.tests.length > 0) { idx.classList.remove('hidden'); ic.innerHTML = '<div class="index-group"><div class="index-group-title">PRUEBAS DEL MÓDULO</div>' + huData.tests.map(t => '<a href="#tc-anchor-' + t.id + '" class="index-link"><span style="font-weight:800;color:var(--brand);">TC-' + (t.key?.split('-')[1] || t.id) + '</span> - ' + t.title + '</a>').join('') + '</div>'; }
                else { idx.classList.add('hidden'); }
            }
            document.querySelector('main').scrollTop = 0;
        }
        switchView('dashboard');
    </script>
</body>
</html>`;

    return html;
}

// ══════════════════════════════════════════════════════════════
// ── MULTI-RUN REPORT (GROUPED BY SUITE) ──
// ══════════════════════════════════════════════════════════════

async function generateMultiReport(runIds) {
    const { projectName, suites } = await fetchSuiteGroupedData(runIds);

    const totalTests = suites.reduce((acc, s) => acc + s.origStats.total, 0);
    const totalPass = suites.reduce((acc, s) => acc + s.origStats.pass, 0);
    const totalFail = suites.reduce((acc, s) => acc + s.origStats.fail, 0);
    const totalBlock = suites.reduce((acc, s) => acc + s.origStats.block, 0);
    const totalSkip = suites.reduce((acc, s) => acc + s.origStats.skip, 0);
    const totalPending = suites.reduce((acc, s) => acc + s.origStats.pending, 0);
    const passRate = totalTests > 0 ? Math.round((totalPass / totalTests) * 100) : 0;
    const globalHealth = totalTests > 0 ? Math.round((totalPass / totalTests) * 100) : 100;

    const uniqueTesters = [...new Set(suites.map(s => s.origRun.auditor_name))];
    const dates = suites.map(s => new Date(s.origRun.finished_at));
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    const dateRange = `${minDate.toLocaleDateString('es-AR')} — ${maxDate.toLocaleDateString('es-AR')}`;
    const reportDate = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Reporte Consolidado QA - ${projectName}</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <style>${SHARED_CSS}</style>
</head>
<body class="multi-body">
    <div class="multi-top-bar">
        <span class="multi-top-bar-title">📊 Reporte Consolidado — ${projectName}</span>
        <div class="tab-pills">
            <button class="tab-pill active" onclick="switchTab('summary')">📋 Resumen (${suites.length} suites)</button>
            ${suites.map(s => {
                const shortTitle = s.suite_title.length > 28 ? s.suite_title.substring(0, 28) + '...' : s.suite_title;
                return `<button class="tab-pill" onclick="switchTab('suite-${s.suite_id}')" title="${s.suite_title}">${shortTitle}</button>`;
            }).join('')}
        </div>
    </div>
    <div style="max-width:1400px; margin:0 auto; padding:32px 40px;">
        <!-- EXECUTIVE HEADER -->
        <div style="background:white;border-radius:12px;border:1px solid var(--border);padding:24px 28px;margin-bottom:24px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div>
                    <h1 style="font-size:1.4rem;font-weight:700;margin:0 0 4px 0;color:var(--text-main);">Reporte Consolidado de QA</h1>
                    <p style="font-size:0.85rem;color:var(--text-muted);margin:0;">Proyecto: <strong style="color:var(--text-main);">${projectName}</strong></p>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.65rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:3px;">Fecha de Reporte</div>
                    <div style="font-size:0.88rem;font-weight:600;color:var(--text-main);">${reportDate}</div>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin-top:18px;padding-top:14px;border-top:1px solid var(--border);">
                <div>
                    <div style="font-size:0.62rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:3px;">Testers Participantes</div>
                    <div style="font-size:0.82rem;font-weight:600;color:var(--text-main);">${uniqueTesters.join(', ')}</div>
                </div>
                <div>
                    <div style="font-size:0.62rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:3px;">Total Ejecuciones</div>
                    <div style="font-size:0.82rem;font-weight:600;color:var(--text-main);">${suites.length} suites ejecutadas</div>
                </div>
                <div>
                    <div style="font-size:0.62rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:3px;">Período de Ejecución</div>
                    <div style="font-size:0.82rem;font-weight:600;color:var(--text-main);">${dateRange}</div>
                </div>
                <div>
                    <div style="font-size:0.62rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:3px;">Clasificación</div>
                    <div style="font-size:0.82rem;font-weight:600;color:${globalHealth >= 90 ? 'var(--ok)' : globalHealth >= 70 ? 'var(--warn)' : 'var(--fail)'};">${globalHealth >= 90 ? 'Aprobado' : globalHealth >= 70 ? 'Con Observaciones' : 'Requiere Atención'}</div>
                </div>
            </div>
        </div>

        <!-- SUMMARY TAB -->
        <div class="tab-panel active" id="panel-summary">
            <!-- DASHBOARD GLOBAL -->
            <div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:12px; margin-bottom:28px;">
                <div class="bento-card">
                    <div class="bento-label">Suites</div>
                    <span class="bento-value">${suites.length}</span>
                </div>
                <div class="bento-card">
                    <div class="bento-label">Total Tests</div>
                    <span class="bento-value">${totalTests}</span>
                </div>
                <div class="bento-card">
                    <div class="bento-label">Pass</div>
                    <span class="bento-value" style="color:var(--ok);">${totalPass}</span>
                </div>
                <div class="bento-card">
                    <div class="bento-label">Fail</div>
                    <span class="bento-value" style="color:var(--fail);">${totalFail}</span>
                </div>
                <div class="bento-card">
                    <div class="bento-label">Block</div>
                    <span class="bento-value" style="color:var(--warn);">${totalBlock}</span>
                </div>
                <div class="bento-card">
                    <div class="bento-label">Skip</div>
                    <span class="bento-value" style="color:var(--text-muted);">${totalSkip}</span>
                </div>
                <div class="bento-card">
                    <div class="bento-label">Health</div>
                    <span class="bento-value" style="color:${globalHealth >= 90 ? 'var(--ok)' : globalHealth >= 70 ? 'var(--warn)' : 'var(--fail)'};">${globalHealth}%</span>
                </div>
            </div>

            <h2 style="font-size:1rem;font-weight:700;margin-bottom:14px;color:var(--text-main);">Ejecuciones por Suite</h2>
            <table class="summary-table">
                <thead>
                    <tr>
                        <th style="width:30%;">Suite</th>
                        <th>Run</th>
                        <th>Fecha</th>
                        <th>Tester</th>
                        <th style="text-align:center;">Health</th>
                        <th style="text-align:center;">Tests</th>
                        <th style="text-align:center;">Pass</th>
                        <th style="text-align:center;">Fail</th>
                        <th style="text-align:center;">Block</th>
                        <th style="text-align:center;">Skip</th>
                    </tr>
                </thead>
                <tbody>
                    ${suites.map(s => {
                        const stats = s.origStats;
                        const healthColor = stats.health >= 90 ? 'var(--ok)' : stats.health >= 70 ? 'var(--warn)' : 'var(--fail)';
                        const healthBg = stats.health >= 90 ? 'rgba(52,199,89,0.1)' : stats.health >= 70 ? 'rgba(255,149,0,0.1)' : 'rgba(255,59,48,0.1)';
                        const jiraTickets = getJiraTicketsFromSuite(s);
                        
                        let jiraRow = '';
                        if (jiraTickets.length > 0) {
                            const ticketLinks = jiraTickets.map(t => 
                                '<div style="display:flex;align-items:center;gap:8px;">' +
                                '<span style="color:var(--text-muted);font-size:0.7rem;">├─</span>' +
                                '<a href="' + t.jira_url + '" target="_blank" style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;background:var(--brand-soft);color:var(--brand);font-size:0.7rem;font-weight:600;text-decoration:none;">🔗 ' + t.jira_key + '</a>' +
                                '<span style="font-size:0.7rem;color:var(--text-muted);">' + t.tc_key + '</span>' +
                                '</div>'
                            ).join('');
                            
                            jiraRow = '<tr class="jira-detail-row" id="jira-' + s.suite_id + '" style="display:none;">' +
                                '<td colspan="10" style="padding:10px 16px 14px 36px;background:var(--bg);border-bottom:1px solid var(--border);">' +
                                '<div style="font-size:0.65rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px;">📋 Tickets JIRA (' + jiraTickets.length + ')</div>' +
                                '<div style="display:flex;flex-direction:column;gap:4px;">' + ticketLinks + '</div>' +
                                '</td></tr>';
                        }
                        
                        return '<tr onclick="toggleSuiteDetail(\'jira-' + s.suite_id + '\')" style="cursor:pointer;">' +
                            '<td style="font-weight:700;" title="' + s.suite_title + '"><span style="display:inline-flex;align-items:center;gap:6px;"><span style="font-size:0.6rem;color:var(--text-muted);" id="chevron-' + s.suite_id + '">▶</span>' + s.suite_title + '</span></td>' +
                            '<td style="font-size:0.75rem;color:var(--brand);font-weight:600;">#' + s.origRun.id + '</td>' +
                            '<td style="font-size:0.75rem;color:var(--text-muted);">' + new Date(s.origRun.finished_at).toLocaleDateString() + '</td>' +
                            '<td>' + s.origRun.auditor_name + '</td>' +
                            '<td style="text-align:center;"><span style="padding:3px 10px;border-radius:20px;font-size:0.68rem;font-weight:700;background:' + healthBg + ';color:' + healthColor + ';">' + stats.health + '%</span></td>' +
                            '<td style="text-align:center;font-weight:600;">' + stats.total + '</td>' +
                            '<td style="text-align:center;color:var(--ok);font-weight:600;">' + stats.pass + '</td>' +
                            '<td style="text-align:center;font-weight:600;">' + stats.fail + '</td>' +
                            '<td style="text-align:center;color:var(--warn);font-weight:600;">' + stats.block + '</td>' +
                            '<td style="text-align:center;color:var(--text-muted);font-weight:600;">' + stats.skip + '</td>' +
                            '</tr>' + jiraRow;
                    }).join('')}
                </tbody>
            </table>
        </div>

        <!-- PER-SUITE TABS -->
        ${suites.map(s => `
        <div class="tab-panel" id="panel-suite-${s.suite_id}">
            <h2 style="font-size:1rem;font-weight:700;margin-bottom:4px;color:var(--text-main);">${s.suite_title}</h2>
            <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:20px;display:flex;align-items:center;gap:8px;">
                <span style="padding:3px 8px;border-radius:20px;background:var(--brand-soft);color:var(--brand);font-weight:600;">Run #${s.origRun.id}</span>
                <span>📅 ${new Date(s.origRun.finished_at).toLocaleDateString()}</span>
                <span>·</span>
                <span>👤 ${s.origRun.auditor_name}</span>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:24px;">
                <div class="bento-card">
                    <div class="bento-label">Health Score</div>
                    <span class="bento-value" style="color:${s.origStats.health >= 90 ? 'var(--ok)' : s.origStats.health >= 70 ? 'var(--warn)' : 'var(--fail)'}">${s.origStats.health}%</span>
                    <div class="health-bar"><div class="health-bar-fill" style="background:${s.origStats.health >= 90 ? 'var(--ok)' : 'var(--warn)'};width:${s.origStats.health}%"></div></div>
                    <div style="margin-top:8px;font-size:0.7rem;color:var(--text-muted);">${s.origStats.pass} OK · ${s.origStats.fail} FAIL · ${s.origStats.total} Total</div>
                </div>
                <div class="bento-card">
                    <div class="bento-label">Tests en Suite</div>
                    <span class="bento-value">${s.tcsWithExecutions.length}</span>
                    <div style="margin-top:8px;font-size:0.7rem;color:var(--text-muted);">${s.origStats.pass} aprobados · ${s.origStats.fail} fallidos</div>
                </div>
            </div>

            <div class="tc-group">
                <div class="tc-group-title">▼ EJECUCIÓN DE PRUEBAS</div>
                ${s.tcsWithExecutions.map(tc => renderSuiteTCItem(tc)).join('')}
            </div>
        </div>`).join('')}
    </div>

    <div class="lightbox" id="lightbox" onclick="this.classList.remove('active')"><img id="lightbox-img" src=""></div>
    <div class="lightbox" id="lightbox-video" onclick="this.classList.remove('active')">
        <video id="lightbox-video-player" controls style="max-width: 90%; max-height: 90%; border-radius: 8px;">
            <source src="" id="lightbox-video-source">
        </video>
    </div>

    <!-- FOOTER -->
    <div style="max-width:1400px; margin:0 auto; padding:0 40px 32px;">
        <div style="padding:20px 0; border-top:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
            <div style="font-size:0.7rem; color:var(--text-muted);">
                Generado por <strong>Manual QA Tool</strong> — JIRA Edition
            </div>
            <div style="font-size:0.7rem; color:var(--text-muted);">
                ${new Date().toLocaleString('es-AR')} · Documento Confidencial
            </div>
        </div>
    </div>

    <script>
        function switchTab(tabId) {
            document.querySelectorAll('.tab-pill').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(el => el.classList.remove('active'));
            const pill = document.querySelector('.tab-pill[onclick*="' + tabId + '"]');
            if (pill) pill.classList.add('active');
            const panel = document.getElementById('panel-' + tabId);
            if (panel) panel.classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        function toggleSuiteDetail(rowId) {
            const row = document.getElementById(rowId);
            if (row) {
                const isHidden = row.style.display === 'none';
                row.style.display = isHidden ? 'table-row' : 'none';
                const suiteId = rowId.replace('jira-', '');
                const chevron = document.getElementById('chevron-' + suiteId);
                if (chevron) chevron.textContent = isHidden ? '▼' : '▶';
            }
        }
        function zoomImage(src) { document.getElementById('lightbox-img').src = src; document.getElementById('lightbox').classList.add('active'); }
        function zoomVideo(src, type) {
            const p = document.getElementById('lightbox-video-player');
            const s = document.getElementById('lightbox-video-source');
            p.pause(); s.src = src; s.type = type; p.load(); p.play();
            document.getElementById('lightbox-video').classList.add('active');
        }
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { document.getElementById('lightbox').classList.remove('active'); const v = document.getElementById('lightbox-video'); v.classList.remove('active'); document.getElementById('lightbox-video-player').pause(); } });
    </script>
</body>
</html>`;

    return html;
}

module.exports = { generateReport, generateMultiReport };
