/**
 * ENGINE.JS - Lógica funcional pura.
 * Este archivo contiene funciones que procesan datos sin manipular el DOM.
 */

export const Engine = {
    /**
     * Procesa texto plano para generar objetos de prueba.
     * @param {string} text 
     * @returns {Array} Array de objetos de prueba/sección
     */
    parseBulkText(text) {
        if (!text) return [];
        const lines = text.split('\n');
        const results = [];

        lines.forEach(l => {
            const line = l.trim();
            if (!line) return;

            // Detectar si es una sección (ej: "1. Login")
            if (/^\d+\.\s/.test(line)) {
                results.push({
                    isSection: true,
                    title: line,
                    status: 'PENDING',
                    evType: 'SBS',
                    expanded: false,
                    sbs: [],
                    simple: []
                });
            } else {
                // Es un test individual
                const cleanTitle = line.replace(/^[-* 1-9.]+\s*/, '').trim();
                results.push({
                    title: cleanTitle,
                    status: 'PENDING',
                    isSection: false,
                    evType: 'SBS',
                    expanded: false,
                    sbs: [{ figma: { src: null, file: null, dataUrl: null }, dev: { src: null, file: null, dataUrl: null } }],
                    simple: [],
                    sqlList: []
                });
            }
        });
        return results;
    },

    /**
     * Calcula estadísticas de un conjunto de pruebas.
     * @param {Array} pruebas 
     * @returns {Object} { total, ok, fail, warn, pending, score }
     */
    calculateStats(pruebas) {
        let total = 0, ok = 0, fail = 0, warn = 0, pending = 0;

        pruebas.forEach(p => {
            const tList = p.test_list || p.test_list_v2 || [];
            if (tList.length > 0) {
                tList.forEach(t => {
                    if (t.isSection) return;
                    total++;
                    const st = (t.status || 'PENDING').toUpperCase();
                    if (st === 'OK') ok++;
                    else if (st === 'FAIL') fail++;
                    else if (st === 'WARNING') warn++;
                    else pending++;
                });
            } else {
                total++;
                const st = (p.status || 'PENDING').toUpperCase();
                if (st === 'OK') ok++;
                else if (st === 'FAIL') fail++;
                else if (st === 'WARNING') warn++;
                else pending++;
            }
        });

        const score = total ? (ok / total * 100) : 0;

        return { total, ok, fail, warn, pending, score };
    },

    /**
     * Genera el contenido del reporte detallado para Gemini.
     */
    formatGeminiReport(activeCU, data, stats) {
        let issuesList = [];

        if (data.pruebas) {
            data.pruebas.forEach(p => {
                const tList = p.test_list || p.test_list_v2 || [];
                let itemText = `### HU/Módulo: ${p.feature || 'Sin título'} (${p.modulo || 'General'})\n`;
                itemText += `Estado Global: ${(p.status || 'PENDING').toUpperCase()} | Severidad: ${p.severidad || 'Media'}`;

                if (tList.length > 0) {
                    itemText += `\nTests evaluados:`;
                    tList.forEach(t => {
                        if (t.isSection) {
                            itemText += `\n-- SECCIÓN: ${t.title} --`;
                            return;
                        }
                        const tSt = (t.status || 'PENDING').toUpperCase();
                        const tIcon = tSt === 'OK' ? '🟢' : (tSt === 'FAIL' ? '🔴' : (tSt === 'WARNING' ? '🟡' : '⏳'));
                        itemText += `\n  ${tIcon} [${tSt}] ${t.title || 'Prueba técnica'}`;
                    });
                }
                issuesList.push(itemText);
            });
        }

        return `REPORTE DE QA DETALLADO PARA GEMINI
Caso de Uso: ${data.caso_de_uso || activeCU}
Módulo: ${activeCU}

📊 ESTADÍSTICAS POR TESTS INDIVIDUALES:
- Total Tests: ${stats.total}
- 🟢 Aprobados (OK): ${stats.ok}
- 🔴 Fallidos (FAIL): ${stats.fail}
- 🟡 Advertencias (WARNING): ${stats.warn}
- ⏳ Pendientes (PENDING): ${stats.pending}
- Score de Calidad: ${stats.score.toFixed(1)}%

📋 DESGLOSE DETALLADO DE PRUEBAS:
${issuesList.length > 0 ? issuesList.join('\n\n') : 'Sin registros.'}

---
CONTEXTO PARA GEMINI:
Analiza los resultados de cada prueba individual listada arriba. Elabora una conclusión QA global profesional que destaque los puntos críticos, los criterios de aceptación cumplidos y los riesgos detectados. Proporciona una lectura ejecutiva sobre la calidad del software en este Módulo.`;
    }
};
