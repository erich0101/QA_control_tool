const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const REQUEST_BUILDER_TIMEOUT_MS = 30_000;
const REQUEST_BUILDER_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const REQUEST_BUILDER_BODY_LIMIT = '20mb';

router.post('/request-builder/exec', requireAuth, express.json({ limit: REQUEST_BUILDER_BODY_LIMIT }), async (req, res) => {
    try {
        const { method, url, headers = {}, body = null, bodyType = 'none', files = [] } = req.body;

        const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
        const ALLOWED_BODY_TYPES = ['none', 'json', 'form-data', 'x-www-form-urlencoded', 'raw', 'binary'];

        const m = String(method || '').toUpperCase();
        if (!ALLOWED_METHODS.includes(m)) {
            return res.status(400).json({ error: 'Método inválido' });
        }
        if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
            return res.status(400).json({ error: 'URL inválida (debe empezar con http:// o https://)' });
        }
        if (!ALLOWED_BODY_TYPES.includes(bodyType)) {
            return res.status(400).json({ error: 'bodyType inválido' });
        }

        console.info('[req-builder]', { userId: req.user.id, method: m, url, bodyType, ts: new Date().toISOString() });

        const outHeaders = { ...headers };
        let outBody;

        if (bodyType === 'json') {
            if (!outHeaders['Content-Type'] && !outHeaders['content-type']) {
                outHeaders['Content-Type'] = 'application/json';
            }
            outBody = typeof body === 'string' ? body : JSON.stringify(body);
        } else if (bodyType === 'x-www-form-urlencoded') {
            if (!outHeaders['Content-Type'] && !outHeaders['content-type']) {
                outHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
            }
            const params = new URLSearchParams();
            if (body && typeof body === 'object') {
                for (const [k, v] of Object.entries(body)) {
                    if (v != null) params.append(k, String(v));
                }
            }
            outBody = params.toString();
        } else if (bodyType === 'form-data') {
            const form = new FormData();
            if (body && typeof body === 'object') {
                for (const [k, v] of Object.entries(body)) {
                    if (v != null) form.append(k, String(v));
                }
            }
            for (const f of (Array.isArray(files) ? files : [])) {
                if (!f || !f.base64 || !f.fieldName) continue;
                const bytes = Buffer.from(f.base64, 'base64');
                form.append(f.fieldName, new Blob([bytes], { type: f.type || 'application/octet-stream' }), f.filename || 'file');
            }
            outBody = form;
        } else if (bodyType === 'raw') {
            outBody = typeof body === 'string' ? body : (body == null ? '' : String(body));
            if (!outHeaders['Content-Type'] && !outHeaders['content-type']) {
                outHeaders['Content-Type'] = 'text/plain';
            }
        } else if (bodyType === 'binary') {
            outBody = (typeof body === 'string' && body.length > 0) ? Buffer.from(body, 'base64') : Buffer.alloc(0);
            if (!outHeaders['Content-Type'] && !outHeaders['content-type']) {
                outHeaders['Content-Type'] = 'application/octet-stream';
            }
        } else {
            outBody = undefined;
        }

        const t0 = Date.now();
        const fetchRes = await fetch(url, {
            method: m,
            headers: outHeaders,
            body: outBody,
            signal: AbortSignal.timeout(REQUEST_BUILDER_TIMEOUT_MS)
        });
        const t1 = Date.now();

        let respBody = await fetchRes.text();
        let truncated = false;
        if (respBody.length > REQUEST_BUILDER_MAX_RESPONSE_BYTES) {
            respBody = respBody.slice(0, REQUEST_BUILDER_MAX_RESPONSE_BYTES) + '\n… [truncated at 5MB]';
            truncated = true;
        }

        res.json({
            ok: true,
            status: fetchRes.status,
            statusText: fetchRes.statusText,
            headers: Object.fromEntries(fetchRes.headers.entries()),
            body: respBody,
            timeMs: t1 - t0,
            sizeBytes: Buffer.byteLength(respBody, 'utf8'),
            truncated
        });
    } catch (err) {
        const isTimeout = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
        res.json({
            ok: false,
            error: isTimeout
                ? `La petición excedió el tiempo máximo de ${REQUEST_BUILDER_TIMEOUT_MS / 1000}s`
                : (err.message || 'Error desconocido al ejecutar la petición')
        });
    }
});

module.exports = router;
