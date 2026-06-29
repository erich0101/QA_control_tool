# Guía de Despliegue para Otro Departamento (Base de Datos Independiente)

> Esta guía está orientada a un departamento o equipo que necesita levantar el **QA Management Dashboard** por su cuenta, con su **propia base de datos Supabase totalmente aislada** de la del equipo original.

---

## 0. Resumen rápido

Vas a terminar con:

- Tu **propio proyecto Supabase** (aislado, nadie más ve tus datos).
- El backend de Node.js corriendo en tu máquina local.
- El usuario admin por defecto (`erich@qa.local` / `admin123`) que **debes cambiar en el primer login**.

Tiempo estimado: **15-30 minutos**.

---

## 1. Requisitos previos

- **Node.js 18+** instalado (`node -v` para verificar).
- Una cuenta en [Supabase](https://supabase.com) (es gratis para empezar).
- Git para clonar el repositorio.

---

## 2. Clonar el repositorio

```bash
git clone <URL-DEL-REPO>
cd <carpeta-del-repo>
npm install
```

> Si ya lo tienes clonado, simplemente haz `git pull` y `npm install` para asegurarte de tener la última versión.

---

## 3. Crear tu propio proyecto Supabase

1. Entra a https://supabase.com/dashboard y crea un **nuevo proyecto** (no uses uno compartido con otro equipo).
2. Anota la **contraseña de la base de datos** que te pide al crearlo (es la que usa Postgres internamente; no la necesitarás directamente, pero guárdala por si acaso).
3. Espera a que el proyecto esté **activo** (suele tardar 1-2 minutos).
4. Ve a **Project Settings → API** y copia:
   - **Project URL** → ejemplo: `https://abcdefgh.supabase.co`
   - **service_role** key (es la que dice `service_role`, NO la `anon`) → es un JWT largo que empieza con `eyJ...`
5. **NO uses la key `anon`**. La app necesita la `service_role` porque ejecuta SQL dinámico con permisos elevados.

> **Importante:** La `service_role` key **by-pasea toda la seguridad RLS** de Supabase. Es una llave sensible: trátala como una contraseña y no la commitees a Git. Tu `.env` está en `.gitignore`, pero nunca pegues esta llave en chats, issues, ni screenshots.

---

## 4. Crear la función RPC `exec_query` (OBLIGATORIO)

La aplicación usa una función SQL personalizada llamada `exec_query` para correr queries dinámicas. **Sin esta función el backend NO arranca.**

1. En tu proyecto Supabase, ve a **SQL Editor** (icono de base de datos en el menú izquierdo).
2. Abre el archivo `docs/sql/create_exec_query_function.sql` que viene con este repo.
3. Copia todo su contenido y pégalo en el editor SQL de Supabase.
4. Haz clic en **Run** (o `Ctrl+Enter`).
5. Debe aparecer el mensaje `Success. No rows returned`.

> Si ves un error tipo "function already exists", está bien: el script usa `CREATE OR REPLACE`, es idempotente.

---

## 5. Crear tu archivo `.env`

En la **raíz del proyecto** (al mismo nivel que `package.json`), crea un archivo llamado `.env` con este contenido (reemplaza los valores entre `<...>` con los tuyos):

```env
# ──────────────────────────────────────────────
# Conexión a TU Supabase (de tu propio proyecto)
# ──────────────────────────────────────────────
SUPABASE_URL=https://<TU-PROYECTO>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<TU-SERVICE-ROLE-KEY>

# ──────────────────────────────────────────────
# Puerto local (puede ser 3001, 3002, lo que quieras)
# ──────────────────────────────────────────────
PORT=3001

# ──────────────────────────────────────────────
# Llaves de seguridad (GENERA LAS TUYAS, no copies las del README)
# Comando: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# ──────────────────────────────────────────────
JWT_SECRET=<GENERA-32-BYTES-HEX>
JIRA_ENCRYPTION_KEY=<GENERA-32-BYTES-HEX>

# ──────────────────────────────────────────────
# Opcionales (si aplican, si no, déjalos vacíos o bórralos)
# ──────────────────────────────────────────────
# FIGMA_ACCESS_TOKEN=
# FIGMA_PROJECT_URL=
# GEMINI_API_KEY=
# JIRA_TIKEN=
```

### Cómo generar las llaves seguras

Abre una terminal en la carpeta del proyecto y ejecuta:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Hazlo **dos veces**: una para `JWT_SECRET` y otra para `JIRA_ENCRYPTION_KEY`. Cada ejecución produce una cadena hex de 64 caracteres.

> **Importante:** Si `JIRA_ENCRYPTION_KEY` no tiene exactamente 32 bytes, el cifrado AES-256-CBC de los tokens de Jira **fallará** y no podrás guardar credenciales de Jira. La salida del comando de arriba ya tiene el tamaño correcto.

---

## 6. Arrancar el servidor

```bash
npm start
```

Verás en consola algo como:

```
✅ Esquema de base de datos verificado y actualizado.
✅ Usuario admin Erich Petrocelli (erich@qa.local / admin123) creado.
Manual QA Tool (JIRA Edition) -> http://localhost:3001
```

> Si ves `Error en verificación de esquema: ...`, revisa que hayas corrido el paso 4 (crear la función `exec_query`).

> Si ves `ECONNREFUSED` o `fetch failed`, revisa que `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` sean correctos.

El servidor crea **automáticamente** todas las tablas, índices, y el usuario admin la primera vez que arranca.

---

## 7. Primer acceso y cambio obligatorio de contraseña

1. Abre `http://localhost:3001` (o el puerto que hayas puesto).
2. Inicia sesión con:
   - **Email:** `erich@qa.local`
   - **Contraseña:** `admin123`
3. **CAMBIA LA CONTRASEÑA INMEDIATAMENTE**: ve a la sección de gestión de usuarios y actualiza la contraseña del admin, o crea un nuevo usuario admin con tu propio email y elimina el default.

> Si no cambias esta contraseña, cualquiera que lea este README podría entrar a tu base.

4. (Opcional) Crea tu primer **proyecto** desde la UI.
5. (Opcional) Si vas a usar Jira, ve a la configuración del proyecto y agrega tu `jira_domain` + `jira_project_key` + tu API token personal.

---

## 8. ¿Qué datos están aislados?

- Tu base de datos es **independiente**: nadie más la ve.
- Los tokens de Jira se cifran con **tu propia** `JIRA_ENCRYPTION_KEY`.
- Las sesiones de usuario se firman con **tu propio** `JWT_SECRET`.
- Los adjuntos/evidencias viven como BLOB dentro de tu propio Supabase.

En resumen: **aislamiento total**.

---

## 9. Checklist rápido

- [ ] Cloné el repo y corrí `npm install`.
- [ ] Creé mi propio proyecto Supabase.
- [ ] Copié `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` desde Project Settings → API.
- [ ] Ejecuté `docs/sql/create_exec_query_function.sql` en el SQL Editor de Supabase.
- [ ] Creé mi `.env` con mis propias llaves generadas.
- [ ] `npm start` arrancó sin errores y vi el mensaje "Esquema verificado".
- [ ] Hice login con `erich@qa.local` / `admin123`.
- [ ] **Cambié la contraseña del admin.**
- [ ] (Opcional) Creé un proyecto de prueba y verifiqué que persiste.

---

## 10. Problemas frecuentes

### "Error en verificación de esquema"
- No corriste el SQL del paso 4, o el SQL falló. Vuelve al SQL Editor, borra la función con `DROP FUNCTION IF EXISTS public.exec_query(text);` y vuelve a correr el script.

### "fetch failed" o "ECONNREFUSED"
- Tu `SUPABASE_URL` o `SUPABASE_SERVICE_ROLE_KEY` están mal. Verifica en el panel de Supabase que el proyecto esté activo y las llaves copiadas no tengan espacios al inicio/final.

### "Invalid key length" al guardar un token de Jira
- Tu `JIRA_ENCRYPTION_KEY` no es de 32 bytes. Regenera con el comando del paso 5.

### "Cannot connect to server"
- El puerto está ocupado. Cambia `PORT` en tu `.env` a otro (ej. `3002`) y reinicia.

### El servidor arranca pero las queries devuelven error
- La función `exec_query` está mal creada o no es `SECURITY DEFINER`. Verifica que en Supabase la función esté marcada como `security definer` (lo está en el script).

---

¿Dudas? Contacta al equipo que te pasó el proyecto y comparte el mensaje de error exacto que ves en consola.
