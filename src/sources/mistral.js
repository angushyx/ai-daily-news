// Mistral AI News - 沒有官方 RSS，HTML scrape。
import * as cheerio from 'cheerio';
import { fetchText, withinHours } from '../utils/http.js';

const SOURCE_URL = 'https://mistral.ai/news/';

export async function fetchMistral({ lookbackHours }) {
  const html = await fetchText(SOURCE_URL);
  const $ = cheerio.load(html);

  const items = [];
  const seen = new Set();
  // Mistral 的文章連結通常以 /news/<slug>
  $('a[href^="/news/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href === '/news/' || href === '/news' || seen.has(href)) return;
    seen.add(href);

    const title = $(el).text().replace(/\s+/g, ' ').trim();
    if (!title || title.length < 6) return;

    let dateStr = null;
    const $time = $(el).closest('article,li,div').find('time').first();
    if ($time.length) dateStr = $time.attr('datetime') || $time.text().trim();

    items.push({
      source: 'Mistral AI',
      title: title.slice(0, 240),
      url: new URL(href, 'https://mistral.ai').toString(),
      publishedAt: dateStr ? new Date(dateStr).toISOString() : null,
    });
  });

  return items
    .filter((it) => withinHours(it.publishedAt, lookbackHours))
    .slice(0, 30);
}
