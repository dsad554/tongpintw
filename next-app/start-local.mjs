import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, '..');
const mode = process.argv[2] === 'start' ? 'start' : 'dev';
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
if (!fs.existsSync(nextBin)) throw new Error('尚未安装 Next.js 依赖，请先在 next-app 目录运行 npm install。');
const fallbackEnv = path.join(os.homedir(), '.config', 'zhihu-hot-oauth', '.env.local');
const envFile = process.env.ZHIHU_ENV_FILE || fallbackEnv;

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !match[1].startsWith('#') && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}

loadEnv(envFile);

async function backendReady() {
  try {
    const response = await fetch('http://127.0.0.1:51283/api/state', { signal: AbortSignal.timeout(1000) });
    if (!response.ok) return false;
    const state = await response.json();
    return ['questions', 'messages', 'shelf'].every((key) => Array.isArray(state[key]));
  } catch {
    return false;
  }
}

let preview;
if (!(await backendReady())) {
  const tool = path.join(repoRoot, '工具', '本地预览.mjs');
  if (!fs.existsSync(tool)) throw new Error(`找不到本地状态服务：${tool}`);
  preview = spawn(process.execPath, [tool], { cwd: repoRoot, env: { ...process.env, TONGPIN_PORT: '51283' }, stdio: 'inherit', windowsHide: true });
  for (let i = 0; i < 20 && !(await backendReady()); i += 1) await new Promise((resolve) => setTimeout(resolve, 250));
  if (!(await backendReady())) {
    preview.kill();
    throw new Error('本地状态服务启动失败，请检查端口 51283。');
  }
}

const next = spawn(process.execPath, [nextBin, mode, ...process.argv.slice(3)], { cwd: root, env: process.env, stdio: 'inherit', windowsHide: true });
const cleanup = () => { if (preview && !preview.killed) preview.kill(); };
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
next.on('error', (error) => { cleanup(); console.error(error.message); process.exit(1); });
next.on('exit', (code, signal) => { cleanup(); process.exit(code ?? (signal ? 1 : 0)); });
