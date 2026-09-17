#!/usr/bin/env bash
# Recria um banco Postgres local com o mesmo esquema do Supabase e aplica todas as
# migrações. Usado pelos testes de banco (tests/db) e para conferir as migrações
# antes de mandar para a nuvem.
#
#   ./scripts/db-local.sh              # banco alicerce_test em 127.0.0.1:5432
#   BANCO=outro ./scripts/db-local.sh  # outro nome de banco
#
# Exige um Postgres 16+ acessível com as extensões btree_gist disponíveis.
set -euo pipefail

BANCO="${BANCO:-alicerce_test}"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
psql_() { psql -v ON_ERROR_STOP=1 -q -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$@"; }

echo "» recriando o banco $BANCO"
psql_ -d postgres -c "drop database if exists \"$BANCO\" with (force)"
psql_ -d postgres -c "create database \"$BANCO\""

echo "» aplicando o esqueleto do Supabase (papéis, schema auth, privilégios)"
psql_ -d "$BANCO" -f "$raiz/supabase/local/00_shim_supabase.sql"

for arquivo in "$raiz"/supabase/migrations/*.sql; do
  echo "» aplicando $(basename "$arquivo")"
  psql_ -d "$BANCO" -f "$arquivo"
done

echo "✓ banco $BANCO pronto em postgresql://$PGUSER@$PGHOST:$PGPORT/$BANCO"
