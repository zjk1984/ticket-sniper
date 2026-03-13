#!/usr/bin/env node
/**
 * Ticket Sniper - 登录脚本
 * 
 * 打开浏览器让用户手动登录大麦网，登录成功后保存 session
 */

import { chromium } from 'playwright';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(homedir(), '.ticket-sniper');
const SESSION_FILE = join(DATA_DIR, 'session.json');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

async function main() {
  console.log('🎫 大麦网登录工具');
  console.log('='.repeat(40));
  
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
    ]
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  
  const page = await context.newPage();
  
  console.log('正在打开大麦网登录页面...');
  await page.goto('https://passport.damai.cn/login');
  
  console.log('\n请在浏览器中完成登录操作：');
  console.log('支持的登录方式：');
  console.log('  1. 手机验证码登录（推荐）');
  console.log('  2. 淘宝/支付宝扫码登录');
  console.log('  3. 账号密码登录');
  console.log('\n登录成功后，回到此终端按 Enter 键\n');
  
  // 等待用户按键
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });
  
  // 保存 cookies
  const cookies = await context.cookies();
  writeFileSync(SESSION_FILE, JSON.stringify(cookies, null, 2));
  
  console.log('\n✅ 登录状态已保存！');
  console.log(`Session 文件: ${SESSION_FILE}`);
  
  await browser.close();
  console.log('登录完成，可以运行抢票脚本了！');
}

main().catch(console.error);
