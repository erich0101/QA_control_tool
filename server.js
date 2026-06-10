require('dns').setDefaultResultOrder('ipv4first');
require('dotenv').config();

const crypto = require('crypto');
const http = require('http');
const { createApp } = require('./src/app');
const config = require('./src/config/env');
const logger = require('./src/utils/logger');
const { attachGracefulShutdown } = require('./src/utils/gracefulShutdown');
const { query } = require('./src/config/db');
const bcrypt = require('bcryptjs');

(async () => {
  try {
    const r = await query('SELECT id, perfil FROM qa_users WHERE email = ?', ['erich@qa.local']);
    if (r.rows.length === 0) {
      const tempPassword = crypto.randomBytes(16).toString('hex');
      const hash = await bcrypt.hash(tempPassword, 10);
      const ins = await query(
        'INSERT INTO qa_users (email, password_hash, name, role, perfil) VALUES (?, ?, ?, ?, ?)',
        ['erich@qa.local', hash, 'Erich Petrocelli', 'Admin', 'admin']
      );
      const adminId = ins.lastID;
      await query(
        `INSERT INTO qa_user_permissions (user_id, can_create_cu, can_create_hu, can_create_suite, can_create_test, can_assign_cu, can_assign_hu, can_assign_suite, can_execute_test, can_manage_projects, can_manage_users, can_configure_jira) VALUES (?, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)`,
        [adminId]
      );
      logger.warn({ email: 'erich@qa.local', tempPassword }, '⚠️  ADMIN CREADO — guardar este password, NO se mostrará de nuevo');
    } else if (r.rows[0].perfil !== 'admin') {
      await query(`UPDATE qa_users SET role = 'Admin', perfil = 'admin' WHERE email = ?`, ['erich@qa.local']);
    }
  } catch (e) {
    logger.error({ err: e.message }, 'Seed admin failed');
  }
})();

const app = createApp();
const server = http.createServer(app);

server.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, `QA Tool -> http://localhost:${config.PORT}`);
});

attachGracefulShutdown(server);
