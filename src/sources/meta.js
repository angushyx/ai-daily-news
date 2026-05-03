// Meta AI Blog - 沒有官方 RSS，HTML scrape。
import * as cheerio from 'cheerio';
import { fetchText, withinHours } from '../utils/http.js';

const SOURCE_URL = 'https://ai.meta.com/blog/';

export async function fetchMeta({ lookbackHours }) {
  // ai.meta.com 對某些 UA 回 400；補 Referer 與 Accept 通常能過
  const html = await fetchText(SOURCE_URL, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'en-US,en;q=0.9',
      referer: 'https://www.google.com/',
    },
  });
  const $ = cheerio.load(html);

  const items = [];
  const seen = new Set();
  // Meta 的文章卡片連結通常以 /blog/<slug>/ 開頭
  $('a[href^="/blog/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href === '/blog/' || href === '/blog' || seen.has(href)) return;
    seen.add(href);

    const title = $(el).text().replace(/\s+/g, ' ').trim();
    if (!title || title.length < 8) return;

    let dateStr = null;
    const $time = $(el).closest('article,li,div').find('time').first();
    if ($time.length) dateStr = $time.attr('datetime') || $time.text().trim();

    items.push({
      source: 'Meta AI',
      title: title.slice(0, 240),
      url: new URL(href, 'https://ai.meta.com').toString(),
      publishedAt: dateStr ? new Date(dateStr).toISOString() : null,
    });
  });

  return items
    .filter((it) => withinHours(it.publishedAt, lookbackHours))
    .slice(0, 30);
}
