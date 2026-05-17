import './bootstrap.js'; // 必須最先 import：給 Node 18 polyfill global File
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchOpenAI } from './sources/openai.js';
import { fetchAnthropic } from './sources/anthropic.js';
import { fetchMeta } from './sources/meta.js';
import { fetchMistral } from './sources/mistral.js';
import { fetchRssFeeds } from './sources/rss-feeds.js';
import { fetchGithubReleases } from './sources/github-releases.js';
import { loadSeen, saveSeen } from './store.js';
import { summarize } from './summarize.js';
import { loadProjectContext, formatProjectContext } from './project-context.js';
import { runResearchWeekly } from './research-weekly.js';
import { saveMarkdown, todayStr, weekLabel } from './render.js';
import { sendEmail } from './notify/email.js';
import { sendLine } from './notify/line.js';

const DRY_RUN = process.argv.includes('--dry-run');
// --mode=daily | --mode=weekly （也吃 env MODE，預設 daily）
const MODE = (() => {
  const arg = process.argv.find((a) => a.startsWith('--mode='));
  if (arg) return arg.split('=')[1];
  return (process.env.MODE || 'daily').toLowerCase();
})();

function bool(v, dflt = false) {
  if (v === undefined || v === '') return dflt;
  return String(v).toLowerCase() === 'true';
}

async function safeFetch(name, fn) {
  try {
    const items = await fn();
    console.log(`[${name}] got ${items.length} item(s)`);
    return items;
  } catch (err) {
    console.warn(`[${name}] FAILED: ${err.message}`);
    return [];
  }
}

async function run() {
  const env = process.env;
  const tz = env.TZ || 'Asia/Taipei';
  const isWeekly = MODE === 'weekly';
  const isResearch = MODE === 'research-weekly';
  const isLongForm = isWeekly || isResearch;
  // weekly / research-weekly 預設抓 7 天 (168h)；daily 預設 26h
  const defaultLookback = isLongForm ? 168 : 26;
  const lookbackHours = Number(
    env[isLongForm ? 'LOOKBACK_HOURS_WEEKLY' : 'LOOKBACK_HOURS'] || defaultLookback
  );

  const modeLabel = isResearch ? 'Research Weekly' : isWeekly ? 'Weekly' : 'Daily';
  console.log(
    `== AI ${modeLabel} News ${
      isLongForm ? weekLabel(tz) : todayStr(tz)
    } (lookback ${lookbackHours}h) ==`
  );

  const [openai, anthropic, meta, mistral, rss, gh] = await Promise.all([
    safeFetch('OpenAI', () => fetchOpenAI({ lookbackHours })),
    safeFetch('Anthropic', () => fetchAnthropic({ lookbackHours })),
    safeFetch('Meta', () => fetchMeta({ lookbackHours })),
    safeFetch('Mistral', () => fetchMistral({ lookbackHours })),
    safeFetch('RSS', () => fetchRssFeeds({ lookbackHours })),
    safeFetch('GitHub Releases', () => fetchGithubReleases({ lookbackHours })),
  ]);

  let items = [...openai, ...anthropic, ...meta, ...mistral, ...rss, ...gh];

  // long-form (weekly / research-weekly) 不過濾 seen；daily 才過濾
  const seen = isLongForm ? new Set() : await loadSeen();
  const fresh = isLongForm
    ? items.filter((it) => it.url)
    : items.filter((it) => it.url && !seen.has(it.url));
  console.log(`Total: ${items.length}, ${isLongForm ? 'this-week' : 'fresh'}: ${fresh.length}`);

  if (DRY_RUN) {
    console.log('--- DRY RUN: items ---');
    console.log(JSON.stringify(fresh, null, 2));
    return;
  }

  // 摘要：daily/weekly 用 summarize，research-weekly 跑兩段式 harness
  const wkLabel = weekLabel(tz);

  // 載入使用者專案脈絡，讓 summary 能做「文章 ↔ 我的專案」關聯分析
  // 可用 env.PROJECT_PATH 覆寫；找不到就 silent skip（不影響原流程）
  const projectCtx = !isResearch ? await loadProjectContext({ days: isWeekly ? 14 : 7 }) : null;
  const projectContext = formatProjectContext(projectCtx);
  if (projectCtx) {
    console.log(
      `[project-context] ${projectCtx.name} (${projectCtx.recentCommits?.length || 0} commits, ${projectCtx.docTitles?.length || 0} docs)`
    );
  }

  const summary = isResearch
    ? await runResearchWeekly(fresh, env, { weekLabel: wkLabel })
    : await summarize(fresh, env, {
        mode: isWeekly ? 'weekly' : 'daily',
        weekLabel: wkLabel,
        projectContext,
      });

  const label = isResearch
    ? `Research Weekly ${wkLabel}`
    : isWeekly
    ? `Weekly ${wkLabel}`
    : `Daily ${todayStr(tz)}`;
  const subjectIcon = isResearch ? '🧠' : '🤖';
  const subject = `${subjectIcon} AI ${label} — ${fresh.length} 則`;
  const localTime = new Intl.DateTimeFormat('zh-TW', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  const SEP = '━━━━━━━━━━━━━━━━━━━━━';
  // research-weekly 不附「全部原始連結」清單（主題內已有引用）
  // weekly 也不附（新版 weekly prompt 已要求摘要本身就完整分類收錄全部文章）
  // 只有 daily 留 footer，作為快速參考清單
  const linksSection = !isResearch && !isWeekly && fresh.length
    ? `\n${SEP}\n\n## 📎 原始連結\n${fresh
        .map((it) => `- [${it.source}] [${it.title}](${it.url})`)
        .join('\n')}\n`
    : '';
  const modeTag = isResearch ? 'research-weekly' : isWeekly ? 'weekly' : 'daily';
  const countWord = isLongForm ? '本週' : '新增';
  const footer = `\n${SEP}\n${subjectIcon} ${modeTag} · 回溯 ${lookbackHours}h · 抓取 ${items.length} 篇 · ${countWord} ${fresh.length} 篇\n🕒 ${localTime} (${tz})\n`;
  const markdown = `${summary}\n${linksSection}${footer}`;

  // 存檔：research-weekly 用獨立檔名 reports/research-weekly-YYYY-Www.md
  let file;
  if (isResearch) {
    const dir = path.resolve('reports');
    await fs.mkdir(dir, { recursive: true });
    file = path.join(dir, `research-weekly-${wkLabel}.md`);
    await fs.writeFile(file, markdown, 'utf8');
  } else {
    file = await saveMarkdown(markdown, tz, { mode: isWeekly ? 'weekly' : 'daily' });
  }
  console.log(`Saved report -> ${file}`);

  // 通知（即使沒有 fresh 文章也送一封，方便確認 cron 真的有跑；要省可改成 if (fresh.length)）
  const tasks = [];
  if (bool(env.ENABLE_EMAIL, true)) {
    tasks.push(
      sendEmail({ subject, markdown, env })
        .then((id) => console.log(`Email sent: ${id}`))
        .catch((e) => console.error(`Email FAILED: ${e.message}`))
    );
  }
  if (bool(env.ENABLE_LINE, true)) {
    tasks.push(
      sendLine({ markdown, env })
        .then((n) => console.log(`LINE sent: ${n} chunk(s)`))
        .catch((e) => console.error(`LINE FAILED: ${e.message}`))
    );
  }
  await Promise.all(tasks);

  // 標記已讀（只在 daily 模式做；weekly / research-weekly 不影響 daily 去重）
  if (!isLongForm) {
    for (const it of fresh) seen.add(it.url);
    await saveSeen(seen);
  }
  console.log('Done.');
}

run().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
