import { Store } from '../store/state.js';
import { UI } from '../utils/ui-utils.js';
import { modalManager } from '../utils/modal-manager.js';

export const SBS = {
    render(container, issue) {
        this.currentTests = issue.test_list || issue.test_list_v2 || [];
        
        if (this.currentTests.length === 0) {
            container.innerHTML = `
                <div class="glass-card" style="padding: 48px; text-align: center; border: 2px dashed var(--border);">
                    <div style="font-size: 2rem; margin-bottom: 16px;">✨</div>
                    <p style="color: var(--text-muted);">No hay pruebas definidas aún.</p>
                    <button class="btn btn-ghost" style="margin-top: 16px;" id="btn-add-test">+ Agregar Primera Prueba</button>
                </div>
            `;
            this.bindEmptyEvents(container);
            return;
        }

        container.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 16px;">
                ${this.currentTests.map((t, i) => this.getTestCardHtml(t, i)).join('')}
                <button class="btn btn-ghost" style="width: 100%; border-style: dashed;" id="btn-add-test-bottom">+ Agregar Nueva Prueba</button>
            </div>
        `;
        this.bindEvents(container);
    },

    getTestCardHtml(test, index) {
        if (test.isSection) {
            return `
                <div class="section-header" style="margin: 32px 0 8px; display: flex; align-items: center; gap: 12px;">
                    <div style="width: 4px; height: 24px; background: var(--dev); border-radius: 4px;"></div>
                    <input type="text" value="${UI.escapeHTML(test.title)}" class="section-title-input" data-idx="${index}" 
                           style="flex: 1; background: transparent; border: none; font-size: 0.95rem; font-weight: 800; color: var(--dev); text-transform: uppercase; letter-spacing: 0.05em; padding: 4px 0;">
                    <button class="btn-icon danger delete-test" data-idx="${index}">🗑</button>
                </div>
            `;
        }

        const statusColor = {
            'OK': 'var(--ok)',
            'FAIL': 'var(--fail)',
            'WARNING': 'var(--warn)',
            'PENDING': 'var(--text-muted)'
        }[test.status] || 'var(--text-muted)';

        const expanded = test.expanded;

        return `
            <div class="test-card glass-card" data-idx="${index}" style="margin-bottom: 12px; border-radius: 16px; overflow: hidden;">
                <div class="test-card-header" style="padding: 12px 20px; border-bottom: ${expanded ? '1px solid var(--border)' : 'none'}; display: flex; align-items: center; gap: 16px; background: rgba(0,0,0,0.1);">
                    <div class="status-indicator" style="background: ${statusColor}; width: 8px; height: 8px; border-radius: 50%; box-shadow: 0 0 10px ${statusColor};"></div>
                    <select class="test-status-select" data-idx="${index}" style="padding: 4px 8px; font-size: 0.7rem; border-radius: 8px; background: rgba(255,255,255,0.05); font-weight: 700; color: ${statusColor}; border-color: ${statusColor}33;">
                        <option value="PENDING" ${test.status === 'PENDING' ? 'selected' : ''}>PEND</option>
                        <option value="OK" ${test.status === 'OK' ? 'selected' : ''}>PASS</option>
                        <option value="WARNING" ${test.status === 'WARNING' ? 'selected' : ''}>WARN</option>
                        <option value="FAIL" ${test.status === 'FAIL' ? 'selected' : ''}>FAIL</option>
                    </select>
                    <textarea class="test-title-input" data-idx="${index}" rows="1" 
                           style="flex: 1; background: transparent; border: none; font-weight: 600; padding: 4px 0; resize: none; overflow: hidden; font-size: 0.875rem;" 
                           placeholder="Describe la prueba...">${UI.escapeHTML(test.title)}</textarea>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-icon toggle-expand" data-idx="${index}" title="Evidencias">${expanded ? '▲' : '🖼️'}</button>
                        <button class="btn-icon danger delete-test" data-idx="${index}">🗑</button>
                    </div>
                </div>
                
                <div class="test-card-body" style="padding: 20px; display: ${expanded ? 'grid' : 'none'}; grid-template-columns: 1fr 1fr; gap: 20px; background: rgba(0,0,0,0.05);">
                    ${this.getUploadZoneHtml(test, index, 'figma')}
                    ${this.getUploadZoneHtml(test, index, 'dev')}
                </div>
            </div>
        `;
    },

    getUploadZoneHtml(test, index, type) {
        const row = test.sbs?.[0] || { figma: {}, dev: {} };
        const data = row[type] || {};
        const src = data.dataUrl || data.src;
        const color = type === 'figma' ? 'var(--figma)' : 'var(--dev)';
        const label = type === 'figma' ? 'Figma / Spec' : 'Desarrollo / Real';
        const icon = type === 'figma' ? '🎨' : '💻';

        if (src) {
            const fullSrc = src.startsWith('data:') ? src : `/${src}`;
            return `
                <div class="upload-zone-filled" style="position: relative; aspect-ratio: 16/9; border-radius: 12px; overflow: hidden; border: 1px solid var(--border);">
                    <img src="${fullSrc}" style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;" onclick="UI.showImageZoom('${fullSrc}')">
                    <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 8px; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 0.65rem; font-weight: 700; color: ${color};">${label}</span>
                        <button class="clear-file" data-idx="${index}" data-type="${type}" style="background: var(--fail); border: none; border-radius: 4px; color: white; font-size: 0.6rem; padding: 2px 6px; cursor: pointer;">Borrar</button>
                    </div>
                </div>
            `;
        }

        return `
            <div class="upload-zone" data-idx="${index}" data-type="${type}" style="border-color: ${color}44;">
                <span style="font-size: 1.5rem;">${icon}</span>
                <span style="font-size: 0.75rem; font-weight: 700; color: ${color};">${label}</span>
                <p style="font-size: 0.65rem; color: var(--text-muted);">Haz clic o arrastra</p>
                <input type="file" class="file-input" style="display:none;" accept="image/*,video/*">
            </div>
        `;
    },

    bindEmptyEvents(container) {
        container.querySelector('#btn-add-test')?.addEventListener('click', () => this.addNewTest());
    },

    bindEvents(container) {
        container.querySelector('#btn-add-test-bottom')?.addEventListener('click', () => this.addNewTest());

        container.querySelectorAll('.toggle-expand').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                this.currentTests[idx].expanded = !this.currentTests[idx].expanded;
                this.render(container.parentElement, { test_list_v2: this.currentTests });
            });
        });

        container.querySelectorAll('.test-status-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const idx = parseInt(select.dataset.idx);
                this.currentTests[idx].status = e.target.value;
                this.render(container.parentElement, { test_list_v2: this.currentTests });
            });
        });

        container.querySelectorAll('.test-title-input, .section-title-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = parseInt(input.dataset.idx);
                this.currentTests[idx].title = e.target.value;
            });
        });

        container.querySelectorAll('.delete-test').forEach(btn => {
            btn.addEventListener('click', async () => {
                const idx = parseInt(btn.dataset.idx);
                if (await modalManager.confirm("¿Eliminar esta prueba?")) {
                    this.currentTests.splice(idx, 1);
                    this.render(container.parentElement, { test_list_v2: this.currentTests });
                }
            });
        });

        container.querySelectorAll('.upload-zone').forEach(zone => {
            zone.addEventListener('click', () => zone.querySelector('.file-input').click());
            zone.querySelector('.file-input').addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) this.handleFileUpload(file, zone.dataset.idx, zone.dataset.type, container);
            });
        });

        container.querySelectorAll('.clear-file').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                const type = btn.dataset.type;
                this.currentTests[idx].sbs[0][type] = { src: null, file: null, dataUrl: null };
                this.render(container.parentElement, { test_list_v2: this.currentTests });
            });
        });
    },

    addNewTest() {
        this.currentTests.push({
            title: '',
            status: 'PENDING',
            isSection: false,
            expanded: true,
            sbs: [{ figma: {}, dev: {} }]
        });
        const editorContainer = document.querySelector('#side-by-side-container');
        this.render(editorContainer, { test_list_v2: this.currentTests });
    },

    handleFileUpload(file, index, type, container) {
        const reader = new FileReader();
        reader.onload = (e) => {
            if (!this.currentTests[index].sbs) this.currentTests[index].sbs = [{ figma: {}, dev: {} }];
            this.currentTests[index].sbs[0][type] = {
                src: null,
                file: file,
                dataUrl: e.target.result
            };
            this.render(container, { test_list_v2: this.currentTests });
            UI.toast("Archivo cargado localmente");
        };
        reader.readAsDataURL(file);
    }
};
