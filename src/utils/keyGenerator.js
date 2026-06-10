const usersRepo = require('../repositories/users.repository');
const projectSequencesRepo = require('../repositories/projectSequences.repository');
const useCasesRepo = require('../repositories/useCases.repository');
const testSuitesRepo = require('../repositories/testSuites.repository');

async function checkPermission(userId, permission) {
    if (!userId || !permission) return false;
    return usersRepo.permissions.check(userId, permission);
}

async function generateKey(projectId, prefix, exec) {
    const num = await projectSequencesRepo.increment(projectId, prefix, exec);
    return `${prefix}-${num.toString().padStart(4, '0')}`;
}

async function generateKeyBatch(projectId, prefix, count, exec) {
    const endNum = await projectSequencesRepo.incrementBy(projectId, prefix, count, exec);
    return endNum - count + 1;
}

async function getProjectIdFromUC(ucId) {
    return useCasesRepo.findProjectId(ucId);
}

async function getProjectIdFromSuite(suiteId) {
    return testSuitesRepo.findProjectId(suiteId);
}

/**
 * Previene CSV/Excel formula injection (OWASP).
 * Si el string empieza con =, +, -, @, antepone una comilla simple.
 * NO es sanitización XSS ni SQL — el output parametrizado y el escape del DOM
 * se manejan en otras capas.
 */
function escapeForCsv(val) {
    if (val === null || val === undefined) return '';
    let str = String(val).trim();
    if (str.length > 0 && ['=', '+', '-', '@'].includes(str[0])) {
        str = "'" + str;
    }
    return str;
}

module.exports = {
    checkPermission,
    generateKey,
    generateKeyBatch,
    getProjectIdFromUC,
    getProjectIdFromSuite,
    escapeForCsv,
};
