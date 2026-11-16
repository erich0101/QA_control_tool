# Reportes HTML — arquitectura

Los reportes se generan server-side como **HTML autocontenido** (CSS inline,
evidencias embebidas) para que se puedan abrir/guardar/imprimir sin depender de
la app. Eso se mantiene.

## Regla de separación

Cada reporte debe tener dos capas:

1. **Datos** (`build<Reporte>Data`)
   - consultas a la base,
   - filtros por proyecto/rango/tester,
   - cálculos de métricas y agregados.
   - Devuelve objetos planos; **no** arma HTML.

2. **Presentación** (`render<Reporte>` / `<reporte>-ui.js`)
   - recibe los datos ya calculados,
   - devuelve strings HTML,
   - no hace consultas ni conoce la base.

```
route (HTTP) -> buildData(...) -> render(data) -> res.send(html)
```

## Estado actual

- `modules/qa-explorations/report-ui/status-report-ui.js`
  contiene los bloques de presentación del reporte de estatus
  (barra de distribución, donut por sesión, barras de aceptación,
  matriz de transiciones, links a sesiones).
- El route `GET /api/explorations/reports/status` todavía mezcla consultas y
  template principal. Próximo paso: extraer `buildStatusReportData()` y
  `renderStatusReport()` completos.
- Reportes pendientes de extraer con el mismo patrón:
  - reporte de bugs por sesión (`/sessions/:runId/bugs-report`),
  - reporte de hallazgos (`/api/reports/hallazgos`),
  - reporte por tester (`src/lib/tester-report.js`),
  - reportes de suites (`report-generator.js`).

## Por qué no migrar los reportes a React

- El PDF/print necesita un documento autocontenido; el HTML server-side lo
  resuelve sin hidratar una SPA.
- Un renderer React (`renderToStaticMarkup`) es válido, pero solo aporta si
  se comparten componentes visuales con la app. No es requisito para separar
  datos de presentación.

## Checklist para un reporte nuevo

- [ ] `build*Data()` sin strings HTML.
- [ ] `render*()` sin `query`/`fetch`.
- [ ] tests/smoke del endpoint (status 200 + secciones clave).
- [ ] fechas con `REPORT_TZ`.
- [ ] evidencia faltante informada, no silenciada.
