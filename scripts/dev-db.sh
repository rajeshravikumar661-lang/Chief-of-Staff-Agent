#!/usr/bin/env bash
# Local Postgres lifecycle for development (Homebrew postgresql@16).
# Usage: scripts/dev-db.sh {start|stop|status|create|reset}
set -euo pipefail

PG_PREFIX="$(brew --prefix)/opt/postgresql@16"
PG_DATA="$(brew --prefix)/var/postgresql@16"
PG_BIN="$PG_PREFIX/bin"
DB_NAME="${DB_NAME:-cos_agent}"
export PATH="$PG_BIN:$PATH"
# macOS: without a concrete locale the postmaster aborts ("became multithreaded during startup")
export LC_ALL="${LC_ALL:-en_US.UTF-8}" LANG="${LANG:-en_US.UTF-8}"

case "${1:-status}" in
  start)
    if "$PG_BIN/pg_isready" -q 2>/dev/null; then
      echo "postgres already running"
    else
      "$PG_BIN/pg_ctl" -D "$PG_DATA" -l "$PG_DATA/server.log" start
      sleep 1
      "$PG_BIN/pg_isready"
    fi
    ;;
  stop)
    "$PG_BIN/pg_ctl" -D "$PG_DATA" stop || true
    ;;
  status)
    "$PG_BIN/pg_ctl" -D "$PG_DATA" status || true
    ;;
  create)
    "$PG_BIN/createdb" "$DB_NAME" 2>/dev/null && echo "created $DB_NAME" || echo "$DB_NAME already exists"
    ;;
  reset)
    "$PG_BIN/dropdb" --if-exists "$DB_NAME"
    "$PG_BIN/createdb" "$DB_NAME"
    echo "recreated $DB_NAME"
    ;;
  *)
    echo "usage: $0 {start|stop|status|create|reset}" >&2
    exit 1
    ;;
esac
