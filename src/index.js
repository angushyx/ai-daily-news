import './bootstrap.js'; // 必須最先 import：給 Node 18 polyfill global File
import 'dotenv/config';
import { fetchOpenAI } from './sources/openai.js';
import { fetchAnthropic } from './sources/anthropic.js';
import { fetchMeta } from './sources/meta.js';
import { fetchMistral } from './sources/mistral.js';
import { fetchRssFeeds } from './sources/rss-feeds.js';
import { fetchGithubReleases } from './sources/github-releases.js';
import { loadSeen, saveSeen } from './store.js';
import { summarize } from './summarize.js';
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
  // weekly 預設抓 7 天 (168h)；daily 預設 26h
  const defaultLookback = isWeekly ? 168 : 26;
  const lookbackHours = Number(
    env[isWeekly ? 'LOOKBACK_HOURS_WEEKLY' : 'LOOKBACK_HOURS'] || defaultLookback
  );

  console.log(
    `== AI ${isWeekly ? 'Weekly' : 'Daily'} News ${
      isWeekly ? weekLabel(tz) : todayStr(tz)
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

  // weekly 模式不過濾 seen（週報是回顧，重出沒關係）；daily 才過濾
  const seen = isWeekly ? new Set() : await loadSeen();
  const fresh = isWeekly
    ? items.filter((it) => it.url)
    : items.filter((it) => it.url && !seen.has(it.url));
  console.log(`Total: ${items.length}, ${isWeekly ? 'this-week' : 'fresh'}: ${fresh.length}`);

  if (DRY_RUN) {
    console.log('--- DRY RUN: items ---');
    console.log(JSON.stringify(fresh, null, 2));
    return;
  }

  // 摘要 (預設用 claude -p 走訂閱，免 API 費)
  const wkLabel = weekLabel(tz);
  const summary = await summarize(fresh, env, {
    mode: isWeekly ? 'weekly' : 'daily',
    weekLabel: wkLabel,
  });

  const label = isWeekly ? `Weekly ${wkLabel}` : `Daily ${todayStr(tz)}`;
  const subject = `🤖 AI ${label} — ${fresh.length} 則`;
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
  const linksSection = fresh.length
    ? `\n${SEP}\n\n## 📎 原始連結\n${fresh
        .map((it) => `- [${it.source}] [${it.title}](${it.url})`)
        .join('\n')}\n`
    : '';
  const footer = `\n${SEP}\n🤖 ${
    isWeekly ? 'weekly' : 'daily'
  } · 回溯 ${lookbackHours}h · 抓取 ${items.length} 篇 · ${
    isWeekly ? '本週' : '新增'
  } ${fresh.length} 篇\n🕒 ${localTime} (${tz})\n`;
  const markdown = `${summary}\n${linksSection}${footer}`;

  // 存檔
  const file = await saveMarkdown(markdown, tz, { mode: isWeekly ? 'weekly' : 'daily' });
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

  // 標記已讀（只在 daily 模式做；週報不應影響 daily 的去重狀態）
  if (!isWeekly) {
    for (const it of fresh) seen.add(it.url);
    await saveSeen(seen);
  }
  console.log('Done.');
}

run().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
