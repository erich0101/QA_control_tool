const express = require('express');
const { query } = require('../../db');
const { requireAuth } = require('../middleware/auth');
const { getJiraUserCredentials } = require('../lib/jira-credentials');
const { normalizeStatus, getLastStatusChange } = require('../lib/helpers');
const evidenceStore = require('../../modules/evidence-store');
const JiraService = require('../../jira-service');

const router = express.Router();

router.get('/projects/:id/epics', requireAuth, async (req, res) => {
    try {
        const creds = await getJiraUserCredentials(req.params.id, req.user.id);
        if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error });
        
        const epics = await JiraService.getEpics(creds.userCredentials, creds.projectKey, creds.domain);
        res.json({ epics });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/projects/:id/epic-stats', requireAuth, async (req, res) => {
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

router.get('/projects/:id/my-tickets', requireAuth, async (req, res) => {
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

router.get('/projects/:id/context', requireAuth, async (req, res) => {
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

router.get('/projects/:id/tracking', requireAuth, async (req, res) => {
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

router.get('/issues/:key/comments', requireAuth, async (req, res) => {
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

router.post('/issues/:key/comments', requireAuth, async (req, res) => {
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

router.post('/defects/:id/create-ticket', requireAuth, async (req, res) => {
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

router.post('/hallazgos/:id/create-ticket', requireAuth, async (req, res) => {
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

module.exports = router;
