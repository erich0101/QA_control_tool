# Integridad de evidencias

## Cómo se guardan

Hay dos capas y viven en lugares distintos:

| Dato | Dónde | Compartido |
|---|---|---|
| Metadatos (`qa_attachments`) | Supabase / Postgres | Sí, todo el equipo |
| Binario | `data/evidences/<proyecto>/YYYY-MM/<sha256>.<ext>` | **No**, sólo la máquina donde se subió |
| Índice de binarios | `data/evidences.sqlite` | **No**, local |

Consecuencia histórica: una evidencia subida desde la máquina A no se veía
desde la B, aunque la fila existiera en la base. El archivo local es además
frágil: si se borra la carpeta `data/` o se cambia de máquina, se pierde.

## Qué garantiza el código (a partir de este cambio)

1. **Doble escritura**: al subir una evidencia (`POST /api/evidence` y el
   legacy `POST /api/issue`) el binario se guarda en disco **y** en
   `qa_attachments.file_data` (BYTEA), hasta `EVIDENCE_EMBED_MAX_BYTES`
   (10 MB por defecto; configurable en `.env`). A partir de ahora la
   evidencia es portable entre máquinas.
2. **Lectura con fallback**: `GET /api/evidence/:id` y los reportes
   (`getEvidenceBase64`) sirven el archivo local; si no existe en esta
   máquina, usan la copia de `file_data` de Postgres.
3. **Borrado seguro**: `DELETE /api/evidence/:id` elimina la fila y el índice
   SQLite, pero **no** borra el archivo del disco (evita pérdidas por error).
4. **Auditoría**: `tools/evidences-sync.js` revisa fila por fila y detecta:
   - archivo presente con o sin respaldo en PG,
   - archivo faltante pero recuperable desde PG,
   - archivo faltante sin copia (sólo está en la máquina donde se subió).

## Comandos

```bash
# Solo auditar (no escribe nada)
node tools/evidences-sync.js

# Respaldar en PG los archivos locales que aún no tienen copia
node tools/evidences-sync.js --publish

# Igual, pero permitiendo archivos de hasta 25 MB
node tools/evidences-sync.js --publish --max-mb=25
```

El script verifica el `sha256` antes de respaldar (salvo `--force`) y no
toca las filas `legacy_pg` (ya están en la base).

## Qué hacer después de desplegar la rama

1. En **cada máquina** que tenga `data/evidences/` con evidencias propias,
   correr una vez:

   ```bash
   node tools/evidences-sync.js --publish
   ```

   Eso sube a Postgres todos los binarios locales históricos. Es idempotente
   (salta los que ya tienen `file_data`).

2. Verificar que la salida quede con `sin respaldo en PG: 0`.

3. Para las filas con **archivo faltante**: si tienen copia en PG se sirven
   igual; si no (`SIN COPIA`), sólo se recuperan desde la máquina original.
   El listado de IDs permite ubicarlas.

## Estado al 12/11/2026 (máquina de Erich)

```
total en qa_attachments : 3333
locales (storage_path)  : 2877
  archivo en esta máquina: 959  (todas con respaldo en PG)
  archivo faltante       : 1918 (en otras máquinas; sin copia en PG)
legacy_pg con file_data : 456
```

Las 1918 faltantes se recuperan corriendo `--publish` en las máquinas donde
se subieron. Las 959 de esta máquina ya quedaron respaldadas.

## Límites conocidos

- El respaldo en Postgres crece con las evidencias (~150 KB promedio, máx.
  4,2 MB en los datos actuales). Si se suben videos grandes, quedan sólo en
  disco (aviso en el log) y conviene subir `--max-mb` o migrar a Supabase
  Storage.
- Si se pierde `data/evidences.sqlite`, las lecturas siguen funcionando
  (se resuelven por `storage_path` de Postgres); sólo se pierde el índice
  auxiliar.
