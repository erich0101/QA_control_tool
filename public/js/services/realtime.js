import { Store } from '../store/state.js';
import { UI } from '../utils/ui-utils.js';
import { invalidateTabCache } from '../store/state.js';

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

        // Reaccionar según la tabla. Para 'execution' solo invalidamos cache
        // de tabs pesados (history/hallazgos) — el execution tab se parchea
        // in-place vía updateExecutions/updateDefects. Evitamos dispatch
        // 'realtime-refresh' para la tab activa cuando es 'execution' para
        // NO interrumpir al usuario que está editando.
        switch (table) {
            case 'qa_executions':
                this.updateExecutions(data);
                this.invalidateForTableSilent('history');
                break;
            case 'qa_defects':
                this.updateDefects(data);
                this.invalidateForTableSilent('history');
                this.invalidateForTableSilent('hallazgos');
                this.invalidateForTableSilent('mi-jira');
                break;
            case 'qa_test_runs':
                this.updateTestRuns(data);
                this.invalidateForTableSilent('history');
                this.invalidateForTableSilent('dashboard');
                this.invalidateForTableSilent('jira-tracking');
                break;
            case 'qa_test_suites':
                this.updateSuites(data);
                // Cambio estructural: sí necesitamos refrescar el execution tab
                this.invalidateForTable('test-suites');
                this.invalidateForTable('execution');
                break;
            case 'qa_test_cases':
                // Cambio estructural: refrescar
                this.invalidateForTable('test-suites');
                this.invalidateForTable('execution');
                break;
            case 'qa_attachments':
                // Adjuntos: no refrescar la execution tab (interrumpe edición).
                // Solo invalidar cache para el próximo render natural.
                this.invalidateForTableSilent('execution');
                this.invalidateForTableSilent('history');
                break;
            case 'qa_use_cases':
            case 'qa_user_stories':
                this.invalidateForTable('use-cases');
                this.invalidateForTable('test-suites');
                break;
            case 'qa_suggestions':
            case 'qa_hallazgos':
                this.invalidateForTable('hallazgos');
                break;
        }
    },

    invalidateForTable(tabKey) {
        const projId = Store.state.activeProjectId;
        invalidateTabCache(tabKey, projId);
        if (Store.state.activeTab === tabKey) {
            window.dispatchEvent(new CustomEvent('realtime-refresh', { detail: { tabKey } }));
        }
    },

    // Igual que invalidateForTable pero NO dispara el evento realtime-refresh
    // para la tab activa. Solo invalida el cache para que el próximo render
    // natural traiga data fresca. Usado cuando el cambio ya está parcheado
    // in-place y un re-render interrumpiría al usuario.
    invalidateForTableSilent(tabKey) {
        const projId = Store.state.activeProjectId;
        invalidateTabCache(tabKey, projId);
    },

    // Suprimir eventos cuyo origen es el propio usuario (echo del WS).
    // Cuando el usuario actualiza un bug/ejecución, el server broadcastea el
    // cambio a TODOS los clientes incluyendo al autor. Si comparamos con el
    // usuario actual podemos skipear el parche (el dato ya está correcto).
    isSelfEvent(payload) {
        const me = Store.state.user;
        if (!me) return false;
        const d = payload && payload.data;
        if (!d) return false;
        // qa_defects tiene created_by (int) e qa_executions tiene tester (string name)
        if (d.created_by && Number(d.created_by) === Number(me.id)) return true;
        if (d.updated_by && Number(d.updated_by) === Number(me.id)) return true;
        if (d.tester && me.name && d.tester === me.name) return true;
        return false;
    },

    updateExecutions(execution) {
        // Suprimir echo del propio usuario: el patch in-place que hicimos al
        // guardar ya está en memoria; refrescar de nuevo solo causa parpadeo.
        if (this.isSelfEvent({ data: execution })) {
            return;
        }
        const suites = Store.state.testSuites;
        let changed = false;

        if (Array.isArray(suites)) {
            for (const suite of suites) {
                for (const tc of (suite.test_cases || [])) {
                    if (tc.id === execution.tc_id) {
                        if (!tc.execution_id || tc.execution_id === execution.id || execution.id > tc.execution_id) {
                            tc.status = execution.status;
                            tc.execution_id = execution.id;
                            tc.observations = execution.observations;
                            tc.obtained_result = execution.obtained_result;
                            changed = true;
                        }
                    }
                }
            }
        }

        if (changed) {
            // NOTA: ya no llamamos triggerUIRefresh() porque eso causaba
            // re-render del tab activo (incluyendo el execution tab) y rompía
            // el foco del usuario que estaba editando un bug. El patch in-place
            // alcanza para que la UI muestre el nuevo status al re-renderizar
            // por otra razón (cambio de tab, click en un TC, etc.).
            console.log('✨ Sincronización de ejecución in-place');
        }
    },

    // Parchea in-place los defects del TC afectado en el cache de testSuites.
    updateDefects(defect) {
        if (!defect || !defect.execution_id) return;
        if (this.isSelfEvent({ data: defect })) {
            return; // echo del propio usuario; ya está en memoria
        }
        const suites = Store.state.testSuites;
        if (!Array.isArray(suites)) return;
        for (const suite of suites) {
            for (const tc of (suite.test_cases || [])) {
                if (tc.execution_id === defect.execution_id) {
                    if (!Array.isArray(tc.defects)) tc.defects = [];
                    const idx = tc.defects.findIndex(d => d.id === defect.id);
                    if (idx >= 0) {
                        tc.defects[idx] = { ...tc.defects[idx], ...defect };
                    } else {
                        tc.defects.push(defect);
                    }
                }
            }
        }
    },

    updateTestRuns(run) {
        // Cambio estructural: invalidar cache de los tabs que muestran runs.
        // El refresh del tab activo lo dispara invalidateForTable.
    },

    updateSuites(suite) {
        // Cambio estructural (suite editada o active_run_id cambiado).
        // El refresh del tab activo lo dispara invalidateForTable.
    },

    refreshTimeout: null,

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
        }, 400);
    }
};
