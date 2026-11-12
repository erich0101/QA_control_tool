# 🚀 QA Management Dashboard

Sistema centralizado para gestión de Calidad de Software (QA): proyectos, casos de uso,
historias, test suites, ejecuciones (incluida la exploratoria), hallazgos, evidencias,
métricas e integración con Jira.

La app convive con dos frontends durante la migración:

| Ruta | UI |
|---|---|
| `/app` | **Nueva UI React + Vite + TypeScript** (recomendada) |
| `/` | UI legacy (vanilla JS), se mantiene por compatibilidad |

## 🛠️ Stack

- **Backend:** Node.js 22 + Express.
- **Base de datos:** PostgreSQL en Supabase (consultas vía función RPC `exec_query`).
- **Frontend nuevo:** React 19 + Vite 8 + TypeScript, Tailwind v4, Radix UI,
  TanStack Query, Zustand, React Router (`frontend/`).
- **Evidencias:** archivos locales en `data/evidences/` + índice SQLite, con
  respaldo opcional en Postgres (ver `docs/evidence-integrity.md`).
- **Auth:** JWT en cookie httpOnly.

---

## 🚦 Instalación (primera vez)

### 1. Requisitos

- **Node.js 22.12 o superior** (`node -v`).
- **Git**.
- Una cuenta/proyecto de **Supabase** con la función `exec_query` creada
  (ver `docs/SETUP_OTRO_DEPTO.md`, pasos 3 y 4).
- En Windows, si `npm install` falla al compilar `better-sqlite3`, instalar
  *Visual Studio Build Tools* con “Desktop development with C++” (o usar una
  versión de Node con binarios precompilados para `better-sqlite3`).

### 2. Clonar y elegir la rama

```bash
git clone <URL-DEL-REPO>
cd <carpeta-del-repo>
git fetch origin
git switch refactor_UI     # rama con la nueva UI
git pull
```

> Si ya tenías el repo clonado en otra rama, alcanza con `git fetch origin` +
> `git switch refactor_UI` + `git pull`. Los datos locales (`data/`) y el `.env`
> no se tocan con un cambio de rama.

### 3. Variables de entorno

```bash
cp .env.example .env
```

Completar en `.env`:

- `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` (**service_role**, no anon).
- `PORT` (por defecto 3001).
- `JWT_SECRET` y `JIRA_ENCRYPTION_KEY` (generar cada una con
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).

> El `.env` está en `.gitignore`: nunca se commitea ni se comparte.

### 4. Instalar dependencias y compilar la UI

```bash
npm run setup
```

Hace, en orden:

1. `npm install` (backend).
2. `cd frontend && npm install` (React/Vite).
3. `cd frontend && npm run build` (genera `frontend/dist`, que es lo que
   sirve `/app`; incluye el chequeo `check:ui`).

### 5. Levantar

```bash
npm start
```

- Las migraciones de esquema corren **en background** al arrancar; pueden tardar
  ~30 segundos la primera vez. El puerto abre igual.
- Nueva UI: **http://localhost:3001/app**
- UI legacy: http://localhost:3001
- Login inicial (si la base es nueva): `erich@qa.local` / `admin123`
  — **cambiar la contraseña**.

---

## 🔄 Actualizar el proyecto (cada `git pull`)

Cada vez que haya cambios en la rama:

```bash
git fetch origin
git switch refactor_UI      # si no estás ya en ella
git pull

npm run update              # npm install + instala frontend + build
npm start                   # reiniciar el server (Ctrl+C y de nuevo)
```

`npm run update` es equivalente a:

```bash
npm install
cd frontend && npm install && npm run build
cd ..
```

Si el pull no trajo cambios en `package.json` ni en `frontend/package.json`,
podés saltear los `install` y correr sólo `npm run ui:build` (necesario si
cambiaron archivos del frontend).

### Atajos útiles

```bash
npm run ui:dev        # Vite en modo dev (proxy a PORT) para trabajar la UI
npm run ui:build      # build de producción de la UI
npm run ui:typecheck  # chequeo de tipos
npm run check:ui      # convenciones del design system
```

---

## 💾 Datos locales y evidencias

- `data/evidences/` y `data/evidences.sqlite` son **locales de cada máquina** y
  están en `.gitignore`. Un `git pull` o cambio de rama **no los borra**.
- Cada usuario sigue viendo sus archivos locales aunque no estén en Supabase.
- Al subir una evidencia nueva se guarda también una copia en Postgres
  (`file_data`) hasta `EVIDENCE_EMBED_MAX_BYTES` (10 MB por defecto), para que
  sea portable entre máquinas.
- Para auditar/respaldar las evidencias históricas de tu máquina:

```bash
npm run evidences:audit     # sólo lectura: qué falta / qué no tiene respaldo
npm run evidences:publish   # respalda en Postgres tus archivos locales
```

Detalle completo en `docs/evidence-integrity.md`.

---

## 🔒 Seguridad

- Los tokens de Jira se guardan cifrados (AES-256-CBC con `JIRA_ENCRYPTION_KEY`).
- No commitees `.env`, `data/` ni capturas de evidencias.
- Usá `service_role` sólo en el backend; nunca en el frontend.

---

## 🆘 Problemas frecuentes

| Síntoma | Causa / solución |
|---|---|
| `/app` da 404 | Falta `frontend/dist`: corré `npm run ui:build` |
| `npm install` falla en `better-sqlite3` | Node sin binario precompilado: instalá Build Tools o usá Node 22 LTS |
| `Esquema verificado` pero no hay tablas | La función `exec_query` está mal creada (ver `docs/SETUP_OTRO_DEPTO.md`) |
| `fetch failed` / Supabase | Revisar `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` |
| Jira: “Configuración pendiente” | Cargar dominio/key del proyecto y tu token personal (menú de usuario) |
| `Invalid key length` con Jira | `JIRA_ENCRYPTION_KEY` inválida: regenerala |
| Puerto ocupado | Cambiar `PORT` en `.env` |

Guía detallada para otro departamento (Supabase propio): `docs/SETUP_OTRO_DEPTO.md`.
