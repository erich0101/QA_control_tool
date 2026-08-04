import { UI } from '../utils/ui-utils.js';
import { ApiService } from '../services/api.js';

const SUBTOOLS = [
    { id: 'base64', icon: '🔤', label: 'Base64', desc: 'Encode / Decode' },
    { id: 'request-builder', icon: '🚀', label: 'Request Builder', desc: 'HTTP requests' },
    { id: 'token-decoder', icon: '🔐', label: 'Token Decoder', desc: 'JWT y tokens opacos' },
    { id: 'cuit-generator', icon: '🆔', label: 'CUIT Generator', desc: 'Generar CUITs válidos' }
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
        },
        tokenDecoder: {
            input: '',
            secret: '',
            showSecret: false,
            b64urlEncoded: true
        },
        cuitGenerator: {
            quantity: 1,
            results: [],          // ['20123456780', ...]
            lastQuantity: 0,      // última cantidad generada (para saber si mostrar CSV)
            generating: false
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
        if (this.state.activeTool === 'token-decoder') {
            pane.innerHTML = this.renderTokenDecoder();
            this.bindTokenDecoder(container);
        }
        if (this.state.activeTool === 'cuit-generator') {
            pane.innerHTML = this.renderCuitGenerator();
            this.bindCuitGenerator(container);
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
    // ── CUIT GENERATOR ──
    // ══════════════════════════════════════════════════════════════

    // Genera un CUIT válido con dígito verificador módulo 11.
    // Prefijos típicos: 20, 24, 27, 30, 34. Si el verificador da 10, regenera.
    _genCuit() {
        const prefix = [20, 24, 27, 30, 34][Math.random() * 4.9 | 0];
        const body = (Math.random() * 89999999 + 10000000) | 0;
        const digits = `${prefix}${body}`;
        let suma = 0;
        for (let i = 0; i < digits.length; i++) {
            suma += parseInt(digits[digits.length - i - 1], 10) * (2 + (i % 6));
        }
        // El algoritmo del usuario es: verificador = 11 - (suma % 11), con la
        // corrección de que si el resultado es 11, se reemplaza por 0. Si da 10,
        // se regenera.
        const raw = 11 - (suma % 11);
        const verificador = raw === 11 ? 0 : raw;
        if (verificador === 10) return this._genCuit();
        return `${digits}${verificador}`;
    },

    // Genera N CUITs únicos. Devuelve array de strings (solo dígitos, sin formato).
    _genCuits(n) {
        const set = new Set();
        const out = [];
        let attempts = 0;
        const maxAttempts = n * 10;
        while (out.length < n && attempts < maxAttempts) {
            const c = this._genCuit();
            if (!set.has(c)) {
                set.add(c);
                out.push(c);
            }
            attempts++;
        }
        return out;
    },

    // ── Render: CUIT Generator ──

    renderCuitGenerator() {
        const cg = this.state.cuitGenerator;
        const qty = cg.quantity || 0;
        const results = cg.results || [];
        const hasResults = results.length > 0;
        const showCsv = cg.lastQuantity > 10;
        const isGenerating = !!cg.generating;

        // Lista visible solo si hay <= 50 (UX: no inundar la pantalla).
        const visibleResults = results.slice(0, 50);
        const moreCount = results.length - visibleResults.length;

        const listHtml = !hasResults ? `
            <div class="cg-empty">
                <div class="cg-empty-icon">🆔</div>
                <div>Ingresá una cantidad y tocá <strong>Generar</strong> para crear CUITs válidos.</div>
            </div>
        ` : `
            <div class="cg-result-meta">
                <span class="cg-pill cg-pill-info">${results.length} CUIT${results.length === 1 ? '' : 's'} generado${results.length === 1 ? '' : 's'}</span>
                ${cg.lastQuantity > 10 ? '<span class="cg-pill cg-pill-warn">Más de 10 — usá Descargar CSV para exportarlos</span>' : ''}
            </div>
            <div class="cg-result-list">
                ${visibleResults.map((cuit, i) => {
                    const formatted = this._formatCuit(cuit);
                    return `
                        <div class="cg-result-row">
                            <span class="cg-result-index">#${String(i + 1).padStart(4, '0')}</span>
                            <span class="cg-result-value" data-cg-cuit="${cuit}">${UI.escapeHTML(formatted)}</span>
                            <button class="cg-copy-one" data-cg-cuit="${cuit}" title="Copiar este CUIT">
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M5 4H4C2.9 4 2 4.9 2 6V13C2 14.1 2.9 15 4 15H11C12.1 15 13 14.1 13 13V12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M11 2H6C4.9 2 4 2.9 4 4V11C4 12.1 4.9 13 6 13H13C14.1 13 15 12.1 15 11V6L11 2Z" fill="currentColor" opacity="0.3"/><path d="M11 2V6H15" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
                            </button>
                        </div>
                    `;
                }).join('')}
                ${moreCount > 0 ? `<div class="cg-result-more">…y ${moreCount.toLocaleString()} más (no se muestran en pantalla)</div>` : ''}
            </div>
        `;

        return `
            <div class="ts-tool-header">
                <div>
                    <h2>🆔 CUIT Generator</h2>
                    <div class="ts-tool-sub">Genera CUITs válidos con dígito verificador módulo 11. Prefijos: 20 / 24 / 27 / 30 / 34. Procesamiento 100% local.</div>
                </div>
            </div>

            <div class="glass-card cg-controls">
                <div class="cg-controls-row">
                    <div class="cg-input-group">
                        <label class="cg-label" for="cg-quantity">Cantidad</label>
                        <input type="number" id="cg-quantity" min="1" max="50000" value="${qty}" class="cg-input" />
                        <span class="cg-input-hint">1 – 50.000</span>
                    </div>
                    <div class="cg-presets">
                        <button class="btn btn-ghost btn-sm cg-preset" data-cg-preset="1">1</button>
                        <button class="btn btn-ghost btn-sm cg-preset" data-cg-preset="5">5</button>
                        <button class="btn btn-ghost btn-sm cg-preset" data-cg-preset="10">10</button>
                        <button class="btn btn-ghost btn-sm cg-preset" data-cg-preset="100">100</button>
                        <button class="btn btn-ghost btn-sm cg-preset" data-cg-preset="1000">1.000</button>
                        <button class="btn btn-ghost btn-sm cg-preset" data-cg-preset="50000">50.000</button>
                    </div>
                    <button class="btn btn-primary cg-btn-generate" id="cg-btn-generate" ${isGenerating ? 'disabled' : ''}>
                        ${isGenerating ? '⏳ Generando…' : '🎲 Generar'}
                    </button>
                </div>
            </div>

            <div class="cg-output">
                <div class="cg-output-header">
                    <h3 style="margin:0; font-size:0.95rem; font-weight:700; color:var(--apple-label);">Resultados</h3>
                    ${hasResults ? `
                        <div class="cg-output-actions">
                            <button class="btn btn-ghost btn-sm" id="cg-copy-all" title="Copiar todos los CUITs (uno por línea)">
                                📋 Copiar todos
                            </button>
                            ${showCsv ? `
                                <button class="btn btn-primary btn-sm" id="cg-download-csv" title="Descargar como archivo CSV">
                                    ⬇️ Descargar CSV
                                </button>
                            ` : ''}
                            <button class="btn btn-ghost btn-sm" id="cg-clear" title="Limpiar resultados">
                                🗑️ Limpiar
                            </button>
                        </div>
                    ` : ''}
                </div>
                ${listHtml}
            </div>
        `;
    },

    // Formatea un CUIT como XX-XXXXXXXX-X (estándar AFIP)
    _formatCuit(cuit) {
        const s = String(cuit);
        if (s.length !== 11) return s;
        return `${s.slice(0, 2)}-${s.slice(2, 10)}-${s.slice(10)}`;
    },

    // ── Bind: CUIT Generator ──

    bindCuitGenerator(container) {
        const pane = container.querySelector('#tools-main-pane');
        if (!pane) return;
        const cg = this.state.cuitGenerator;

        // Input de cantidad
        const qtyInput = pane.querySelector('#cg-quantity');
        if (qtyInput) {
            qtyInput.addEventListener('input', () => {
                let v = parseInt(qtyInput.value, 10);
                if (isNaN(v) || v < 1) v = 1;
                if (v > 50000) v = 50000;
                cg.quantity = v;
            });
            qtyInput.addEventListener('blur', () => {
                // Forzar render para que el botón se habilite/deshabilite
                if (parseInt(qtyInput.value, 10) !== cg.quantity) {
                    pane.innerHTML = this.renderCuitGenerator();
                    this.bindCuitGenerator(container);
                }
            });
            qtyInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    pane.querySelector('#cg-btn-generate')?.click();
                }
            });
        }

        // Presets
        pane.querySelectorAll('.cg-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const n = parseInt(btn.dataset.cgPreset, 10);
                cg.quantity = n;
                pane.innerHTML = this.renderCuitGenerator();
                this.bindCuitGenerator(container);
                const inp = pane.querySelector('#cg-quantity');
                if (inp) inp.focus();
            });
        });

        // Generar
        pane.querySelector('#cg-btn-generate')?.addEventListener('click', () => {
            this._cgGenerate(container);
        });

        // Copiar uno
        pane.querySelectorAll('.cg-copy-one').forEach(btn => {
            btn.addEventListener('click', async () => {
                const cuit = btn.dataset.cgCuit;
                const ok = await copyToClipboard(cuit);
                UI.toast(ok ? `Copiado: ${this._formatCuit(cuit)}` : 'Error al copiar', ok ? 'ok' : 'error');
            });
        });

        // Click en el valor → copiar
        pane.querySelectorAll('.cg-result-value').forEach(el => {
            el.addEventListener('click', async () => {
                const cuit = el.dataset.cgCuit;
                const ok = await copyToClipboard(cuit);
                UI.toast(ok ? `Copiado: ${this._formatCuit(cuit)}` : 'Error al copiar', ok ? 'ok' : 'error');
            });
        });

        // Copiar todos
        pane.querySelector('#cg-copy-all')?.addEventListener('click', async () => {
            if (!cg.results.length) return;
            const text = cg.results.join('\n');
            const ok = await copyToClipboard(text);
            UI.toast(ok ? `${cg.results.length} CUITs copiados al portapapeles` : 'Error al copiar', ok ? 'ok' : 'error');
        });

        // Descargar CSV (solo se muestra si > 10)
        pane.querySelector('#cg-download-csv')?.addEventListener('click', () => {
            this._cgDownloadCsv();
        });

        // Limpiar
        pane.querySelector('#cg-clear')?.addEventListener('click', () => {
            cg.results = [];
            cg.lastQuantity = 0;
            pane.innerHTML = this.renderCuitGenerator();
            this.bindCuitGenerator(container);
        });
    },

    _cgGenerate(container) {
        const cg = this.state.cuitGenerator;
        const n = cg.quantity;
        if (!n || n < 1 || n > 50000) {
            UI.toast('Cantidad inválida (1-50.000)', 'error');
            return;
        }
        // Para > 1000, usar requestIdleCallback si está disponible para no bloquear
        const useAsync = n > 2000;
        if (useAsync) {
            cg.generating = true;
            const pane = container.querySelector('#tools-main-pane');
            if (pane) {
                pane.innerHTML = this.renderCuitGenerator();
                this.bindCuitGenerator(container);
            }
            UI.showLoading();
            // Chunks via setTimeout
            setTimeout(() => {
                const results = this._genCuits(n);
                cg.results = results;
                cg.lastQuantity = n;
                cg.generating = false;
                UI.hideLoading();
                const p2 = container.querySelector('#tools-main-pane');
                if (p2) {
                    p2.innerHTML = this.renderCuitGenerator();
                    this.bindCuitGenerator(container);
                }
                UI.toast(`✅ ${results.length.toLocaleString()} CUITs generados`);
            }, 30);
        } else {
            const results = this._genCuits(n);
            cg.results = results;
            cg.lastQuantity = n;
            const pane = container.querySelector('#tools-main-pane');
            if (pane) {
                pane.innerHTML = this.renderCuitGenerator();
                this.bindCuitGenerator(container);
            }
            UI.toast(`✅ ${results.length.toLocaleString()} CUITs generados`);
        }
    },

    _cgDownloadCsv() {
        const cg = this.state.cuitGenerator;
        if (!cg.results.length) {
            UI.toast('No hay CUITs para descargar', 'warn');
            return;
        }
        // CSV plano: header + cada CUIT en la primera columna
        const lines = ['cuit'];
        for (const c of cg.results) lines.push(c);
        const csv = lines.join('\n') + '\n';
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        a.download = `cuits-${cg.results.length}-${stamp}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        UI.toast(`⬇️ Descargado ${cg.results.length.toLocaleString()} CUITs (CSV)`);
    },

    // ══════════════════════════════════════════════════════════════
    // ── TOKEN DECODER ──
    // ══════════════════════════════════════════════════════════════

    // base64url → string (acepta string sin padding, ya que JWT lo omite)
    _b64urlDecode(str) {
        if (!str) return '';
        const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
        try {
            const bin = atob(padded);
            // Si los bytes son UTF-8 válido los devolvemos como string; si no, los
            // devolvemos como string latin1 (útil para mostrar binarios).
            try {
                return new TextDecoder('utf-8', { fatal: true }).decode(
                    Uint8Array.from(bin, c => c.charCodeAt(0))
                );
            } catch (_e) {
                return bin;
            }
        } catch (err) {
            throw new Error('Base64 inválido');
        }
    },

    // Devuelve bytes crudos a partir de base64url
    _b64urlToBytes(str) {
        const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
        const bin = atob(padded);
        return Uint8Array.from(bin, c => c.charCodeAt(0));
    },

    // Intenta parsear un JWT. Devuelve { ok, value: {header, payload, signature, headerB64, payloadB64, signatureB64} }
    // o { ok: false, error }.
    _parseJwt(token) {
        const parts = token.split('.');
        if (parts.length !== 3) {
            return { ok: false, error: `Se esperaban 3 segmentos separados por '.', hay ${parts.length}` };
        }
        const [headerB64, payloadB64, signatureB64] = parts;
        if (!headerB64 || !payloadB64) {
            return { ok: false, error: 'Segmentos vacíos' };
        }
        let header, payload;
        try {
            header = JSON.parse(this._b64urlDecode(headerB64));
        } catch (err) {
            return { ok: false, error: `Header no es JSON válido: ${err.message}` };
        }
        try {
            payload = JSON.parse(this._b64urlDecode(payloadB64));
        } catch (err) {
            return { ok: false, error: `Payload no es JSON válido: ${err.message}` };
        }
        return {
            ok: true,
            value: { header, payload, signature: signatureB64, headerB64, payloadB64, signatureB64 }
        };
    },

    // Detección heurística del tipo de token
    _detectTokenType(input) {
        const trimmed = input.trim();
        if (!trimmed) return { type: 'empty' };
        if (trimmed.split('.').length === 3 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(trimmed)) {
            return { type: 'jwt' };
        }
        if (/^[0-9a-fA-F]+$/.test(trimmed)) {
            const len = trimmed.length;
            if (len === 32) return { type: 'hash', hashKind: 'MD5' };
            if (len === 40) return { type: 'hash', hashKind: 'SHA-1' };
            if (len === 64) return { type: 'hash', hashKind: 'SHA-256' };
            if (len === 128) return { type: 'hash', hashKind: 'SHA-512' };
            return { type: 'hex' };
        }
        if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(trimmed)) {
            return { type: 'uuid' };
        }
        if (/^[A-Za-z0-9+/_-]+=*$/.test(trimmed) && trimmed.length >= 8 && trimmed.length % 4 === 0) {
            // Posible base64 — verificar que decodifica a algo legible
            try {
                const decoded = atob(trimmed.replace(/-/g, '+').replace(/_/g, '/'));
                const printable = decoded.replace(/[^\x20-\x7E]/g, '');
                if (printable.length / decoded.length > 0.85) {
                    return { type: 'base64', decodedPreview: decoded.slice(0, 200) };
                }
            } catch (_e) { /* no es base64 */ }
        }
        return { type: 'opaque' };
    },

    // Entropía de Shannon (bits por carácter)
    _shannonEntropy(str) {
        if (!str) return 0;
        const counts = {};
        for (const c of str) counts[c] = (counts[c] || 0) + 1;
        const len = str.length;
        let h = 0;
        for (const c in counts) {
            const p = counts[c] / len;
            h -= p * Math.log2(p);
        }
        return h;
    },

    // Análisis de caracteres (mayúsc/minúsc/dígitos/símbolos)
    _charBreakdown(str) {
        let upper = 0, lower = 0, digit = 0, symbol = 0, other = 0;
        for (const c of str) {
            if (c >= 'A' && c <= 'Z') upper++;
            else if (c >= 'a' && c <= 'z') lower++;
            else if (c >= '0' && c <= '9') digit++;
            else if (/[\s\-_./+=:@]/.test(c)) symbol++;
            else other++;
        }
        return { upper, lower, digit, symbol, other, total: str.length };
    },

    // HS256 verification. Devuelve { ok: true } si la firma coincide.
    // Usa Web Crypto API (async), pero esta función helper es síncrona y devuelve un Promise.
    async _verifyHs256(headerB64, payloadB64, signatureB64, secret) {
        if (!secret) return { ok: false, error: 'Sin secret' };
        if ((headerB64.match(/\./g) || []).length !== 1) {
            return { ok: false, error: 'Header no tiene el formato esperado' };
        }
        try {
            const enc = new TextEncoder();
            const key = await crypto.subtle.importKey(
                'raw',
                enc.encode(secret),
                { name: 'HMAC', hash: 'SHA-256' },
                false,
                ['sign']
            );
            const data = enc.encode(`${headerB64}.${payloadB64}`);
            const sig = await crypto.subtle.sign('HMAC', key, data);
            const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
                .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            const provided = signatureB64.replace(/=+$/, '');
            return { ok: expectedB64 === provided };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    },

    // Devuelve info sobre claims JWT estándar
    _describeClaims(payload) {
        if (!payload || typeof payload !== 'object') return [];
        const CLAIM_LABELS = {
            iss: 'Issuer',
            sub: 'Subject',
            aud: 'Audience',
            exp: 'Expires',
            nbf: 'Not before',
            iat: 'Issued at',
            jti: 'JWT ID',
            name: 'Name',
            email: 'Email',
            role: 'Role',
            roles: 'Roles',
            scope: 'Scope',
            scopes: 'Scopes',
            permissions: 'Permissions'
        };
        const out = [];
        const nowSec = Math.floor(Date.now() / 1000);
        for (const k of Object.keys(payload)) {
            const v = payload[k];
            const isTimestamp = ['exp', 'nbf', 'iat', 'auth_time'].includes(k) && typeof v === 'number';
            let display = v;
            let status = null;
            if (isTimestamp) {
                const iso = new Date(v * 1000).toISOString();
                const date = new Date(v * 1000).toLocaleString();
                if (k === 'exp') {
                    status = v * 1000 < Date.now() ? 'expired' : 'valid';
                } else if (k === 'nbf') {
                    status = v * 1000 > Date.now() ? 'pending' : 'valid';
                }
                display = `${date} (${iso})`;
            }
            out.push({ key: k, label: CLAIM_LABELS[k] || k, value: display, rawValue: v, isTimestamp, status });
        }
        // Ordenar: timestamps primero, luego alfabético
        out.sort((a, b) => {
            if (a.isTimestamp && !b.isTimestamp) return -1;
            if (!a.isTimestamp && b.isTimestamp) return 1;
            return a.key.localeCompare(b.key);
        });
        return out;
    },

    // ── Render: Token Decoder (jwt.io-style) ──

    // Coloriza JSON con tokens estilo jwt.io (sintaxis coloreada). Devuelve HTML seguro.
    _tdJsonColorize(value, indent = 0) {
        const pad = (n) => '  '.repeat(n);
        const esc = (s) => UI.escapeHTML(s);
        if (value === null) return `<span class="td-tok-null">null</span>`;
        if (typeof value === 'boolean') return `<span class="td-tok-boolean">${value}</span>`;
        if (typeof value === 'number') return `<span class="td-tok-number">${value}</span>`;
        if (typeof value === 'string') {
            // Si parece un timestamp Unix (10 dígitos) y la key es iat/exp/nbf/auth_time, lo marcamos
            return `<span class="td-tok-string">"${esc(value)}"</span>`;
        }
        if (Array.isArray(value)) {
            if (value.length === 0) return `<span class="td-tok-punct">[</span><span class="td-tok-punct">]</span>`;
            const items = value.map((v, i) => {
                const isLast = i === value.length - 1;
                return `${pad(indent + 1)}${this._tdJsonColorize(v, indent + 1)}${isLast ? '' : '<span class="td-tok-punct">,</span>'}`;
            }).join('\n');
            return `<span class="td-tok-punct">[</span>\n${items}\n${pad(indent)}<span class="td-tok-punct">]</span>`;
        }
        if (typeof value === 'object') {
            const keys = Object.keys(value);
            if (keys.length === 0) return `<span class="td-tok-punct">{</span><span class="td-tok-punct">}</span>`;
            const items = keys.map((k, i) => {
                const isLast = i === keys.length - 1;
                return `${pad(indent + 1)}<button type="button" class="td-tok-key-btn" data-td-key="${esc(k)}" data-td-claim-key="${esc(k)}" title="Ver descripción"><span class="td-tok-key">"${esc(k)}"</span></button><span class="td-tok-punct">:</span> ${this._tdJsonColorize(value[k], indent + 1)}${isLast ? '' : '<span class="td-tok-punct">,</span>'}`;
            }).join('\n');
            return `<span class="td-tok-punct">{</span>\n${items}\n${pad(indent)}<span class="td-tok-punct">}</span>`;
        }
        return esc(String(value));
    },

    // Devuelve el HTML del JSON formateado con tokens coloreados
    _tdJsonHtml(value) {
        try {
            return this._tdJsonColorize(value, 0);
        } catch (_e) {
            return UI.escapeHTML(JSON.stringify(value, null, 2));
        }
    },

    // Descripciones estilo jwt.io para claims estándar
    _tdClaimDescription(key) {
        const DESCRIPTIONS = {
            iss: 'Issuer — Identifies the principal that issued the JWT.',
            sub: 'Subject — Identifies the principal that is the subject of the JWT.',
            aud: 'Audience — Identifies the recipients that the JWT is intended for.',
            exp: 'Expiration Time — Identifies the expiration time on or after which the JWT MUST NOT be accepted.',
            nbf: 'Not Before — Identifies the time before which the JWT MUST NOT be accepted.',
            iat: 'Issued At — Identifies the time at which the JWT was issued.',
            jti: 'JWT ID — Provides a unique identifier for the JWT.',
            typ: 'Type — Used to declare the type of the token.',
            alg: 'Algorithm — Identifies the algorithm used to sign the token.',
            name: 'Name — User\'s full name.',
            email: 'Email — User\'s email address.',
            role: 'Role — User\'s role.',
            roles: 'Roles — User\'s roles.',
            scope: 'Scope — OAuth2 scopes granted.',
            scopes: 'Scopes — OAuth2 scopes granted.',
            permissions: 'Permissions — User\'s permissions.'
        };
        return DESCRIPTIONS[key] || null;
    },

    // Formatea un Unix timestamp a texto legible + ISO
    _tdFormatTimestamp(v) {
        if (typeof v !== 'number') return null;
        const date = new Date(v * 1000);
        if (isNaN(date.getTime())) return null;
        const localStr = date.toLocaleString();
        const isoStr = date.toISOString();
        // Para timestamps razonables (después de 1970 y antes de 2100), mostrar formato relativo
        const now = Date.now();
        const ts = v * 1000;
        let rel = '';
        const diffSec = Math.floor((ts - now) / 1000);
        const absDiff = Math.abs(diffSec);
        if (absDiff < 60) rel = `(en ${absDiff}s)`;
        else if (absDiff < 3600) rel = `(en ${Math.round(absDiff / 60)} min)`;
        else if (absDiff < 86400) rel = `(en ${Math.round(absDiff / 3600)} h)`;
        else if (absDiff < 86400 * 30) rel = `(en ${Math.round(absDiff / 86400)} d)`;
        else if (absDiff < 86400 * 365) rel = `(en ${Math.round(absDiff / 86400 / 30)} mo)`;
        else rel = `(en ${Math.round(absDiff / 86400 / 365)} y)`;
        return { local: localStr, iso: isoStr, rel: diffSec < 0 ? `(hace ${rel.replace('en ', '')})` : rel };
    },

    // Determina el status de un timestamp
    _tdTimestampStatus(key, v) {
        if (typeof v !== 'number') return null;
        const ts = v * 1000;
        const now = Date.now();
        if (key === 'exp') return ts < now ? 'expired' : 'valid';
        if (key === 'nbf') return ts > now ? 'pending' : 'valid';
        if (key === 'iat') return null; // iat siempre es histórico
        return null;
    },

    // Renderiza un card jwt.io-style con header de color
    _tdRenderCard({ color, icon, title, compactTitle, body, status, toolbar, expanded = false }) {
        return `
            <div class="td-card td-card-${color} ${expanded ? 'td-card-expanded' : ''}">
                <div class="td-card-headline">
                    <div class="td-card-title-row">
                        <span class="td-card-icon">${icon}</span>
                        <h3 class="td-card-title-full">${UI.escapeHTML(title)}</h3>
                        <h3 class="td-card-title-compact">${UI.escapeHTML(compactTitle || title)}</h3>
                    </div>
                    <div class="td-card-toolbar">
                        ${toolbar || ''}
                    </div>
                </div>
                <div class="td-card-body">${body}</div>
                ${status ? `<div class="td-card-status td-card-status-${status.kind}">${status.html}</div>` : ''}
            </div>
        `;
    },

    // Toolbar estilo jwt.io: Copy + Clear/Expand buttons
    _tdCardToolbar(opts) {
        // opts: { onCopy, onClear, onExpand, canExpand }
        const buttons = [];
        if (opts.onCopy) {
            buttons.push(`<button class="td-card-toolbar-btn" data-td-action="copy" title="Copy">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M5 4H4C2.9 4 2 4.9 2 6V13C2 14.1 2.9 15 4 15H11C12.1 15 13 14.1 13 13V12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M11 2H6C4.9 2 4 2.9 4 4V11C4 12.1 4.9 13 6 13H13C14.1 13 15 12.1 15 11V6L11 2Z" fill="currentColor" opacity="0.3"/><path d="M11 2V6H15" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
            </button>`);
        }
        if (opts.onClear) {
            buttons.push(`<button class="td-card-toolbar-btn" data-td-action="clear" title="Clear">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M4 4V13C4 13.5 4.5 14 5 14H11C11.5 14 12 13.5 12 13V4" stroke="currentColor" stroke-width="1.5"/><path d="M6 4V2.5C6 2.2 6.2 2 6.5 2H9.5C9.8 2 10 2.2 10 2.5V4" stroke="currentColor" stroke-width="1.5"/></svg>
            </button>`);
        }
        if (opts.canExpand) {
            buttons.push(`<button class="td-card-toolbar-btn" data-td-action="expand" title="Expand">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 2H14V6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 2L8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M6 14H2V10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 14L8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </button>`);
        }
        return buttons.join('');
    },

    renderTokenDecoder() {
        const td = this.state.tokenDecoder;
        const input = (td.input || '').trim();

        // Determinar status del JWT
        let status = null;
        let jwtOk = false;
        let parsed = null;
        if (input) {
            const parts = input.split('.');
            if (parts.length === 3 && parts[0] && parts[1]) {
                const tryParse = this._parseJwt(input);
                if (tryParse.ok) {
                    parsed = tryParse.value;
                    jwtOk = true;
                    status = { kind: 'success', html: '✅ Valid JWT' };
                } else {
                    status = { kind: 'error', html: `❌ ${UI.escapeHTML(tryParse.error)}` };
                }
            } else if (input.length > 0) {
                status = { kind: 'error', html: '❌ Not a valid JWT (expected 3 segments separated by dots)' };
            }
        }

        // Header card (red)
        const headerCard = (() => {
            if (!jwtOk) {
                return this._tdRenderCard({
                    color: 'red',
                    icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4L7 8L3 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 12H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
                    title: 'Decoded Header',
                    compactTitle: 'Header',
                    body: `<pre class="td-json-empty">${input ? '// Invalid JWT — fix the encoded token to see the header' : '// Paste a JWT above to see the decoded header'}</pre>`,
                    status: null,
                    toolbar: ''
                });
            }
            const json = this._tdJsonHtml(parsed.header);
            return this._tdRenderCard({
                color: 'red',
                icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4L7 8L3 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 12H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
                title: 'Decoded Header',
                compactTitle: 'Header',
                body: `<pre class="td-json">${json}</pre>`,
                status: null,
                toolbar: this._tdCardToolbar({ onCopy: 'header' })
            });
        })();

        // Payload card (purple)
        const payloadCard = (() => {
            if (!jwtOk) {
                return this._tdRenderCard({
                    color: 'purple',
                    icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4L7 8L3 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 12H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
                    title: 'Decoded Payload',
                    compactTitle: 'Payload',
                    body: `<pre class="td-json-empty">${input ? '// Invalid JWT — fix the encoded token to see the payload' : '// Paste a JWT above to see the decoded payload'}</pre>`,
                    status: null,
                    toolbar: ''
                });
            }
            const json = this._tdJsonHtml(parsed.payload);
            return this._tdRenderCard({
                color: 'purple',
                icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4L7 8L3 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 12H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
                title: 'Decoded Payload',
                compactTitle: 'Payload',
                body: `<pre class="td-json">${json}</pre>`,
                status: null,
                toolbar: this._tdCardToolbar({ onCopy: 'payload' })
            });
        })();

        // Signature Verification card (cyan)
        const sigAlg = (parsed && parsed.header && parsed.header.alg) || null;
        const isHmac = sigAlg && /^HS\d+$/i.test(sigAlg);
        const sigCard = this._tdRenderCard({
            color: 'cyan',
            icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4L7 8L3 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 12H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
            title: 'JWT Signature Verification',
            compactTitle: 'Verify',
            body: `
                <p class="td-card-desc">${isHmac ? `Enter the secret used to sign the JWT below. The algorithm is <strong>${UI.escapeHTML(sigAlg)}</strong>.` : (sigAlg ? `Algorithm <strong>${UI.escapeHTML(sigAlg)}</strong> requires a public key (asymmetric). HS* secret verification is supported here. RS*/ES*/PS* keys are not handled in-browser.` : 'Enter the secret used to sign the JWT below:')}</p>
                <div class="td-secret-toolbar">
                    <label class="td-toggle">
                        <input type="checkbox" id="td-b64url-toggle" ${td.b64urlEncoded ? 'checked' : ''}>
                        <span class="td-toggle-switch"></span>
                        <span class="td-toggle-label">Base64URL Encoded</span>
                    </label>
                </div>
                <textarea id="td-secret" class="td-secret-input" placeholder="${isHmac ? 'a-string-secret-at-least-256-bits-long' : 'Enter the secret (or leave empty for asymmetric algorithms)'}" ${!isHmac && sigAlg ? 'disabled' : ''}>${UI.escapeHTML(td.secret || '')}</textarea>
                <div id="td-verify-status"></div>
            `,
            status: null,
            toolbar: ''
        });

        return `
            <div class="ts-tool-header">
                <div>
                    <h2>🔐 Token Decoder</h2>
                    <div class="ts-tool-sub">Decodifica, valida y verifica la firma de JSON Web Tokens. Todo se procesa localmente en el navegador.</div>
                </div>
            </div>

            <div class="td-input-section">
                <div class="td-input-headline">
                    <span class="td-input-label">Encoded Token</span>
                    <label class="td-toggle">
                        <input type="checkbox" id="td-autofocus" checked>
                        <span class="td-toggle-switch"></span>
                        <span class="td-toggle-label">Enable auto-focus</span>
                    </label>
                </div>
                <div class="td-card td-card-input">
                    <div class="td-card-headline">
                        <div class="td-card-title-row">
                            <span class="td-card-icon">${'<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4L7 8L3 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 12H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'}</span>
                            <h3 class="td-card-title-full">JSON Web Token (JWT)</h3>
                            <h3 class="td-card-title-compact">JWT</h3>
                        </div>
                        <div class="td-card-toolbar">
                            <button class="td-card-toolbar-btn" data-td-action="sample" title="Generate example">
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M13 4H7C5.9 4 5 4.9 5 6V10C5 11.1 5.9 12 7 12H13C14.1 12 15 11.1 15 10V6C15 4.9 14.1 4 13 4Z" stroke="currentColor" stroke-width="1.5"/><path d="M3 8H5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M7 7H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                            </button>
                            <button class="td-card-toolbar-btn" data-td-action="copy-input" title="Copy">
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M5 4H4C2.9 4 2 4.9 2 6V13C2 14.1 2.9 15 4 15H11C12.1 15 13 14.1 13 13V12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M11 2H6C4.9 2 4 2.9 4 4V11C4 12.1 4.9 13 6 13H13C14.1 13 15 12.1 15 11V6L11 2Z" fill="currentColor" opacity="0.3"/><path d="M11 2V6H15" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
                            </button>
                            <button class="td-card-toolbar-btn" data-td-action="clear" title="Clear">
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 4H12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M5 4V13C5 13.5 5.5 14 6 14H10C10.5 14 11 13.5 11 13V4" stroke="currentColor" stroke-width="1.5"/><path d="M7 4V2.5C7 2.2 7.2 2 7.5 2H8.5C8.8 2 9 2.2 9 2.5V4" stroke="currentColor" stroke-width="1.5"/></svg>
                            </button>
                        </div>
                    </div>
                    <div class="td-card-body td-card-body-input">
                        <textarea id="td-input" class="td-input-textarea" placeholder="Paste a JWT here (e.g. eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...)" spellcheck="false" autocomplete="off">${UI.escapeHTML(td.input)}</textarea>
                    </div>
                    ${status ? `<div class="td-card-status td-card-status-${status.kind}">${status.html}</div>` : ''}
                </div>
            </div>

            <div class="td-output">
                ${headerCard}
                ${payloadCard}
                ${sigCard}
            </div>
        `;
    },

    // ── Bind: Token Decoder (jwt.io-style) ──

    bindTokenDecoder(container) {
        const pane = container.querySelector('#tools-main-pane');
        if (!pane) return;
        const td = this.state.tokenDecoder;

        const inputEl = pane.querySelector('#td-input');
        if (inputEl) {
            UI.autoResizeTextarea(inputEl);
            let timer = null;
            inputEl.addEventListener('input', () => {
                td.input = inputEl.value;
                clearTimeout(timer);
                timer = setTimeout(() => {
                    const newPane = container.querySelector('#tools-main-pane');
                    if (!newPane) return;
                    const newHtml = this.renderTokenDecoder();
                    newPane.innerHTML = newHtml;
                    this.bindTokenDecoder(container);
                    const newInput = newPane.querySelector('#td-input');
                    if (newInput) {
                        newInput.focus();
                        const pos = inputEl.value.length;
                        newInput.setSelectionRange(pos, pos);
                    }
                }, 150);
            });
        }

        // Sample JWT button
        pane.querySelector('[data-td-action="sample"]')?.addEventListener('click', async () => {
            td.input = await this._tdSampleJwt();
            pane.innerHTML = this.renderTokenDecoder();
            this.bindTokenDecoder(container);
            const ni = pane.querySelector('#td-input');
            if (ni) ni.focus();
        });

        // Copy input button
        pane.querySelector('[data-td-action="copy-input"]')?.addEventListener('click', async () => {
            if (!td.input) { UI.toast('Nada para copiar', 'warn'); return; }
            const ok = await copyToClipboard(td.input);
            UI.toast(ok ? 'Copiado' : 'Error al copiar', ok ? 'ok' : 'error');
        });

        // Clear (input + secret)
        pane.querySelectorAll('[data-td-action="clear"]').forEach(btn => {
            btn.addEventListener('click', () => {
                td.input = '';
                td.secret = '';
                pane.innerHTML = this.renderTokenDecoder();
                this.bindTokenDecoder(container);
                const ni = pane.querySelector('#td-input');
                if (ni) ni.focus();
            });
        });

        // Copy header / payload
        pane.querySelectorAll('[data-td-action="copy"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const card = btn.closest('.td-card');
                const json = card?.querySelector('pre.td-json')?.textContent;
                if (json) {
                    copyToClipboard(json).then(ok => UI.toast(ok ? 'Copiado' : 'Error', ok ? 'ok' : 'error'));
                }
            });
        });

        // Click on JSON key → show description
        pane.querySelectorAll('.td-tok-key-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const key = btn.dataset.tdClaimKey;
                const desc = this._tdClaimDescription(key);
                if (desc) {
                    UI.toast(`${key}: ${desc.split('—')[0].trim()}`, 'info', 4000);
                }
            });
        });

        // Base64URL toggle
        const b64Toggle = pane.querySelector('#td-b64url-toggle');
        b64Toggle?.addEventListener('change', () => {
            td.b64urlEncoded = b64Toggle.checked;
            this._tdUpdateVerifyStatus(container);
        });

        // Secret input
        const secretEl = pane.querySelector('#td-secret');
        if (secretEl) {
            secretEl.addEventListener('input', () => {
                td.secret = secretEl.value;
                this._tdUpdateVerifyStatus(container);
            });
        }

        // Initial verify status (in case there's a saved secret)
        this._tdUpdateVerifyStatus(container);
    },

    // Actualiza el banner de "Valid secret" / "Signature Verified" estilo jwt.io
    async _tdUpdateVerifyStatus(container) {
        const pane = container.querySelector('#tools-main-pane');
        if (!pane) return;
        const statusEl = pane.querySelector('#td-verify-status');
        if (!statusEl) return;
        const td = this.state.tokenDecoder;
        const input = (td.input || '').trim();
        if (!input) { statusEl.innerHTML = ''; return; }

        const parsed = this._parseJwt(input);
        if (!parsed.ok) { statusEl.innerHTML = ''; return; }
        const { header, headerB64, payloadB64, signatureB64 } = parsed.value;
        const alg = header.alg;
        const isHmac = alg && /^HS\d+$/i.test(alg);

        // "Valid secret" status (jwt.io muestra esto apenas el secret es plausible)
        if (isHmac) {
            if (td.secret && td.secret.length >= 8) {
                statusEl.innerHTML = `<div class="td-status-row td-status-success"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M13 4L6 12L3 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Valid secret</div>`;
            } else if (td.secret) {
                statusEl.innerHTML = `<div class="td-status-row td-status-info"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 5V8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>Secret muy corto (recomendado ≥ 256 bits para HS256)</div>`;
            } else {
                statusEl.innerHTML = '';
            }
        }

        // Live verify: si hay secret, intentar verificar
        if (isHmac && td.secret) {
            const res = await this._verifyHs256(headerB64, payloadB64, signatureB64, td.secret);
            if (res.ok) {
                // Append "Signature Verified" badge
                statusEl.insertAdjacentHTML('beforeend', `<div class="td-status-row td-status-success td-status-verified"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M13 4L6 12L3 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Signature Verified</div>`);
            } else {
                statusEl.insertAdjacentHTML('beforeend', `<div class="td-status-row td-status-error"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>Signature Invalid</div>`);
            }
        }
    },

    // Genera un JWT de ejemplo firmado con Web Crypto API
    async _tdSampleJwt() {
        const now = Math.floor(Date.now() / 1000);
        const header = { alg: 'HS256', typ: 'JWT' };
        const payload = {
            sub: 'auth0|123456789',
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            role: 'admin',
            iss: 'https://auth.example.com/',
            aud: 'https://api.example.com',
            iat: now,
            nbf: now,
            exp: now + 3600,
            jti: 'abc-' + Math.random().toString(36).slice(2, 10)
        };
        const enc = (obj) => {
            const json = JSON.stringify(obj);
            return btoa(json).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
        };
        const h = enc(header);
        const p = enc(payload);
        // Firmar con el secret de ejemplo "your-256-bit-secret" (estándar de la doc de jwt.io)
        const secret = 'your-256-bit-secret';
        try {
            const enc_ = new TextEncoder();
            const key = await crypto.subtle.importKey(
                'raw', enc_.encode(secret),
                { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
            );
            const sig = await crypto.subtle.sign('HMAC', key, enc_.encode(`${h}.${p}`));
            const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
                .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
            return `${h}.${p}.${sigB64}`;
        } catch (_e) {
            return `${h}.${p}.<signing-failed>`;
        }
    },

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
        const isJson = !isBinary && (/json/i.test(ct) || (() => { try { JSON.parse(r.body); return true; } catch (e) { return false; } })());
        let bodyHtml;
        if (isBinary) {
            const blob = new Blob([r.body], { type: ct });
            const blobUrl = URL.createObjectURL(blob);
            bodyHtml = `<a class="rb-response-download" href="${blobUrl}" download="response">⬇ Descargar respuesta</a>`;
            setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
        } else if (isJson) {
            bodyHtml = `<pre class="rb-response-body">${UI.formatJSONColored(r.body)}</pre>`;
        } else {
            bodyHtml = `<pre class="rb-response-body">${UI.escapeHTML(r.body)}</pre>`;
        }
        return `
            <div class="rb-response-header">
                <span class="rb-status-pill ${statusClass}">${r.status} ${UI.escapeHTML(r.statusText || '')}</span>
                <span class="rb-time-pill">${UI.escapeHTML(meta)}</span>
            </div>
            <div class="rb-response-toolbar">
                <button class="rb-copy-btn" data-rb-copy="body" ${isBinary ? 'disabled title="Body binario: usá Descargar"' : ''}>📋 Copiar body</button>
                <button class="rb-copy-btn" data-rb-copy="url">🔗 Copiar URL</button>
                <button class="rb-copy-btn" data-rb-copy="meta">📊 Copiar tiempo y tamaño</button>
                <button class="rb-copy-btn" data-rb-copy="curl">📜 Copiar como cURL</button>
                <button class="rb-copy-btn" data-rb-copy="all">🧾 Copiar todo (request + response)</button>
            </div>
            <details class="rb-response-headers">
                <summary>Headers (${Object.keys(r.headers || {}).length})</summary>
                <pre>${UI.escapeHTML(headersList)}</pre>
            </details>
            ${bodyHtml}
            ${r.truncated ? `<div class="rb-info-pill rb-mt-8">⚠️ Respuesta truncada a 5 MB — el JSON puede estar incompleto.</div>` : ''}
        `;
    },

    // ── cURL synthesizer (file-private) ──
    // Reverse of parseCurl: take the current state and emit a curl command string
    // that reproduces the request. Used for the "Copy as cURL" button.
    _buildCurlFromState(rb) {
        if (!rb || !rb.url) return '';
        const lines = [];
        const m = (rb.method || 'GET').toLowerCase();
        lines.push(`curl -X ${m.toUpperCase()} '${rb.url}'`);
        const headers = this._kvToObject(rb.headers);
        for (const [k, v] of Object.entries(headers)) {
            lines.push(`  -H '${k}: ${v.replace(/'/g, "'\\''")}'`);
        }
        const bt = rb.bodyType;
        if (bt === 'json' && rb.body) {
            lines.push(`  -H 'Content-Type: application/json'`);
            const safe = rb.body.replace(/'/g, "'\\''");
            lines.push(`  --data-raw '${safe}'`);
        } else if (bt === 'x-www-form-urlencoded') {
            const params = this._kvToObject(rb.formFields);
            const pairs = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
            if (pairs.length > 0) {
                lines.push(`  --data '${pairs.join('&')}'`);
            }
        } else if (bt === 'form-data') {
            const params = this._kvToObject(rb.formFields);
            for (const [k, v] of Object.entries(params)) {
                lines.push(`  -F '${k}=${String(v).replace(/'/g, "'\\''")}'`);
            }
            for (const f of rb.files) {
                lines.push(`  -F '${f.fieldName}=@${f.filename}'`);
            }
        } else if (bt === 'raw' && rb.body) {
            if (rb.rawContentType) {
                lines.push(`  -H 'Content-Type: ${rb.rawContentType}'`);
            }
            const safe = rb.body.replace(/'/g, "'\\''");
            lines.push(`  --data-raw '${safe}'`);
        }
        return lines.join(' \\\n');
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
            this._bindResponseCopyButtons(container);
        }
        // Update the send button label/state
        const sendBtn = pane.querySelector('#rb-send');
        if (sendBtn) {
            const rb = this.state.requestBuilder;
            sendBtn.disabled = rb.loading;
            sendBtn.textContent = rb.loading ? '⏳ Enviando…' : '▶ Send';
        }
    },

    _bindResponseCopyButtons(container) {
        const pane = container.querySelector('#tools-main-pane');
        if (!pane) return;
        const rb = this.state.requestBuilder;
        pane.querySelectorAll('[data-rb-copy]').forEach(btn => {
            // Guard against re-binding on the same DOM node (innerHTML replacement
            // creates new elements, so this is mostly a safety net).
            if (btn.dataset.copyBound) return;
            btn.dataset.copyBound = '1';
            btn.addEventListener('click', async () => {
                const kind = btn.dataset.rbCopy;
                const text = this._buildCopyText(kind, rb);
                if (text == null) {
                    UI.toast('Nada para copiar', 'warn');
                    return;
                }
                const ok = await copyToClipboard(text);
                if (ok) {
                    UI.toast('Copiado al portapapeles', 'ok');
                    btn.classList.add('copied');
                    setTimeout(() => btn.classList.remove('copied'), 1200);
                } else {
                    UI.toast('No se pudo copiar', 'error');
                }
            });
        });
    },

    _buildCopyText(kind, rb) {
        if (kind === 'body') {
            if (!rb.response || rb.response.body == null) return null;
            return rb.response.body;
        }
        if (kind === 'url') {
            return rb.url || null;
        }
        if (kind === 'meta') {
            if (!rb.response) return null;
            const r = rb.response;
            return `URL: ${rb.url}\nStatus: ${r.status} ${r.statusText || ''}\nTime: ${r.timeMs} ms\nSize: ${UI.formatBytes(r.sizeBytes)}${r.truncated ? '\n(truncado a 5 MB)' : ''}`;
        }
        if (kind === 'curl') {
            return this._buildCurlFromState(rb) || null;
        }
        if (kind === 'all') {
            const lines = [];
            lines.push(`# Request`);
            lines.push(this._buildCurlFromState(rb));
            lines.push('');
            if (rb.response) {
                const r = rb.response;
                lines.push(`# Response`);
                lines.push(`Status: ${r.status} ${r.statusText || ''}`);
                lines.push(`Time: ${r.timeMs} ms`);
                lines.push(`Size: ${UI.formatBytes(r.sizeBytes)}${r.truncated ? ' (truncado)' : ''}`);
                lines.push('');
                lines.push('## Headers');
                for (const [k, v] of Object.entries(r.headers || {})) {
                    lines.push(`${k}: ${v}`);
                }
                lines.push('');
                lines.push('## Body');
                lines.push(r.body);
            } else {
                lines.push('# (sin response todavía)');
            }
            return lines.join('\n');
        }
        return null;
    }
};
