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

- Reporte de estatus:
  - datos: `modules/qa-explorations/status-report/data.js` (`buildStatusReportData`)
  - presentación: `modules/qa-explorations/status-report/render.js` (`renderStatusReport`)
  - bloques visuales reutilizables: `modules/qa-explorations/report-ui/status-report-ui.js`
- Reporte de bugs por sesión:
  - datos: `modules/qa-explorations/bugs-report/data.js` (`buildBugsReportData`)
  - presentación: `modules/qa-explorations/bugs-report/render.js` (`renderBugsReport`)
- Reporte de hallazgos seleccionados:
  - datos: `src/lib/report-templates/hallazgos-data.js`
  - presentación: `src/lib/report-templates/hallazgos-render.js`
- Reporte por tester:
  - ya estaba separado en `src/lib/tester-report.js`
    (`generateTesterReport` → datos, `renderTesterReportHTML` → HTML).
- Reportes de suites:
  - `report-generator.js` ya separa `fetch*/compute*` de `render*`;
    queda opcional partirlo en archivos si sigue creciendo.

Todos los routes de reportes quedan como capa fina:

```
route -> build<Reporte>Data(...) -> render<Reporte>(data) -> res.send(html)
```

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
