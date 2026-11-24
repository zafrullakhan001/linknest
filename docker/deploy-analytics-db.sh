#!/usr/bin/env bash
# Deploy PostgreSQL analytics container (TimescaleDB, postgres/postgres, port 5433)
# Auto-creates database "analytics" and runs schema.sql on first start.
#
# Run from repo root: ./docker/deploy-analytics-db.sh
# Or:  ./docker/deploy-analytics-db.sh --no-detach
#      ./docker/deploy-analytics-db.sh --stop

set -e
COMPOSE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.analytics.yml"
REPO_ROOT="$(cd "$COMPOSE_DIR/.." && pwd)"

if [ ! -f "$COMPOSE_FILE" ]; then
    echo "Compose file not found: $COMPOSE_FILE"
    exit 1
fi

cd "$REPO_ROOT"

if [ "$1" = "--stop" ]; then
    echo "Stopping analytics database container..."
    docker compose -f "$COMPOSE_FILE" down
    echo "Done."
    exit 0
fi

DETACH="--detach"
[ "$1" = "--no-detach" ] && DETACH=""

echo "=== Deploy Analytics PostgreSQL (TimescaleDB) ==="
echo "Database: analytics  |  User: postgres  |  Password: postgres  |  Port: 5433"
echo "Schema and tables are created automatically on first start."
echo ""

docker compose -f "$COMPOSE_FILE" up $DETACH

echo ""
echo "Connect: psql -h localhost -p 5433 -U postgres -d analytics"
echo "In Linknest: set Performance Analytics DB to host=localhost, port=5433, database=analytics, user=postgres, password=postgres"
echo ""
