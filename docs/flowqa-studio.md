# FlowQA Studio (Tools)

Editor de diagramas de flujo para documentar procesos, validaciones QA y
evidencias reutilizables en wikis (Mermaid, SVG, PNG, JSON).

## Persistencia

Los diagramas se guardan en PostgreSQL en `qa_flow_diagrams`:

| Columna | Tipo | Uso |
|---|---|---|
| `id` | serial | Identificador |
| `project_id` | int | Aislamiento por proyecto de la app |
| `name` | varchar(160) | Nombre visible |
| `description` | text | Alcance / HU / épica |
| `nodes` | jsonb | Nodos del editor (posición, tipo, texto, color, QA) |
| `edges` | jsonb | Conexiones (puertos, etiqueta, estilo, color) |
| `settings` | jsonb | Snap a cuadrícula y orientación Mermaid |
| `entity_type` | varchar(32) | Vínculo opcional: CU, HU, TC, suite, defecto o sesión |
| `entity_id` | int | Id de la entidad vinculada |
| `version` | int | Se incrementa en cada `PUT` |
| `created_by` / `updated_by` | int | Auditoría |
| `created_at` / `updated_at` | timestamp | Orden y trazabilidad |

Se guarda el documento completo (`nodes` + `edges` + `settings`) en una sola
operación: cargar y guardar es atómico y no requiere reconstruir relaciones.
El listado usa `jsonb_array_length` para mostrar nodos/conexiones sin leer el
documento completo. El detalle (`GET /:id`) es lo único que trae el JSON
completo para editar.

## API

- `GET /api/flow-diagrams?project_id=2` → resúmenes.
- `GET /api/flow-diagrams/:id` → documento completo.
- `POST /api/flow-diagrams` → crear (`project_id`, `name`, `description`, `nodes`, `edges`, `settings`).
- `PUT /api/flow-diagrams/:id` → actualizar y subir `version`.
- `DELETE /api/flow-diagrams/:id`.
- `GET /api/flow-diagrams/link-targets?project_id=2` → CU, HU, TC/flujo,
  suites, bugs/hallazgos y sesiones disponibles para vincular.

Validaciones: nombre obligatorio (≤160), arrays `nodes`/`edges`, tamaño máximo
2 MB, proyecto existente, `project_id` inmutable en updates y entidad vinculada
perteneciente al mismo proyecto.

`entity_type` admite: `use_case`, `user_story`, `test_case`, `test_suite`,
`defect` y `exploratory_session`. Un flujo exploratorio se representa con el
`test_case` que lo ejecuta.

## Evidencias

Cuando el diagrama está vinculado, aparece primero en el diálogo
**Adjuntar diagrama** de las evidencias de un TC (incluye flujos
exploratorios) o de un hallazgo. El usuario puede elegir cualquier diagrama
del proyecto y el formato:

- **SVG**: vector, recomendado para diagramas extensos (zoom sin pérdida).
- **PNG 2.5x**: imagen de alta resolución, más compatible con visores.

El archivo generado se sube por el endpoint de evidencias existente con
categoría `DIAGRAM`, por lo que queda inmutable junto a la ejecución o el
hallazgo (no se regenera si el diagrama cambia después).

## UI

`Tools → FlowQA Studio` incluye:

- Lista de diagramas guardados + nuevo/duplicar/eliminar.
- Nombre y descripción persistidos.
- Canvas con nodos (inicio/fin, proceso, decisión, QA, datos, nota),
  conexiones por puertos, drag, pan, zoom, undo/redo, snap.
- Propiedades de nodo/edge, estado QA y colores.
- Exportación JSON, SVG, PNG y Mermaid.

El editor mantiene el estado en React y entrega el documento completo al
guardar; no depende de localStorage. Si se necesita historial de versiones en
el futuro, el siguiente paso natural es una tabla
`qa_flow_diagram_versions` con `diagram_id`, `version`, `nodes`, `edges`,
`settings`, `created_by`, `created_at`.
