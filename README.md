# AI Daily News

每天自動爬 **OpenAI / Anthropic / Google (含 DeepMind)** 的官方新聞，用 Claude API 整理成中文 daily summary，再透過 **Email + LINE** 推給你。

## 架構

```
crawlers (OpenAI HTML / Anthropic HTML / Google RSS)
        ↓ 抓最近 N 小時
        ↓ 過濾已通知 (data/seen.json)
   Claude API 中文摘要 (summarize.js)
        ↓
   reports/YYYY-MM-DD.md  (本地存檔)
        ↓
   Email (nodemailer) + LINE (Messaging API push)
```

## 快速啟動

```bash
cd /Users/angushyx/Desktop/ai-daily-news
npm install
cp .env.example .env
# 編輯 .env 填入 API key / 帳密
npm run test:sources   # dry-run，只爬不推、不打 Claude
npm start              # 跑一次完整流程（爬 → 摘要 → 推 email + line）
npm run daemon         # 常駐：依 CRON_EXPRESSION 每天自動跑
```

## .env 必填

| 變數 | 說明 |
|---|---|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com 的 API key |
| `SMTP_HOST/PORT/USER/PASS` | Email 寄件 SMTP；Gmail 要用「應用程式密碼」 |
| `EMAIL_FROM`, `EMAIL_TO` | 寄件人顯示、收件人 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API 的 long-lived token |
| `LINE_TO_USER_ID` | 你的 LINE userId（U 開頭 33 碼） |

## LINE 設定（重要）

> ⚠️ **LINE Notify 已於 2025/4/1 停止服務**。本專案改用 **LINE Messaging API**。

1. 到 https://developers.line.biz/console/ 建立 **Provider** → **Messaging API channel**。
2. 在 channel 的「Messaging API」分頁底下：
   - 取得 **Channel access token (long-lived)** → 填到 `LINE_CHANNEL_ACCESS_TOKEN`。
   - 用手機掃描 QR code，把 bot 加為好友。
3. 拿到自己的 `userId`：
   - 最快的方式：在「Basic settings」找 **Your user ID**。
   - 或啟用 webhook，用「Verify」事件記錄 source.userId。
4. 把 userId 填到 `LINE_TO_USER_ID`。

## Gmail SMTP 設定

1. 帳戶 → 安全性 → 開啟「兩步驟驗證」。
2. 建立「應用程式密碼」(16 碼) → 填到 `SMTP_PASS`。
3. `SMTP_HOST=smtp.gmail.com` / `SMTP_PORT=465` / `SMTP_SECURE=true`。

## 排程

### 方式 1：常駐 daemon

```bash
npm run daemon
```
會依 `.env` 的 `CRON_EXPRESSION`（預設 `0 9 * * *` = 每天 9:00 台北）自動跑。
電腦睡覺/關機就不會跑。

### 方式 2：macOS launchd（推薦給 Mac 開機就排程）

建立 `~/Library/LaunchAgents/com.user.ai-daily-news.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.user.ai-daily-news</string>
  <key>WorkingDirectory</key><string>/Users/angushyx/Desktop/ai-daily-news</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/angushyx/Desktop/ai-daily-news/src/index.js</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>/tmp/ai-daily-news.log</string>
  <key>StandardErrorPath</key><string>/tmp/ai-daily-news.err</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.user.ai-daily-news.plist
launchctl start com.user.ai-daily-news   # 立刻測試
```

(把 `/usr/local/bin/node` 換成 `which node` 的路徑)

## 檔案結構

```
ai-daily-news/
├── package.json
├── .env.example
├── src/
│   ├── index.js           # 主流程
│   ├── daemon.js          # 常駐排程
│   ├── summarize.js       # Claude 摘要
│   ├── store.js           # 已通知去重
│   ├── render.js          # md / html / plain text 轉換
│   ├── utils/http.js      # fetch + retry
│   ├── sources/
│   │   ├── openai.js      # 爬 openai.com/news
│   │   ├── anthropic.js   # 爬 anthropic.com/news
│   │   └── google.js      # Google AI + DeepMind RSS
│   └── notify/
│       ├── email.js       # nodemailer
│       └── line.js        # LINE Messaging API push
├── data/seen.json         # 自動產生
└── reports/YYYY-MM-DD.md  # 自動產生
```

## 客製化

- 想加更多來源？在 `src/sources/` 新增檔案、回傳 `{source, title, url, publishedAt, summary?}` 陣列、在 `src/index.js` 加進 `Promise.all`。
- 想換成 Discord / Slack / Telegram？複製 `src/notify/line.js` 改 endpoint 即可。
- `LOOKBACK_HOURS=26` 給 daily 排程留 2 小時 buffer 避免漏抓；改小可降噪。
- 換更強模型：`.env` 把 `ANTHROPIC_MODEL` 改 `claude-sonnet-4-6`。

## 故障排查

- **爬不到 OpenAI/Anthropic**：他們 HTML 改版時 `src/sources/*.js` 的 selector 可能要調整。先 `npm run test:sources` 看抓到幾筆。
- **沒收到 email**：用 `node -e "import('./src/notify/email.js').then(m=>m.sendEmail({subject:'test',markdown:'hi',env:process.env}))"` 直測。Gmail 多半是 App Password 沒開或 2FA 沒啟用。
- **LINE 401**：token 過期或打錯。LINE 403 multicast disabled 通常是把 `to` 寫成 group/room 而沒有對應權限。
