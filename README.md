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
