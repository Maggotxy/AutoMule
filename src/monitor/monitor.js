const EventEmitter = require('events');
const logger = require('../utils/logger');

class Monitor extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.metrics = {
      startTime: new Date().toISOString(),
      uptime: 0,
      totalIdeas: 0,
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageTaskDuration: 0,
      peakConcurrentTasks: 0,
      systemHealth: 'healthy'
    };
    this.checkInterval = null;
  }

  start() {
    logger.info('监控系统已启动');
    this.checkInterval = setInterval(() => {
      this.checkSystemHealth();
    }, 60000);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      logger.info('监控系统已停止');
    }
  }

  updateMetric(key, value) {
    if (this.metrics.hasOwnProperty(key)) {
      this.metrics[key] = value;
    }
  }

  incrementMetric(key, value = 1) {
    if (this.metrics.hasOwnProperty(key)) {
      this.metrics[key] += value;
    }
  }

  recordTaskDuration(duration) {
    const currentAvg = this.metrics.averageTaskDuration;
    const totalTasks = this.metrics.completedTasks;

    if (totalTasks === 0) {
      this.metrics.averageTaskDuration = duration;
    } else {
      this.metrics.averageTaskDuration = (currentAvg * (totalTasks - 1) + duration) / totalTasks;
    }
  }

  checkSystemHealth() {
    const now = new Date();
    const startTime = new Date(this.metrics.startTime);
    this.metrics.uptime = Math.floor((now - startTime) / 1000);

    const failureRate = this.metrics.totalTasks > 0
      ? (this.metrics.failedTasks / this.metrics.totalTasks) * 100
      : 0;

    if (failureRate > 50) {
      this.metrics.systemHealth = 'critical';
      this.emit('healthAlert', { level: 'critical', failureRate });
      logger.error('系统健康状态: 严重', { failureRate });
    } else if (failureRate > 20) {
      this.metrics.systemHealth = 'warning';
      this.emit('healthAlert', { level: 'warning', failureRate });
      logger.warn('系统健康状态: 警告', { failureRate });
    } else {
      this.metrics.systemHealth = 'healthy';
    }
  }

  getMetrics() {
    return { ...this.metrics };
  }

  getFormattedMetrics() {
    const metrics = this.getMetrics();
    const uptime = this.formatUptime(metrics.uptime);

    return {
      ...metrics,
      uptime,
      formattedAverageTaskDuration: `${Math.round(metrics.averageTaskDuration)}s`,
      failureRate: metrics.totalTasks > 0
        ? `${((metrics.failedTasks / metrics.totalTasks) * 100).toFixed(2)}%`
        : '0%',
      successRate: metrics.totalTasks > 0
        ? `${((metrics.completedTasks / metrics.totalTasks) * 100).toFixed(2)}%`
        : '0%'
    };
  }

  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (days > 0) {
      return `${days}天 ${hours}小时 ${minutes}分钟`;
    } else if (hours > 0) {
      return `${hours}小时 ${minutes}分钟`;
    } else if (minutes > 0) {
      return `${minutes}分钟 ${secs}秒`;
    } else {
      return `${secs}秒`;
    }
  }

  generateReport() {
    const metrics = this.getFormattedMetrics();

    return `
# iFlow Continuous Development System 运行报告

## 系统状态
- 健康状态: ${metrics.systemHealth}
- 运行时间: ${metrics.uptime}
- 启动时间: ${metrics.startTime}

## 想法统计
- 捕获想法总数: ${metrics.totalIdeas}

## 任务统计
- 总任务数: ${metrics.totalTasks}
- 已完成任务: ${metrics.completedTasks}
- 失败任务: ${metrics.failedTasks}
- 成功率: ${metrics.successRate}
- 失败率: ${metrics.failureRate}

## 性能指标
- 平均任务时长: ${metrics.formattedAverageTaskDuration}
- 峰值并发任务: ${metrics.peakConcurrentTasks}

---
*报告生成时间: ${new Date().toISOString()}*
`;
  }

  resetMetrics() {
    this.metrics = {
      startTime: new Date().toISOString(),
      uptime: 0,
      totalIdeas: 0,
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageTaskDuration: 0,
      peakConcurrentTasks: 0,
      systemHealth: 'healthy'
    };
    logger.info('监控指标已重置');
  }
}

module.exports = Monitor;