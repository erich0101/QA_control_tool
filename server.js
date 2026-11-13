require('dns').setDefaultResultOrder('ipv4first'); // Fix: forzar IPv4 en redes sin soporte IPv6
require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

const { setupRealtimeChannel } = require('./db');
const evidenceStore = require('./modules/evidence-store');
const explorationsModule = require('./modules/qa-explorations');

// ── Infraestructura extraída del monolito ──
const { requireAuth } = require('./src/middleware/auth');
const { runSchemaMigrations } = require('./src/bootstrap/schema');

// ── Routers (cada uno encapsula un recurso de la API) ──
const authRouter = require('./src/routes/auth');
const usersRouter = require('./src/routes/users');
const projectsRouter = require('./src/routes/projects');
const statsRouter = require('./src/routes/stats');
const toolsRouter = require('./src/routes/tools');
const evidenceRouter = require('./src/routes/evidence');
const useCasesRouter = require('./src/routes/use-cases');
const userStoriesRouter = require('./src/routes/user-stories');
const scenariosRouter = require('./src/routes/scenarios');
const inconsistenciesRouter = require('./src/routes/inconsistencies');
const preconditionsRouter = require('./src/routes/preconditions');
const testSuitesRouter = require('./src/routes/test-suites');
const testCasesRouter = require('./src/routes/test-cases');
const { runsRouter, historyRouter } = require('./src/routes/execution');
const defectsRouter = require('./src/routes/defects');
const hallazgosRouter = require('./src/routes/hallazgos');
const statusHistoryRouter = require('./src/routes/status-history');
const suggestionsRouter = require('./src/routes/suggestions');
const jiraRouter = require('./src/routes/jira');
const debugRouter = require('./src/routes/debug');
const fileTransferRouter = require('./src/routes/file-transfer');
const reportsRouter = require('./src/routes/reports');
const legacyRouter = require('./src/routes/legacy');

const app = express();
const PORT = process.env.PORT || 3333;
const BASE_DIR = __dirname;
const UI_DIST_DIR = path.join(BASE_DIR, 'frontend', 'dist');

app.use(express.json());
app.use(cookieParser());
app.use((req, res, next) => {
    if (req.path.endsWith('.js') || req.path.endsWith('.css')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});
app.use(express.static(path.join(BASE_DIR, 'public')));

// ── Nueva UI (React + Vite) montada en /app ──────────────────
// Estrategia strangler: la UI legacy sigue en / y la nueva convive
// en /app mientras se migran los módulos, sin romper nada.
if (fs.existsSync(UI_DIST_DIR)) {
    console.log('🧩 Nueva UI disponible en /app');
    app.use('/app', express.static(UI_DIST_DIR, { index: false }));
    app.get('/app', (req, res) => res.sendFile(path.join(UI_DIST_DIR, 'index.html')));
    app.get('/app/*', (req, res) => res.sendFile(path.join(UI_DIST_DIR, 'index.html')));
}

// ── AUTH & USERS ──
// Se montan ANTES del requireAuth global: cada ruta aplica el suyo.
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);

app.use('/api', requireAuth);

// Testing Exploratorio (sesiones ad-hoc) — ver modules/qa-explorations/index.js
app.use('/api/explorations', explorationsModule);

// ── PROYECTOS ──
app.use('/api/projects', projectsRouter);

// ── CASOS DE USO (CU / HU / escenarios / inconsistencias / precondiciones) ──
app.use('/api/use-cases', useCasesRouter);
app.use('/api/user-stories', userStoriesRouter);
app.use('/api/scenarios', scenariosRouter);
app.use('/api/inconsistencies', inconsistenciesRouter);
app.use('/api/preconditions', preconditionsRouter);

// ── SUITES, CASOS, EJECUCIÓN, DEFECTOS Y HALLAZGOS ──
app.use('/api/test-suites', testSuitesRouter);
app.use('/api/test-cases', testCasesRouter);
app.use('/api/runs', runsRouter);
app.use('/api/history', historyRouter);
app.use('/api/defects', defectsRouter);
app.use('/api/hallazgos', hallazgosRouter);
app.use('/api/status-history', statusHistoryRouter);
app.use('/api/suggestions', suggestionsRouter);
app.use('/api/jira', jiraRouter);
app.use('/api/debug', debugRouter);

// Import/export de Excel (un router para ambas rutas de import).
app.use('/api', fileTransferRouter);

// ── ESTADÍSTICAS Y TOOLS ──
app.use('/api/stats', statsRouter);
app.use('/api/tools', toolsRouter);

// ── REPORTES Y EVIDENCIAS ──
app.use('/api/reports', reportsRouter);
app.use('/api/evidence', evidenceRouter);

// Legacy: guardado multipart atómico, reporte Python y export del JSON de datos.
app.use('/api', legacyRouter);

// ── Inicialización de Servidor HTTP y WebSocket ──
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Gestión de notificaciones Realtime vía Postgres
function setupRealtime() {
    setupRealtimeChannel((payload) => {
        // Broadcast a todos los clientes conectados
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(payload));
            }
        });
    });
    console.log('📡 Realtime: Listening for database changes via Supabase Realtime...');
}

// Migraciones de esquema en background: el puerto abre sin esperarlas.
runSchemaMigrations()
    .then(() => {
        try {
            setupRealtime();
        } catch (e) {
            console.error('⚠️ Realtime no disponible:', e.message);
        }
    })
    .catch((e) => console.error('⚠️ Error en migraciones de esquema:', e.message));

// ── Arranque HTTP ─────────────────────────────────────────────────────────────
// El listen NO espera a las migraciones de esquema: con la base lenta o caída
// la app abre el puerto igual (y las rutas devuelven el error que corresponda)
// en vez de quedar minutos sin responder.
server.listen(PORT, () => {
    const uiBuilt = fs.existsSync(UI_DIST_DIR);
    console.log(`Manual QA Tool (JIRA Edition) -> http://localhost:${PORT}`);
    if (uiBuilt) {
        console.log(`Nueva UI (React)            -> http://localhost:${PORT}/app`);
    }
});

// Cierre ordenado: cerrar el índice SQLite de evidencias antes de salir.
function gracefulShutdown(signal) {
    console.log(`\n[shutdown] received ${signal}, closing evidence store...`);
    try { evidenceStore.close(); } catch (e) { console.error('[shutdown] evidenceStore.close error:', e.message); }
    try { server.close(() => process.exit(0)); } catch (_) { process.exit(0); }
    // Hard timeout fallback
    setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
