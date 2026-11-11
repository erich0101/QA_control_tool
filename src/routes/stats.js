const express = require('express');
const { query } = require('../../db');
const { requireAuth } = require('../middleware/auth');
const { getJiraUserCredentials } = require('../lib/jira-credentials');
const JiraService = require('../../jira-service');

const router = express.Router();

router.get('/jira-daily', requireAuth, async (req, res) => {
    try {
        const { project_id } = req.query;
        if (!project_id) return res.status(400).json({ error: 'project_id requerido' });

        const creds = await getJiraUserCredentials(project_id, req.user.id);
        if (creds.error) {
            return res.json({ issues: [], assigneeCounts: {}, closedToday: 0, openCount: 0, avgResolutionDays: 0, error: creds.error });
        }

        const jql = `project = "${creds.projectKey}" AND issuetype = Bug AND (updated >= "-2d" OR statusCategory != Done)`;
        const jiraIssues = await JiraService.searchIssues(creds.userCredentials, creds.domain, jql, 'changelog');

        let totalResolutionTime = 0;
        let resolvedCount = 0;
        let openCount = 0;
        let closedToday = 0;
        let closedYesterday = 0;
        const severityCounts = { Alta: 0, Media: 0, Baja: 0, Crítica: 0 };
        const assigneeCounts = {}; // { "Nombre": count }
        const epicCounts = {};     // { "Nombre Epica": count }

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        const processedIssues = jiraIssues.map(issue => {
            const f = issue.fields;
            const isResolved = f.status?.statusCategory?.key === 'done';
            
            // 1. Estadísticas básicas (solo si es Bug)
            // Nota: El JQL ya filtra por Bug si lo deseamos, pero aquí procesamos todos los retornados
            
            if (!isResolved) {
                const sev = f.priority?.name || 'Media';
                if (sev.includes('High') || sev.includes('Alta')) severityCounts.Alta++;
                else if (sev.includes('Highest') || sev.includes('Crítica') || sev.includes('Urgent')) severityCounts.Crítica++;
                else if (sev.includes('Low') || sev.includes('Baja')) severityCounts.Baja++;
                else severityCounts.Media++;

                const assigneeName = f.assignee?.displayName || 'Sin Asignar';
                assigneeCounts[assigneeName] = (assigneeCounts[assigneeName] || 0) + 1;

                const epicName = f.parent?.fields?.summary || 'Sin Épica';
                epicCounts[epicName] = (epicCounts[epicName] || 0) + 1;
                openCount++;
            } else {
                resolvedCount++;
                if (f.resolutiondate) {
                    const resDate = new Date(f.resolutiondate);
                    const createDate = new Date(f.created);
                    totalResolutionTime += (resDate - createDate);
                    
                    const resDayStr = resDate.toISOString().split('T')[0];
                    if (resDayStr === todayStr) closedToday++;
                    else if (resDayStr === yesterdayStr) closedYesterday++;
                }
            }

            // 2. Procesar Historial para el Resumen de la Daily
            let devUser = null;
            let doneUser = null;
            const histories = issue.changelog?.histories || [];
            
            histories.forEach(h => {
                h.items.forEach(item => {
                    if (item.field === 'status') {
                        const to = item.toString?.toLowerCase() || '';
                        if (to.includes('prog') || to.includes('curso') || to.includes('dev') || to.includes('desarrollo')) {
                            devUser = { name: h.author.displayName, avatar: h.author.avatarUrls?.['24x24'] };
                        }
                        if (to.includes('done') || to.includes('finalizado') || to.includes('cerrado') || to.includes('resolved')) {
                            doneUser = { name: h.author.displayName, avatar: h.author.avatarUrls?.['24x24'] };
                        }
                    }
                });
            });

            return {
                key: issue.key,
                summary: f.summary,
                status: f.status.name,
                statusCategory: f.status.statusCategory?.key,
                statusColor: f.status.statusCategory?.colorName || 'gray',
                assignee: f.assignee?.displayName || 'Sin Asignar',
                avatar: f.assignee?.avatarUrls?.['24x24'],
                priority: f.priority?.name || 'Media',
                created: f.created,
                updated: f.updated,
                resolutiondate: f.resolutiondate,
                epic: f.parent?.fields?.summary || 'Sin Épica',
                devUser: devUser || (f.status.name.toLowerCase().includes('curso') ? { name: f.assignee?.displayName, avatar: f.assignee?.avatarUrls?.['24x24'] } : null),
                doneUser: doneUser || (f.status.statusCategory?.key === 'done' ? { name: f.assignee?.displayName, avatar: f.assignee?.avatarUrls?.['24x24'] } : null)
            };
        });

        const avgResolutionDays = resolvedCount > 0 ? (totalResolutionTime / resolvedCount / (1000 * 60 * 60 * 24)).toFixed(1) : 0;

        res.json({
            projectName: creds.projectKey,
            jiraUrl: creds.domain,
            avgResolutionDays,
            openCount,
            resolvedCount,
            totalTickets: jiraIssues.length,
            closedToday,
            closedYesterday,
            severityCounts,
            assigneeCounts,
            epicCounts,
            issues: processedIssues
        });
    } catch (err) {
        console.error("Error en /api/stats/jira-daily:", err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PRODUCTIVIDAD DE EQUIPO (Últimos 30 días en Jira)
 */

router.get('/jira-productivity', requireAuth, async (req, res) => {
    const { project_id } = req.query;
    try {
        const creds = await getJiraUserCredentials(project_id, req.user.id);
        if (creds.error) return res.json({ error: creds.error });

        const jql = `project = "${creds.projectKey}" AND issuetype = Bug AND (statusCategory != done OR resolved >= -30d)`;
        
        const jiraIssues = await JiraService.searchIssues(creds.userCredentials, creds.domain, jql);
        const teamStats = {}; 

        jiraIssues.forEach(issue => {
            const f = issue.fields;
            const assignee = f.assignee?.displayName || 'Sin Asignar';
            const avatar = f.assignee?.avatarUrls?.['24x24'];
            const isDone = f.status.statusCategory?.key === 'done';

            if (!teamStats[assignee]) {
                teamStats[assignee] = { name: assignee, avatar, resolved: 0, open: 0, totalDays: 0, totalOpenDays: 0 };
            }

            if (isDone) {
                teamStats[assignee].resolved++;
                if (f.resolutiondate && f.created) {
                    const days = (new Date(f.resolutiondate) - new Date(f.created)) / (1000 * 60 * 60 * 24);
                    teamStats[assignee].totalDays += days;
                }
            } else {
                teamStats[assignee].open++;
                const age = (new Date() - new Date(f.created)) / (1000 * 60 * 60 * 24);
                teamStats[assignee].totalOpenDays += age;
            }
        });

        // Calcular promedios y Scores (Poder de Resolución vs Deuda de Tiempo)
        const result = Object.values(teamStats).map(user => {
            const totalWork = user.resolved + user.open;
            const avgDays = user.resolved > 0 ? (user.totalDays / user.resolved) : 0;
            const avgOpenAge = user.open > 0 ? (user.totalOpenDays / user.open) : 0;
            
            // Score Base (Volumen + Velocidad de cierre)
            const volumeScore = Math.min(60, user.resolved * 6);
            const speedScore = avgDays > 0 ? Math.min(40, (3 / Math.max(0.5, avgDays)) * 20) : 10;
            
            // PENALIZACIÓN POR AGING (Si los pendientes tienen > 14 días promedio, restamos hasta 30 pts)
            const agingPenalty = avgOpenAge > 14 ? Math.min(30, (avgOpenAge - 14) * 2) : 0;
            
            const finalScore = Math.max(0, (volumeScore + speedScore - agingPenalty)).toFixed(0);

            return {
                ...user,
                totalWork,
                avgDays: avgDays.toFixed(1),
                avgOpenAge: avgOpenAge.toFixed(1),
                score: finalScore
            };
        }).sort((a, b) => b.score - a.score);

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/suites', requireAuth, async (req, res) => {
    try {
        const { project_id, date_from, date_to } = req.query;
        if (!project_id) return res.status(400).json({ error: 'project_id requerido' });

        let dateFilter = '';
        const params = [project_id];

        if (date_from) {
            dateFilter += ' AND r.started_at >= ?';
            params.push(date_from);
        }
        if (date_to) {
            dateFilter += ' AND r.started_at <= ?::timestamp + interval \'1 day\'';
            params.push(date_to);
        }

        const stats = await query(`
            SELECT 
                s.id,
                s.title,
                COUNT(r.id)::INT as total_runs,
                COALESCE(SUM(CASE WHEN r.status = 'FINISHED' THEN EXTRACT(EPOCH FROM (r.finished_at - r.started_at)) / 60 ELSE 0 END), 0)::FLOAT as total_minutes,
                COALESCE(AVG(CASE WHEN r.status = 'FINISHED' THEN EXTRACT(EPOCH FROM (r.finished_at - r.started_at)) / 60 ELSE NULL END), 0)::FLOAT as avg_minutes,
                (
                    SELECT json_agg(json_build_object(
                        'id', r2.id,
                        'finished_at', r2.finished_at,
                        'minutes', CASE WHEN r2.status = 'FINISHED' THEN EXTRACT(EPOCH FROM (r2.finished_at - r2.started_at)) / 60 ELSE 0 END
                    ) ORDER BY r2.finished_at DESC)
                    FROM qa_test_runs r2
                    WHERE r2.suite_id = s.id
                ) as runs
            FROM qa_test_suites s
            JOIN qa_use_cases uc ON s.use_case_id = uc.id
            LEFT JOIN qa_test_runs r ON s.id = r.suite_id
            WHERE uc.project_id = ? AND s.is_active = TRUE ${dateFilter}
            GROUP BY s.id, s.title
            ORDER BY total_minutes DESC
        `, params);

        res.json({ stats: stats.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/overview', requireAuth, async (req, res) => {
    try {
        const { project_id } = req.query;
        if (!project_id) return res.status(400).json({ error: 'project_id requerido' });

        const summary = await query(`
            SELECT 
                (SELECT COUNT(*) FROM qa_use_cases WHERE project_id = ?) as total_cu,
                (SELECT COUNT(*) FROM qa_test_suites s JOIN qa_use_cases cu ON s.use_case_id = cu.id WHERE cu.project_id = ? AND s.is_active = TRUE) as total_suites,
                (SELECT COUNT(*) FROM qa_test_cases tc JOIN qa_test_suites s ON tc.suite_id = s.id JOIN qa_use_cases cu ON s.use_case_id = cu.id WHERE cu.project_id = ? AND s.is_active = TRUE) as total_tc
        `, [project_id, project_id, project_id]);

        const statuses = await query(`
            SELECT 
                COALESCE(e.status, 'PENDING') as status,
                COUNT(*) as count
            FROM qa_test_cases tc
            JOIN qa_test_suites s ON tc.suite_id = s.id
            JOIN qa_use_cases cu ON s.use_case_id = cu.id
            LEFT JOIN (
                SELECT tc_id, status FROM qa_executions 
                WHERE id IN (SELECT MAX(id) FROM qa_executions GROUP BY tc_id)
            ) e ON tc.id = e.tc_id
            WHERE cu.project_id = ? AND s.is_active = TRUE
            GROUP BY COALESCE(e.status, 'PENDING')
        `, [project_id]);

        const coverage = await query(`
            SELECT 
                cu.title,
                COUNT(tc.id) as total,
                SUM(CASE WHEN e.status IN ('OK', 'PASS') THEN 1 ELSE 0 END) as ok
            FROM qa_use_cases cu
            LEFT JOIN qa_test_suites s ON cu.id = s.use_case_id
            LEFT JOIN qa_test_cases tc ON s.id = tc.suite_id
            LEFT JOIN (
                SELECT tc_id, status FROM qa_executions 
                WHERE id IN (SELECT MAX(id) FROM qa_executions GROUP BY tc_id)
            ) e ON tc.id = e.tc_id
            WHERE cu.project_id = ? AND (s.id IS NULL OR s.is_active = TRUE)
            GROUP BY cu.id, cu.title
            ORDER BY cu.id
        `, [project_id]);

        res.json({
            summary: summary.rows[0],
            statuses: statuses.rows,
            coverage: coverage.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
// ── TEST CASES (dentro de suites) ──
// ══════════════════════════════════════════════════════════════

// Lista los Test Cases del proyecto para poblar selectores (ej. TC origen en Hallazgos).

module.exports = router;
