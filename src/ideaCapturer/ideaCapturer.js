const EventEmitter = require('events');
const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class IdeaCapturer extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.watchers = [];
    this.intervals = [];
    this.capturedIdeas = [];
    this.lastContentByKey = new Map();
    this.revisionByKey = new Map();
    this.fileWatcherReady = false;
  }

  start() {
    logger.info('启动想法捕获系统');

    if (this.config.ideaSources.fileWatcher.enabled) {
      this.startFileWatcher();
    }

    if (this.config.ideaSources.simulatedCommunity.enabled) {
      this.startSimulatedCommunity();
    }

    if (this.config.ideaSources.randomPainPoints.enabled) {
      this.startRandomPainPoints();
    }
  }

  startFileWatcher() {
    const watchDir = this.config.ideaSources.fileWatcher.watchDirectory;
    const filePattern = this.config.ideaSources.fileWatcher.filePattern;

    if (!fs.existsSync(watchDir)) {
      fs.mkdirSync(watchDir, { recursive: true });
      logger.info(`创建想法监控目录: ${watchDir}`);
    }

    const watcher = chokidar.watch(path.join(watchDir, filePattern), {
      ignored: /(^|[\/\\])\../,
      persistent: true
    });

    this.fileWatcherReady = false;
    watcher.on('ready', () => {
      this.fileWatcherReady = true;
      logger.info('文件监控初始扫描完成，将仅处理新建/变更的想法文件');
    });

    watcher.on('add', (filePath) => {
      // 避免系统重启时把已有 ideas/*.txt 当作新想法重放
      if (!this.fileWatcherReady) {
        this.cacheFileContent(filePath);
        return;
      }
      this.handleNewFile(filePath);
    });

    watcher.on('change', (filePath) => {
      this.handleNewFile(filePath);
    });

    this.watchers.push(watcher);
    logger.info(`文件监控已启动，监控目录: ${watchDir}`);
  }

  cacheFileContent(filePath) {
    try {
      const rawContent = fs.readFileSync(filePath, 'utf-8');
      const normalizedContent = (rawContent || '').replace(/\r\n/g, '\n').trim();
      if (!normalizedContent) return;

      const ideaKey = path.resolve(filePath);
      this.lastContentByKey.set(ideaKey, normalizedContent);
    } catch (error) {
      // ✅ 改进：记录警告日志
      logger.warn('缓存文件内容失败（非致命）', {
        filePath,
        error: error.message
      });
    }
  }

  handleNewFile(filePath) {
    try {
      const rawContent = fs.readFileSync(filePath, 'utf-8');
      const normalizedContent = (rawContent || '').replace(/\r\n/g, '\n').trim();
      if (!normalizedContent) {
        return;
      }

      const ideaKey = path.resolve(filePath);
      const previousContent = this.lastContentByKey.get(ideaKey);
      if (previousContent === normalizedContent) {
        return;
      }
      this.lastContentByKey.set(ideaKey, normalizedContent);

      // 若文件是“追加式记录”（同一个 ideaKey 反复 append），只取本次新增的尾部内容作为增量想法
      // 这样：ideas/*.txt 可以保留完整历史，而每次迭代仍是小步输入，避免 prompt 越来越大。
      let contentForIdea = normalizedContent;
      if (previousContent && normalizedContent.startsWith(previousContent)) {
        const delta = normalizedContent.slice(previousContent.length).replace(/^\n+/, '').trim();
        if (!delta) return;
        contentForIdea = delta;
      }

      const revision = (this.revisionByKey.get(ideaKey) || 0) + 1;
      this.revisionByKey.set(ideaKey, revision);

      const idea = {
        id: `${Date.now()}_${revision}`,
        source: 'file',
        sourcePath: filePath,
        ideaKey,
        revision,
        content: contentForIdea,
        timestamp: new Date().toISOString(),
        priority: this.determinePriority(contentForIdea)
      };

      this.emit('idea', idea);
      this.capturedIdeas.push(idea);
      logger.info(`捕获到新想法 (文件): ${filePath}`, { ideaId: idea.id });
    } catch (error) {
      logger.error(`读取想法文件失败: ${filePath}`, { error: error.message });
    }
  }

  determinePriority(content) {
    const urgentKeywords = ['紧急', 'bug', '错误', '崩溃', 'critical', 'urgent'];
    const highKeywords = ['重要', '优化', '性能', '安全', 'important', 'optimize'];

    const lowerContent = content.toLowerCase();

    if (urgentKeywords.some(keyword => lowerContent.includes(keyword))) {
      return 'high';
    } else if (highKeywords.some(keyword => lowerContent.includes(keyword))) {
      return 'medium';
    }
    return 'low';
  }

  startSimulatedCommunity() {
    const interval = this.config.ideaSources.simulatedCommunity.updateInterval;

    const simulatedIdeas = [
      "希望能有一个自动化的代码格式化工具",
      "现在的登录流程太复杂了，需要简化",
      "想要一个实时的数据可视化仪表板",
      "需要改进移动端的响应速度",
      "希望能添加暗黑模式支持",
      "搜索功能不够智能，需要优化",
      "想要批量导入导出数据的功能",
      "需要更好的错误提示和日志系统",
      "希望能支持多语言国际化",
      "想要一个自动化的测试覆盖率报告"
    ];

    const intervalId = setInterval(() => {
      const randomIdea = simulatedIdeas[Math.floor(Math.random() * simulatedIdeas.length)];
      const idea = {
        id: Date.now().toString(),
        source: 'community',
        content: randomIdea,
        timestamp: new Date().toISOString(),
        priority: 'medium'
      };

      this.emit('idea', idea);
      this.capturedIdeas.push(idea);
      logger.info(`捕获到新想法 (模拟社区)`, { ideaId: idea.id });
    }, interval);

    this.intervals.push(intervalId);
    logger.info(`模拟社区监控已启动，更新间隔: ${interval}ms`);
  }

  startRandomPainPoints() {
    const interval = this.config.ideaSources.randomPainPoints.generateInterval;

    const painPoints = [
      "数据库查询性能瓶颈",
      "内存占用过高",
      "用户界面响应慢",
      "代码重复率高",
      "缺乏单元测试",
      "文档不完善",
      "API 接口不稳定",
      "配置管理混乱",
      "日志记录不清晰",
      "依赖管理困难"
    ];

    const intervalId = setInterval(() => {
      const randomPainPoint = painPoints[Math.floor(Math.random() * painPoints.length)];
      const idea = {
        id: Date.now().toString(),
        source: 'painpoint',
        content: `解决${randomPainPoint}的问题`,
        timestamp: new Date().toISOString(),
        priority: 'low'
      };

      this.emit('idea', idea);
      this.capturedIdeas.push(idea);
      logger.info(`捕获到新想法 (痛点)`, { ideaId: idea.id });
    }, interval);

    this.intervals.push(intervalId);
    logger.info(`随机痛点生成已启动，生成间隔: ${interval}ms`);
  }

  stop() {
    logger.info('停止想法捕获系统');

    this.watchers.forEach(watcher => watcher.close());
    this.intervals.forEach(interval => clearInterval(interval));

    this.watchers = [];
    this.intervals = [];
  }

  getStats() {
    return {
      totalIdeas: this.capturedIdeas.length,
      bySource: this.capturedIdeas.reduce((acc, idea) => {
        acc[idea.source] = (acc[idea.source] || 0) + 1;
        return acc;
      }, {}),
      byPriority: this.capturedIdeas.reduce((acc, idea) => {
        acc[idea.priority] = (acc[idea.priority] || 0) + 1;
        return acc;
      }, {})
    };
  }
}

module.exports = IdeaCapturer;
