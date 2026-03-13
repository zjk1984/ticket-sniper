# Ticket Sniper 🎫

大麦网自动抢票工具 - OpenClaw Skill

## ⚠️ 系统要求

**此工具需要图形界面环境，不支持无界面系统。**

| 要求 | 说明 |
|------|------|
| **图形界面** | 必需（用于登录、验证码处理） |
| **操作系统** | macOS / Windows / Linux (带桌面环境) |
| **Node.js** | 18.0 或更高版本 |
| **浏览器** | Chromium（首次运行时自动安装） |

**无界面系统用户**：请将此工具克隆到本地电脑（Mac/Windows）上运行。

## 功能特性

- ✅ **定时抢票**：精确到秒的定时触发
- ✅ **多次重试**：自动重试，可配置次数和间隔
- ✅ **多平台支持**：macOS / Linux / Windows
- ✅ **结果通知**：支持飞书、系统通知、控制台
- ✅ **验证码处理**：检测并提示用户手动处理
- ✅ **安全设计**：敏感信息不硬编码

## 快速开始

### 1. 克隆并安装依赖

```bash
# 克隆仓库
git clone <repo-url>
cd ticket-sniper

# 安装 Node.js 依赖
npm install

# 安装 Chromium 浏览器（首次运行必须）
npx playwright install chromium
```

**首次安装会自动下载 Chromium 浏览器（约 150MB），请耐心等待。**

### 2. 配置抢票任务

```bash
npm run configure
# 或
node scripts/configure.mjs
```

### 3. 登录大麦网

```bash
npm run login
# 或
node scripts/login.mjs
```

支持的登录方式：
- **手机验证码登录**（推荐）
- 淘宝/支付宝扫码登录
- 账号密码登录

### 4. 开始抢票

```bash
node scripts/snipe.mjs --config ~/.ticket-sniper/configs/你的配置.json
```

### 5. 模拟运行（测试）

```bash
node scripts/snipe.mjs --config ~/.ticket-sniper/configs/你的配置.json --dry-run
```

## 配置说明

配置文件示例见 `examples/config.example.json`

| 字段 | 说明 |
|------|------|
| `event.name` | 演出名称 |
| `event.url` | 大麦网演出页面 URL |
| `event.sessions` | 场次列表，按优先级排序 |
| `event.ticketTypes` | 票档列表，按优先级排序 |
| `buyer` | 观演人信息 |
| `snipe.startTime` | 开票时间 (ISO 8601 格式) |
| `snipe.maxRetries` | 最大重试次数 |
| `snipe.retryIntervalMs` | 重试间隔（毫秒）|
| `notify.channels` | 通知渠道：feishu, console |
| `notify.feishuWebhook` | 飞书机器人 Webhook URL |

## 通知配置

### 飞书通知

1. 创建飞书机器人获取 Webhook URL
2. 设置环境变量：`export FEISHU_WEBHOOK_URL=https://...`
3. 或在配置文件中直接填写

## 依赖说明

### 自动安装的依赖

| 依赖 | 版本 | 说明 |
|------|------|------|
| `playwright` | ^1.40.0 | 浏览器自动化框架 |
| `Chromium` | 最新 | 浏览器引擎（首次运行安装） |

### 手动要求

- **Node.js 18+**：运行前需已安装
- **图形界面**：操作系统需有桌面环境

## 注意事项

1. **提前登录**：建议抢票前 10 分钟完成登录
2. **网络稳定**：确保网络连接稳定
3. **时间同步**：确保系统时间准确
4. **合法使用**：仅供个人正常购票使用

## 文件结构

```
ticket-sniper/
├── SKILL.md           # OpenClaw Skill 说明
├── package.json       # npm 配置
├── scripts/
│   ├── login.mjs      # 登录脚本
│   ├── snipe.mjs      # 抢票主脚本
│   ├── configure.mjs  # 配置向导
│   └── test.mjs       # 环境检查
├── lib/
│   ├── damai.mjs      # 大麦网 API 封装
│   └── notify.mjs     # 通知模块
└── examples/
    └── config.example.json
```

## License

MIT
