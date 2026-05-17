// 讀取使用者目前在迭代的專案狀態（README、近期 commits、active docs），
// 餵給 summarize 的 prompt 讓報告能反映「每日新聞 vs 我的專案」的關聯與啟發。
import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

const DEFAULT_PROJECT = process.env.PROJECT_PATH || '/Users/angushyx/Desktop/gcms-ai-forge';

export async function loadProjectContext({
  projectPath = DEFAULT_PROJECT,
  days = 14,
} = {}) {
  try {
    await fs.access(projectPath);
  } catch {
    console.warn(`[project-context] path 不存在: ${projectPath}`);
    return null;
  }

  const [readmeIntro, recentCommits, todo, handoff, docTitles, changedFiles] =
    await Promise.all([
      readSafe(path.join(projectPath, 'README.md'), 5000),
      gitLog(projectPath, days),
      readSafe(path.join(projectPath, 'docs/TODO.md'), 2500),
      latestHandoff(projectPath),
      listDocs(projectPath),
      gitChangedFiles(projectPath, days),
    ]);

  return {
    name: path.basename(projectPath),
    readmeIntro,
    recentCommits,
    todo,
    handoff,
    docTitles,
    changedFiles,
  };
}

async function readSafe(file, max) {
  try {
    const content = await fs.readFile(file, 'utf8');
    return content.slice(0, max);
  } catch {
    return null;
  }
}

function gitLog(projectPath, days) {
  try {
    const out = execSync(
      `git -C "${projectPath}" log --since="${days} days ago" --pretty=format:"%h %ad %s" --date=short`,
      { encoding: 'utf8', maxBuffer: 1024 * 1024 }
    );
    return out
      .trim()
      .split('\n')
      .filter(Boolean)
      .slice(0, 50);
  } catch {
    return [];
  }
}

function gitChangedFiles(projectPath, days) {
  try {
    const out = execSync(
      `git -C "${projectPath}" log --since="${days} days ago" --name-only --pretty=format: | sort -u | grep -v '^$'`,
      { encoding: 'utf8', maxBuffer: 1024 * 1024, shell: '/bin/zsh' }
    );
    return out
      .trim()
      .split('\n')
      .filter(Boolean)
      .slice(0, 60);
  } catch {
    return [];
  }
}

async function latestHandoff(projectPath) {
  try {
    const files = await fs.readdir(path.join(projectPath, 'docs'));
    const handoff = files
      .filter((f) => /^HANDOFF.*\.md$/i.test(f))
      .sort()
      .pop();
    if (!handoff) return null;
    return await readSafe(path.join(projectPath, 'docs', handoff), 2500);
  } catch {
    return null;
  }
}

async function listDocs(projectPath) {
  try {
    const files = await fs.readdir(path.join(projectPath, 'docs'));
    return files.filter((f) => f.endsWith('.md')).slice(0, 30);
  } catch {
    return [];
  }
}

export function formatProjectContext(ctx) {
  if (!ctx) return '';
  const lines = [];
  lines.push(`# 使用者目前在迭代的專案：${ctx.name}`);
  lines.push(`(這份脈絡是給你做「文章 → 我的專案」關聯思考用的，不是要你逐條列出來)`);

  if (ctx.readmeIntro) {
    lines.push('\n## 專案 README 開頭（願景 / 架構）');
    lines.push(ctx.readmeIntro);
  }

  if (ctx.recentCommits?.length) {
    lines.push(`\n## 近 14 天 commits（${ctx.recentCommits.length} 筆，新→舊）`);
    lines.push(ctx.recentCommits.join('\n'));
  }

  if (ctx.changedFiles?.length) {
    lines.push('\n## 近 14 天動過的檔案（觀察迭代焦點區域）');
    lines.push(ctx.changedFiles.join('\n'));
  }

  if (ctx.docTitles?.length) {
    lines.push('\n## docs/ 目錄（反映正在思考的主題）');
    lines.push(ctx.docTitles.join(', '));
  }

  if (ctx.handoff) {
    lines.push('\n## 最近一份 HANDOFF 摘錄');
    lines.push(ctx.handoff);
  }

  if (ctx.todo) {
    lines.push('\n## TODO');
    lines.push(ctx.todo);
  }

  return lines.join('\n');
}
