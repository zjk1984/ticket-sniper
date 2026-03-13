---
name: ticket-sniper
description: 大麦网自动抢票工具。支持定时抢票、多次重试、结果通知、验证码处理。Use when user mentions "抢票", "大麦抢票", "damai ticket", "concert ticket"。
metadata:
  clawdbot:
    emoji: 🎫
    requires:
      bins: ["node"]
      env: []
    primaryEnv: ""
---

# ⚠️ 系统要求

**此 Skill 需要图形界面环境，不支持无界面系统（如 headless Linux、Docker 容器、路由器等）。**

| 要求 | 说明 |
|------|------|
| **图形界面** | 必需（用于登录、验证码处理） |
| **操作系统** | macOS / Windows / Linux (带桌面环境) |
| **Node.js** | 18.0+ |
| **浏览器** | Chromium (自动安装) |

## 无界面系统的替代方案

如果你的 OpenClaw 运行在无界面环境（如 NAS、路由器、VPS），可以：

1. **本地电脑运行**：克隆此 skill 到 Mac/Windows 电脑上运行
2. **远程执行**：通过 SSH 转发到有图形界面的机器

# Ticket Sniper - 大麦网抢票 Skill

## 功能特性

- ✅ **定时抢票**：精确到秒的定时触发
- ✅ **多次重试**：抢票失败自动重试，可配置重试次数和间隔
- ✅ **多平台支持**：macOS / Linux / Windows
- ✅ **结果通知**：抢票成功/失败通过多种渠道通知
- ✅ **验证码处理**：支持人工介入处理图形验证码
- ✅ **安全设计**：敏感信息不硬编码，支持环境变量配置

## 安全原则

1. **不存储敏感凭据**：登录 cookie 通过环境变量或安全文件传入
2. **仅用于个人购票**：禁止用于黄牛、倒卖等违法行为
3. **遵守平台规则**：设置合理的请求间隔，避免对平台造成压力
4. **本地运行**：所有敏感操作在本地完成，不发送到第三方服务器

## 使用方式

### 1. 配置抢票任务

```bash
node {baseDir}/scripts/configure.mjs
```

交互式配置：
- 演出名称/URL
- 场次选择
- 票档选择
- 观演人信息
- 抢票时间
- 重试策略

### 2. 预登录

```bash
node {baseDir}/scripts/login.mjs
```

- 打开浏览器进行登录
- 登录成功后保存 session
- 支持扫码登录和账号密码登录

### 3. 启动抢票

```bash
node {baseDir}/scripts/snipe.mjs --config <config-file>
```

选项：
- `--config <file>`: 配置文件路径（必需）
- `--headless`: 无头模式运行（不显示浏览器）
- `--dry-run`: 模拟运行，不实际提交订单

### 4. 查看状态

```bash
node {baseDir}/scripts/status.mjs
```

## 配置文件示例

```json
{
  "event": {
    "name": "周杰伦南宁演唱会",
    "url": "https://detail.damai.cn/item.htm?id=XXXXXX",
    "sessions": [
      { "id": "session_1", "name": "2026-04-17 19:00", "priority": 1 },
      { "id": "session_2", "name": "2026-04-18 19:00", "priority": 2 }
    ],
    "ticketTypes": [
      { "id": "price_1", "name": "内场1880元", "priority": 1 },
      { "id": "price_2", "name": "看台1080元", "priority": 2 }
    ]
  },
  "buyer": {
    "name": "张三",
    "idCard": "450XXXXXXXXXXX",
    "phone": "138XXXXXXXX"
  },
  "snipe": {
    "startTime": "2026-03-12T11:38:00+08:00",
    "maxRetries": 50,
    "retryIntervalMs": 100,
    "advanceMs": 5000
  },
  "notify": {
    "channels": ["feishu", "system"],
    "feishuWebhook": "${FEISHU_WEBHOOK_URL}"
  }
}
```

## 通知方式

抢票结果会通过以下方式通知：

1. **飞书通知**：配置 webhook 后自动推送
2. **系统通知**：macOS/Linux 桌面通知
3. **控制台输出**：实时状态显示

## 验证码处理

遇到图形验证码时：
1. 自动截图保存
2. 发送通知提醒用户
3. 用户在浏览器中手动完成验证
4. 脚本检测验证完成信号后继续

## 注意事项

1. **提前登录**：建议抢票前 10 分钟完成登录
2. **网络稳定**：确保网络连接稳定
3. **时间同步**：确保系统时间准确
4. **合法使用**：仅供个人正常购票使用

## 故障排查

```bash
# 查看日志
cat ~/.ticket-sniper/logs/snipe-YYYYMMDD.log

# 测试配置
node {baseDir}/scripts/snipe.mjs --config config.json --dry-run
```

## 相关文件

- `scripts/login.mjs` - 登录脚本
- `scripts/snipe.mjs` - 抢票主脚本
- `scripts/configure.mjs` - 配置向导
- `scripts/status.mjs` - 状态查询
- `lib/damai.mjs` - 大麦网 API 封装
- `lib/browser.mjs` - 浏览器控制工具
- `lib/notify.mjs` - 通知模块
