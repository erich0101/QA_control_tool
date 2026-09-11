import { UI } from '../utils/ui-utils.js';

/**
 * EvidenceUploader — Componente reutilizable para adjuntar/eliminar evidencias.
 *
 * Soporta:
 *  - File picker (input[type=file])
 *  - Drag & drop sobre la grilla
 *  - Ctrl+V paste (imágenes del clipboard)
 *  - Categorías (select opcional)
 *  - Contador de archivos
 *  - Renderizado de archivos pendientes (preview) y persistidos
 *  - Eliminación con confirmación
 *
 * Usa las clases CSS estándar del proyecto:
 *   .h-evidence-item, .h-evidence-category-badge, .h-evidence-remove
 */
export class EvidenceUploader {
    constructor(options) {
        this.container = options.container;
        this.input = this._resolve(options.inputSelector);
        this.addBtn = this._resolve(options.addBtnSelector);
        this.categorySelect = options.categorySelector ? this._resolve(options.categorySelector) : null;
        this.countSpan = options.countSelector ? this._resolve(options.countSelector) : null;
        this.grid = this._resolve(options.gridSelector);
        this.section = options.sectionSelector ? this._resolve(options.sectionSelector) : null;

        this.pending = Array.isArray(options.pendingFiles) ? [...options.pendingFiles] : [];
        this.persistedItems = Array.isArray(options.persistedItems) ? [...options.persistedItems] : [];

        this.onDeletePersisted = options.onDeletePersisted || null;
        this.onAfterDelete = options.onAfterDelete || null;
        this.enableDragDrop = options.enableDragDrop !== false;
        this.enablePaste = options.enablePaste !== false;
        this.emptyHintHtml = options.emptyHintHtml || '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--apple-label-tertiary); font-size:0.8rem;">Sin evidencias adjuntas.</div>';

        this._listeners = [];
    }

    _resolve(sel) {
        if (!sel) return null;
        if (typeof sel === 'string') return this.container.querySelector(sel);
        return sel;
    }

    init() {
        if (!this.input || !this.addBtn || !this.grid) return;

        const clickListener = () => this.input.click();
        this.addBtn.addEventListener('click', clickListener);
        this._listeners.push({ el: this.addBtn, type: 'click', fn: clickListener });

        const changeListener = () => {
            const files = Array.from(this.input.files || []);
            files.forEach(f => this.stageFile(f));
            this.input.value = '';
        };
        this.input.addEventListener('change', changeListener);
        this._listeners.push({ el: this.input, type: 'change', fn: changeListener });

        if (this.enablePaste && this.section) {
            const pasteListener = (e) => this._onPaste(e);
            this.section.addEventListener('paste', pasteListener);
            this._listeners.push({ el: this.section, type: 'paste', fn: pasteListener });
        }

        if (this.enableDragDrop) {
            const grid = this.grid;
            const dragHighlight = () => {
                grid.style.outline = '2px dashed var(--apple-blue)';
                grid.style.outlineOffset = '4px';
            };
            const dragUnhighlight = () => {
                grid.style.outline = '';
                grid.style.outlineOffset = '';
            };
            const dragOver = (e) => { e.preventDefault(); dragHighlight(); };
            const dragLeave = (e) => { if (e.target === grid) dragUnhighlight(); };
            const drop = (e) => {
                e.preventDefault();
                dragUnhighlight();
                const files = Array.from(e.dataTransfer?.files || []);
                files.forEach(f => this.stageFile(f));
            };
            grid.addEventListener('dragover', dragOver);
            grid.addEventListener('dragleave', dragLeave);
            grid.addEventListener('drop', drop);
            this._listeners.push({ el: grid, type: 'dragover', fn: dragOver });
            this._listeners.push({ el: grid, type: 'dragleave', fn: dragLeave });
            this._listeners.push({ el: grid, type: 'drop', fn: drop });
        }

        this.renderAll();
    }

    _onPaste(e) {
        const items = e.clipboardData?.items;
        if (!items) return;
        let handled = false;
        for (const item of items) {
            if (item.kind === 'file' && item.type && item.type.startsWith('image/')) {
                const blob = item.getAsFile();
                if (!blob) continue;
                const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
                const file = new File([blob], `paste-${ts}.${ext}`, { type: blob.type });
                this.stageFile(file);
                handled = true;
            }
        }
        if (handled) e.preventDefault();
    }

    stageFile(file) {
        if (!file || !file.type || !file.type.startsWith('image/')) return;
        const category = this.categorySelect?.value || 'GENERAL';
        const reader = new FileReader();
        reader.onload = (e) => {
            const item = { file, category, dataUrl: e.target.result };
            this.pending.push(item);
            this._renderPendingItem(item);
            this.updateCount();
        };
        reader.readAsDataURL(file);
    }

    _renderPendingItem(item) {
        const div = document.createElement('div');
        div.className = 'h-evidence-item';
        div.dataset.pending = 'true';
        div.innerHTML = `
            <img src="${item.dataUrl}" alt="${UI.escapeHTML(item.file.name)}">
            <span class="h-evidence-category-badge">${UI.escapeHTML(item.category)}</span>
            <button class="h-evidence-remove" data-pending="true">✕</button>
        `;
        this.grid.prepend(div);
        div.querySelector('.h-evidence-remove')?.addEventListener('click', () => {
            div.remove();
            const idx = this.pending.indexOf(item);
            if (idx > -1) this.pending.splice(idx, 1);
            this.updateCount();
        });
    }

    _renderPersistedItem(ev) {
        const div = document.createElement('div');
        div.className = 'h-evidence-item';
        div.dataset.attachmentId = String(ev.id);
        div.innerHTML = `
            <img src="/api/evidence/${ev.id}" alt="${UI.escapeHTML(ev.file_name)}" loading="lazy">
            <span class="h-evidence-category-badge">${UI.escapeHTML(ev.evidence_category || 'GENERAL')}</span>
            <button class="h-evidence-remove" data-attachment-id="${ev.id}">✕</button>
        `;
        this.grid.appendChild(div);
        div.querySelector('.h-evidence-remove')?.addEventListener('click', async () => {
            if (!confirm('¿Eliminar esta evidencia?')) return;
            try {
                if (this.onDeletePersisted) {
                    await this.onDeletePersisted(ev.id);
                } else {
                    await fetch(`/api/evidence/${ev.id}`, { method: 'DELETE' });
                }
                div.remove();
                const idx = this.persistedItems.findIndex(x => x.id === ev.id);
                if (idx > -1) this.persistedItems.splice(idx, 1);
                this.updateCount();
                if (this.onAfterDelete) this.onAfterDelete();
            } catch (err) {
                UI.toast(err.message || 'Error al eliminar evidencia', 'error');
            }
        });
    }

    renderAll() {
        if (!this.grid) return;
        this.grid.innerHTML = '';
        for (const ev of this.persistedItems) {
            this._renderPersistedItem(ev);
        }
        for (const p of this.pending) {
            this._renderPendingItem(p);
        }
        if (this.persistedItems.length === 0 && this.pending.length === 0) {
            this.grid.innerHTML = this.emptyHintHtml;
        }
        this.updateCount();
    }

    updateCount() {
        if (!this.grid) return;
        const items = this.grid.querySelectorAll('.h-evidence-item');
        if (this.countSpan) {
            this.countSpan.textContent = `${items.length} archivo(s)`;
        }
        // Actualizar contador en el header del section (si existe)
        const headerCount = this.container.querySelector('.h-evidence-section-header-count');
        if (headerCount) headerCount.textContent = `(${items.length})`;
        // Ocultar hint vacío si hay items
        const hint = this.grid.querySelector('.h-evidence-empty-hint');
        if (hint) hint.style.display = items.length === 0 ? '' : 'none';
    }

    getPending() {
        return [...this.pending];
    }

    clearPending() {
        this.pending = [];
        this.renderAll();
    }

    setPersisted(items) {
        this.persistedItems = Array.isArray(items) ? [...items] : [];
        this.renderAll();
    }

    destroy() {
        for (const { el, type, fn } of this._listeners) {
            el.removeEventListener(type, fn);
        }
        this._listeners = [];
    }
}
