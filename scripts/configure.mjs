#!/usr/bin/env node
/**
 * Ticket Sniper - 配置向导
 * 
 * 交互式创建抢票配置文件
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { eventFromUrl, extractItemId } from '../lib/damai.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(homedir(), '.ticket-sniper');
const CONFIG_DIR = join(DATA_DIR, 'configs');

if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });

// 创建命令行交互接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt, defaultValue = '') {
  return new Promise(resolve => {
    const displayPrompt = defaultValue 
      ? `${prompt} [默认: ${defaultValue}]: `
      : `${prompt}: `;
    rl.question(displayPrompt, answer => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

function questionMultiple(prompt, options) {
  return new Promise(resolve => {
    console.log(`\n${prompt}`);
    options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt}`));
    rl.question('\n请选择 (输入数字): ', answer => {
      const index = parseInt(answer) - 1;
      if (index >= 0 && index < options.length) {
        resolve(options[index]);
      } else {
        console.log('无效选择，使用默认值');
        resolve(options[0]);
      }
    });
  });
}

async function main() {
  console.log('🎫 Ticket Sniper 配置向导');
  console.log('='.repeat(50));
  
  // 基本信息
  console.log('\n📋 演出信息');
  const eventName = await question('演出名称', '周杰伦南宁演唱会');
  const eventUrl = await question(
    '演出页面 URL (PC 或移动端均可，如: https://m.damai.cn/shows/item.html?itemId=XXXXXX)'
  );
  const itemId = extractItemId(eventUrl);
  if (itemId) {
    console.log(`  → 已识别 itemId: ${itemId}${/m\.damai\.cn/i.test(eventUrl) ? '，将使用移动端 H5 抢票' : ''}`);
  }
  
  // 场次配置
  console.log('\n📅 场次配置');
  const sessionCount = parseInt(await question('场次数量', '1'));
  const sessions = [];
  for (let i = 0; i < sessionCount; i++) {
    console.log(`\n场次 ${i + 1}:`);
    const sessionName = await question(`  场次名称 (如: 2026-04-17 19:00)`);
    const sessionPriority = parseInt(await question(`  优先级 (1最高)`, '1'));
    sessions.push({
      id: `session_${i + 1}`,
      name: sessionName,
      priority: sessionPriority
    });
  }
  
  // 票档配置
  console.log('\n💰 票档配置');
  const ticketCount = parseInt(await question('票档数量', '2'));
  const ticketTypes = [];
  for (let i = 0; i < ticketCount; i++) {
    console.log(`\n票档 ${i + 1}:`);
    const ticketName = await question(`  票档名称 (如: 内场1880元)`);
    const ticketPrice = await question(`  价格 (如: 1880)`);
    const ticketPriority = parseInt(await question(`  优先级 (1最高)`, `${i + 1}`));
    ticketTypes.push({
      id: `price_${i + 1}`,
      name: ticketName,
      price: ticketPrice,
      priority: ticketPriority
    });
  }
  
  // 购票人信息
  console.log('\n👤 观演人信息');
  const buyerName = await question('姓名');
  const buyerIdCard = await question('身份证号');
  const buyerPhone = await question('手机号');
  
  // 抢票策略
  console.log('\n⏰ 抢票策略');
  const startTime = await question('开票时间 (如: 2026-03-12T11:38:00)');
  const maxRetries = parseInt(await question('最大重试次数', '50'));
  const retryInterval = parseInt(await question('重试间隔 (毫秒)', '100'));
  const advanceSeconds = parseInt(await question('提前时间 (秒)', '5'));
  
  // 通知配置
  console.log('\n📢 通知配置');
  const notifyFeishu = await questionMultiple('通知方式', ['飞书', '控制台', '飞书+控制台']);
  let feishuMode = 'webhook';
  let feishuWebhook = '';
  let feishuAppId = '';
  let feishuAppSecret = '';
  let feishuReceiveId = '';
  let feishuReceiveIdType = 'chat_id';

  if (notifyFeishu.includes('飞书')) {
    const feishuMethod = await questionMultiple('飞书通知方式', ['应用 API (App ID)', 'Webhook 机器人']);
    if (feishuMethod.includes('应用 API')) {
      feishuMode = 'app';
      feishuAppId = await question('飞书 App ID (或环境变量 ${FEISHU_APP_ID})', '${FEISHU_APP_ID}');
      feishuAppSecret = await question('飞书 App Secret (或环境变量 ${FEISHU_APP_SECRET})', '${FEISHU_APP_SECRET}');
      feishuReceiveId = await question('接收消息 ID (chat_id/open_id，或 ${FEISHU_RECEIVE_ID})', '${FEISHU_RECEIVE_ID}');
      feishuReceiveIdType = await question('接收 ID 类型 (chat_id/open_id/user_id)', 'chat_id');
    } else {
      feishuWebhook = await question('飞书 Webhook URL (或环境变量 ${FEISHU_WEBHOOK_URL})', '${FEISHU_WEBHOOK_URL}');
    }
  }
  
  // 生成配置
  const config = {
    event: {
      name: eventName,
      ...eventFromUrl(eventUrl),
      sessions,
      ticketTypes,
    },
    buyer: {
      name: buyerName,
      idCard: buyerIdCard,
      phone: buyerPhone
    },
    snipe: {
      startTime: startTime.includes('T') ? startTime : `${startTime}T00:00:00+08:00`,
      maxRetries,
      retryIntervalMs: retryInterval,
      advanceMs: advanceSeconds * 1000
    },
    notify: {
      channels: notifyFeishu.includes('飞书') ? ['feishu', 'console'] : ['console'],
      ...(notifyFeishu.includes('飞书') ? {
        feishuMode,
        ...(feishuMode === 'app' ? {
          feishuAppId,
          feishuAppSecret,
          feishuReceiveId,
          feishuReceiveIdType
        } : {
          feishuWebhook
        })
      } : {})
    }
  };
  
  // 保存配置
  const configName = eventName.replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '');
  const configFile = join(CONFIG_DIR, `${configName}.json`);
  
  writeFileSync(configFile, JSON.stringify(config, null, 2));
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ 配置已保存！');
  console.log(`📁 配置文件: ${configFile}`);
  console.log('\n📝 下一步操作：');
  console.log('  1. 运行登录: node login.mjs');
  console.log(`  2. 开始抢票: node snipe.mjs --config ${configFile}`);
  console.log('  3. 模拟运行: node snipe.mjs --config ' + configFile + ' --dry-run');
  
  rl.close();
}

main().catch(console.error);
