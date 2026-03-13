/**
 * 通知模块
 * 
 * 支持多种通知渠道：飞书、系统通知、控制台
 */

/**
 * 发送飞书通知
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
      body: JSON.stringify({
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
      })
    });
    
    if (response.ok) {
      console.log('[飞书] 通知发送成功');
      return true;
    } else {
      console.log(`[飞书] 通知发送失败: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`[飞书] 通知发送异常: ${error.message}`);
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
      // macOS
      const { execSync } = await import('child_process');
      execSync(`osascript -e 'display notification "${content}" with title "${title}"'`);
    } else if (platform === 'linux') {
      // Linux (需要 notify-send)
      const { execSync } = await import('child_process');
      execSync(`notify-send "${title}" "${content}"`);
    } else if (platform === 'win32') {
      // Windows (需要 PowerShell)
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

/**
 * 统一通知接口
 */
export async function notify(config, title, content) {
  const channels = config.channels || ['console'];
  
  const results = [];
  
  if (channels.includes('feishu') || channels.includes('飞书')) {
    const result = await sendFeishu(config.feishuWebhook, title, content);
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
  sendSystemNotification,
  sendConsole,
  notify
};
