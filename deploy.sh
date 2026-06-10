#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="rafam_dev@20.55.241.247"
REMOTE_DIR="/home/qa_control_tool"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v rsync >/dev/null 2>&1; then
  echo "ERROR: rsync no esta instalado en este equipo"
  exit 1
fi

if ! command -v ssh >/dev/null 2>&1; then
  echo "ERROR: ssh no esta instalado en este equipo"
  exit 1
fi

echo "==[1/6]== Sincronizando proyecto a ${REMOTE_HOST}:${REMOTE_DIR}"
rsync -avz --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='uploads' \
  --exclude='*.log' \
  --exclude='.warp' \
  --exclude='.vscode' \
  --exclude='.idea' \
  -e ssh \
  "$LOCAL_DIR/" "${REMOTE_HOST}:${REMOTE_DIR}/"

echo "==[2/6]== Verificando Docker remoto"
ssh "$REMOTE_HOST" "command -v sudo docker >/dev/null && sudo docker --version && sudo docker compose version" || {
  echo "ERROR: Docker o docker compose no disponibles en el host remoto"
  exit 1
}

echo "==[3/6]== Verificando archivo .env remoto"
ssh "$REMOTE_HOST" bash -s <<'REMOTE_EOF'
set -e
cd /home/qa_control_tool
if [ ! -f .env ]; then
  echo "WARNING: No existe .env. Creando desde .env.example (DEBES editarlo luego)"
  cp .env.example .env
  echo "*** ACCION REQUERIDA: editar /home/qa_control_tool/.env con valores seguros ***"
fi
# Verificar que JWT_SECRET y JIRA_ENCRYPTION_KEY sean válidos; sino el build fallará.
# docker-compose.override.yml usa ${VAR:?...} que rompe silenciosamente el build.
if ! grep -qE '^JWT_SECRET=[A-Za-z0-9_-]{32,}' .env; then
  echo "ERROR: JWT_SECRET falta o es demasiado corto (>=32 chars) en .env remoto"
  echo "Generá uno con: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
  exit 1
fi
if ! grep -qE '^JIRA_ENCRYPTION_KEY=[0-9a-fA-F]{64}' .env; then
  echo "ERROR: JIRA_ENCRYPTION_KEY falta o no es 64 chars hex en .env remoto"
  echo "Generá uno con: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
  exit 1
fi
REMOTE_EOF

echo "==[4/6]== Construyendo imagen"
if [ "${REBUILD:-0}" = "1" ]; then
  echo "  (REBUILD=1: forzar build sin cache)"
  ssh "$REMOTE_HOST" "cd ${REMOTE_DIR} && sudo docker compose build --no-cache app"
else
  echo "  (build con cache. Si no refleja cambios, ejecuta: REBUILD=1 ./deploy.sh)"
  ssh "$REMOTE_HOST" "cd ${REMOTE_DIR} && sudo docker compose build app"
fi

echo "==[5/6]== Levantando servicios (db + app)"
ssh "$REMOTE_HOST" "cd ${REMOTE_DIR} && sudo docker compose up -d"

echo "==[6/6]== Aplicando migraciones (migrations/*.sql)"
# Las migraciones son idempotentes (IF NOT EXISTS / DO blocks) y se aplican por nombre.
# El script de init docker-entrypoint-initdb.d/01-schema.sql solo corre en volumen nuevo,
# por lo que las migraciones posteriores deben aplicarse manualmente después de cada deploy.
ssh "$REMOTE_HOST" bash -s <<'REMOTE_EOF'
set -e
cd /home/qa_control_tool
# Esperar a que el DB esté healthy
echo "  Esperando DB healthy..."
for i in $(seq 1 30); do
  if sudo docker compose exec -T db pg_isready -U "${PGUSER}" -d "${PGDATABASE}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
# Aplicar cada migración en orden lexicográfico
for m in migrations/*.sql; do
  [ -f "$m" ] || continue
  echo "  Aplicando $m..."
  sudo docker cp "$m" qa_control_tool-db-1:/tmp/migration.sql
  sudo docker compose exec -T db psql -U "${PGUSER}" -d "${PGDATABASE}" -f /tmp/migration.sql >/dev/null
done
echo "  Migraciones aplicadas"
REMOTE_EOF

echo ""
echo "==[INFO]== Estado final de los contenedores"
ssh "$REMOTE_HOST" "cd ${REMOTE_DIR} && sudo docker compose ps"

echo ""
echo "==[INFO]== Ultimas lineas del log de la app"
ssh "$REMOTE_HOST" "cd ${REMOTE_DIR} && sudo docker compose logs --tail=40 app"

echo ""
echo "==[DONE]== Despliegue completo"
echo "App disponible en: http://${REMOTE_HOST#*@}:8088"
echo "El usuario admin (erich@qa.local) se crea automaticamente en el primer arranque"
echo "con password aleatorio. Recuperarlo del log con:"
echo "  ssh ${REMOTE_HOST} 'cd ${REMOTE_DIR} && sudo docker compose logs app | grep \"ADMIN CREADO\"'"
echo ""
echo "Para ver logs en vivo: ssh ${REMOTE_HOST} 'cd ${REMOTE_DIR} && sudo docker compose logs -f app'"
echo "Para reiniciar:       ssh ${REMOTE_HOST} 'cd ${REMOTE_DIR} && sudo docker compose restart app'"
