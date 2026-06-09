#!/bin/zsh
set -e

cd "/Users/m/Documents/AgentOps 2/AgentOps-v3-final"

mkdir -p ".agentops"
LOG_FILE=".agentops/local-run.log"
: > "$LOG_FILE"
WEB_PORT=4176
API_PORT=3000

echo "Starting AgentOps local web app..."
echo "No deploy, no Git push, local machine only."
echo "Logs: $PWD/$LOG_FILE"

stop_port() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "Stopping old local server on port $port: $pids"
    kill $pids 2>/dev/null || true
    sleep 1
  fi
}

stop_port "$API_PORT"
stop_port "$WEB_PORT"

npm --workspace @agentops/shared run build
npm --workspace @agentops/api run build
npm --workspace @agentops/web run build
node scripts/build-web-local.mjs

python3 scripts/local_api.py >> "$LOG_FILE" 2>&1 &
API_PID=$!

python3 -m http.server "$WEB_PORT" -d apps/web/dist --bind 127.0.0.1 >> "$LOG_FILE" 2>&1 &
WEB_PID=$!

cleanup() {
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

sleep 2
open "http://127.0.0.1:$WEB_PORT/"

echo ""
echo "AgentOps local is running:"
echo "  Web: http://127.0.0.1:$WEB_PORT/"
echo "  API: http://127.0.0.1:$API_PORT/"
echo "  Logs: $PWD/$LOG_FILE"
echo ""
echo "Press Ctrl+C in this Terminal window to stop."

wait
