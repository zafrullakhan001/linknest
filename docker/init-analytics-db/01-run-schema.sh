#!/bin/bash
# Runs analytics schema.sql on first container start.
# Requires repo root mounted at /app (docker-compose volume).
set -e
echo "Creating analytics schema and tables..."
psql -v ON_ERROR_STOP=1 -U postgres -d "${POSTGRES_DB:-analytics}" -f /app/analytics/schema.sql
echo "Analytics schema ready."
