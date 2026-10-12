#!/usr/bin/env bash
# Mini-Supabase para testes de ponta a ponta, sem `supabase start`:
#   Postgres do sistema (banco próprio) + GoTrue e PostgREST em Docker (--network host)
#   + um proxy Node no lugar do Kong (scripts/supabase-mini-proxy.mjs).
#
#   ./scripts/supabase-mini.sh start   # sobe (ou confere) tudo e imprime as variáveis
#   ./scripts/supabase-mini.sh env     # só imprime as variáveis (export ...)
#   ./scripts/supabase-mini.sh status  # mostra o que está no ar
#   ./scripts/supabase-mini.sh reset   # apaga o banco e sobe do zero
#   ./scripts/supabase-mini.sh stop    # derruba containers e proxy (o banco fica)
#
#   eval "$(./scripts/supabase-mini.sh env)"   # para usar as variáveis no shell
#
# Precisa: Postgres 16+ em 127.0.0.1:5432 (postgres/postgres), Docker com as imagens
# supabase/gotrue:v2.196.0 e postgrest/postgrest:v16.2 já baixadas, Node 20+.
# Não mexe no banco dos testes de banco (alicerce_test).
#
# Variáveis opcionais: BANCO (bossa_e2e), PGHOST, PGPORT, PGUSER, PGPASSWORD,
# PORTA_API (54321), PORTA_GOTRUE (9999), PORTA_REST (3001), SITE_URL
# (http://localhost:3000), ESTADO (diretório com segredo, logs e pids).
set -euo pipefail

BANCO="${BANCO:-bossa_e2e}"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
PORTA_API="${PORTA_API:-54321}"
PORTA_GOTRUE="${PORTA_GOTRUE:-9999}"
PORTA_REST="${PORTA_REST:-3001}"
SITE_URL="${SITE_URL:-http://localhost:3000}"
ESTADO="${ESTADO:-${TMPDIR:-/tmp}/bossa-supabase-mini}"
IMG_GOTRUE="${IMG_GOTRUE:-supabase/gotrue:v2.196.0}"
IMG_REST="${IMG_REST:-postgrest/postgrest:v16.2}"
C_GOTRUE="bossa-mini-gotrue"
C_REST="bossa-mini-postgrest"
SENHA_AUTH_ADMIN="supabase_auth_admin"

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$ESTADO"

log() { echo "» $*" >&2; }
psql_() { psql -v ON_ERROR_STOP=1 -q -X -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$@"; }

# ---------- chaves ----------------------------------------------------------
segredo() {
  if [[ ! -s "$ESTADO/jwt_secret" ]]; then
    node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))' >"$ESTADO/jwt_secret"
  fi
  cat "$ESTADO/jwt_secret"
}

# JWT HS256 no formato das chaves "legadas" do Supabase (anon / service_role).
assinar() {
  local papel="$1"
  JWT_SECRET="$(segredo)" PAPEL="$papel" node -e '
    const c = require("crypto");
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const agora = Math.floor(Date.now() / 1000);
    const corpo = b64({ alg: "HS256", typ: "JWT" }) + "." +
      b64({ iss: "supabase-mini", ref: "local", role: process.env.PAPEL, aud: "authenticated", iat: agora, exp: agora + 10 * 365 * 86400 });
    const ass = c.createHmac("sha256", process.env.JWT_SECRET).update(corpo).digest("base64url");
    process.stdout.write(corpo + "." + ass);'
}

chaves() {
  [[ -s "$ESTADO/anon_key" ]] || assinar anon >"$ESTADO/anon_key"
  [[ -s "$ESTADO/service_key" ]] || assinar service_role >"$ESTADO/service_key"
}

imprimir_env() {
  chaves
  cat <<EOF
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:$PORTA_API
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$(cat "$ESTADO/anon_key")
export SUPABASE_SECRET_KEY=$(cat "$ESTADO/service_key")
export NEXT_PUBLIC_APP_URL=$SITE_URL
export E2E_DATABASE_URL=postgresql://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$BANCO
EOF
}

# ---------- banco -----------------------------------------------------------
banco_existe() {
  [[ "$(psql_ -d postgres -tAc "select 1 from pg_database where datname = '$BANCO'")" == "1" ]]
}

# Impressão digital do esquema: mudou uma migração, o banco é recriado no próximo start.
digital() {
  cat "$raiz"/supabase/local/00_shim_supabase.sql "$raiz"/supabase/migrations/*.sql \
    "$raiz"/supabase/local/10_pos_gotrue.sql | sha256sum | cut -c1-16
}

banco_pronto() {
  banco_existe && [[ "$(cat "$ESTADO/banco_pronto.$BANCO" 2>/dev/null)" == "$(digital)" ]]
}

preparar_papeis() {
  # Papéis valem para o servidor inteiro; criar/ajustar não afeta o alicerce_test.
  psql_ -d postgres <<SQL
do \$\$
begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin login noinherit createrole;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end \$\$;
alter role supabase_auth_admin with login noinherit createrole password '$SENHA_AUTH_ADMIN';
alter role supabase_auth_admin set search_path = auth;
SQL
}

criar_banco() {
  log "recriando o banco $BANCO"
  rm -f "$ESTADO/banco_pronto.$BANCO"
  psql_ -d postgres -c "drop database if exists \"$BANCO\" with (force)"
  psql_ -d postgres -c "create database \"$BANCO\""
  preparar_papeis
  psql_ -d "$BANCO" <<SQL
create schema if not exists auth authorization supabase_auth_admin;
create schema if not exists extensions;
grant create on database "$BANCO" to supabase_auth_admin;
grant all on schema extensions to supabase_auth_admin;
-- O GoTrue usa gen_random_uuid() e, em migrações antigas, uuid-ossp.
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
SQL
}

migrar_gotrue() {
  log "aplicando as migrações do GoTrue (schema auth é dele)"
  docker run --rm --network host \
    -e GOTRUE_DB_DRIVER=postgres \
    -e "GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:$SENHA_AUTH_ADMIN@$PGHOST:$PGPORT/$BANCO?search_path=auth&sslmode=disable" \
    -e "GOTRUE_JWT_SECRET=$(segredo)" \
    -e "API_EXTERNAL_URL=http://127.0.0.1:$PORTA_API/auth/v1" \
    -e "GOTRUE_SITE_URL=$SITE_URL" \
    "$IMG_GOTRUE" auth migrate >"$ESTADO/gotrue-migrate.log" 2>&1 || {
      tail -40 "$ESTADO/gotrue-migrate.log" >&2
      echo "✗ migrações do GoTrue falharam (log completo em $ESTADO/gotrue-migrate.log)" >&2
      exit 1
    }
}

aplicar_esquema() {
  log "aplicando o esqueleto do Supabase (sem recriar auth.users)"
  psql_ -d "$BANCO" -f "$raiz/supabase/local/00_shim_supabase.sql"
  for arquivo in "$raiz"/supabase/migrations/*.sql; do
    log "aplicando $(basename "$arquivo")"
    psql_ -d "$BANCO" -f "$arquivo"
  done
  log "ajustes para GoTrue/PostgREST (auth.uid/role/jwt, authenticator)"
  psql_ -d "$BANCO" -f "$raiz/supabase/local/10_pos_gotrue.sql"
  digital >"$ESTADO/banco_pronto.$BANCO"
}

# ---------- serviços --------------------------------------------------------
container_no_ar() { [[ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" == "true" ]]; }

subir_gotrue() {
  if container_no_ar "$C_GOTRUE"; then return; fi
  docker rm -f "$C_GOTRUE" >/dev/null 2>&1 || true
  log "subindo o GoTrue em 127.0.0.1:$PORTA_GOTRUE"
  docker run -d --name "$C_GOTRUE" --network host \
    -e GOTRUE_API_HOST=127.0.0.1 \
    -e "PORT=$PORTA_GOTRUE" \
    -e "API_EXTERNAL_URL=http://127.0.0.1:$PORTA_API/auth/v1" \
    -e GOTRUE_DB_DRIVER=postgres \
    -e "GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:$SENHA_AUTH_ADMIN@$PGHOST:$PGPORT/$BANCO?search_path=auth&sslmode=disable" \
    -e "GOTRUE_SITE_URL=$SITE_URL" \
    -e "GOTRUE_URI_ALLOW_LIST=$SITE_URL/**,http://127.0.0.1:3000/**" \
    -e GOTRUE_DISABLE_SIGNUP=false \
    -e "GOTRUE_JWT_SECRET=$(segredo)" \
    -e GOTRUE_JWT_AUD=authenticated \
    -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
    -e GOTRUE_JWT_ADMIN_ROLES=service_role \
    -e GOTRUE_JWT_EXP=3600 \
    -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true \
    -e GOTRUE_EXTERNAL_PHONE_ENABLED=false \
    -e GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=false \
    -e GOTRUE_MAILER_AUTOCONFIRM=true \
    -e GOTRUE_SMS_AUTOCONFIRM=true \
    -e GOTRUE_MFA_TOTP_ENROLL_ENABLED=true \
    -e GOTRUE_MFA_TOTP_VERIFY_ENABLED=true \
    -e GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 \
    -e GOTRUE_RATE_LIMIT_TOKEN_REFRESH=10000 \
    -e GOTRUE_RATE_LIMIT_VERIFY=10000 \
    -e GOTRUE_RATE_LIMIT_SIGN_UP_SIGN_IN=10000 \
    -e GOTRUE_DB_MIGRATIONS_PATH=/usr/local/etc/auth/migrations \
    -e GOTRUE_LOG_LEVEL=warn \
    "$IMG_GOTRUE" auth serve >/dev/null
}

subir_postgrest() {
  if container_no_ar "$C_REST"; then return; fi
  docker rm -f "$C_REST" >/dev/null 2>&1 || true
  log "subindo o PostgREST em 127.0.0.1:$PORTA_REST"
  docker run -d --name "$C_REST" --network host \
    -e "PGRST_DB_URI=postgres://authenticator:authenticator@$PGHOST:$PGPORT/$BANCO?sslmode=disable" \
    -e PGRST_DB_SCHEMAS=public \
    -e PGRST_DB_EXTRA_SEARCH_PATH=public,extensions \
    -e PGRST_DB_ANON_ROLE=anon \
    -e "PGRST_JWT_SECRET=$(segredo)" \
    -e PGRST_DB_USE_LEGACY_GUCS=false \
    -e "PGRST_SERVER_PORT=$PORTA_REST" \
    -e PGRST_SERVER_HOST=127.0.0.1 \
    -e PGRST_DB_MAX_ROWS=1000 \
    -e PGRST_LOG_LEVEL=warn \
    "$IMG_REST" >/dev/null
}

proxy_no_ar() { [[ -f "$ESTADO/proxy.pid" ]] && kill -0 "$(cat "$ESTADO/proxy.pid")" 2>/dev/null; }

subir_proxy() {
  if proxy_no_ar; then return; fi
  log "subindo o proxy (no lugar do Kong) em 127.0.0.1:$PORTA_API"
  PORTA="$PORTA_API" GOTRUE_URL="http://127.0.0.1:$PORTA_GOTRUE" POSTGREST_URL="http://127.0.0.1:$PORTA_REST" \
    nohup node "$raiz/scripts/supabase-mini-proxy.mjs" >"$ESTADO/proxy.log" 2>&1 &
  echo $! >"$ESTADO/proxy.pid"
}

esperar() {
  local nome="$1" url="$2" i
  for i in $(seq 1 60); do
    if curl -fsS -o /dev/null "$url" 2>/dev/null; then return 0; fi
    sleep 0.5
  done
  echo "✗ $nome não respondeu em $url" >&2
  [[ "$nome" == GoTrue ]] && docker logs --tail 40 "$C_GOTRUE" >&2 || true
  [[ "$nome" == PostgREST ]] && docker logs --tail 40 "$C_REST" >&2 || true
  exit 1
}

parar() {
  log "derrubando GoTrue, PostgREST e o proxy"
  docker rm -f "$C_GOTRUE" "$C_REST" >/dev/null 2>&1 || true
  if proxy_no_ar; then kill "$(cat "$ESTADO/proxy.pid")" 2>/dev/null || true; fi
  rm -f "$ESTADO/proxy.pid"
}

iniciar() {
  docker info >/dev/null 2>&1 || { echo "✗ Docker fora do ar (tente: dockerd >/tmp/dockerd.log 2>&1 &)" >&2; exit 1; }
  segredo >/dev/null
  chaves
  if ! banco_pronto; then
    docker rm -f "$C_GOTRUE" "$C_REST" >/dev/null 2>&1 || true
    criar_banco
    migrar_gotrue
    aplicar_esquema
  else
    preparar_papeis
  fi
  subir_gotrue
  subir_postgrest
  subir_proxy
  esperar GoTrue "http://127.0.0.1:$PORTA_GOTRUE/health"
  esperar PostgREST "http://127.0.0.1:$PORTA_REST/"
  esperar proxy "http://127.0.0.1:$PORTA_API/__saude"
  # Esquema novo depois de o PostgREST subir: recarrega o cache.
  psql_ -d "$BANCO" -c "notify pgrst, 'reload schema'" >/dev/null
  curl -fsS -o /dev/null -H "apikey: $(cat "$ESTADO/anon_key")" "http://127.0.0.1:$PORTA_API/auth/v1/settings" \
    || { echo "✗ /auth/v1 não responde pelo proxy" >&2; exit 1; }
  log "mini-Supabase no ar (estado em $ESTADO). Variáveis:"
  imprimir_env
}

status() {
  container_no_ar "$C_GOTRUE" && echo "GoTrue:    no ar (:$PORTA_GOTRUE)" || echo "GoTrue:    parado"
  container_no_ar "$C_REST" && echo "PostgREST: no ar (:$PORTA_REST)" || echo "PostgREST: parado"
  proxy_no_ar && echo "proxy:     no ar (:$PORTA_API)" || echo "proxy:     parado"
  banco_existe && echo "banco:     $BANCO existe" || echo "banco:     $BANCO não existe"
}

case "${1:-start}" in
  start) iniciar ;;
  stop) parar ;;
  reset)
    parar
    rm -f "$ESTADO/banco_pronto.$BANCO"
    iniciar
    ;;
  env) imprimir_env ;;
  status) status ;;
  *)
    echo "uso: $0 start|stop|reset|env|status" >&2
    exit 2
    ;;
esac
