# Refactor UI — plan de migración (strangler)

Rama: `refactor_UI`
Stack: React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui (Radix) + TanStack Query + Zustand + React Router 7.

## Estrategia

La UI legacy (`public/index.html` + `public/js/**`) **no se toca**. La nueva app se
construye en `frontend/` y se monta en `/app`. Cada tab se migra de a uno; cuando
todos estén migrados, `/` pasa a servir la nueva UI y se borra la legacy.

```
/        -> UI legacy (intacta)
/app     -> UI nueva (React)
```

## Equivalencias con el código viejo

| Legacy | Nueva UI | Estado |
|---|---|---|
| `public/js/store/state.js` (227 líneas) | `stores/session.ts` + `stores/ui.ts` + TanStack Query | ✅ |
| `public/js/services/api.js` (439 líneas, sin tipos) | `lib/api/*` (un módulo por recurso, tipado) | ✅ base |
| `public/js/components/tabbar.js` (TABS hardcodeado) | `lib/navigation.ts` (fuente única) | ✅ |
| `public/js/components/topbar.js` | `components/layout/topbar.tsx` | ✅ |
| Login inline en `app.js` | `features/auth/login-page.tsx` | ✅ |
| `Modals.render('new-project' / 'prompt')` | `features/projects/project-dialog.tsx` | ✅ |
| `public/js/components/user-stories.js` (723 líneas) | `features/use-cases/*` | ✅ |
| `modalManager.confirm` / `Modals.render('alert')` | `components/ui/confirm-provider.tsx` | ✅ |
| `test-suites-tab.js` (1.982 líneas) | `features/test-suites/*` | ✅ (núcleo) |
| `test-suites-tab.js` → Gemini (679 líneas) | `features/test-suites/ai/*` | ⏳ pendiente |
| `test-suites-tab.js` → Importar XLSX | — | ⏳ pendiente |
| `execution-tab.js` (1.037) + `sbs.js` | `features/execution/*` | ✅ (sin voz/reporte) |
| `execution-tab.js` → VoiceInput | — | ⏳ pendiente |
| `execution-tab.js` → Reporte personalizado del tester | — | ⏳ pendiente |
| `history-tab.js` (1.153) | `features/history/*` | ✅ (sin batch Jira) |
| `history-tab.js` → reporte consolidado / tester report | — | ⏳ pendiente |
| `history-tab.js` → batch Jira tickets | — | ⏳ pendiente |
| `jira-tracking-tab.js` (397) | `features/jira-tracking/*` | ✅ |
| `dashboard-*.js` (1.160) | `features/dashboard/*` | ✅ |
| `dashboard-epic-report.js` (547) → Reporte cliente | `features/dashboard/components/epic-report-tab.tsx` | ✅ |
| `hallazgos-tab.js` (1.538) | `features/hallazgos/*` | ✅ (sin Jira/promote) |
| `hallazgos-tab.js` → crear ticket Jira / promover a bug | — | ⏳ pendiente |
| `exploratoria-tab.js` (1.778) | `features/exploratoria/*` | ✅ (sin import/voz) |
| `exploratoria-tab.js` → importar flujos Excel | — | ⏳ pendiente |
| `mi-jira-tab.js` (328) | `features/mi-jira/*` | ✅ |
| `team-tab.js` (245) | `features/team/*` | ✅ |
| `tools-tab.js` (2.222) | `features/tools/*` | ✅ |
| `tools-tab.js` → Token Decoder (628) | `features/tools/components/token-decoder-tool.tsx` | ✅ |
| `tools-tab.js` → Request Builder (696) | `features/tools/components/request-builder-tool.tsx` | ✅ |
| `modals.js` (2.157) | `components/dialogs/*` (uno por caso de uso) | ⏳ |
| `main.css` (3.591) + `macos-components.css` | Tailwind + tokens Apple | ✅ base |

## Deuda a resolver en la migración

1. **Modales genéricos** (`Modals.render('alert' | 'prompt' | …)`) → diálogos
   tipados por caso de uso. El `prompt` de texto se vuelve un form reutilizable.
2. **Duplicación de fetch**: `api.js` repite `fetch(...).then(json)` 60 veces →
   un helper tipado (`apiFetch<T>`).
3. **`window.Modals`, `window.ApiService`** (acoplamiento global) → imports.
4. **`innerHTML` con escape manual** → JSX (escape automático).
5. **Estado en `localStorage` esparcido** → stores persistidos explícitos.
6. **Tabs con lógica de negocio** (2k líneas por tab) → separar hooks de datos
   (`use-*.ts`), componentes de presentación y diálogos.
7. **CSS inline** en el HTML → utilidades Tailwind.

## Convenciones para las próximas sesiones

- Un tab = una carpeta en `features/` con:
  - `use-<recurso>.ts` (queries y mutations),
  - `<tab>-page.tsx` (composición),
  - `components/` locales si algo no se reutiliza fuera.
- Si un componente se usa en 2+ tabs → sube a `components/ui` o `components/<dominio>`.
- Los placeholders actuales (`pages/placeholder-page.tsx`) se reemplazan tab por tab
  en `app.tsx` sin tocar el resto.
- Al terminar un tab: `npm run ui:typecheck` y `npm run ui:build`.

## Patrones establecidos en el tab Casos de Uso

Sirven de plantilla para los tabs que siguen:

1. **Selección en la URL**, no en un store: `/use-cases?cu=1&hu=11`.
   Ver `features/use-cases/lib/params.ts`. Deep links y botón atrás funcionan.
2. **Master-detail**: sidebar (`user-story-list`) + detalle (`user-story-detail`).
   El detalle se monta con `key={story.id}` para resetear el formulario por HU.
3. **Guardado por diff**: `buildStoryPatch(values, dirtyFields)` manda solo los
   campos modificados. Nunca reenviar el objeto completo scrapeado del DOM.
4. **Formularios** con `react-hook-form`; los `Select` de Radix van con
   `Controller` + `SelectField`.
5. **Confirmaciones** con `useConfirm()` (un único diálogo en toda la app).
6. **Escrituras** siempre por hooks de mutación que invalidan las query keys
   afectadas (lista de HUs + contadores de CU).
7. **Code splitting**: la página es `lazy()` y el render de Markdown se carga
   aparte (`documentation-tab`, ~50 kB gzip) solo al abrir esa pestaña.
8. **Permisos** desde el store de sesión: `canManage()` (Admin / Analista QA)
   y `can('can_create_hu')` para el resto.

## Test Suites — qué se migró y qué no

Migrado: sidebar con filtro por CU y búsqueda, suite (crear/editar/eliminar),
toggle activa/fuera del gap, épica Jira, panel de inconsistencias
(expandible, alta y resolución), grid de test cases con detalle expandible
(Pasos / Esperado / Metadata), edición por diff, asignación masiva y por test,
mover TC entre suites, ejecutar suite o TC individual.

Pendiente (deliberadamente fuera de alcance):
- **AI Tool** (Gemini): 679 líneas con análisis de HU, generación de TCs,
  deduplicación por similitud y modal de revisión. Hoy muestra un acceso a la
  UI legacy.
- **Importación XLSX** de suites/tests (`import-dual`).

### Gotcha de React Hook Form (importante)

`formState.dirtyFields` **solo se computa si se lee durante el render**.
Leerlo únicamente dentro del handler de submit devuelve `{}` y el guardado por
diff no envía nada. Patrón correcto:

```tsx
const { isDirty, dirtyFields } = formState; // lectura en render
...
if (!isDirty) return;                      // el handler usa dirtyFields
```

Además, el botón Guardar debe deshabilitarse con `!isDirty`.

## Ejecución — alcance y decisiones

Migrado: árbol de ciclos activos, cronómetro por ciclo (acumulado + delta
desde `last_resume_at`), progreso, pausar/reanudar/finalizar, "Ejecutar CU"
(regresión, solo asignados), filtro por caso de uso y por estado, sincronizar,
detalle de test con pasos/esperado, evidencias (click, drag&drop y Ctrl+V),
resultado real, justificación obligatoria de BLOCK/SKIP y borradores de bugs
para FAIL (se envían en el mismo PUT como `bugs[]`).

Decisiones que difieren del legacy a propósito:
- **Se eliminó el botón "Ejecutar" por test** dentro del modo Ejecución. El
  backend rechaza `start-execution` de un TC si la suite ya tiene ciclo activo
  (`La suite ya tiene un ciclo activo`), y este tab solo lista suites con ciclo
  activo: ese botón fallaba siempre. Se ejecuta eligiendo el resultado.
- **Se permite corregir un resultado ya registrado** (el legacy bloqueaba los
  botones). El backend lo soporta; se avisa con un texto "podés corregirlo".
- No se migraron el dictado por voz (`VoiceInput`) ni el reporte personalizado
  del tester: siguen en la UI legacy.

## Historial — alcance

Migrado: sub-tabs Ejecuciones / Bugs, filtro por rango de fechas, árbol
colapsable año › mes › día (componente `GroupHeader` compartido por ambas
vistas), fila de ciclo con barra de stats y acciones (ver reporte, ver defectos,
retest), paginación server-side de ciclos, y bugs con severidad, link/estado de
Jira, descarte/reapertura y detalle técnico expandible.

Detalle encontrado: el backend devuelve `stats.skipped`, pero el legacy leía
`stats.skip` → la barra de SKIP quedaba en `NaN` y no se pintaba. En la versión
React se usa `skipped`.

Pendiente respecto del legacy: reporte consolidado multi-ciclo, creación masiva
de tickets en Jira desde la vista de bugs, reporte personalizado del tester y
la integración Jira dentro del detalle del defecto.

## Hallazgos — alcance

Migrado: sub-tabs Bugs / Sugerencias, búsqueda y filtros (estado + severidad o
categoría), alta y edición inline con guardado por diff, cambio rápido de estado
en el header, evidencias por hallazgo/sugerencia (alta con categoría y borrado),
eliminación con confirmación y **conversión de hallazgo a test case** eligiendo
la suite destino.

Selección en la URL: `/hallazgos?t=bug|suggestion&id=12` (y `new=1` para el alta).
Editar y crear comparten los mismos campos (`HallazgoFields` / `SuggestionFields`)
para que no haya dos maquetas que se desincronicen.

Pendiente: crear ticket en Jira desde el hallazgo, promover hallazgo a bug
(requiere `execution_id`), vincular el TC de origen (`PUT /api/hallazgos/:id/tc`),
reportes (Mi Reporte de QA / Reporte de Hallazgos) y dictado por voz.

## Exploratoria — alcance

Migrado: listado de sesiones con sub-tabs Activas / Finalizadas, búsqueda, alta
de sesión (nombre, charter, timebox), detalle con cabecera + barra de métricas
calculada desde las ejecuciones, tabla de flujos expandible y guardado por flujo:
status (OK/FAIL/WARN/BLOCK/SKIP), justificación obligatoria en BLOCK/SKIP,
resultado obtenido, reporte de defecto (solo FAIL/WARNING) y evidencias con
carga diferida (se suben contra el `execution_id` recién creado al guardar).
También: finalizar sesión, reporte de bugs en pestaña nueva y alta de flujos.

Decisiones:
- El guardado es **por flujo** con estado local, no un `flowDrafts` global con
  botón "guardar todo": menos estado compartido y menos formas de perder cambios.
- Las evidencias pendientes viven en memoria hasta que existe `execution_id`;
  luego se suben y se limpia la cola, igual que el comportamiento legacy.
- Se quitó el botón "Ejecutar" individual (no aplica acá) y el timer de sesión
  del legacy no se replicó: la barra muestra progreso y conteos.

Pendiente: importación de flujos desde Excel, dictado por voz, "Mi Reporte de QA"
y la conversión de un defecto de flujo a test case.

## Equipo — alcance

Migrado: grilla de usuarios con avatar, badges de perfil/rol, chips de proyectos
y los 11 permisos por usuario (los admin muestran "Todos"); búsqueda por
nombre/email/rol; alta y edición en un único diálogo con contraseña opcional al
editar, permisos agrupados (Crear / Asignar / Gestión) y selección de proyectos.

Los permisos se definen una sola vez en `features/team/lib/permissions.ts`
(`PERMISSION_GROUPS`) y de ahí salen tanto las tarjetas como los checkboxes del
formulario: no hay dos listas de permisos que puedan desincronizarse.

`useTeam` se movió a `features/team/use-team.ts` y se reexporta desde
`features/test-suites/use-test-suites` para no tocar los imports existentes.
La ruta ya estaba protegida por `RequireAdmin`.

## Mi JIRA — alcance

Migrado: filtros Asignados / Creados / Menciones, tabla con clave, tipo,
resumen y estado, contador con pluralización, refresco manual y panel de detalle
con reporter/asignado/fechas, épica, comentarios ordenados desc con las
menciones resaltadas, y acciones "Abrir en Jira" / "Copiar clave".

El dominio de Jira se centraliza en `lib/api/jira.ts`
(`JIRA_BASE_URL`, sobreescribible con `VITE_JIRA_BASE_URL`). En el legacy la URL
estaba hardcodeada en el HTML del detalle, así que cualquier cambio de dominio
implicaba tocar la vista.

Si el usuario no tiene token configurado el backend responde 403 con el motivo:
la vista lo muestra como estado vacío con ese mensaje en vez de una lista vacía.

## Seguimiento Jira — alcance

Migrado: tabla agrupada por épica (colapsable, con contador por grupo), columnas
asignado con avatar, fecha de creación, estado en Jira y acción "Ver detalle";
drawer lateral con épica, asignado, prioridad, link a Jira, hilo de comentarios
(ADF → texto) con botón "Responder" que pre-carga la mención, y envío de
comentarios nuevos a Jira.

El parser de ADF vive en `features/jira-tracking/lib/adf.ts` y agrega los saltos
de línea entre párrafos, que el legacy perdía al concatenar nodos de texto.

La mención solo se envía como `mentionId` si el texto sigue empiezándose por
`@[Nombre]`; si el usuario la borra, se manda el comentario sin mención.

Pendiente: adjuntar archivos a comentarios y editar/borrar comentarios.

## Dashboard — alcance

Migrado (4 de 5 sub-tabs):
- **Vista general**: KPIs (CU, TC, cobertura OK, riesgo), desglose por estado con
  índice de salud e cobertura por caso de uso.
- **Control & Tiempos**: rango de fechas, totales de ejecuciones/tiempo/promedio
  y árbol año › mes › día con agregado por suite (corridas, promedio y total).
- **Jira & Daily**: lead time, abiertos, cerrados hoy, antigüedad crítica, carga
  por responsable, tabla "foco de la daily" y distribución por severidad/épica.
- **Productividad**: leaderboard por tester con resueltos, ciclo medio, aging y
  ratio de finalización.

Pendiente: **Reporte cliente** (generador por épica con selección de fechas y
exportación, 547 líneas). La sub-tab existe y muestra el acceso a la UI legacy.

Mejoras: el desglose de estados ahora muestra también BLOCK y SKIPPED (el legacy
los ignoraba) y las barras se calculan con el total real de tests activos.

### Reporte cliente (épica)

Migrado: filtros épica + rango de fechas con botón "Generar" (las fechas no
disparan queries al tipear), insights automáticos, gauge de salud, riesgo de
entrega, KPIs (total, % resueltos, variación de pendientes, abiertos), métricas
del testing local (casos, pass rate, densidad de defectos, ciclos, tiempo),
desglose por estado y prioridad, tendencia semanal creados vs. resueltos con
backlog, antigüedad por bucket, edad promedio por estado y cumplimiento de SLA.

La exportación se hace con **"Exportar PDF"** vía `window.print()` + estilos
`print:` (topbar, tabbar y filtros se ocultan al imprimir). El legacy usaba
html2canvas; se evitó agregar una dependencia de ~200 kB para lo mismo.

## Tools — Slice A (Base64 + CUIT)

Tools se migra en 3 cortes porque son 4 herramientas independientes:

- **A (hecho)**: shell con sidebar + `TOOLS` como registro único, **Base64**
  (texto y archivos hasta 10 MB, URL-safe, descarga de binario) y **CUIT
  Generator** (módulo 11, prefijos 20/24/27/30/34, copiar/CSV).
- **B (hecho)**: **Token Decoder** — detecta JWT / hash (MD5, SHA-1, SHA-256,
  SHA-512) / UUID / Base64 legible / hex / opaco; parsea header y payload con
  JSON coloreado, tabla de claims con descripción y estado (vigente/vencido/no
  válido aún), entropía de Shannon + composición de caracteres y **verificación
  de firma HS256/384/512** con Web Crypto. Incluye token de ejemplo firmado.
- **C (hecho)**: **Request Builder** — método + URL, query params y headers
  editables, body JSON / form-data (con archivos) / URL-encoded / raw / binary,
  importación de cURL, ejecución vía `POST /api/tools/request-builder/exec`,
  visor de respuesta con headers, JSON coloreado, descarga de binarios y copia
  como body/URL/meta/cURL/todo.

**Bug corregido respecto del legacy**: el legacy tenía la sección "Query Params"
pero **nunca la aplicaba** al enviar la request. Ahora se anexan a la URL (y al
cURL generado), con `URLSearchParams` para no romper valores con espacios/acentos.

Detalle: `lib/base64.ts` procesa en chunks de 8 KB para no romper con
`String.fromCharCode(...bytes)` en archivos grandes, y `base64ToBytes` valida
el alfabeto antes de `atob`.

**Bug corregido respecto del legacy**: `_verifyHs256` tenía una guarda sobre
`headerB64` que siempre daba error, por lo que "Signature Verified" nunca
aparecía. La versión React verifica HS256/384/512 comparando la firma calculada
con la provista; validado en browser con el token de ejemplo (válida) y con un
secret incorrecto (inválida).

## Normalización posterior (deuda técnica saldada)

Al cerrar la migración quedaban dos duplicaciones:

1. **Tablas**: 6 pantallas repetían `thead/tbody/tr/td` con los mismos estilos.
   Se extrajo `components/ui/data-table.tsx` con columnas tipadas, fila
   expandible, fila activa, agrupación (`groups`) y opciones `dense` /
   `stickyHeader` / `bare`. Ahora hay **una sola** etiqueta `<table>` en el
   proyecto (dentro de `DataTable`).
   Pantallas migradas: Test Suites (TCs), Exploratoria (flujos), Seguimiento
   Jira (agrupado por épica), Mi JIRA, Dashboard › Jira & Daily y Token Decoder
   (claims).
2. **Textareas**: 3 usos sueltos de `<textarea>` con clases copiadas del
   componente. Se reemplazaron por `<Textarea>`; hoy la única etiqueta
   `<textarea>` vive en `components/ui/input.tsx`.

Regla para nuevas pantallas: **no escribir `<table>` ni `<textarea>` a mano**;
usar `DataTable` y `Textarea`.

## Refactor del backend (`server.js`)

Segunda fase, cerrada: el monolito pasó de **5.293 a 163 líneas** (−97%). Hoy
`server.js` solo declara middlewares, monta routers, arranca HTTP/WebSocket y
hace el cierre ordenado.

Estructura:

```
src/bootstrap/schema.js        migraciones + seed (en background)
src/config.js                  puerto, JWT, rutas base
src/middleware/auth.js         requireAuth / requireAdmin
src/lib/helpers.js             sanitizeInput, normalizeStatus, ...
src/lib/sequences.js           generateKey(Batch), permisos, project ids
src/lib/jira-credentials.js    credenciales Jira por usuario
src/lib/upload.js              multer en memoria
src/lib/import-processors.js   processFlatImport / processDualImport
src/lib/report-evidence.js     evidencias en base64 + saveAttachment
src/lib/tester-report.js       consulta y render del reporte por tester
src/routes/*.js                21 routers por recurso
```

Verificación en cada extracción:

1. `node scratch/smoke-server.mjs compare` → 27 endpoints GET idénticos al
   baseline (hash con normalización de `iat/exp/timeMs/date`).
2. Pruebas manuales de las rutas de escritura (el smoke solo cubre GETs).
3. **Paridad de inventario**: 112 rutas en el monolito original → 112 hoy,
   sin faltantes ni duplicadas.

Bugs reales encontrados por este proceso (todos preexistentes o introducidos
por un corte, nunca enviados sin corregir):

- `router is not defined` en `execution.js` (los routers se llaman
  `runsRouter`/`historyRouter`).
- Constantes `SUGGESTION_*` arrastradas a `tools.js`, que rompían el cambio de
  estado de sugerencias con un 500.
- `getClient` / `generateKeyBatch` sin importar en `import-processors.js`
  (la importación de Excel devolvía 500).
- `POST /api/issue` hacía `query('BEGIN TRANSACTION')` fuera del `try`; en
  Postgres/Supabase esa sentencia no existe, así que cada llamada lanzaba un
  rechazo no capturado y **tumbaba el proceso**. Ahora responde 500 JSON.

Nota de arquitectura: `db.js` ejecuta cada consulta contra Supabase vía RPC
(conexiones independientes), por lo que **no hay transacciones**; `getClient()`
es un adaptador que delega en `query()`. Cualquier código nuevo debe ser
idempotente o compensar errores a mano.


## Reglas de UI (design system)

Cada tipo de elemento tiene **un solo** componente. Si una pantalla necesita
otra variante, se extiende el primitivo; no se copia el markup.

| Necesidad | Componente obligatorio | Prohibido |
|---|---|---|
| Campo editable (label + control) | `Field` + `Input` / `Textarea` / `SelectField` | label/`<input>` sueltos |
| Texto de solo lectura con label | **`ReadField`** (`components/ui/read-field.tsx`) | `<p>`/`<pre>`/`<div>` armados a mano |
| Tabla / listado | `DataTable` | `<table>` |
| Textarea | `Textarea` | `<textarea>` |
| Diálogo / confirmación | `Dialog*` / `useConfirm` | `window.confirm`, modales ad-hoc |
| Notificaciones | `toast` (sonner) | alerts |

`ReadField` centraliza label + bloque multilínea (borde, `whitespace-pre-wrap`,
scroll y estado vacío). Ejemplo:

```tsx
<ReadField label="Pasos para reproducir" value={hallazgo.steps_to_reproduce} mono />
<ReadField label="Resultado esperado" value={hallazgo.expected_result} />
```

### Cómo se evita que vuelva a pasar

1. **Chequeo automático**: `npm run check:ui`
   (`frontend/scripts/check-ui-conventions.mjs`) falla si aparece `<table>`,
   `<textarea>`, `<pre>` o `whitespace-pre-wrap` fuera de los componentes
   permitidos. Corre en `prebuild`, así que un `npm run build` no compila con
   el patrón prohibido.
2. **Allowlist explícita** para casos legítimos: viewers de código
   (`features/tools/**`) y cuerpos de comentarios de Jira (donde el texto no
   es un campo con label).
3. **Regla de revisión**: si un PR agrega un bloque "Label + texto", debe
   aparecer `ReadField` en el diff. Cualquier excepción se justifica en el
   mismo PR y se agrega a la allowlist.
4. **Un solo lugar para cambiar estilos**: ajustar `ReadField` (o `Field`)
   impacta en todas las pantallas automáticamente.

Refactor aplicado con esta regla: detalle de hallazgo y de flujo en
Exploratoria, detalle de ejecución y fila de bug en Historial.
