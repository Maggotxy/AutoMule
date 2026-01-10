# 🐂 赛博牛马工作站 (Cyber NiuMa Station)

> **24小时不间断自动化开发系统** - 让 AI 成为你的「打工牛马」，自动挖掘需求、生成代码、持续迭代。解放双手，躺着收获代码！

[![GitHub](https://img.shields.io/badge/GitHub-AutoMule-blue?logo=github)](https://github.com/Maggotxy/AutoMule)
[![Powered by iFlow](https://img.shields.io/badge/Powered%20by-iFlow%20CLI-green)](https://www.npmjs.com/package/@iflow-ai/iflow-cli-sdk)

---

## 🎯 项目简介

**赛博牛马工作站** 是一个创新的 AI 驱动自动化开发平台。系统能够：

- 🌐 **全网挖掘需求** - 从 Hacker News、Reddit、V2EX 等平台自动抓取真实痛点
- 🧠 **智能分析生成** - AI 分析需求并自动生成完整应用代码
- 🔄 **持续迭代优化** - 多维度评估应用质量，自动进行迭代改进
- 🐂 **7×24 无人值守** - 牛马们不眠不休，持续为你打工

### 核心特性

| 特性 | 描述 |
|------|------|
| **真实数据源** | 接入 HN、Reddit、V2EX 获取真实需求 |
| **批量并发** | 支持同时生成 1/3/5 个应用 |
| **六维评估** | UI展示、用户效果、使用感受、点击反馈、运行效率、代码质量 |
| **熔断保护** | 连续失败自动暂停，防止资源浪费 |
| **想法持久化** | 所有生成的想法永久保存，重启不丢失 |

---

## 🚀 快速开始

### 环境要求

- Node.js 18+
- npm 或 yarn
- [iFlow CLI](https://www.npmjs.com/package/@iflow-ai/iflow-cli-sdk) 已安装并配置

### 本地运行

```bash
# 克隆项目
git clone https://github.com/Maggotxy/AutoMule.git
cd AutoMule

# 安装依赖
npm install

# 启动服务
npm start

# 访问
open http://localhost:8080
```

### 服务器部署

```bash
# 安装 PM2
npm install -g pm2

# 使用 PM2 启动
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

详细部署指南请参考 `deploy/` 目录。

---

## 📁 项目结构

```
├── src/
│   ├── index.js              # 主入口
│   ├── server.js             # Web 服务器 & API
│   ├── ideaGenerator.js      # 想法生成器（网络抓取 + AI）
│   └── iflowEngine/          # iFlow 核心引擎
│       ├── iflowEngine.js    # 主引擎
│       ├── autoIterator.js   # 牛马自动迭代器
│       └── sessionManager.js # iFlow 会话管理
├── public/
│   ├── index.html            # 主界面
│   ├── idea-details.html     # 想法详情页
│   └── js/app.js             # 前端逻辑
├── deploy/                   # 部署配置
├── config.json               # 系统配置
└── ecosystem.config.js       # PM2 配置
```

---

## ⚙️ 配置说明

编辑 `config.json` 自定义系统行为：

```json
{
  "niuMaStation": {
    "maxConcurrentNiuma": 5,     // 最大并发牛马数
    "iterationIntervalMs": 60000 // 迭代间隔（毫秒）
  },
  "ideaGenerator": {
    "batchSize": 3,             // 批量生成数量
    "maxIdeasPerDay": 10        // 每日最大生成数
  }
}
```

---

## 🙏 致谢

本项目基于 [iFlow CLI](https://www.npmjs.com/package/@iflow-ai/iflow-cli-sdk) 构建，感谢 iFlow 团队提供的强大 AI 编程能力支持。

---

## 👥 作者

- **LambYangHan** - 核心开发
- **wujinb66** - 核心开发

### 联系方式

- 📖 [项目文档](https://sivitacraft.feishu.cn/wiki/CLXKwvRkjiBtXSkvvT2c2WNXnLd)
- 💬 [联系作者](https://sivitacraft.feishu.cn/wiki/CLXKwvRkjiBtXSkvvT2c2WNXnLd)

### 微信交流群

<img src="docs/wechat.jpg" width="200" alt="微信群二维码">

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。

---

<p align="center">
  <b>🐂 让牛马为你打工，解放你的双手！</b><br>
  <sub>Made with ❤️ by LambYangHan & wujinb66</sub>
</p>