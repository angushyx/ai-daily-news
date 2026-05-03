// 常駐模式：用 node-cron 在指定時間自動跑 src/index.js 的流程。
import './bootstrap.js';
import 'dotenv/config';
import cron from 'node-cron';
import { spawn } from 'node:child_process';
import path from 'node:path';

const dailyExpr = process.env.CRON_EXPRESSION || '0 9 * * *';        // 每天 09:00
const weeklyExpr = process.env.CRON_WEEKLY || '0 10 * * 1';            // 每週一 10:00
const tz = process.env.TZ || 'Asia/Taipei';

console.log(`[daemon] daily="${dailyExpr}" weekly="${weeklyExpr}" tz=${tz}`);

function runOnce(mode) {
  const args = [path.resolve('src/index.js'), `--mode=${mode}`];
  const child = spawn(process.execPath, args, {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code) => console.log(`[daemon][${mode}] exited with code ${code}`));
}

for (const [expr, mode] of [[dailyExpr, 'daily'], [weeklyExpr, 'weekly']]) {
  if (!cron.validate(expr)) {
    console.error(`[daemon] invalid cron for ${mode}: ${expr}`);
    process.exit(1);
  }
  cron.schedule(expr, () => runOnce(mode), { timezone: tz });
}

// 啟動時也立刻跑一次 daily（除非帶 --no-immediate）
if (!process.argv.includes('--no-immediate')) {
  console.log('[daemon] running daily once on startup...');
  runOnce('daily');
}
