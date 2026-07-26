#!/usr/bin/env bash
# Applies every migration to a throwaway Postgres database and runs the security
# tests against it.
#
# Supabase's hosted schema (auth.users, auth.uid(), storage.*) is stood up by
# `00_supabase_shim.sql` so the real policies can be exercised without
# provisioning a project. The migrations themselves are applied unmodified —
# the point is to test what actually ships.
#
# Usage:
#   ./supabase/test/run-db-tests.sh                  # manage a local cluster
#   DATABASE_URL=postgres://... ./run-db-tests.sh    # use an existing server

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PGDATA_DIR="${PGDATA_DIR:-/var/tmp/cleanquote-pgdata}"
SOCKET_DIR="${SOCKET_DIR:-/var/tmp/cleanquote-pgsock}"
PGPORT="${PGPORT:-55432}"
DB_NAME="${DB_NAME:-cleanquote_test}"

started_cluster=0

cleanup() {
  if [[ "$started_cluster" == "1" ]]; then
    su postgres -c "$PG_BIN/pg_ctl -D $PGDATA_DIR stop -m immediate" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ -n "${DATABASE_URL:-}" ]]; then
  PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1)
  ADMIN_PSQL=("${PSQL[@]}")
else
  echo "Starting a throwaway Postgres cluster in $PGDATA_DIR"
  rm -rf "$PGDATA_DIR"
  mkdir -p "$PGDATA_DIR" "$SOCKET_DIR"

  # initdb refuses to run as root, so the cluster runs as the postgres user when
  # this script is invoked with elevated privileges (as it is in CI containers).
  if [[ "$(id -u)" == "0" ]]; then
    chown postgres:postgres "$PGDATA_DIR" "$SOCKET_DIR"
    chmod 700 "$PGDATA_DIR"
    su postgres -c "$PG_BIN/initdb -D $PGDATA_DIR -U postgres --auth=trust" >/dev/null
    su postgres -c "$PG_BIN/pg_ctl -D $PGDATA_DIR -o '-k $SOCKET_DIR -p $PGPORT -c listen_addresses=' -l $PGDATA_DIR/server.log start" >/dev/null
  else
    "$PG_BIN/initdb" -D "$PGDATA_DIR" -U postgres --auth=trust >/dev/null
    "$PG_BIN/pg_ctl" -D "$PGDATA_DIR" -o "-k $SOCKET_DIR -p $PGPORT -c listen_addresses=" -l "$PGDATA_DIR/server.log" start >/dev/null
  fi
  started_cluster=1
  sleep 1

  ADMIN_PSQL=(psql -h "$SOCKET_DIR" -p "$PGPORT" -U postgres -v ON_ERROR_STOP=1)
  "${ADMIN_PSQL[@]}" -q -c "drop database if exists $DB_NAME" -c "create database $DB_NAME"
  PSQL=(psql -h "$SOCKET_DIR" -p "$PGPORT" -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1)
fi

echo "Applying the Supabase compatibility shim"
"${PSQL[@]}" -q -f "$HERE/00_supabase_shim.sql"

echo "Applying migrations"
for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "  $(basename "$migration")"
  "${PSQL[@]}" -q -f "$migration"
done

echo "Seeding two tenants"
"${PSQL[@]}" -q -f "$HERE/10_seed_two_tenants.sql"

echo "Running security tests"
"${PSQL[@]}" -f "$HERE/20_rls_isolation.test.sql"
