// Anthropic 也沒有官方 RSS。抓 https://www.anthropic.com/news 列表頁。
import * as cheerio from 'cheerio';
import { fetchText, withinHours } from '../utils/http.js';

const SOURCE_URL = 'https://www.anthropic.com/news';

export async function fetchAnthropic({ lookbackHours }) {
  const html = await fetchText(SOURCE_URL);
  const $ = cheerio.load(html);

  const items = [];
  const seen = new Set();
  // Anthropic 的文章連結通常是 /news/<slug>
  $('a[href^="/news/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href === '/news' || seen.has(href)) return;
    seen.add(href);

    const raw = $(el).text().replace(/\s+/g, ' ').trim();
    if (!raw || raw.length < 6) return;

    // 把開頭的「Apr 28, 2026Announcements」這類日期+分類去掉
    const datePrefix = /^([A-Z][a-z]{2}\s+\d{1,2},\s*\d{4})\s*([A-Za-z][A-Za-z &]*?)?(?=[A-Z])/;
    let dateStr = null;
    let title = raw;
    const m = raw.match(datePrefix);
    if (m) {
      dateStr = m[1];
      title = raw.slice(m[0].length).trim();
    }

    items.push({
      source: 'Anthropic',
      title: title.slice(0, 240),
      url: new URL(href, 'https://www.anthropic.com').toString(),
      publishedAt: dateStr ? new Date(dateStr).toISOString() : null,
    });
  });

  return items
    .filter((it) => withinHours(it.publishedAt, lookbackHours))
    .slice(0, 30);
}
