# Project Index: Manual QA Tool

Este documento sirve como mapa central para que los Agentes de IA comprendan la estructura, arquitectura y flujos de datos del proyecto sin necesidad de explorar todos los archivos manualmente.

## 🚀 Arquitectura General
El proyecto es una herramienta de QA manual y visual diseñada para gestionar casos de uso, capturas de pantalla (side-by-side) y reportes de ejecución.

- **Backend:** Node.js (Express) + PostgreSQL (Supabase).
- **Frontend:** Single Page Application (SPA) basada en `ui.html`, con estilos en `public/css/main.css`.
- **Database:** PostgreSQL (migrado desde SQLite). Capa de compatibilidad en `db.js`.
- **Automation:** Scripts en Python para importación de Excel y generación de reportes avanzados.

---

## 📁 Mapa de Archivos Clave

### 🛠 Core Backend
- [server.js](file:///c:/Users/Erich_Petrocelli/test-opencode/server.js): API central, gestión de rutas, lógica de ejecución de tests y evidencias.
- [db.js](file:///c:/Users/Erich_Petrocelli/test-opencode/db.js): Adaptador de base de datos. Traduce sintaxis de SQLite a Postgres y maneja el pool de conexiones.
- [report-generator.js](file:///c:/Users/Erich_Petrocelli/test-opencode/report-generator.js): Lógica para generar reportes HTML independientes.
- [jira-service.js](file:///c:/Users/Erich_Petrocelli/test-opencode/jira-service.js): Integración con Jira.

### 🎨 Frontend
- [ui.html](file:///c:/Users/Erich_Petrocelli/test-opencode/ui.html): Vista principal. Contiene la estructura de la app, modales y lógica JS del cliente.
- [public/css/main.css](file:///c:/Users/Erich_Petrocelli/test-opencode/public/css/main.css): Estilos globales, sistema de diseño y utilidades.

### 📊 Datos y Configuración
- [schema.sql](file:///c:/Users/Erich_Petrocelli/test-opencode/schema.sql): Definición de tablas.
- [.env](file:///c:/Users/Erich_Petrocelli/test-opencode/.env): Variables de entorno.
- [RULES.md](file:///c:/Users/Erich_Petrocelli/test-opencode/RULES.md): Reglas de codificación.
- [KNOWLEDGE.md](file:///c:/Users/Erich_Petrocelli/test-opencode/KNOWLEDGE.md): Documentación de conocimiento.

### 🐍 Python Scripts
- [qa_report_builder.py](file:///c:/Users/Erich_Petrocelli/test-opencode/qa_report_builder.py): Generador de reportes visuales complejos.
- [import_excel.py](file:///c:/Users/Erich_Petrocelli/test-opencode/import_excel.py): Importación masiva de casos desde Excel.

### ⚙️ Utilities & Scripts
- [scripts/](file:///c:/Users/Erich_Petrocelli/test-opencode/scripts/): Scripts utilitarios.
- [utils/](file:///c:/Users/Erich_Petrocelli/test-opencode/utils/): Utilidades de ayuda.
- [migrate_*.js](file:///c:/Users/Erich_Petrocelli/test-opencode/): Scripts de migración de datos.

---

## 🔌 API Endpoints Principales

| Ruta | Método | Descripción |
| :--- | :--- | :--- |
| `/api/projects` | GET | Lista todos los proyectos. |
| `/api/casos/:id` | GET | Obtiene un caso de uso específico. |
| `/api/test-suites` | POST | Crea una nueva suite de pruebas. |
| `/api/upload` | POST | Sube evidencias (imágenes/videos). |
| `/api/execution` | POST | Registra el resultado de una ejecución. |
| `/api/history` | GET | Historial de corridas. |

---

## 🔄 Flujos de Datos
1. **Selección de Caso:** El usuario elige un CU -> Se carga vía API -> Se renderiza en el Sidebar.
2. **Ejecución:** Se marcan estados (OK/FAIL) -> Se suben capturas -> Se guarda en DB en tiempo real.
3. **Reporte:** Al finalizar -> Se consulta DB -> `report-generator.js` o Python generan el HTML final.

---

## ⚠️ Notas para el Agente
- **Base de Datos:** Todo debe ir a la URL de Supabase en `.env`.
- **CSS:** NO usar estilos inline. Usar las utilidades al final de `main.css`.
- **Compatibilidad:** Siempre incluir `-webkit-user-select: none` si usas `user-select`.
- **Seguridad (XSS):** Es MANDATORIO usar `UI.escapeHTML()` para cualquier dato dinámico insertado en `innerHTML`.
