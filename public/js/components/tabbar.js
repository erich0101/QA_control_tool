import { Store } from '../store/state.js';

/**
 * TABBAR.JS - Barra de pestañas estilo JIRA.
 */

const TABS = [
    { id: 'use-cases', icon: '📋', label: 'Casos de Uso' },
    { id: 'test-suites', icon: '🧪', label: 'Test Suites' },
    { id: 'execution', icon: '⚡', label: 'Ejecución' },
    { id: 'history', icon: '🕒', label: 'Historial' },
    { id: 'jira-tracking', icon: '🎯', label: 'Seguimiento Jira' },
    { id: 'dashboard', icon: '📊', label: 'Dashboard' }
];

const ADMIN_TABS = [
    ...TABS,
    { id: 'team', icon: '👥', label: 'Gestión de Equipo' }
];

export const TabBar = {
    render(container) {
        const { activeTab, useCases, testSuites } = Store.state;

        const getCounts = (tabId) => {
            if (tabId === 'use-cases') return useCases.length;
            if (tabId === 'test-suites') return testSuites.length;
            return 0;
        };

        const activeTabs = (Store.state.user?.role === 'Admin' || Store.state.user?.role === 'Analista QA') ? ADMIN_TABS : TABS;

        container.innerHTML = activeTabs.map(tab => `
            <div class="tab-item ${activeTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">
                <span>${tab.icon}</span>
                <span>${tab.label}</span>
                ${getCounts(tab.id) > 0 ? `<span class="tab-badge">${getCounts(tab.id)}</span>` : ''}
            </div>
        `).join('');

        this.bindEvents(container);
    },

    bindEvents(container) {
        container.querySelectorAll('.tab-item').forEach(item => {
            item.addEventListener('click', () => {
                const tab = item.dataset.tab;
                if (tab !== Store.state.activeTab) {
                    Store.setActiveTab(tab);
                }
            });
        });
    }
};
