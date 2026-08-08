#!/usr/bin/env bash
# Simple LinkNest Docker redeploy wrapper
# Usage from project root: ./redeploy-docker.sh

set -euo pipefail
cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed or not on PATH."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not running. Start Docker, then re-run this script."
  exit 1
fi

exec ./docker/docker-deploy.sh
