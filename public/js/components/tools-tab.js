import { UI } from '../utils/ui-utils.js';
import { ApiService } from '../services/api.js';

const SUBTOOLS = [
    { id: 'base64', icon: '🔤', label: 'Base64', desc: 'Encode / Decode' },
    { id: 'request-builder', icon: '🚀', label: 'Request Builder', desc: 'HTTP requests' }
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const CHUNK_THRESHOLD = 1 * 1024 * 1024;
const CHUNK_SIZE = 8192;

// ── Encode / decode helpers (file-private) ──

function b64EncodeBytes(uint8, urlSafe) {
    let str;
    if (uint8.length <= CHUNK_THRESHOLD) {
        str = btoa(String.fromCharCode(...uint8));
    } else {
        let acc = '';
        for (let i = 0; i < uint8.length; i += CHUNK_SIZE) {
            acc += String.fromCharCode.apply(null, uint8.subarray(i, i + CHUNK_SIZE));
        }
        str = btoa(acc);
    }
    if (urlSafe) {
        str = str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    return str;
}

function b64DecodeToBytes(b64) {
    // Normalize URL-safe to standard b64 (idempotent for already-standard input)
    const normalized = b64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    if (padded.length <= CHUNK_THRESHOLD * 4 / 3) {
        const bin = atob(padded);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    // Chunked: slice in multiples of 4 chars (atob requires padded input)
    const CHUNK_B64 = CHUNK_SIZE * 4;
    let out = [];
    for (let i = 0; i < padded.length; i += CHUNK_B64) {
        let slice = padded.slice(i, i + CHUNK_B64);
        const rem = (4 - (slice.length % 4)) % 4;
        if (rem) slice += '='.repeat(rem);
        const bin = atob(slice);
        for (let j = 0; j < bin.length; j++) out.push(bin.charCodeAt(j));
    }
    return new Uint8Array(out);
}

function b64EncodeText(text, urlSafe) {
    if (text === '') return '';
    const bytes = new TextEncoder().encode(text);
    return b64EncodeBytes(bytes, urlSafe);
}

function b64DecodeText(b64, urlSafe) {
    if (b64 === '') return { ok: true, value: '' };
    let normalized = b64.replace(/\s+/g, '');
    if (urlSafe) {
        normalized = normalized.replace(/-/g, '+').replace(/_/g, '/');
    }
    normalized = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
        return { ok: false, error: 'Base64 inválido' };
    }
    try {
        const bytes = b64DecodeToBytes(normalized);
        const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        return { ok: true, value };
    } catch (err) {
        return { ok: false, error: 'Base64 inválido o UTF-8 corrupto' };
    }
}

function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsArrayBuffer(file);
    });
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsText(file, 'utf-8');
    });
}

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) { /* fallback */ }
    }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch (e) {
        return false;
    }
}

// ── Tab object ──

export const ToolsTab = {
    state: {
        activeTool: null,
        base64: {
            mode: 'encode',
            urlSafe: false,
            input: '',
            output: '',
            file: null,
            fileBytes: null,
            error: null
        },
        requestBuilder: {
            method: 'GET',
            url: '',
            headers:    [{ key: '', value: '', enabled: true }],
            queryParams:[{ key: '', value: '', enabled: true }],
            body: '',
            bodyType: 'none',
            formFields: [{ key: '', value: '', enabled: true }],
            rawContentType: 'text/plain',
            files: [],
            curlInput: '',
            hasLocalCurlFiles: false,
            response: null,
            error: null,
            loading: false
        }
    },

    render(container) {
        container.innerHTML = `
            <div class="ts-shell">
                <aside class="ts-sidebar glass-card">
                    <div class="ts-sidebar-header">
                        🛠️ Tools
                        <span class="ts-subtitle">Utilidades</span>
                    </div>
                    <div class="ts-sideitem-list" id="ts-sideitem-list">
                        ${SUBTOOLS.map(t => `
                            <button class="ts-sideitem ${this.state.activeTool === t.id ? 'active' : ''}" data-tool="${t.id}">
                                <span style="font-size:1.05rem;">${t.icon}</span>
                                <span style="flex:1; min-width:0;">
                                    <span style="display:block; font-weight:600;">${UI.escapeHTML(t.label)}</span>
                                    <span class="ts-sideitem-desc">${UI.escapeHTML(t.desc)}</span>
                                </span>
                            </button>
                        `).join('')}
                    </div>
                    <div class="ts-sidebar-footer">Frontend only — tus datos no salen del navegador.</div>
                </aside>
                <main class="ts-main" id="tools-main-pane"></main>
            </div>
        `;
        this.bindEvents(container);
        this.renderMainPane(container);
    },

    bindEvents(container) {
        const list = container.querySelector('#ts-sideitem-list');
        if (!list || list.dataset.bound) return;
        list.dataset.bound = '1';
        list.addEventListener('click', (e) => {
            const btn = e.target.closest('.ts-sideitem');
            if (!btn) return;
            const tool = btn.dataset.tool;
            if (this.state.activeTool === tool) return;
            this.state.activeTool = tool;
            list.querySelectorAll('.ts-sideitem').forEach(b => {
                b.classList.toggle('active', b.dataset.tool === tool);
            });
            this.renderMainPane(container);
        });
    },

    renderMainPane(container) {
        const pane = container.querySelector('#tools-main-pane');
        if (!pane) return;
        if (!this.state.activeTool) {
            pane.innerHTML = this.renderEmptyState();
            return;
        }
        if (this.state.activeTool === 'base64') {
            pane.innerHTML = this.renderBase64();
            this.bindBase64Tool(container);
        }
        if (this.state.activeTool === 'request-builder') {
            pane.innerHTML = this.renderRequestBuilder();
            this.bindRequestBuilder(container);
        }
    },

    renderEmptyState() {
        return `
            <div class="empty-state">
                <div class="empty-state-icon">🛠️</div>
                <h3>Seleccioná una herramienta</h3>
                <p>Esta sección reúne utilidades locales del navegador. Elegí una opción del panel izquierdo.</p>
                <div class="ts-empty-grid">
                    ${SUBTOOLS.map(t => `
                        <button class="glass-card ts-empty-card" data-empty-tool="${t.id}" style="text-align:left; padding:16px; cursor:pointer; border:none; color:inherit; font-family:inherit;">
                            <div style="font-size:1.6rem; margin-bottom:8px;">${t.icon}</div>
                            <div style="font-weight:700; color:var(--apple-label); font-size:0.95rem; margin-bottom:4px;">${UI.escapeHTML(t.label)}</div>
                            <div style="font-size:0.75rem; color:var(--apple-label-tertiary);">${UI.escapeHTML(t.desc)}</div>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    },

    renderBase64() {
        const b = this.state.base64;
        const isEncode = b.mode === 'encode';
        const fileMeta = b.file
            ? `<div class="b64-file-meta">
                <span>📎 ${UI.escapeHTML(b.file.name)} <span style="opacity:0.7;">(${formatSize(b.file.size)})</span></span>
                <button class="btn btn-ghost btn-sm" id="b64-remove-file" style="padding:2px 8px; font-size:0.7rem;">✕ Quitar</button>
            </div>` : '';

        return `
            <div class="ts-tool-header">
                <div>
                    <h2>🔤 Base64</h2>
                    <div class="ts-tool-sub">Encodea o decodifica texto y archivos.</div>
                </div>
                <div class="segment-control" id="b64-segment">
                    <button class="segment-item ${isEncode ? 'active' : ''}" data-b64-mode="encode">Codificar</button>
                    <button class="segment-item ${!isEncode ? 'active' : ''}" data-b64-mode="decode">Decodificar</button>
                </div>
            </div>

            <div class="ts-grid-2">
                <div class="glass-card" style="padding:16px;">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                        <span style="font-weight:700; color:var(--apple-label); font-size:0.85rem;">Entrada</span>
                        <button class="btn btn-ghost btn-sm" id="b64-pick-file" style="font-size:0.72rem;">📎 Adjuntar archivo</button>
                        <input type="file" id="b64-file" style="display:none;">
                    </div>
                    <div class="b64-dropzone" id="b64-dropzone">
                        <textarea id="b64-input" placeholder="${isEncode ? 'Pegá texto o arrastrá un archivo...' : 'Pegá base64 acá (o arrastrá un archivo .txt/.b64)...'}" style="width:100%; min-height:200px; padding:10px 12px; border-radius:var(--apple-radius-md); border:1px solid transparent; background:var(--apple-bg-tertiary); color:var(--apple-label); font-family:var(--apple-font-mono, monospace); font-size:0.82rem; line-height:1.5; outline:none; resize:vertical; box-sizing:border-box;">${UI.escapeHTML(b.input)}</textarea>
                    </div>
                    ${fileMeta}
                </div>

                <div class="glass-card" style="padding:16px;">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                        <span style="font-weight:700; color:var(--apple-label); font-size:0.85rem;">Salida</span>
                        <button class="btn btn-ghost btn-sm" id="b64-copy" style="font-size:0.72rem;">📋 Copiar</button>
                    </div>
                    <textarea id="b64-output" readonly placeholder="${isEncode ? 'Acá aparece el base64...' : 'Acá aparece el texto decodificado...'}" style="width:100%; min-height:200px; padding:10px 12px; border-radius:var(--apple-radius-md); border:1px solid var(--apple-separator); background:var(--apple-bg-tertiary); color:var(--apple-label); font-family:var(--apple-font-mono, monospace); font-size:0.82rem; line-height:1.5; outline:none; resize:vertical; box-sizing:border-box;">${UI.escapeHTML(b.output)}</textarea>
                    ${b.error ? `<div class="b64-error-pill">⚠️ ${UI.escapeHTML(b.error)}</div>` : ''}
                    ${!isEncode ? `<button class="btn btn-primary btn-sm" id="b64-decode-file" style="margin-top:10px; width:100%; background:var(--apple-blue); color:white; border:none;" ${b.output ? '' : 'disabled'}>💾 Decodificar a archivo</button>` : ''}
                </div>
            </div>

            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="btn btn-primary btn-sm" id="b64-copy-2" style="background:var(--apple-blue); color:white; border:none;">📋 Copiar salida</button>
                    <button class="btn btn-ghost btn-sm" id="b64-clear">🗑️ Limpiar</button>
                    <button class="btn btn-ghost btn-sm" id="b64-swap" ${(!b.input || !b.output) ? 'disabled' : ''}>⇄ Intercambiar</button>
                </div>
                <label class="b64-toggle">
                    <input type="checkbox" id="b64-urlsafe" ${b.urlSafe ? 'checked' : ''}>
                    URL-safe
                </label>
            </div>

            <div style="font-size:0.7rem; color:var(--apple-label-tertiary); line-height:1.5;">
                Tip: el modo URL-safe reemplaza <code>+</code>/<code>/</code> por <code>-</code>/<code>_</code> y elimina el padding <code>=</code>.
                Los archivos &gt; 1 MB se procesan por chunks para evitar desbordamiento de stack. Tope: 10 MB.
            </div>
        `;
    },

    bindBase64Tool(container) {
        const pane = container.querySelector('#tools-main-pane');
        if (!pane) return;
        const b = this.state.base64;

        // Segment control
        pane.querySelectorAll('[data-b64-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.b64Mode;
                if (mode === b.mode) return;
                b.mode = mode;
                b.output = '';
                b.error = null;
                b.file = null;
                b.fileBytes = null;
                pane.innerHTML = this.renderBase64();
                this.bindBase64Tool(container);
            });
        });

        // URL-safe toggle
        const urlSafeEl = pane.querySelector('#b64-urlsafe');
        urlSafeEl?.addEventListener('change', () => {
            b.urlSafe = urlSafeEl.checked;
            this.recomputeOutput(container);
        });

        // Input textarea
        const inputEl = pane.querySelector('#b64-input');
        if (inputEl) {
            UI.autoResizeTextarea(inputEl);
            inputEl.addEventListener('input', () => {
                b.input = inputEl.value;
                b.file = null;
                b.fileBytes = null;
                this.recomputeOutput(container);
            });
        }

        // File picker
        const pickBtn = pane.querySelector('#b64-pick-file');
        const fileInput = pane.querySelector('#b64-file');
        pickBtn?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', (e) => {
            const f = e.target.files?.[0];
            if (f) this.handleFile(f, container);
            e.target.value = '';
        });

        // Drop zone
        const dropzone = pane.querySelector('#b64-dropzone');
        if (dropzone) {
            dropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropzone.classList.add('dragover');
            });
            dropzone.addEventListener('dragleave', (e) => {
                if (e.target === dropzone) dropzone.classList.remove('dragover');
            });
            dropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropzone.classList.remove('dragover');
                const f = e.dataTransfer?.files?.[0];
                if (f) this.handleFile(f, container);
            });
        }

        // Copy buttons (both, top-right + footer)
        pane.querySelectorAll('#b64-copy, #b64-copy-2').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!b.output) {
                    UI.toast('No hay salida para copiar', 'warn');
                    return;
                }
                const ok = await copyToClipboard(b.output);
                UI.toast(ok ? 'Copiado al portapapeles' : 'No se pudo copiar', ok ? 'ok' : 'error');
            });
        });

        // Decode to file (decode mode only)
        pane.querySelector('#b64-decode-file')?.addEventListener('click', () => {
            this.decodeToFile();
        });

        // Remove file
        pane.querySelector('#b64-remove-file')?.addEventListener('click', () => {
            b.file = null;
            b.fileBytes = null;
            pane.innerHTML = this.renderBase64();
            this.bindBase64Tool(container);
        });

        // Clear
        pane.querySelector('#b64-clear')?.addEventListener('click', () => {
            b.input = '';
            b.output = '';
            b.error = null;
            b.file = null;
            b.fileBytes = null;
            pane.innerHTML = this.renderBase64();
            this.bindBase64Tool(container);
        });

        // Swap
        pane.querySelector('#b64-swap')?.addEventListener('click', () => {
            if (!b.input || !b.output) return;
            b.input = b.output;
            b.output = '';
            b.error = null;
            b.mode = b.mode === 'encode' ? 'decode' : 'encode';
            pane.innerHTML = this.renderBase64();
            this.bindBase64Tool(container);
        });

        // Empty-state cards (delegate on container)
        const onEmptyClick = (e) => {
            const card = e.target.closest('[data-empty-tool]');
            if (!card) return;
            this.state.activeTool = card.dataset.emptyTool;
            const list = container.querySelector('#ts-sideitem-list');
            list?.querySelectorAll('.ts-sideitem').forEach(b2 => {
                b2.classList.toggle('active', b2.dataset.tool === this.state.activeTool);
            });
            this.renderMainPane(container);
        };
        container.addEventListener('click', onEmptyClick, { once: true });
    },

    recomputeOutput(container) {
        const b = this.state.base64;
        if (b.fileBytes && b.mode === 'encode') {
            const u8 = new Uint8Array(b.fileBytes);
            try {
                b.output = b64EncodeBytes(u8, b.urlSafe);
                b.error = null;
            } catch (err) {
                b.output = '';
                b.error = err.message;
            }
        } else if (b.mode === 'encode') {
            try {
                b.output = b64EncodeText(b.input, b.urlSafe);
                b.error = null;
            } catch (err) {
                b.output = '';
                b.error = err.message;
            }
        } else {
            const res = b64DecodeText(b.input, b.urlSafe);
            if (res.ok) {
                b.output = res.value;
                b.error = null;
            } else {
                b.error = res.error;
            }
        }
        const pane = container.querySelector('#tools-main-pane');
        const outEl = pane?.querySelector('#b64-output');
        if (outEl) outEl.value = b.output;
        // Refresh error pill + button disabled states without full re-render
        let errPill = pane?.querySelector('.b64-error-pill');
        if (b.error) {
            if (!errPill) {
                errPill = document.createElement('div');
                errPill.className = 'b64-error-pill';
                const outCard = pane.querySelector('#b64-output')?.parentElement;
                outCard?.appendChild(errPill);
            }
            errPill.textContent = `⚠️ ${b.error}`;
        } else if (errPill) {
            errPill.remove();
        }
        const swapBtn = pane?.querySelector('#b64-swap');
        if (swapBtn) swapBtn.disabled = !b.input || !b.output;
        const decodeFileBtn = pane?.querySelector('#b64-decode-file');
        if (decodeFileBtn) decodeFileBtn.disabled = !b.output;
    },

    async handleFile(file, container) {
        const b = this.state.base64;
        if (file.size > MAX_FILE_SIZE) {
            UI.toast('Archivo demasiado grande (máx 10 MB)', 'error');
            return;
        }
        b.file = file;
        try {
            if (b.mode === 'encode') {
                const buf = await readFileAsArrayBuffer(file);
                b.fileBytes = buf;
                const u8 = new Uint8Array(buf);
                b.output = b64EncodeBytes(u8, b.urlSafe);
                b.error = null;
            } else {
                const text = await readFileAsText(file);
                b.input = text;
                b.fileBytes = null;
                const res = b64DecodeText(text, b.urlSafe);
                if (res.ok) {
                    b.output = res.value;
                    b.error = null;
                } else {
                    b.error = res.error;
                }
            }
            const pane = container.querySelector('#tools-main-pane');
            if (pane) {
                pane.innerHTML = this.renderBase64();
                this.bindBase64Tool(container);
            }
        } catch (err) {
            UI.toast(`Error leyendo archivo: ${err.message}`, 'error');
        }
    },

    decodeToFile() {
        const b = this.state.base64;
        if (!b.output) return;
        try {
            let bytes;
            if (b.mode === 'decode') {
                let normalized = b.output.replace(/\s+/g, '');
                if (b.urlSafe) {
                    normalized = normalized.replace(/-/g, '+').replace(/_/g, '/');
                }
                normalized = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
                bytes = b64DecodeToBytes(normalized);
            } else {
                return;
            }
            const blob = new Blob([bytes], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'decoded.bin';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err) {
            UI.toast(`Error al decodificar: ${err.message}`, 'error');
        }
    },

    // ══════════════════════════════════════════════════════════════
    // ── REQUEST BUILDER ──
    // ══════════════════════════════════════════════════════════════

    // ── Curl parser (file-private) ──

    _tokenizeCurl(input) {
        const args = [];
        let current = '';
        let inSingle = false;
        let inDouble = false;
        for (let i = 0; i < input.length; i++) {
            const c = input[i];
            if (c === "'" && !inDouble) {
                inSingle = !inSingle;
                continue;
            }
            if (c === '"' && !inSingle) {
                inDouble = !inDouble;
                continue;
            }
            if (!inSingle && !inDouble && (c === ' ' || c === '\t' || c === '\n' || c === '\r')) {
                if (current) { args.push(current); current = ''; }
                continue;
            }
            if (!inSingle && c === '\\' && i + 1 < input.length) {
                // Bash line continuation: backslash + newline → consume both, no token split
                if (input[i + 1] === '\n' || input[i + 1] === '\r') {
                    i++;
                    continue;
                }
                current += input[++i];
                continue;
            }
            current += c;
        }
        if (current) args.push(current);
        return args;
    },

    parseCurl(raw) {
        if (typeof raw !== 'string') return { ok: false, error: 'Entrada inválida' };
        const trimmed = raw.trim();
        if (!trimmed) return { ok: false, error: 'Entrada vacía' };
        if (!/^curl(\s|$)/i.test(trimmed)) return { ok: false, error: 'No parece un comando curl' };

        const args = this._tokenizeCurl(trimmed);
        let method, url;
        const headers = [];
        let body, bodyType;
        const formTextFields = {};
        let hasLocalCurlFiles = false;

        for (let i = 0; i < args.length; i++) {
            const a = args[i];
            if (a === 'curl' || a.startsWith('-')) {
                if (a === '-X' || a === '--request') {
                    method = String(args[++i] || '').toUpperCase();
                } else if (a === '-H' || a === '--header') {
                    const hv = args[++i] || '';
                    const ci = hv.indexOf(':');
                    if (ci > 0) headers.push([hv.slice(0, ci).trim(), hv.slice(ci + 1).trim()]);
                } else if (a === '-d' || a === '--data' || a === '--data-raw' || a === '--data-binary') {
                    body = args[++i] || '';
                    if (!method) method = 'POST';
                    if (!bodyType) {
                        const s = body.trim();
                        if (s.startsWith('{') || s.startsWith('[')) bodyType = 'json';
                        else if (/^[\w[\].-]+=/.test(s)) bodyType = 'x-www-form-urlencoded';
                        else bodyType = 'raw';
                    }
                } else if (a === '--json') {
                    body = args[++i] || '';
                    if (!method) method = 'POST';
                    bodyType = 'json';
                    if (!headers.some(([k]) => k.toLowerCase() === 'content-type')) {
                        headers.push(['Content-Type', 'application/json']);
                    }
                } else if (a === '-F' || a === '--form') {
                    const fv = args[++i] || '';
                    const eq = fv.indexOf('=');
                    if (eq > 0) {
                        const fk = fv.slice(0, eq);
                        const fv2 = fv.slice(eq + 1);
                        if (fv2.startsWith('@')) {
                            hasLocalCurlFiles = true;
                        } else {
                            formTextFields[fk] = fv2;
                        }
                    }
                    if (!method) method = 'POST';
                    if (!bodyType) {
                        bodyType = hasLocalCurlFiles ? 'form-data' : 'x-www-form-urlencoded';
                    }
                } else if (a === '-u' || a === '--user') {
                    const cred = args[++i] || '';
                    try {
                        const b64 = btoa(cred);
                        headers.push(['Authorization', `Basic ${b64}`]);
                    } catch (e) { /* ignore */ }
                } else if (a === '-b' || a === '--cookie') {
                    headers.push(['Cookie', args[++i] || '']);
                } else if (a === '--url') {
                    url = args[++i];
                } else if (a === '-L' || a === '--location' || a === '-s' || a === '--silent' ||
                           a === '-S' || a === '--compressed' || a === '-k' || a === '--insecure' ||
                           a === '--fail' || a === '-#' || a === '-i' || a === '-v' || a === '--verbose') {
                    // consumer flags — ignore
                } else if (a === '--url' || a === '-K' || a === '--config') {
                    i++;
                } else if (a.startsWith('--')) {
                    // unknown long flag with possible value: peek next arg
                    if (i + 1 < args.length && !args[i + 1].startsWith('-')) i++;
                } else if (a.length === 2 && a.startsWith('-')) {
                    // unknown short flag cluster: skip
                }
            } else if (/^https?:\/\//i.test(a)) {
                url = a;
            }
        }

        if (!url) return { ok: false, error: 'No se encontró la URL en el curl' };
        if (!method) method = (body || Object.keys(formTextFields).length || hasLocalCurlFiles) ? 'POST' : 'GET';
        if (bodyType === 'form-data' || bodyType === 'x-www-form-urlencoded') {
            if (Object.keys(formTextFields).length > 0) body = formTextFields;
        }

        const out = { method, url, headers, body, bodyType: bodyType || 'none', hasLocalCurlFiles };
        return { ok: true, value: out };
    },

    // ── KV helpers (file-private) ──

    _kvToObject(rows) {
        const out = {};
        if (!Array.isArray(rows)) return out;
        for (const r of rows) {
            if (r && r.enabled && r.key && r.key.trim()) {
                out[r.key] = r.value;
            }
        }
        return out;
    },

    // ── Render: Request Builder ──

    renderRequestBuilder() {
        const rb = this.state.requestBuilder;
        const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
        const BODY_TYPES = ['none', 'json', 'form-data', 'x-www-form-urlencoded', 'raw', 'binary'];
        const BODYTYPE_LABELS = {
            'none': 'Sin body',
            'json': 'JSON',
            'form-data': 'Form Data',
            'x-www-form-urlencoded': 'URL-encoded',
            'raw': 'Raw',
            'binary': 'Binary'
        };

        return `
            <div class="ts-tool-header">
                <div>
                    <h2>🚀 Request Builder</h2>
                    <div class="ts-tool-sub">Construí una HTTP request manualmente, pegá un curl, o adjuntá archivos. La petición se envía a través del proxy del backend.</div>
                </div>
            </div>

            <div class="rb-bar">
                <select id="rb-method" class="rb-method-select">
                    ${METHODS.map(m => `<option value="${m}" ${m === rb.method ? 'selected' : ''}>${m}</option>`).join('')}
                </select>
                <input id="rb-url" class="rb-url-input" placeholder="https://api.ejemplo.com/v1/..." value="${UI.escapeHTML(rb.url)}">
                <button id="rb-send" class="rb-send-btn" ${rb.loading ? 'disabled' : ''}>${rb.loading ? '⏳ Enviando…' : '▶ Send'}</button>
            </div>

            <details class="rb-section" open>
                <summary>Query Params</summary>
                <div class="rb-section-body">
                    <div class="rb-kv-list">
                        ${rb.queryParams.map((kv, i) => this._renderKvRow(rb.queryParams, i, 'rb-qp')).join('')}
                    </div>
                    <button class="rb-kv-add" data-rb-add="queryParams">+ Agregar</button>
                </div>
            </details>

            <details class="rb-section">
                <summary>Headers</summary>
                <div class="rb-section-body">
                    <div class="rb-kv-list">
                        ${rb.headers.map((kv, i) => this._renderKvRow(rb.headers, i, 'rb-hdr')).join('')}
                    </div>
                    <button class="rb-kv-add" data-rb-add="headers">+ Agregar</button>
                </div>
            </details>

            <details class="rb-section" open>
                <summary>Body</summary>
                <div class="rb-section-body">
                    <div class="rb-muted">Pegá un curl acá o usá el selector de body type más abajo.</div>
                    <textarea id="rb-curl" class="rb-curl-paste" placeholder="curl -X POST https://api.ejemplo.com/v1 -H 'Content-Type: application/json' -d '{\"foo\":\"bar\"}'">${UI.escapeHTML(rb.curlInput)}</textarea>
                    <button id="rb-curl-parse" class="rb-curl-parse-btn">📥 Parsear curl</button>

                    <div class="segment-control" id="rb-bodytype">
                        ${BODY_TYPES.map(bt => `<button class="segment-item ${bt === rb.bodyType ? 'active' : ''}" data-rb-body-type="${bt}">${BODYTYPE_LABELS[bt]}</button>`).join('')}
                    </div>

                    <div class="${rb.bodyType === 'none' ? '' : 'rb-hidden'}" data-rb-bt-panel="none">
                        <div class="rb-muted">Este método no envía body.</div>
                    </div>

                    <div class="${rb.bodyType === 'json' ? '' : 'rb-hidden'}" data-rb-bt-panel="json">
                        <div class="rb-row rb-mt-8">
                            <textarea id="rb-body-json" class="rb-body-editor" placeholder='{"foo":"bar"}'>${UI.escapeHTML(rb.body)}</textarea>
                        </div>
                        <div class="rb-row rb-mt-8">
                            <button id="rb-json-format" class="rb-json-format-btn">✨ Formatear JSON</button>
                        </div>
                    </div>

                    <div class="${rb.bodyType === 'form-data' ? '' : 'rb-hidden'}" data-rb-bt-panel="form-data">
                        <div class="rb-muted">Campos de texto:</div>
                        <div class="rb-kv-list">
                            ${rb.formFields.map((kv, i) => this._renderKvRow(rb.formFields, i, 'rb-ff')).join('')}
                        </div>
                        <button class="rb-kv-add" data-rb-add="formFields">+ Agregar campo</button>
                        <div class="rb-muted rb-mt-12">Archivos adjuntos:</div>
                        <div class="rb-row rb-mt-8">
                            <button class="rb-file-pick" id="rb-file-pick">+ Adjuntar archivo</button>
                            <input type="file" id="rb-file-input" multiple style="display:none;">
                        </div>
                        <div class="rb-files-list" id="rb-files-list">
                            ${rb.files.map((f, i) => this._renderFilePill(f, i)).join('')}
                        </div>
                        ${rb.hasLocalCurlFiles ? `<div class="rb-info-pill">ℹ️ Si pegaste un curl con -F 'archivo=@/ruta/local', re-adjuntá el archivo con el selector de arriba.</div>` : ''}
                    </div>

                    <div class="${rb.bodyType === 'x-www-form-urlencoded' ? '' : 'rb-hidden'}" data-rb-bt-panel="x-www-form-urlencoded">
                        <div class="rb-muted">Pares key=value:</div>
                        <div class="rb-kv-list">
                            ${rb.formFields.map((kv, i) => this._renderKvRow(rb.formFields, i, 'rb-ff2')).join('')}
                        </div>
                        <button class="rb-kv-add" data-rb-add="formFields">+ Agregar campo</button>
                    </div>

                    <div class="${rb.bodyType === 'raw' ? '' : 'rb-hidden'}" data-rb-bt-panel="raw">
                        <div class="rb-row rb-mt-8">
                            <textarea id="rb-body-raw" class="rb-body-editor" placeholder="texto plano o cualquier contenido">${UI.escapeHTML(rb.body)}</textarea>
                        </div>
                        <div class="rb-row rb-mt-8">
                            <span class="rb-raw-ct-label">Content-Type:</span>
                            <input type="text" id="rb-raw-ct" class="rb-raw-ct-input" value="${UI.escapeHTML(rb.rawContentType)}" placeholder="text/plain">
                        </div>
                    </div>

                    <div class="${rb.bodyType === 'binary' ? '' : 'rb-hidden'}" data-rb-bt-panel="binary">
                        <div class="rb-row rb-mt-8">
                            <button class="rb-file-pick" id="rb-binary-pick">+ Seleccionar archivo binario</button>
                            <input type="file" id="rb-binary-input" style="display:none;">
                        </div>
                        <div class="rb-muted rb-mt-8" id="rb-binary-display">
                            ${rb.body ? `Seleccionado: archivo binario (${UI.formatBytes(Math.floor(rb.body.length * 3 / 4))})` : 'Ningún archivo seleccionado.'}
                        </div>
                    </div>
                </div>
            </details>

            <details class="rb-section" open>
                <summary>Response</summary>
                <div class="rb-section-body">
                    ${this._renderResponseSection()}
                </div>
            </details>
        `;
    },

    _renderKvRow(rows, idx, scope) {
        const kv = rows[idx];
        if (!kv) return '';
        const inputStyle = "padding: 6px 10px;";
        return `
            <div class="rb-kv-row" data-idx="${idx}" data-scope="${scope}">
                <input type="checkbox" data-rb-kv-field="enabled" ${kv.enabled ? 'checked' : ''}>
                <input type="text" data-rb-kv-field="key" value="${UI.escapeHTML(kv.key || '')}" placeholder="key" style="${inputStyle}">
                <input type="text" data-rb-kv-field="value" value="${UI.escapeHTML(kv.value || '')}" placeholder="value" style="${inputStyle}">
                <button class="rb-kv-remove" data-rb-kv-remove="${idx}" data-scope="${scope}">✕</button>
            </div>
        `;
    },

    _renderFilePill(f, i) {
        return `
            <div class="rb-file-pill" data-file-idx="${i}">
                <span class="rb-file-pill-name">📎 ${UI.escapeHTML(f.filename)}</span>
                <span class="rb-file-pill-size">${UI.formatBytes(Math.floor(f.base64.length * 3 / 4))}</span>
                <button class="rb-file-pill-remove" data-rb-file-remove="${i}">✕</button>
            </div>
        `;
    },

    _renderResponseSection() {
        const rb = this.state.requestBuilder;
        if (rb.loading) {
            return `<div class="rb-muted">⏳ Enviando…</div>`;
        }
        if (rb.error) {
            return `<div class="rb-error-pill">⚠️ ${UI.escapeHTML(rb.error)}</div>`;
        }
        if (!rb.response) {
            return `<div class="rb-muted">Sin respuesta todavía. Tocá ▶ Send para ejecutar.</div>`;
        }
        const r = rb.response;
        const statusClass = `rb-status-${Math.floor(r.status / 100)}xx`;
        const meta = `${r.timeMs} ms · ${UI.formatBytes(r.sizeBytes)}${r.truncated ? ' · truncado' : ''}`;
        const headersList = Object.entries(r.headers || {})
            .map(([k, v]) => `${UI.escapeHTML(k)}: ${UI.escapeHTML(String(v))}`)
            .join('\n');
        const ct = (r.headers && (r.headers['content-type'] || r.headers['Content-Type'])) || '';
        const isBinary = /^image\//.test(ct) || ct.includes('pdf') || ct.includes('octet-stream');
        let bodyHtml;
        if (isBinary) {
            const blob = new Blob([r.body], { type: ct });
            const blobUrl = URL.createObjectURL(blob);
            bodyHtml = `<a class="rb-response-download" href="${blobUrl}" download="response">⬇ Descargar respuesta</a>`;
            setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
        } else if (/json/i.test(ct) || (() => { try { JSON.parse(r.body); return true; } catch (e) { return false; } })()) {
            bodyHtml = `<pre class="rb-response-body">${UI.escapeHTML(UI.formatJSON(r.body))}</pre>`;
        } else {
            bodyHtml = `<pre class="rb-response-body">${UI.escapeHTML(r.body)}</pre>`;
        }
        return `
            <div class="rb-response-header">
                <span class="rb-status-pill ${statusClass}">${r.status} ${UI.escapeHTML(r.statusText || '')}</span>
                <span class="rb-time-pill">${UI.escapeHTML(meta)}</span>
            </div>
            <details class="rb-response-headers">
                <summary>Headers (${Object.keys(r.headers || {}).length})</summary>
                <pre>${UI.escapeHTML(headersList)}</pre>
            </details>
            ${bodyHtml}
            ${r.truncated ? `<div class="rb-info-pill rb-mt-8">⚠️ Respuesta truncada a 5 MB — el JSON puede estar incompleto.</div>` : ''}
        `;
    },

    // ── Bind: Request Builder ──

    bindRequestBuilder(container) {
        const pane = container.querySelector('#tools-main-pane');
        if (!pane) return;
        // NOTE: no re-entry guard. The pane's innerHTML is replaced on every re-render
        // (curl parse, bodyType change, file add, JSON format, etc.) and the dataset
        // attribute persists across innerHTML replacement — a guard would skip the
        // re-bind, leaving the new elements with no listeners. Callers always do
        // `pane.innerHTML = this.renderRequestBuilder(); this.bindRequestBuilder(container);`
        // in sequence, so re-binding on a fresh DOM tree is always safe.
        const rb = this.state.requestBuilder;

        pane.querySelector('#rb-method')?.addEventListener('change', (e) => { rb.method = e.target.value; });
        pane.querySelector('#rb-url')?.addEventListener('input', (e) => { rb.url = e.target.value; });
        pane.querySelector('#rb-send')?.addEventListener('click', () => this.sendRequest(container));

        pane.querySelectorAll('[data-rb-body-type]').forEach(btn => {
            btn.addEventListener('click', () => {
                const bt = btn.dataset.rbBodyType;
                if (bt === rb.bodyType) return;
                rb.bodyType = bt;
                pane.innerHTML = this.renderRequestBuilder();
                this.bindRequestBuilder(container);
            });
        });

        // KV lists
        this._bindKvList(pane, rb.queryParams, 'rb-qp');
        this._bindKvList(pane, rb.headers, 'rb-hdr');
        this._bindKvList(pane, rb.formFields, 'rb-ff');
        this._bindKvList(pane, rb.formFields, 'rb-ff2');

        pane.querySelectorAll('[data-rb-add]').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.rbAdd;
                if (Array.isArray(rb[key])) {
                    rb[key].push({ key: '', value: '', enabled: true });
                    pane.innerHTML = this.renderRequestBuilder();
                    this.bindRequestBuilder(container);
                }
            });
        });

        // Curl
        pane.querySelector('#rb-curl')?.addEventListener('input', (e) => { rb.curlInput = e.target.value; });
        pane.querySelector('#rb-curl-parse')?.addEventListener('click', () => {
            const res = this.parseCurl(rb.curlInput);
            if (!res.ok) {
                UI.toast(res.error, 'error');
                return;
            }
            const v = res.value;
            rb.method = v.method;
            rb.url = v.url;
            rb.headers = v.headers.length > 0 ? v.headers.map(([k, val]) => ({ key: k, value: val, enabled: true })) : [{ key: '', value: '', enabled: true }];
            rb.body = typeof v.body === 'string' ? v.body : (v.body ? JSON.stringify(v.body) : '');
            rb.bodyType = v.bodyType || 'none';
            if (v.bodyType === 'x-www-form-urlencoded' || v.bodyType === 'form-data') {
                if (v.body && typeof v.body === 'object') {
                    rb.formFields = Object.entries(v.body).map(([k, val]) => ({ key: k, value: String(val), enabled: true }));
                    if (rb.formFields.length === 0) rb.formFields = [{ key: '', value: '', enabled: true }];
                }
            }
            rb.hasLocalCurlFiles = !!v.hasLocalCurlFiles;
            UI.toast('Curl parseado', 'ok');
            pane.innerHTML = this.renderRequestBuilder();
            this.bindRequestBuilder(container);
        });

        // JSON body
        pane.querySelector('#rb-body-json')?.addEventListener('input', (e) => { rb.body = e.target.value; });
        pane.querySelector('#rb-json-format')?.addEventListener('click', () => {
            const formatted = UI.formatJSON(rb.body);
            if (formatted !== rb.body) {
                rb.body = formatted;
                pane.innerHTML = this.renderRequestBuilder();
                this.bindRequestBuilder(container);
            } else {
                UI.toast('JSON ya está formateado o es inválido', 'warn');
            }
        });

        // Raw body
        pane.querySelector('#rb-body-raw')?.addEventListener('input', (e) => { rb.body = e.target.value; });
        pane.querySelector('#rb-raw-ct')?.addEventListener('input', (e) => { rb.rawContentType = e.target.value; });

        // File pickers
        const filePickBtn = pane.querySelector('#rb-file-pick');
        const fileInput = pane.querySelector('#rb-file-input');
        filePickBtn?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files || []);
            for (const f of files) {
                if (f.size > MAX_FILE_SIZE) {
                    UI.toast(`Archivo demasiado grande (máx 10 MB): ${f.name}`, 'error');
                    continue;
                }
                try {
                    const dataUrl = await this._readFileAsDataUrl(f);
                    const base64 = dataUrl.split(',')[1];
                    rb.files.push({ fieldName: 'file', filename: f.name, type: f.type || 'application/octet-stream', base64 });
                } catch (err) {
                    UI.toast(`Error leyendo ${f.name}: ${err.message}`, 'error');
                }
            }
            e.target.value = '';
            pane.innerHTML = this.renderRequestBuilder();
            this.bindRequestBuilder(container);
        });
        pane.querySelectorAll('[data-rb-file-remove]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.rbFileRemove, 10);
                rb.files.splice(idx, 1);
                pane.innerHTML = this.renderRequestBuilder();
                this.bindRequestBuilder(container);
            });
        });

        // Binary body
        const binaryPickBtn = pane.querySelector('#rb-binary-pick');
        const binaryInput = pane.querySelector('#rb-binary-input');
        binaryPickBtn?.addEventListener('click', () => binaryInput?.click());
        binaryInput?.addEventListener('change', async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > MAX_FILE_SIZE) {
                UI.toast('Archivo demasiado grande (máx 10 MB)', 'error');
                e.target.value = '';
                return;
            }
            try {
                const dataUrl = await this._readFileAsDataUrl(f);
                rb.body = dataUrl.split(',')[1];
                const display = pane.querySelector('#rb-binary-display');
                if (display) display.textContent = `Seleccionado: ${f.name} (${UI.formatBytes(f.size)})`;
            } catch (err) {
                UI.toast(`Error: ${err.message}`, 'error');
            }
            e.target.value = '';
        });
    },

    _bindKvList(pane, rows, scope) {
        pane.querySelectorAll(`.rb-kv-row[data-scope="${scope}"]`).forEach(row => {
            const idx = parseInt(row.dataset.idx, 10);
            row.querySelector('[data-rb-kv-field="enabled"]')?.addEventListener('change', (e) => {
                if (rows[idx]) rows[idx].enabled = e.target.checked;
            });
            row.querySelector('[data-rb-kv-field="key"]')?.addEventListener('input', (e) => {
                if (rows[idx]) rows[idx].key = e.target.value;
            });
            row.querySelector('[data-rb-kv-field="value"]')?.addEventListener('input', (e) => {
                if (rows[idx]) rows[idx].value = e.target.value;
            });
        });
    },

    _readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => reject(r.error);
            r.readAsDataURL(file);
        });
    },

    // ── Send request ──

    async sendRequest(container) {
        const rb = this.state.requestBuilder;
        const url = (rb.url || '').trim();
        if (!url) { rb.error = 'Ingresá una URL'; rb.response = null; this._refreshResponsePane(container); return; }
        if (!/^https?:\/\//i.test(url)) { rb.error = 'La URL debe empezar con http:// o https://'; rb.response = null; this._refreshResponsePane(container); return; }

        rb.loading = true;
        rb.error = null;
        rb.response = null;
        this._refreshResponsePane(container);

        const headersObj = this._kvToObject(rb.headers);
        const payload = {
            method: rb.method,
            url,
            headers: headersObj,
            body: (rb.bodyType === 'x-www-form-urlencoded' || rb.bodyType === 'form-data')
                ? this._kvToObject(rb.formFields)
                : rb.body,
            bodyType: rb.bodyType,
            files: rb.files
        };

        // For raw body, the Content-Type is set server-side from headers if missing.
        // We can let the user override via the raw content-type input → push to headers.
        if (rb.bodyType === 'raw' && rb.rawContentType) {
            if (!Object.keys(headersObj).some(k => k.toLowerCase() === 'content-type')) {
                payload.headers['Content-Type'] = rb.rawContentType;
            }
        }

        try {
            const res = await ApiService.execRequest(payload);
            if (res.ok) {
                rb.response = res;
                rb.error = null;
                UI.toast(`✓ ${res.status} ${res.statusText || ''} (${res.timeMs} ms)`, 'ok');
            } else {
                rb.response = null;
                rb.error = res.error || 'Error desconocido';
                UI.toast(rb.error, 'error');
            }
        } catch (err) {
            rb.response = null;
            rb.error = err.message || 'Error de red';
            UI.toast(`Error: ${rb.error}`, 'error');
        } finally {
            rb.loading = false;
            this._refreshResponsePane(container);
        }
    },

    _refreshResponsePane(container) {
        const pane = container.querySelector('#tools-main-pane');
        if (!pane) return;
        // Update only the response section to avoid losing focus on inputs
        const responseSection = pane.querySelector('.rb-section:last-of-type .rb-section-body');
        if (responseSection) {
            responseSection.innerHTML = this._renderResponseSection();
        }
        // Update the send button label/state
        const sendBtn = pane.querySelector('#rb-send');
        if (sendBtn) {
            const rb = this.state.requestBuilder;
            sendBtn.disabled = rb.loading;
            sendBtn.textContent = rb.loading ? '⏳ Enviando…' : '▶ Send';
        }
    }
};
