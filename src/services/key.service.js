// Re-export layer: permite que controllers importen desde /services en vez de /utils.
// Cuando el código legacy en utils/keyGenerator.js se retire, este archivo se moverá ahí.
const keyUtils = require('../utils/keyGenerator');

module.exports = {
    generateKey: keyUtils.generateKey,
    generateKeyBatch: keyUtils.generateKeyBatch,
    checkPermission: keyUtils.checkPermission,
    getProjectIdFromUC: keyUtils.getProjectIdFromUC,
    getProjectIdFromSuite: keyUtils.getProjectIdFromSuite,
    escapeForCsv: keyUtils.escapeForCsv,
};
