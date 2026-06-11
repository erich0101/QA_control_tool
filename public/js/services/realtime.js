import { Store } from '../store/state.js';
import { UI } from '../utils/ui-utils.js';

/**
 * REALTIME.JS - Gestión de actualizaciones en vivo.
 * Conecta al WebSocket del servidor y reacciona a cambios en DB.
 */
export const RealtimeService = {
    socket: null,
    reconnectInterval: 5000,

    init() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        console.log(`🔌 Conectando a Realtime: ${wsUrl}`);
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            console.log('✅ Realtime conectado');
        };

        this.socket.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (payload && payload.type === 'hello') {
                    console.log('👋 Realtime handshake OK, tablas vigiladas:', payload.tables);
                    return;
                }
                if (payload && payload.type === 'pong') return;
                this.handleUpdate(payload);
            } catch (err) {
                console.error('❌ Error procesando mensaje realtime:', err);
            }
        };

        this.socket.onclose = (event) => {
            const reason = event && event.code ? `(code ${event.code})` : '';
            console.warn(`⚠️ Realtime desconectado${reason}. Reintentando en ${this.reconnectInterval / 1000}s...`);
            setTimeout(() => this.init(), this.reconnectInterval);
        };

        this.socket.onerror = (err) => {
            console.error('❌ Error en WebSocket:', err);
        };
    },

    handleUpdate(payload) {
        const table = payload.table;
        const event = payload.event || payload.action;
        if (!table) return;
        console.log(`🔔 Cambio detectado: [${table}] ${event}`);

        // Reaccionar según la tabla
        switch (table) {
            case 'qa_executions': {
                const row = payload.new || payload.old;
                if (row && payload.event === 'DELETE') {
                    this.triggerGlobalReload();
                } else if (row) {
                    this.updateExecutions(row);
                }
                break;
            }
            case 'qa_test_runs':
                this.updateTestRuns(payload.new);
                break;
            case 'qa_test_suites':
                this.triggerGlobalReload();
                break;
            case 'qa_test_cases':
                this.triggerGlobalReload();
                break;
            case 'qa_defects':
                this.triggerGlobalReload();
                break;
            case 'qa_attachments':
                this.triggerGlobalReload();
                break;
        }
    },

    updateExecutions(execution) {
        if (!execution || !execution.tc_id) return;
        const suites = Store.state.testSuites;
        let changed = false;

        suites.forEach(suite => {
            suite.test_cases.forEach(tc => {
                if (tc.id === execution.tc_id) {
                    if (!tc.execution_id || tc.execution_id === execution.id || execution.id > tc.execution_id) {
                        tc.status = execution.status;
                        tc.execution_id = execution.id;
                        tc.observations = execution.observations;
                        tc.obtained_result = execution.obtained_result;
                        changed = true;
                    }
                }
            });
        });

        if (changed) {
            console.log('✨ Sincronización de ejecución preparada');
            this.triggerUIRefresh();
        }
    },

    updateTestRuns(run) {
        this.triggerGlobalReload();
    },

    refreshTimeout: null,
    notifyTimeout: null,

    // Debounce para notificaciones simples (cambios de datos en memoria)
    triggerUIRefresh() {
        if (this.notifyTimeout) clearTimeout(this.notifyTimeout);
        this.notifyTimeout = setTimeout(() => {
            console.log('✨ Aplicando cambios visuales (debounced)...');
            Store.notify();
            this.notifyTimeout = null;
        }, 100);
    },

    // Debounce para recargas globales (peticiones al servidor)
    async triggerGlobalReload() {
        if (this.refreshTimeout) clearTimeout(this.refreshTimeout);
        
        this.refreshTimeout = setTimeout(() => {
            console.log('🔄 Refrescando datos por cambios estructurales (debounced)...');
            const ucId = Store.state.selectedUseCaseId;
            const projId = Store.state.activeProjectId;
            
            const isTestTab = Store.state.activeTab === 'test-suites';
            const isExecTab = Store.state.activeTab === 'execution';
            
            if ((isTestTab || isExecTab) && (ucId || projId)) {
                window.dispatchEvent(new CustomEvent('realtime-refresh'));
            }
            this.refreshTimeout = null;
        }, 400); // Un poco más de tiempo para cambios estructurales
    }
};
