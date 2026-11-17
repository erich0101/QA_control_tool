# Project Rules: CSS Compatibility

## 1. Safari/iOS Support
- **Property:** `user-select`
- **Rule:** Always prefix `user-select: none;` with `-webkit-user-select: none;`.
- **Reason:** Safari and Safari on iOS do not support the standard property without the prefix.

```css
/* Correct Usage */
.element {
    -webkit-user-select: none;
    user-select: none;
}
```

## 2. Accessible Form Elements
- **Rule:** All <select>, <input>, and <textarea> elements MUST have an accessible name.
- **Implementation:** Use a corresponding <label> with for attribute, or an aria-label / title attribute.
- **Reason:** Ensuring the application is usable by everyone, including those using screen readers.

## 3. Separation of Concerns (CSS)
- **Rule:** Avoid inline style=... attributes for layout and decoration.
- **Implementation:** Use classes defined in public/css/main.css. Dynamic visibility (e.g., display: none) is acceptable if managed via JS.
- **Reason:** Improves maintainability and allows for easier global design changes.

## 4. XSS Prevention (Frontend Security)
- **Rule:** NEVER inject variable content directly into `innerHTML` or as attribute values without escaping.
- **Implementation:** Always wrap dynamic strings in `UI.escapeHTML(variable)` from `public/js/utils/ui-utils.js`.
- **Reason:** Prevents Cross-Site Scripting (XSS) attacks when rendering user-provided or database-sourced data.

```javascript
/* Correct Usage */
container.innerHTML = `<div>${UI.escapeHTML(userTitle)}</div>`;
```


## 5. Jira: AGIP es solo lectura para pruebas (CRÍTICO)

- **Regla:** El proyecto Jira **AGIP** y **cualquiera de sus épicas** no se usan
  NUNCA para probar, validar o verificar creación de tickets, ni para ningún
  otro efecto de escritura disparado por una prueba del agente.
- **Prohibido en AGIP:** crear issues, `validateOnly=true` (también crea el
  ticket), editar, comentar, transicionar o borrar issues como prueba.
- **Permitido en AGIP:** consultas de solo lectura (GET, JQL, metadatos) y
  operaciones reales pedidas explícitamente por el usuario con datos reales.
- **Dónde probar escrituras:** únicamente en el proyecto local **`Default`**
  (`project_id=2`, `/api/use-cases?project_id=2`), que hoy usa el espacio Jira
  **SCRUM**. Si ese proyecto no tiene Jira activo, **no se prueba**: el agente
  entrega el cambio y el usuario confirma si resuelve el problema.
- **Proyectos de cliente:** AGIP (`project_id=3` y `5`) y AFA (`project_id=8`)
  son solo lectura para pruebas. Nunca crear, editar, comentar, transicionar ni
  usar `validateOnly` en ellos.
- **Verificación sin escribir:** inspeccionar el payload (stub de `fetch`,
  request interceptado, logs) y validar el formato contra el `createmeta`
  (los campos `option`/`select` exigen `{ id }`, no un string).
- **Reason:** un ticket de prueba en AGIP contamina el backlog real del
  cliente, dispara notificaciones y no se puede borrar sin permisos especiales.

Ver `AGENTS.md` para el checklist previo a cualquier escritura en Jira.
