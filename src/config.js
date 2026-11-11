/**
 * Configuración compartida del servidor.
 * Centraliza lo que antes vivía suelto en server.js para que los módulos
 * extraídos puedan importarlo sin duplicar valores.
 */
const path = require('path');

const BASE_DIR = path.join(__dirname, '..');

module.exports = {
    BASE_DIR,
    JWT_SECRET: process.env.JWT_SECRET || 'fallback_secret_not_safe',
};
