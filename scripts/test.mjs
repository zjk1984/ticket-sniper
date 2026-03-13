#!/usr/bin/env node
/**
 * Ticket Sniper - 测试脚本
 * 
 * 验证环境和配置是否正确
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(homedir(), '.ticket-sniper');
const SESSION_FILE = join(DATA_DIR, 'session.json');

console.log('🎫 Ticket Sniper 环境检查');
console.log('='.repeat(50));

// 检查项目
const checks = [];

// 1. Node.js 版本
const nodeVersion = process.version;
const nodeOk = parseInt(nodeVersion.slice(1)) >= 18;
checks.push({ name: 'Node.js 版本', status: nodeOk, detail: nodeVersion });

// 2. Playwright 安装
try {
  const { chromium } = await import('playwright');
  checks.push({ name: 'Playwright', status: true, detail: '已安装' });
} catch (e) {
  checks.push({ name: 'Playwright', status: false, detail: '未安装，运行: npm install playwright' });
}

// 3. 数据目录
checks.push({ 
  name: '数据目录', 
  status: existsSync(DATA_DIR), 
  detail: existsSync(DATA_DIR) ? DATA_DIR : '未创建' 
});

// 4. 登录状态
checks.push({ 
  name: '登录状态', 
  status: existsSync(SESSION_FILE), 
  detail: existsSync(SESSION_FILE) ? '已登录' : '未登录，运行: node login.mjs' 
});

// 5. 配置文件
const configDir = join(DATA_DIR, 'configs');
if (existsSync(configDir)) {
  const configs = require('fs').readdirSync(configDir).filter(f => f.endsWith('.json'));
  checks.push({ 
    name: '配置文件', 
    status: configs.length > 0, 
    detail: configs.length > 0 ? `${configs.length} 个配置` : '无配置，运行: node configure.mjs' 
  });
} else {
  checks.push({ name: '配置文件', status: false, detail: '无配置，运行: node configure.mjs' });
}

// 输出结果
console.log('\n检查结果：');
checks.forEach(check => {
  const icon = check.status ? '✅' : '❌';
  console.log(`  ${icon} ${check.name}: ${check.detail}`);
});

// 总结
const failed = checks.filter(c => !c.status);
if (failed.length === 0) {
  console.log('\n🎉 所有检查通过！可以开始抢票了。');
} else {
  console.log(`\n⚠️ 有 ${failed.length} 项需要处理：`);
  failed.forEach(check => {
    console.log(`  - ${check.name}: ${check.detail}`);
  });
}

// 检查 Playwright 浏览器
console.log('\n检查 Playwright 浏览器...');
const browserCheck = spawn('npx', ['playwright', 'install', '--dry-run', 'chromium'], {
  shell: true,
  cwd: __dirname
});

browserCheck.stdout.on('data', data => {
  const output = data.toString();
  if (output.includes('complete') || output.includes('already')) {
    console.log('  ✅ Chromium 浏览器已安装');
  }
});

browserCheck.on('close', () => {
  console.log('\n' + '='.repeat(50));
  console.log('提示：如果浏览器未安装，运行: npx playwright install chromium');
});
