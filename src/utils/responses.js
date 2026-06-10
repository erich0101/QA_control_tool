function created(res, body = {}) {
    return res.status(201).json({ ok: true, ...body });
}

function ok(res, body = {}) {
    return res.json({ ok: true, ...body });
}

function noContent(res) {
    return res.status(204).send();
}

function fail(res, statusCode, error, code = null) {
    return res.status(statusCode).json({ error, ...(code && { code }) });
}

module.exports = { created, ok, noContent, fail };
