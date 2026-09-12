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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG="${TICKET_SNIPER_CONFIG:-${HOME}/.ticket-sniper/configs/梁静茹深圳演唱会.json}"
LOG_DIR="${HOME}/.ticket-sniper/logs"
MARKER="梁静茹深圳演唱会.json"

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
  exec node scripts/snipe.mjs --config "$CONFIG"
} >> "$LOG_FILE" 2>&1
