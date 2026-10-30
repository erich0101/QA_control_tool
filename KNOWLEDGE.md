# Knowledge Base: Manual QA Tool

Este archivo centraliza el conocimiento arquitectónico y operativo del proyecto.

## 📌 Documentación de Referencia
- **[Índice del Proyecto](file:///c:/Users/Erich_Petrocelli/test-opencode/PROJECT_INDEX.md):** Mapa detallado de archivos, arquitectura y flujos.
- **[Reglas del Proyecto](file:///c:/Users/Erich_Petrocelli/test-opencode/RULES.md):** Estándares de codificación y compatibilidad obligatorios.

## 🛠 Puntos Clave de la Arquitectura
1. **Base de Datos:** Migrada a PostgreSQL (Supabase). No modificar `app_qa.db`.
2. **Frontend:** SPA centrada en `ui.html`. Se eliminaron estilos inline en favor de clases en `main.css`.
3. **Compatibilidad:** Es crítico mantener el prefijo `-webkit-user-select` para soporte en Safari/iOS.
4. **Integridad `project_id`:** las tablas de hechos (`qa_test_cases`, `qa_test_runs`, `qa_executions`, `qa_defects`, `qa_attachments`, `qa_user_stories`) tienen trigger `qa_fill_project_id` que hereda el proyecto desde suite/run/ejecución/use_case si llega NULL. Nunca confiar solo en `project_id` en datos históricos legacy; las consultas nuevas deben resolver con `COALESCE(project_id, suite…)` o partir de datos ya backfilleados.

## 🔄 Procedimientos Comunes
- **Nuevas Funcionalidades:** Verificar siempre el impacto en `db.js` si se requiere SQL nuevo (Postgres vs SQLite).
- **Reportes:** Se pueden generar vía Node.js (`/api/report/:id`) o Python (`qa_report_builder.py`).
