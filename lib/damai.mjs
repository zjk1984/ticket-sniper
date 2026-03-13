/**
 * 大麦网 API 封装
 * 
 * 提供大麦网页面元素选择器和常用操作
 */

// 页面选择器配置（根据大麦网页面结构调整）
export const SELECTORS = {
  // 购买按钮
  buyButton: [
    '.buybtn',
    '.btn-buy', 
    '[class*="buy"]',
    '.buy-link',
    '#buybtn'
  ],
  
  // 场次选择
  session: {
    container: '.session', '.perform-order',
    item: '.session-item', '.perform__order__box',
    active: '.selected', '.active'
  },
  
  // 票档选择  
  ticketType: {
    container: '.price', '.ticket-type',
    item: '.price-item', '.ticket__item',
    active: '.selected', '.active'
  },
  
  // 数量
  quantity: {
    input: '.ticket-quantity input', '.cafe-cInput input',
    plus: '.plus', '.cafe-cInput-plus',
    minus: '.minus', '.cafe-cInput-minus'
  },
  
  // 观演人
  viewer: {
    container: '.viewer-list', '.audience-list',
    item: '.viewer-item', '.audience-item',
    checkbox: 'input[type="checkbox"]'
  },
  
  // 订单提交
  order: {
    container: '.order-confirm', '.submit-box',
    submitBtn: '.submit-btn', '.go-to-pay', '[class*="submit"]'
  },
  
  // 验证码
  captcha: {
    container: '.captcha', '.verify', '.slider',
    slider: '.slider-btn', '.slide-block'
  },
  
  // 状态提示
  status: {
    success: '.success', '.order-success', '[class*="success"]',
    error: '.error', '.fail', '[class*="error"]',
    loading: '.loading', '[class*="loading"]'
  }
};

/**
 * 等待元素出现
 */
export async function waitForElement(page, selectors, options = {}) {
  const { timeout = 5000, state = 'visible' } = options;
  
  for (const selector of selectors) {
    try {
      const element = await page.waitForSelector(selector, { timeout, state });
      if (element) return element;
    } catch (e) {
      // 继续尝试下一个选择器
    }
  }
  return null;
}

/**
 * 点击第一个可用的元素
 */
export async function clickFirstAvailable(page, selectors) {
  for (const selector of selectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        const visible = await element.isVisible();
        if (visible) {
          await element.click();
          return true;
        }
      }
    } catch (e) {
      // 继续尝试
    }
  }
  return false;
}

/**
 * 检查是否已登录
 */
export async function checkLogin(page) {
  try {
    // 检查是否有用户头像或用户名
    const userAvatar = await page.$('.user-avatar, .header-user, [class*="user"]');
    return userAvatar !== null;
  } catch {
    return false;
  }
}

/**
 * 获取当前票价信息
 */
export async function getTicketInfo(page) {
  const info = {
    title: '',
    price: '',
    session: '',
    status: ''
  };
  
  try {
    info.title = await page.$eval('.title, .detail-title, h1', el => el.textContent?.trim() || '').catch(() => '');
    info.price = await page.$eval('.price, .ticket-price', el => el.textContent?.trim() || '').catch(() => '');
    info.session = await page.$eval('.session-name, .perform-name', el => el.textContent?.trim() || '').catch(() => '');
    info.status = await page.$eval('.status, .ticket-status', el => el.textContent?.trim() || '').catch(() => '');
  } catch {}
  
  return info;
}

/**
 * 检测验证码
 */
export async function hasCaptcha(page) {
  for (const selector of SELECTORS.captcha.container) {
    const element = await page.$(selector);
    if (element) {
      const visible = await element.isVisible();
      if (visible) return true;
    }
  }
  return false;
}

/**
 * 获取错误信息
 */
export async function getErrorMessage(page) {
  for (const selector of SELECTORS.status.error) {
    try {
      const text = await page.$eval(selector, el => el.textContent?.trim() || '');
      if (text) return text;
    } catch {}
  }
  return '未知错误';
}

/**
 * 检查是否抢票成功
 */
export async function checkSuccess(page) {
  for (const selector of SELECTORS.status.success) {
    try {
      const element = await page.$(selector);
      if (element) {
        const visible = await element.isVisible();
        if (visible) return true;
      }
    } catch {}
  }
  
  // 检查 URL 是否跳转到支付页
  const url = page.url();
  if (url.includes('pay') || url.includes('order')) {
    return true;
  }
  
  return false;
}

export default {
  SELECTORS,
  waitForElement,
  clickFirstAvailable,
  checkLogin,
  getTicketInfo,
  hasCaptcha,
  getErrorMessage,
  checkSuccess
};
