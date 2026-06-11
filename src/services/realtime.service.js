'use strict';

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const { getSupabaseClient } = require('../config/supabase');
const logger = require('../utils/logger');
const { UnauthorizedError } = require('../middleware/errors');

const WATCHED_TABLES = [
    'qa_executions',
    'qa_test_runs',
    'qa_test_suites',
    'qa_test_cases',
    'qa_defects',
    'qa_attachments',
];

const HEARTBEAT_INTERVAL_MS = 30000;
const MAX_PAYLOAD_BYTES = 64 * 1024;

function parseCookies(header) {
    const cookies = {};
    if (!header) return cookies;
    for (const part of header.split(';')) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        const key = part.slice(0, idx).trim();
        const val = part.slice(idx + 1).trim();
        if (key) cookies[key] = decodeURIComponent(val);
    }
    return cookies;
}

function authFromRequest(req) {
    try {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const tokenQuery = url.searchParams.get('token');
        const cookies = parseCookies(req.headers.cookie);
        const token = tokenQuery || cookies.token;
        if (!token) return null;
        return jwt.verify(token, JWT_SECRET);
    } catch (_) {
        return null;
    }
}

function createRealtimeService() {
    let wss = null;
    let supabaseChannel = null;
    let heartbeatTimer = null;
    let refCount = 0;

    function broadcast(payload) {
        if (!wss) return;
        const message = JSON.stringify(payload);
        let sent = 0;
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(message);
                    sent++;
                } catch (err) {
                    logger.warn({ err: err.message }, 'WS send failed');
                }
            }
        });
        logger.debug({ event: payload?.event, table: payload?.table, sent }, 'WS broadcast');
    }

    async function ensureSupabaseSubscription() {
        if (supabaseChannel) return supabaseChannel;
        const client = getSupabaseClient();
        let ch = client.channel('qa-realtime-broadcast', {
            config: { broadcast: { self: false }, presence: { key: '' } },
        });
        for (const table of WATCHED_TABLES) {
            ch = ch.on(
                'postgres_changes',
                { event: '*', schema: 'public', table },
                (payload) => {
                    broadcast({
                        source: 'supabase',
                        event: payload.eventType,
                        table: payload.table,
                        schema: payload.schema,
                        new: payload.new,
                        old: payload.old,
                        ts: Date.now(),
                    });
                }
            );
        }
        ch.subscribe((status, err) => {
            if (err) {
                logger.error({ err: err.message }, 'Supabase realtime subscription error');
                return;
            }
            logger.info({ status }, 'Supabase realtime channel status');
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                supabaseChannel = null;
                ch = null;
            }
        });
        supabaseChannel = ch;
        return ch;
    }

    function teardownSupabaseSubscription() {
        if (!supabaseChannel) return;
        try {
            supabaseChannel.unsubscribe();
        } catch (err) {
            logger.warn({ err: err.message }, 'Supabase channel unsubscribe error');
        }
        supabaseChannel = null;
    }

    function heartbeat() {
        if (!wss) return;
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.ping();
                    if (client.isAlive === false) {
                        client.terminate();
                        return;
                    }
                    client.isAlive = true;
                } catch (_) {
                    try { client.terminate(); } catch (_) { /* noop */ }
                }
            }
        });
    }

    function attach(httpServer) {
        if (wss) return wss;

        wss = new WebSocket.Server({
            server: httpServer,
            path: '/ws',
            maxPayload: MAX_PAYLOAD_BYTES,
            verifyClient: ({ req }, cb) => {
                const user = authFromRequest(req);
                if (!user) {
                    return cb(false, 401, 'Unauthorized');
                }
                req.user = user;
                cb(true);
            },
        });

        wss.on('connection', (socket, req) => {
            socket.isAlive = true;
            refCount++;
            const user = req.user || {};
            logger.info({ userId: user.id, email: user.email, refCount }, 'WS client connected');

            socket.on('pong', () => { socket.isAlive = true; });

            socket.on('message', (raw) => {
                try {
                    const msg = JSON.parse(raw.toString());
                    if (msg && msg.type === 'ping') {
                        socket.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
                    } else if (msg && msg.type === 'subscribe' && Array.isArray(msg.tables)) {
                        socket._subscribedTables = new Set(msg.tables.filter((t) => WATCHED_TABLES.includes(t)));
                    }
                } catch (err) {
                    logger.warn({ err: err.message }, 'WS invalid message');
                }
            });

            socket.on('close', () => {
                refCount = Math.max(0, refCount - 1);
                logger.info({ userId: user.id, refCount }, 'WS client disconnected');
                if (refCount === 0) {
                    setTimeout(() => {
                        if (refCount === 0) teardownSupabaseSubscription();
                    }, 5000);
                }
            });

            socket.on('error', (err) => {
                logger.warn({ err: err.message, userId: user.id }, 'WS socket error');
            });

            try {
                socket.send(JSON.stringify({
                    type: 'hello',
                    server: 'qa-control-tool',
                    userId: user.id,
                    tables: WATCHED_TABLES,
                    ts: Date.now(),
                }));
            } catch (err) {
                logger.warn({ err: err.message }, 'WS hello send failed');
            }

            ensureSupabaseSubscription().catch((err) => {
                logger.error({ err: err.message }, 'Failed to ensure Supabase subscription');
            });
        });

        wss.on('error', (err) => {
            logger.error({ err: err.message }, 'WS server error');
        });

        heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
        if (heartbeatTimer.unref) heartbeatTimer.unref();

        logger.info({ path: '/ws', tables: WATCHED_TABLES }, 'WebSocket server attached');
        return wss;
    }

    async function close() {
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
        teardownSupabaseSubscription();
        if (wss) {
            await new Promise((resolve) => wss.close(() => resolve()));
            wss = null;
        }
    }

    return { attach, close, broadcast, _wss: () => wss, _refCount: () => refCount };
}

module.exports = { createRealtimeService, WATCHED_TABLES, parseCookies };
