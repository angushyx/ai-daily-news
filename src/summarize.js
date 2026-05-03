// 多後端摘要器：預設用 `claude -p` 走訂閱額度，免額外 API 費。
// 也支援 `gemini -p`（gemini-cli），最後才 fallback 到 Anthropic API。
import { spawn } from 'node:child_process';

const SYSTEM = `你是一位專門追蹤 AI 產業動態的中文分析師。
讀者是工程師與產品經理，請用簡潔、資訊密度高的中文輸出，禁止過度形容詞與行銷話術。
直接輸出最終 markdown，不要前言、不要 codeblock 包起來、不要解釋自己在做什麼。`;

function buildItemList(items) {
  return items
    .map(
      (it, i) =>
        `${i + 1}. [${it.source}] ${it.title}\n   URL: ${it.url}${
          it.publishedAt ? `\n   Published: ${it.publishedAt}` : ''
        }${it.summary ? `\n   Snippet: ${it.summary.slice(0, 400)}` : ''}`
    )
    .join('\n\n');
}

function buildDailyPrompt(items) {
  if (!items.length) return '今天沒有抓到任何新文章，請只回覆：「# 今日 AI 摘要\\n\\n今天沒有抓到 OpenAI / Anthropic / Google 等大廠的新文章。」';

  return `以下是過去 24~48 小時抓到的 AI 大廠新聞 / 部落格文章 (OpenAI / Anthropic / Google / Meta / Mistral / 雲端 / dev tools / OSS releases)：

${buildItemList(items)}

請輸出一份「每日 AI 摘要」，格式為 Markdown：

# 今日重點 (TL;DR)
- 用 3~6 個 bullet 把今天最值得注意的事件、產品、研究成果濃縮出來。

# 各廠分組
依下列順序分節，每節用 H2 標題：
- 模型廠 (OpenAI / Anthropic / Google / Meta / Mistral / Microsoft / 阿里 Qwen 等)
- AI infra & dev tools (Hugging Face / LangChain / LlamaIndex / Vercel / Replicate 等)
- AIops / observability (W&B / Helicone 等)
- 雲端 (AWS / GCP / Azure)
- OSS Releases (vLLM / Ollama / LiteLLM / Continue 等)
- 工程師 newsletter / blog (Simon Willison / Latent Space / Pragmatic Engineer 等)

每篇文章一行：**標題** — 一句話描述（重點 + 對工程師的影響） — [連結](URL)

# 我的觀察
- 1~3 個 bullet：今天的趨勢 / 對手動作 / 值得追蹤的點。

要求：
- 中文書寫；技術名詞保留英文（如 Claude, GPT-5, Gemini, MCP, vLLM, RAG）。
- 沒抓到內容的分組請整節省略，不要寫「（今日無更新）」。
- 連結直接放 markdown 連結。
- 不要編造任何沒有出現在輸入中的事件。
- 直接輸出 markdown，不要外層 codeblock。`;
}

function buildWeeklyPrompt(items, weekLabel) {
  if (!items.length) return `這週沒有抓到任何新文章，請只回覆：「# AI 週報 ${weekLabel}\\n\\n本週沒有抓到 AI 大廠的新文章。」`;

  return `以下是過去 7 天抓到的 AI 產業新聞 / 部落格 / OSS releases (來源涵蓋 OpenAI / Anthropic / Google / Meta / Mistral / 微軟研究 / 雲端三巨頭 / dev tools / OSS)：

${buildItemList(items)}

請輸出一份「AI 週報 ${weekLabel}」，重點是**主題化、找趨勢、串聯事件**，不是逐篇列舉。Markdown 格式：

# AI 週報 ${weekLabel}

## 本週 5 大重點
- 用 5 個 bullet，每個 bullet 1~2 句話，**用主題串聯多篇文章**（例：「模型價格戰：A 降 30%、B 推免費 tier、C 推訂閱…」）

## 主題分析（每週 2~4 個主題，視內容而定）
針對本週實際出現的主題挑 2~4 個寫，每個主題用 H3 標題，下面寫：
- **發生了什麼**：2~3 句把多篇文章串成一個故事
- **對工程師的影響**：1~2 句具體實作 / 技術選型 / 工具更新建議
- **相關連結**：3~5 條 markdown 連結 \`- [來源] [標題](URL)\`

可能的主題（**只挑本週實際發生的**）：
- 模型新版本與性能 (OpenAI / Anthropic / Google / Meta / Mistral 等比較)
- 推理基建與成本（vLLM / Ollama / Groq / Fireworks / 雲端）
- Agent / RAG / 工具鏈 (LangChain / LlamaIndex / MCP / Cursor / Continue)
- AIops / 觀測 / 評估 (W&B / Helicone / LangSmith)
- 雲端 AI 服務（AWS Bedrock / GCP Vertex / Azure OpenAI）
- 開源生態與授權變化
- 產業策略 / 收購 / 法規

## 工程師待辦 (Action Items)
- 3~5 個 bullet：本週「你應該」做的事 — 例如：升級某 SDK、試用某新工具、評估某模型替換、追蹤某新議題

## 下週值得追蹤
- 1~3 個 bullet：本週新冒出來、下週可能有後續的訊號

要求：
- 中文書寫；技術名詞保留英文。
- **重主題輕清單**：不要把 ${items.length} 篇文章逐一列出，把它們群組到主題裡。
- 引用文章時用 markdown 連結。
- 不要編造沒出現的事件。
- 直接輸出 markdown，不要外層 codeblock。`;
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

async function viaClaudeCli(prompt, { model }) {
  // claude -p 用訂閱 OAuth；不要加 --bare（會強制要 ANTHROPIC_API_KEY）。
  // 用 --disallowedTools 把所有工具關掉，純 LLM 輸出。
  const args = [
    '-p',
    '--model', model || 'haiku',
    '--append-system-prompt', SYSTEM,
    '--disallowedTools', 'Bash,Edit,Write,Read,Glob,Grep,WebFetch,WebSearch,Agent,Task,TodoWrite,Skill,NotebookEdit',
  ];
  return spawnP('claude', args, prompt);
}

async function viaGeminiCli(prompt) {
  // gemini-cli (google-gemini/gemini-cli)：`gemini -p "prompt"` 或 stdin
  return spawnP('gemini', ['-p'], prompt);
}

async function viaAnthropicApi(prompt, { apiKey, model }) {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 未設定');
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const resp = await client.messages.create({
    model: model || 'claude-haiku-4-5',
    max_tokens: 2000,
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  });
  return resp.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
}

// ---------- public ----------

export async function summarize(items, env, opts = {}) {
  const mode = opts.mode || 'daily';
  const prompt =
    mode === 'weekly'
      ? buildWeeklyPrompt(items, opts.weekLabel || '')
      : buildDailyPrompt(items);
  const backend = (env.SUMMARIZER || 'claude-cli').toLowerCase();

  if (backend === 'claude-cli') {
    return viaClaudeCli(prompt, { model: env.CLAUDE_CLI_MODEL });
  }
  if (backend === 'gemini-cli') {
    return viaGeminiCli(prompt);
  }
  if (backend === 'anthropic-api' || backend === 'api') {
    return viaAnthropicApi(prompt, { apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL });
  }
  throw new Error(`不支援的 SUMMARIZER: ${backend} (claude-cli | gemini-cli | anthropic-api)`);
}

// 保留舊名 (方便已 import 的程式)
export const summarizeWithClaude = (items, env) => summarize(items, env);
