const crypto = require('crypto');

// AES-256-CBC requiere una clave de 32 bytes. Aceptamos:
//  - 32 caracteres (clave histórica del proyecto, se mantiene igual),
//  - 64 caracteres hex (formato recomendado en .env.example),
//  - cualquier otra cadena: se deriva con SHA-256 para no romper el arranque.
function getEncryptionKey() {
    const raw = process.env.JIRA_ENCRYPTION_KEY || 'a'.repeat(32);
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
    const asUtf8 = Buffer.from(raw);
    if (asUtf8.length === 32) return asUtf8;
    return crypto.createHash('sha256').update(raw).digest();
}

const ENCRYPTION_KEY = getEncryptionKey();
const IV_LENGTH = 16; // Para AES, esto es siempre 16

function encrypt(text) {
    if (!text) return null;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    if (!text) return null;
    try {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (err) {
        console.error('Error decrypting Jira token:', err.message);
        return null;
    }
}

module.exports = { encrypt, decrypt };
