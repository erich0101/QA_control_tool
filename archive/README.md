# Archivos archivados

Estos archivos son **legacy** y NO deben importarse desde el código nuevo. Se conservan solo como referencia histórica.

- `server.monolith.bak.js` — `server.js` antes del refactor modular (3387 líneas, 80+ endpoints en un solo archivo).

## Nota sobre `db.js` y `utils/crypto-utils.js`

`db.js` (adaptador SQLite) y `utils/crypto-utils.js` (cifrado AES-256-CBC) **siguen en sus ubicaciones originales** porque los módulos legacy `report-generator.js` y `jira-service.js` (ambos marcados como no modificables en esta fase) los importan directamente con `require('./db')` y `require('./utils/crypto-utils')`.

- `db.js` fue reemplazado en runtime por `src/config/db.js` (PostgreSQL nativo). El adaptador SQLite legacy ya no se usa desde el código refactorizado, pero debe quedarse en raíz hasta que `report-generator.js` se migre a `src/services/reports.service.js`.
- `utils/crypto-utils.js` fue reemplazado por `src/services/crypto.service.js` (AES-256-GCM), pero `jira-service.js` sigue requiriendo la versión legacy. Debe quedarse en `utils/` hasta que `jira-service.js` se migre a `src/services/jira.service.js`.

Cuando ambos legacy modules se hayan refactorizado, los archivos originales se podrán mover a `archive/db.sqlite-legacy.js` y `archive/crypto-utils.aes-cbc.js` sin más.
