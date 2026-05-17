// 通用 RSS feed loader：所有有 RSS 的來源集中管理在這個 config。
// 想加新來源？直接在 FEEDS 加一行即可。
import Parser from 'rss-parser';
import { fetchText, withinHours } from '../utils/http.js';

export const FEEDS = [
  // ---- Tier 1：模型廠（自家研究 / 公告） ----
  { name: 'Google AI (The Keyword)', url: 'https://blog.google/technology/ai/rss/', tier: 1 },
  { name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml', tier: 1 },
  { name: 'Google Research', url: 'https://research.google/blog/rss/', tier: 1 },
  { name: 'Microsoft Research', url: 'https://www.microsoft.com/en-us/research/feed/', tier: 1 },
  // Qwen blog 改名/搬家頻繁，找到穩定 RSS 再加

  // ---- Tier 2：AI infra / dev tools (對全端工程師最直接) ----
  { name: 'Google for Developers', url: 'https://developers.googleblog.com/feeds/posts/default?alt=rss', tier: 2 },
  { name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml', tier: 2 },
  // LangChain 自家 RSS 結構不合規 (rss-parser 解析失敗)；他們重要訊息會出現在 Latent Space / GitHub releases
  // { name: 'LangChain Blog', url: 'https://blog.langchain.dev/rss/', tier: 2 },
  { name: 'Vercel Blog', url: 'https://vercel.com/atom', tier: 2 },
  { name: 'Replicate Blog', url: 'https://replicate.com/blog/rss', tier: 2 },

  // ---- Tier 3：AIops / observability ----
  // (W&B / Helicone 沒穩定 RSS，先省略)

  // ---- Tier 4：三大雲 AI 部落格 (DevOps 必看) ----
  { name: 'AWS Machine Learning', url: 'https://aws.amazon.com/blogs/machine-learning/feed/', tier: 4 },
  { name: 'Google Cloud AI/ML', url: 'https://cloudblog.withgoogle.com/products/ai-machine-learning/rss/', tier: 4 },

  // ---- Tier 5：高訊噪比 newsletter / 工程師博客 ----
  { name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/', tier: 5 },
  { name: 'Latent Space', url: 'https://www.latent.space/feed', tier: 5 },
  { name: 'Pragmatic Engineer', url: 'https://blog.pragmaticengineer.com/rss/', tier: 5 },
];

const parser = new Parser({ timeout: 15000 });

// 有些 feed 會含未跳脫的 & 或控制字元，rss-parser 嚴格會炸。
// 先抓回字串、清理後再交給 parseString，比 parseURL 寬容。
function sanitizeXml(xml) {
  return xml
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // 控制字元
    .replace(/&(?!(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;'); // 未跳脫的 &
}

async function parseFeedLenient(url) {
  try {
    return await parser.parseURL(url);
  } catch (err) {
    // 二次嘗試：自己抓、清理、再 parse
    const xml = await fetchText(url, { timeoutMs: 15000 });
    return await parser.parseString(sanitizeXml(xml));
  }
}

export async function fetchRssFeeds({ lookbackHours, feeds = FEEDS }) {
  const all = [];
  await Promise.all(
    feeds.map(async (feed) => {
      try {
        const data = await parseFeedLenient(feed.url);
        for (const it of data.items || []) {
          all.push({
            source: feed.name,
            title: (it.title || '').trim().slice(0, 240),
            url: it.link,
            publishedAt: it.isoDate || (it.pubDate ? new Date(it.pubDate).toISOString() : null),
            summary: (it.contentSnippet || it.content || '').toString().replace(/\s+/g, ' ').slice(0, 600),
          });
        }
      } catch (err) {
        console.warn(`[rss] ${feed.name} failed: ${err.message}`);
      }
    })
  );
  return all
    .filter((it) => it.url && withinHours(it.publishedAt, lookbackHours))
    .slice(0, 200);
}
