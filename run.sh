#!/usr/bin/env bash
# One command to run BPMN4BC locally in Docker.
#
#   ./run.sh          build (if needed) and start everything, then print the URL
#   ./run.sh stop     stop all containers (saved models are kept)
#   ./run.sh logs     follow the logs of all services
#   ./run.sh status   show the containers
#   ./run.sh reset    stop and delete everything, including saved models
#
# Port: MODELER_PORT=8080 ./run.sh   (default 5000)
set -euo pipefail
cd "$(dirname "$0")"

PORT="${MODELER_PORT:-5000}"
export MODELER_PORT="$PORT"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed. Install Docker Desktop: https://www.docker.com/products/docker-desktop/" >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed but not running. Start Docker Desktop and run ./run.sh again." >&2
  exit 1
fi

compose() { docker compose -p bpmn4bc-showcase "$@"; }

case "${1:-start}" in
  start)
    echo "Building and starting BPMN4BC (the first build takes a few minutes)..."
    compose up -d --build
    echo -n "Waiting for the modeler"
    for _ in $(seq 1 120); do
      if curl -fs "http://localhost:${PORT}/health" >/dev/null 2>&1; then
        echo
        echo "BPMN4BC is running: http://localhost:${PORT}"
        echo "Stop with ./run.sh stop, logs with ./run.sh logs"
        exit 0
      fi
      echo -n "."
      sleep 2
    done
    echo
    echo "The modeler did not answer yet. Check the logs with: ./run.sh logs" >&2
    exit 1
    ;;
  stop)   compose stop ;;
  logs)   compose logs -f --tail=100 ;;
  status) compose ps ;;
  reset)
    read -r -p "Delete all containers AND saved models/instances? [y/N] " answer
    [[ "$answer" =~ ^[Yy]$ ]] && compose down -v --remove-orphans || echo "Cancelled."
    ;;
  *)
    echo "Usage: ./run.sh [start|stop|logs|status|reset]" >&2
    exit 1
    ;;
esac
