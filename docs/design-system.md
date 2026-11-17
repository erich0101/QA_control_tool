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
| `Dialog` | Modales. Usar `DialogBody` para contenido scrolleable. |
| `ConfirmProvider` / `useConfirm` | Confirmaciones destructivas o irreversibles. |
| `DropdownMenu` | Menús contextuales. |
| `Tabs` | Navegación interna de una pantalla. |
| `Tooltip` | Ayuda breve. |
| `sonner` (`toast`) | Notificaciones. |

## Combinaciones recomendadas

### Modal con contenido largo

Para que el header y los botones queden siempre visibles y solo scrollee el
contenido:

```tsx
<DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
  <DialogHeader className="shrink-0 border-b border-border px-6 pb-4 pt-6">
    <DialogTitle>…</DialogTitle>
    <DialogDescription>…</DialogDescription>
  </DialogHeader>

  <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
    <DialogBody className="space-y-4 px-6 py-4">{/* campos */}</DialogBody>
    <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
      {/* acciones */}
    </DialogFooter>
  </form>
</DialogContent>
```

Reglas:

- `DialogBody` aporta `min-h-0 flex-1 overflow-y-auto`; nunca dejar el `overflow`
  en el `DialogContent` si el modal tiene footer de acciones.
- Evitar `<Textarea>` que crezcan con `min-h` muy altos: el scroll lo maneja el
  cuerpo del modal, no la página.
- Textos largos en tablas de modales: `truncate` + `title`, o `break-words`.

### Evidencias en hallazgos

Los hallazgos son `qa_defects` sin ejecución, así que la evidencia se adjunta
con el endpoint existente:

```
POST /api/evidence   (multipart: evidence, category, defect_id)
GET  /api/hallazgos/:id/evidence
DELETE /api/evidence/:id
```

Reutilizar `EvidencePanel` (`features/hallazgos/components/evidence-panel.tsx`).
En alta, las capturas quedan locales como "PENDIENTE" y se suben al obtener el
`id` del hallazgo; en edición se suben al instante.

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

- Adoptar `Section`, `EditableCell` y `PageHeader` en las pantallas que todavía
  arman esos bloques a mano.
- Documentar estados de carga/error por pantalla y unificar toasts.
- Separar datos y presentación en los reportes HTML: ver
  `docs/reports-architecture.md`.
- Evaluar Storybook solo si el equipo crece; no es requisito para usar el
  design system.
