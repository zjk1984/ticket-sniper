#!/usr/bin/env bash
# 每日 7:00 启动回流票监控，脚本内 endTime=00:00 控制至午夜停止（供 crontab 调用）
#
# 手动运行:
#   ./scripts/snipe-cron.sh
#   TICKET_SNIPER_CONFIG=~/.ticket-sniper/configs/其他.json ./scripts/snipe-cron.sh
#
set -euo pipefail

export TZ="${TZ:-Asia/Shanghai}"
export DISPLAY="${DISPLAY:-:0}"
export PATH="${HOME}/.local/bin:${HOME}/.local/node/bin:/usr/local/bin:/usr/bin:${PATH}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG="${TICKET_SNIPER_CONFIG:-${HOME}/.ticket-sniper/configs/梁静茹深圳演唱会.json}"
LOG_DIR="${HOME}/.ticket-sniper/logs"
MARKER="梁静茹深圳演唱会.json"

NODE="${TICKET_SNIPER_NODE:-}"
if [ -z "$NODE" ] && [ -x "${HOME}/.local/node/bin/node" ]; then
  NODE="${HOME}/.local/node/bin/node"
elif [ -z "$NODE" ]; then
  NODE="$(command -v node || true)"
fi
if [ -z "$NODE" ] || [ ! -x "$NODE" ]; then
  echo "[$(date -Iseconds)] node not found (set TICKET_SNIPER_NODE or install node)" >&2
  exit 127
fi

ENV_FILE="${REPO_ROOT}/.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

mkdir -p "$LOG_DIR"

if [ ! -f "$CONFIG" ]; then
  echo "[$(date -Iseconds)] config not found: $CONFIG" >&2
  exit 1
fi

if pgrep -f "snipe.mjs.*${MARKER}" >/dev/null 2>&1; then
  echo "[$(date -Iseconds)] snipe already running for ${MARKER}, skip"
  exit 0
fi

LOG_FILE="${LOG_DIR}/cron-$(date +%Y-%m-%d).log"
{
  echo "[$(date -Iseconds)] cron start, config=${CONFIG}"
  cd "$REPO_ROOT"
  exec "$NODE" scripts/snipe.mjs --config "$CONFIG"
} >> "$LOG_FILE" 2>&1
