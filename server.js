require('dns').setDefaultResultOrder('ipv4first'); // Fix: forzar IPv4 en redes sin soporte IPv6
require('dotenv').config();
const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const sharp = require('sharp');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const { query, getClient, setupRealtimeChannel } = require('./db');
const evidenceStore = require('./modules/evidence-store');
const { encrypt, decrypt } = require('./utils/crypto-utils');
const http = require('http');
const WebSocket = require('ws');
const JiraService = require('./jira-service');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const fs = require('fs');

// ── Módulos extraídos del monolito ──
const { JWT_SECRET } = require('./src/config');
const { requireAuth, requireAdmin } = require('./src/middleware/auth');
const { sanitizeInput, normalizeStatus, matchTransition, getLastStatusChange } = require('./src/lib/helpers');
const { generateKey, generateKeyBatch, getProjectIdFromUC, getProjectIdFromSuite, checkPermission } = require('./src/lib/sequences');
const { getJiraUserCredentials } = require('./src/lib/jira-credentials');
const authRouter = require('./src/routes/auth');
const usersRouter = require('./src/routes/users');
const projectsRouter = require('./src/routes/projects');
const statsRouter = require('./src/routes/stats');
const toolsRouter = require('./src/routes/tools');
const evidenceRouter = require('./src/routes/evidence');
const useCasesRouter = require('./src/routes/use-cases');
const testSuitesRouter = require('./src/routes/test-suites');
const testCasesRouter = require('./src/routes/test-cases');
const { runsRouter, historyRouter } = require('./src/routes/execution');
const defectsRouter = require('./src/routes/defects');
const hallazgosRouter = require('./src/routes/hallazgos');
const suggestionsRouter = require('./src/routes/suggestions');
const userStoriesRouter = require('./src/routes/user-stories');
const scenariosRouter = require('./src/routes/scenarios');
const inconsistenciesRouter = require('./src/routes/inconsistencies');
const preconditionsRouter = require('./src/routes/preconditions');
const { upload } = require('./src/lib/upload');

const { runSchemaMigrations } = require('./src/bootstrap/schema');

// Migraciones de esquema en background: el puerto abre sin esperarlas.
runSchemaMigrations()
    .then(() => {
        try {
            setupRealtime();
        } catch (e) {
            console.error('⚠️ Realtime no disponible:', e.message);
        }
    })
    .catch((e) => console.error('⚠️ Error en migraciones de esquema:', e.message));


const app = express();
const PORT = process.env.PORT || 3333;
const BASE_DIR = __dirname;

// Configuración de Multer en memoria

app.use(express.json());
app.use(cookieParser());
app.use((req, res, next) => {
    if (req.path.endsWith('.js') || req.path.endsWith('.css')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});
app.use(express.static(path.join(BASE_DIR, 'public')));

// ── Nueva UI (React + Vite) montada en /app ──────────────────
// Estrategia strangler: la UI legacy sigue en / y la nueva convive
// en /app mientras se migran los módulos, sin romper nada.
const UI_DIST_DIR = path.join(BASE_DIR, 'frontend', 'dist');
if (fs.existsSync(UI_DIST_DIR)) {
    console.log('🧩 Nueva UI disponible en /app');
    app.use('/app', express.static(UI_DIST_DIR, { index: false }));
    app.get('/app', (req, res) => res.sendFile(path.join(UI_DIST_DIR, 'index.html')));
    app.get('/app/*', (req, res) => res.sendFile(path.join(UI_DIST_DIR, 'index.html')));
}

// ── Middlewares de Auth ──
// ── AUTH & USERS ──
// Implementación en src/routes/auth.js y src/routes/users.js.
// Se montan ANTES del requireAuth global: cada ruta aplica el suyo.
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);

app.use('/api', requireAuth);

// ══════════════════════════════════════════════════════════════
// ── MÓDULOS EXTERNOS (lógica de negocio encapsulada) ──
// ══════════════════════════════════════════════════════════════

// Testing Exploratorio (sesiones ad-hoc) — ver modules/qa-explorations/index.js
const explorationsModule = require('./modules/qa-explorations');
app.use('/api/explorations', explorationsModule);

// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// ── PROYECTOS ──
// Implementación en src/routes/projects.js.
app.use('/api/projects', projectsRouter);
// ── JIRA INTEGRATION (Bugs & Epics) ──

app.get('/api/jira/projects/:id/epics', requireAuth, async (req, res) => {
    try {
        const creds = await getJiraUserCredentials(req.params.id, req.user.id);
        if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error });
        
        const epics = await JiraService.getEpics(creds.userCredentials, creds.projectKey, creds.domain);
        res.json({ epics });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/jira/projects/:id/epic-stats', requireAuth, async (req, res) => {
    try {
        const creds = await getJiraUserCredentials(req.params.id, req.user.id);
        if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error });

        const { epicKey, from, to } = req.query;
        if (!epicKey || !from || !to) {
            return res.status(400).json({ error: 'epicKey, from y to son requeridos' });
        }

        const dateFrom = new Date(from);
        const dateTo = new Date(to);
        dateTo.setHours(23, 59, 59, 999);

        const jql = `project = "${creds.projectKey}" AND issuetype = Bug AND (parent = "${epicKey}" OR "Epic Link" = "${epicKey}")`;
        const allBugs = await JiraService.searchIssues(creds.userCredentials, creds.domain, jql);

        if (allBugs.length === 0) {
            return res.json({ error: 'No se encontraron bugs para esta épica' });
        }

        const bugsInPeriod = allBugs.filter(b => {
            const created = new Date(b.fields.created);
            return created >= dateFrom && created <= dateTo;
        });

        const resolvedInPeriod = allBugs.filter(b => {
            const resDate = b.fields.resolutiondate;
            if (!resDate) return false;
            const d = new Date(resDate);
            return d >= dateFrom && d <= dateTo;
        });

        const openAtStart = allBugs.filter(b => {
            const created = new Date(b.fields.created) < dateFrom;
            const resolved = b.fields.resolutiondate ? new Date(b.fields.resolutiondate) < dateFrom : true;
            return created && !resolved;
        });

        const stillOpen = allBugs.filter(b => !b.fields.resolutiondate);
        const resolved = allBugs.filter(b => !!b.fields.resolutiondate);

        // === AGING BUCKETS ===
        const now = new Date();
        const agingBuckets = { '0-3d': 0, '4-7d': 0, '8-15d': 0, '+15d': 0 };
        stillOpen.forEach(b => {
            const created = new Date(b.fields.created);
            const lastStatus = getLastStatusChange(b, 'To Do') || getLastStatusChange(b, 'In Progress') || created;
            const days = (now - lastStatus) / (1000 * 60 * 60 * 24);
            if (days <= 3) agingBuckets['0-3d']++;
            else if (days <= 7) agingBuckets['4-7d']++;
            else if (days <= 15) agingBuckets['8-15d']++;
            else agingBuckets['+15d']++;
        });

        // === SLA ADVANCED (solo bugs del período) ===
        const resolutionDays = resolvedInPeriod.map(b => {
            return (new Date(b.fields.resolutiondate) - new Date(b.fields.created)) / (1000 * 60 * 60 * 24);
        }).filter(d => d >= 0);

        const sortedDays = [...resolutionDays].sort((a, b) => a - b);
        const medianResolution = sortedDays.length > 0 ? sortedDays[Math.floor(sortedDays.length / 2)] : 0;
        const p90Resolution = sortedDays.length > 0 ? sortedDays[Math.floor(sortedDays.length * 0.9)] : 0;
        const avgResolutionDays = resolutionDays.length > 0 ? resolutionDays.reduce((a, b) => a + b, 0) / resolutionDays.length : 0;
        const slaTarget = 5;
        const withinSLA = resolutionDays.filter(d => d <= slaTarget).length;
        const slaCompliance = resolutionDays.length > 0 ? Math.round((withinSLA / resolutionDays.length) * 100) : 0;

        // === WEEKLY TREND ===
        const weeks = [];
        let cur = new Date(dateFrom);
        cur.setHours(0, 0, 0, 0);
        while (cur <= dateTo) {
            const weekEnd = new Date(cur);
            weekEnd.setDate(weekEnd.getDate() + 6);
            if (weekEnd > dateTo) weekEnd.setTime(dateTo.getTime());
            const weekStartStr = cur.toISOString().split('T')[0];
            const weekEndStr = weekEnd.toISOString().split('T')[0];
            const createdThisWeek = bugsInPeriod.filter(b => {
                const d = new Date(b.fields.created);
                return d >= cur && d <= weekEnd;
            }).length;
            const resolvedThisWeek = allBugs.filter(b => {
                if (!b.fields.resolutiondate) return false;
                const d = new Date(b.fields.resolutiondate);
                return d >= cur && d <= weekEnd;
            }).length;
            const openAtWeekStart = allBugs.filter(b => {
                const created = new Date(b.fields.created) < cur;
                const resolved = b.fields.resolutiondate ? new Date(b.fields.resolutiondate) < cur : true;
                return created && !resolved;
            }).length;
            const backlogEnd = Math.max(0, openAtWeekStart + createdThisWeek - resolvedThisWeek);
            weeks.push({
                label: weekStartStr,
                created: createdThisWeek,
                resolved: resolvedThisWeek,
                backlogStart: openAtWeekStart,
                backlogEnd: backlogEnd,
                delta: createdThisWeek - resolvedThisWeek
            });
            cur.setDate(cur.getDate() + 7);
        }

        // === BACKLOG TREND ===
        const firstWeek = weeks[0];
        const lastWeek = weeks[weeks.length - 1];
        const backlogDelta = firstWeek && lastWeek ? lastWeek.backlogEnd - firstWeek.backlogStart : 0;
        const backlogDeltaPercent = firstWeek && firstWeek.backlogStart > 0 
            ? Math.round(((lastWeek.backlogEnd - firstWeek.backlogStart) / firstWeek.backlogStart) * 100) 
            : 0;

        // === RESOLUTION RATE (solo bugs del período) ===
        const bugResolutionRate = bugsInPeriod.length > 0 
            ? Math.round((resolvedInPeriod.length / bugsInPeriod.length) * 100) 
            : 0;

        // === STATUS BREAKDOWN ===
        const statusBreakdown = { 'To Do': 0, 'In Progress': 0, 'In Review': 0, 'Done': 0, 'Other': 0 };
        const priorityBreakdown = {};
        const criticalOpen = { count: 0, oldestDays: 0 };
        bugsInPeriod.forEach(b => {
            const statusName = b.fields.status?.name || '';
            const statusCat = b.fields.status?.statusCategory?.key || '';
            const normalized = normalizeStatus(statusName, statusCat);
            statusBreakdown[normalized] = (statusBreakdown[normalized] || 0) + 1;
            const prio = b.fields.priority?.name || 'Unknown';
            priorityBreakdown[prio] = (priorityBreakdown[prio] || 0) + 1;
            if (b.fields.priority?.name === 'Highest' && !b.fields.resolutiondate) {
                const days = (now - new Date(b.fields.created)) / (1000 * 60 * 60 * 24);
                criticalOpen.count++;
                if (days > criticalOpen.oldestDays) criticalOpen.oldestDays = days;
            }
        });

        // === AVG AGE BY STATUS ===
        const avgAgeByStatus = {};
        ['To Do', 'In Progress', 'In Review'].forEach(s => {
            const statusBugs = bugsInPeriod.filter(b => normalizeStatus(b.fields.status?.name, b.fields.status?.statusCategory?.key) === s);
            if (statusBugs.length === 0) { avgAgeByStatus[s] = 0; return; }
            const totalDays = statusBugs.reduce((sum, b) => {
                const created = new Date(b.fields.created);
                const lastStatus = getLastStatusChange(b, s);
                const fromDate = lastStatus || created;
                return sum + (now - fromDate) / (1000 * 60 * 60 * 24);
            }, 0);
            avgAgeByStatus[s] = parseFloat((totalDays / statusBugs.length).toFixed(1));
        });

        // === RELEASE RISK SCORE ===
        const backlogGrowthFactor = Math.abs(backlogDeltaPercent) / 100;
        const criticalFactor = criticalOpen.count * 0.3;
        const agingFactor = (agingBuckets['+15d'] / Math.max(stillOpen.length, 1)) * 0.3;
        const slaFactor = (100 - slaCompliance) / 100 * 0.25;
        const openFactor = (stillOpen.length / Math.max(bugsInPeriod.length, 1)) * 0.15;
        const rawRisk = (criticalFactor + backlogGrowthFactor * 0.25 + agingFactor + slaFactor + openFactor);
        const riskScore = Math.min(100, Math.round(rawRisk * 100));
        const riskLabel = riskScore < 30 ? 'low' : riskScore < 60 ? 'moderate' : 'high';

        // === QA HEALTH SCORE ===
        const healthScore = Math.max(0, Math.min(100, Math.round(
            (slaCompliance * 0.25) +
            (Math.min(bugResolutionRate, 100) * 0.25) +
            (Math.max(0, 100 - riskScore) * 0.30) +
            (Math.max(0, 100 - (criticalOpen.count * 10)) * 0.20)
        )));

        // === INSIGHTS ===
        const insights = [];
        if (backlogDeltaPercent < 0) {
            insights.push({ type: 'success', text: `Backlog disminuyendo ${Math.abs(backlogDeltaPercent)}% — tendencia positiva` });
        } else if (backlogDeltaPercent > 0) {
            insights.push({ type: 'warning', text: `Backlog creciendo ${backlogDeltaPercent}% — riesgo de acumulación` });
        }
        if (criticalOpen.count > 0) {
            insights.push({ type: 'critical', text: `${criticalOpen.count} bug(s) crítico(s) abierto(s) — ${criticalOpen.oldestDays > slaTarget ? 'excede(n) SLA de ' + slaTarget + ' días' : 'dentro de SLA'}` });
        }
        if (slaCompliance < 70) {
            insights.push({ type: 'warning', text: `SLA compliance al ${slaCompliance}% — ${slaTarget} días como target` });
        } else if (slaCompliance >= 90) {
            insights.push({ type: 'success', text: `SLA compliance al ${slaCompliance}% — excelente resolución` });
        }
        if (bugResolutionRate > 100) {
            insights.push({ type: 'success', text: `Resolution rate ${bugResolutionRate}% — el equipo resolve más de lo que entra` });
        } else if (bugResolutionRate < 50 && bugsInPeriod.length > 5) {
            insights.push({ type: 'warning', text: `Resolution rate ${bugResolutionRate}% — backlog acumulándose` });
        }
        if (agingBuckets['+15d'] > 0) {
            insights.push({ type: 'warning', text: `${agingBuckets['+15d']} bug(s) con más de 15 días sin resolver — possible deuda técnica` });
        }

        // === QA METRICS (local testing data) ===
        const qaCasesRes = await query(`
            SELECT tc.id, tc.title, tc.assigned_to
            FROM qa_test_cases tc
            JOIN qa_test_suites s ON tc.suite_id = s.id
            WHERE s.jira_epic_key = ? AND s.is_active = TRUE
        `, [epicKey]);

        const qaCaseIds = qaCasesRes.rows.map(c => c.id);

        let qaExecsByStatus = { PASS: 0, FAIL: 0, PENDING: 0, BLOCKED: 0 };
        let qaTotalExecutions = 0;
        let qaTotalMinutes = 0;
        let qaRunCount = 0;

        if (qaCaseIds.length > 0) {
            const qaExecsRes = await query(`
                SELECT e.status, COUNT(*)::INT as cnt
                FROM qa_executions e
                WHERE e.tc_id = ANY(?)
                GROUP BY e.status
            `, [qaCaseIds]);

            qaExecsRes.rows.forEach(r => {
                qaExecsByStatus[r.status] = (qaExecsByStatus[r.status] || 0) + r.cnt;
                qaTotalExecutions += r.cnt;
            });

            const qaRunsRes = await query(`
                SELECT r.accumulated_seconds, r.started_at, r.finished_at
                FROM qa_test_runs r
                JOIN qa_test_suites s ON r.suite_id = s.id
                WHERE s.jira_epic_key = ? AND s.is_active = TRUE AND r.status = 'FINISHED'
            `, [epicKey]);

            qaRunCount = qaRunsRes.rows.length;
            qaRunsRes.rows.forEach(r => {
                if (r.accumulated_seconds && r.accumulated_seconds > 0) {
                    qaTotalMinutes += r.accumulated_seconds / 60;
                } else if (r.started_at && r.finished_at) {
                    const diff = (new Date(r.finished_at) - new Date(r.started_at)) / 60000;
                    if (diff > 0) qaTotalMinutes += diff;
                }
            });
        }

        // Defects found during QA (excluir descartados de las estadísticas)
        let qaDefectsRes = { rows: [] };
        if (qaCaseIds.length > 0) {
            qaDefectsRes = await query(`
                SELECT d.id, d.title, d.severity
                FROM qa_defects d
                JOIN qa_executions e ON d.execution_id = e.id
                WHERE e.tc_id = ANY(?) AND d.status != 'DISMISSED'
            `, [qaCaseIds]);
        }

        const qaPassRate = (qaExecsByStatus.PASS + qaExecsByStatus.FAIL) > 0
            ? Math.round((qaExecsByStatus.PASS / (qaExecsByStatus.PASS + qaExecsByStatus.FAIL)) * 100)
            : 0;

        const qaDefectDensity = (qaExecsByStatus.PASS + qaExecsByStatus.FAIL) > 0
            ? parseFloat(((qaDefectsRes?.rows?.length || 0) / (qaExecsByStatus.PASS + qaExecsByStatus.FAIL) * 100).toFixed(1))
            : 0;

        const qaDefectsBySeverity = {};
        if (qaCaseIds.length > 0) {
            const qaDefectsBySevRes = await query(`
                SELECT d.severity, COUNT(*)::INT as cnt
                FROM qa_defects d
                JOIN qa_executions e ON d.execution_id = e.id
                WHERE e.tc_id = ANY(?) AND d.status != 'DISMISSED'
                GROUP BY d.severity
            `, [qaCaseIds]);
            qaDefectsBySevRes.rows.forEach(r => {
                qaDefectsBySeverity[r.severity] = r.cnt;
            });
        }

        // QA Insights
        if (qaTotalExecutions > 0) {
            if (qaPassRate < 50) {
                insights.push({ type: 'critical', text: `Pass rate de QA al ${qaPassRate}% — calidad comprometida` });
            } else if (qaPassRate < 80) {
                insights.push({ type: 'warning', text: `Pass rate de QA al ${qaPassRate}% — revisar casos fallidos` });
            } else if (qaPassRate >= 95) {
                insights.push({ type: 'success', text: `Pass rate de QA al ${qaPassRate}% — excelente calidad` });
            }
            if (qaDefectDensity > 0.5) {
                insights.push({ type: 'warning', text: `Defect density: ${qaDefectDensity}% — alta tasa de defectos por ejecución` });
            }
        } else if (qaCaseIds.length > 0) {
            insights.push({ type: 'warning', text: `${qaCaseIds.length} casos de prueba definidos sin ejecuciones registradas` });
        }

        // Actualizar health score con QA
        const healthScoreQA = Math.max(0, Math.min(100, Math.round(
            (slaCompliance * 0.20) +
            (Math.min(bugResolutionRate, 100) * 0.20) +
            (qaPassRate * 0.25) +
            (Math.max(0, 100 - riskScore) * 0.20) +
            (Math.max(0, 100 - (criticalOpen.count * 10)) * 0.15)
        )));

        res.json({
            summary: {
                total: bugsInPeriod.length,
                created: bugsInPeriod.length,
                resolved: resolvedInPeriod.length,
                open: stillOpen.length,
                openAtStart: openAtStart.length,
                avgResolutionDays: parseFloat(avgResolutionDays.toFixed(1)),
                medianResolution: parseFloat(medianResolution.toFixed(1)),
                p90Resolution: parseFloat(p90Resolution.toFixed(1)),
                slaCompliance,
                bugResolutionRate,
                backlogDelta,
                backlogDeltaPercent
            },
            healthScore: healthScoreQA,
            riskScore,
            riskLabel,
            statusBreakdown,
            priorityBreakdown,
            trend: weeks,
            avgAgeByStatus,
            agingBuckets,
            insights,
            sla: {
                target: slaTarget,
                median: parseFloat(medianResolution.toFixed(1)),
                p90: parseFloat(p90Resolution.toFixed(1)),
                compliance: slaCompliance,
                withinSLA,
                total: resolutionDays.length
            },
            qaMetrics: {
                totalTestCases: qaCaseIds.length,
                executionsByStatus: qaExecsByStatus,
                passRate: qaPassRate,
                defectDensity: qaDefectDensity,
                totalExecutions: qaTotalExecutions,
                executionTime: {
                    totalMinutes: parseFloat(qaTotalMinutes.toFixed(1)),
                    avgMinutes: qaTotalExecutions > 0 ? parseFloat((qaTotalMinutes / qaRunCount).toFixed(1)) : 0,
                    runCount: qaRunCount
                },
                defectsFound: qaDefectsRes?.rows?.length || 0,
                defectsBySeverity: qaDefectsBySeverity
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/jira/projects/:id/my-tickets', requireAuth, async (req, res) => {
    try {
        const creds = await getJiraUserCredentials(req.params.id, req.user.id);
        if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error });

        const { filter } = req.query;
        const maxResults = parseInt(req.query.maxResults) || 50;

        let issues = [];
        if (filter === 'assigned') {
            issues = await JiraService.getMyAssignedIssues(creds.userCredentials, creds.domain, creds.projectKey, maxResults);
        } else if (filter === 'created') {
            issues = await JiraService.getMyCreatedIssues(creds.userCredentials, creds.domain, creds.projectKey, maxResults);
        } else if (filter === 'mentions') {
            issues = await JiraService.getIssuesWhereMentioned(creds.userCredentials, creds.domain, creds.projectKey, 30);
        } else {
            return res.status(400).json({ error: 'filter debe ser: assigned, created, o mentions' });
        }

        const result = issues.map(i => ({
            key: i.key,
            id: i.id,
            summary: i.fields?.summary,
            status: i.fields?.status?.name,
            statusCategory: i.fields?.status?.statusCategory?.key,
            priority: i.fields?.priority?.name,
            assignee: i.fields?.assignee?.displayName,
            assigneeAvatar: i.fields?.assignee?.avatarUrls?.['24x24'],
            reporter: i.fields?.reporter?.displayName,
            created: i.fields?.created,
            updated: i.fields?.updated,
            issueType: i.fields?.issuetype?.name,
            parent: i.fields?.parent?.key,
            mentions: i.mentions || null,
            comments: i.comments || null
        }));

        res.json({ total: result.length, tickets: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/debug/jira-test', requireAuth, async (req, res) => {
    try {
        const { projectId, jql } = req.query;
        if (!projectId || !jql) {
            return res.status(400).json({ error: 'projectId y jql son requeridos' });
        }
        const creds = await getJiraUserCredentials(projectId, req.user.id);
        if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error });

        const results = await JiraService.searchIssues(creds.userCredentials, creds.domain, jql);
        const first = results.length > 0 ? results[0] : null;
        res.json({ total: results.length, jqlUsed: jql, creds: { projectKey: creds.projectKey, domain: creds.domain }, firstIssue: first ? { key: first.key, id: first.id, projectKey: first.fields?.project?.key, fields: first.fields } : null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/jira/projects/:id/context', requireAuth, async (req, res) => {
    try {
        const creds = await getJiraUserCredentials(req.params.id, req.user.id);
        if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error, epics: [], users: [], priorities: [], customFields: [] });
        
        const [epics, users, priorities, customFields] = await Promise.all([
            JiraService.getEpics(creds.userCredentials, creds.projectKey, creds.domain),
            JiraService.getAssignableUsers(creds.userCredentials, creds.projectKey, creds.domain),
            JiraService.getPriorities(creds.userCredentials, creds.domain),
            JiraService.getCreateMetadata(creds.userCredentials, creds.projectKey, creds.domain)
        ]);

        res.json({ epics, users, priorities, customFields });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/jira/projects/:id/tracking', requireAuth, async (req, res) => {
    try {
        const projectId = req.params.id;
        const creds = await getJiraUserCredentials(projectId, req.user.id);
        if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error });

        const dbBugs = await query(`
            SELECT d.id, d.title, d.jira_key, d.jira_url, d.created_at
            FROM qa_defects d
            JOIN qa_executions e ON d.execution_id = e.id
            JOIN qa_test_cases tc ON e.tc_id = tc.id
            JOIN qa_test_suites s ON tc.suite_id = s.id
            JOIN qa_use_cases cu ON s.use_case_id = cu.id
            WHERE cu.project_id = ? AND d.jira_key IS NOT NULL AND d.status != 'DISMISSED'
        `, [projectId]);

        if (dbBugs.rows.length === 0) return res.json({ tracking: [] });

        const keys = dbBugs.rows.map(b => b.jira_key);
        const jiraIssues = await JiraService.getTicketsDetails(creds.userCredentials, creds.domain, keys);

        const tracking = dbBugs.rows.map(bug => {
            const jira = jiraIssues.find(j => j.key === bug.jira_key);
            return {
                ...bug,
                jira_status: jira?.fields?.status?.name || 'Desconocido',
                jira_assignee: jira?.fields?.assignee?.displayName || 'Sin asignar',
                jira_avatar: jira?.fields?.assignee?.avatarUrls?.['32x32'] || null,
                jira_priority: jira?.fields?.priority?.name || '—',
                jira_epic_key: jira?.fields?.parent?.key || 'Otras',
                jira_epic_name: jira?.fields?.parent?.fields?.summary || 'Tickets sin épica'
            };
        });

        res.json({ tracking });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/jira/issues/:key/comments', requireAuth, async (req, res) => {
    try {
        const { project_id } = req.query;
        if (!project_id) return res.status(400).json({ error: 'project_id requerido' });
        
        const creds = await getJiraUserCredentials(project_id, req.user.id);
        if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error });
        
        const comments = await JiraService.getIssueComments(creds.userCredentials, creds.domain, req.params.key);
        res.json({ comments });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/jira/issues/:key/comments', requireAuth, async (req, res) => {
    try {
        const { project_id, text, mentionId } = req.body;
        if (!text) return res.status(400).json({ error: 'El texto del comentario es requerido.' });

        const creds = await getJiraUserCredentials(project_id, req.user.id);
        if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error });
        
        const result = await JiraService.addIssueComment(creds.userCredentials, creds.domain, req.params.key, text, mentionId);
        res.json({ ok: true, comment: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/jira/defects/:id/create-ticket', requireAuth, async (req, res) => {
    try {
        const defectId = req.params.id;
        const { epicId, assigneeId, priorityId, customFields } = req.body;

        // 1. Obtener datos del defecto y su proyecto
        const bugRes = await query(`
            SELECT d.*, tc.title as tc_title, tc.key_id as tc_key, e.tester as tester_name, s.use_case_id
            FROM qa_defects d
            JOIN qa_executions e ON d.execution_id = e.id
            JOIN qa_test_cases tc ON e.tc_id = tc.id
            JOIN qa_test_suites s ON tc.suite_id = s.id
            WHERE d.id = ?
        `, [defectId]);

        if (bugRes.rows.length === 0) return res.status(404).json({ error: 'Defecto no encontrado.' });
        const bug = bugRes.rows[0];

        // No se puede crear ticket Jira de un bug descartado
        if (bug.status === 'DISMISSED') {
            return res.status(400).json({ error: 'No se puede crear un ticket de Jira de un bug descartado. Reabrí el bug primero.' });
        }

        // 2. Obtener el project_id real desde el caso de uso
        const ucRes = await query(`SELECT project_id FROM qa_use_cases WHERE id = ?`, [bug.use_case_id]);
        const projectId = ucRes.rows[0].project_id;

        // 3. Obtener evidencias del defecto
        const evidenceRes = await query(`SELECT id, file_name, mime_type, storage_kind, storage_path, sha256 FROM qa_attachments WHERE execution_id = ?`, [bug.execution_id]);
        if (evidenceRes.rows.length > 0) {
            bug.evidences = evidenceRes.rows.map(r => r.file_name);
        }

        // 4. Obtener credenciales del usuario
        const creds = await getJiraUserCredentials(projectId, req.user.id);
        if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error });

        // 5. Crear Ticket
        const jiraResult = await JiraService.createIssue(creds.userCredentials, creds.projectKey, creds.domain, bug, epicId, assigneeId, priorityId, customFields);
        
        // Generar URL del ticket
        const jiraUrl = `${jiraResult.self.split('/rest/')[0]}/browse/${jiraResult.key}`;

        // 6. Adjuntar evidencias
        let attachmentCount = 0;
        const attachmentErrors = [];
        if (evidenceRes.rows.length > 0) {
            for (const ev of evidenceRes.rows) {
                try {
                    let fileBuffer;
                    if (ev.storage_kind === 'local' && ev.storage_path) {
                        fileBuffer = evidenceStore.read(ev.storage_path);
                    } else {
                        // Fallback transitorio: binario sigue en BYTEA.
                        const leg = await query(`SELECT encode(file_data, 'hex') as file_hex FROM qa_attachments WHERE id = ?`, [ev.id]);
                        const hex = (leg.rows[0] && leg.rows[0].file_hex || '').replace(/^\\x/, '');
                        fileBuffer = Buffer.from(hex, 'hex');
                    }
                    await JiraService.attachFile(creds.userCredentials, creds.domain, jiraResult.key, ev.file_name, fileBuffer, ev.mime_type);
                    attachmentCount++;
                } catch (attachErr) {
                    attachmentErrors.push({ file: ev.file_name, error: attachErr.message });
                }
            }
        }

        // 7. Persistir en BBDD
        await query(`
            UPDATE qa_defects 
            SET jira_key = ?, jira_url = ?, root_cause = ? 
            WHERE id = ?
        `, [jiraResult.key, jiraUrl, `JIRA: ${jiraResult.key}`, defectId]);

        res.json({ ok: true, jira: { ...jiraResult, browser_url: jiraUrl }, attachment_count: attachmentCount, attachment_errors: attachmentErrors });
    } catch (err) {
        console.error("Error al crear ticket en Jira:", err);
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// ── CASOS DE USO ──
// ══════════════════════════════════════════════════════════════

// ── CASOS DE USO (CU / HU / escenarios / inconsistencias / precondiciones) ──
// Implementación en src/routes/use-cases.js, user-stories.js, scenarios.js,
// inconsistencies.js y preconditions.js.
app.use('/api/use-cases', useCasesRouter);
app.use('/api/user-stories', userStoriesRouter);
app.use('/api/scenarios', scenariosRouter);
app.use('/api/inconsistencies', inconsistenciesRouter);
app.use('/api/preconditions', preconditionsRouter);
app.use('/api/test-suites', testSuitesRouter);
app.use('/api/test-cases', testCasesRouter);
app.use('/api/runs', runsRouter);
app.use('/api/history', historyRouter);
app.use('/api/defects', defectsRouter);
app.use('/api/hallazgos', hallazgosRouter);
app.use('/api/suggestions', suggestionsRouter);



app.post(['/api/test-suites/:id/import-dual', '/api/use-cases/:id/import-dual'], requireAuth, upload.single('xlsx'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ error: 'Archivo no recibido' });

        let workbook;
        try {
            workbook = XLSX.read(file.buffer, { type: 'buffer' });
        } catch (e) {
            const content = file.buffer.toString('utf-8');
            workbook = XLSX.read(content, { type: 'string' });
        }

        const normalize = (str) => {
            if (!str) return '';
            return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        };

        const tryFindColIndex = (headers, keywords) => {
            if (!headers || headers.length === 0) return -1;
            for (let i = 0; i < headers.length; i++) {
                const nh = normalize(headers[i]);
                if (keywords.every(k => nh.includes(k))) return i;
            }
            return -1;
        };

        // Detectar formato: hoja plana (unificada) vs dual (2 hojas)
        const isCSV = file.originalname.toLowerCase().endsWith('.csv');
        let isFlatFormat = false;
        let dataFlat = null;
        let headersFlat = null;

        if (!isCSV && workbook.SheetNames.length === 1) {
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            if (data.length > 0) {
                const headers = data[0].map(h => normalize(h));
                const hasCU = headers.some(h => h.includes('cu') && h.includes('vinculad'));
                const hasHU = headers.some(h => h.includes('hu') || h.includes('requerimiento'));
                const hasEscenario = headers.some(h => h.includes('escenario'));
                const hasPasos = headers.some(h => h.includes('paso'));
                if (hasCU && hasHU && hasEscenario && hasPasos) {
                    isFlatFormat = true;
                    dataFlat = data;
                    headersFlat = data[0].map(h => String(h || '').trim());
                }
            }
        }

        // Obtener contexto del UC
        let ucId = req.params.id;
        const isUseCasePath = req.url.includes('/use-cases/');

        if (!isUseCasePath) {
            const sRes = await query(`SELECT use_case_id FROM qa_test_suites WHERE id = ?`, [ucId]);
            if (sRes.rows.length > 0) ucId = sRes.rows[0].use_case_id;
            else return res.status(404).json({ error: 'Suite no encontrada' });
        }

        const ucRes = await query(`SELECT project_id FROM qa_use_cases WHERE id = ?`, [ucId]);
        if (ucRes.rows.length === 0) return res.status(404).json({ error: 'Caso de Uso no encontrado' });
        const projectId = ucRes.rows[0].project_id;

        if (isFlatFormat) {
            // FORMATO UNIFICADO (hoja plana)
            return await processFlatImport(req, res, dataFlat, headersFlat, ucId, projectId, normalize, tryFindColIndex, sanitizeInput, generateKey, query);
        }

        // FORMATO DUAL (2 hojas) - compatibilidad hacia atras
        return await processDualImport(req, res, workbook, isCSV, ucId, projectId, normalize, tryFindColIndex, sanitizeInput, generateKey, query);
    } catch (err) {
        console.error('Error crítico en importación:', err);
        res.status(500).json({
            error: 'Error al procesar el archivo.',
            detalle: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

async function processFlatImport(req, res, data, headers, ucId, projectId, normalize, tryFindColIndex, sanitizeInput, generateKey, query) {
    const colMap = {
        uc_title: tryFindColIndex(headers, ['cu', 'vinculad']),
        suite: tryFindColIndex(headers, ['suite', 'grupo']),
        key_id: tryFindColIndex(headers, ['id test']),
        us_title: tryFindColIndex(headers, ['hu', 'requerimiento']),
        title: tryFindColIndex(headers, ['escenario']),
        pre: tryFindColIndex(headers, ['precondicion']),
        steps: tryFindColIndex(headers, ['paso']),
        data: tryFindColIndex(headers, ['datos de prueba']),
        expected: tryFindColIndex(headers, ['resultado esperado']),
        criteria: tryFindColIndex(headers, ['criterio', 'aceptacion']),
        assumptions: tryFindColIndex(headers, ['assumption', 'suposicion']),
        status: tryFindColIndex(headers, ['estado']),
        obtained: tryFindColIndex(headers, ['resultado obtenid']),
        obs: tryFindColIndex(headers, ['observacion', 'hallazgo']),
        tester: tryFindColIndex(headers, ['tester']),
        date: tryFindColIndex(headers, ['fecha ejecucion'])
    };

    if (colMap.title === -1 || colMap.steps === -1 || colMap.expected === -1 || colMap.us_title === -1) {
        return res.status(400).json({
            error: 'Faltan columnas obligatorias en formato unificado',
            detalle: 'Se requieren: CU Vinculado, HU/Requerimiento, Escenario, Pasos, Resultado Esperado'
        });
    }

    // Agrupar por HU
    const groups = {};
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        let usTitle = String(row[colMap.us_title] || '').trim();
        if (!usTitle || usTitle === 'Sin HU vinculada') continue;
        // Limpiar prefijo [US-XXX] si existe
        usTitle = usTitle.replace(/^\[.*?\]\s*/, '');
        if (!groups[usTitle]) groups[usTitle] = [];
        groups[usTitle].push(row);
    }

    let totalImported = 0;
    let usCount = 0;

    const client = await getClient();
    const q = client.query;
    try {
        await q('BEGIN');
        for (const usTitle in groups) {
            const rows = groups[usTitle];
            const firstRow = rows[0];

            const getVal = (row, idx) => idx !== -1 && row[idx] !== undefined ? sanitizeInput(row[idx]) : '';

            // Crear Suite para esta HU
            const suiteKey = await generateKey(projectId, 'ST', q);
            const suiteRes = await q(`
                INSERT INTO qa_test_suites (use_case_id, project_id, title, description, key_id, created_by)
                VALUES (?, ?, ?, ?, ?, ?)
                RETURNING id
            `, [ucId, projectId, `Suite: ${usTitle}`, `Importación automática ${suiteKey}`, suiteKey, req.user.id]);
            const suiteId = suiteRes.rows[0].id;

            // Crear HU
            const usKey = await generateKey(projectId, 'US', q);
            const usDesc = getVal(firstRow, colMap.data) || '';
            const usBR = '';
            const usPre = getVal(firstRow, colMap.pre) || '';

            const usRes = await q(`
                INSERT INTO qa_user_stories (use_case_id, project_id, key_id, title, hu_detallada, reglas_negocio, precondiciones, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (key_id) DO UPDATE SET title = EXCLUDED.title
                RETURNING id
            `, [ucId, projectId, usKey, usTitle, usDesc, usBR, usPre, req.user.id]);
            const usId = usRes.rows[0].id;
            usCount++;

            let escenariosText = [];
            const validRows = rows.filter(row => getVal(row, colMap.title));
            let tcKeyStart = null;
            if (validRows.length > 0) {
                tcKeyStart = await generateKeyBatch(projectId, 'TC', validRows.length, q);
            }
            let tcIdx = 0;
            for (const row of rows) {
                const title = getVal(row, colMap.title);
                if (!title) continue;

                const steps = getVal(row, colMap.steps);
                const pre = getVal(row, colMap.pre);
                const expected = getVal(row, colMap.expected);
                const assumptions = getVal(row, colMap.assumptions);
                const testData = getVal(row, colMap.data);
                const criteria = getVal(row, colMap.criteria);

                const scenarioRes = await q(
                    `INSERT INTO qa_scenarios (us_id, title, order_index) VALUES (?, ?, ?) RETURNING id`,
                    [usId, title, totalImported]
                );
                const scenarioId = scenarioRes.rows[0].id;

                const tcNum = tcKeyStart + tcIdx;
                const tcKey = `TC-${tcNum.toString().padStart(4, '0')}`;
                tcIdx++;
                await q(`
                    INSERT INTO qa_test_cases (suite_id, us_id, scenario_id, key_id, title, steps, preconditions, expected_result, assumptions, test_data, acceptance_criteria, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [suiteId, usId, scenarioId, tcKey, title, steps, pre, expected, assumptions, testData, criteria, req.user.id]);

                totalImported++;
            }

            if (escenariosText.length > 0) {
                await q(`UPDATE qa_user_stories SET escenarios_prueba = ? WHERE id = ?`, [escenariosText.join('\n'), usId]);
            }
        }

        await q('COMMIT');
        client.release();
        return res.json({
            ok: true,
            message: `Importación exitosa (formato unificado). ${usCount} historias de usuario y ${totalImported} tests importados.`
        });
    } catch (err) {
        await q('ROLLBACK');
        client.release();
        throw err;
    }
}

async function processDualImport(req, res, workbook, isCSV, ucId, projectId, normalize, tryFindColIndex, sanitizeInput, generateKey, query) {
    let sheetUSName, sheetTCName;

    if (isCSV) {
        sheetUSName = workbook.SheetNames[0];
        sheetTCName = workbook.SheetNames[0];
    } else {
        sheetUSName = 'historia de usuario';
        sheetTCName = 'Casos de Prueba';
        const realUS = workbook.SheetNames.find(n => n.toLowerCase() === sheetUSName);
        const realTC = workbook.SheetNames.find(n => n.toLowerCase() === sheetTCName);
        if (realUS) sheetUSName = realUS;
        if (realTC) sheetTCName = realTC;

        if (!workbook.SheetNames.includes(sheetUSName) || !workbook.SheetNames.includes(sheetTCName)) {
            return res.status(400).json({ error: `El archivo XLSX debe contener las hojas "${sheetUSName}" y "${sheetTCName}"` });
        }
    }

    let dataUS = XLSX.utils.sheet_to_json(workbook.Sheets[sheetUSName], { header: 1 });
    let dataTC = XLSX.utils.sheet_to_json(workbook.Sheets[sheetTCName], { header: 1 });

    if (dataUS.length < 2) return res.status(400).json({ error: 'El archivo está vacío o no tiene datos suficientes' });

    const tryFindCol = (data, keywords) => {
        if (!data || data.length === 0) return null;
        let headers = data[0].map(h => normalize(h));

        let found = data[0].find(h => {
            const nh = normalize(h);
            return keywords.every(k => nh.includes(k));
        });
        if (found) return found;

        if (isCSV && data[0].length === 1) {
            const line = String(data[0][0]);
            const delims = [',', ';'];
            for (let d of delims) {
                if (line.includes(d)) {
                    const parts = line.split(d);
                    const nhParts = parts.map(p => normalize(p));
                    if (keywords.every(k => nhParts.some(p => p.includes(k)))) {
                        if (data === dataUS) {
                            dataUS.forEach((r, idx) => {
                                if (r.length === 1) dataUS[idx] = String(r[0]).split(d);
                            });
                        }
                        if (data === dataTC) {
                            dataTC.forEach((r, idx) => {
                                if (r.length === 1) dataTC[idx] = String(r[0]).split(d);
                            });
                        }
                        return parts.find(p => keywords.every(k => normalize(p).includes(k)));
                    }
                }
            }
        }
        return null;
    };

    const colUS_Title = tryFindCol(dataUS, ['titulo', 'historia']);

    const headersUS = dataUS[0].map(h => String(h || '').trim());
    const headersTC = dataTC[0].map(h => String(h || '').trim());

    if (!colUS_Title) {
        return res.status(400).json({
            error: 'Faltan columnas obligatorias (Título de la HU)',
            detalle: `Columnas detectadas: [${headersUS.join(' | ')}]`
        });
    }

    const tcColMap = {
        us_title: headersTC.indexOf(colUS_Title),
        title: tryFindCol(dataTC, ['escenario']),
        pre: tryFindCol(dataTC, ['precondicion']),
        data: tryFindCol(dataTC, ['datos de prueba']),
        steps: tryFindCol(dataTC, ['paso']),
        criteria: tryFindCol(dataTC, ['criterio']),
        expected: tryFindCol(dataTC, ['resultado esperado']),
        assumptions: tryFindCol(dataTC, ['suposicion']),
        us_desc: headersUS.find(h => normalize(h).includes('descripcion')),
        us_br: headersUS.find(h => normalize(h).includes('reglas de negocio')),
        us_pre: headersUS.find(h => normalize(h).includes('precondiciones'))
    };

    Object.keys(tcColMap).forEach(k => {
        if (typeof tcColMap[k] === 'string') tcColMap[k] = headersTC.indexOf(tcColMap[k]);
    });

    if (tcColMap.title === -1 || tcColMap.steps === -1 || tcColMap.expected === -1) {
        return res.status(400).json({ error: 'Faltan columnas obligatorias (Escenario, Pasos, Resultado Esperado)' });
    }

    const groups = {};
    for (let i = 1; i < dataTC.length; i++) {
        const row = dataTC[i];
        const usTitle = sanitizeInput(row[tcColMap.us_title]);
        if (!usTitle) continue;
        if (!groups[usTitle]) groups[usTitle] = [];
        groups[usTitle].push(row);
    }

    let totalImported = 0;
    let usCount = 0;

    const client = await getClient();
    const q = client.query;
    try {
        await q('BEGIN');
        for (const usTitle in groups) {
            const rows = groups[usTitle];
            const firstRow = rows[0];

            const suiteKey = await generateKey(projectId, 'ST', q);
            const suiteResNew = await q(`
                INSERT INTO qa_test_suites (use_case_id, project_id, title, description, key_id, created_by)
                VALUES (?, ?, ?, ?, ?, ?)
                RETURNING id
            `, [ucId, projectId, `Suite: ${usTitle}`, `Importación automática ${suiteKey}`, suiteKey, req.user.id]);
            const suiteId = suiteResNew.rows[0].id;

            const usKey = await generateKey(projectId, 'US', q);
            const usDesc = sanitizeInput(firstRow[tcColMap.us_desc]) || '';
            const usBR = sanitizeInput(firstRow[tcColMap.us_br]) || '';
            const usPre = sanitizeInput(firstRow[tcColMap.us_pre]) || '';

            const usRes = await q(`
                INSERT INTO qa_user_stories (use_case_id, project_id, key_id, title, hu_detallada, reglas_negocio, precondiciones, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (key_id) DO UPDATE SET title = EXCLUDED.title
                RETURNING id
            `, [ucId, projectId, usKey, usTitle, usDesc, usBR, usPre, req.user.id]);
            const usId = usRes.rows[0].id;
            usCount++;

            let escenariosText = [];
            const validRows = rows.filter(row => {
                const getVal = (idx) => idx !== -1 && row[idx] !== undefined ? sanitizeInput(row[idx]) : '';
                return getVal(tcColMap.title);
            });
            let tcKeyStart = null;
            if (validRows.length > 0) {
                tcKeyStart = await generateKeyBatch(projectId, 'TC', validRows.length, q);
            }
            let tcIdx = 0;
            for (const row of rows) {
                const getVal = (idx) => idx !== -1 && row[idx] !== undefined ? sanitizeInput(row[idx]) : '';

                const title = getVal(tcColMap.title);
                if (!title) continue;

                const steps = getVal(tcColMap.steps);
                const pre = getVal(tcColMap.pre);
                const expected = getVal(tcColMap.expected);
                const assumptions = getVal(tcColMap.assumptions);
                const testData = getVal(tcColMap.data);
                const criteria = getVal(tcColMap.criteria);

                const scenarioRes = await q(
                    `INSERT INTO qa_scenarios (us_id, title, order_index) VALUES (?, ?, ?) RETURNING id`,
                    [usId, title, totalImported]
                );
                const scenarioId = scenarioRes.rows[0].id;
                escenariosText.push(title);

                const tcNum = tcKeyStart + tcIdx;
                const tcKey = `TC-${tcNum.toString().padStart(4, '0')}`;
                tcIdx++;
                await q(`
                    INSERT INTO qa_test_cases (suite_id, us_id, scenario_id, key_id, title, steps, preconditions, expected_result, assumptions, test_data, acceptance_criteria, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [suiteId, usId, scenarioId, tcKey, title, steps, pre, expected, assumptions, testData, criteria, req.user.id]);

                totalImported++;
            }

            if (escenariosText.length > 0) {
                await q(`UPDATE qa_user_stories SET escenarios_prueba = ? WHERE id = ?`, [escenariosText.join('\n'), usId]);
            }
        }

        await q('COMMIT');
        client.release();
        return res.json({
            ok: true,
            message: `Importación exitosa. Se creó la suite "${file.originalname}" con ${usCount} historias de usuario y ${totalImported} tests.`
        });
    } catch (err) {
        await q('ROLLBACK');
        client.release();
        throw err;
    }
}
// Exportar Matriz de Pruebas Completa (Todas las suites del CU) a Excel unificado
app.get('/api/use-cases/:id/export-excel', requireAuth, async (req, res) => {
    try {
        const useCaseId = req.params.id;

        // 1. Obtener datos del Caso de Uso y Proyecto
        const ucRes = await query(`
            SELECT uc.*, p.name as project_name
            FROM qa_use_cases uc
            JOIN qa_projects p ON uc.project_id = p.id
            WHERE uc.id = ?
        `, [useCaseId]);

        if (ucRes.rows.length === 0) return res.status(404).json({ error: 'Caso de Uso no encontrado' });
        const useCase = ucRes.rows[0];

        // 2. Obtener Test Cases de TODAS las suites de este CU y sus ejecuciones más recientes
        const casesRes = await query(`
            SELECT tc.*, us.title as us_title, us.key_id as us_key, s.title as suite_title,
                   uc.title as uc_title,
                   e.status as last_status, e.observations, e.obtained_result, e.tester, e.executed_at
            FROM qa_test_cases tc
            JOIN qa_test_suites s ON tc.suite_id = s.id
            LEFT JOIN qa_user_stories us ON tc.us_id = us.id
            LEFT JOIN qa_use_cases uc ON s.use_case_id = uc.id
            LEFT JOIN LATERAL (
                SELECT status, observations, obtained_result, tester, executed_at
                FROM qa_executions
                WHERE tc_id = tc.id
                ORDER BY executed_at DESC
                LIMIT 1
            ) e ON true
            WHERE s.use_case_id = ?
            ORDER BY s.id, us.id, tc.id
        `, [useCaseId]);

        // 3. Construir workbook con SheetJS (compatible con import)
        const wb = XLSX.utils.book_new();

        // Encabezados unificados
        const headers = [
            'CU Vinculado',
            'Suite / Grupo',
            'ID Test',
            'HU / Requerimiento',
            'Escenario / Título',
            'Precondiciones',
            'Pasos de Reproducción',
            'Datos de Prueba',
            'Resultado Esperado',
            'Criterios Aceptación',
            'Assumptions',
            'Estado',
            'Resultado Obtenido',
            'Observaciones / Hallazgos',
            'Tester',
            'Fecha Ejecución'
        ];

        // Construir array de datos
        const data = [headers];
        casesRes.rows.forEach((tc) => {
            data.push([
                tc.uc_title || useCase.title || '',
                tc.suite_title || '',
                tc.key_id || `TC-${tc.id}`,
                tc.us_title ? `[${tc.us_key || 'N/A'}] ${tc.us_title}` : 'Sin HU vinculada',
                tc.title || '',
                tc.preconditions || '',
                tc.steps || tc.description || '',
                tc.test_data || '',
                tc.expected_result || '',
                tc.acceptance_criteria || '',
                tc.assumptions || '',
                tc.last_status || 'PENDIENTE',
                tc.obtained_result || '',
                tc.observations || '',
                tc.tester || '',
                tc.executed_at ? new Date(tc.executed_at).toLocaleString() : '-'
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(data);

        // Ajustar ancho de columnas
        ws['!cols'] = [
            { wch: 30 }, // CU Vinculado
            { wch: 25 }, // Suite / Grupo
            { wch: 15 }, // ID Test
            { wch: 35 }, // HU / Requerimiento
            { wch: 45 }, // Escenario / Título
            { wch: 40 }, // Precondiciones
            { wch: 55 }, // Pasos de Reproducción
            { wch: 40 }, // Datos de Prueba
            { wch: 45 }, // Resultado Esperado
            { wch: 40 }, // Criterios Aceptación
            { wch: 40 }, // Assumptions
            { wch: 15 }, // Estado
            { wch: 45 }, // Resultado Obtenido
            { wch: 45 }, // Observaciones / Hallazgos
            { wch: 15 }, // Tester
            { wch: 22 }  // Fecha Ejecución
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Matriz de Pruebas');

        // Generar buffer xlsx
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Matriz_${useCase.key_id || 'CU'}_${new Date().toISOString().split('T')[0]}.xlsx"`);
        res.send(buf);

    } catch (err) {
        console.error('❌ Error en exportación Excel:', err);
        res.status(500).json({ error: 'Error interno al generar el reporte Excel.', detalle: err.message });
    }
});

// Exportar Matriz de Pruebas de TODO el Proyecto (todos los CU) a Excel unificado
app.get('/api/projects/:id/export-excel', requireAuth, async (req, res) => {
    try {
        const projectId = req.params.id;

        // 1. Obtener datos del Proyecto
        const projRes = await query(`SELECT * FROM qa_projects WHERE id = ?`, [projectId]);
        if (projRes.rows.length === 0) return res.status(404).json({ error: 'Proyecto no encontrado' });
        const project = projRes.rows[0];

        // 2. Obtener TODOS los Test Cases de TODOS los CU del proyecto
        const casesRes = await query(`
            SELECT tc.*, us.title as us_title, us.key_id as us_key, s.title as suite_title,
                   uc.title as uc_title, uc.key_id as uc_key,
                   e.status as last_status, e.observations, e.obtained_result, e.tester, e.executed_at
            FROM qa_test_cases tc
            JOIN qa_test_suites s ON tc.suite_id = s.id
            JOIN qa_use_cases uc ON s.use_case_id = uc.id
            LEFT JOIN qa_user_stories us ON tc.us_id = us.id
            LEFT JOIN LATERAL (
                SELECT status, observations, obtained_result, tester, executed_at
                FROM qa_executions
                WHERE tc_id = tc.id
                ORDER BY executed_at DESC
                LIMIT 1
            ) e ON true
            WHERE uc.project_id = ?
            ORDER BY uc.id, s.id, us.id, tc.id
        `, [projectId]);

        // 3. Construir workbook con SheetJS
        const wb = XLSX.utils.book_new();

        const headers = [
            'CU Vinculado',
            'Suite / Grupo',
            'ID Test',
            'HU / Requerimiento',
            'Escenario / Título',
            'Precondiciones',
            'Pasos de Reproducción',
            'Datos de Prueba',
            'Resultado Esperado',
            'Criterios Aceptación',
            'Assumptions',
            'Estado',
            'Resultado Obtenido',
            'Observaciones / Hallazgos',
            'Tester',
            'Fecha Ejecución'
        ];

        const data = [headers];
        casesRes.rows.forEach((tc) => {
            data.push([
                tc.uc_title || '',
                tc.suite_title || '',
                tc.key_id || `TC-${tc.id}`,
                tc.us_title ? `[${tc.us_key || 'N/A'}] ${tc.us_title}` : 'Sin HU vinculada',
                tc.title || '',
                tc.preconditions || '',
                tc.steps || tc.description || '',
                tc.test_data || '',
                tc.expected_result || '',
                tc.acceptance_criteria || '',
                tc.assumptions || '',
                tc.last_status || 'PENDIENTE',
                tc.obtained_result || '',
                tc.observations || '',
                tc.tester || '',
                tc.executed_at ? new Date(tc.executed_at).toLocaleString() : '-'
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(data);

        ws['!cols'] = [
            { wch: 30 },
            { wch: 25 },
            { wch: 15 },
            { wch: 35 },
            { wch: 45 },
            { wch: 40 },
            { wch: 55 },
            { wch: 40 },
            { wch: 45 },
            { wch: 40 },
            { wch: 40 },
            { wch: 15 },
            { wch: 45 },
            { wch: 45 },
            { wch: 15 },
            { wch: 22 }
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Matriz de Pruebas');

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Matriz_Proyecto_${project.key_id || project.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx"`);
        res.send(buf);

    } catch (err) {
        console.error('❌ Error en exportación de proyecto:', err);
        res.status(500).json({ error: 'Error interno al generar el reporte del proyecto.', detalle: err.message });
    }
});

// Iniciar ciclo de ejecución inteligente








app.use('/api/stats', statsRouter);




// Descartar / reabrir un bug (cualquier tester del proyecto).
// `dismissed` = true → status='DISMISSED', false → status='OPEN'.
// El bug descartado sigue visible (con badge atenuado) pero NO se cuenta en
// las estadísticas agregadas (epic report, jira tracking).

// Iniciar Retesting: Crea un nuevo run basado en los fallos de uno anterior




// ══════════════════════════════════════════════════════════════
// ── HALLAZGOS QA ──
// ══════════════════════════════════════════════════════════════







// Asigna o quita el TC origen (Test Case al que se asocia este hallazgo).
// Body: { tc_id: number | null }
// Si tc_id es null → elimina la asociación. Si es number → reemplaza la asociación.
// Reusa la junction qa_hallazgo_tc (ya creada en el schema de campos transversales).


// Promueve un Hallazgo (execution_id IS NULL) a un Bug (execution_id IS NOT NULL).
// FUTURO: la estrategia acordada es "mover el row" via:
//   UPDATE qa_defects SET execution_id = ? WHERE id = ? AND execution_id IS NULL
//   INSERT INTO qa_hallazgo_bug (hallazgo_id, defect_id) VALUES (?, ?)
// Hoy se delega el trabajo: el endpoint responde 501 con la forma exacta que tendrá
// cuando se implemente, para que la UI pueda ya cablear el botón y el contrato.

// ══════════════════════════════════════════════════════════════
// ── TOOLS: REQUEST BUILDER (proxy HTTP) ──
// ══════════════════════════════════════════════════════════════

// ── TOOLS ──
// Implementación en src/routes/tools.js.
app.use('/api/tools', toolsRouter);








app.post('/api/jira/hallazgos/:id/create-ticket', requireAuth, async (req, res) => {
    try {
        const hallazgoId = req.params.id;
        const { epicId, assigneeId, priorityId, customFields } = req.body;

        const bugRes = await query(`
            SELECT d.*, u.name as tester_name
            FROM qa_defects d
            LEFT JOIN qa_users u ON d.created_by = u.id
            WHERE d.id = ? AND d.execution_id IS NULL
        `, [hallazgoId]);
        if (bugRes.rows.length === 0) return res.status(404).json({ error: 'Hallazgo no encontrado.' });
        const bug = bugRes.rows[0];

        if (bug.status === 'DISMISSED') {
            return res.status(400).json({ error: 'No se puede crear un ticket de Jira de un bug descartado. Reabrí el bug primero.' });
        }

        const projectId = bug.project_id;

        const evidenceRes = await query(`SELECT id, file_name, mime_type, storage_kind, storage_path, sha256 FROM qa_attachments WHERE defect_id = ?`, [hallazgoId]);
        if (evidenceRes.rows.length > 0) {
            bug.evidences = evidenceRes.rows.map(r => r.file_name);
        }

        const creds = await getJiraUserCredentials(projectId, req.user.id);
        if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error });

        const jiraResult = await JiraService.createIssue(creds.userCredentials, creds.projectKey, creds.domain, bug, epicId, assigneeId, priorityId, customFields);
        const jiraUrl = `${jiraResult.self.split('/rest/')[0]}/browse/${jiraResult.key}`;

        let attachmentCount = 0;
        const attachmentErrors = [];
        if (evidenceRes.rows.length > 0) {
            for (const ev of evidenceRes.rows) {
                try {
                    let fileBuffer;
                    if (ev.storage_kind === 'local' && ev.storage_path) {
                        fileBuffer = evidenceStore.read(ev.storage_path);
                    } else {
                        const leg = await query(`SELECT encode(file_data, 'hex') as file_hex FROM qa_attachments WHERE id = ?`, [ev.id]);
                        const hex = (leg.rows[0] && leg.rows[0].file_hex || '').replace(/^\\x/, '');
                        fileBuffer = Buffer.from(hex, 'hex');
                    }
                    await JiraService.attachFile(creds.userCredentials, creds.domain, jiraResult.key, ev.file_name, fileBuffer, ev.mime_type);
                    attachmentCount++;
                } catch (attachErr) {
                    attachmentErrors.push({ file: ev.file_name, error: attachErr.message });
                }
            }
        }

        await query(`UPDATE qa_defects SET jira_key = ?, jira_url = ? WHERE id = ?`, [jiraResult.key, jiraUrl, hallazgoId]);

        res.json({ ok: true, jira: { ...jiraResult, browser_url: jiraUrl }, attachment_count: attachmentCount, attachment_errors: attachmentErrors });
    } catch (err) {
        console.error("Error al crear ticket en Jira:", err);
        res.status(500).json({ error: err.message });
    }
});

const { generateReport, generateMultiReport } = require('./report-generator');

app.get('/api/reports/multi', requireAuth, async (req, res) => {
    try {
        const ids = (req.query.ids || '').split(',').map(Number).filter(n => n > 0);
        if (ids.length < 2) return res.status(400).json({ error: 'Se requieren al menos 2 IDs de ejecución' });
        const html = await generateMultiReport(ids);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/reports/hallazgos?ids=1,2,3 ──────────────────────────────────────
app.get('/api/reports/hallazgos', requireAuth, async (req, res) => {
    try {
        const ids = (req.query.ids || '').split(',').map(Number).filter(n => !isNaN(n) && n > 0);
        if (ids.length === 0) return res.status(400).json({ error: 'Sin hallazgos seleccionados' });

        const placeholders = ids.map(() => '?').join(',');
        const defects = await query(`
            SELECT d.id, d.title, d.description, d.severity, d.status, d.created_at,
                   d.steps_to_reproduce, d.expected_result, d.actual_result,
                   d.frequency, d.business_impact, d.preconditions, d.observations,
                   d.jira_key, d.jira_url, d.component,
                   p.name as project_name,
                   u1.name as assignee_name, u2.name as reporter_name
            FROM qa_defects d
            JOIN qa_projects p ON d.project_id = p.id
            LEFT JOIN qa_users u1 ON d.assigned_to = u1.id
            LEFT JOIN qa_users u2 ON d.created_by = u2.id
            WHERE d.id IN (${placeholders})
            ORDER BY d.severity DESC, d.created_at DESC
        `, ids);

        const attachments = await query(`
            SELECT a.id, a.defect_id
            FROM qa_attachments a
            WHERE a.defect_id IN (${placeholders})
        `, ids);

        const evidByDef = {};
        for (const a of attachments.rows) {
            const ev = await getEvidenceBase64(a.id);
            if (ev) {
                evidByDef[a.defect_id] = evidByDef[a.defect_id] || [];
                evidByDef[a.defect_id].push(ev);
            }
        }

        function esc(str) { return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

        const sevColors = { 'Crítica': '#dc2626', 'Alta': '#ea580c', 'Media': '#d97706', 'Baja': '#059669' };
        const sevBg = { 'Crítica': '#fee2e2', 'Alta': '#ffedd5', 'Media': '#fef3c7', 'Baja': '#d1fae5' };

        let defectsHTML = '';
        for (const d of defects.rows) {
            const evidHTML = (evidByDef[d.id] || []).map(ev => evidenceHTML(ev, 250)).join('');
            const sevColor = sevColors[d.severity] || '#6b7280';
            const sevBgColor = sevBg[d.severity] || '#f3f4f6';

            defectsHTML += `
                <div style="padding:16px; background:white; border-radius:10px; margin-bottom:14px; border-left:5px solid ${sevColor}; box-shadow:0 1px 4px rgba(0,0,0,0.08);">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                        <div style="flex:1;">
                            <div style="font-weight:700; font-size:0.9rem; color:var(--apple-label);">#${d.id} - ${esc(d.title)}</div>
                            <div style="font-size:0.72rem; color:var(--apple-label-secondary); margin-top:2px;">
                                ${esc(d.project_name)} | Reportado por: ${esc(d.reporter_name || '—')} | ${d.created_at ? new Date(d.created_at).toLocaleDateString('es-AR') : '—'}
                            </div>
                        </div>
                        <div style="display:flex; gap:6px; align-items:center;">
                            <span style="padding:3px 10px; border-radius:20px; font-size:0.65rem; font-weight:700; background:${sevBgColor}; color:${sevColor};">${esc(d.severity)}</span>
                            <span style="padding:3px 10px; border-radius:20px; font-size:0.65rem; font-weight:700; background:${d.status === 'OPEN' ? '#fee2e2' : '#d1fae5'}; color:${d.status === 'OPEN' ? '#dc2626' : '#059669'};">${esc(d.status)}</span>
                        </div>
                    </div>
                    ${d.description ? `<div style="font-size:0.8rem; margin-top:6px; padding:8px; background:var(--apple-fill); border-radius:6px;">${esc(d.description)}</div>` : ''}
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px;">
                        ${d.steps_to_reproduce ? `<div style="font-size:0.75rem; padding:8px; background:#f9fafb; border-radius:6px;"><strong>Pasos:</strong><br>${esc(d.steps_to_reproduce)}</div>` : ''}
                        ${d.expected_result ? `<div style="font-size:0.75rem; padding:8px; background:rgba(52,199,89,0.06); border-radius:6px;"><strong>Esperado:</strong><br>${esc(d.expected_result)}</div>` : ''}
                        ${d.actual_result ? `<div style="font-size:0.75rem; padding:8px; background:rgba(255,59,48,0.06); border-radius:6px;"><strong>Actual:</strong><br>${esc(d.actual_result)}</div>` : ''}
                        ${d.observations ? `<div style="font-size:0.75rem; padding:8px; background:#f9fafb; border-radius:6px;"><strong>Observaciones:</strong><br>${esc(d.observations)}</div>` : ''}
                    </div>
                    ${d.jira_key ? `<div style="font-size:0.72rem; margin-top:6px; color:var(--apple-blue);">Jira: <a href="${esc(d.jira_url || '#')}" target="_blank">${esc(d.jira_key)}</a></div>` : ''}
                    ${evidHTML ? `<div style="margin-top:10px;"><div style="font-size:0.68rem; font-weight:700; color:var(--apple-label-tertiary); text-transform:uppercase; margin-bottom:4px;">Evidencias</div><div>${evidHTML}</div></div>` : ''}
                </div>
            `;
        }

        const totalOpen = defects.rows.filter(d => d.status === 'OPEN').length;
        const totalCrit = defects.rows.filter(d => d.severity === 'Crítica' || d.severity === 'Alta').length;

        const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Reporte de Hallazgos Seleccionados</title>
        <style>body{font-family:'Segoe UI',system-ui,sans-serif;background:#f3f4f6;margin:0;padding:20px;color:#111827}
        .header{background:linear-gradient(135deg,#7c3aed,#5b21b6);color:white;border-radius:12px;padding:24px;margin-bottom:24px}
        .header h1{margin:0 0 4px;font-size:1.3rem}.header p{margin:0;opacity:.9;font-size:.85rem}
        .kpi{background:white;border-radius:8px;padding:14px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.1);border-top:3px solid #e5e7eb}
        .kpi-val{font-size:1.4rem;font-weight:700}.kpi-lab{font-size:.65rem;color:#6b7280;text-transform:uppercase}
        .footer{text-align:center;padding:16px;color:#6b7280;font-size:.75rem}
        @media print{body{background:white;padding:0}}</style></head><body>
        <div class="header">
            <h1>Reporte de Hallazgos Seleccionados</h1>
            <p>${defects.rows.length} hallazgo(s) | ${new Date().toLocaleDateString('es-AR')}</p>
        </div>
        <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
            <div class="kpi"><div class="kpi-val">${defects.rows.length}</div><div class="kpi-lab">Total</div></div>
            <div class="kpi"><div class="kpi-val" style="color:#dc2626">${totalOpen}</div><div class="kpi-lab">Abiertos</div></div>
            <div class="kpi"><div class="kpi-val" style="color:#ea580c">${totalCrit}</div><div class="kpi-lab">Alta/Crítica</div></div>
        </div>
        ${defectsHTML}
        <div class="footer">Reporte generado automáticamente | ${new Date().toLocaleString('es-AR')}</div>
        ${lightboxHTML()}
        </body></html>`;

        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports/:runId', requireAuth, async (req, res) => {
    try {
        const html = await generateReport(req.params.runId);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Reportes por Tester ──

async function getEvidenceBase64(attachmentId) {
    try {
        const result = await query(
            `SELECT id, mime_type, storage_kind, storage_path, file_data FROM qa_attachments WHERE id = ?`,
            [attachmentId]
        );
        if (result.rows.length === 0) return null;
        const r = result.rows[0];

        let buffer;
        if (r.storage_kind === 'legacy_pg' || !r.storage_kind || !r.storage_path) {
            if (!r.file_data) return null;
            buffer = Buffer.from(r.file_data, 'base64');
        } else {
            const abs = evidenceStore.absolutePath(r.storage_path);
            if (!fs.existsSync(abs)) return null;
            buffer = fs.readFileSync(abs);
        }

        const isVideo = (r.mime_type || '').startsWith('video/');
        if (isVideo) {
            return { type: 'video', mime: r.mime_type, data: `data:${r.mime_type};base64,${buffer.toString('base64')}` };
        }

        const compressed = await sharp(buffer)
            .resize(800, 600, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 60 })
            .toBuffer();

        return { type: 'image', mime: 'image/jpeg', data: `data:image/jpeg;base64,${compressed.toString('base64')}` };
    } catch (e) {
        return null;
    }
}

function evidenceHTML(ev, maxWidth = 200) {
    if (!ev) return '';
    if (ev.type === 'video') {
        return `<video src="${ev.data}" controls preload="none" style="max-width:${maxWidth}px; border-radius:6px; margin:4px; cursor:pointer;" title="Click para reproducir"></video>`;
    }
    return `<img src="${ev.data}" style="max-width:${maxWidth}px; border-radius:6px; margin:4px; cursor:pointer; transition:transform 0.2s;" onclick="openLightbox(this.src)" onmouseenter="this.style.transform='scale(1.05)'" onmouseleave="this.style.transform='scale(1)'" title="Click para ampliar">`;
}

function lightboxHTML() {
    return `
        <div id="lightbox" onclick="closeLightbox()" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index:9999; cursor:pointer; align-items:center; justify-content:center;">
            <img id="lightbox-img" style="max-width:95vw; max-height:95vh; object-fit:contain; border-radius:8px;">
            <button onclick="closeLightbox()" style="position:absolute; top:20px; right:20px; background:white; border:none; width:40px; height:40px; border-radius:50%; font-size:1.2rem; cursor:pointer; font-weight:700;">✕</button>
        </div>
        <script>
            function openLightbox(src) {
                document.getElementById('lightbox-img').src = src;
                document.getElementById('lightbox').style.display = 'flex';
            }
            function closeLightbox() {
                document.getElementById('lightbox').style.display = 'none';
                document.getElementById('lightbox-img').src = '';
            }
            document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });
        </script>
    `;
}

async function generateTesterReport(userId, { dateFrom, dateTo, projectIds } = {}) {
    // Obtener nombre y email del usuario para fallback con campo 'tester'
    const userRow = await query(`SELECT name, email FROM qa_users WHERE id = ?`, [userId]);
    const userName = userRow.rows[0]?.name || '';
    const userEmail = userRow.rows[0]?.email || '';

    const testerClause = `(e.tester_id = ? OR (e.tester_id IS NULL AND (e.tester = ? OR e.tester = ?)))`;
    const params = [userId, userName, userEmail];
    const REPORT_TZ = 'America/Argentina/Buenos_Aires';
    let dateExecClause = '';
    let dateDefectClause = '';

    if (dateFrom) {
        dateExecClause += ` AND (e.executed_at AT TIME ZONE '${REPORT_TZ}')::date >= ?`;
        params.push(dateFrom);
    }
    if (dateTo) {
        dateExecClause += ` AND (e.executed_at AT TIME ZONE '${REPORT_TZ}')::date <= ?`;
        params.push(dateTo);
    }

    const defectParams = [userId];
    if (dateFrom) {
        dateDefectClause += ` AND (d.created_at AT TIME ZONE '${REPORT_TZ}')::date >= ?`;
        defectParams.push(dateFrom);
    }
    if (dateTo) {
        dateDefectClause += ` AND (d.created_at AT TIME ZONE '${REPORT_TZ}')::date <= ?`;
        defectParams.push(dateTo);
    }

    let projectClause = '';
    if (projectIds && projectIds.length > 0) {
        const placeholders = projectIds.map(() => '?').join(',');
        projectClause = ` AND p.id IN (${placeholders})`;
    }

    const execSql = `
        SELECT e.id, e.status, e.executed_at, e.observations, e.obtained_result,
               tc.title as tc_title, tc.id as tc_id,
               COALESCE(p.name, 'Sin proyecto') as project_name, COALESCE(p.id, 0) as project_id,
               s.title as suite_name
        FROM qa_executions e
        JOIN qa_test_cases tc ON e.tc_id = tc.id
        JOIN qa_test_runs r ON e.run_id = r.id
        JOIN qa_test_suites s ON r.suite_id = s.id
        LEFT JOIN qa_use_cases uc ON s.use_case_id = uc.id
        LEFT JOIN qa_projects p ON COALESCE(s.project_id, uc.project_id) = p.id
        WHERE ${testerClause} ${dateExecClause} ${projectClause}
        ORDER BY COALESCE(p.name, 'Sin proyecto'), e.executed_at DESC
    `;
    const execParams = projectIds && projectIds.length > 0 ? [...params, ...projectIds] : params;
    const execs = await query(execSql, execParams);

    const defectSql = `
        SELECT d.id, d.title, d.severity, d.status, d.created_at, d.actual_result,
               COALESCE(p.name, 'Sin proyecto') as project_name, COALESCE(p.id, 0) as project_id
        FROM qa_defects d
        LEFT JOIN qa_executions e ON d.execution_id = e.id
        LEFT JOIN qa_test_runs r ON e.run_id = r.id
        LEFT JOIN qa_test_suites s ON r.suite_id = s.id
        LEFT JOIN qa_use_cases uc ON s.use_case_id = uc.id
        LEFT JOIN qa_projects p ON COALESCE(d.project_id, s.project_id, uc.project_id) = p.id
        WHERE d.created_by = ? ${dateDefectClause} ${projectClause}
        ORDER BY COALESCE(p.name, 'Sin proyecto'), d.created_at DESC
    `;
    const defectParamsFinal = projectIds && projectIds.length > 0 ? [...defectParams, ...projectIds] : defectParams;
    const defects = await query(defectSql, defectParamsFinal);

    const attachments = await query(`
        SELECT a.id, a.execution_id, a.defect_id
        FROM qa_attachments a
        WHERE a.execution_id IN (${execs.rows.map(e => e.id).join(',') || '0'})
           OR a.defect_id IN (${defects.rows.map(d => d.id).join(',') || '0'})
    `, []);

    const evidByExec = {};
    const evidByDef = {};
    for (const a of attachments.rows) {
        const b64 = await getEvidenceBase64(a.id);
        if (b64) {
            if (a.execution_id) { evidByExec[a.execution_id] = evidByExec[a.execution_id] || []; evidByExec[a.execution_id].push(b64); }
            if (a.defect_id) { evidByDef[a.defect_id] = evidByDef[a.defect_id] || []; evidByDef[a.defect_id].push(b64); }
        }
    }

    const projects = {};
    for (const e of execs.rows) {
        if (!projects[e.project_id]) projects[e.project_id] = { name: e.project_name, execs: [], defects: [] };
        projects[e.project_id].execs.push(e);
    }
    for (const d of defects.rows) {
        if (!projects[d.project_id]) projects[d.project_id] = { name: d.project_name, execs: [], defects: [] };
        projects[d.project_id].defects.push(d);
    }

    return { projects, evidByExec, evidByDef, dateFrom, dateTo };
}

function renderTesterReportHTML(data, userName) {
    const { projects, evidByExec, evidByDef, dateFrom, dateTo } = data;
    const dateLabel = dateFrom && dateTo ? `${dateFrom} al ${dateTo}` : dateFrom ? `Desde ${dateFrom}` : dateTo ? `Hasta ${dateTo}` : 'Completo';
    const title = `Reporte de Actividad - ${dateLabel}`;
    const totalExecs = Object.values(projects).reduce((s, p) => s + p.execs.length, 0);
    const totalDefects = Object.values(projects).reduce((s, p) => s + p.defects.length, 0);
    const totalPassed = Object.values(projects).reduce((s, p) => s + p.execs.filter(e => ['OK', 'PASS'].includes(e.status)).length, 0);
    const totalFailed = Object.values(projects).reduce((s, p) => s + p.execs.filter(e => e.status === 'FAIL').length, 0);
    const totalBlocked = Object.values(projects).reduce((s, p) => s + p.execs.filter(e => ['BLOCK', 'BLOCKED'].includes(e.status)).length, 0);
    const passRate = totalExecs > 0 ? ((totalPassed / totalExecs) * 100).toFixed(1) : 0;

    let projectsHTML = '';
    for (const [pid, proj] of Object.entries(projects)) {
        const pPassed = proj.execs.filter(e => ['OK', 'PASS'].includes(e.status)).length;
        const pFailed = proj.execs.filter(e => e.status === 'FAIL').length;
        const pBlocked = proj.execs.filter(e => ['BLOCK', 'BLOCKED'].includes(e.status)).length;
        const pSkip = proj.execs.filter(e => ['SKIP', 'SKIPPED'].includes(e.status)).length;

        let execRows = '';
        for (const e of proj.execs) {
            const statusClass = ['OK', 'PASS'].includes(e.status) ? 'pass' : e.status === 'FAIL' ? 'fail' : e.status === 'SKIP' || e.status === 'SKIPPED' ? 'skip' : 'block';
            const evidHTML = (evidByExec[e.id] || []).map(ev => evidenceHTML(ev, 200)).join('');
            execRows += `<tr>
                <td>${e.tc_title || 'N/A'}</td>
                <td><span class="status-badge ${statusClass}">${e.status}</span></td>
                <td>${e.executed_at ? new Date(e.executed_at).toLocaleString('es-AR') : 'N/A'}</td>
                <td>${e.obtained_result || '-'}</td>
                <td>${evidHTML || '-'}</td>
            </tr>`;
        }

        let defectRows = '';
        for (const d of proj.defects) {
            const sevClass = d.severity === 'Alta' || d.severity === 'Crítica' ? 'fail' : d.severity === 'Media' ? 'block' : 'pass';
            const evidHTML = (evidByDef[d.id] || []).map(ev => evidenceHTML(ev, 200)).join('');
            defectRows += `<tr>
                <td>${d.title}</td>
                <td><span class="status-badge ${sevClass}">${d.severity}</span></td>
                <td><span class="status-badge ${d.status === 'OPEN' ? 'fail' : 'pass'}">${d.status}</span></td>
                <td>${d.actual_result || '-'}</td>
                <td>${d.created_at ? new Date(d.created_at).toLocaleString('es-AR') : 'N/A'}</td>
                <td>${evidHTML || '-'}</td>
            </tr>`;
        }

        projectsHTML += `
        <div class="project-section">
            <h2>${proj.name}</h2>
            <div class="project-kpis">
                <div class="kpi"><div class="kpi-val">${proj.execs.length}</div><div class="kpi-lab">Tests</div></div>
                <div class="kpi green"><div class="kpi-val">${pPassed}</div><div class="kpi-lab">Pasados</div></div>
                <div class="kpi red"><div class="kpi-val">${pFailed}</div><div class="kpi-lab">Fallidos</div></div>
                <div class="kpi orange"><div class="kpi-val">${pBlocked}</div><div class="kpi-lab">Bloqueados</div></div>
                <div class="kpi"><div class="kpi-val">${pSkip}</div><div class="kpi-lab">Saltados</div></div>
                <div class="kpi purple"><div class="kpi-val">${proj.defects.length}</div><div class="kpi-lab">Hallazgos</div></div>
            </div>
            ${proj.execs.length > 0 ? `
            <h3>Ejecuciones</h3>
            <table><thead><tr><th>Test Case</th><th>Estado</th><th>Fecha</th><th>Resultado Real</th><th>Evidencias</th></tr></thead><tbody>${execRows}</tbody></table>` : ''}
            ${proj.defects.length > 0 ? `
            <h3>Hallazgos</h3>
            <table><thead><tr><th>Título</th><th>Severidad</th><th>Estado</th><th>Resultado Actual</th><th>Fecha</th><th>Evidencias</th></tr></thead><tbody>${defectRows}</tbody></table>` : ''}
        </div>`;
    }

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${title}</title>
    <style>
        body{font-family:'Segoe UI',system-ui,sans-serif;background:#f3f4f6;margin:0;padding:20px;color:#111827}
        .header{background:linear-gradient(135deg,#1e40af,#7c3aed);color:white;border-radius:12px;padding:24px;margin-bottom:24px}
        .header h1{margin:0 0 4px;font-size:1.5rem}.header p{margin:0;opacity:.9;font-size:.9rem}
        .kpis{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px}
        .kpi{background:white;border-radius:8px;padding:16px;text-align:center;min-width:100px;box-shadow:0 1px 3px rgba(0,0,0,.1);border-top:3px solid #e5e7eb}
        .kpi.green{border-top-color:#059669}.kpi.red{border-top-color:#dc2626}.kpi.orange{border-top-color:#d97706}.kpi.purple{border-top-color:#7c3aed}
        .kpi-val{font-size:1.5rem;font-weight:700;color:#111827}.kpi-lab{font-size:.7rem;color:#6b7280;text-transform:uppercase}
        .project-section{background:white;border-radius:8px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.1)}
        .project-section h2{margin:0 0 12px;font-size:1.1rem;color:#1e40af}
        .project-section h3{margin:16px 0 8px;font-size:.85rem;color:#6b7280;text-transform:uppercase}
        .project-kpis{display:flex;gap:12px;flex-wrap:wrap}
        table{width:100%;border-collapse:collapse;font-size:.82rem}
        th{background:#f9fafb;padding:8px;text-align:left;font-size:.7rem;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb}
        td{padding:8px;border-bottom:1px solid #f3f4f6;vertical-align:top}
        .status-badge{padding:2px 8px;border-radius:4px;font-size:.7rem;font-weight:600}
        .status-badge.pass{background:#d1fae5;color:#059669}.status-badge.fail{background:#fee2e2;color:#dc2626}
        .status-badge.block{background:#fef3c7;color:#d97706}.status-badge.skip{background:#f3f4f6;color:#6b7280}
        .footer{text-align:center;padding:16px;color:#6b7280;font-size:.75rem}
        @media print{body{background:white;padding:0}}
    </style></head><body>
    <div class="header">
        <h1>${title}</h1>
        <p>Tester: ${userName} | Periodo: ${dateLabel}</p>
    </div>
    <div class="kpis">
        <div class="kpi"><div class="kpi-val">${totalExecs}</div><div class="kpi-lab">Tests Totales</div></div>
        <div class="kpi green"><div class="kpi-val">${totalPassed}</div><div class="kpi-lab">Pasados</div></div>
        <div class="kpi red"><div class="kpi-val">${totalFailed}</div><div class="kpi-lab">Fallidos</div></div>
        <div class="kpi orange"><div class="kpi-val">${totalBlocked}</div><div class="kpi-lab">Bloqueados</div></div>
        <div class="kpi"><div class="kpi-val">${passRate}%</div><div class="kpi-lab">Tasa Aprobación</div></div>
        <div class="kpi purple"><div class="kpi-val">${totalDefects}</div><div class="kpi-lab">Hallazgos</div></div>
    </div>
    ${Object.keys(projects).length === 0 ? '<div style="text-align:center;padding:40px;color:#6b7280;">Sin actividad registrada</div>' : projectsHTML}
    <div class="footer">Reporte generado automáticamente | ${new Date().toLocaleString('es-AR')}</div>
    ${lightboxHTML()}
    </body></html>`;
}

app.get('/api/reports/tester/daily', requireAuth, async (req, res) => {
    try {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
        const data = await generateTesterReport(req.user.id, { dateFrom: today, dateTo: today });
        const html = renderTesterReportHTML(data, req.user.name);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports/tester/all', requireAuth, async (req, res) => {
    try {
        const data = await generateTesterReport(req.user.id, {});
        const html = renderTesterReportHTML(data, req.user.name);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports/tester/custom', requireAuth, async (req, res) => {
    try {
        const { date_from, date_to, project_ids } = req.query;
        const projectIds = project_ids ? project_ids.split(',').map(Number).filter(n => !isNaN(n)) : [];
        const data = await generateTesterReport(req.user.id, {
            dateFrom: date_from || null,
            dateTo: date_to || null,
            projectIds: projectIds.length > 0 ? projectIds : null
        });
        const html = renderTesterReportHTML(data, req.user.name);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports/tester/projects', requireAuth, async (req, res) => {
    try {
        const projects = await query(`
            SELECT DISTINCT p.id, p.name
            FROM qa_projects p
            WHERE EXISTS (
                SELECT 1 FROM qa_executions e
                JOIN qa_test_runs r ON e.run_id = r.id
                JOIN qa_test_suites s ON r.suite_id = s.id
                LEFT JOIN qa_use_cases uc ON s.use_case_id = uc.id
                WHERE e.tester_id = ? AND COALESCE(s.project_id, uc.project_id) = p.id
            ) OR EXISTS (
                SELECT 1 FROM qa_defects d
                WHERE d.created_by = ? AND d.project_id = p.id
            ) OR EXISTS (
                SELECT 1 FROM qa_project_users pu
                WHERE pu.user_id = ? AND pu.project_id = p.id
            )
            ORDER BY p.name
        `, [req.user.id, req.user.id, req.user.id]);
        res.json({ projects: projects.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
// ── EVIDENCIAS (Streaming) ──
// ══════════════════════════════════════════════════════════════

// ── EVIDENCIAS ──
// Implementación en src/routes/evidence.js.
app.use('/api/evidence', evidenceRouter);

// ══════════════════════════════════════════════════════════════
// ── ISSUE SAVE (Legacy — Guardado Multipart Atómico) ──
// ══════════════════════════════════════════════════════════════

app.post('/api/issue', requireAuth, upload.any(), async (req, res) => {
    await query('BEGIN TRANSACTION');

    try {
        const fields = req.body;
        const files = req.files || [];

        // Buscar suite
        const suiteId = fields.suite_id;
        if (!suiteId) throw new Error("suite_id requerido");

        // Procesar Test Cases (test_list_v2)
        if (fields.test_list_v2) {
            const listV2 = JSON.parse(fields.test_list_v2);
            for (const t of listV2) {
                if (t.isSection) continue;

                let tcId = t.id;
                if (!tcId) {
                    const projectId = await getProjectIdFromSuite(suiteId);
                    const finalKeyId = await generateKey(projectId, 'TC');
                    const tcRes = await query(`INSERT INTO qa_test_cases (suite_id, title, key_id) VALUES (?, ?, ?)`, [suiteId, t.title || 'Sin título', finalKeyId]);
                    tcId = tcRes.lastID;
                } else {
                    await query(`UPDATE qa_test_cases SET title = ? WHERE id = ?`, [t.title || 'Sin título', tcId]);
                }

                let execId;
                const execRes = await query(`SELECT id FROM qa_executions WHERE tc_id = ? ORDER BY id DESC LIMIT 1`, [tcId]);
                if (execRes.rows.length > 0) {
                    execId = execRes.rows[0].id;
                    await query(`UPDATE qa_executions SET status = ? WHERE id = ?`, [t.status || 'PENDING', execId]);
                } else {
                    const newExecRes = await query(`INSERT INTO qa_executions (tc_id, status) VALUES (?, ?)`, [tcId, t.status || 'PENDING']);
                    execId = newExecRes.lastID;
                }

                if (t.sbs && t.sbs.length > 0) {
                    const row = t.sbs[0];
                    
                    const processCategory = async (attData, category) => {
                        if (!attData) return;
                        if (attData.pending) {
                            await query(`DELETE FROM qa_attachments WHERE execution_id = ? AND evidence_category = ?`, [execId, category]);
                            const file = files.find(f => f.fieldname === attData.pending);
                            if (file) await saveAttachment(execId, null, file, category);
                        } else if (!attData.src) {
                            await query(`DELETE FROM qa_attachments WHERE execution_id = ? AND evidence_category = ?`, [execId, category]);
                        }
                    };

                    await processCategory(row.figma, 'FIGMA');
                    await processCategory(row.dev, 'DEV');
                }
            }
        }

        await query('COMMIT');
        res.json({ ok: true, message: 'Guardado correctamente' });

    } catch (err) {
        await query('ROLLBACK');
        console.error("Error en POST /api/issue:", err);
        res.status(500).json({ error: 'Error al guardar. Cambios revertidos.' });
    }
});

// Helper para compresión on-the-fly y guardado de adjunto en el store local.
async function saveAttachment(execId, defectId, fileObj, category) {
    let finalBuffer = fileObj.buffer;
    let mime = fileObj.mimetype;
    let filename = fileObj.originalname;

    // Solo comprimir si es imagen (ignorar videos/pdfs)
    if (mime.startsWith('image/')) {
        finalBuffer = await sharp(fileObj.buffer)
            .webp({ quality: 80 })
            .toBuffer();
        mime = 'image/webp';
        filename = filename.replace(/\.[^/.]+$/, "") + ".webp";
    }

    // Resolver project_id para el path layout.
    let projectId = null;
    if (execId) {
        const r = await query(`
            SELECT uc.project_id
              FROM qa_executions e
              JOIN qa_test_cases tc ON e.tc_id = tc.id
              JOIN qa_test_suites s  ON tc.suite_id = s.id
              JOIN qa_use_cases uc    ON s.use_case_id = uc.id
             WHERE e.id = ?
        `, [execId]);
        if (r.rows.length > 0) projectId = r.rows[0].project_id;
    } else if (defectId) {
        const r = await query(`SELECT project_id FROM qa_defects WHERE id = ?`, [defectId]);
        if (r.rows.length > 0) projectId = r.rows[0].project_id;
    }

    const stored = evidenceStore.store({
        buffer: finalBuffer,
        mime,
        fileName: filename,
        projectId,
        parentType: defectId ? 'defect' : 'execution',
        parentId: defectId || execId,
        category: category || 'GENERAL',
        pgAttachmentId: null
    });

    const ins = await query(
        `INSERT INTO qa_attachments
            (execution_id, defect_id, file_name, mime_type, evidence_category, project_id,
             storage_path, sha256, size_bytes, storage_kind)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'local')`,
        [execId, defectId, filename, mime, category || 'GENERAL', projectId,
         stored.storagePath, stored.sha256, stored.size]
    );
    if (ins.lastID && stored.indexId) {
        evidenceStore.setPgAttachmentId(stored.indexId, ins.lastID);
    }
}

// ══════════════════════════════════════════════════════════════
// ── REPORTE ──
// ══════════════════════════════════════════════════════════════

app.post('/api/report', requireAuth, async (req, res) => {
    try {
        exec(`python qa_report_builder.py`, { cwd: BASE_DIR }, (err, stdout, stderr) => {
            if (err) return res.status(500).json({ error: stderr || err.message });
            res.json({ ok: true, output: stdout });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
// ── LEGACY COMPAT (para reporte Python) ──
// ══════════════════════════════════════════════════════════════

app.get('/api/data', requireAuth, async (req, res) => {
    try {
        const { project_id } = req.query;
        if (!project_id) {
            // Fallback: primer proyecto activo
            const proj = await query(`SELECT id FROM qa_projects WHERE status = 'ACTIVE' ORDER BY id LIMIT 1`);
            if (proj.rows.length === 0) return res.json({ pruebas: [] });
            return res.redirect(`/api/data?project_id=${proj.rows[0].id}`);
        }

        const useCases = await query(`SELECT * FROM qa_use_cases WHERE project_id = ?`, [project_id]);
        const pruebas = [];

        for (const cu of useCases.rows) {
            const stories = await query(`SELECT * FROM qa_user_stories WHERE use_case_id = ?`, [cu.id]);
            for (const us of stories.rows) {
                const suites = await query(`SELECT * FROM qa_test_suites WHERE us_id = ?`, [us.id]);
                for (const suite of suites.rows) {
                    const cases = await query(`SELECT * FROM qa_test_cases WHERE suite_id = ? ORDER BY id`, [suite.id]);
                    const testList = [];
                    
                    // Buscar si hay un run activo para esta suite
                    const activeRunRes = await query(`SELECT * FROM qa_test_runs WHERE id = ? AND status = 'ACTIVE'`, [suite.active_run_id]);
                    const activeRun = activeRunRes.rows[0] || null;

                    for (const tc of cases.rows) {
                        let exec = null;
                        if (activeRun) {
                            const execRes = await query(`SELECT * FROM qa_executions WHERE tc_id = ? AND run_id = ? ORDER BY id DESC LIMIT 1`, [tc.id, activeRun.id]);
                            if (execRes.rows.length > 0) {
                                exec = execRes.rows[0];
                            } else if (activeRun.run_type === 'RETEST' && activeRun.parent_run_id) {
                                const parentExecRes = await query(`SELECT * FROM qa_executions WHERE tc_id = ? AND run_id = ? ORDER BY id DESC LIMIT 1`, [tc.id, activeRun.parent_run_id]);
                                if (parentExecRes.rows.length > 0) {
                                    exec = parentExecRes.rows[0];
                                    exec.is_from_parent = true;
                                }
                            }
                        } else {
                            const execRes = await query(`SELECT * FROM qa_executions WHERE tc_id = ? ORDER BY id DESC LIMIT 1`, [tc.id]);
                            exec = execRes.rows.length > 0 ? execRes.rows[0] : null;
                        }

                        const defects = [];
                        if (exec) {
                            const defRes = await query(`SELECT * FROM qa_defects WHERE execution_id = ?`, [exec.id]);
                            defRes.rows.forEach(d => defects.push(d));
                        }

                        testList.push({
                            id: tc.id,
                            title: tc.title,
                            status: exec ? exec.status : 'PENDING',
                            execution_id: exec ? exec.id : null,
                            is_from_parent: exec ? !!exec.is_from_parent : false,
                            defects: defects,
                            isSection: false,
                            sbs: [{ figma: null, dev: null }]
                        });
                    }
                    pruebas.push({
                        id: suite.id,
                        feature: suite.title,
                        modulo: us.title,
                        status: testList.every(t => t.status === 'OK' || t.status === 'PASS') ? 'OK' : (testList.some(t => t.status === 'FAIL') ? 'FAIL' : 'PENDING'),
                        test_list_v2: testList
                    });
                }
            }
        }

        res.json({ pruebas });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Inicialización
// ── Inicialización de Servidor HTTP y WebSocket ──
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Gestión de notificaciones Realtime vía Postgres
function setupRealtime() {
    setupRealtimeChannel((payload) => {
        // Broadcast a todos los clientes conectados
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(payload));
            }
        });
    });
    console.log('📡 Realtime: Listening for database changes via Supabase Realtime...');
}

// ── Arranque HTTP ─────────────────────────────────────────────────────────────
// El listen NO espera a las migraciones de esquema: con la base lenta o caída
// la app abre el puerto igual (y las rutas devuelven el error que corresponda)
// en vez de quedar minutos sin responder.
server.listen(PORT, () => {
    const uiBuilt = fs.existsSync(path.join(BASE_DIR, 'frontend', 'dist'));
    console.log(`Manual QA Tool (JIRA Edition) -> http://localhost:${PORT}`);
    if (uiBuilt) {
        console.log(`Nueva UI (React)            -> http://localhost:${PORT}/app`);
    }
});

// Cierre ordenado: cerrar el índice SQLite de evidencias antes de salir.
function gracefulShutdown(signal) {
    console.log(`\n[shutdown] received ${signal}, closing evidence store...`);
    try { evidenceStore.close(); } catch (e) { console.error('[shutdown] evidenceStore.close error:', e.message); }
    try { server.close(() => process.exit(0)); } catch (_) { process.exit(0); }
    // Hard timeout fallback
    setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

