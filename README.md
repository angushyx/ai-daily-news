# AI Daily / Weekly News

自動爬 **OpenAI / Anthropic / Google / Meta / Mistral / Microsoft Research / 雲端 / dev tools / OSS releases** 的官方來源，用 **`claude -p` 走 Claude Code 訂閱** (預設零 API 費) 整理成中文摘要，再透過 **Email + LINE** 推給你。

## 兩種模式

| 模式 | 範圍 | 去重 | 風格 | 檔名 |
|---|---|---|---|---|
| **daily** | 過去 26h | ✅ `seen.json` | 列清單 + 分組 + 觀察 | `reports/YYYY-MM-DD.md` |
| **weekly** | 過去 7 天 | ❌（回顧） | **主題分析 + Action Items + 下週追蹤** | `reports/weekly-YYYY-Www.md` |

## 架構

```
sources/
├── openai.js          ← HTML scrape: openai.com/news
├── anthropic.js       ← HTML scrape: anthropic.com/news
├── meta.js            ← HTML scrape: ai.meta.com/blog (有時被 CDN 擋)
├── mistral.js         ← HTML scrape: mistral.ai/news
├── rss-feeds.js       ← 11 個 RSS feed (Google AI/DeepMind/HF/Vercel/AWS/MS Research/...)
└── github-releases.js ← 16 個 OSS repo (vLLM/Ollama/LangChain/LiteLLM/...)

→ 過濾 lookback + (daily) 去重
→ summarize.js: claude-cli (預設) | gemini-cli | anthropic-api
→ render.js: markdown / HTML / 純文字
→ notify/email.js (nodemailer)  +  notify/line.js (Messaging API push)
→ 存檔 reports/YYYY-MM-DD.md 或 weekly-YYYY-Www.md
```

## 摘要 backend（**預設免 API 費**）

`.env` 的 `SUMMARIZER` 切換：

| 值 | 說明 | 費用 |
|---|---|---|
| `claude-cli` (預設) | 用本機 `claude -p`，走 Claude Code 訂閱 | **$0**（已訂閱） |
| `gemini-cli` | 用本機 `gemini -p` (需安裝 google-gemini/gemini-cli) | **$0**（已訂閱） |
| `anthropic-api` | 直接打 Anthropic API | ~$0.001/run (Haiku) |

> ⚠️ GitHub Actions runner 上**不能**用 `claude-cli`（無法在 headless 完成 OAuth），上 Actions 必須切到 `anthropic-api`。本機 launchd 部署則可全程用訂閱免費跑。

## 快速啟動

```bash
cd /Users/angushyx/Desktop/ai-daily-news
npm install
cp .env.example .env
# 編輯 .env：填 SMTP + LINE token；不用填 ANTHROPIC_API_KEY (claude-cli 不需要)

# 試跑（不發信、不打模型）
npm run test:sources

# 完整跑一次
npm run daily       # 日報
npm run weekly      # 週報
```

---

# 🔁 Handover SOP（給未來的我 / Claude Code）

> **使用方式**：在新機器上 `git clone` 後，把這整節貼給 Claude Code，它會照流程把環境帶起來。
> 設計目標：**人類只做兩件事，其他全自動**。

## 人類只要做兩件事

1. **把舊機器的 `.env` 搬過來**（AirDrop / 1Password / 加密 USB 三選一）
   - 放到 repo 根目錄，檔名就叫 `.env`
   - 必要欄位：`SMTP_USER`/`SMTP_PASS`/`EMAIL_FROM`/`EMAIL_TO`/`LINE_CHANNEL_ACCESS_TOKEN`/`LINE_TO_USER_ID`
2. **完成 claude CLI OAuth**（一次性，瀏覽器登入）
   - 跑 `claude` 走完登入流程；之後 `claude -p` 就能 headless 跑

## Claude Code 自動 checklist（照順序執行，每步驗證）

```bash
# === Step 1. 環境檢查 ===
node -v          # 需要 >= 18.17，沒裝就 brew install node
git -v
claude --version || echo "需手動裝 claude CLI: curl -fsSL https://claude.ai/install.sh | bash"

# === Step 2. clone + 安裝依賴 ===
cd ~/Desktop     # 或任何想放的位置
git clone git@github.com:angushyx/ai-daily-news.git
cd ai-daily-news
npm ci

# === Step 3. 驗證 .env（人類已 AirDrop 進來）===
test -f .env || { echo "❌ 缺 .env，請人類處理"; exit 1; }
set -a; source .env; set +a
echo "LINE token 長度: ${#LINE_CHANNEL_ACCESS_TOKEN}  (期望 100+)"
echo "LINE userId 長度: ${#LINE_TO_USER_ID}           (期望 33)"
echo "SMTP user: $SMTP_USER"
echo "Model: $CLAUDE_CLI_MODEL"

# === Step 4. PROJECT_PATH 偵測（讓 summary 帶上專案脈絡）===
# 找這台機器上的 gcms-ai-forge 位置，自動寫進 .env
if [ -d "$HOME/Desktop/gcms-ai-forge" ]; then
  CANDIDATE="$HOME/Desktop/gcms-ai-forge"
elif [ -d "$HOME/repos/gcms-ai-forge" ]; then
  CANDIDATE="$HOME/repos/gcms-ai-forge"
elif [ -d "$HOME/Code/gcms-ai-forge" ]; then
  CANDIDATE="$HOME/Code/gcms-ai-forge"
else
  CANDIDATE=""
fi
if [ -n "$CANDIDATE" ] && ! grep -q "^PROJECT_PATH=" .env; then
  echo "PROJECT_PATH=$CANDIDATE" >> .env
  echo "✓ 已設 PROJECT_PATH=$CANDIDATE"
fi
# 找不到也沒關係 → summary 會跳過「對 gcms-ai-forge 的迭代啟發」這節，不會壞

# === Step 5. claude CLI smoke test ===
echo "say hi in 5 words" | claude -p --model sonnet
# 若卡住要登入 → 通知人類執行 `claude` 完成 OAuth

# === Step 6. dry-run 確認來源能抓到（不發信、不打模型）===
npm run test:sources 2>&1 | tail -20
# 期望看到 OpenAI/Anthropic/RSS/GitHub Releases 各自 got N item(s)
# Meta FAILED 是正常（持續被 CDN 擋）

# === Step 7. 正式跑一次 daily（會發 LINE + Email）===
bash scripts/run.sh daily
# 期望看到最後幾行：
#   [project-context] gcms-ai-forge (XX commits, XX docs)   ← 若有設 PROJECT_PATH
#   Saved report -> reports/YYYY-MM-DD.md
#   LINE sent: N chunk(s)
#   Email sent: <message-id>
#   ✓ done

# === Step 8. 人類驗收 ===
# - LINE 收到 ≥ 1 chunk
# - Gmail inbox 有 "🤖 AI Daily ..." subject
# - 若有 project context → summary 裡看得到「對 gcms-ai-forge 的迭代啟發」這節
```

## 跨機共用設計（為什麼用 `scripts/run.sh`）

兩台 Mac 都會跑時，wrapper 處理 dedup state：

1. 跑之前 `git pull --rebase --autostash` — 拉另一台機器更新過的 `data/seen.json`
2. `npm run daily`
3. 跑完 `commit + push` 更新後的 `seen.json`，commit message 帶 hostname 看得出來源

→ **兩台 Mac 輪流跑都不會推到同一篇文章**。
直接 `npm run daily` 也能跑，只是少了跨機同步。

## 常見問題（Claude Code 看到這些 error 怎麼修）

| 錯誤訊息 | 原因 | 修法 |
|---|---|---|
| `claude: command not found` | CLI 沒裝 | `curl -fsSL https://claude.ai/install.sh \| bash` |
| `claude -p` 卡住要登入 | 沒走過 OAuth | 通知人類執行 `claude` 走瀏覽器登入 |
| `LINE FAILED: 400 invalid 'to'` | `LINE_TO_USER_ID` 不對 | 必須 `U` 開頭 33 字元 |
| `Email FAILED: 535` | Gmail app password 錯 | 重新到 myaccount.google.com/apppasswords 產生 16 碼 |
| `Total: 0` | lookback 太短或大廠當日沒發 | 試 `LOOKBACK_HOURS=72 npm run daily` |
| `Total > 0 但 fresh: 0` | seen.json 已涵蓋所有 URL | 正常，今天剛好沒新文章 |
| `[project-context] path 不存在` | PROJECT_PATH 沒設或路徑錯 | `find ~ -maxdepth 4 -type d -name gcms-ai-forge` 找實際位置寫進 .env |

## 想自動排程（可選，不是必須）

兩個方案：
- **launchd**（本機）：`bash scripts/launchd/install.sh` — Mac 要 24h 開機 + 有網路才會跑
- **GitHub Actions**（雲端）：`.github/workflows/*.yml` 已寫好，需在 repo Settings → Secrets 加 7 個 secret 並打開 yml 裡的 `schedule:`；要切 `SUMMARIZER=anthropic-api` 因為 GH runner 沒 claude-cli 訂閱

如果只是手動跑（推薦），這節跳過。

---

## 必填 .env

| 變數 | 必要？ | 說明 |
|---|---|---|
| `SUMMARIZER` | 否 (預設 claude-cli) | claude-cli / gemini-cli / anthropic-api |
| `CLAUDE_CLI_MODEL` | 否 (預設 haiku) | sonnet 品質更高 |
| `ANTHROPIC_API_KEY` | 僅 anthropic-api 模式 | console.anthropic.com |
| `SMTP_HOST/USER/PASS` | 是 | Gmail 必須開兩步驗證並用「應用程式密碼」 |
| `EMAIL_FROM`, `EMAIL_TO` | 是 | |
| `LINE_CHANNEL_ACCESS_TOKEN` | 是 | LINE Messaging API channel 的 long-lived token |
| `LINE_TO_USER_ID` | 是 | 你的 userId（U 開頭 33 碼） |

## LINE 設定（**重要 — LINE Notify 已停服**）

> ⚠️ LINE Notify 已於 **2025/4/1** 停止服務。本專案用 LINE Messaging API。

1. https://developers.line.biz/console/ 建 Provider → Messaging API channel
2. 在「Messaging API」分頁取 **Channel access token (long-lived)** → `LINE_CHANNEL_ACCESS_TOKEN`
3. 用手機掃 channel QR code 把 bot 加為好友
4. 在「Basic settings」找 **Your user ID** → `LINE_TO_USER_ID`

## 部署選項

### 方式 A：macOS launchd（**推薦** — 走訂閱免 API 費）

```bash
bash scripts/launchd/install.sh
# 會註冊兩個排程：
#   com.user.ai-daily-news    每天 09:00
#   com.user.ai-weekly-news   每週一 10:00

# 立即測試
launchctl start com.user.ai-daily-news

# 看 log
tail -f /tmp/ai-daily-news.log

# 卸載
launchctl unload ~/Library/LaunchAgents/com.user.ai-daily-news.plist
launchctl unload ~/Library/LaunchAgents/com.user.ai-weekly-news.plist
```

> 缺點：Mac 關機/睡眠時若到觸發時間就會 miss（不會補跑，因為 plist 沒設 RunAtLoad）。
> 如果你電腦常關機，建議用方式 B。

### 方式 B：GitHub Actions（要付一點 API 費）

`.github/workflows/daily.yml` 與 `weekly.yml` 已就緒。需要把 secret 設到 repo：

```
ANTHROPIC_API_KEY
SMTP_USER, SMTP_PASS, EMAIL_FROM, EMAIL_TO
LINE_CHANNEL_ACCESS_TOKEN, LINE_TO_USER_ID
```

預設只開 `workflow_dispatch`（手動觸發）。要自動排程：把 yml 裡 `schedule:` 段的註解打開即可。

> 成本估算：Haiku ~$0.001/run × 31 (daily) + 4 (weekly) = **~$0.04/月**

### 方式 C：常駐 daemon（最簡單，要保持終端開著）

```bash
npm run daemon
# 啟動立刻跑一次 daily，之後每天 09:00 daily、週一 10:00 weekly
```

## 自訂

| 想做什麼 | 改哪 |
|---|---|
| 加新 RSS 來源 | `src/sources/rss-feeds.js` 的 `FEEDS` 陣列加一行 |
| 加新 GitHub repo | `src/sources/github-releases.js` 的 `REPOS` 陣列加一行 |
| 加新 HTML scrape 來源 | 仿 `src/sources/mistral.js` 寫一個，再到 `src/index.js` 接上 |
| 換 Discord/Slack/Telegram | 仿 `src/notify/line.js` 改 endpoint |
| 改摘要 prompt | `src/summarize.js` 的 `buildDailyPrompt` / `buildWeeklyPrompt` |
| 改排程時間 | `.env` 的 `CRON_EXPRESSION` / `CRON_WEEKLY` (daemon)；或 launchd plist 的 `StartCalendarInterval` |
| 縮小 daily 範圍 | `.env` 的 `LOOKBACK_HOURS=12` |

## 故障排查

- **`File is not defined`**：Node 18 沒有 global File；`src/bootstrap.js` 已處理。如果你升級到 Node 20+ 可以拿掉。
- **某 source 抓不到**：HTML 改版時 selector 要調整；先 `npm run test:sources` 看是哪個 source `FAILED`。
- **Email 401/535**：Gmail App Password 沒開或值錯。`SMTP_PORT=465` + `SMTP_SECURE=true`。
- **LINE 401**：token 過期。401 配 `Invalid signature` 通常是用了 short-lived token，要改 long-lived。
- **GCP / LangChain RSS feed 失敗**：他們的 RSS XML 不合規 (含未跳脫的 `<` 或屬性無值)，已從預設清單移除。Google AI Keyword feed 已覆蓋大部分 GCP AI 公告。
- **`claude -p` 卡住**：通常是第一次跑要登入，先在終端執行 `claude` 完成 OAuth 一次。

## 檔案結構

```
ai-daily-news/
├── package.json
├── .env.example
├── README.md
├── src/
│   ├── bootstrap.js          # Node 18 polyfill (global File)
│   ├── index.js              # 主流程，吃 --mode=daily|weekly
│   ├── daemon.js             # node-cron 同時管 daily + weekly
│   ├── summarize.js          # 多後端摘要器 (claude-cli / gemini-cli / api)
│   ├── store.js              # seen.json 去重
│   ├── render.js             # md / html / plain text + ISO 週數
│   ├── utils/http.js         # fetch + retry + UA
│   ├── sources/
│   │   ├── openai.js
│   │   ├── anthropic.js
│   │   ├── meta.js
│   │   ├── mistral.js
│   │   ├── rss-feeds.js      # 集中管理所有 RSS feed
│   │   └── github-releases.js # 集中管理所有 GitHub repo
│   └── notify/
│       ├── email.js
│       └── line.js
├── scripts/launchd/          # macOS 自動排程
│   ├── com.user.ai-daily-news.plist
│   ├── com.user.ai-weekly-news.plist
│   └── install.sh
├── .github/workflows/        # GitHub Actions 備用
│   ├── daily.yml
│   └── weekly.yml
├── data/seen.json            # 自動產生
└── reports/                  # 自動產生
    ├── 2026-05-03.md         # daily
    └── weekly-2026-W18.md    # weekly
```
