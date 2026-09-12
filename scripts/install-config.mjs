#!/usr/bin/env node
/**
 * 将 examples/ 下的配置安装到 ~/.ticket-sniper/configs/
 *
 * 用法: node scripts/install-config.mjs [配置名]
 * 示例: node scripts/install-config.mjs 梁静茹深圳演唱会
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const EXAMPLES_DIR = join(ROOT, 'examples');
const CONFIG_DIR = join(homedir(), '.ticket-sniper', 'configs');

const arg = process.argv[2];

function listExamples() {
  return readdirSync(EXAMPLES_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'config.example.json')
    .map((f) => basename(f, '.json'));
}

function main() {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });

  if (!arg) {
    console.log('🎫 可安装的配置：');
    listExamples().forEach((name) => console.log(`  - ${name}`));
    console.log('\n用法: node scripts/install-config.mjs <配置名>');
    console.log('示例: node scripts/install-config.mjs 梁静茹深圳演唱会');
    process.exit(0);
  }

  const sourceName = arg.endsWith('.json') ? arg : `${arg}.json`;
  const sourcePath = join(EXAMPLES_DIR, sourceName);

  if (!existsSync(sourcePath)) {
    console.error(`❌ 未找到配置: ${sourcePath}`);
    console.error('可用配置:', listExamples().join(', '));
    process.exit(1);
  }

  const destPath = join(CONFIG_DIR, sourceName);
  copyFileSync(sourcePath, destPath);

  console.log('✅ 配置已安装');
  console.log(`   源: ${sourcePath}`);
  console.log(`   目标: ${destPath}`);
  console.log('\n下一步:');
  console.log(`  1. 编辑观演人信息: ${destPath}`);
  console.log('  2. npm run login');
  console.log(`  3. node scripts/snipe.mjs --config ${destPath}`);
}

main();
