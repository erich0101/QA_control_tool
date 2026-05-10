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
    async getEpics(config) {
        const auth = Buffer.from(`${config.jira_user_email}:${decrypt(config.encrypted_token)}`).toString('base64');
        const domain = config.jira_domain.replace(/\/$/, '');
        
        // JQL para buscar épicas en el proyecto específico
        const jql = `project = "${config.jira_project_key}" AND issuetype = Epic AND status != Done`;
        const url = `${domain}/rest/api/3/search/jql`;

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
            name: issue.fields.summary // Para compatibilidad con el frontend
        }));
    },

    /**
     * Obtiene usuarios que pueden ser asignados en el proyecto.
     */
    async getAssignableUsers(config) {
        const auth = Buffer.from(`${config.jira_user_email}:${decrypt(config.encrypted_token)}`).toString('base64');
        const domain = config.jira_domain.replace(/\/$/, '');
        const url = `${domain}/rest/api/3/user/assignable/search?project=${config.jira_project_key}`;

        const res = await fetch(url, {
            headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' }
        });
        if (!res.ok) return [];
        const data = await res.json();
        return data.map(u => ({ accountId: u.accountId, displayName: u.displayName }));
    },

    /**
     * Obtiene las prioridades configuradas en Jira.
     */
    async getPriorities(config) {
        const auth = Buffer.from(`${config.jira_user_email}:${decrypt(config.encrypted_token)}`).toString('base64');
        const domain = config.jira_domain.replace(/\/$/, '');
        const url = `${domain}/rest/api/3/priority`;

        const res = await fetch(url, {
            headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' }
        });
        if (!res.ok) return [];
        return await res.json();
    },

    /**
     * Crea el issue en Jira.
     */
    async createIssue(config, bugData, epicId = null, assigneeId = null, priorityId = null) {
        const auth = Buffer.from(`${config.jira_user_email}:${decrypt(config.encrypted_token)}`).toString('base64');
        const domain = config.jira_domain.replace(/\/$/, '');
        
        const markdown = this.generateBugMarkdown(bugData);
        const adfDescription = this.convertMarkdownToADF(markdown);

        const payload = {
            fields: {
                project: { key: config.jira_project_key },
                summary: `🐞 BUG: ${bugData.title}`,
                issuetype: { name: 'Bug' },
                description: adfDescription
            }
        };

        if (epicId) payload.fields.parent = { id: epicId };
        if (assigneeId) payload.fields.assignee = { accountId: assigneeId };
        if (priorityId) payload.fields.priority = { id: priorityId };

        const url = `${domain}/rest/api/3/issue`;
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

    /**
     * Consulta detalles de múltiples tickets por sus claves (JQL).
     */
    async getTicketsDetails(config, keys) {
        const jql = `key in (${keys.map(k => `"${k}"`).join(',')})`;
        return this.searchIssues(config, jql);
    },

    /**
     * Realiza una búsqueda JQL genérica en Jira.
     */
    async searchIssues(config, jql, expand = null) {
        const auth = Buffer.from(`${config.jira_user_email}:${decrypt(config.encrypted_token)}`).toString('base64');
        const domain = config.jira_domain.replace(/\/$/, '');
        const url = `${domain}/rest/api/3/search/jql`;

        const body = {
            jql: jql,
            fields: ["summary", "status", "assignee", "reporter", "created", "parent", "priority", "resolutiondate", "updated"],
            maxResults: 100,
            fieldsByKeys: false
        };

        if (expand) body.expand = expand; // En /search/jql expand es un string delimitado por comas

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

    /**
     * Obtiene los comentarios de un ticket específico.
     */
    async getIssueComments(config, issueKey) {
        const auth = Buffer.from(`${config.jira_user_email}:${decrypt(config.encrypted_token)}`).toString('base64');
        const domain = config.jira_domain.replace(/\/$/, '');
        const url = `${domain}/rest/api/3/issue/${issueKey}/comment`;

        const res = await fetch(url, {
            headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' }
        });

        if (!res.ok) return [];
        const data = await res.json();
        return data.comments || [];
    },

    /**
     * Añade un comentario a un ticket. Soporta menciones.
     */
    async addIssueComment(config, issueKey, text, mentionId = null) {
        const auth = Buffer.from(`${config.jira_user_email}:${decrypt(config.encrypted_token)}`).toString('base64');
        const domain = config.jira_domain.replace(/\/$/, '');
        const url = `${domain}/rest/api/3/issue/${issueKey}/comment`;

        // Construir contenido ADF
        const content = [];
        let cleanText = text;

        if (mentionId) {
            // Si hay mención, extraemos el prefijo @[Nombre] si existe
            cleanText = text.replace(/^@\[.*?\]\s*/, '');
            content.push({
                type: "mention",
                attrs: { id: mentionId }
            });
            content.push({ type: "text", text: " " }); // Espacio tras mención
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
    }
};

module.exports = JiraService;
