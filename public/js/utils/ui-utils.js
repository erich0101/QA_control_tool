/**
 * UI-UTILS.JS - Utilidades de interfaz.
 */

export const UI = {
    toast(message, type = 'ok') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.style.cssText = `
            position: fixed;
            bottom: 32px;
            right: 32px;
            background: var(--apple-material-thick);
            backdrop-filter: blur(20px) saturate(180%);
            border: 1px solid ${type === 'ok' ? 'var(--apple-green)' : type === 'error' ? 'var(--apple-red)' : 'var(--apple-orange)'};
            padding: 14px 22px;
            border-radius: var(--apple-radius-lg);
            box-shadow: var(--apple-shadow-lg);
            color: var(--apple-label);
            font-size: 0.875rem;
            font-weight: 500;
            font-family: var(--apple-font-family);
            z-index: 10000;
            transform: translateY(100px);
            opacity: 0;
            transition: all 0.4s cubic-bezier(0.25, 0.1, 0.25, 1);
        `;
        toast.innerText = message;
        document.body.appendChild(toast);

        // Trigger animation
        setTimeout(() => {
            toast.style.transform = 'translateY(0)';
            toast.style.opacity = '1';
        }, 10);

        // Remove after 3s
        setTimeout(() => {
            toast.style.transform = 'translateY(100px)';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    },

    showLoading() {
        if (document.getElementById('global-loader')) return;
        const loader = document.createElement('div');
        loader.id = 'global-loader';
        loader.style.cssText = `
            position: fixed;
            inset: 0;
            background: var(--apple-material);
            backdrop-filter: blur(20px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 20000;
        `;
        loader.innerHTML = `<div class="loader-spinner" style="width:40px; height:40px; border:3px solid var(--apple-fill); border-top-color:var(--apple-blue); border-radius:50%; animation: spin 1s linear infinite;"></div>
            <style>@keyframes spin { to { transform: rotate(360deg); } }</style>`;
        document.body.appendChild(loader);
    },

    hideLoading() {
        document.getElementById('global-loader')?.remove();
    },

    escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    highlightSteps(text) {
        if (!text) return '';
        // Escapar HTML primero
        let escaped = this.escapeHTML(text);
        // Regex: inicio de línea o después de un salto, texto seguido de : o . y espacio
        // Detecta: "Dado: ", "1. ", "Paso 1: ", "Cuando. "
        return escaped.replace(/^([^:\n\.]+[:\.])\s/gm, '<span style="color: #4096ff; font-weight: 800;">$1</span> ');
    },

    autoResizeTextarea(textarea) {
        if (!textarea) return;
        textarea.style.height = 'auto';
        textarea.style.height = (textarea.scrollHeight + 2) + 'px'; // +2 for border
    },

    showSidePanel(title, content) {
        let overlay = document.querySelector('.side-panel-overlay');
        let panel = document.querySelector('.side-panel');

        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'side-panel-overlay';
            overlay.onclick = () => this.closeSidePanel();
            document.body.appendChild(overlay);
        }

        if (!panel) {
            panel = document.createElement('div');
            panel.className = 'side-panel';
            document.body.appendChild(panel);
        }

        panel.innerHTML = `
            <div class="side-panel-header">
                <h3 style="margin:0; font-size: 1.1rem; font-weight: 800; color: var(--text-main);">${title}</h3>
                <button class="btn btn-ghost" onclick="UI.closeSidePanel()" style="padding: 8px; border-radius: 50%;">✕</button>
            </div>
            <div class="side-panel-body">
                ${content}
            </div>
        `;

        // Trigger animation
        overlay.style.display = 'block';
        setTimeout(() => {
            overlay.classList.add('active');
            panel.classList.add('active');
        }, 10);
    },

    closeSidePanel() {
        const overlay = document.querySelector('.side-panel-overlay');
        const panel = document.querySelector('.side-panel');
        if (!overlay || !panel) return;

        overlay.classList.remove('active');
        panel.classList.remove('active');
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 300);
    },

    showImageZoom(src) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.9);
            backdrop-filter: blur(10px); z-index: 30000;
            display: flex; align-items: center; justify-content: center;
            cursor: zoom-out; opacity: 0; transition: opacity 0.3s ease;
        `;
        
        const img = document.createElement('img');
        img.src = src;
        img.style.cssText = `
            max-width: 95vw; max-height: 95vh; border-radius: 8px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            transform: scale(0.9); transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        `;

        overlay.appendChild(img);
        document.body.appendChild(overlay);

        setTimeout(() => {
            overlay.style.opacity = '1';
            img.style.transform = 'scale(1)';
        }, 10);

        const close = () => {
            overlay.style.opacity = '0';
            img.style.transform = 'scale(0.9)';
            setTimeout(() => overlay.remove(), 300);
        };

        overlay.onclick = close;
        document.addEventListener('keydown', function escListener(e) {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', escListener);
            }
        });
    }
};
