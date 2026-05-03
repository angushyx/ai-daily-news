// LINE Messaging API 推播
// 注意：LINE Notify 已於 2025/4/1 停止服務，此處走 push API。
// 需在 LINE Developers Console 建立 Messaging API channel，並把自己加 bot 為好友。
import { markdownToPlainText } from '../render.js';

const PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const SINGLE_MSG_LIMIT = 4900; // 官方限制 5000，留 buffer

function chunk(text, size) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

export async function sendLine({ markdown, env }) {
  const token = env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = env.LINE_TO_USER_ID;
  if (!token || !to) {
    throw new Error('LINE 必填欄位缺漏：LINE_CHANNEL_ACCESS_TOKEN / LINE_TO_USER_ID');
  }

  const plain = markdownToPlainText(markdown);
  const parts = chunk(plain, SINGLE_MSG_LIMIT);
  // 一次最多 5 則 message；超過就拆多次請求
  const groups = [];
  for (let i = 0; i < parts.length; i += 5) groups.push(parts.slice(i, i + 5));

  for (const g of groups) {
    const res = await fetch(PUSH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        messages: g.map((t) => ({ type: 'text', text: t })),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`LINE push failed ${res.status}: ${body}`);
    }
  }
  return parts.length;
}
