const express = require('express');
const XLSX = require('xlsx');
const { query } = require('../../db');
const { requireAuth } = require('../middleware/auth');
const { upload } = require('../lib/upload');
const { sanitizeInput } = require('../lib/helpers');
const { generateKey } = require('../lib/sequences');
const { processFlatImport, processDualImport } = require('../lib/import-processors');

const router = express.Router();

router.post(['/test-suites/:id/import-dual', '/use-cases/:id/import-dual'], requireAuth, upload.single('xlsx'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ error: 'Archivo no recibido' });

        let workbook;
        try {
            workbook = XLSX.read(file.buffer, { type: 'buffer' });
        } catch (e) {
            const content = file.buffer.toString('utf-8');
            workbook = XLSX.read(content, { type: 'string' });
        }

        const normalize = (str) => {
            if (!str) return '';
            return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        };

        const tryFindColIndex = (headers, keywords) => {
            if (!headers || headers.length === 0) return -1;
            for (let i = 0; i < headers.length; i++) {
                const nh = normalize(headers[i]);
                if (keywords.every(k => nh.includes(k))) return i;
            }
            return -1;
        };

        // Detectar formato: hoja plana (unificada) vs dual (2 hojas)
        const isCSV = file.originalname.toLowerCase().endsWith('.csv');
        let isFlatFormat = false;
        let dataFlat = null;
        let headersFlat = null;

        if (!isCSV && workbook.SheetNames.length === 1) {
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            if (data.length > 0) {
                const headers = data[0].map(h => normalize(h));
                const hasCU = headers.some(h => h.includes('cu') && h.includes('vinculad'));
                const hasHU = headers.some(h => h.includes('hu') || h.includes('requerimiento'));
                const hasEscenario = headers.some(h => h.includes('escenario'));
                const hasPasos = headers.some(h => h.includes('paso'));
                if (hasCU && hasHU && hasEscenario && hasPasos) {
                    isFlatFormat = true;
                    dataFlat = data;
                    headersFlat = data[0].map(h => String(h || '').trim());
                }
            }
        }

        // Obtener contexto del UC
        let ucId = req.params.id;
        const isUseCasePath = req.url.includes('/use-cases/');

        if (!isUseCasePath) {
            const sRes = await query(`SELECT use_case_id FROM qa_test_suites WHERE id = ?`, [ucId]);
            if (sRes.rows.length > 0) ucId = sRes.rows[0].use_case_id;
            else return res.status(404).json({ error: 'Suite no encontrada' });
        }

        const ucRes = await query(`SELECT project_id FROM qa_use_cases WHERE id = ?`, [ucId]);
        if (ucRes.rows.length === 0) return res.status(404).json({ error: 'Caso de Uso no encontrado' });
        const projectId = ucRes.rows[0].project_id;

        if (isFlatFormat) {
            // FORMATO UNIFICADO (hoja plana)
            return await processFlatImport(req, res, dataFlat, headersFlat, ucId, projectId, normalize, tryFindColIndex, sanitizeInput, generateKey, query);
        }

        // FORMATO DUAL (2 hojas) - compatibilidad hacia atras
        return await processDualImport(req, res, workbook, isCSV, ucId, projectId, normalize, tryFindColIndex, sanitizeInput, generateKey, query);
    } catch (err) {
        console.error('Error crítico en importación:', err);
        res.status(500).json({
            error: 'Error al procesar el archivo.',
            detalle: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// Exportar Matriz de Pruebas Completa (Todas las suites del CU) a Excel unificado
router.get('/use-cases/:id/export-excel', requireAuth, async (req, res) => {
    try {
        const useCaseId = req.params.id;

        // 1. Obtener datos del Caso de Uso y Proyecto
        const ucRes = await query(`
            SELECT uc.*, p.name as project_name
            FROM qa_use_cases uc
            JOIN qa_projects p ON uc.project_id = p.id
            WHERE uc.id = ?
        `, [useCaseId]);

        if (ucRes.rows.length === 0) return res.status(404).json({ error: 'Caso de Uso no encontrado' });
        const useCase = ucRes.rows[0];

        // 2. Obtener Test Cases de TODAS las suites de este CU y sus ejecuciones más recientes
        const casesRes = await query(`
            SELECT tc.*, us.title as us_title, us.key_id as us_key, s.title as suite_title,
                   uc.title as uc_title,
                   e.status as last_status, e.observations, e.obtained_result, e.tester, e.executed_at
            FROM qa_test_cases tc
            JOIN qa_test_suites s ON tc.suite_id = s.id
            LEFT JOIN qa_user_stories us ON tc.us_id = us.id
            LEFT JOIN qa_use_cases uc ON s.use_case_id = uc.id
            LEFT JOIN LATERAL (
                SELECT status, observations, obtained_result, tester, executed_at
                FROM qa_executions
                WHERE tc_id = tc.id
                ORDER BY executed_at DESC
                LIMIT 1
            ) e ON true
            WHERE s.use_case_id = ?
            ORDER BY s.id, us.id, tc.id
        `, [useCaseId]);

        // 3. Construir workbook con SheetJS (compatible con import)
        const wb = XLSX.utils.book_new();

        // Encabezados unificados
        const headers = [
            'CU Vinculado',
            'Suite / Grupo',
            'ID Test',
            'HU / Requerimiento',
            'Escenario / Título',
            'Precondiciones',
            'Pasos de Reproducción',
            'Datos de Prueba',
            'Resultado Esperado',
            'Criterios Aceptación',
            'Assumptions',
            'Estado',
            'Resultado Obtenido',
            'Observaciones / Hallazgos',
            'Tester',
            'Fecha Ejecución'
        ];

        // Construir array de datos
        const data = [headers];
        casesRes.rows.forEach((tc) => {
            data.push([
                tc.uc_title || useCase.title || '',
                tc.suite_title || '',
                tc.key_id || `TC-${tc.id}`,
                tc.us_title ? `[${tc.us_key || 'N/A'}] ${tc.us_title}` : 'Sin HU vinculada',
                tc.title || '',
                tc.preconditions || '',
                tc.steps || tc.description || '',
                tc.test_data || '',
                tc.expected_result || '',
                tc.acceptance_criteria || '',
                tc.assumptions || '',
                tc.last_status || 'PENDIENTE',
                tc.obtained_result || '',
                tc.observations || '',
                tc.tester || '',
                tc.executed_at ? new Date(tc.executed_at).toLocaleString() : '-'
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(data);

        // Ajustar ancho de columnas
        ws['!cols'] = [
            { wch: 30 }, // CU Vinculado
            { wch: 25 }, // Suite / Grupo
            { wch: 15 }, // ID Test
            { wch: 35 }, // HU / Requerimiento
            { wch: 45 }, // Escenario / Título
            { wch: 40 }, // Precondiciones
            { wch: 55 }, // Pasos de Reproducción
            { wch: 40 }, // Datos de Prueba
            { wch: 45 }, // Resultado Esperado
            { wch: 40 }, // Criterios Aceptación
            { wch: 40 }, // Assumptions
            { wch: 15 }, // Estado
            { wch: 45 }, // Resultado Obtenido
            { wch: 45 }, // Observaciones / Hallazgos
            { wch: 15 }, // Tester
            { wch: 22 }  // Fecha Ejecución
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Matriz de Pruebas');

        // Generar buffer xlsx
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Matriz_${useCase.key_id || 'CU'}_${new Date().toISOString().split('T')[0]}.xlsx"`);
        res.send(buf);

    } catch (err) {
        console.error('❌ Error en exportación Excel:', err);
        res.status(500).json({ error: 'Error interno al generar el reporte Excel.', detalle: err.message });
    }
});


// Exportar Matriz de Pruebas de TODO el Proyecto (todos los CU) a Excel unificado
router.get('/projects/:id/export-excel', requireAuth, async (req, res) => {
    try {
        const projectId = req.params.id;

        // 1. Obtener datos del Proyecto
        const projRes = await query(`SELECT * FROM qa_projects WHERE id = ?`, [projectId]);
        if (projRes.rows.length === 0) return res.status(404).json({ error: 'Proyecto no encontrado' });
        const project = projRes.rows[0];

        // 2. Obtener TODOS los Test Cases de TODOS los CU del proyecto
        const casesRes = await query(`
            SELECT tc.*, us.title as us_title, us.key_id as us_key, s.title as suite_title,
                   uc.title as uc_title, uc.key_id as uc_key,
                   e.status as last_status, e.observations, e.obtained_result, e.tester, e.executed_at
            FROM qa_test_cases tc
            JOIN qa_test_suites s ON tc.suite_id = s.id
            JOIN qa_use_cases uc ON s.use_case_id = uc.id
            LEFT JOIN qa_user_stories us ON tc.us_id = us.id
            LEFT JOIN LATERAL (
                SELECT status, observations, obtained_result, tester, executed_at
                FROM qa_executions
                WHERE tc_id = tc.id
                ORDER BY executed_at DESC
                LIMIT 1
            ) e ON true
            WHERE uc.project_id = ?
            ORDER BY uc.id, s.id, us.id, tc.id
        `, [projectId]);

        // 3. Construir workbook con SheetJS
        const wb = XLSX.utils.book_new();

        const headers = [
            'CU Vinculado',
            'Suite / Grupo',
            'ID Test',
            'HU / Requerimiento',
            'Escenario / Título',
            'Precondiciones',
            'Pasos de Reproducción',
            'Datos de Prueba',
            'Resultado Esperado',
            'Criterios Aceptación',
            'Assumptions',
            'Estado',
            'Resultado Obtenido',
            'Observaciones / Hallazgos',
            'Tester',
            'Fecha Ejecución'
        ];

        const data = [headers];
        casesRes.rows.forEach((tc) => {
            data.push([
                tc.uc_title || '',
                tc.suite_title || '',
                tc.key_id || `TC-${tc.id}`,
                tc.us_title ? `[${tc.us_key || 'N/A'}] ${tc.us_title}` : 'Sin HU vinculada',
                tc.title || '',
                tc.preconditions || '',
                tc.steps || tc.description || '',
                tc.test_data || '',
                tc.expected_result || '',
                tc.acceptance_criteria || '',
                tc.assumptions || '',
                tc.last_status || 'PENDIENTE',
                tc.obtained_result || '',
                tc.observations || '',
                tc.tester || '',
                tc.executed_at ? new Date(tc.executed_at).toLocaleString() : '-'
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(data);

        ws['!cols'] = [
            { wch: 30 },
            { wch: 25 },
            { wch: 15 },
            { wch: 35 },
            { wch: 45 },
            { wch: 40 },
            { wch: 55 },
            { wch: 40 },
            { wch: 45 },
            { wch: 40 },
            { wch: 40 },
            { wch: 15 },
            { wch: 45 },
            { wch: 45 },
            { wch: 15 },
            { wch: 22 }
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Matriz de Pruebas');

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Matriz_Proyecto_${project.key_id || project.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx"`);
        res.send(buf);

    } catch (err) {
        console.error('❌ Error en exportación de proyecto:', err);
        res.status(500).json({ error: 'Error interno al generar el reporte del proyecto.', detalle: err.message });
    }
});

module.exports = router;
