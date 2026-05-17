// One-off: push a digest of Anthropic Engineering articles via the same Email + LINE stack.
// Run: node scripts/push-anthropic-engineering.js
import '../src/bootstrap.js';
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sendEmail } from '../src/notify/email.js';
import { sendLine } from '../src/notify/line.js';
import { todayStr } from '../src/render.js';

const SEP = '━━━━━━━━━━━━━━━━━━━━━';
const tz = process.env.TZ || 'Asia/Taipei';

const articles = [
  {
    title: 'Harness design for long-running application development',
    date: '2026-03-24',
    url: 'https://www.anthropic.com/engineering/harness-design-long-running-apps',
    summary:
      '提出 GAN 風格的多 agent harness：把工作拆成 planner / generator / evaluator 三個專職角色，用外部評估克服自評偏差。實測在前端設計與全端應用題上明顯打贏單 agent，但運算成本顯著上升。重點是把主觀品質用具體設計原則拆成可打分的 rubric，並隨模型版本演進持續簡化 harness。',
  },
  {
    title: 'Scaling Managed Agents — Decoupling the brain from the hands',
    date: '2026-04-08',
    url: 'https://www.anthropic.com/engineering/managed-agents',
    summary:
      'Anthropic 推出 Managed Agents 託管服務：把「大腦」(harness 控制迴圈)、「手」(sandbox 執行環境)、「session 事件日誌」三件事虛擬化拆開，任一壞掉可獨立替換。把 container/harness 當 cattle 不當 pet 後，median TTFT 降 60%、tail latency 降 90%+。憑證隔離在 sandbox 之外，安全性也提升。對需要長任務、私有基建整合的 agent 開發團隊是直接可用的 hosted 方案。',
  },
  {
    title: 'Effective harnesses for long-running agents',
    date: '2025-11-26',
    url: 'https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents',
    summary:
      '解決 agent 跨多個 context window 仍能持續推進、不退步的核心問題。提出兩段式 harness：initializer agent 先打地基（feature list / progress file / e2e test 等乾淨產出物），再交給 coding agent 做增量修改並維持工件乾淨。靈感來自實務中工程師交接專案的方式。',
  },
  {
    title: 'Effective context engineering for AI agents',
    date: '2025-09-29',
    url: 'https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents',
    summary:
      '主張 context engineering 已超越 prompt engineering 成為 agent 工程主軸：context 是有限資源、邊際報酬遞減，要找「最小、最高訊號」的 token 集合。具體手法：system prompt 抓對抽象層級、工具集精簡、多樣 few-shot 而非窮舉 edge case、just-in-time 取資料而非預載。長任務則用 compaction（壓縮重置）、結構化 note-taking、多 agent 子任務交回 summary 三種模式。',
  },
  {
    title: 'Building effective agents',
    date: '2024-12-19',
    url: 'https://www.anthropic.com/engineering/building-effective-agents',
    summary:
      '經典基礎讀物：成功的 agent 來自簡單可組合的模式，而非複雜框架。明確區分 workflows（預先寫好的程式控制流）與 agents（LLM 動態決定流程）。列五種 workflow pattern：prompt chaining / routing / parallelization / orchestrator-workers / evaluator-optimizer。建議從最簡單方案開始，只在量化證據支持時才加複雜度，並把 ACI（agent-computer interface）當 UI 一樣認真設計。',
  },
];

function buildMarkdown() {
  const head = `# 🧠 Anthropic Engineering 第一手整理\n\n挑了 5 篇 Anthropic 官方工程部落格，主題圍繞 **agent / harness / context engineering** —— 這條線是過去一年半從「怎麼寫單次 prompt」演進到「怎麼蓋一個能跑數小時的系統」的核心。\n\n## TL;DR (建議閱讀順序)\n\n1. **Building effective agents** (2024-12) — 起點：分清 workflow vs agent，先把五種 workflow pattern 搞清楚\n2. **Effective context engineering** (2025-09) — context 是有限資源，比 prompt 工程更重要\n3. **Effective harnesses for long-running agents** (2025-11) — 跨 context window 不退步：initializer + coding 兩段式 harness\n4. **Harness design for long-running apps** (2026-03) — planner / generator / evaluator 三角分工 + 外部評估\n5. **Managed Agents** (2026-04) — Anthropic 直接把上述工程實踐做成 hosted 服務（brain / hands / session 解耦）\n\n## 一篇一篇看\n`;

  const body = articles
    .map(
      (a, i) =>
        `\n### ${i + 1}. ${a.title}\n*${a.date}*\n\n${a.summary}\n\n→ [原文](${a.url})\n`
    )
    .join('');

  const observation = `\n${SEP}\n\n## 🔭 我的觀察\n\n- 這 5 篇連起來看，是一條 **"從 prompt 到 production 系統"** 的演進路線：先確立 agent 抽象 (2024-12) → 認清 context 是瓶頸 (2025-09) → 用 harness 跨 context window (2025-11) → 多 agent 分工互評 (2026-03) → 把整套商品化 (2026-04)。\n- **harness** 這個詞變成 Anthropic 主推的工程詞彙，意思接近「agent 的 OS / runtime」。Managed Agents 把 harness/sandbox/session 三件事拆開可替換的設計，跟早期作業系統虛擬化硬體的模式幾乎一樣。\n- 對自己專案的啟發：**Daily News 這套也算一個 long-running agent**。目前是無狀態 cron + seen.json，但如果之後要做「研究週報」這類多輪深度任務，可以套 initializer + coding 的兩段式 harness，先建 progress file 再迭代。\n- Context engineering 那篇值得當 prompt 設計 SOP：tool 集精簡、just-in-time 取資料、多樣 few-shot 而非窮舉，這幾條直接影響本專案 summarize.js 的 prompt 設計。\n`;

  const links = `\n${SEP}\n\n## 📎 原始連結\n${articles
    .map((a) => `- [Anthropic Engineering] [${a.title}](${a.url})`)
    .join('\n')}\n`;

  const localTime = new Intl.DateTimeFormat('zh-TW', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  const footer = `\n${SEP}\n🤖 ad-hoc · Anthropic Engineering 精選 · ${articles.length} 篇\n🕒 ${localTime} (${tz})\n`;

  return head + body + observation + links + footer;
}

async function main() {
  const env = process.env;
  const markdown = buildMarkdown();
  const subject = `🧠 Anthropic Engineering 精選 — agent / harness / context (${articles.length} 篇)`;

  const dir = path.resolve('reports');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `anthropic-engineering-${todayStr(tz)}.md`);
  await fs.writeFile(file, markdown, 'utf8');
  console.log(`Saved -> ${file}`);

  const tasks = [];
  if (String(env.ENABLE_EMAIL ?? 'true').toLowerCase() === 'true') {
    tasks.push(
      sendEmail({ subject, markdown, env })
        .then((id) => console.log(`Email sent: ${id}`))
        .catch((e) => console.error(`Email FAILED: ${e.message}`))
    );
  }
  if (String(env.ENABLE_LINE ?? 'true').toLowerCase() === 'true') {
    tasks.push(
      sendLine({ markdown, env })
        .then((n) => console.log(`LINE sent: ${n} chunk(s)`))
        .catch((e) => console.error(`LINE FAILED: ${e.message}`))
    );
  }
  await Promise.all(tasks);
  console.log('Done.');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
