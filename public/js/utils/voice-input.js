const VoiceInput = {
    recognition: null,
    isRecording: false,
    currentBtn: null,
    currentTextarea: null,

    isSupported() {
        return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    },

    init() {
        if (!this.isSupported()) return;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'es-AR';
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;

        this.recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            if (this.currentTextarea) {
                const existing = this.currentTextarea.dataset.originalText || '';
                if (finalTranscript) {
                    this.currentTextarea.value = existing + (existing ? ' ' : '') + finalTranscript;
                    this.currentTextarea.dataset.originalText = this.currentTextarea.value;
                    this.currentTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                } else if (interimTranscript) {
                    this.currentTextarea.value = existing + (existing ? ' ' : '') + interimTranscript;
                }
            }
        };

        this.recognition.onerror = (event) => {
            console.warn('VoiceInput error:', event.error);
            this.stop();
        };

        this.recognition.onend = () => {
            this.stop();
        };
    },

    start(btn, textarea) {
        if (!this.recognition) this.init();
        if (!this.isSupported()) {
            this.showUnsupportedMessage(btn);
            return;
        }

        if (this.isRecording && this.currentBtn === btn) {
            this.stop();
            return;
        }

        if (this.isRecording) {
            this.stop();
        }

        this.currentBtn = btn;
        this.currentTextarea = textarea;
        this.currentTextarea.dataset.originalText = textarea.value;

        try {
            this.recognition.start();
            this.isRecording = true;
            btn.classList.add('recording');
            btn.innerHTML = '⏹';
            btn.title = 'Detener dictado';
            textarea.classList.add('voice-active');
        } catch (e) {
            console.warn('VoiceInput start error:', e);
            this.stop();
        }
    },

    stop() {
        if (this.recognition && this.isRecording) {
            try {
                this.recognition.stop();
            } catch (e) {}
        }

        this.isRecording = false;

        if (this.currentBtn) {
            this.currentBtn.classList.remove('recording');
            this.currentBtn.innerHTML = '🎤';
            this.currentBtn.title = 'Dictar por voz';
        }

        if (this.currentTextarea) {
            this.currentTextarea.classList.remove('voice-active');
            delete this.currentTextarea.dataset.originalText;
        }

        this.currentBtn = null;
        this.currentTextarea = null;
    },

    showUnsupportedMessage(btn) {
        const originalText = btn.innerHTML;
        btn.innerHTML = '✗';
        btn.title = 'Navegador no soportado. Usá Chrome o Edge.';
        btn.style.background = '#6b7280';
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.title = 'Dictado por voz no disponible';
            btn.style.background = '';
        }, 2000);
    },

    createButton(targetTextarea, options = {}) {
        if (!this.isSupported()) {
            return '';
        }

        const { compact = false } = options;
        const size = compact ? '28px' : '32px';
        const fontSize = compact ? '14px' : '16px';

        return `
            <button class="voice-btn" type="button" title="Dictar por voz"
                    onclick="VoiceInput.start(this, this.parentElement.querySelector('textarea'))"
                    style="position:absolute; top:6px; right:6px; width:${size}; height:${size};
                           border-radius:50%; border:2px solid #007aff; cursor:pointer;
                           background:#007aff; color:white;
                           font-size:${fontSize}; display:flex; align-items:center; justify-content:center;
                           transition:all 0.2s ease; z-index:10; padding:0;
                           box-shadow:0 2px 8px rgba(0,122,255,0.3);">
                🎤
            </button>
        `;
    },

    wrapWithVoice(html, textareaId) {
        if (!this.isSupported()) return html;

        return `
            <div style="position:relative;">
                ${html}
                <button class="voice-btn" type="button" title="Dictar por voz"
                        onclick="VoiceInput.start(this, document.getElementById('${textareaId}'))"
                        style="position:absolute; top:6px; right:6px; width:32px; height:32px;
                               border-radius:50%; border:2px solid #007aff; cursor:pointer;
                               background:#007aff; color:white;
                               font-size:16px; display:flex; align-items:center; justify-content:center;
                               transition:all 0.2s ease; z-index:10; padding:0;
                               box-shadow:0 2px 8px rgba(0,122,255,0.3);">
                    🎤
                </button>
            </div>
        `;
    }
};

VoiceInput.init();
window.VoiceInput = VoiceInput;

export { VoiceInput };