#!/usr/bin/env bash
# ============================================================
#  SMECO 2.0 — Automatic Setup & Launch
#
#  Usage:
#  chmod +x start.sh
#  ./start.sh
#
#  Current architecture:
#  Frontend: Vite + Three.js
#  Backend: Express + PostgreSQL + JWT + SSE
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
BOLD='\033[1m'
RESET='\033[0m'

log()    { printf "%b[SMECO]%b %s\n" "$CYAN" "$RESET" "$1"; }
ok()     { printf "%b[OK]%b     %s\n" "$GREEN" "$RESET" "$1"; }
warn()   { printf "%b[WARN]%b   %s\n" "$YELLOW" "$RESET" "$1"; }
error()  { printf "%b[ERROR]%b  %s\n" "$RED" "$RESET" "$1"; exit 1; }
header() { printf "\n%b%s%b\n" "$BOLD" "$1" "$RESET"; printf "────────────────────────────────────\n"; }

FRONTEND_PORT=5173
BACKEND_PORT=3001

FRONTEND_URL="http://localhost:$FRONTEND_PORT"
BACKEND_URL="http://localhost:$BACKEND_PORT"
BACKEND_HEALTH_URL="$BACKEND_URL/api/health"
BACKEND_STATUS_URL="$BACKEND_URL/api/status"
BACKEND_EVENTS_URL="$BACKEND_URL/api/events"

BACKEND_PID=""
FRONTEND_PID=""

clear

printf "%b" "$CYAN$BOLD"
printf "███████╗███╗   ███╗███████╗ ██████╗ ██████╗ \n"
printf "██╔════╝████╗ ████║██╔════╝██╔════╝██╔═══██╗\n"
printf "███████╗██╔████╔██║█████╗  ██║     ██║   ██║\n"
printf "╚════██║██║╚██╔╝██║██╔══╝  ██║     ██║   ██║\n"
printf "███████║██║ ╚═╝ ██║███████╗╚██████╗╚██████╔╝\n"
printf "╚══════╝╚═╝     ╚═╝╚══════╝ ╚═════╝ ╚═════╝ \n"
printf "%b\n" "$RESET"

printf "%bSMECO 2.0 — 3D Ship Engine Platform%b\n" "$BOLD" "$RESET"
printf "%bAutomatic setup for Frontend + Backend + PostgreSQL/SSE%b\n\n" "$BLUE" "$RESET"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

while [ ! -f "$PROJECT_ROOT/package.json" ] && [ "$PROJECT_ROOT" != "/" ]; do
  PROJECT_ROOT="$(dirname "$PROJECT_ROOT")"
done

[ ! -f "$PROJECT_ROOT/package.json" ] && error "package.json was not found. Run this script from the project root directory."

cd "$PROJECT_ROOT"
BACKEND_DIR="$PROJECT_ROOT/backend"

log "Working directory: $PROJECT_ROOT"

is_port_in_use() {
  local PORT=$1

  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  elif command -v netstat >/dev/null 2>&1; then
    netstat -ano 2>/dev/null | grep ":$PORT" | grep -q "LISTENING"
    return $?
  else
    return 1
  fi
}

kill_port() {
  local PORT=$1
  local PID=""

  if ! is_port_in_use "$PORT"; then
    return 0
  fi

  warn "Port $PORT is already in use"
  log "Stopping existing process on port $PORT..."

  if command -v lsof >/dev/null 2>&1; then
    PID=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)

    if [ -n "$PID" ]; then
      kill -9 $PID 2>/dev/null || true
    fi

  elif command -v netstat >/dev/null 2>&1 && command -v taskkill.exe >/dev/null 2>&1; then
    PID=$(netstat -ano | grep ":$PORT" | grep "LISTENING" | awk '{print $5}' | head -n 1)

    if [ -n "$PID" ]; then
      taskkill.exe //PID "$PID" //F >/dev/null 2>&1 || true
    fi

  elif command -v fuser >/dev/null 2>&1; then
    fuser -k "$PORT/tcp" >/dev/null 2>&1 || true
  fi

  sleep 1

  if is_port_in_use "$PORT"; then
    error "Could not release port $PORT"
  else
    ok "Port $PORT released"
  fi
}

ensure_env_value() {
  local FILE=$1
  local KEY=$2
  local VALUE=$3

  if [ ! -f "$FILE" ]; then
    touch "$FILE"
  fi

  if grep -q "^$KEY=" "$FILE"; then
    return 0
  fi

  printf "\n%s=%s\n" "$KEY" "$VALUE" >> "$FILE"
  ok "Added $KEY to $FILE"
}

has_env_key() {
  local FILE=$1
  local KEY=$2

  [ -f "$FILE" ] && grep -q "^$KEY=" "$FILE"
}

wait_for_backend() {
  local URL=$1
  local MAX_ATTEMPTS=20
  local ATTEMPT=1

  while [ "$ATTEMPT" -le "$MAX_ATTEMPTS" ]; do
    if command -v curl >/dev/null 2>&1; then
      if curl -s "$URL" >/dev/null 2>&1; then
        return 0
      fi
    else
      if kill -0 "$BACKEND_PID" 2>/dev/null; then
        return 0
      fi
    fi

    sleep 1
    ATTEMPT=$((ATTEMPT + 1))
  done

  return 1
}

open_browser() {
  local URL=$1

  if command -v cmd.exe >/dev/null 2>&1; then
    cmd.exe /c start "" "$URL" >/dev/null 2>&1 &
  elif command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -Command "Start-Process '$URL'" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1 &
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 &
  else
    warn "Could not open the browser automatically."
  fi
}

cleanup() {
  printf "\n"
  log "Shutting down servers..."

  if command -v taskkill.exe >/dev/null 2>&1; then
    [ -n "$BACKEND_PID" ] && taskkill.exe //F //T //PID "$BACKEND_PID" >/dev/null 2>&1 || true
    [ -n "$FRONTEND_PID" ] && taskkill.exe //F //T //PID "$FRONTEND_PID" >/dev/null 2>&1 || true
  else
    [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
    [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  fi

  kill_port "$FRONTEND_PORT"
  kill_port "$BACKEND_PORT"

  ok "Servers stopped"
  exit 0
}

trap cleanup SIGINT SIGTERM

header "1. Checking Node.js and npm"

if ! command -v node >/dev/null 2>&1; then
  error "Node.js is not installed. Install Node.js 18+ from https://nodejs.org"
fi

NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)

if [ "$NODE_MAJOR" -lt 18 ]; then
  warn "Node.js 18+ is recommended. Current version: $(node -v)"
else
  ok "Node.js $(node -v)"
fi

if ! command -v npm >/dev/null 2>&1; then
  error "npm was not found. Reinstall Node.js."
fi

ok "npm $(npm -v)"

header "2. Checking Project Structure"

[ ! -f "$PROJECT_ROOT/package.json" ] && error "Frontend package.json missing"
ok "Frontend package.json found"

[ ! -d "$BACKEND_DIR" ] && error "backend/ directory missing"
[ ! -f "$BACKEND_DIR/package.json" ] && error "backend/package.json missing"
[ ! -f "$BACKEND_DIR/server.js" ] && error "backend/server.js missing"

ok "Backend structure found"

if [ ! -f "$PROJECT_ROOT/public/glb/SFIA.glb" ]; then
  warn "public/glb/SFIA.glb was not found. Viewer may not load the 3D model."
else
  ok "3D model found: public/glb/SFIA.glb"
fi

header "3. Preparing Directories"

mkdir -p "$PROJECT_ROOT/public/docs/components"
mkdir -p "$PROJECT_ROOT/public/docs/main_docs"
mkdir -p "$PROJECT_ROOT/public/docs/help"
mkdir -p "$PROJECT_ROOT/public/draco/gltf"

ok "Public document directories prepared"

header "4. Environment Configuration"

if [ ! -f "$PROJECT_ROOT/.env" ]; then
  if [ -f "$PROJECT_ROOT/.env.example" ]; then
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
    ok "Frontend .env created from .env.example"
  else
    touch "$PROJECT_ROOT/.env"
    ok "Frontend .env created"
  fi
else
  ok "Frontend .env exists"
fi

ensure_env_value "$PROJECT_ROOT/.env" "VITE_API_BASE_URL" "$BACKEND_URL"

if [ ! -f "$BACKEND_DIR/.env" ]; then
  if [ -f "$BACKEND_DIR/.env.example" ]; then
    cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
    ok "Backend .env created from backend/.env.example"
  else
    touch "$BACKEND_DIR/.env"
    warn "Backend .env created empty — PostgreSQL values may still be required"
  fi
else
  ok "Backend .env exists"
fi

if ! has_env_key "$BACKEND_DIR/.env" "JWT_SECRET"; then
  ensure_env_value "$BACKEND_DIR/.env" "JWT_SECRET" "dev_secret_change_me"
  warn "JWT_SECRET was missing. Added development default. Change it for production."
else
  ok "JWT_SECRET exists"
fi

if has_env_key "$BACKEND_DIR/.env" "DATABASE_URL"; then
  ok "DATABASE_URL exists"
else
  warn "DATABASE_URL not found in backend/.env"

  if has_env_key "$BACKEND_DIR/.env" "PGHOST" &&
     has_env_key "$BACKEND_DIR/.env" "PGUSER" &&
     has_env_key "$BACKEND_DIR/.env" "PGDATABASE"; then
    ok "PostgreSQL PGHOST/PGUSER/PGDATABASE variables found"
  else
    warn "PostgreSQL env variables may be missing."
    warn "Backend may fail unless db.js uses other defaults."
  fi
fi

header "5. Checking Ports"

kill_port "$FRONTEND_PORT"
kill_port "$BACKEND_PORT"

ok "Frontend port $FRONTEND_PORT is available"
ok "Backend port $BACKEND_PORT is available"

header "6. Installing Frontend Packages"

if [ -d "$PROJECT_ROOT/node_modules" ]; then
  ok "Frontend node_modules exists — skipping npm install"
else
  log "Installing frontend packages..."
  npm install || error "Frontend npm install failed"
  ok "Frontend packages installed"
fi

header "7. Installing Backend Packages"

cd "$BACKEND_DIR"

if [ -d "$BACKEND_DIR/node_modules" ]; then
  ok "Backend node_modules exists — skipping npm install"
else
  log "Installing backend packages..."
  npm install || error "Backend npm install failed"
  ok "Backend packages installed"
fi

cd "$PROJECT_ROOT"

header "8. Starting Backend"

log "Starting backend at $BACKEND_URL ..."

cd "$BACKEND_DIR"
npm run start &
BACKEND_PID=$!
cd "$PROJECT_ROOT"

if wait_for_backend "$BACKEND_HEALTH_URL"; then
  ok "Backend health check passed: $BACKEND_HEALTH_URL"
else
  if kill -0 "$BACKEND_PID" 2>/dev/null; then
    warn "Backend process is running, but health check failed at $BACKEND_HEALTH_URL"
    warn "Check whether backend exposes GET /api/health"
  else
    error "Backend failed to start. Check backend/server.js and backend/.env"
  fi
fi

if command -v curl >/dev/null 2>&1; then
  if curl -s "$BACKEND_STATUS_URL" >/dev/null 2>&1; then
    ok "Backend status endpoint available: $BACKEND_STATUS_URL"
  else
    warn "Backend status endpoint did not respond: $BACKEND_STATUS_URL"
  fi
fi

header "9. Starting Frontend"

log "Starting frontend at $FRONTEND_URL ..."

npm run dev &
FRONTEND_PID=$!

sleep 2

if kill -0 "$FRONTEND_PID" 2>/dev/null; then
  ok "Frontend started"
else
  error "Frontend failed to start. Check Vite/package.json."
fi

header "10. Opening Browser"

open_browser "$FRONTEND_URL"
ok "Browser launch requested"

printf "\n"
printf "%b╔══════════════════════════════════════════════╗%b\n" "$GREEN$BOLD" "$RESET"
printf "%b║          SMECO 2.0 — READY                  ║%b\n" "$GREEN$BOLD" "$RESET"
printf "%b╠══════════════════════════════════════════════╣%b\n" "$GREEN$BOLD" "$RESET"
printf "%b║  Frontend: %-32s ║%b\n" "$FRONTEND_URL" "$GREEN$BOLD" "$RESET"
printf "%b║  Backend:  %-32s ║%b\n" "$BACKEND_URL" "$GREEN$BOLD" "$RESET"
printf "%b║  Health:   %-32s ║%b\n" "$BACKEND_HEALTH_URL" "$GREEN$BOLD" "$RESET"
printf "%b║  SSE:      %-32s ║%b\n" "$BACKEND_EVENTS_URL" "$GREEN$BOLD" "$RESET"
printf "%b╠══════════════════════════════════════════════╣%b\n" "$GREEN$BOLD" "$RESET"
printf "%b║  Stop servers: Ctrl + C                     ║%b\n" "$GREEN$BOLD" "$RESET"
printf "%b╚══════════════════════════════════════════════╝%b\n" "$GREEN$BOLD" "$RESET"
printf "\n"

wait