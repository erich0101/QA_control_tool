#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="rafam_dev@20.55.241.247"
REMOTE_USER="${REMOTE_HOST%@*}"
REMOTE_DIR="/home/rafam_dev/qa_control_tool"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v rsync >/dev/null 2>&1; then
  echo "ERROR: rsync no esta instalado en este equipo"
  exit 1
fi

if ! command -v ssh >/dev/null 2>&1; then
  echo "ERROR: ssh no esta instalado en este equipo"
  exit 1
fi

echo "==[1/5]== Sincronizando proyecto a ${REMOTE_HOST}:${REMOTE_DIR}"
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

echo "==[2/5]== Verificando Docker remoto"
ssh "$REMOTE_HOST" "command -v sudo docker >/dev/null && sudo docker --version && sudo docker compose version" || {
  echo "ERROR: Docker o docker compose no disponibles en el host remoto"
  exit 1
}

echo "==[3/5]== Verificando archivo .env remoto"
ssh "$REMOTE_HOST" bash -s <<'REMOTE_EOF'
set -e
cd /home/rafam_dev/qa_control_tool
if [ ! -f .env ]; then
  echo "WARNING: No existe .env. Creando desde .env.example (DEBES editarlo luego)"
  cp .env.example .env
  echo "*** ACCION REQUERIDA: editar /home/rafam_dev/qa_control_tool/.env con valores seguros ***"
fi
# El .env es agnóstico: solo necesita JWT_SECRET, JIRA_ENCRYPTION_KEY y DATABASE_URL.
# docker-compose.override.yml usa ${VAR:?...} que rompe el build silenciosamente.
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
if ! grep -qE '^DATABASE_URL=postgresql://' .env; then
  echo "ERROR: DATABASE_URL falta o no es una URL postgresql:// valida en .env remoto"
  echo "Para Neon:    postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/db?sslmode=require"
  echo "Para Supabase: postgresql://postgres.[ref]:pass@aws-0-xxx.pooler.supabase.com:5432/postgres"
  echo "Para local:   postgresql://qa_user:pass@db:5432/qa_control_tool"
  exit 1
fi
REMOTE_EOF

echo "==[4/5]== Construyendo imagen"
if [ "${REBUILD:-0}" = "1" ]; then
  echo "  (REBUILD=1: forzar build sin cache)"
  ssh "$REMOTE_HOST" "cd ${REMOTE_DIR} && sudo docker compose build --no-cache app"
else
  echo "  (build con cache. Si no refleja cambios, ejecuta: REBUILD=1 ./deploy.sh)"
  ssh "$REMOTE_HOST" "cd ${REMOTE_DIR} && sudo docker compose build app"
fi

echo "==[5/5]== Levantando servicio app"
ssh "$REMOTE_HOST" "cd ${REMOTE_DIR} && sudo docker compose up -d"

echo ""
echo "==[INFO]== Estado final del contenedor"
ssh "$REMOTE_HOST" "cd ${REMOTE_DIR} && sudo docker compose ps"

echo ""
echo "==[INFO]== Ultimas lineas del log de la app"
ssh "$REMOTE_HOST" "cd ${REMOTE_DIR} && sudo docker compose logs --tail=40 app"

echo ""
echo "==[DONE]== Despliegue completo"
echo "App disponible en: http://${REMOTE_HOST#*@}:8088"
echo "Conexion a DB:    provista por DATABASE_URL en /home/rafam_dev/qa_control_tool/.env"
echo "El usuario admin (erich@qa.local) se crea automaticamente en el primer arranque"
echo "con password aleatorio. Recuperarlo del log con:"
echo "  ssh ${REMOTE_HOST} 'cd ${REMOTE_DIR} && sudo docker compose logs app | grep \"ADMIN CREADO\"'"
echo ""
echo "Migraciones / schema: aplicar manualmente a la DB remota con psql o cualquier cliente SQL."
echo "  Por ejemplo, contra Neon: psql \"\$DATABASE_URL\" -f schema.sql"
echo ""
echo "Para ver logs en vivo: ssh ${REMOTE_HOST} 'cd ${REMOTE_DIR} && sudo docker compose logs -f app'"
echo "Para reiniciar:       ssh ${REMOTE_HOST} 'cd ${REMOTE_DIR} && sudo docker compose restart app'"
