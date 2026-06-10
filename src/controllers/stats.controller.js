const testSuitesRepo = require('../repositories/testSuites.repository');
const projectsRepo = require('../repositories/projects.repository');
const testCasesRepo = require('../repositories/testCases.repository');
const useCasesRepo = require('../repositories/useCases.repository');
const JiraService = require('../../jira-service');
const { getJiraUserCredentials } = require('./jira.controller');

exports.jiraDaily = async (req, res) => {
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
    const assigneeCounts = {};
    const epicCounts = {};

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const processedIssues = jiraIssues.map(issue => {
        const f = issue.fields;
        const isResolved = f.status?.statusCategory?.key === 'done';

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
};

exports.jiraProductivity = async (req, res) => {
    const { project_id } = req.query;
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

    const result = Object.values(teamStats).map(user => {
        const totalWork = user.resolved + user.open;
        const avgDays = user.resolved > 0 ? (user.totalDays / user.resolved) : 0;
        const avgOpenAge = user.open > 0 ? (user.totalOpenDays / user.open) : 0;

        const volumeScore = Math.min(60, user.resolved * 6);
        const speedScore = avgDays > 0 ? Math.min(40, (3 / Math.max(0.5, avgDays)) * 20) : 10;

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
};

exports.suitesStats = async (req, res) => {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id requerido' });

    const stats = await testSuitesRepo.statsByDurationByProject(project_id);

    res.json({ stats });
};

exports.overview = async (req, res) => {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id requerido' });

    const summary = await projectsRepo.overviewSummaryLegacy(project_id);
    const statuses = await testCasesRepo.statusBreakdownByProject(project_id);
    const coverage = await useCasesRepo.coverageByProject(project_id);

    res.json({
        summary,
        statuses,
        coverage
    });
};
