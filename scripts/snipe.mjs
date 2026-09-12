#!/usr/bin/env node
/**
 * Ticket Sniper - 大麦网抢票主脚本
 * 
 * 功能：定时抢票、多次重试、验证码处理、结果通知
 */

import { chromium } from 'playwright';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { notify } from '../lib/notify.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(homedir(), '.ticket-sniper', 'logs');
const SESSION_FILE = join(homedir(), '.ticket-sniper', 'session.json');

// 创建日志目录
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

// 日志函数
function log(message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}`;
  console.log(logLine);
  // 追加到日志文件
  const logFile = join(LOG_DIR, `snipe-${new Date().toISOString().slice(0,10)}.log`);
  // 简化：直接输出，实际可追加写入文件
}

// 延迟函数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 随机延迟（模拟人类行为）
const randomSleep = (min, max) => sleep(Math.random() * (max - min) + min);

/**
 * 加载配置
 */
function loadConfig(configPath) {
  if (!existsSync(configPath)) {
    throw new Error(`配置文件不存在: ${configPath}`);
  }
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  
  // 环境变量替换
  const replaceEnv = (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] || '');
  };
  
  const traverse = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = replaceEnv(obj[key]);
      } else if (typeof obj[key] === 'object') {
        traverse(obj[key]);
      }
    }
  };
  traverse(config);
  
  return config;
}

/**
 * 初始化浏览器
 */
async function initBrowser(options = {}) {
  const { headless = false } = options;
  
  log('正在启动浏览器...');
  const browser = await chromium.launch({
    headless,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ]
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  
  // 加载已保存的 session
  if (existsSync(SESSION_FILE)) {
    log('加载已保存的登录状态...');
    const cookies = JSON.parse(readFileSync(SESSION_FILE, 'utf-8'));
    await context.addCookies(cookies);
  }
  
  const page = await context.newPage();
  
  return { browser, context, page };
}

/**
 * 等待抢票时间
 */
async function waitUntilSnipeTime(startTime, advanceMs = 5000) {
  const targetTime = new Date(startTime).getTime();
  const now = Date.now();
  const waitTime = targetTime - now - advanceMs;
  
  if (waitTime > 0) {
    log(`距离开票时间还有 ${Math.floor(waitTime / 1000)} 秒，等待中...`);
    await sleep(waitTime);
  }
  
  log('即将开票，准备抢票！');
}

/**
 * 抢票核心逻辑
 */
async function snipe(page, config) {
  const { event, snipe } = config;
  const maxRetries = snipe.maxRetries || 50;
  const retryInterval = snipe.retryIntervalMs || 100;
  
  log(`正在访问: ${event.url}`);
  await page.goto(event.url, { waitUntil: 'networkidle' });
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log(`第 ${attempt}/${maxRetries} 次尝试抢票...`);
      
      // 等待购买按钮出现
      const buyButton = await page.waitForSelector('.buybtn, .btn-buy, [class*="buy"]', { timeout: 3000 }).catch(() => null);
      
      if (!buyButton) {
        // 可能还没开票，检查是否有倒计时
        const countdown = await page.$('[class*="countdown"], [class*="timer"]');
        if (countdown) {
          log('检测到倒计时，等待开票...');
          await sleep(1000);
          continue;
        }
      }
      
      // 选择场次（如果需要）
      if (event.sessions && event.sessions.length > 0) {
        const sessionSelector = `[data-session="${event.sessions[0].id}"], .session-item:nth-child(1)`;
        await page.click(sessionSelector).catch(() => {});
        await randomSleep(100, 300);
      }
      
      // 选择票档（如果需要）
      if (event.ticketTypes && event.ticketTypes.length > 0) {
        const ticketSelector = `[data-price="${event.ticketTypes[0].id}"], .price-item:nth-child(1)`;
        await page.click(ticketSelector).catch(() => {});
        await randomSleep(100, 300);
      }
      
      // 点击购买
      if (buyButton) {
        await buyButton.click();
        await randomSleep(200, 500);
        
        // 检查是否进入订单确认页
        const orderPage = await page.waitForSelector('.order-confirm, .submit-btn, [class*="submit"]', { timeout: 3000 }).catch(() => null);
        
        if (orderPage) {
          log('已进入订单确认页！');
          
          // 选择观演人
          if (event.buyer) {
            const buyerCheckbox = await page.$('[class*="buyer"], [class*="audience"]');
            if (buyerCheckbox) {
              await buyerCheckbox.click();
              await randomSleep(100, 200);
            }
          }
          
          // 提交订单
          await page.click('.submit-btn, [class*="submit"]');
          log('已提交订单！');
          
          // 等待结果
          await page.waitForTimeout(2000);
          
          // 检查是否成功
          const success = await page.$('.success, [class*="success"], .order-success');
          if (success) {
            return { success: true, message: '抢票成功！请尽快完成支付。' };
          }
          
          const failMsg = await page.$eval('.error, [class*="error"]', el => el.textContent).catch(() => '未知错误');
          return { success: false, message: `抢票失败: ${failMsg}` };
        }
      }
      
      // 等待重试
      await sleep(retryInterval);
      
    } catch (error) {
      log(`尝试 ${attempt} 失败: ${error.message}`);
      await sleep(retryInterval);
    }
  }
  
  return { success: false, message: '抢票失败：已达到最大重试次数' };
}

/**
 * 处理验证码
 */
async function handleCaptcha(page, config) {
  // 检测是否有验证码
  const captcha = await page.$('[class*="captcha"], [class*="verify"], .slider');
  
  if (captcha) {
    log('检测到验证码，请手动完成验证...');
    // 发送通知
    await sendNotification('需要处理验证码', '请在浏览器中完成验证码验证', config);
    
    // 等待用户完成验证码
    await page.waitForSelector('[class*="captcha"]', { state: 'hidden', timeout: 60000 }).catch(() => {});
    log('验证码已完成');
  }
}

/**
 * 发送通知
 */
async function sendNotification(title, message, config = null) {
  const notifyConfig = config?.notify || {
    channels: ['feishu', 'console'],
    feishuMode: process.env.FEISHU_APP_ID ? 'app' : 'webhook',
    feishuAppId: process.env.FEISHU_APP_ID,
    feishuAppSecret: process.env.FEISHU_APP_SECRET,
    feishuReceiveId: process.env.FEISHU_RECEIVE_ID,
    feishuReceiveIdType: process.env.FEISHU_RECEIVE_ID_TYPE || 'chat_id',
    feishuWebhook: process.env.FEISHU_WEBHOOK_URL
  };

  await notify(notifyConfig, title, message);
  log(`[通知] ${title}: ${message}`);
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const configIndex = args.indexOf('--config');
  const configPath = configIndex >= 0 ? args[configIndex + 1] : null;
  const headless = args.includes('--headless');
  const dryRun = args.includes('--dry-run');
  
  if (!configPath) {
    console.error('使用方式: node snipe.mjs --config <config-file> [--headless] [--dry-run]');
    process.exit(1);
  }
  
  let config = null;
  try {
    config = loadConfig(configPath);
    log('配置加载成功');
    
    if (dryRun) {
      log('[模拟运行] 不会实际提交订单');
    }
    
    const { browser, page } = await initBrowser({ headless });
    
    try {
      // 等待抢票时间
      await waitUntilSnipeTime(config.snipe.startTime, config.snipe.advanceMs);
      
      // 处理验证码（如果有）
      await handleCaptcha(page, config);
      
      // 开始抢票
      let result;
      if (dryRun) {
        result = { success: false, message: '模拟运行结束' };
      } else {
        result = await snipe(page, config);
      }
      
      // 发送结果通知
      await sendNotification(
        result.success ? '🎉 抢票成功' : '😢 抢票失败',
        result.message,
        config
      );
      
      // 如果成功，保持浏览器打开让用户支付
      if (result.success) {
        log('请尽快在浏览器中完成支付...');
        // 保持运行，不关闭浏览器
        await new Promise(() => {});
      }
      
    } finally {
      if (!dryRun && !process.env.KEEP_BROWSER) {
        await browser.close();
      }
    }
    
  } catch (error) {
    log(`错误: ${error.message}`);
    await sendNotification('抢票脚本错误', error.message, config);
    process.exit(1);
  }
}

main();
