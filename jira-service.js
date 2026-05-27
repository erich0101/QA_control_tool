const { decrypt } = require('./utils/crypto-utils');

/**
 * JIRA-SERVICE.JS
 * Motor de integración profesional con Jira Cloud API v3.
 */
const JiraService = {
    /**
     * Genera el contenido Markdown basado en los datos del bug de nuestra APP.
     */
    generateBugMarkdown(bug) {
        return `
# 🐞 BUG-${bug.id} - ${bug.title}

## 📄 Descripción
Reportado en el Test Case: **${bug.tc_key} - ${bug.tc_title}**

---

## 🔁 Pasos para reproducir
${bug.steps_to_reproduce || 'No se proporcionaron pasos específicos.'}

---

## ✅ Resultado esperado
${bug.expected_result || '—'}

---

## ❌ Resultado actual
${bug.actual_result || '—'}

---

## 📊 Impacto y Prioridad
- **Severidad:** ${bug.severity}
- **Frecuencia:** ${bug.frequency || 'Siempre'}
- **Impacto:** ${bug.business_impact || 'No especificado'}

---

## 🛠 Contexto Técnico
- **Tester:** ${bug.tester_name || 'Desconocido'}
- **Fecha de reporte:** ${new Date(bug.created_at).toLocaleString()}
- **ID Interno:** ${bug.id}
        `.trim();
    },

    /**
     * Convierte un string Markdown simplificado a Atlassian Document Format (ADF).
     * Soporta: Encabezados, Reglas horizontales, Listas, Negritas y Párrafos.
     */
    convertMarkdownToADF(markdown) {
        const lines = markdown.split('\n');
        const content = [];
        let currentList = null;

        lines.forEach(line => {
            const trimmed = line.trim();
            
            // 1. Horizontal Rule
            if (trimmed === '---') {
                content.push({ type: 'rule' });
                return;
            }

            // 2. Headings
            const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
            if (headingMatch) {
                const level = headingMatch[1].length;
                const text = headingMatch[2];
                content.push({
                    type: 'heading',
                    attrs: { level },
                    content: [{ type: 'text', text }]
                });
                return;
            }

            // 3. Bullet Lists
            const listMatch = trimmed.match(/^[-*]\s+(.*)/);
            if (listMatch) {
                const text = listMatch[1];
                if (!currentList || currentList.type !== 'bulletList') {
                    currentList = { type: 'bulletList', content: [] };
                    content.push(currentList);
                }
                currentList.content.push({
                    type: 'listItem',
                    content: [{
                        type: 'paragraph',
                        content: this.parseInlineText(text)
                    }]
                });
                return;
            }

            // 4. Paragraphs (y fin de listas)
            if (trimmed === '') {
                currentList = null;
                return;
            }

            // Si no es nada de lo anterior, es un párrafo
            currentList = null;
            content.push({
                type: 'paragraph',
                content: this.parseInlineText(trimmed)
            });
        });

        return {
            version: 1,
            type: 'doc',
            content
        };
    },

    /**
     * Parsea negritas (**) dentro de una línea de texto.
     */
    parseInlineText(text) {
        const parts = text.split(/(\*\*.*?\*\*)/g);
        return parts.map(part => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return {
                    type: 'text',
                    text: part.slice(2, -2),
                    marks: [{ type: 'strong' }]
                };
            }
            return { type: 'text', text: part };
        }).filter(p => p.text.length > 0);
    },

    /**
     * Obtiene las épicas disponibles en el proyecto de Jira.
     */
    async getEpics(userCredentials, projectKey, domain) {
        const auth = Buffer.from(`${userCredentials.jira_user_email}:${decrypt(userCredentials.encrypted_token)}`).toString('base64');
        const baseUrl = domain.replace(/\/$/, '');
        
        const jql = `project = "${projectKey}" AND issuetype = Epic AND status != Done`;
        const url = `${baseUrl}/rest/api/3/search/jql`;

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                jql: jql,
                fields: ["summary", "key"],
                maxResults: 50
            })
        });

        if (!res.ok) {
            const error = await res.text();
            throw new Error(`Error de Jira: ${error}`);
        }

        const data = await res.json();
        return (data.issues || []).map(issue => ({
            id: issue.id,
            key: issue.key,
            summary: issue.fields.summary,
            name: issue.fields.summary
        }));
    },

    async getAssignableUsers(userCredentials, projectKey, domain) {
        const auth = Buffer.from(`${userCredentials.jira_user_email}:${decrypt(userCredentials.encrypted_token)}`).toString('base64');
        const baseUrl = domain.replace(/\/$/, '');
        const url = `${baseUrl}/rest/api/3/user/assignable/search?project=${projectKey}`;

        const res = await fetch(url, {
            headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' }
        });
        if (!res.ok) return [];
        const data = await res.json();
        return data.map(u => ({ accountId: u.accountId, displayName: u.displayName }));
    },

    async getPriorities(userCredentials, domain) {
        const auth = Buffer.from(`${userCredentials.jira_user_email}:${decrypt(userCredentials.encrypted_token)}`).toString('base64');
        const baseUrl = domain.replace(/\/$/, '');
        const url = `${baseUrl}/rest/api/3/priority`;

        const res = await fetch(url, {
            headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' }
        });
        if (!res.ok) return [];
        return await res.json();
    },

    async getCreateMetadata(userCredentials, projectKey, domain) {
        const auth = Buffer.from(`${userCredentials.jira_user_email}:${decrypt(userCredentials.encrypted_token)}`).toString('base64');
        const baseUrl = domain.replace(/\/$/, '');
        const url = `${baseUrl}/rest/api/3/issue/createmeta?projectKeys=${projectKey}&issuetypeNames=Bug&expand=projects.issuetypes.fields`;

        try {
            const res = await fetch(url, {
                headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' }
            });

            if (!res.ok) { console.warn('Jira createmeta failed:', res.status); return []; }

            const data = await res.json();
            const projects = data.projects || [];
            const fields = [];

            for (const project of projects) {
                for (const issuetype of (project.issuetypes || [])) {
                    const issueFields = issuetype.fields || {};
                    for (const [fieldId, fieldMeta] of Object.entries(issueFields)) {
                        if (!fieldId.startsWith('customfield_')) continue;
                        if (!fieldMeta.required) continue;

                        const fieldInfo = {
                            fieldId,
                            name: fieldMeta.name,
                            required: true,
                            schemaType: fieldMeta.schema?.type,
                            options: []
                        };

                        if (fieldMeta.allowedValues && Array.isArray(fieldMeta.allowedValues)) {
                            fieldInfo.options = fieldMeta.allowedValues.map(opt => ({
                                id: opt.id,
                                value: opt.value || opt.name,
                                name: opt.name || opt.value
                            }));
                        }

                        fields.push(fieldInfo);
                    }
                }
            }

            return fields;
        } catch (e) {
            console.warn('Jira createmeta error:', e.message);
            return [];
        }
    },

    async createIssue(userCredentials, projectKey, domain, bugData, epicId = null, assigneeId = null, priorityId = null, customFields = {}) {
        const auth = Buffer.from(`${userCredentials.jira_user_email}:${decrypt(userCredentials.encrypted_token)}`).toString('base64');
        const baseUrl = domain.replace(/\/$/, '');
        
        const markdown = this.generateBugMarkdown(bugData);
        const adfDescription = this.convertMarkdownToADF(markdown);

        const payload = {
            fields: {
                project: { key: projectKey },
                summary: `🐞 BUG: ${bugData.title}`,
                issuetype: { name: 'Bug' },
                description: adfDescription
            }
        };

        if (epicId) payload.fields.parent = { id: epicId };
        if (assigneeId) payload.fields.assignee = { accountId: assigneeId };
        if (priorityId) payload.fields.priority = { id: priorityId };
        if (customFields && Object.keys(customFields).length > 0) {
            for (const [fieldId, value] of Object.entries(customFields)) {
                payload.fields[fieldId] = value;
            }
        }

        const url = `${baseUrl}/rest/api/3/issue`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.errors ? JSON.stringify(error.errors) : 'Error desconocido al crear ticket');
        }

        return await res.json();
    },

    async getTicketsDetails(userCredentials, domain, keys) {
        const jql = `key in (${keys.map(k => `"${k}"`).join(',')})`;
        return this.searchIssues(userCredentials, domain, jql);
    },

    async searchIssues(userCredentials, domain, jql, expand = null, extraFields = []) {
        const auth = Buffer.from(`${userCredentials.jira_user_email}:${decrypt(userCredentials.encrypted_token)}`).toString('base64');
        const baseUrl = domain.replace(/\/$/, '');
        const url = `${baseUrl}/rest/api/3/search/jql`;

        let fields;
        if (extraFields.includes('*all')) {
            fields = ['*all'];
        } else {
            const defaultFields = ["summary", "status", "assignee", "reporter", "created", "parent", "priority", "resolutiondate", "updated"];
            fields = extraFields.length > 0 ? [...new Set([...defaultFields, ...extraFields])] : defaultFields;
        }

        const body = {
            jql: jql,
            fields: fields,
            maxResults: 100,
            fieldsByKeys: false
        };

        if (expand) body.expand = expand;

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const error = await res.text();
            throw new Error(`Error de Jira JQL: ${error}`);
        }

        const data = await res.json();
        return data.issues || [];
    },

    async getIssueComments(userCredentials, domain, issueKey) {
        const auth = Buffer.from(`${userCredentials.jira_user_email}:${decrypt(userCredentials.encrypted_token)}`).toString('base64');
        const baseUrl = domain.replace(/\/$/, '');
        const url = `${baseUrl}/rest/api/3/issue/${issueKey}/comment`;

        const res = await fetch(url, {
            headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' }
        });

        if (!res.ok) return [];
        const data = await res.json();
        return (data.comments || []).map(c => ({
            id: c.id,
            author: c.author?.displayName || 'Unknown',
            created: c.created,
            body: this.extractTextFromADF(c.body),
            rawBody: c.body
        }));
    },

    extractTextFromADF(adf) {
        if (typeof adf === 'string') return adf;
        if (!adf || !adf.content) return '';

        let text = '';
        const processNode = (node) => {
            if (node.type === 'text' && node.text) {
                text += node.text;
            }
            if (node.content && Array.isArray(node.content)) {
                node.content.forEach(processNode);
            }
            if (node.type === 'mention') {
                text += `@[${node.attrs?.display || 'user'}]`;
            }
        };

        adf.content.forEach(processNode);
        return text;
    },

    extractMentionAccountIds(adf) {
        if (!adf || !adf.content) return [];
        const ids = [];
        const findMentions = (node) => {
            if (node.type === 'mention' && node.attrs?.id) {
                ids.push(node.attrs.id);
            }
            if (node.content && Array.isArray(node.content)) {
                node.content.forEach(findMentions);
            }
        };
        adf.content.forEach(findMentions);
        return ids;
    },

    async addIssueComment(userCredentials, domain, issueKey, text, mentionId = null) {
        const auth = Buffer.from(`${userCredentials.jira_user_email}:${decrypt(userCredentials.encrypted_token)}`).toString('base64');
        const baseUrl = domain.replace(/\/$/, '');
        const url = `${baseUrl}/rest/api/3/issue/${issueKey}/comment`;

        const content = [];
        let cleanText = text;

        if (mentionId) {
            cleanText = text.replace(/^@\[.*?\]\s*/, '');
            content.push({
                type: "mention",
                attrs: { id: mentionId }
            });
            content.push({ type: "text", text: " " });
        }

        content.push({
            type: "text",
            text: cleanText
        });

        const payload = {
            body: {
                type: "doc",
                version: 1,
                content: [{
                    type: "paragraph",
                    content: content
                }]
            }
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const error = await res.text();
            throw new Error(`Error de Jira al comentar: ${error}`);
        }

        return await res.json();
    },

    async testConnection(userCredentials, domain) {
        const auth = Buffer.from(`${userCredentials.jira_user_email}:${decrypt(userCredentials.encrypted_token)}`).toString('base64');
        const baseUrl = domain.replace(/\/$/, '');
        const url = `${baseUrl}/rest/api/3/myself`;

        const res = await fetch(url, {
            headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' }
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Token inválido o credenciales incorrectas: ${errorText}`);
        }

        const data = await res.json();
        return { ok: true, user: { accountId: data.accountId, displayName: data.displayName, email: data.email } };
    },

    async getMyAssignedIssues(userCredentials, domain, projectKey, maxResults = 50) {
        const jql = `project = "${projectKey}" AND assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC`;
        return this.searchIssues(userCredentials, domain, jql, null, ['summary', 'status', 'statusCategory', 'priority', 'assignee', 'reporter', 'created', 'updated', 'issuetype', 'parent']);
    },

    async getMyCreatedIssues(userCredentials, domain, projectKey, maxResults = 50) {
        const jql = `project = "${projectKey}" AND reporter = currentUser() ORDER BY created DESC`;
        return this.searchIssues(userCredentials, domain, jql, null, ['summary', 'status', 'statusCategory', 'priority', 'assignee', 'reporter', 'created', 'updated', 'issuetype', 'parent']);
    },

    async getIssuesWhereMentioned(userCredentials, domain, projectKey, daysBack = 30) {
        const me = await this.testConnection(userCredentials, domain);
        const myAccountId = me.user.accountId;

        const jql = `project = "${projectKey}" AND updated >= "-${daysBack}d" AND statusCategory != Done ORDER BY updated DESC`;
        const issues = await this.searchIssues(userCredentials, domain, jql, null, ['summary', 'status', 'statusCategory', 'priority', 'assignee', 'reporter', 'created', 'updated', 'issuetype', 'parent']);

        const mentionedIssues = [];
        for (const issue of issues) {
            try {
                const comments = await this.getIssueComments(userCredentials, domain, issue.key);
                const mentions = comments.filter(c => {
                    const mentionIds = this.extractMentionAccountIds(c.rawBody || c.body);
                    return mentionIds.includes(myAccountId);
                });
                if (mentions.length > 0) {
                    mentionedIssues.push({
                        ...issue,
                        mentions: mentions.map(c => ({
                            id: c.id,
                            author: c.author,
                            created: c.created,
                            preview: (c.body || '').substring(0, 150)
                        })),
                        comments: comments.map(c => ({
                            id: c.id,
                            author: c.author,
                            created: c.created,
                            body: c.body,
                            isMention: this.extractMentionAccountIds(c.rawBody || c.body).includes(myAccountId)
                        }))
                    });
                }
            } catch (e) {
                console.warn(`Could not fetch comments for ${issue.key}:`, e.message);
            }
        }
        return mentionedIssues;
    }
};

module.exports = JiraService;
