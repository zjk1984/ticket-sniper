#!/usr/bin/env node
/**
 * Ticket Sniper - 登录脚本
 *
 * 打开浏览器让用户手动登录大麦网，登录成功后自动保存 session
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { launchBrowser, DEFAULT_USER_AGENT } from '../lib/browser.mjs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(homedir(), '.ticket-sniper');
const SESSION_FILE = join(DATA_DIR, 'session.json');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function isLoggedIn(context) {
  const cookies = await context.cookies(['https://www.damai.cn', 'https://damai.cn']);
  const authNames = new Set(['cookie2', 'sgcookie', 'unb', '_nk_', 'tracknick', 'cna']);
  return cookies.some(cookie => authNames.has(cookie.name));
}

async function saveSession(context) {
  const cookies = await context.cookies();
  writeFileSync(SESSION_FILE, JSON.stringify(cookies, null, 2));
  return cookies.length;
}

async function waitForEnter() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question('', () => {
      rl.close();
      resolve();
    });
  });
}

async function main() {
  console.log('🎫 大麦网登录工具');
  console.log('='.repeat(40));

  const browser = await launchBrowser({ headless: false });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: DEFAULT_USER_AGENT,
  });

  const page = await context.newPage();

  console.log('正在打开大麦网登录页面...');
  await page.goto('https://passport.damai.cn/login', { waitUntil: 'domcontentloaded' });

  console.log('\n请在浏览器中完成登录操作：');
  console.log('  1. 手机验证码登录（推荐）');
  console.log('  2. 淘宝/支付宝扫码登录');
  console.log('  3. 账号密码登录');
  console.log('\n登录成功后会自动保存；也可手动回到终端按 Enter 保存\n');

  let saved = false;

  const pollLogin = (async () => {
    for (let i = 0; i < 300; i++) {
      if (saved) return;
      if (await isLoggedIn(context)) {
        const count = await saveSession(context);
        saved = true;
        console.log(`\n✅ 检测到登录成功，已自动保存 ${count} 条 cookie`);
        console.log(`Session 文件: ${SESSION_FILE}`);
        await browser.close();
        console.log('登录完成，可以运行抢票脚本了！');
        process.exit(0);
      }
      await sleep(2000);
    }
    console.log('\n⚠️  等待登录超时（10 分钟），请重新运行 npm run login');
    await browser.close();
    process.exit(1);
  })();

  await Promise.race([pollLogin, waitForEnter()]);

  if (!saved) {
    const count = await saveSession(context);
    console.log(`\n✅ 登录状态已保存（${count} 条 cookie）`);
    console.log(`Session 文件: ${SESSION_FILE}`);
    await browser.close();
    console.log('登录完成，可以运行抢票脚本了！');
  }
}

main().catch(console.error);
