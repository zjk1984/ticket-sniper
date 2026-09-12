#!/usr/bin/env node
/**
 * Ticket Sniper - 大麦网抢票主脚本
 * 
 * 功能：定时抢票、多次重试、验证码处理、结果通知
 */

import { readFileSync, existsSync, mkdirSync } from 'fs';
import { launchBrowser, DEFAULT_USER_AGENT, mobileContextOptions } from '../lib/browser.mjs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { notify } from '../lib/notify.mjs';
import loadEnvFile from '../lib/load-env.mjs';

loadEnvFile();

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
  const { headless = false, useMobile = false } = options;
  
  log(`正在启动浏览器...${useMobile ? ' (移动端)' : ''}`);
  const browser = await launchBrowser({ headless });
  
  const context = await browser.newContext(
    useMobile
      ? mobileContextOptions()
      : { viewport: { width: 1280, height: 800 }, userAgent: DEFAULT_USER_AGENT }
  );
  
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
 * 解析每日监控结束时间（00:00 表示当日午夜，即次日 0 点）
 */
function resolveMonitorEndTime(endTime) {
  if (!endTime) return null;

  if (/^\d{4}-\d{2}-\d{2}T/.test(endTime)) {
    return new Date(endTime).getTime();
  }

  const match = endTime.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3] || '0', 10);
  const now = new Date();
  const end = new Date(now);

  end.setHours(hours, minutes, seconds, 0);

  // 00:00 表示当天结束时的午夜（次日 0 点）
  if (hours === 0 && minutes === 0) {
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);
  } else if (end.getTime() <= now.getTime()) {
    end.setDate(end.getDate() + 1);
  }

  return end.getTime();
}

function resolveEventUrl(event) {
  if (event.mobileUrl) return event.mobileUrl;
  const match = event.url?.match(/id=(\d+)/);
  if (event.useMobile !== false && match) {
    return `https://m.damai.cn/shows/item.html?itemId=${match[1]}`;
  }
  return event.url;
}

async function findBuyAction(page, useMobile) {
  if (useMobile) {
    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    if (/缺货|已售罄|求加场/.test(bodyText) && !/立即购买|立即预订|选座购买/.test(bodyText)) {
      return { type: 'soldout', bodyText: bodyText.slice(0, 200) };
    }
    const mobileBtn = page.getByText(/立即购买|立即预订|选座购买|马上抢/).first();
    if (await mobileBtn.count()) {
      return { type: 'button', element: mobileBtn };
    }
    return { type: 'none' };
  }

  const buyButton = await page.waitForSelector('.buybtn, .btn-buy, [class*="buy"]', { timeout: 3000 }).catch(() => null);
  if (buyButton) return { type: 'button', element: buyButton };

  const bodyText = await page.evaluate(() => document.body?.innerText || '');
  if (/该渠道不支持/.test(bodyText)) {
    return { type: 'app-only' };
  }
  return { type: 'none' };
}

/**
 * 抢票核心逻辑
 */
async function snipe(page, config) {
  const { event, snipe: snipeConfig } = config;
  const maxRetries = snipeConfig.maxRetries || 50;
  const retryInterval = snipeConfig.retryIntervalMs || 100;
  const endMs = resolveMonitorEndTime(snipeConfig.endTime);
  const useMobile = event.useMobile !== false && Boolean(event.mobileUrl || /detail\.damai\.cn/.test(event.url || ''));
  const targetUrl = resolveEventUrl(event);
  let ticketNotified = false;
  let consecutiveErrors = 0;
  let abnormalNotified = false;

  if (endMs) {
    log(`监控结束时间: ${new Date(endMs).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  }

  await notifyStartup(config, endMs);
  
  log(`正在访问: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (endMs && Date.now() >= endMs) {
        log('已到监控结束时间，停止监控');
        const message = '监控时段结束（至 00:00），未抢到票';
        await notifyMonitorEnd(config, message);
        return { success: false, message, ended: true };
      }

      log(`第 ${attempt}/${maxRetries} 次尝试抢票...`);
      
      if (attempt > 1) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await randomSleep(200, 400);
      }

      const buyAction = await findBuyAction(page, useMobile);

      if (buyAction.type === 'app-only') {
        log('PC 网页不支持购票，已自动切换移动端模式');
        if (!abnormalNotified) {
          await notifyAbnormal(config, '⚠️ 购票渠道异常', 'PC 网页不支持购票，已自动切换移动端模式', attempt);
          abnormalNotified = true;
        }
        event.useMobile = true;
        await page.goto(resolveEventUrl({ ...event, useMobile: true }), { waitUntil: 'domcontentloaded' });
        consecutiveErrors = 0;
        continue;
      }

      if (buyAction.type === 'soldout') {
        log(`当前缺货，继续监控回流票... (${attempt}${endMs ? '' : `/${maxRetries}`})`);
        consecutiveErrors = 0;
        abnormalNotified = false;
        await sleep(Math.max(retryInterval, 500));
        continue;
      }

      const buyButton = buyAction.type === 'button' ? buyAction.element : null;

      if (buyButton && !ticketNotified) {
        ticketNotified = true;
        await notifyTicketAvailable(config, attempt);
      }
      
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
        await buyButton.click({ timeout: 5000 }).catch(async () => {
          await buyButton.click({ force: true });
        });
        await randomSleep(200, 500);
        
        // 检查是否进入订单确认页
        const orderPage = await page.waitForSelector('.order-confirm, .submit-btn, [class*="submit"]', { timeout: 3000 }).catch(() => null);
        
        if (orderPage) {
          log('已进入订单确认页！');
          await sendNotification(
            '🛒 已进入订单确认页',
            '正在选择观演人并提交订单，请尽快在浏览器中确认支付。',
            config,
            {
              kind: 'ticket',
              fields: [
                { label: '演出', value: event.name, short: false },
                { label: '状态', value: '订单确认页已打开' },
              ],
            }
          );
          
          // 选择观演人
          const buyers = config.buyers || (config.buyer ? [config.buyer] : []);
          for (const buyer of buyers) {
            const row = page.locator('[class*="buyer"], [class*="audience"]').filter({ hasText: buyer.name }).first();
            if (await row.count()) {
              await row.click();
              log(`已选择观演人: ${buyer.name}`);
            } else {
              await page.getByText(buyer.name).first().click().catch(() => log(`未找到观演人: ${buyer.name}`));
            }
            await randomSleep(100, 200);
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
      
      consecutiveErrors = 0;
      abnormalNotified = false;
      // 等待重试
      await sleep(retryInterval);
      
    } catch (error) {
      log(`尝试 ${attempt} 失败: ${error.message}`);
      consecutiveErrors += 1;

      const isBrowserDead = /browser has been closed|Target page, context or browser has been closed/i.test(error.message);
      const isLoginIssue = /login|登录|未登录|session/i.test(error.message);

      if (isBrowserDead && !abnormalNotified) {
        await notifyAbnormal(
          config,
          '❌ 浏览器异常',
          `浏览器或页面已关闭：${error.message}\n请检查桌面 Chrome 窗口是否被手动关闭。`,
          attempt
        );
        abnormalNotified = true;
      } else if (isLoginIssue && !abnormalNotified) {
        await notifyAbnormal(
          config,
          '⚠️ 登录状态异常',
          `可能需要重新登录大麦：${error.message}\n请运行 npm run login`,
          attempt
        );
        abnormalNotified = true;
      } else if (consecutiveErrors >= 5 && !abnormalNotified) {
        await notifyAbnormal(
          config,
          '❌ 连续抢票异常',
          `已连续 ${consecutiveErrors} 次失败：${error.message}`,
          attempt
        );
        abnormalNotified = true;
      }

      if (isBrowserDead) {
        return { success: false, message: `浏览器异常退出: ${error.message}` };
      }

      await sleep(retryInterval);
    }
  }
  
  const message = '抢票失败：已达到最大重试次数';
  await notifyMonitorEnd(config, message);
  return { success: false, message };
}

/**
 * 处理验证码
 */
async function handleCaptcha(page, config) {
  // 检测是否有验证码
  const captcha = await page.$('[class*="captcha"], [class*="verify"], .slider');
  
  if (captcha) {
    log('检测到验证码，请手动完成验证...');
    await sendNotification(
      '⚠️ 需要处理验证码',
      '请在浏览器中手动完成验证码验证，完成后脚本将自动继续。',
      config,
      {
        kind: 'warning',
        fields: [
          { label: '演出', value: config?.event?.name || '—', short: false },
          { label: '操作', value: '请切换到 Chrome 窗口完成验证' },
        ],
      }
    );
    
    // 等待用户完成验证码
    await page.waitForSelector('[class*="captcha"]', { state: 'hidden', timeout: 60000 }).catch(() => {});
    log('验证码已完成');
  }
}

function getNotifyConfig(config) {
  return config?.notify || {
    channels: ['feishu', 'console'],
    feishuMode: process.env.FEISHU_APP_ID ? 'app' : 'webhook',
    feishuAppId: process.env.FEISHU_APP_ID,
    feishuAppSecret: process.env.FEISHU_APP_SECRET,
    feishuReceiveId: process.env.FEISHU_RECEIVE_ID,
    feishuReceiveIdType: process.env.FEISHU_RECEIVE_ID_TYPE || 'chat_id',
    feishuWebhook: process.env.FEISHU_WEBHOOK_URL,
  };
}

function formatTicketTypes(event) {
  return (event.ticketTypes || [])
    .sort((a, b) => (a.priority || 99) - (b.priority || 99))
    .map(t => t.name)
    .join(' → ') || '未配置';
}

function formatEndTime(endMs) {
  if (!endMs) return '未设置';
  return new Date(endMs).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

/**
 * 发送通知
 */
async function sendNotification(title, message, config = null, options = {}) {
  await notify(getNotifyConfig(config), title, message, options);
  log(`[通知] ${title}: ${message}`);
}

async function notifyStartup(config, endMs) {
  const { event, ticketCount, buyers } = config;
  await sendNotification(
    '🎫 回流票监控已启动',
    '已开始监控大麦回流票，检测到可购状态将立即推送。',
    config,
    {
      kind: 'startup',
      fields: [
        { label: '演出', value: event.name, short: false },
        { label: '场馆', value: event.venue || '—' },
        { label: '场次', value: event.sessions?.[0]?.name || '—' },
        { label: '票档优先级', value: formatTicketTypes(event), short: false },
        { label: '购票数量', value: `${ticketCount || 1} 张` },
        { label: '观演人', value: `${(buyers || []).length} 人` },
        { label: '监控截止', value: formatEndTime(endMs) },
      ],
    }
  );
}

async function notifyTicketAvailable(config, attempt) {
  const { event } = config;
  await sendNotification(
    '🔥 检测到有票可购',
    '页面出现购买按钮，正在尝试下单，请留意浏览器并完成支付。',
    config,
    {
      kind: 'ticket',
      fields: [
        { label: '演出', value: event.name, short: false },
        { label: '目标票档', value: formatTicketTypes(event), short: false },
        { label: '尝试次数', value: `第 ${attempt} 次` },
        { label: '链接', value: resolveEventUrl(event), short: false },
      ],
    }
  );
}

async function notifyAbnormal(config, title, detail, attempt = null) {
  const fields = [
    { label: '演出', value: config?.event?.name || '—', short: false },
    { label: '详情', value: detail, short: false },
  ];
  if (attempt != null) {
    fields.push({ label: '尝试次数', value: `第 ${attempt} 次` });
  }
  await sendNotification(title, detail, config, { kind: 'error', fields });
}

async function notifyMonitorEnd(config, message) {
  await sendNotification(
    '⏹️ 监控时段结束',
    message,
    config,
    {
      kind: 'end',
      fields: [
        { label: '演出', value: config.event.name, short: false },
        { label: '结果', value: message, short: false },
      ],
    }
  );
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
    
    const useMobile = config.event?.useMobile !== false
      && Boolean(config.event?.mobileUrl || /detail\.damai\.cn/.test(config.event?.url || ''));
    const { browser, page } = await initBrowser({ headless, useMobile });
    
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
      
      // 发送结果通知（监控正常结束已在 snipe 内通知）
      if (result.success) {
        await sendNotification(
          '🎉 抢票成功',
          result.message,
          config,
          {
            kind: 'success',
            fields: [
              { label: '演出', value: config.event.name, short: false },
              { label: '提示', value: '请尽快在浏览器中完成支付！' },
            ],
          }
        );
      } else if (!result.ended) {
        await sendNotification(
          '😢 抢票失败',
          result.message,
          config,
          {
            kind: 'error',
            fields: [
              { label: '演出', value: config.event.name, short: false },
              { label: '原因', value: result.message, short: false },
            ],
          }
        );
      }
      
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
    await sendNotification(
      '❌ 抢票脚本异常',
      error.message,
      config,
      {
        kind: 'error',
        fields: [
          { label: '演出', value: config?.event?.name || '—', short: false },
          { label: '错误', value: error.message, short: false },
        ],
      }
    );
    process.exit(1);
  }
}

main();
