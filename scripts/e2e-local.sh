#!/usr/bin/env bash
# Testes de ponta a ponta das telas novas (Equipe, Custos, Assistente) contra um
# Supabase local de verdade (scripts/supabase-mini.sh) e uma API FALSA da
# Anthropic (scripts/anthropic-falso.mjs). Nada sai da máquina.
#
#   ./scripts/e2e-local.sh                      # sobe tudo, roda e2e/modulos-novos.spec.ts e derruba os apps
#   ./scripts/e2e-local.sh e2e/outro.spec.ts    # outros argumentos vão para o `playwright test`
#   ./scripts/e2e-local.sh --subir              # só sobe tudo e deixa no ar (para explorar no navegador)
#   ./scripts/e2e-local.sh --parar              # derruba os apps, a IA falsa e o mini-Supabase
#
# Sobe DOIS servidores do mesmo build de produção (next build + next start):
#   :3000  sem ANTHROPIC_API_KEY (como vem no .env.example) — telas mostram "IA não configurada"
#   :3100  com ANTHROPIC_BASE_URL apontando para a IA falsa e uma chave qualquer
# (o app lê a chave na hora do pedido, então um processo só não testa os dois casos).
# Os cookies de sessão valem para os dois, porque cookie não separa porta.
#
# Variáveis: SEM_BUILD=1 reaproveita o .next existente (precisa ter sido feito
# com as variáveis do mini-Supabase); PORTA_APP (3000); PORTA_APP_IA (3100);
# PORTA_IA_FALSA (4010); CHROMIUM_PATH (padrão: /opt/pw-browsers/chromium, se existir);
# MANTER=1 não derruba nada no fim.
#
# Atenção: o build fica em .next com as chaves LOCAIS embutidas (NEXT_PUBLIC_*).
# Antes de publicar, rode `npm run build` de novo com as variáveis de produção.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$raiz"

PORTA_APP="${PORTA_APP:-3000}"
PORTA_APP_IA="${PORTA_APP_IA:-3100}"
PORTA_IA_FALSA="${PORTA_IA_FALSA:-4010}"
ESTADO="${ESTADO:-${TMPDIR:-/tmp}/bossa-supabase-mini}"
export ESTADO
mkdir -p "$ESTADO"

log() { echo "» $*" >&2; }

no_ar() { curl -fsS -o /dev/null --max-time 2 "$1" 2>/dev/null; }

esperar() {
  local nome="$1" url="$2" segundos="${3:-90}" i
  for ((i = 0; i < segundos * 2; i++)); do
    if no_ar "$url"; then return 0; fi
    sleep 0.5
  done
  echo "✗ $nome não respondeu em $url" >&2
  return 1
}

matar_pid() {
  local arquivo="$ESTADO/$1.pid"
  if [[ -f "$arquivo" ]]; then
    local pid
    pid="$(cat "$arquivo")"
    # next start abre filhos: derruba o grupo inteiro.
    kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    rm -f "$arquivo"
  fi
}

parar_apps() {
  log "derrubando os apps e a IA falsa"
  matar_pid app
  matar_pid app-ia
  matar_pid ia-falsa
}

subir_ia_falsa() {
  if no_ar "http://127.0.0.1:$PORTA_IA_FALSA/__saude"; then return; fi
  log "subindo a IA falsa em 127.0.0.1:$PORTA_IA_FALSA"
  PORTA="$PORTA_IA_FALSA" setsid nohup node scripts/anthropic-falso.mjs >"$ESTADO/ia-falsa.log" 2>&1 &
  echo $! >"$ESTADO/ia-falsa.pid"
  esperar "IA falsa" "http://127.0.0.1:$PORTA_IA_FALSA/__saude" 20
}

subir_app() {
  local nome="$1" porta="$2"
  shift 2
  if no_ar "http://localhost:$porta/"; then
    log "já há algo respondendo em :$porta — reaproveitando (derrube com --parar se for de outro build)"
    return
  fi
  log "subindo o app ($nome) em http://localhost:$porta"
  env "$@" setsid nohup npx next start -p "$porta" >"$ESTADO/$nome.log" 2>&1 &
  echo $! >"$ESTADO/$nome.pid"
}

subir_tudo() {
  log "mini-Supabase"
  eval "$(./scripts/supabase-mini.sh start)"
  export NEXT_PUBLIC_APP_URL="http://localhost:$PORTA_APP"

  subir_ia_falsa

  if [[ "${SEM_BUILD:-}" != "1" ]]; then
    if no_ar "http://localhost:$PORTA_APP/" || no_ar "http://localhost:$PORTA_APP_IA/"; then
      parar_apps
    fi
    log "next build (com as variáveis do mini-Supabase; log em $ESTADO/build.log)"
    npx next build >"$ESTADO/build.log" 2>&1 || {
      tail -40 "$ESTADO/build.log" >&2
      echo "✗ next build falhou" >&2
      exit 1
    }
  fi

  # Um processo sem chave da IA (padrão do .env.example) e outro com a IA falsa.
  subir_app app "$PORTA_APP" ANTHROPIC_API_KEY= ANTHROPIC_BASE_URL=
  subir_app app-ia "$PORTA_APP_IA" \
    ANTHROPIC_API_KEY=chave-falsa-de-teste \
    "ANTHROPIC_BASE_URL=http://127.0.0.1:$PORTA_IA_FALSA"
  esperar "app" "http://localhost:$PORTA_APP/" 90
  esperar "app com IA falsa" "http://localhost:$PORTA_APP_IA/" 90

  cat >"$ESTADO/e2e.env" <<EOF
export NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
export SUPABASE_SECRET_KEY=$SUPABASE_SECRET_KEY
export NEXT_PUBLIC_APP_URL=http://localhost:$PORTA_APP
export E2E_URL_COM_IA=http://localhost:$PORTA_APP_IA
export E2E_IA_FALSA_URL=http://127.0.0.1:$PORTA_IA_FALSA
export E2E_DATABASE_URL=$E2E_DATABASE_URL
export E2E_SERVIDOR_EXTERNO=1
EOF
  log "tudo no ar. Variáveis para o Playwright em $ESTADO/e2e.env"
}

case "${1:-}" in
  --parar)
    parar_apps
    ./scripts/supabase-mini.sh stop
    exit 0
    ;;
  --subir)
    subir_tudo
    echo "Para rodar os testes à mão:  source $ESTADO/e2e.env && npx playwright test e2e/modulos-novos.spec.ts"
    exit 0
    ;;
esac

subir_tudo
# shellcheck disable=SC1091
source "$ESTADO/e2e.env"
if [[ -z "${CHROMIUM_PATH:-}" && -x /opt/pw-browsers/chromium ]]; then
  export CHROMIUM_PATH=/opt/pw-browsers/chromium
fi

argumentos=("$@")
[[ ${#argumentos[@]} -eq 0 ]] && argumentos=(e2e/modulos-novos.spec.ts)

status=0
npx playwright test "${argumentos[@]}" || status=$?

if [[ "${MANTER:-}" != "1" ]]; then parar_apps; fi
exit "$status"
