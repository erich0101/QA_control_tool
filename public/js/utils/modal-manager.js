class ModalManager {
    constructor() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';
        this.overlay.innerHTML = `
            <div class="modal-panel">
                <div class="modal-title" id="modal-title"></div>
                <div class="modal-message" id="modal-message"></div>
                <input type="text" class="modal-input" id="modal-input" style="display:none;" />
                <div class="modal-actions">
                    <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
                    <button class="btn btn-primary" id="modal-ok">Aceptar</button>
                </div>
            </div>
        `;
        document.body.appendChild(this.overlay);

        this.title = document.getElementById('modal-title');
        this.message = document.getElementById('modal-message');
        this.input = document.getElementById('modal-input');
        this.okBtn = document.getElementById('modal-ok');
        this.cancelBtn = document.getElementById('modal-cancel');

        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });
    }

    open(config) {
        this.title.textContent = config.title;
        this.message.textContent = config.message;
        
        if (config.type === 'prompt') {
            this.input.style.display = 'block';
            this.input.value = config.placeholder || '';
        } else {
            this.input.style.display = 'none';
        }

        this.okBtn.onclick = () => {
            const result = config.type === 'prompt' ? this.input.value : true;
            this.close();
            config.onConfirm(result);
        };
        
        this.cancelBtn.onclick = () => {
            this.close();
            if (config.onCancel) config.onCancel();
        };

        this.overlay.classList.add('is-open');
    }

    close() {
        this.overlay.classList.remove('is-open');
    }

    confirm(message, title = 'Confirmar') {
        return new Promise((resolve) => {
            this.open({
                title,
                message,
                type: 'confirm',
                onConfirm: () => resolve(true),
                onCancel: () => resolve(false)
            });
        });
    }

    prompt(message, placeholder = '', title = 'Ingresar valor') {
        return new Promise((resolve) => {
            this.open({
                title,
                message,
                placeholder,
                type: 'prompt',
                onConfirm: (val) => resolve(val),
                onCancel: () => resolve(null)
            });
        });
    }
}

export const modalManager = new ModalManager();
