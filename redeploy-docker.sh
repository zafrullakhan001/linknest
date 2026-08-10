#!/usr/bin/env bash
# LinkNest Docker Redeploy (Linux/macOS)
# Usage from project root: ./redeploy-docker.sh
#
# Mirrors Windows redeploy-docker.bat preflight:
#   - Docker daemon check
#   - data/uploads + uploads/.htaccess
#   - Vendor Linux ttyd (bin/ttyd.x86_64) for builds behind SSL MITM
#   - novnc.d.ts present
#   - Port conflict warnings (SSH + VNC gateway ranges)
#   - Rebuild via docker/docker-deploy.sh
#   - Wait for healthy + verify ttyd/ssh/websockify

set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd)"
COMPOSE_FILE="$ROOT/docker/docker-compose.yml"
TTYD_VERSION="${TTYD_VERSION:-1.7.7}"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) TTYD_BIN="ttyd.x86_64" ;;
  aarch64|arm64) TTYD_BIN="ttyd.aarch64" ;;
  *) TTYD_BIN="ttyd.x86_64" ;;
esac
TTYD_URL="https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/${TTYD_BIN}"
HEALTH_WAIT_MAX=40

echo
echo "[redeploy] LinkNest Docker redeploy"
echo "[redeploy] Project: $ROOT"
echo

if ! command -v docker >/dev/null 2>&1; then
  echo "[error] Docker is not installed or not on PATH."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "[error] Docker daemon is not running. Start Docker, then re-run this script."
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "[error] Docker Compose is not available."
  exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "[error] Missing compose file: $COMPOSE_FILE"
  exit 1
fi

echo "[redeploy] Ensuring data/ and uploads/..."
mkdir -p data uploads bin
if [[ ! -f uploads/.htaccess ]]; then
  cat > uploads/.htaccess <<'EOF'
# Prevent PHP execution in uploads directory
<FilesMatch "\.php$">
    Order Allow,Deny
    Deny from all
</FilesMatch>

# Allow only image files
<FilesMatch "\.(jpg|jpeg|png|gif|svg|webp)$">
    Order Allow,Deny
    Allow from all
</FilesMatch>
EOF
fi

if [[ ! -f novnc.d.ts ]]; then
  echo "[error] Missing novnc.d.ts (required for VNC Viewer widget Docker build)."
  exit 1
fi

if [[ ! -f "bin/${TTYD_BIN}" ]]; then
  echo "[redeploy] Downloading Linux ttyd ${TTYD_VERSION} into bin/${TTYD_BIN}..."
  if ! command -v curl >/dev/null 2>&1; then
    echo "[error] curl not found. Download manually: $TTYD_URL"
    exit 1
  fi
  # -k helps behind SSL inspection (same class of issue as npm strict-ssl false in Dockerfile)
  curl -fsSLk --retry 3 --retry-delay 2 -o "bin/${TTYD_BIN}" "$TTYD_URL"
  size=$(wc -c < "bin/${TTYD_BIN}" | tr -d ' ')
  if [[ "${size:-0}" -lt 100000 ]]; then
    echo "[error] Downloaded ttyd looks too small (${size} bytes)."
    rm -f "bin/${TTYD_BIN}"
    exit 1
  fi
  chmod +x "bin/${TTYD_BIN}"
  echo "[redeploy] ttyd binary ready."
else
  echo "[redeploy] Found vendored ttyd: bin/${TTYD_BIN}"
fi

warn_port() {
  local port="$1" label="$2"
  if command -v ss >/dev/null 2>&1; then
    if ss -ltn "( sport = :$port )" 2>/dev/null | grep -q ":$port"; then
      if ! docker ps --format '{{.Ports}}' 2>/dev/null | grep -q ":${port}->"; then
        echo "[warn] Port ${port} (${label}) appears in use on this host."
      fi
    fi
  elif command -v netstat >/dev/null 2>&1; then
    if netstat -ltn 2>/dev/null | grep -q ":${port} "; then
      if ! docker ps --format '{{.Ports}}' 2>/dev/null | grep -q ":${port}->"; then
        echo "[warn] Port ${port} (${label}) appears in use on this host."
      fi
    fi
  fi
}

echo "[redeploy] Checking common host ports..."
warn_port 8090 "HTTP (LinkNest)"
warn_port 8443 "HTTPS (LinkNest)"
warn_port 8025 "Mailpit UI"
warn_port 1025 "Mailpit SMTP"
warn_port 18681 "SSH gateway ttyd (Docker range start)"
warn_port 18881 "VNC gateway websockify (Docker range start)"

echo
echo "[redeploy] Stopping / rebuilding / starting containers..."
chmod +x "$ROOT/docker/docker-deploy.sh" 2>/dev/null || true
"$ROOT/docker/docker-deploy.sh"

echo "[redeploy] Waiting for linknest healthcheck..."
for ((i=1; i<=HEALTH_WAIT_MAX; i++)); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' linknest 2>/dev/null || true)"
  if [[ "$status" == "healthy" ]]; then
    echo "[redeploy] Container is healthy."
    break
  fi
  if [[ "$status" != "running" && "$status" != "starting" && "$status" != "healthy" && $i -ge 5 ]]; then
    echo "[error] Container linknest is not running (status=${status:-unknown})."
    "${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" logs --tail=60 linknest || true
    exit 1
  fi
  if [[ $i -eq $HEALTH_WAIT_MAX ]]; then
    echo "[warn] Timed out waiting for healthy status (last=${status:-unknown})."
  fi
  sleep 3
done

echo "[redeploy] Verifying SSH/VNC gateway binaries in container..."
docker exec linknest sh -c 'command -v ttyd >/dev/null && ttyd --version; command -v ssh >/dev/null && echo ssh_ok; python3 -c "import websockify" && echo websockify_ok; printenv SSH_GATEWAY_PORT_MIN; printenv VNC_GATEWAY_PORT_MIN; printenv SSH_GATEWAY_X11_DISPLAY' || \
  echo "[warn] Could not exec into linknest for gateway checks yet."

echo
echo "[ok] Redeploy finished."
echo
echo "Access:"
echo "   HTTP:      http://localhost:8090"
echo "   HTTPS:     https://localhost:8443"
echo "   Mailpit:   http://localhost:8025"
echo
echo "SSH Terminal (Docker):"
echo "   ttyd ports: 18681-18780"
echo "   X11 DISPLAY: host.docker.internal:0.0"
echo
echo "VNC Viewer (Docker):"
echo "   websockify ports: 18881-18980"
echo
echo "Default login: admin / admin123"
echo
