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

async function generateReport(runId) {
    // 1. Obtener datos de la ejecución y el proyecto
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
    const run = runRes.rows[0];

    // 2. Obtener SOLO las HUs involucradas en esta ejecución (vía Suite)
    const husRes = await query(`
        SELECT DISTINCT cu.id, cu.title, cu.key_id 
        FROM qa_use_cases cu
        JOIN qa_test_suites s ON s.use_case_id = cu.id
        JOIN qa_test_cases tc ON tc.suite_id = s.id
        JOIN qa_executions e ON e.tc_id = tc.id
        WHERE e.run_id = ?
        ORDER BY cu.id
    `, [runId]);
    const hus = husRes.rows;

    // 3. Obtener resultados de tests vinculados a sus HUs correspondientes
    const tcResults = await query(`
        SELECT s.use_case_id as us_id, e.status, e.id as exec_id
        FROM qa_executions e
        JOIN qa_test_cases tc ON e.tc_id = tc.id
        JOIN qa_test_suites s ON tc.suite_id = s.id
        WHERE e.run_id = ?
    `, [runId]);

    // 4. Detalle de Tests con Evidencias vinculados a su HU (vía Suite)
    const allTests = await query(`
        SELECT tc.*, s.use_case_id as hus_id, e.status, e.observations, e.obtained_result, e.id as exec_id
        FROM qa_executions e
        JOIN qa_test_cases tc ON e.tc_id = tc.id
        JOIN qa_test_suites s ON tc.suite_id = s.id
        WHERE e.run_id = ?
        ORDER BY tc.id
    `, [runId]);

    const testsWithMedia = [];
    for (let tc of allTests.rows) {
        if (tc.exec_id) {
            // Cargar Evidencias
            const atts = await query(`SELECT * FROM qa_attachments WHERE execution_id = ?`, [tc.exec_id]);
            tc.attachments = atts.rows.map(a => ({ mime_type: a.mime_type, category: a.evidence_category, data: a.file_data.toString('base64') }));
            
            // Cargar Defectos Técnicos
            const defects = await query(`SELECT * FROM qa_defects WHERE execution_id = ?`, [tc.exec_id]);
            tc.defects = defects.rows;
        } else { 
            tc.attachments = []; 
            tc.defects = [];
        }
        testsWithMedia.push(tc);
    }

    const huStats = hus.map(hu => {
        const tests = tcResults.rows.filter(r => r.us_id === hu.id);
        const pass = tests.filter(t => t.status === 'OK' || t.status === 'PASS').length;
        const total = tests.length;
        const score = total > 0 ? Math.round((pass / total) * 100) : 100;
        return { ...hu, total, pass, score };
    });

    const totalTests = tcResults.rows.length;
    const totalPass = tcResults.rows.filter(t => t.status === 'OK' || t.status === 'PASS').length;
    const totalFail = tcResults.rows.filter(t => t.status === 'FAIL').length;
    const totalPending = tcResults.rows.filter(t => !t.status || t.status === 'PENDING').length;
    const globalHealth = totalTests > 0 ? Math.round((totalPass / totalTests) * 100) : 100;

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Auditoría QA - ${run.project_name}</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #f5f7fb; --surface: #ffffff; --sidebar: #1a1f37; --brand: #3b82f6; --brand-soft: rgba(59, 130, 246, 0.1);
            --text-main: #1e293b; --text-muted: #64748b; --ok: #10b981; --fail: #ef4444; --warn: #f59e0b;
            --border: #e2e8f0; --radius: 16px; --shadow: 0 4px 20px rgba(0,0,0,0.05);
        }
        * { box-sizing: border-box; }
        body { font-family: 'Outfit', sans-serif; background: var(--bg); color: var(--text-main); margin: 0; display: flex; height: 100vh; overflow: hidden; }
        
        aside { width: 300px; background: var(--sidebar); color: white; display: flex; flex-direction: column; flex-shrink: 0; z-index: 100; }
        .sidebar-header { padding: 40px 24px; }
        .sidebar-brand { font-size: 0.9rem; font-weight: 800; letter-spacing: 0.05em; color: rgba(255,255,255,0.7); }
        .sidebar-nav { flex: 1; overflow-y: auto; padding: 0 16px; }
        .nav-group-title { padding: 32px 12px 12px; font-size: 0.65rem; font-weight: 800; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.1em; }
        .nav-item { 
            padding: 12px 16px; border-radius: 12px; cursor: pointer; display: flex; align-items: center; gap: 12px; margin-bottom: 8px; 
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); font-size: 0.85rem; font-weight: 500; border: 1px solid transparent;
        }
        .nav-item:hover { background: rgba(255,255,255,0.05); }
        .nav-item.active { background: var(--brand-soft); color: white; border-color: rgba(255,255,255,0.1); box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
        .nav-item-status { margin-left: auto; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; }
        .nav-item-status.ok { background: var(--ok); color: white; }

        main { flex: 1; overflow-y: auto; display: flex; flex-direction: column; position: relative; }
        .top-bar { padding: 24px 48px; display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.5); backdrop-filter: blur(10px); position: sticky; top: 0; z-index: 50; border-bottom: 1px solid var(--border); }
        .top-bar-title { font-size: 0.8rem; font-weight: 800; color: var(--text-muted); }
        
        .content-wrap { padding: 48px; max-width: 1400px; margin: 0 auto; width: 100%; }
        
        .header-meta { margin-bottom: 40px; }
        .date-pill { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; background: white; border-radius: 8px; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); border: 1px solid var(--border); margin-bottom: 16px; }
        .main-title { font-size: 2.2rem; font-weight: 900; margin: 0; letter-spacing: -0.02em; color: #0f172a; }

        .bento-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 48px; }
        .bento-card { background: white; border-radius: var(--radius); border: 1px solid var(--border); padding: 32px; box-shadow: var(--shadow); position: relative; overflow: hidden; }
        .bento-label { font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
        .bento-value { font-size: 2.8rem; font-weight: 900; margin-bottom: 16px; display: block; }
        .health-bar { height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
        .health-bar-fill { height: 100%; transition: width 1s ease-out; }

        .audit-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; padding: 24px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); margin-bottom: 48px; }
        .audit-info-item label { font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; display: block; margin-bottom: 4px; }
        .audit-info-item span { font-weight: 700; font-size: 0.9rem; color: #1e293b; }
        .audit-info-item a { color: var(--brand); text-decoration: none; display: inline-flex; align-items: center; gap: 4px; }

        .section-title { font-size: 1.1rem; font-weight: 800; margin-bottom: 32px; display: flex; justify-content: space-between; align-items: center; }
        .module-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; }
        .module-card { background: white; border-radius: var(--radius); border: 1px solid var(--border); padding: 24px; transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; }
        .module-card:hover { transform: translateY(-4px); box-shadow: 0 12px 24px rgba(0,0,0,0.08); border-color: var(--brand); }
        .module-card-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
        .module-card-title { font-size: 0.9rem; font-weight: 800; flex: 1; }
        .module-card-stats { text-align: right; font-size: 0.7rem; font-weight: 700; color: var(--text-muted); }

        .hu-header-card { background: white; border-radius: var(--radius); border: 1px solid var(--border); padding: 32px; display: flex; align-items: center; gap: 24px; margin-bottom: 40px; box-shadow: var(--shadow); }
        .hu-icon-box { width: 64px; height: 64px; background: #1e293b; border-radius: 16px; display: flex; align-items: center; justify-content: center; color: white; }
        .hu-title-box h2 { margin: 0; font-size: 1.25rem; font-weight: 800; }
        
        .tc-group { margin-bottom: 48px; }
        .tc-group-title { font-size: 0.85rem; font-weight: 900; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em; display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
        .tc-item { background: white; border-radius: var(--radius); border: 1px solid var(--border); padding: 24px; margin-bottom: 16px; transition: all 0.2s; }
        .tc-item:hover { border-color: var(--brand); }
        .tc-row { display: flex; justify-content: space-between; align-items: center; }
        .tc-title { font-size: 0.95rem; font-weight: 600; flex: 1; }
        .tc-id { font-weight: 800; color: var(--brand); margin-right: 16px; font-size: 0.9rem; }
        
        .media-section { margin-top: 32px; padding-top: 32px; border-top: 1px solid var(--border); }
        .media-title { font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 20px; }
        .media-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        .media-card { background: #000; border-radius: 12px; overflow: hidden; border: 1px solid var(--border); box-shadow: var(--shadow); }
        .media-card img, .media-card video { width: 100%; display: block; }
        .media-card video { background: #000; }

        .right-index { width: 300px; padding: 48px 24px; border-left: 1px solid var(--border); background: rgba(255,255,255,0.3); overflow-y: auto; flex-shrink: 0; }
        .index-title { font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 24px; }
        .index-group { margin-bottom: 32px; }
        .index-group-title { font-size: 0.7rem; font-weight: 800; color: var(--brand); margin-bottom: 12px; text-transform: uppercase; opacity: 0.7; }
        .index-link { display: block; font-size: 0.75rem; color: var(--text-muted); text-decoration: none; margin-bottom: 8px; line-height: 1.4; padding: 4px 0; }
        .index-link:hover { color: var(--brand); }

        .hidden { display: none !important; }

        /* Lightbox Report */
        .lightbox {
            position: fixed; inset: 0; background: rgba(0,0,0,0.95);
            display: none; align-items: center; justify-content: center;
            z-index: 10000; cursor: zoom-out; backdrop-filter: blur(8px);
        }
        .lightbox.active { display: flex; }
        .lightbox img {
            max-width: 95%; max-height: 95%; border-radius: 8px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.5);
            transform: scale(0.9); transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .lightbox.active img { transform: scale(1); }
    </style>
</head>
<body>
    <aside>
        <div class="sidebar-header">
            <div class="sidebar-brand">QA AUDITOR</div>
        </div>
        <div class="sidebar-nav">
            <div class="nav-item active" data-view="dashboard" onclick="switchView('dashboard')">
                ${ICONS.dashboard} <span>DASHBOARD GENERAL</span>
            </div>
            <div class="nav-group-title">MÓDULOS / HUS</div>
            ${huStats.map(hu => `
                <div class="nav-item" data-view="hu-${hu.id}" onclick="switchView('hu-${hu.id}')">
                    ${ICONS.folder} 
                    <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${hu.title}</span>
                    ${hu.score === 100 ? `<div class="nav-item-status ok">${ICONS.check}</div>` : ''}
                </div>
            `).join('')}
        </div>
        <div style="padding: 24px; font-size: 0.65rem; color: rgba(255,255,255,0.3); font-weight: 500;">
            QA Tools By Erich Petrocelli
        </div>
    </aside>

    <main>
        <div class="top-bar">
            <div class="top-bar-title">Reporte de Auditoría</div>
        </div>

        <div class="content-wrap">
            <!-- VISTA: DASHBOARD GENERAL -->
            <div id="view-dashboard" class="view-content">
                <div class="header-meta">
                    <div class="date-pill">📅 ${new Date(run.finished_at || Date.now()).toLocaleString()}</div>
                    <h1 class="main-title">${run.project_name}</h1>
                </div>

                <div class="bento-grid">
                    <div class="bento-card">
                        <div class="bento-label">Health Score</div>
                        <span class="bento-value" style="color: var(--ok)">${globalHealth}%</span>
                        <div class="health-bar">
                            <div class="health-bar-fill" style="background: var(--ok); width: ${globalHealth}%"></div>
                        </div>
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
                                <span>0 Alertas</span>
                                <span>${totalPending} Pendientes</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="audit-info-grid">
                    <div class="audit-info-item">
                        <label>AUDITOR:</label>
                        <span>${run.auditor_name}</span>
                    </div>
                    <div class="audit-info-item">
                        <label>AMBIENTE:</label>
                        <span><a href="#">Acceso al Sistema ${ICONS.external}</a></span>
                    </div>
                </div>

                <div class="section-title">
                    Estado de Salud por Módulo / HU
                    <span style="font-size: 0.65rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">${hus.length} MÓDULOS AUDITADOS</span>
                </div>

                <div class="module-grid">
                    ${huStats.map(hu => `
                        <div class="module-card" onclick="switchView('hu-${hu.id}')">
                            <div class="module-card-header">
                                ${ICONS.folder}
                                <div class="module-card-title">${hu.title}</div>
                                <div class="module-card-stats">
                                    ${hu.total} Tests<br>
                                    <span style="color: ${hu.score === 100 ? 'var(--ok)' : 'var(--text-muted)'}">${hu.score === 100 ? 'Todo OK' : 'En proceso'}</span>
                                </div>
                            </div>
                            <div class="health-bar">
                                <div class="health-bar-fill" style="background: var(--ok); width: ${hu.score}%"></div>
                            </div>
                            ${hu.score === 100 ? `<div style="text-align:right; margin-top:8px; color:var(--ok);">${ICONS.check}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- VISTAS: DETALLE DE HU -->
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
                        ${huTests.map(tc => `
                            <div class="tc-item" id="tc-anchor-${tc.id}">
                                <div class="tc-row">
                                    <div class="tc-id">TC - ${tc.key_id?.split('-')[1] || tc.id}</div>
                                    <div class="tc-title">${tc.title}</div>
                                    <div class="nav-item-status" style="background:${tc.status === 'OK' || tc.status === 'PASS' ? 'rgba(16, 185, 129, 0.1)' : tc.status === 'FAIL' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)'}; color:${tc.status === 'OK' || tc.status === 'PASS' ? 'var(--ok)' : tc.status === 'FAIL' ? 'var(--fail)' : 'var(--warn)'};">
                                        ${tc.status === 'OK' || tc.status === 'PASS' ? ICONS.check : tc.status === 'FAIL' ? ICONS.fail : ICONS.warn}
                                    </div>
                                </div>
                                
                                <div style="margin-top: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                                    <div style="background: #f8fafc; border-left: 3px solid var(--brand); padding: 12px; border-radius: 4px;">
                                        <div style="font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">Resultado Esperado</div>
                                        <div style="font-size: 0.85rem; line-height: 1.4;">${tc.expected_result || tc.tc_expected || '—'}</div>
                                    </div>
                                    <div style="background: ${tc.status === 'OK' || tc.status === 'PASS' ? '#f0fdf4' : '#fff1f2'}; border-left: 3px solid ${tc.status === 'OK' || tc.status === 'PASS' ? 'var(--ok)' : 'var(--fail)'}; padding: 12px; border-radius: 4px;">
                                        <div style="font-size: 0.65rem; font-weight: 800; color: ${tc.status === 'OK' || tc.status === 'PASS' ? 'var(--ok)' : 'var(--fail)'}; text-transform: uppercase; margin-bottom: 4px;">Resultado Real</div>
                                        <div style="font-size: 0.85rem; line-height: 1.4;">${tc.obtained_result || 'No se registró un resultado detallado.'}</div>
                                    </div>
                                </div>

                                ${tc.observations ? `
                                    <div style="margin-top: 16px; background: #fffbeb; border: 1px solid #fde68a; padding: 12px; border-radius: 8px;">
                                        <div style="font-size: 0.65rem; font-weight: 800; color: #b45309; text-transform: uppercase; margin-bottom: 4px;">Observaciones del Tester</div>
                                        <div style="font-size: 0.85rem; line-height: 1.4; color: #92400e;">${tc.observations}</div>
                                    </div>
                                ` : ''}
                                
                                ${tc.defects && tc.defects.length > 0 ? `
                                    <div style="margin-top: 24px; border: 1px solid #fee2e2; border-radius: 12px; overflow: hidden; background: #fffbff;">
                                        <div style="background: #ef4444; color: white; padding: 12px 20px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; display: flex; justify-content: space-between; align-items: center;">
                                            <span>DETALLE TÉCNICO DE DEFECTO</span>
                                            <span style="opacity: 0.8;">ID: #${tc.defects[0].id}</span>
                                        </div>
                                        <div style="padding: 24px;">
                                            <div style="margin-bottom: 20px;">
                                                <label style="font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; display: block; margin-bottom: 6px;">Título del Bug</label>
                                                <div style="font-size: 0.95rem; font-weight: 700; color: #b91c1c;">${tc.defects[0].title}</div>
                                            </div>

                                            ${tc.defects[0].description ? `
                                            <div style="margin-bottom: 20px;">
                                                <label style="font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; display: block; margin-bottom: 6px;">Descripción General</label>
                                                <div style="font-size: 0.85rem; line-height: 1.6; color: #475569; background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
                                                    ${tc.defects[0].description}
                                                </div>
                                            </div>
                                            ` : ''}

                                            <div style="margin-bottom: 20px;">
                                                <label style="font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; display: block; margin-bottom: 6px;">Pasos para Reproducir</label>
                                                <div style="font-size: 0.85rem; line-height: 1.6; color: #475569; background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
                                                    ${tc.defects[0].steps_to_reproduce || 'No se proporcionaron pasos específicos.'}
                                                </div>
                                            </div>

                                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
                                                <div style="background: rgba(82, 196, 26, 0.05); border: 1px solid rgba(82, 196, 26, 0.2); padding: 12px; border-radius: 8px;">
                                                    <label style="font-size: 0.6rem; font-weight: 800; color: #52c41a; text-transform: uppercase; display: block; margin-bottom: 4px;">Resultado Esperado</label>
                                                    <div style="font-size: 0.85rem; line-height: 1.4;">${tc.defects[0].expected_result || '—'}</div>
                                                </div>
                                                <div style="background: rgba(255, 77, 79, 0.05); border: 1px solid rgba(255, 77, 79, 0.2); padding: 12px; border-radius: 8px;">
                                                    <label style="font-size: 0.6rem; font-weight: 800; color: #ff4d4f; text-transform: uppercase; display: block; margin-bottom: 4px;">Resultado Real</label>
                                                    <div style="font-size: 0.85rem; line-height: 1.4;">${tc.defects[0].actual_result || '—'}</div>
                                                </div>
                                            </div>

                                            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px;">
                                                <div>
                                                    <label style="font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; display: block; margin-bottom: 4px;">Severidad</label>
                                                    <span style="font-size: 0.9rem; font-weight: 800; color: #ef4444;">${tc.defects[0].severity || 'No especificada'}</span>
                                                </div>
                                                <div>
                                                    <label style="font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; display: block; margin-bottom: 4px;">Frecuencia</label>
                                                    <span style="font-size: 0.9rem; font-weight: 700; color: #1e293b;">${tc.defects[0].frequency || 'Siempre'}</span>
                                                </div>
                                                <div>
                                                    <label style="font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; display: block; margin-bottom: 4px;">Impacto Negocio</label>
                                                    <span style="font-size: 0.9rem; font-weight: 700; color: #1e293b;">${tc.defects[0].business_impact || 'No especificado'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ` : ''}

                                ${tc.attachments.length > 0 ? `
                                    <div class="media-section">
                                        <div class="media-title">📷 EVIDENCIA MULTIMEDIA (CLICK PARA ZOOM)</div>
                                        <div class="media-grid">
                                            ${tc.attachments.map(a => {
                                                const isVideo = a.mime_type.startsWith('video/');
                                                if (isVideo) {
                                                    return `
                                                        <div class="media-card">
                                                            <video controls preload="metadata" onclick="zoomVideo(this.querySelector('source').src, '${a.mime_type}')" style="cursor: zoom-in;">
                                                                <source src="data:${a.mime_type};base64,${a.data}" type="${a.mime_type}">
                                                                Tu navegador no soporta video HTML5.
                                                            </video>
                                                        </div>
                                                    `;
                                                }
                                                return `
                                                    <div class="media-card">
                                                        <img src="data:${a.mime_type};base64,${a.data}" onclick="zoomImage(this.src)" style="cursor: zoom-in;">
                                                    </div>
                                                `;
                                            }).join('')}
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
                `;
            }).join('')}
        </div>
    </main>

    <div class="right-index hidden" id="right-index">
        <div class="index-title">INDICE DE TESTS</div>
        <div id="index-content"></div>
    </div>

    <div class="lightbox" id="lightbox" onclick="this.classList.remove('active')">
        <img id="lightbox-img" src="">
    </div>

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

        function zoomImage(src) {
            const lb = document.getElementById('lightbox');
            const img = document.getElementById('lightbox-img');
            img.src = src;
            lb.classList.add('active');
        }

        function zoomVideo(src, type) {
            const lb = document.getElementById('lightbox-video');
            const player = document.getElementById('lightbox-video-player');
            const source = document.getElementById('lightbox-video-source');
            player.pause();
            source.src = src;
            source.type = type;
            player.load();
            player.play();
            lb.classList.add('active');
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.getElementById('lightbox').classList.remove('active');
                const videoLb = document.getElementById('lightbox-video');
                videoLb.classList.remove('active');
                document.getElementById('lightbox-video-player').pause();
            }
        });

        function switchView(viewId) {
            document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === viewId));
            document.querySelectorAll('.view-content').forEach(el => el.classList.toggle('hidden', el.id !== 'view-' + viewId));
            const indexPanel = document.getElementById('right-index');
            const indexContent = document.getElementById('index-content');
            
            if (viewId === 'dashboard') {
                indexPanel.classList.add('hidden');
            } else {
                const huId = parseInt(viewId.replace('hu-', ''));
                const huData = testsData.find(h => h.id === huId);
                if (huData && huData.tests.length > 0) {
                    indexPanel.classList.remove('hidden');
                    indexContent.innerHTML = \`
                        <div class="index-group">
                            <div class="index-group-title">PRUEBAS DEL MÓDULO</div>
                            \${huData.tests.map(t => \`
                                <a href="#tc-anchor-\${t.id}" class="index-link">
                                    <span style="font-weight:800; color:var(--brand);">TC-\${t.key?.split('-')[1] || t.id}</span> - \${t.title}
                                </a>
                            \`).join('')}
                        </div>
                    \`;
                } else { indexPanel.classList.add('hidden'); }
            }
            document.querySelector('main').scrollTop = 0;
        }
        switchView('dashboard');
    </script>
</body>
</html>
    `;

    return html;
}

module.exports = { generateReport };
