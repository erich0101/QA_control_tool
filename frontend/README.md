# Nueva UI — React + Vite + TypeScript

Reescritura incremental de la UI de **Manual QA Tool**. Convive con la UI legacy
(`public/`) hasta terminar la migración (patrón *strangler*).

| | Legacy (actual) | Nueva UI |
|---|---|---|
| URL dev | `http://localhost:3333` | `http://localhost:5173` |
| URL prod | `/` | `/app` |
| Código | `public/index.html` + `public/js/**` | `frontend/src/**` |
| Estado | `Store` propio (227 líneas) | Zustand (UI) + TanStack Query (servidor) |
| Navegación | `switch (activeTab)` | React Router |
| Componentes | `innerHTML` por tab | Componentes reutilizables shadcn/Radix |

## Cómo correr

```bash
# 1. Backend (Express + Supabase) — desde la raíz del repo
npm start

# 2. Nueva UI con HMR — en otra terminal
npm run ui:dev        # http://localhost:5173 (proxea /api a :3333)
```

El proxy de Vite evita problemas de CORS y reutiliza la cookie `token`
(httpOnly) del backend tal cual.

## Build de producción

```bash
npm run ui:build      # genera frontend/dist (base /app/)
npm start             # Express detecta dist y sirve la app en /app
```

`server.js` monta `frontend/dist` en `/app` **solo si el directorio existe**:
si no se compiló, `/app` devuelve 404 y la app legacy sigue intacta.

## Estructura

```
frontend/src/
├── components/
│   ├── ui/           # sistema de diseño reutilizable (Button, Dialog, Select…)
│   └── layout/       # shell: Topbar, Tabbar, ProjectSwitcher, UserMenu
├── features/         # lógica por dominio (auth, projects, use-cases, test-suites)
│   └── <dominio>/
│       ├── use-*.ts  # hooks de datos (TanStack Query)
│       └── *.tsx     # pantallas / diálogos del dominio
├── lib/
│   ├── api/          # cliente HTTP único + un módulo por recurso
│   ├── navigation.ts # definición ÚNICA de tabs (alimenta tabbar y router)
│   └── query-keys.ts # claves de cache centralizadas
├── pages/            # páginas de ruta (placeholders durante la migración)
└── stores/           # Zustand: session + ui (tema, proyecto activo)
```

## Reglas del proyecto (aplican a la nueva UI)

1. **Nunca** `innerHTML` ni `dangerouslySetInnerHTML`: JSX escapa por defecto.
   El problema de XSS de la UI legacy desaparece por construcción.
2. **Un solo componente por concepto.** Si un patrón se repite (badge de estado,
   tarjeta de test, fila de tabla), va a `components/ui` o `components/<dominio>`,
   no se copia.
3. **No crear listas paralelas de tabs/rutas.** Todo sale de `lib/navigation.ts`.
4. **Datos del servidor solo con TanStack Query** (nada de cache manual con TTL).
5. **Estilos con Tailwind + tokens Apple.** No agregar colores/radios hardcodeados:
   usar `bg-surface`, `text-fg-muted`, `border-border`, `text-fail`, etc.
   Los tokens viven en `public/css/apple-design-tokens.css` (fuente única compartida
   con la UI legacy).
6. **Formularios** con `react-hook-form` + un componente de campo reutilizable.

## Estado de la migración

Ver [`docs/ui-refactor-plan.md`](../docs/ui-refactor-plan.md).
