// 多後端摘要器：預設用 `claude -p` 走訂閱額度，免額外 API 費。
// 也支援 `gemini -p`（gemini-cli），最後才 fallback 到 Anthropic API。
import { spawn } from 'node:child_process';

// SYSTEM 設計參考 Anthropic 的 context engineering SOP：
// - 講清楚「成功 vs 失敗」的具體形象，比堆規則更有用
// - 短，把細節留給 user prompt 的 few-shot
const SYSTEM = `你是 AI 產業日 / 週報的中文分析師。讀者是一個全端 + AI infra + DevOps 工程師，正在迭代自己的 AI 平台專案（gcms-ai-forge），也在思考新創方向。

好的輸出長這樣：
- TL;DR 用主題串聯多篇文章（"模型價格戰：A 降 30%、B 推免費 tier、C 改訂閱…"），不是逐篇條列
- 每行一句講「發生什麼 + 對工程師的影響」，不寫廢話形容詞
- 觀察段落講因果與下一步推論，不重複前面的條列
- 講「對我專案的啟發」時要具體：點名專案的哪個模組 / 哪個 commit 主題 / 哪份 doc，提出可執行的下一步
- 講「創業 / 宏觀」要敢發散，但仍要有因果（為什麼這個訊號指向那個機會）

要避免的：
- 行銷話術（"重磅"、"震撼"、"革命性"）
- 把同類事件當成獨立事件分散條列
- 條列文章但沒解讀
- 編造輸入沒給的事實
- "我的專案啟發" 寫成空泛建議（"可以考慮…"），要說「在 X 模組 / Y 檔案做 Z」

格式：直接輸出 markdown，不要前言、不要 codeblock 包起來。技術名詞保留英文（Claude / GPT-5 / MCP / vLLM / ADK / Genkit…）。`;

// snippet 切短：避免把長篇 RSS 全文塞進 prompt 稀釋訊號
function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}`;
}

function buildItemList(items, snippetMax = 250) {
  return items
    .map((it, i) => {
      const date = shortDate(it.publishedAt);
      const head = `${i + 1}. ${date ? `[${date}] ` : ''}[${it.source}] ${it.title}`;
      const lines = [head, `   URL: ${it.url}`];
      if (it.publishedAt) lines.push(`   Published: ${it.publishedAt}`);
      if (it.summary) {
        const s = it.summary.replace(/\s+/g, ' ').trim().slice(0, snippetMax);
        if (s) lines.push(`   Snippet: ${s}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

// few-shot：示範主題串聯 + 因果觀察 + 專案啟發 + 發散思考的寫法（虛構但風格典型）
const DAILY_FEWSHOT = `# 今日重點 (TL;DR)

- 推理基建戰場移到 Intel：llama.cpp 一天合 6 個 SYCL commit、vLLM 加 XPU backend，Intel GPU 的 local inference 性價比正在被認真打磨
- Anthropic 上 Managed Agents：把 harness/sandbox/session 三件事拆開可替換，median TTFT 降 60%
- Google 推 ADK 0.5：MCP toolset 變一級公民，Genkit 中介層支援 TS/Go/Dart/Python

---

## 模型廠 / Agent 基建

**Claude Opus 4.7 推 1M context 預覽** \`[05/16]\` — Anthropic 把 long context 從研究 demo 推到 prod beta — [連結](https://example.com/x)

**Google ADK 0.5 — MCP Toolset 一級支援** \`[05/16]\` — McpToolset 包進 ADK 核心，agent 連 MCP server 從 boilerplate 變兩行 — [連結](https://example.com/z)

## OSS Releases

**llama.cpp b9089** \`[05/15]\` — SYCL flash attention 降 memory overhead — [連結](https://example.com/y)

---

## 我的觀察

- ADK 把 MCP toolset 收進框架核心，跟 Anthropic Managed Agents 把 harness 商品化是同一波 — agent 開發抽象層在被兩個方向同時收口
- llama.cpp 對 SYCL 的優化密度比過去三個月任何一週都高，配合 vLLM XPU 落地，Intel 在 ROCm/Vulkan 之外多了個能算的籌碼

---

## 對 gcms-ai-forge 的迭代啟發

- **mcp-gateway**：你已經做了 HTTP + stdio 雙 transport，ADK 0.5 的 McpToolset 介面值得對照看，可能可以把 mcp-gateway 的 stdio 模式包成「ADK-compatible toolset」直接給 Python 端用，省掉一層 wrapper
- **progressive provider 抽象**（近期主線：claude-cli/codex-cli/gemini-cli subprocess providers）：Managed Agents 是另一條 provider，目前架構接它應該只是 +1 個 provider class，可以列為 next sprint 候選
- **harness engineering doc**：ADK/Managed Agents 的 harness 抽象長相已成形，你 docs/HARNESS-ENGINEERING.md 的設計可以拿來對照、看哪些已被市場做掉、哪些是你獨有

---

## 創業 / 宏觀發散

- 「Agent 中介層」這個位置正在被三條路徑同時擠：模型廠 (Managed Agents) / 雲端 (ADK + Vertex Agent Builder) / OSS (LangGraph)。新創如果要切這層，差異化只能在「垂直 domain 的 quality flywheel」而不是「通用 framework」— 跟 gcms-ai-forge 的 prompt-CI + canary gate + ground truth 思路一致
- MCP 變主流抽象後，「給內部系統做 MCP server」會變成下一輪 enterprise 採購的標準項目（像當年企業要 SAML SSO 一樣）。如果你做 SaaS，先把 MCP server 當 first-class deliverable 而不是 add-on`;

const WEEKLY_FEWSHOT = `# AI 週報 2026-W19

## 本週 5 大重點
- **harness 工程化收口**：Anthropic Managed Agents \`[05/12]\` 上線把 brain/hands/session 拆開；OpenAI 推 codex 雲端執行環境 \`[05/14]\`；Google ADK 0.5 \`[05/16]\`，產業共識在「agent 需要 OS」
- **推理基建轉向 Intel**：llama.cpp 單週 SYCL flash attention/BF16/MMVQ 三批優化 \`[05/12-16]\`，vLLM 0.20 加 XPU backend \`[05/15]\`
- ...

## 主題分析

### 1. agent harness 從研究詞彙變商品
- **發生了什麼**：Anthropic Managed Agents 把 harness 拆三層商品化 \`[05/12]\`，同週 OpenAI 推 codex sandbox \`[05/14]\`，Google ADK 0.5 把 MCP toolset 變一級公民 \`[05/16]\`
- **對工程師的影響**：自寫 harness 的成本曲線改變，先評估 Managed 方案的 sandbox 是否能接私有 infra
- **對 gcms-ai-forge 的啟發**：你的 progressive provider 抽象（近兩週主線）正好對齊這波，但 harness 那層你還沒抽（目前是各 provider 自己管），可以把 docs/HARNESS-ENGINEERING.md 升級為實作 plan
- **相關連結**：
  - [Anthropic] [Managed Agents](https://example.com/managed-agents) \`[05/12]\`
  - ...

### 2. ...

## 迭代脈絡（你這週做了什麼，跟這些訊號的關聯）
- W19 你的主線是「compare UI + 多 provider 抽象」（commits 030b97e, 51587f2, 5951f63）— 跟業界 harness 收口同時發生，這條方向是對的
- Phoenix tracing 接入（e011390, 6974472）跟 ADK 內建 OTel 是同一波，下週可以看 ADK 的 trace schema 跟 Phoenix 怎麼對齊

## 工程師待辦
- 評估 Managed Agents 是否能把現有 codex/cli agent 工作流接過去
- mcp-gateway 對照 ADK McpToolset 介面，列出可收斂的點
- ...

## 創業 / 宏觀發散
- 「Vertical AI quality flywheel as a service」可能比「另一個 framework」有市場 — gcms-ai-forge 的 ground truth + canary gate 抽出來變獨立 SaaS 是一個方向
- ...

## 下週值得追蹤
- Anthropic 是否公布 Managed Agents 的私有 sandbox 定價`;

function buildDailyPrompt(items, projectContext) {
  if (!items.length) {
    return '今天沒有抓到任何新文章，請只回覆：「# 今日 AI 摘要\\n\\n今天沒有抓到 OpenAI / Anthropic / Google 等大廠的新文章。」';
  }

  const projectBlock = projectContext
    ? `\n\n---\n\n${projectContext}\n\n---\n`
    : '';

  return `今天抓到的 AI 大廠新聞 / 部落格 / OSS releases (${items.length} 篇)：

${buildItemList(items)}${projectBlock}

請輸出「每日 AI 摘要」markdown，結構：

1. **# 今日重點 (TL;DR)** — 3~6 個 bullet，**用主題串聯多篇文章**
2. 文章分組節：依**今天實際出現的內容**自己決定分組（模型廠 / 推理基建 / agent 工具 / OSS / 雲端 / newsletter…），用 H2 標題
3. 每篇一行：\`**標題** \\\`[MM/DD]\\\` — 一句話講重點 + 對工程師的影響 — [連結](URL)\`
   ↑ 日期用反引號包，視覺輕量；MM/DD 取自文章列表的 [MM/DD] 標記
4. **## 我的觀察** — 1~3 個 bullet，講趨勢 / 對手動作 / 接下來看什麼
5. **## 對 gcms-ai-forge 的迭代啟發** — 3~5 個 bullet，每個必須：
   - 點名專案的具體模組 / 檔案 / commit 主題（例如 mcp-gateway, progressive provider, docs/HARNESS-ENGINEERING.md）
   - 講「跟進 / 微調 / 待觀察」的具體動作（可以包含實作層級，例如「在 X 加 Y interface」）
   - 如果今天的新聞跟你近期 commits 是同向的，明確指出「方向是對的」；如果是逆向的，指出 trade-off
6. **## 創業 / 宏觀發散** — 1~3 個 bullet，從今天的訊號延伸出對 AI 新創方向的觀察，可以發散但要有因果（為什麼這個訊號 → 那個機會）

範例風格（**只是風格參考，不要照抄內容**）：
\`\`\`
${DAILY_FEWSHOT}
\`\`\`

只用上面 ${items.length} 篇文章列表的內容，不要編造文章；專案啟發要根據實際提供的專案脈絡。`;
}

function buildWeeklyPrompt(items, weekLabel, projectContext) {
  if (!items.length) {
    return `這週沒有抓到任何新文章，請只回覆：「# AI 週報 ${weekLabel}\\n\\n本週沒有抓到 AI 大廠的新文章。」`;
  }

  const projectBlock = projectContext
    ? `\n\n---\n\n${projectContext}\n\n---\n`
    : '';

  return `過去 7 天的 AI 產業新聞 / 部落格 / OSS releases (${items.length} 篇)：

${buildItemList(items)}${projectBlock}

請輸出「AI 週報 ${weekLabel}」markdown。這是**完整週報** — 重點解讀 + 全部 ${items.length} 篇都要分類收錄，一篇都不能漏。

結構：

1. **# AI 週報 ${weekLabel}**

2. **## 本週重點 (TL;DR)** — 5~8 個 bullet，每個用主題串多篇，文章後標 \\\`[MM/DD]\\\`

3. **## 主題深度分析** — 自己挑 3~5 個本週**實際出現**的主題寫，每個主題下：
   - **發生了什麼**：2~3 句把多篇串成故事，引用時帶 \\\`[MM/DD]\\\`
   - **對工程師的影響**：1~2 句具體建議
   - **對 gcms-ai-forge 的啟發**：1~2 句，要點名專案的具體模組 / commit 主題 / docs 檔名
   - **相關連結**：3~5 條 \`- [來源] [標題](URL) \\\`[MM/DD]\\\`\`

4. **## 本週全部文章（分類收錄 ${items.length} 篇）** — **這節必須涵蓋所有 ${items.length} 篇文章，一篇都不漏**。依**今天實際出現的內容**自己決定 H3 分類（建議參考下列分類，但要按實際內容調整）：

   - ### 模型廠（OpenAI / Anthropic / Google / Mistral / Meta）
   - ### Agent 開發 / Framework / SDK（ADK, LangGraph, smolagents, Genkit…）
   - ### 推理基建 / OSS Releases（vLLM, llama.cpp, Ollama, transformers…）
   - ### MCP / Tool Use
   - ### 雲端 AI（AWS, GCP, Azure）
   - ### Hugging Face / 開源生態
   - ### Dev tools（Vercel, Replicate, IDE…）
   - ### Newsletter / 工程師博客（Simon Willison, Latent Space, Pragmatic Engineer…）
   - ### 其他 / 雜訊但記錄

   每篇格式：\`- **標題** \\\`[MM/DD]\\\` — 一句話講重點 — [連結](URL)\`
   （沒料的分類整節跳過；有料的就要列）

5. **## 你這週的迭代脈絡** — 看專案的 14 天 commits，挑 2~4 條主線，講每條主線跟本週 AI 業界訊號的關聯（同向 / 逆向 / 互補），用來啟發下一週的優先序

6. **## 對 gcms-ai-forge 的下週待辦** — 3~5 個 bullet，每個要點名具體模組 / 檔案 / commit，並寫「跟進 / 微調 / 待觀察」的具體動作

7. **## 創業 / 宏觀發散** — 2~4 個 bullet，從本週訊號延伸對 AI 新創方向的觀察，敢發散但要有因果

8. **## 下週值得追蹤** — 2~4 個本週冒出、下週可能有後續的訊號

關鍵：第 4 節是「完整檔案櫃」，第 2/3 節是「精選解讀」，兩者不衝突，都要有。

範例風格（**只是風格參考，不要照抄內容**）：
\`\`\`
${WEEKLY_FEWSHOT}
\`\`\`

只用上面 ${items.length} 篇文章列表的內容，不要編造；專案啟發要根據實際提供的專案脈絡。`;
}

// ---------- backends ----------

function spawnP(cmd, args, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (c) => (out += c.toString()));
    child.stderr.on('data', (c) => (err += c.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`${cmd} exited ${code}: ${err.trim() || out.trim()}`));
      else resolve(out.trim());
    });
    child.stdin.end(stdin);
  });
}

async function viaClaudeCli(prompt, { model, system }) {
  const args = [
    '-p',
    '--model', model || 'haiku',
    '--append-system-prompt', system || SYSTEM,
    '--disallowedTools', 'Bash,Edit,Write,Read,Glob,Grep,WebFetch,WebSearch,Agent,Task,TodoWrite,Skill,NotebookEdit',
  ];
  return spawnP('claude', args, prompt);
}

async function viaGeminiCli(prompt) {
  return spawnP('gemini', ['-p'], prompt);
}

async function viaAnthropicApi(prompt, { apiKey, model, system, maxTokens }) {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 未設定');
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const resp = await client.messages.create({
    model: model || 'claude-haiku-4-5',
    max_tokens: maxTokens || 4000,
    system: system || SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  });
  return resp.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
}

// ---------- public ----------

// 通用 LLM 呼叫，給 research-weekly 等其他流程共用
export async function callLlm(prompt, env, { system, maxTokens } = {}) {
  const backend = (env.SUMMARIZER || 'claude-cli').toLowerCase();
  if (backend === 'claude-cli') {
    return viaClaudeCli(prompt, { model: env.CLAUDE_CLI_MODEL, system });
  }
  if (backend === 'gemini-cli') {
    return viaGeminiCli(prompt);
  }
  if (backend === 'anthropic-api' || backend === 'api') {
    return viaAnthropicApi(prompt, {
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_MODEL,
      system,
      maxTokens,
    });
  }
  throw new Error(`不支援的 SUMMARIZER: ${backend} (claude-cli | gemini-cli | anthropic-api)`);
}

export async function summarize(items, env, opts = {}) {
  const mode = opts.mode || 'daily';
  const projectContext = opts.projectContext || '';
  const prompt =
    mode === 'weekly'
      ? buildWeeklyPrompt(items, opts.weekLabel || '', projectContext)
      : buildDailyPrompt(items, projectContext);
  return callLlm(prompt, env);
}

export const summarizeWithClaude = (items, env) => summarize(items, env);

export { buildItemList, SYSTEM };
