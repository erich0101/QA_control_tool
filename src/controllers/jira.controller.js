const { query } = require('../config/db');
const JiraService = require('../../jira-service');
const { encrypt } = require('../services/crypto.service');

async function getJiraUserCredentials(projectId, userId) {
    const [projRes, userRes] = await Promise.all([
        query(`SELECT jira_domain, jira_project_key FROM qa_jira_configs WHERE project_id = ?`, [projectId]),
        query(`SELECT jira_user_email, encrypted_token FROM qa_jira_user_configs WHERE project_id = ? AND user_id = ?`, [projectId, userId])
    ]);
    if (projRes.rows.length === 0) return { error: 'Jira no configurado para este proyecto', code: 'NO_PROJECT_CONFIG' };
    if (userRes.rows.length === 0) return { error: 'Configura tu token de Jira en tu perfil', code: 'NO_USER_TOKEN' };
    return {
        projectKey: projRes.rows[0].jira_project_key,
        domain: projRes.rows[0].jira_domain,
        userCredentials: userRes.rows[0]
    };
}

function normalizeStatus(name, cat) {
    const n = (name || '').toLowerCase();
    const c = cat || '';
    if (c === 'new' || n.includes('to do') || n.includes('por hacer') || n.includes('tareas')) return 'To Do';
    if (c === 'indeterminate' || n.includes('progress') || n.includes('curso') || n.includes('desarrollo') || n.includes('en curso')) return 'In Progress';
    if (n.includes('review') || n.includes('revisión') || n.includes('revisar') || n.includes('en revisión')) return 'In Review';
    if (c === 'done' || n.includes('done') || n.includes('finaliz') || n.includes('cerrad') || n.includes('resolved')) return 'Done';
    return 'Other';
}

function matchTransition(toName, targetStatus) {
    const n = (toName || '').toLowerCase();
    if (targetStatus === 'To Do') return n.includes('to do') || n.includes('por hacer') || n.includes('tareas');
    if (targetStatus === 'In Progress') return n.includes('progress') || n.includes('curso') || n.includes('desarrollo') || n.includes('en curso');
    if (targetStatus === 'In Review') return n.includes('review') || n.includes('revisión') || n.includes('revisar') || n.includes('en revisión');
    return false;
}

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

exports.getJiraConfig = async (req, res) => {
    const projectId = req.params.id;
    const result = await query(`SELECT jira_domain, jira_project_key FROM qa_jira_configs WHERE project_id = ?`, [projectId]);
    if (result.rows.length === 0) {
        return res.json({ config: null, userHasToken: false });
    }
    const row = result.rows[0];
    const userConfig = await query(`SELECT id FROM qa_jira_user_configs WHERE project_id = ? AND user_id = ?`, [projectId, req.user.id]);
    const userHasToken = userConfig.rows.length > 0;
    res.json({
        config: {
            jira_domain: row.jira_domain,
            jira_project_key: row.jira_project_key
        },
        userHasToken
    });
};

exports.saveJiraConfig = async (req, res) => {
    const { jira_domain, jira_project_key } = req.body;
    const projectId = req.params.id;
    if (!jira_domain || !jira_project_key) {
        return res.status(400).json({ error: 'Faltan campos requeridos: jira_domain y jira_project_key' });
    }
    const existing = await query(`SELECT project_id FROM qa_jira_configs WHERE project_id = ?`, [projectId]);
    if (existing.rows.length > 0) {
        await query(`
            UPDATE qa_jira_configs
            SET jira_domain = ?, jira_project_key = ?, updated_at = CURRENT_TIMESTAMP
            WHERE project_id = ?
        `, [jira_domain, jira_project_key, projectId]);
    } else {
        await query(`
            INSERT INTO qa_jira_configs (project_id, jira_domain, jira_project_key)
            VALUES (?, ?, ?)
        `, [projectId, jira_domain, jira_project_key]);
    }
    res.json({ ok: true });
};

exports.getJiraUserConfig = async (req, res) => {
    const projectId = req.params.id;
    const userId = req.user.id;
    const result = await query(`SELECT jira_user_email FROM qa_jira_user_configs WHERE project_id = ? AND user_id = ?`, [projectId, userId]);
    if (result.rows.length === 0) {
        return res.json({ hasConfig: false });
    }
    res.json({ hasConfig: true, email: result.rows[0].jira_user_email });
};

exports.saveJiraUserConfig = async (req, res) => {
    const projectId = req.params.id;
    const userId = req.user.id;
    const { jira_user_email, jira_api_token } = req.body;
    if (!jira_user_email) {
        return res.status(400).json({ error: 'El email de Jira es obligatorio' });
    }
    const existing = await query(`SELECT id, encrypted_token FROM qa_jira_user_configs WHERE project_id = ? AND user_id = ?`, [projectId, userId]);
    let encToken;
    if (jira_api_token) {
        encToken = encrypt(jira_api_token);
    } else if (existing.rows.length > 0) {
        encToken = existing.rows[0].encrypted_token;
    } else {
        return res.status(400).json({ error: 'El API Token es obligatorio para una nueva configuración' });
    }
    if (existing.rows.length > 0) {
        await query(`
            UPDATE qa_jira_user_configs
            SET jira_user_email = ?, encrypted_token = ?, updated_at = CURRENT_TIMESTAMP
            WHERE project_id = ? AND user_id = ?
        `, [jira_user_email, encToken, projectId, userId]);
    } else {
        await query(`
            INSERT INTO qa_jira_user_configs (project_id, user_id, jira_user_email, encrypted_token)
            VALUES (?, ?, ?, ?)
        `, [projectId, userId, jira_user_email, encToken]);
    }
    res.json({ ok: true });
};

exports.deleteJiraUserConfig = async (req, res) => {
    await query(`DELETE FROM qa_jira_user_configs WHERE project_id = ? AND user_id = ?`, [req.params.id, req.user.id]);
    res.json({ ok: true });
};

exports.getEpics = async (req, res) => {
    const creds = await getJiraUserCredentials(req.params.id, req.user.id);
    if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error });
    const epics = await JiraService.getEpics(creds.userCredentials, creds.projectKey, creds.domain);
    res.json({ epics });
};

exports.getEpicStats = async (req, res) => {
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

    const resolutionDays = resolved.map(b => {
        return (new Date(b.fields.resolutiondate) - new Date(b.fields.created)) / (1000 * 60 * 60 * 24);
    }).filter(d => d >= 0);
    const sortedDays = [...resolutionDays].sort((a, b) => a - b);
    const medianResolution = sortedDays.length > 0 ? sortedDays[Math.floor(sortedDays.length / 2)] : 0;
    const p90Resolution = sortedDays.length > 0 ? sortedDays[Math.floor(sortedDays.length * 0.9)] : 0;
    const avgResolutionDays = resolutionDays.length > 0 ? resolutionDays.reduce((a, b) => a + b, 0) / resolutionDays.length : 0;
    const slaTarget = 5;
    const withinSLA = resolutionDays.filter(d => d <= slaTarget).length;
    const slaCompliance = resolutionDays.length > 0 ? Math.round((withinSLA / resolutionDays.length) * 100) : 0;

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

    const firstWeek = weeks[0];
    const lastWeek = weeks[weeks.length - 1];
    const backlogDelta = firstWeek && lastWeek ? lastWeek.backlogEnd - firstWeek.backlogStart : 0;
    const backlogDeltaPercent = firstWeek && firstWeek.backlogStart > 0
        ? Math.round(((lastWeek.backlogEnd - firstWeek.backlogStart) / firstWeek.backlogStart) * 100)
        : 0;

    const bugResolutionRate = bugsInPeriod.length > 0
        ? Math.round((resolvedInPeriod.length / bugsInPeriod.length) * 100)
        : resolved.length > 0 ? 100 : 0;

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

    const backlogGrowthFactor = Math.abs(backlogDeltaPercent) / 100;
    const criticalFactor = criticalOpen.count * 0.3;
    const agingFactor = (agingBuckets['+15d'] / Math.max(stillOpen.length, 1)) * 0.3;
    const slaFactor = (100 - slaCompliance) / 100 * 0.25;
    const openFactor = (stillOpen.length / Math.max(bugsInPeriod.length, 1)) * 0.15;
    const rawRisk = (criticalFactor + backlogGrowthFactor * 0.25 + agingFactor + slaFactor + openFactor);
    const riskScore = Math.min(100, Math.round(rawRisk * 100));
    const riskLabel = riskScore < 30 ? 'low' : riskScore < 60 ? 'moderate' : 'high';

    const healthScore = Math.max(0, Math.min(100, Math.round(
        (slaCompliance * 0.25) +
        (Math.min(bugResolutionRate, 100) * 0.25) +
        (Math.max(0, 100 - riskScore) * 0.30) +
        (Math.max(0, 100 - (criticalOpen.count * 10)) * 0.20)
    )));

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
        healthScore,
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
        }
    });
};

exports.getMyTickets = async (req, res) => {
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
};

exports.debugJiraTest = async (req, res) => {
    const { projectId, jql } = req.query;
    if (!projectId || !jql) {
        return res.status(400).json({ error: 'projectId y jql son requeridos' });
    }
    const creds = await getJiraUserCredentials(projectId, req.user.id);
    if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error });
    const results = await JiraService.searchIssues(creds.userCredentials, creds.domain, jql);
    const first = results.length > 0 ? results[0] : null;
    res.json({ total: results.length, jqlUsed: jql, creds: { projectKey: creds.projectKey, domain: creds.domain }, firstIssue: first ? { key: first.key, id: first.id, projectKey: first.fields?.project?.key, fields: first.fields } : null });
};

exports.getContext = async (req, res) => {
    const creds = await getJiraUserCredentials(req.params.id, req.user.id);
    if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error, epics: [], users: [], priorities: [], customFields: [] });

    const [epics, users, priorities, customFields] = await Promise.all([
        JiraService.getEpics(creds.userCredentials, creds.projectKey, creds.domain),
        JiraService.getAssignableUsers(creds.userCredentials, creds.projectKey, creds.domain),
        JiraService.getPriorities(creds.userCredentials, creds.domain),
        JiraService.getCreateMetadata(creds.userCredentials, creds.projectKey, creds.domain)
    ]);

    res.json({ epics, users, priorities, customFields });
};

exports.getTracking = async (req, res) => {
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
        WHERE cu.project_id = ? AND d.jira_key IS NOT NULL
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
};

exports.getIssueComments = async (req, res) => {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id requerido' });
    const creds = await getJiraUserCredentials(project_id, req.user.id);
    if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error });
    const comments = await JiraService.getIssueComments(creds.userCredentials, creds.domain, req.params.key);
    res.json({ comments });
};

exports.addIssueComment = async (req, res) => {
    const { project_id, text, mentionId } = req.body;
    if (!text) return res.status(400).json({ error: 'El texto del comentario es requerido.' });
    const creds = await getJiraUserCredentials(project_id, req.user.id);
    if (creds.error) return res.status(creds.code === 'NO_PROJECT_CONFIG' ? 404 : 403).json({ error: creds.error });
    const result = await JiraService.addIssueComment(creds.userCredentials, creds.domain, req.params.key, text, mentionId);
    res.json({ ok: true, comment: result });
};

exports.createDefectTicket = async (req, res) => {
    const defectId = req.params.id;
    const { epicId, assigneeId, priorityId, customFields } = req.body;

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

    const ucRes = await query(`SELECT project_id FROM qa_use_cases WHERE id = ?`, [bug.use_case_id]);
    const projectId = ucRes.rows[0].project_id;

    const evidenceRes = await query(`SELECT file_name, mime_type, file_data FROM qa_attachments WHERE execution_id = ?`, [bug.execution_id]);
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
                await JiraService.attachFile(creds.userCredentials, creds.domain, jiraResult.key, ev.file_name, ev.file_data, ev.mime_type);
                attachmentCount++;
            } catch (attachErr) {
                attachmentErrors.push({ file: ev.file_name, error: attachErr.message });
            }
        }
    }

    await query(`
        UPDATE qa_defects
        SET jira_key = ?, jira_url = ?, root_cause = ?
        WHERE id = ?
    `, [jiraResult.key, jiraUrl, `JIRA: ${jiraResult.key}`, defectId]);

    res.json({ ok: true, jira: { ...jiraResult, browser_url: jiraUrl }, attachment_count: attachmentCount, attachment_errors: attachmentErrors });
};

exports.getJiraUserCredentials = getJiraUserCredentials;
exports.normalizeStatus = normalizeStatus;
exports.matchTransition = matchTransition;
exports.getLastStatusChange = getLastStatusChange;
