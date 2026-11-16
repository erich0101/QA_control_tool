# Design system — UI React (`frontend/src`)

La UI nueva se construye sobre **React 19 + TypeScript + Tailwind + Radix**.
Este documento es la referencia de componentes y reglas para que una pantalla
nueva no reimplemente markup.

## Regla general

- Si un patrón aparece en **2 o más pantallas**, sube a `components/ui`.
- Toda pantalla nueva usa los primitivos de `components/ui`; no crea
  `<table>`, `<textarea>`, `<select>` ni inputs de fecha ad hoc.
- Los valores de solo lectura se muestran con `ReadField`.
- Los formularios usan `Field` + controles del design system.
- `npm run check:ui` corre en `prebuild` y bloquea los patrones prohibidos.

## Catálogo

### Layout y estructura

| Componente | Uso |
|---|---|
| `PageHeader` | Cabecera de pantalla: eyebrow, título, descripción, badge y acciones. El título envuelve en pantallas chicas. |
| `Section` | Bloque de contenido con título, descripción, acciones y tarjeta. Usar `bare` dentro de otra tarjeta. |
| `Card` / `CardHeader` / `CardTitle` / `CardContent` | Tarjetas simples cuando no hace falta el header de `Section`. |
| `EmptyState` | Estado vacío con icono, título, descripción y acción. |
| `Skeleton` | Placeholder de carga. |

### Métricas

| Componente | Uso |
|---|---|
| `KpiCard` | Label + valor + hint + tono (`neutral`, `ok`, `warn`, `fail`, `brand`). |

### Formularios

| Componente | Uso |
|---|---|
| `Field` | Label + control + hint/error. |
| `Input` / `Textarea` | Controles base. |
| `TextareaWithCount` | Textarea con contador `usados/máximo` y `maxLength`. |
| `DatePicker` | Fecha (`date`) o fecha+hora (`withTime`). Único lugar permitido para inputs de fecha nuevos. |
| `SelectField` | Select simple (Radix). |
| `Combobox` | Select con búsqueda para listas largas. |
| `Label` | Label suelto cuando no se usa `Field`. |

### Datos

| Componente | Uso |
|---|---|
| `DataTable` | Tabla estándar: columnas, grupos, fila expandible, sticky header, modo denso. Único lugar permitido para `<table>` fuera de `components/ui`. |
| `EditableCell` | Celda editable para columnas de `DataTable` (texto o multilínea). Guarda/cancela inline. |
| `ReadField` | Valor de solo lectura multilínea con label. |
| `Badge` | Estado/etiqueta con tonos. |

### Feedback y overlays

| Componente | Uso |
|---|---|
| `Button` | Acciones. Variantes `primary`, `secondary`, `ghost`, `destructive`, `outline`. |
| `Dialog` | Modales. |
| `ConfirmProvider` / `useConfirm` | Confirmaciones destructivas o irreversibles. |
| `DropdownMenu` | Menús contextuales. |
| `Tabs` | Navegación interna de una pantalla. |
| `Tooltip` | Ayuda breve. |
| `sonner` (`toast`) | Notificaciones. |

## Combinaciones recomendadas

### Tabla editable

```tsx
<DataTable
  columns={[
    { id: 'key', header: 'ID', cell: (row) => row.key_id },
    {
      id: 'title',
      header: 'Título',
      cell: (row) => (
        <EditableCell
          value={row.title}
          onSave={(value) => update.mutate({ id: row.id, title: value })}
        />
      ),
    },
  ]}
  rows={rows}
  getRowId={(row) => row.id}
/>
```

### Filtro con búsqueda

```tsx
<Combobox
  options={testers.map((tester) => ({ value: String(tester.id), label: tester.name }))}
  value={testerId}
  onValueChange={setTesterId}
  placeholder="Todos los testers"
/>
```

### Fecha / fecha y hora

```tsx
<Field label="Desde" htmlFor="from">
  <DatePicker id="from" value={from} onChange={setFrom} max={to} />
</Field>

<Field label="Inicio del bloqueo" htmlFor="block-from">
  <DatePicker id="block-from" withTime value={from} onChange={setFrom} />
</Field>
```

## Reglas que aplica `check:ui`

`frontend/scripts/check-ui-conventions.mjs` falla si encuentra, fuera de
`components/ui`:

- `<table>` → usar `DataTable`.
- `<textarea>` → usar `Textarea` o `TextareaWithCount`.
- `<select>` → usar `SelectField` o `Combobox`.
- `type="date"` / `type="datetime-local"` → usar `DatePicker`.
- `whitespace-pre-wrap` → usar `ReadField`.
- `<pre>` → usar `ReadField` (excepto viewers de código en `tools`).

Existe una allowlist temporal para inputs de fecha heredados; se reduce a
medida que se migran esas pantallas.

## Deuda / próximos pasos

- Migrar los `datetime-local` restantes a `DatePicker withTime`.
- Adoptar `PageHeader`, `Section` y `KpiCard` en las pantallas que todavía
  arman esos bloques a mano.
- Documentar estados de carga/error por pantalla y unificar toasts.
- Evaluar Storybook solo si el equipo crece; no es requisito para usar el
  design system.
