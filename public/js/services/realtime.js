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
        const wsUrl = `${protocol}//${window.location.host}`;
        
        console.log(`🔌 Conectando a Realtime: ${wsUrl}`);
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            console.log('✅ Realtime conectado');
        };

        this.socket.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                this.handleUpdate(payload);
            } catch (err) {
                console.error('❌ Error procesando mensaje realtime:', err);
            }
        };

        this.socket.onclose = () => {
            console.warn('⚠️ Realtime desconectado. Reintentando...');
            setTimeout(() => this.init(), this.reconnectInterval);
        };

        this.socket.onerror = (err) => {
            console.error('❌ Error en WebSocket:', err);
        };
    },

    handleUpdate(payload) {
        const { table, action, data } = payload;
        console.log(`🔔 Cambio detectado: [${table}] ${action}`, data);

        // Reaccionar según la tabla
        switch (table) {
            case 'qa_executions':
                this.updateExecutions(data);
                break;
            case 'qa_test_runs':
                this.updateTestRuns(data);
                break;
            case 'qa_test_suites':
                // Por ahora forzamos reload de suites si cambia la suite (ej: nombre o active_run_id)
                this.triggerGlobalReload();
                break;
            case 'qa_defects':
                this.triggerGlobalReload();
                break;
        }
    },

    updateExecutions(execution) {
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
            this.triggerUIRefresh(); // Debounced notify
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
