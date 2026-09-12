#!/usr/bin/env bash
# 安装 ticket-sniper 每日 7:00 cron 任务
#
# 用法:
#   ./scripts/snipe-schedule-install.sh          # 安装
#   ./scripts/snipe-schedule-install.sh --print  # 仅打印 cron 块
#   ./scripts/snipe-schedule-install.sh --remove # 移除
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRON_SCRIPT="${SCRIPT_DIR}/snipe-cron.sh"
BEGIN="# ticket-sniper schedule BEGIN"
END="# ticket-sniper schedule END"

render_block() {
  cat <<EOF
${BEGIN}
SHELL=/bin/bash
CRON_TZ=Asia/Shanghai
# log: ~/.ticket-sniper/logs/cron-YYYY-MM-DD.log
# wrapper: ${CRON_SCRIPT}
0 7 * * * ${CRON_SCRIPT}  # 梁静茹回流票监控 每天 7:00
${END}
EOF
}

strip_block() {
  awk -v begin="$BEGIN" -v end="$END" '
    $0 == begin { skip=1; next }
    $0 == end { skip=0; next }
    !skip { print }
  '
}

ACTION="${1:-install}"

case "$ACTION" in
  --print)
    render_block
    exit 0
    ;;
  --remove)
    if ! command -v crontab >/dev/null 2>&1; then
      echo "crontab not found" >&2
      exit 1
    fi
    existing="$(crontab -l 2>/dev/null || true)"
    printf '%s\n' "$existing" | strip_block | crontab -
    echo "✅ 已移除 ticket-sniper cron 任务"
    exit 0
    ;;
  install|--install|"")
    ;;
  *)
    echo "usage: snipe-schedule-install.sh [--print|--remove]" >&2
    exit 2
    ;;
esac

chmod +x "$CRON_SCRIPT"

if ! command -v crontab >/dev/null 2>&1; then
  FALLBACK="${HOME}/.ticket-sniper/crontab.txt"
  mkdir -p "$(dirname "$FALLBACK")"
  render_block > "$FALLBACK"
  echo "⚠️  系统未安装 crontab，已写入 ${FALLBACK}，请手动安装"
  exit 0
fi

existing="$(crontab -l 2>/dev/null || true)"
new_crontab="$(printf '%s\n' "$existing" | strip_block | sed '/^[[:space:]]*$/d')"
if [ -n "$new_crontab" ]; then
  new_crontab="${new_crontab}

$(render_block)"
else
  new_crontab="$(render_block)"
fi

printf '%s\n' "$new_crontab" | crontab -
echo "✅ 已安装 ticket-sniper 每日 7:00 cron 任务"
echo "   脚本: ${CRON_SCRIPT}"
echo "   日志: ~/.ticket-sniper/logs/cron-YYYY-MM-DD.log"
crontab -l | grep -A2 "ticket-sniper schedule BEGIN" || true
