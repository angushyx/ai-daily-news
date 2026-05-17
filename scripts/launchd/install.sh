#!/usr/bin/env bash
# 安裝 launchd 排程：daily + weekly
# 用法：bash scripts/launchd/install.sh
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="$HOME/Library/LaunchAgents"
mkdir -p "$TARGET"

for f in com.user.ai-daily-news.plist com.user.ai-weekly-news.plist; do
  src="$DIR/$f"
  dst="$TARGET/$f"
  echo "→ install $dst"
  cp "$src" "$dst"
  # 若已載入，先 unload 再 load
  launchctl unload "$dst" 2>/dev/null || true
  launchctl load "$dst"
done

echo
echo "✅ 已註冊兩個排程："
launchctl list | grep ai- || true
echo
echo "立即測試："
echo "  launchctl start com.user.ai-daily-news"
echo "  launchctl start com.user.ai-weekly-news"
echo
echo "看 log："
echo "  tail -f /tmp/ai-daily-news.log"
echo "  tail -f /tmp/ai-weekly-news.log"
echo
echo "卸載："
echo "  launchctl unload ~/Library/LaunchAgents/com.user.ai-daily-news.plist"
echo "  launchctl unload ~/Library/LaunchAgents/com.user.ai-weekly-news.plist"
