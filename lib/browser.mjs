/**
 * 浏览器启动工具
 *
 * Playwright 内置 Chromium 在某些 Linux 版本不可用（如 Ubuntu 26.04），
 * 自动回退到系统已安装的 Google Chrome。
 */

import { chromium } from 'playwright';
import { existsSync } from 'fs';

const LAUNCH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
];

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

function findSystemChrome() {
  return CHROME_CANDIDATES.find(path => existsSync(path));
}

/**
 * 启动 Chromium/Chrome 浏览器，内置 Chromium 不可用时回退系统 Chrome
 */
export async function launchBrowser(options = {}) {
  const { headless = false, args = LAUNCH_ARGS } = options;
  const baseOptions = { headless, args };

  try {
    const browser = await chromium.launch(baseOptions);
    console.log('[浏览器] 使用 Playwright 内置 Chromium');
    return browser;
  } catch (error) {
    const missingExecutable = /Executable doesn't exist|browserType.launch/i.test(error.message);
    if (!missingExecutable) throw error;
  }

  try {
    const browser = await chromium.launch({ ...baseOptions, channel: 'chrome' });
    console.log('[浏览器] 使用系统 Google Chrome (channel: chrome)');
    return browser;
  } catch (error) {
    const chromePath = findSystemChrome();
    if (chromePath) {
      const browser = await chromium.launch({ ...baseOptions, executablePath: chromePath });
      console.log(`[浏览器] 使用系统 Chrome: ${chromePath}`);
      return browser;
    }
    throw new Error(
      '无法启动浏览器。请安装 Google Chrome，或运行: npx playwright install chromium\n' +
      '也可设置环境变量 CHROME_PATH 指向 Chrome 可执行文件。'
    );
  }
}

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 AliApp(DM/11.0.0) Damai/11.0.0';

export function mobileContextOptions() {
  return {
    viewport: { width: 390, height: 844 },
    userAgent: MOBILE_USER_AGENT,
    isMobile: true,
    hasTouch: true,
  };
}

export default { launchBrowser, DEFAULT_USER_AGENT, MOBILE_USER_AGENT, mobileContextOptions };
