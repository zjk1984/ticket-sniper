/**
 * 通知模块
 *
 * 支持多种通知渠道：飞书（Webhook / 应用 API）、系统通知、控制台
 */

let feishuTokenCache = null;

/**
 * 获取飞书 tenant_access_token
 */
async function getFeishuTenantToken(appId, appSecret) {
  if (feishuTokenCache && feishuTokenCache.expiresAt > Date.now()) {
    return feishuTokenCache.token;
  }

  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  });

  const data = await response.json();
  if (data.code !== 0 || !data.tenant_access_token) {
    throw new Error(data.msg || '获取 tenant_access_token 失败');
  }

  feishuTokenCache = {
    token: data.tenant_access_token,
    expiresAt: Date.now() + Math.max((data.expire || 7200) - 300, 60) * 1000
  };

  return feishuTokenCache.token;
}

function buildFeishuCard(title, content) {
  return {
    msg_type: 'interactive',
    card: {
      header: {
        title: { tag: 'plain_text', content: title },
        template: title.includes('成功') ? 'green' : (title.includes('失败') ? 'red' : 'blue')
      },
      elements: [
        {
          tag: 'div',
          text: { tag: 'plain_text', content: content }
        },
        {
          tag: 'note',
          elements: [
            { tag: 'plain_text', content: `时间: ${new Date().toLocaleString('zh-CN')}` }
          ]
        }
      ]
    }
  };
}

/**
 * 发送飞书 Webhook 通知
 */
export async function sendFeishu(webhookUrl, title, content) {
  if (!webhookUrl) {
    console.log('[飞书] 未配置 webhook，跳过通知');
    return false;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildFeishuCard(title, content))
    });

    if (response.ok) {
      console.log('[飞书] Webhook 通知发送成功');
      return true;
    }

    console.log(`[飞书] Webhook 通知发送失败: ${response.status}`);
    return false;
  } catch (error) {
    console.log(`[飞书] Webhook 通知发送异常: ${error.message}`);
    return false;
  }
}

/**
 * 通过飞书应用 API 发送通知
 */
export async function sendFeishuApp({ appId, appSecret, receiveId, receiveIdType = 'chat_id' }, title, content) {
  if (!appId || !appSecret || !receiveId) {
    console.log('[飞书] 应用 API 配置不完整（需要 appId、appSecret、receiveId），跳过通知');
    return false;
  }

  try {
    const token = await getFeishuTenantToken(appId, appSecret);
    const params = new URLSearchParams({ receive_id_type: receiveIdType });
    const response = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?${params}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        receive_id: receiveId,
        msg_type: 'interactive',
        content: JSON.stringify(buildFeishuCard(title, content).card)
      })
    });

    const data = await response.json();
    if (data.code === 0) {
      console.log('[飞书] 应用 API 通知发送成功');
      return true;
    }

    console.log(`[飞书] 应用 API 通知发送失败: ${data.msg || response.status}`);
    return false;
  } catch (error) {
    console.log(`[飞书] 应用 API 通知发送异常: ${error.message}`);
    return false;
  }
}

/**
 * 发送系统通知 (macOS/Linux)
 */
export async function sendSystemNotification(title, content) {
  const { platform } = process;

  try {
    if (platform === 'darwin') {
      const { execSync } = await import('child_process');
      execSync(`osascript -e 'display notification "${content}" with title "${title}"'`);
    } else if (platform === 'linux') {
      const { execSync } = await import('child_process');
      execSync(`notify-send "${title}" "${content}"`);
    } else if (platform === 'win32') {
      const { execSync } = await import('child_process');
      execSync(`powershell -command "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; [System.Windows.Forms.MessageBox]::Show('${content}', '${title}')"`);
    }
    return true;
  } catch (error) {
    console.log(`[系统通知] 发送失败: ${error.message}`);
    return false;
  }
}

/**
 * 发送控制台通知
 */
export function sendConsole(title, content) {
  console.log('\n' + '='.repeat(50));
  console.log(`${title}`);
  console.log('-'.repeat(50));
  console.log(content);
  console.log('='.repeat(50) + '\n');
}

function resolveFeishuConfig(config) {
  return {
    mode: config.feishuMode || (config.feishuAppId ? 'app' : 'webhook'),
    webhookUrl: config.feishuWebhook,
    appId: config.feishuAppId,
    appSecret: config.feishuAppSecret,
    receiveId: config.feishuReceiveId,
    receiveIdType: config.feishuReceiveIdType || 'chat_id'
  };
}

/**
 * 统一通知接口
 */
export async function notify(config, title, content) {
  const channels = config.channels || ['console'];
  const results = [];

  if (channels.includes('feishu') || channels.includes('飞书')) {
    const feishu = resolveFeishuConfig(config);
    let result = false;

    if (feishu.mode === 'app') {
      result = await sendFeishuApp(feishu, title, content);
    } else {
      result = await sendFeishu(feishu.webhookUrl, title, content);
    }

    if (!result && feishu.mode === 'app' && feishu.webhookUrl) {
      result = await sendFeishu(feishu.webhookUrl, title, content);
    }

    results.push({ channel: 'feishu', success: result });
  }

  if (channels.includes('system') || channels.includes('系统')) {
    const result = await sendSystemNotification(title, content);
    results.push({ channel: 'system', success: result });
  }

  if (channels.includes('console') || channels.includes('控制台')) {
    sendConsole(title, content);
    results.push({ channel: 'console', success: true });
  }

  return results;
}

export default {
  sendFeishu,
  sendFeishuApp,
  sendSystemNotification,
  sendConsole,
  notify
};
