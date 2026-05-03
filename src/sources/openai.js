// OpenAI 沒有官方 RSS。改抓 https://openai.com/news/ HTML，解析卡片清單。
import * as cheerio from 'cheerio';
import { fetchText, withinHours } from '../utils/http.js';

const SOURCE_URL = 'https://openai.com/news/';

export async function fetchOpenAI({ lookbackHours }) {
  const html = await fetchText(SOURCE_URL);
  const $ = cheerio.load(html);

  const items = [];
  // OpenAI 的卡片連結通常以 /index/ 開頭。我們抓 a[href^="/index/"] 並去重。
  const seen = new Set();
  $('a[href^="/index/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || seen.has(href)) return;
    seen.add(href);

    // 嘗試找標題：a 內最大的文字節點 / 鄰近 h*
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (!text || text.length < 8) return;

    // 試圖解析日期：父層常有 time 或日期文字
    let dateStr = null;
    const $time = $(el).find('time').first().length
      ? $(el).find('time').first()
      : $(el).closest('article,div,section').find('time').first();
    if ($time.length) dateStr = $time.attr('datetime') || $time.text().trim() || null;

    // 去掉黏在標題尾巴的「分類 + 日期」，例：
    // "Introducing GPT-5.5ProductApr 23, 2026" -> "Introducing GPT-5.5"
    const cleaned = text
      .replace(/(Product|Safety|Research|Engineering|Company|Policy|Stories|Global Affairs)?[A-Z][a-z]{2}\s+\d{1,2},\s*\d{4}\s*$/, '')
      .trim();

    items.push({
      source: 'OpenAI',
      title: (cleaned || text).slice(0, 240),
      url: new URL(href, 'https://openai.com').toString(),
      publishedAt: dateStr ? new Date(dateStr).toISOString() : null,
    });
  });

  return items
    .filter((it) => withinHours(it.publishedAt, lookbackHours))
    .slice(0, 30);
}
