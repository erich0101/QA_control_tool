const { query } = require('../../db');

/**
 * Credenciales de Jira del usuario para un proyecto.
 * Devuelve `{ error, code }` cuando falta configuración o token.
 */
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

module.exports = { getJiraUserCredentials };
