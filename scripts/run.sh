#!/usr/bin/env bash
# 跨機共用 wrapper：pull 最新 seen.json → 跑 daily/weekly → push 更新後的 seen.json
# 用法：
#   bash scripts/run.sh daily
#   bash scripts/run.sh weekly
#
# 適合「我有兩台以上的 Mac 都會手動跑」的情境，避免重複推同一篇文章。
# 如果不在乎重複、或只在一台 Mac 上跑，直接 npm run daily 即可。

set -euo pipefail

MODE="${1:-daily}"
if [[ "$MODE" != "daily" && "$MODE" != "weekly" && "$MODE" != "research-weekly" ]]; then
  echo "Usage: bash scripts/run.sh [daily|weekly|research-weekly]" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

echo "→ git pull (sync seen.json from other machines)"
git pull --rebase --autostash || {
  echo "git pull 失敗，請先處理衝突再跑" >&2
  exit 1
}

echo "→ npm run $MODE"
npm run "$MODE"

# 只有 daily 會寫 seen.json；weekly / research-weekly 不去重所以不變
if [[ "$MODE" == "daily" ]]; then
  if [[ -n "$(git status --porcelain data/seen.json 2>/dev/null)" ]]; then
    echo "→ commit + push seen.json"
    git add data/seen.json
    git commit -m "chore(state): seen.json $(date +%Y-%m-%d-%H%M) [$(hostname -s)]"
    git push
  else
    echo "→ seen.json 無變動，跳過 commit"
  fi
fi

echo "✓ done"
