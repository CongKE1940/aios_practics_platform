#!/usr/bin/env bash
set -euo pipefail

STACK_DIR="${STACK_DIR:-/mnt/user/stacks/aios}"
COMPOSE_FILE="${COMPOSE_FILE:-compose.yml}"
LOCK_FILE="${LOCK_FILE:-/tmp/aios-deploy.lock}"

cd "$STACK_DIR"

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose -f "$COMPOSE_FILE" "$@"
    return
  fi
  docker-compose -f "$COMPOSE_FILE" "$@"
}

(
  flock -n 9 || {
    echo "[aios] another deployment is already running"
    exit 0
  }

  if [ ! -f .env ]; then
    echo "[aios] missing $STACK_DIR/.env"
    echo "[aios] copy .env.example to .env and fill in real secrets first"
    exit 1
  fi

  echo "[aios] pulling images"
  compose pull

  echo "[aios] starting services"
  compose up -d --remove-orphans

  echo "[aios] checking api health"
  for i in $(seq 1 30); do
    if docker exec aios_api wget -qO- http://127.0.0.1:18081/healthz >/dev/null 2>&1; then
      echo "[aios] api health check passed"
      exit 0
    fi
    sleep 2
  done

  echo "[aios] api health check failed"
  docker logs --tail=120 aios_api || true
  exit 1
) 9>"$LOCK_FILE"
