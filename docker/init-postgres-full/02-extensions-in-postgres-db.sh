#!/bin/sh
# Also create extensions in the default "postgres" database so clients
# that connect without specifying -d get them. pg_cron is omitted here
# because it can only exist in the database set in cron.database_name (linknest_analytics).
set -e
psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'EOSQL'
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgres_fdw;
CREATE EXTENSION IF NOT EXISTS intarray;
EOSQL
