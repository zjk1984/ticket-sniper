#!/usr/bin/env node
/**
 * 飞书通知连接测试
 *
 * 用法:
 *   node scripts/test-feishu.mjs
 *   node scripts/test-feishu.mjs --send
 */

import loadEnvFile from '../lib/load-env.mjs';
import { sendFeishuApp } from '../lib/notify.mjs';

loadEnvFile();

const appId = process.env.FEISHU_APP_ID;
const appSecret = process.env.FEISHU_APP_SECRET;
const receiveId = process.env.FEISHU_RECEIVE_ID;
const receiveIdType = process.env.FEISHU_RECEIVE_ID_TYPE || 'chat_id';
const shouldSend = process.argv.includes('--send');

async function main() {
  console.log('🐦 飞书通知测试\n');

  if (!appId || !appSecret) {
    console.error('❌ 缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET');
    console.error('   请复制 .env.example 为 .env 并填写凭证');
    process.exit(1);
  }

  console.log(`App ID: ${appId}`);

  const tokenRes = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  });
  const tokenData = await tokenRes.json();

  if (tokenData.code !== 0) {
    console.error(`❌ 获取 token 失败: ${tokenData.msg}`);
    process.exit(1);
  }

  console.log('✅ App 凭证有效，tenant_access_token 获取成功');

  const chatsRes = await fetch('https://open.feishu.cn/open-apis/im/v1/chats?page_size=20', {
    headers: { Authorization: `Bearer ${tokenData.tenant_access_token}` }
  });
  const chatsData = await chatsRes.json();

  if (chatsData.code === 0) {
    const chats = chatsData.data?.items || [];
    if (chats.length === 0) {
      console.log('\n⚠️  机器人尚未加入任何群聊');
      console.log('   请在飞书中创建/打开群聊 → 添加机器人 → 再运行本脚本获取 chat_id');
    } else {
      console.log('\n📋 机器人所在群聊:');
      for (const chat of chats) {
        console.log(`   - ${chat.name}: ${chat.chat_id}`);
      }
    }
  }

  if (!receiveId) {
    console.log('\n⚠️  未设置 FEISHU_RECEIVE_ID，跳过发送测试');
    console.log('   将上方 chat_id 填入 .env 后运行: node scripts/test-feishu.mjs --send');
    return;
  }

  if (!shouldSend) {
    console.log(`\nReceive ID: ${receiveId} (${receiveIdType})`);
    console.log('运行 node scripts/test-feishu.mjs --send 发送测试消息');
    return;
  }

  const ok = await sendFeishuApp(
    { appId, appSecret, receiveId, receiveIdType },
    '🎫 Ticket Sniper 测试',
    '飞书通知配置成功！抢票结果将推送到此群。'
  );

  console.log(ok ? '\n✅ 测试消息已发送' : '\n❌ 测试消息发送失败');
  process.exit(ok ? 0 : 1);
}

main().catch(error => {
  console.error(`❌ 测试异常: ${error.message}`);
  process.exit(1);
});
