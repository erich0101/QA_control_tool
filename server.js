require('dns').setDefaultResultOrder('ipv4first');
require('dotenv').config();

const crypto = require('crypto');
const http = require('http');
const { createApp } = require('./src/app');
const config = require('./src/config/env');
const logger = require('./src/utils/logger');
const { attachGracefulShutdown } = require('./src/utils/gracefulShutdown');
const { users } = require('./src/repositories');
const { createRealtimeService } = require('./src/services/realtime.service');
const bcrypt = require('bcryptjs');

(async () => {
  try {
    const existing = await users.findByEmail('erich@qa.local');
    if (!existing) {
      const tempPassword = crypto.randomBytes(16).toString('hex');
      const hash = await bcrypt.hash(tempPassword, 10);
      const adminId = await users.create({
        email: 'erich@qa.local',
        passwordHash: hash,
        name: 'Erich Petrocelli',
        role: 'Admin',
        perfil: 'admin',
      });
      await users.permissions.create(adminId, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
      logger.warn({ email: 'erich@qa.local', tempPassword }, '⚠️  ADMIN CREADO — guardar este password, NO se mostrará de nuevo');
    } else if (existing.perfil !== 'admin') {
      await users.update(existing.id, { email: existing.email, name: existing.name, role: 'Admin', perfil: 'admin' });
    }
  } catch (e) {
    logger.error({ err: e.message }, 'Seed admin failed');
  }
})();

const app = createApp();
const server = http.createServer(app);

const realtime = createRealtimeService();
realtime.attach(server);

server.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV, wsPath: '/ws' }, `QA Tool -> http://localhost:${config.PORT}`);
});

attachGracefulShutdown(server, { onShutdown: () => realtime.close() });
