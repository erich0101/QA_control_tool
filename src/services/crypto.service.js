const crypto = require('crypto');
const ENCRYPTION_KEY = require('../config/env').JIRA_ENCRYPTION_KEY;

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function encrypt(text) {
    if (!text) return null;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    const enc = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join(':');
}

function decrypt(payload) {
    if (!payload) return null;
    try {
        const parts = String(payload).split(':');
        if (parts.length !== 3) return null;
        const [ivHex, tagHex, encHex] = parts;
        if (ivHex.length !== IV_LENGTH * 2 || tagHex.length !== AUTH_TAG_LENGTH * 2) return null;

        const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
        const dec = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
        return dec.toString('utf8');
    } catch (err) {
        return null;
    }
}

module.exports = { encrypt, decrypt };
