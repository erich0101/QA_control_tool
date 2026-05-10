# Knowledge Base: Manual QA Tool

Este archivo centraliza el conocimiento arquitectónico y operativo del proyecto.

## 📌 Documentación de Referencia
- **[Índice del Proyecto](file:///c:/Users/Erich_Petrocelli/test-opencode/PROJECT_INDEX.md):** Mapa detallado de archivos, arquitectura y flujos.
- **[Reglas del Proyecto](file:///c:/Users/Erich_Petrocelli/test-opencode/RULES.md):** Estándares de codificación y compatibilidad obligatorios.

## 🛠 Puntos Clave de la Arquitectura
1. **Base de Datos:** Migrada a PostgreSQL (Supabase). No modificar `app_qa.db`.
2. **Frontend:** SPA centrada en `ui.html`. Se eliminaron estilos inline en favor de clases en `main.css`.
3. **Compatibilidad:** Es crítico mantener el prefijo `-webkit-user-select` para soporte en Safari/iOS.

## 🔄 Procedimientos Comunes
- **Nuevas Funcionalidades:** Verificar siempre el impacto en `db.js` si se requiere SQL nuevo (Postgres vs SQLite).
- **Reportes:** Se pueden generar vía Node.js (`/api/report/:id`) o Python (`qa_report_builder.py`).
