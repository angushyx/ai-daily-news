// 通用 GitHub Releases (atom feed) 追蹤。
// 加新 repo 直接在 REPOS 加一行 'owner/repo' 即可。
import Parser from 'rss-parser';
import { withinHours } from '../utils/http.js';

export const REPOS = [
  // OSS 推理引擎
  'vllm-project/vllm',
  'ollama/ollama',
  'ggerganov/llama.cpp',

  // LLM 流量代理 / 觀測
  'BerriAI/litellm',

  // Agent / RAG 框架
  'langchain-ai/langchain',
  'langchain-ai/langgraph',
  'run-llama/llama_index',

  // Coding agents (你日常會用)
  'continuedev/continue',
  'cline/cline',

  // HF 生態
  'huggingface/transformers',
  'huggingface/diffusers',
  'huggingface/smolagents',

  // Agent SDK / MCP
  'anthropics/anthropic-cookbook',
  'modelcontextprotocol/servers',

  // Vercel AI SDK
  'vercel/ai',
];

const parser = new Parser({ timeout: 15000 });

export async function fetchGithubReleases({ lookbackHours, repos = REPOS }) {
  const all = [];
  await Promise.all(
    repos.map(async (repo) => {
      try {
        const data = await parser.parseURL(`https://github.com/${repo}/releases.atom`);
        for (const it of data.items || []) {
          // GitHub atom: title 通常是 release name；author/title 已是版本
          all.push({
            source: `GitHub: ${repo}`,
            title: `${repo} ${it.title || ''}`.trim().slice(0, 240),
            url: it.link,
            publishedAt: it.isoDate || (it.pubDate ? new Date(it.pubDate).toISOString() : null),
            summary: (it.contentSnippet || it.content || '').toString().replace(/\s+/g, ' ').slice(0, 600),
          });
        }
      } catch (err) {
        console.warn(`[github-releases] ${repo} failed: ${err.message}`);
      }
    })
  );
  return all
    .filter((it) => it.url && withinHours(it.publishedAt, lookbackHours))
    .slice(0, 100);
}
