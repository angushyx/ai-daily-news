# 部署到「永遠開機的 Mac」

把這個專案搬到公司筆電（或任何 24h 開機的 Mac）後，每天 09:00 自動推 LINE + Email。

---

## 前置條件

- macOS（launchd 是 macOS 專屬，Linux 要改用 cron）
- 已安裝 Node.js 18+ (`node -v` 確認)
- 已安裝並登入過 Claude Code（`claude -p "hi"` 能正常回應）
  - 沒裝：`curl -fsSL https://claude.ai/install.sh | bash`
  - 裝完跑 `claude` 走完瀏覽器登入流程
- 已安裝 git

---

## Step 1. Clone 專案

```bash
cd ~/Desktop          # 或你想放的位置
git clone https://github.com/<你的帳號>/ai-daily-news.git
cd ai-daily-news
npm ci
```

## Step 2. 還原 `.env`（最關鍵）

`.env` 不在 git 裡，必須從原本的 Mac 自行帶過來。

### 三種搬法

**A. AirDrop（推薦）**
1. 原 Mac：Finder 在 `~/Desktop/ai-daily-news` 按 ⌘+Shift+. 顯示隱藏檔
2. 右鍵 `.env` → Share → AirDrop → 公司筆電
3. 公司筆電收到後拖進 `~/Desktop/ai-daily-news/`

**B. 手動建立**
複製 `.env.example` 成 `.env`，把每個欄位填一次：
```bash
cp .env.example .env
nano .env  # 或 code .env
```
需要的值（從原本 Mac 的 `.env` 抄過來）：
- `LINE_CHANNEL_ACCESS_TOKEN`（很長一串）
- `LINE_TO_USER_ID`（U 開頭 33 字元）
- `SMTP_USER` / `SMTP_PASS`（Gmail 應用程式密碼）
- `EMAIL_FROM` / `EMAIL_TO`

**C. 加密 USB / 1Password**
自己處理。

### 驗證 `.env`
```bash
set -a; source .env; set +a
echo "LINE TOKEN 長度: ${#LINE_CHANNEL_ACCESS_TOKEN}"  # 應該 100+
echo "LINE USER_ID 長度: ${#LINE_TO_USER_ID}"         # 應該 33
echo "SMTP USER: $SMTP_USER"                          # 應該是你的 gmail
```

## Step 3. 確認 Claude CLI 能跑

```bash
echo "say hi in 5 words" | claude -p --model Sonnet
```
有正常回應 → OK。如果跳要登入 → 跑 `claude` 完成 OAuth。

## Step 4. 手動跑一次測試

```bash
npm run daily
```

預期看到最後三行：
```
LINE sent: 1 chunk(s)
Email sent: <xxx@gmail.com>
Done.
```

LINE 跟 Gmail 都收到 → 環境 OK，可以進排程。

如果失敗，看 [Troubleshooting](#troubleshooting)。

## Step 5. 調整 launchd plist 的路徑

`scripts/launchd/com.user.ai-daily-news.plist` 跟 `com.user.ai-weekly-news.plist` 兩個檔案裡都寫死了路徑，要改：

### 5-1. 取得這台機器的實際路徑
```bash
echo "WorkingDirectory: $PWD"
echo "Node: $(which node)"
echo "Claude: $(which claude)"
```

### 5-2. 編輯兩個 plist
打開 `scripts/launchd/com.user.ai-daily-news.plist`，把這幾處改成上面拿到的值：
- `<key>WorkingDirectory</key>` 下面的 `<string>...` → 改成 `$PWD` 那行
- `<array>` 裡第一個 `<string>...node</string>` → 改成 `which node` 結果
- `<key>EnvironmentVariables</key>` 裡的 `PATH` → 確保包含 `claude` 跟 `node` 的路徑（用 `echo $PATH` 拿一份貼進去）

`com.user.ai-weekly-news.plist` 比照辦理。

## Step 6. 註冊到 launchd

```bash
bash scripts/launchd/install.sh
```

預期輸出：
```
✅ 已註冊兩個排程：
[數字] 0 com.user.ai-daily-news
[數字] 0 com.user.ai-weekly-news
```

## Step 7. 立即觸發測試（不等到 09:00）

```bash
launchctl start com.user.ai-daily-news
sleep 30
tail -50 /tmp/ai-daily-news.log
```

看到 `LINE sent` + `Email sent` + `Done.` → 完成。

---

## 排程查看 / 修改 / 卸載

```bash
# 查看已註冊
launchctl list | grep ai-

# 修改時間（改完 plist 後重載）
launchctl unload ~/Library/LaunchAgents/com.user.ai-daily-news.plist
launchctl load   ~/Library/LaunchAgents/com.user.ai-daily-news.plist

# 卸載
launchctl unload ~/Library/LaunchAgents/com.user.ai-daily-news.plist
launchctl unload ~/Library/LaunchAgents/com.user.ai-weekly-news.plist

# 看執行 log
tail -f /tmp/ai-daily-news.log
tail -f /tmp/ai-daily-news.err
```

---

## 重要：保持 Mac 不睡眠

排程在 Mac 睡眠時不會跑（Power Nap 也不一定觸發 Node）。建議：

```bash
# 接電源時永不睡眠（顯示器仍可關）
sudo pmset -c sleep 0 displaysleep 10

# 看當前設定
pmset -g
```

或更省電方案：用 caffeinate 只在排程時間附近喚醒：
```bash
# 09:00 排程，08:55 喚醒、09:10 之後可睡
# 直接在 plist 加 <key>WakeFromSleep</key> 也可以，但 macOS Sonoma 之後要在「節能/排程」面板設定
```

---

## Troubleshooting

### `claude -p` 在 launchd 跑不起來，但終端機可以
- launchd 用最簡 PATH，找不到 `claude` 或 `node`
- 解法：plist 的 `EnvironmentVariables.PATH` 要包含 `which claude` 和 `which node` 的目錄
- 或在 plist 加 `<key>StandardOutPath</key>` 已經有了，看 `/tmp/ai-daily-news.err` 找錯誤訊息

### LINE FAILED: 400 invalid 'to'
- `.env` 的 `LINE_TO_USER_ID` 不對，必須是 `U` 開頭 33 字元

### Email FAILED: 535 BadCredentials
- `SMTP_PASS` 不是 Gmail 應用程式密碼（必須 16 字元）
- 開兩步驟驗證後到 https://myaccount.google.com/apppasswords 產生

### 抓不到新文章（Total: 0）
- `LOOKBACK_HOURS=26` 太短時可能漏掉，可以暫時改大到 72 測試
- 也可能單純那天大廠沒發文（很常見）

### Total > 0 但 fresh: 0
- `data/seen.json` 已經記過所有文章，所以沒新的
- 想重新測試：`rm data/seen.json` 後再跑（注意：之後就會把這些「舊」文章當新文章再推一次）

### 排程沒觸發
- 檢查 Mac 在排程時間是否真的醒著：`pmset -g log | grep -i wake | tail`
- 檢查 launchd 是否真的載入：`launchctl list | grep ai-`
- 強制跑一次看有沒有錯：`launchctl start com.user.ai-daily-news`

---

## 改用 Anthropic API（脫離 claude-cli）

如果哪天想 100% 雲端化（GitHub Actions），把 `.env` 改：
```
SUMMARIZER=anthropic-api
ANTHROPIC_API_KEY=sk-ant-xxxxx
ANTHROPIC_MODEL=claude-haiku-4-5
```

然後啟用 `.github/workflows/daily.yml` 跟 `weekly.yml` 裡被註解掉的 `schedule:` 區塊，並在 GitHub repo Settings → Secrets 加 7 組 secret（清單見 workflow 檔頭 env）。

---

## 檔案清單速查

| 路徑 | 用途 |
|------|------|
| `.env` | 所有密鑰（**不要 commit**）|
| `.env.example` | 範本 |
| `data/seen.json` | 已推送過的 URL（去重）|
| `reports/` | 每日/每週 markdown 報告（gitignored）|
| `scripts/launchd/*.plist` | launchd 排程定義 |
| `scripts/launchd/install.sh` | 一鍵註冊 |
| `.github/workflows/*.yml` | GitHub Actions 備援（預設關閉排程）|
| `src/index.js` | 主程式入口 |
| `src/summarize.js` | 摘要器（claude-cli / gemini-cli / anthropic-api）|
| `src/notify/line.js` | LINE 推送 |
| `src/notify/email.js` | Email 推送 |
| `src/sources/*.js` | 各家新聞抓取 |
