// 研究週報 (research-weekly)：套 initializer + researcher 兩段式 harness 做 Stratechery 風深度週報
// - stage 1: initializer agent 看本週素材，挑 1~2 個主題 → 寫 progress file (JSON + markdown trace)
// - stage 2: 對每個主題跑 3 輪 (draft → critique → refine) 寫成深度分析
// 其他沒進主題的文章退到附錄
import fs from 'node:fs/promises';
import path from 'node:path';
import { callLlm, buildItemList, SYSTEM } from './summarize.js';

const ROUNDS = ['draft', 'critique', 'refine'];

// --------------- 公用：JSON 解析 ---------------

function extractJson(raw) {
  if (!raw) throw new Error('空輸出');
  // claude-cli / gemini-cli 偶爾會用 ```json fence 包，剝掉
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1] : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`找不到 JSON 物件: ${raw.slice(0, 200)}`);
  const jsonStr = candidate.slice(start, end + 1);
  return JSON.parse(jsonStr);
}

// --------------- Stage 1: initializer ---------------

const INIT_SYSTEM = `你是 AI 產業週報的研究主編。任務：從本週素材中找出 1~2 個值得深度寫成 Stratechery 風文章的主題。

挑主題的標準：
- 跨多篇文章可串成一個故事，不只是單一新聞
- 對工程師有實際決策意涵（技術選型、架構演進、商業模式變化）
- 本週有真正的新進展，不是老議題重述

只輸出 JSON，不要解釋、不要 markdown、不要 codeblock。`;

function buildInitPrompt(items, weekLabel) {
  return `本週 (${weekLabel}) 素材清單，編號從 0 開始：

${items
  .map((it, i) => {
    const lines = [`[${i}] [${it.source}] ${it.title} (${it.url})`];
    if (it.publishedAt) lines.push(`    Published: ${it.publishedAt}`);
    if (it.summary) lines.push(`    Snippet: ${it.summary.replace(/\s+/g, ' ').slice(0, 200)}`);
    return lines.join('\n');
  })
  .join('\n\n')}

挑出 1~2 個主題（如果素材不夠跨文章串聯，就只挑 1 個）。每個主題回 JSON：

{
  "themes": [
    {
      "name": "主題名稱（10~20 字，講清楚這篇要講什麼）",
      "angle": "為什麼這週這個值得寫，跟過去/其他主題差在哪（1~2 句）",
      "key_questions": ["讀者讀完應該能回答的 2~4 個問題"],
      "article_indices": [挑進這個主題的素材編號陣列, 至少 2 個],
      "success_criteria": "寫成怎樣才算合格（1 句）"
    }
  ]
}

只輸出這個 JSON 物件，不要任何其他文字。`;
}

async function runInitializer(items, env, weekLabel) {
  const prompt = buildInitPrompt(items, weekLabel);
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await callLlm(prompt, env, { system: INIT_SYSTEM, maxTokens: 1500 });
      const parsed = extractJson(raw);
      if (!parsed.themes || !Array.isArray(parsed.themes) || parsed.themes.length === 0) {
        throw new Error('themes 欄位空或不是陣列');
      }
      // 驗證 article_indices 都在範圍內
      for (const t of parsed.themes) {
        t.article_indices = (t.article_indices || []).filter((i) => Number.isInteger(i) && i >= 0 && i < items.length);
        if (t.article_indices.length < 2) throw new Error(`主題「${t.name}」的 article_indices 少於 2`);
      }
      return parsed.themes;
    } catch (err) {
      lastErr = err;
      console.warn(`[initializer] attempt ${attempt} 失敗: ${err.message}`);
    }
  }
  throw new Error(`initializer 連續 2 次失敗: ${lastErr.message}`);
}

// --------------- Stage 2: researcher (3 rounds per theme) ---------------

const RESEARCH_SYSTEM = `${SYSTEM}

你現在在寫一篇 Stratechery 風的深度分析，目標讀者是工程師與產品 PM。
- 不寫 listicle、不堆 bullet，主體要是有結構的散文段落
- 每段都要有「論點 → 證據（引用素材）→ 推論」的完整節奏
- 引用素材時用 \`[來源] [標題](URL)\` 行內連結
- 不要在文章裡寫「總結」「以上」這類自我指涉的廢話`;

function buildDraftPrompt(theme, articles, weekLabel) {
  return `主題：${theme.name}
角度：${theme.angle}
讀者讀完應能回答：
${theme.key_questions.map((q, i) => `  ${i + 1}. ${q}`).join('\n')}
合格標準：${theme.success_criteria}

本週與此主題相關的素材：

${buildItemList(articles, 350)}

請寫一篇 1500~2200 字的深度分析（${weekLabel}），結構建議：

1. 開場（150~250 字）：用一個具體現象或數字切入，立刻給「這週為什麼重要」的論點
2. 中段（1000~1500 字）：分 2~4 個小節（用 \`### 小標\`），每節都把多篇文章串成因果或對比
3. 收尾（200~400 字）：講對工程師/PM 接下來的決策意涵

要求：
- 中文、技術名詞保留英文
- 行內引用素材：\`[來源] [標題](URL)\`
- 直接輸出 markdown 內文，不要寫 \`# 標題\`（標題我會在外層加）
- 不要編造素材沒提到的事`;
}

function buildCritiquePrompt(theme, articles, draft) {
  return `主題：${theme.name}
合格標準：${theme.success_criteria}
讀者問題：
${theme.key_questions.map((q, i) => `  ${i + 1}. ${q}`).join('\n')}

可用素材：

${buildItemList(articles, 250)}

下面是初稿：

---
${draft}
---

請扮演挑剔的編輯，列出 5~8 條具體改進點。重點檢查：
- 哪些論點空洞、缺具體證據或數字
- 哪些素材沒被引用但其實該引（指出 [來源] [標題]）
- 哪段是廢話可刪
- 哪些「對工程師影響」流於空泛
- 是否真的回答了讀者問題

直接輸出 bullet list（每條開頭具體指出在哪段），不要前言、不要結語。`;
}

function buildRefinePrompt(theme, articles, draft, critique, weekLabel) {
  return `主題：${theme.name}
角度：${theme.angle}
讀者問題：
${theme.key_questions.map((q, i) => `  ${i + 1}. ${q}`).join('\n')}

可用素材：

${buildItemList(articles, 350)}

初稿：

---
${draft}
---

編輯的改進點：

---
${critique}
---

請根據改進點重寫成最終版（1500~2200 字，${weekLabel}）。
- 採納改進點，但保留初稿中已經寫得好的地方
- 該補的引用要補進去
- 直接輸出 markdown 內文（不要 \`# 標題\`）
- 不要說「我修改了 X」，直接給最終文`;
}

async function writeTheme({ theme, articles, env, weekLabel, onRound }) {
  let draft = await callLlm(buildDraftPrompt(theme, articles, weekLabel), env, {
    system: RESEARCH_SYSTEM,
    maxTokens: 4000,
  });
  await onRound('draft', draft);

  const critique = await callLlm(buildCritiquePrompt(theme, articles, draft), env, {
    system: RESEARCH_SYSTEM,
    maxTokens: 1500,
  });
  await onRound('critique', critique);

  const final = await callLlm(buildRefinePrompt(theme, articles, draft, critique, weekLabel), env, {
    system: RESEARCH_SYSTEM,
    maxTokens: 4000,
  });
  await onRound('refine', final);

  return final;
}

// --------------- Progress file ---------------

function progressPath(weekLabel) {
  return path.resolve('data', `research-progress-${weekLabel}.md`);
}

async function initProgress(weekLabel, themes, items) {
  const lines = [];
  lines.push(`# Research Progress — ${weekLabel}`);
  lines.push(`> Auto-generated by initializer · ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`## Themes`);
  themes.forEach((t, i) => {
    lines.push('');
    lines.push(`### Theme ${i + 1}: ${t.name}`);
    lines.push(`- **角度**：${t.angle}`);
    lines.push(`- **讀者問題**：`);
    t.key_questions.forEach((q) => lines.push(`  - ${q}`));
    lines.push(`- **合格標準**：${t.success_criteria}`);
    lines.push(`- **相關文章**：`);
    t.article_indices.forEach((idx) => {
      const a = items[idx];
      lines.push(`  - [${a.source}] [${a.title}](${a.url})`);
    });
  });
  lines.push('');
  lines.push('## Iteration log');
  const md = lines.join('\n') + '\n';
  await fs.mkdir(path.dirname(progressPath(weekLabel)), { recursive: true });
  await fs.writeFile(progressPath(weekLabel), md, 'utf8');
}

async function appendProgress(weekLabel, line) {
  const stamped = `- ${new Date().toISOString()} ${line}`;
  await fs.appendFile(progressPath(weekLabel), stamped + '\n', 'utf8');
}

// --------------- Orchestrator ---------------

export async function runResearchWeekly(items, env, { weekLabel }) {
  if (!items.length) {
    return `# AI 深度週報 ${weekLabel}\n\n本週沒有抓到 AI 大廠的新文章。`;
  }

  console.log(`[research-weekly] stage 1: initializer (${items.length} items)`);
  const themes = await runInitializer(items, env, weekLabel);
  console.log(`[research-weekly] picked ${themes.length} theme(s):`);
  themes.forEach((t, i) => console.log(`  ${i + 1}. ${t.name} (articles: ${t.article_indices.join(',')})`));

  await initProgress(weekLabel, themes, items);
  await appendProgress(weekLabel, `[initializer] picked ${themes.length} theme(s): ${themes.map((t) => t.name).join(' / ')}`);

  // Stage 2: 對每個主題跑 3 輪
  const sections = [];
  const usedIndices = new Set();
  for (let ti = 0; ti < themes.length; ti++) {
    const theme = themes[ti];
    const articles = theme.article_indices.map((i) => items[i]);
    theme.article_indices.forEach((i) => usedIndices.add(i));

    console.log(`[research-weekly] stage 2: theme ${ti + 1}/${themes.length} "${theme.name}"`);
    const final = await writeTheme({
      theme,
      articles,
      env,
      weekLabel,
      onRound: async (round, text) => {
        const wc = text.length;
        console.log(`  - round ${round}: ${wc} chars`);
        await appendProgress(weekLabel, `[researcher theme ${ti + 1} / ${round}] ${wc} chars`);
      },
    });
    sections.push({ theme, body: final });
  }

  // 組裝 markdown
  const out = [];
  out.push(`# AI 深度週報 ${weekLabel}`);
  out.push('');
  out.push(`本週深度分析 ${themes.length} 個主題。其他新聞放在文末附錄。`);
  out.push('');
  sections.forEach((s, i) => {
    out.push(`## ${i + 1}. ${s.theme.name}`);
    out.push('');
    out.push(`> ${s.theme.angle}`);
    out.push('');
    out.push(s.body.trim());
    out.push('');
  });

  // 附錄：沒進主題的文章
  const appendix = items.filter((_, i) => !usedIndices.has(i));
  if (appendix.length) {
    out.push('---');
    out.push('');
    out.push(`## 本週其他重點 (${appendix.length} 則)`);
    out.push('');
    appendix.forEach((it) => {
      out.push(`- [${it.source}] [${it.title}](${it.url})`);
    });
    out.push('');
  }

  await appendProgress(weekLabel, `[done] ${sections.length} theme(s), ${appendix.length} appendix items`);
  return out.join('\n');
}
