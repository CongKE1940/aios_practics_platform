#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/mnt/user/backups/aios}"
FILE_ASSETS_DIR="${FILE_ASSETS_DIR:-/mnt/user/docker/aios/file_assets}"
MINIO_DATA_DIR="${MINIO_DATA_DIR:-/mnt/user/docker/aios/minio/data}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DATE="$(date +%Y%m%d-%H%M%S)"

STACK_DIR="${STACK_DIR:-/mnt/user/stacks/aios}"
cd "$STACK_DIR"

if [ ! -f .env ]; then
  echo "[aios] missing $STACK_DIR/.env"
  exit 1
fi

set -a
. ./.env
set +a

mkdir -p "$BACKUP_ROOT/mysql" "$BACKUP_ROOT/file_assets" "$BACKUP_ROOT/minio"

MYSQL_HOST="${AIOS_MYSQL_HOST:-${MYSQL_IP:-192.168.1.130}}"
MYSQL_PORT="${AIOS_MYSQL_PORT:-${MYSQL_PORT:-3306}}"
MYSQL_DATABASE="${AIOS_MYSQL_DATABASE:-${MYSQL_DATABASE:-aios}}"
MYSQL_USER="${AIOS_MYSQL_USER:-${MYSQL_USER:-congke}}"

if [ -z "${AIOS_MYSQL_PASSWORD:-${MYSQL_PASSWORD:-}}" ]; then
  echo "[aios] AIOS_MYSQL_PASSWORD or MYSQL_PASSWORD is required for backup.sh"
  echo "[aios] add it to the Unraid-only .env file; do not commit it"
  exit 1
fi
MYSQL_PASSWORD_FOR_BACKUP="${AIOS_MYSQL_PASSWORD:-${MYSQL_PASSWORD}}"

echo "[aios] backing up mysql database $MYSQL_DATABASE"
docker exec aios_mysql sh -c "mysqldump -h'$MYSQL_HOST' -P'$MYSQL_PORT' -u'$MYSQL_USER' -p'${MYSQL_PASSWORD_FOR_BACKUP}' --single-transaction --routines --triggers '$MYSQL_DATABASE'" \
  | gzip > "$BACKUP_ROOT/mysql/aios-$DATE.sql.gz"

echo "[aios] backing up local file assets"
mkdir -p "$FILE_ASSETS_DIR"
rsync -a --delete "$FILE_ASSETS_DIR/" "$BACKUP_ROOT/file_assets/current/"

echo "[aios] backing up minio data"
mkdir -p "$MINIO_DATA_DIR"
rsync -a --delete "$MINIO_DATA_DIR/" "$BACKUP_ROOT/minio/current/"

echo "[aios] cleaning old mysql backups"
find "$BACKUP_ROOT/mysql" -type f -name "*.sql.gz" -mtime +"$RETENTION_DAYS" -delete

echo "[aios] backup completed"
