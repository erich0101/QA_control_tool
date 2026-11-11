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
| `test-suites-tab.js` (1.982 líneas) | `features/test-suites/*` | ⏳ |
| `execution-tab.js` (1.037) + `sbs.js` | `features/execution/*` | ⏳ |
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
