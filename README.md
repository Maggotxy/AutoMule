# iFlow Continuous Development System

24小时不间断自动化开发系统 - 持续捕获用户想法/痛点，自动调用 iFlow 进行开发、优化和升级，并提供实时 Web 界面展示。

## 🎉 新功能亮点

### 🌐 Web 前端界面
- **实时仪表板**: 可视化展示系统状态、任务队列和生成的代码
- **交互式控制**: 通过 Web 界面添加想法、查看任务、运行代码预览
- **实时更新**: 基于 WebSocket 的实时数据推送
- **代码预览**: 在浏览器中直接预览和运行生成的代码

### 🎨 可交互预览
- **即时渲染**: 生成的 HTML/CSS/JS 代码可直接在浏览器中预览
- **交互演示**: 提供交互式模板展示代码功能
- **多标签切换**: 演示、代码、文档三视图切换

## 功能特性

### 🎯 想法捕获系统
- **文件监控**: 监控 `ideas/` 目录下的 `.txt` 文件
- **Web 界面输入**: 通过前端界面直接添加想法
- **模拟社区**: 定期生成模拟的社区想法
- **痛点生成**: 随机生成常见的开发痛点

### 📋 任务队列管理
- 智能优先级排序（高/中/低）
- 任务重试机制（最多3次）
- 并发任务控制
- 完整的任务状态跟踪

### 🤖 iFlow 自动化引擎
- 自动调用 iFlow CLI 执行开发任务
- 超时保护和进程管理
- 输出结果保存和格式化

### 💾 代码仓库管理
- 自动保存生成的代码到 `generated-code/` 目录
- Git 版本控制（自动提交）
- 旧文件清理功能

### 📊 监控和日志
- 实时系统健康监控
- 详细的日志记录
- 性能指标统计
- 定期状态报告

### 🌐 Web 前端界面
- **实时仪表板**: 展示系统统计、任务队列、最新代码
- **想法输入**: 通过 Web 界面添加新想法
- **任务管理**: 查看待处理、处理中、已完成、失败的任务
- **代码预览**: 查看和预览生成的代码
- **实时日志**: 查看系统运行日志
- **WebSocket 实时更新**: 自动刷新界面数据

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置系统

编辑 `config.json` 文件，根据需要调整配置：

```json
{
  "system": {
    "checkInterval": 60000,
    "maxConcurrentTasks": 3
  },
  "ideaSources": {
    "fileWatcher": {
      "enabled": true,
      "watchDirectory": "./ideas"
    },
    "simulatedCommunity": {
      "enabled": true,
      "updateInterval": 300000
    },
    "randomPainPoints": {
      "enabled": true,
      "generateInterval": 600000
    }
  }
}
```

### 3. 启动系统

```bash
npm start
```

系统将自动启动并开始：
- 启动 Web 服务器（端口 3000）
- 监控想法来源
- 处理开发任务
- 保存生成的代码
- 监控系统状态

### 4. 访问前端界面

打开浏览器访问：**http://localhost:3000**

## 使用方法

### 通过 Web 界面添加想法

1. 访问 http://localhost:3000
2. 在"添加新想法"区域输入你的想法
3. 选择优先级（低/中/高）
4. 点击"添加想法"按钮

### 查看任务队列

前端界面提供四个标签页：
- **待处理**: 查看等待执行的任务
- **处理中**: 查看正在执行的任务
- **已完成**: 查看已完成的任务
- **失败**: 查看失败的任务

### 预览生成的代码

1. 在"最新生成的代码"区域查看代码预览
2. 点击"查看完整代码"查看完整代码
3. 点击"运行预览"在浏览器中运行代码

### 添加自定义想法（文件方式）

在 `ideas/` 目录下创建 `.txt` 文件，每行一个想法：

```
希望添加用户认证功能
需要优化数据库查询性能
想要一个实时聊天界面
```

系统会自动检测新文件并将其添加到任务队列。

### 查看系统状态

- **前端界面**: 实时显示系统状态、统计指标和日志
- **命令行**: 每5分钟自动显示当前状态
- **日志文件**: `logs/combined.log` 和 `logs/error.log`

## 目录结构

```
iflow/
├── config.json           # 系统配置文件
├── package.json          # 项目依赖
├── src/
│   ├── index.js          # 主控制器
│   ├── server.js         # Web 服务器
│   ├── ideaCapturer/     # 想法捕获模块
│   ├── taskQueue/        # 任务队列管理
│   ├── iflowEngine/      # iFlow 调用引擎
│   ├── codeRepository/   # 代码仓库管理
│   ├── monitor/          # 监控系统
│   └── utils/            # 工具函数
├── public/               # 前端文件
│   ├── index.html        # 主界面
│   ├── js/
│   │   └── app.js        # 前端 JavaScript
│   └── templates/
│       └── interactive-preview.html  # 交互式预览模板
├── ideas/                # 想法文件目录
├── generated-code/       # 生成的代码
├── logs/                 # 日志文件
└── README.md            # 本文档
```

## 配置说明

### 系统配置

- `checkInterval`: 任务检查间隔（毫秒）
- `maxConcurrentTasks`: 最大并发任务数

### 想法来源配置

- `fileWatcher`: 文件监控配置
- `simulatedCommunity`: 模拟社区配置
- `randomPainPoints`: 随机痛点生成配置

### 任务队列配置

- `maxSize`: 队列最大容量
- `priorityLevels`: 优先级级别

### 代码仓库配置

- `outputDirectory`: 输出目录
- `autoCommit`: 是否自动提交到 Git
- `commitMessage`: Git 提交消息前缀

### Web 服务器配置

- 默认端口: 3000
- 可在 `src/index.js` 中修改

## 日志文件

- `logs/combined.log`: 所有日志
- `logs/error.log`: 错误日志
- `logs/report.md`: 运行报告

## API 接口

### GET /api/stats
获取系统统计信息

### GET /api/tasks
获取任务队列详情

### GET /api/tasks/:taskId/code
获取指定任务的代码

### POST /api/ideas
添加新想法

### POST /api/preview
生成代码预览

## WebSocket 事件

### 客户端 → 服务器

无特殊事件，主要通过 HTTP API

### 服务器 → 客户端

- `stats`: 系统统计更新
- `tasks`: 任务队列更新
- `newIdea`: 新想法通知
- `taskUpdate`: 任务状态更新
- `newCode`: 新代码生成通知
- `log`: 日志消息

## 注意事项

1. **iFlow CLI**: 确保系统已正确安装 iFlow CLI 并可在命令行中调用
2. **Git**: 如需使用自动提交功能，请确保已安装 Git 并配置用户信息
3. **资源管理**: 系统会持续运行，请确保有足够的系统资源
4. **任务超时**: 单个任务默认超时时间为 5 分钟
5. **Web 端口**: 默认使用 3000 端口，确保端口未被占用

## 故障排除

### 系统无法启动

- 检查依赖是否正确安装：`npm install`
- 检查配置文件格式是否正确
- 查看日志文件了解详细错误信息
- 确认 3000 端口未被占用

### 前端界面无法访问

- 确认系统已成功启动
- 检查浏览器访问地址：http://localhost:3000
- 查看控制台是否有错误信息
- 检查防火墙设置

### 任务执行失败

- 检查 iFlow CLI 是否正常工作
- 确认系统资源是否充足
- 查看错误日志了解失败原因

### WebSocket 连接失败

- 确认系统已启动
- 检查浏览器控制台错误
- 尝试刷新页面

## 扩展开发

### 添加新的想法来源

在 `src/ideaCapturer/ideaCapturer.js` 中添加新的捕获方法。

### 自定义任务处理逻辑

在 `src/iflowEngine/iflowEngine.js` 中修改 `executeTask` 方法。

### 添加新的监控指标

在 `src/monitor/monitor.js` 中扩展 `metrics` 对象。

### 自定义前端界面

修改 `public/index.html` 和 `public/js/app.js` 文件。

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！

---

**让 iFlow 为你 24/7 不间断地开发！** 🚀

**现在还有漂亮的 Web 界面！** 🌐