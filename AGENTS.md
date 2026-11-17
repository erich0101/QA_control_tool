# Instrucciones para agentes de IA — QA Control Tool

Estas reglas son obligatorias y tienen prioridad sobre cualquier atajo, ejemplo
o conveniencia de prueba. Aplican a todo agente (incluido el asistente de
OpenCode) que trabaje en este repositorio.

## 🚨 REGLA CRÍTICA: Jira de AGIP es solo lectura para pruebas

**Nunca** se puede usar el proyecto Jira **AGIP** (ni ninguna de sus épicas,
tickets o campos) para **probar, validar o verificar** la creación de tickets.

Prohibido en AGIP, sin excepciones:

- Crear tickets de prueba (`POST /rest/api/3/issue`).
- Usar `validateOnly=true` (en la práctica también crea el ticket).
- Editar, comentar, transicionar o borrar tickets existentes como prueba.
- Crear o mover épicas para validar payloads.
- Cualquier otro efecto de escritura disparado por una prueba del agente.

Permitido en AGIP:

- Consultas de solo lectura: `GET` de issues, búsquedas JQL, metadatos,
  comentarios, transiciones disponibles.
- Operaciones de escritura **reales** pedidas explícitamente por el usuario,
  con datos reales y confirmación previa (no son pruebas).

### Dónde se prueban las escrituras

1. Usar el proyecto Jira **`default`** (config `qa_jira_configs.jira_project_key = 'default'`).
2. Si `default` no está configurado o no tiene Jira activo, **no se prueba la
   creación**: el agente entrega el cambio y el usuario confirma si resuelve
   el problema.
3. Nunca "improvisar" un proyecto de prueba usando AGIP o una épica de AGIP.

### Verificación sin escribir

Para validar cambios de creación de tickets alcanza con:

- Revisar el payload que arma la app (interceptar el request en el navegador,
  stub de `fetch`, logs).
- Validar la forma del valor según el `createmeta` (por ejemplo, campos
  `option`/`select` exigen `{ id }`, no un string).
- Consultar tickets existentes como referencia de formato.

## Otras reglas del proyecto

- Respetar el design system (`frontend/src/components/ui`) y `npm run check:ui`.
- No commitear artefactos, capturas, builds ni `data/` (evidencias locales).
- No perder datos: `.env`, `data/` y la configuración de Jira no se tocan.
- Migraciones en `src/bootstrap/schema.js`; el esquema se valida al arrancar.
- Seguir `RULES.md` (compatibilidad, accesibilidad, XSS, etc.).

## Checklist antes de cualquier llamada de escritura a Jira

- [ ] ¿Es una prueba o una operación real pedida por el usuario?
- [ ] Si es prueba: ¿el proyecto es `default`?
- [ ] ¿Evité AGIP y todas sus épicas?
- [ ] ¿Evité `validateOnly=true` contra AGIP?
