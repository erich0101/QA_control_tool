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
| `dashboard-*.js` (1.160) | `features/dashboard/*` | ✅ (sin reporte cliente) |
| `dashboard-epic-report.js` (547) → Reporte cliente | — | ⏳ pendiente |
| `hallazgos-tab.js` (1.538) | `features/hallazgos/*` | ✅ (sin Jira/promote) |
| `hallazgos-tab.js` → crear ticket Jira / promover a bug | — | ⏳ pendiente |
| `exploratoria-tab.js` (1.778) | `features/exploratoria/*` | ✅ (sin import/voz) |
| `exploratoria-tab.js` → importar flujos Excel | — | ⏳ pendiente |
| `mi-jira-tab.js` (328) | `features/mi-jira/*` | ✅ |
| `team-tab.js` (245) | `features/team/*` | ✅ |
| `tools-tab.js` (2.222) | `features/tools/*` | ⏳ |
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
