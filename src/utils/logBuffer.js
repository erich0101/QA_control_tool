'use strict';

const { Writable } = require('stream');

const MAX_ENTRIES = 2000;

class LogRingBuffer {
    constructor(maxEntries = MAX_ENTRIES) {
        this.max = maxEntries;
        this.entries = [];
    }

    writeObj(obj) {
        const entry = {
            ts: obj.time || new Date().toISOString(),
            level: obj.level || 'info',
            requestId: obj.requestId || null,
            msg: obj.msg || null,
            data: { ...obj },
        };
        delete entry.data.time;
        delete entry.data.level;
        delete entry.data.requestId;
        delete entry.data.msg;
        delete entry.data.pid;
        delete entry.data.hostname;
        delete entry.data.service;
        this.entries.push(entry);
        if (this.entries.length > this.max) {
            this.entries.splice(0, this.entries.length - this.max);
        }
    }

    getByRequestId(requestId) {
        if (!requestId) return [];
        const needle = String(requestId);
        return this.entries.filter((e) => e.requestId === needle || e.data && e.data.requestId === needle);
    }

    recent(limit = 100) {
        return this.entries.slice(-limit).reverse();
    }
}

const ringBuffer = new LogRingBuffer();

const stream = new Writable({
    write(chunk, _enc, cb) {
        try {
            const str = chunk && chunk.toString ? chunk.toString() : String(chunk);
            const obj = JSON.parse(str);
            ringBuffer.writeObj(obj);
        } catch (_) {
            // ignore non-JSON lines
        }
        cb();
    },
});

function getRingBuffer() {
    return ringBuffer;
}

module.exports = { stream, ringBuffer, getRingBuffer, LogRingBuffer };
