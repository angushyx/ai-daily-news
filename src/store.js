// 用 data/seen.json 紀錄已通知過的文章 URL，避免重複推送。
import fs from 'node:fs/promises';
import path from 'node:path';

const FILE = path.resolve('data/seen.json');

export async function loadSeen() {
  try {
    const buf = await fs.readFile(FILE, 'utf8');
    return new Set(JSON.parse(buf));
  } catch {
    return new Set();
  }
}

export async function saveSeen(set) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  // 限制最多保留 1000 筆，避免無限長
  const arr = Array.from(set).slice(-1000);
  await fs.writeFile(FILE, JSON.stringify(arr, null, 2), 'utf8');
}
