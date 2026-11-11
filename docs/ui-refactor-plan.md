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
| `history-tab.js` (1.153) | `features/history/*` | ⏳ |
| `jira-tracking-tab.js` (397) | `features/jira-tracking/*` | ⏳ |
| `dashboard-*.js` (1.160) | `features/dashboard/*` | ⏳ |
| `hallazgos-tab.js` (1.538) | `features/hallazgos/*` | ⏳ |
| `exploratoria-tab.js` (1.778) | `features/exploratoria/*` | ⏳ |
| `mi-jira-tab.js` (328) | `features/mi-jira/*` | ⏳ |
| `team-tab.js` (245) | `features/team/*` | ⏳ |
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
