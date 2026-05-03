// 把摘要輸出成多種格式：terminal / markdown / 簡易 HTML / LINE 純文字。
import fs from 'node:fs/promises';
import path from 'node:path';

export function todayStr(tz = 'Asia/Taipei') {
  const d = new Date();
  // 簡單做法：以 tz 偏移輸出 YYYY-MM-DD
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(d); // YYYY-MM-DD
}

// ISO 週數：YYYY-Www，與 ISO 8601 對齊（週一為一週開始）
export function weekLabel(tz = 'Asia/Taipei', date = new Date()) {
  // 取出 tz 當前時間的 Y/M/D
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [y, m, d] = fmt.format(date).split('-').map(Number);
  // 用 UTC 計算 ISO 週，避免 DST 影響
  const target = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (target.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  target.setUTCDate(target.getUTCDate() - dayNum + 3); // 移到該週週四
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstThursdayDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDay + 3);
  const week = 1 + Math.round((target - firstThursday) / (7 * 24 * 3600 * 1000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export async function saveMarkdown(markdown, tz, { mode = 'daily' } = {}) {
  const dir = path.resolve('reports');
  await fs.mkdir(dir, { recursive: true });
  const name = mode === 'weekly' ? `weekly-${weekLabel(tz)}` : todayStr(tz);
  const file = path.join(dir, `${name}.md`);
  await fs.writeFile(file, markdown, 'utf8');
  return file;
}

export function markdownToBasicHtml(md) {
  // 非常輕量的 md → html，足以塞進 email
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 連結 [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // 粗體 **x**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // 標題
  html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*)$/gm, '<h1>$1</h1>');
  // bullet
  html = html.replace(/^\s*-\s+(.*)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>');
  // 段落換行
  html = html.replace(/\n{2,}/g, '</p><p>');
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,sans-serif;line-height:1.55;max-width:720px;margin:auto;padding:16px;"><p>${html}</p></body></html>`;
}

export function markdownToPlainText(md) {
  return md
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1\n  $2')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1$2')
    .replace(/^\s*---+\s*$/gm, '')
    .replace(/^###\s*(.+)$/gm, '── $1 ──')
    .replace(/^##\s*(.+)$/gm, '▎$1')
    .replace(/^#\s*(.+)$/gm, '▎$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
