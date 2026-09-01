#!/usr/bin/env bash
# One-shot local bring-up. Run:  bash scripts/quickstart.sh
# Idempotent — safe to re-run. Prompts only for values still missing from .env.
set -euo pipefail
cd "$(dirname "$0")/.."

BOLD=$'\033[1m'; DIM=$'\033[2m'; GRN=$'\033[32m'; YEL=$'\033[33m'; RST=$'\033[0m'
say() { printf '%s\n' "$*"; }
step() { printf '\n%s▶ %s%s\n' "$BOLD" "$*" "$RST"; }

# --- .env ---------------------------------------------------------------------
[ -f .env ] || cp .env.example .env

# get_env KEY -> prints current value (unquoted)
get_env() { grep -E "^$1=" .env | head -1 | sed -E "s/^$1=\"?([^\"]*)\"?.*/\1/"; }

# set_env KEY VALUE  (value passed via env to avoid all quoting pain)
set_env() {
  KEY="$1" VAL="$2" python3 - <<'PY'
import os, pathlib, re
key, val = os.environ["KEY"], os.environ["VAL"]
p = pathlib.Path(".env"); lines = p.read_text().splitlines()
out, seen = [], False
for ln in lines:
    if re.match(rf"^{re.escape(key)}=", ln):
        out.append(f'{key}="{val}"'); seen = True
    else:
        out.append(ln)
if not seen: out.append(f'{key}="{val}"')
p.write_text("\n".join(out) + "\n")
PY
}

prompt_if_missing() {
  local key="$1" label="$2" cur
  cur="$(get_env "$key" || true)"
  if [ -n "$cur" ]; then
    say "  ${GRN}✓${RST} $key already set"
    return
  fi
  printf '  %s%s%s\n  paste value (input hidden), or Enter to skip: ' "$YEL" "$label" "$RST"
  read -rs val; echo
  [ -n "$val" ] && set_env "$key" "$val" && say "  ${GRN}✓${RST} $key saved" || say "  ${DIM}– skipped${RST}"
}

step "Secrets  (${DIM}stored only in .env, which is gitignored${RST})"
prompt_if_missing GROQ_API_KEY       "GROQ_API_KEY        console.groq.com/keys"
prompt_if_missing GOOGLE_CLIENT_ID   "GOOGLE_CLIENT_ID    ...apps.googleusercontent.com"
prompt_if_missing GOOGLE_CLIENT_SECRET "GOOGLE_CLIENT_SECRET  GOCSPX-..."

# --- deps ------------------------------------------------------------------
step "Dependencies"
[ -d node_modules ] || npm install
say "  ${GRN}✓${RST} node_modules"

# --- database ------------------------------------------------------------------
step "Postgres"
if ! command -v pg_ctl >/dev/null 2>&1 && [ ! -x "$(brew --prefix)/opt/postgresql@16/bin/pg_ctl" ]; then
  say "  ${YEL}installing postgresql@16 via Homebrew...${RST}"
  brew install postgresql@16
fi
bash scripts/dev-db.sh start
bash scripts/dev-db.sh create

step "Schema + seed"
npx prisma migrate deploy
npx prisma generate >/dev/null
npx tsx prisma/seed.ts

# --- verify ------------------------------------------------------------------
step "Verify"
npx tsc --noEmit && say "  ${GRN}✓${RST} typecheck"
npm test --silent >/dev/null 2>&1 && say "  ${GRN}✓${RST} tests" || say "  ${YEL}! tests skipped/failed${RST}"

GROQ_SET="$(get_env GROQ_API_KEY || true)"
GID_SET="$(get_env GOOGLE_CLIENT_ID || true)"

step "Done"
say "  Start the app:   ${BOLD}npm run dev${RST}   then open http://localhost:3000"
say "  Background jobs:  ${BOLD}npm run worker${RST}   (optional)"
[ -z "$GROQ_SET" ] && say "  ${YEL}note:${RST} GROQ_API_KEY still empty — the agent/chat will error until it is set (re-run this script)."
[ -z "$GID_SET" ]  && say "  ${YEL}note:${RST} GOOGLE_CLIENT_ID still empty — sign-in / connectors disabled until set (re-run this script)."
