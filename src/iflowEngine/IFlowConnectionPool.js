const EventEmitter = require('events');
const logger = require('../utils/logger');

/**
 * iFlow 连接池管理器
 *
 * 功能：
 * 1. 维护单例 IFlowClient 连接
 * 2. 自动健康检查和重连
 * 3. 防止频繁 connect/disconnect 导致的连接失败
 * 4. 支持多任务复用同一连接
 */
class IFlowConnectionPool extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.sdk = null;
    this.isConnecting = false;
    this.isConnected = false;
    this.lastActivityAt = null;
    this.healthCheckInterval = null;
    this.activeTaskCount = 0;
    this.connectionConfig = null;
  }

  /**
   * 加载 iFlow SDK
   */
  async loadSdk() {
    if (this.sdk) return this.sdk;

    try {
      this.sdk = require('@iflow-ai/iflow-cli-sdk');
      return this.sdk;
    } catch (error) {
      const err = new Error(
        '无法加载 @iflow-ai/iflow-cli-sdk，请先在项目根目录运行 npm install 再启用 iflow.enabled'
      );
      err.cause = error;
      throw err;
    }
  }

  /**
   * 获取或创建连接
   * @param {Object} config - 连接配置
   * @returns {Promise<IFlowClient>}
   */
  async getConnection(config) {
    // 如果已有健康连接，直接返回
    if (this.isConnected && this.client && this.isConnectionHealthy()) {
      logger.info('复用现有 iFlow 连接');
      this.lastActivityAt = Date.now();
      return this.client;
    }

    // 如果正在连接，等待完成
    if (this.isConnecting) {
      logger.info('等待现有连接建立...');
      await this.waitForConnection(config?.timeout);
      return this.client;
    }

    // 创建新连接
    return this.createConnection(config);
  }

  /**
   * 创建新连接
   */
  async createConnection(config) {
    this.isConnecting = true;
    this.connectionConfig = config;

    try {
      // 先断开旧连接（如果存在）
      if (this.client) {
        logger.info('断开旧的 iFlow 连接');
        await this.disconnect(false);
      }

      const sdk = await this.loadSdk();
      const { IFlowClient } = sdk;

      logger.info('创建新的 iFlow 连接', { url: config.url });
      this.client = new IFlowClient(config);

      // SDK 的 timeout 选项已经控制了连接和所有操作的超时
      // 直接调用 connect()，让 SDK 自己的超时机制生效
      await this.client.connect();

      this.isConnected = true;
      this.lastActivityAt = Date.now();

      logger.info('iFlow 连接建立成功');
      this.emit('connected');

      // 启动健康检查
      this.startHealthCheck();

      return this.client;
    } catch (error) {
      this.isConnected = false;
      this.client = null;
      logger.error('创建 iFlow 连接失败', { error: error.message });
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * 等待连接建立
   */
  async waitForConnection(timeoutMs) {
    // 使用配置的 timeout（SDK 唯一支持的超时选项），默认10分钟
    const timeout = timeoutMs || this.connectionConfig?.timeout || 600000;
    const startTime = Date.now();
    while (this.isConnecting) {
      if (Date.now() - startTime > timeout) {
        throw new Error(`等待连接超时: ${timeout}ms`);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!this.isConnected || !this.client) {
      throw new Error('连接建立失败');
    }
  }

  /**
   * 检查连接是否健康
   */
  isConnectionHealthy() {
    if (!this.client || !this.isConnected) {
      return false;
    }

    // 使用独立的闲置超时判断（15 分钟），与 SDK 的 timeout 选项无关
    // SDK 的 timeout 用于操作超时，闲置超时是连接池管理策略
    const configuredIdleTimeoutMs = 900000; // 15分钟闲置判定
    const idleTime = Date.now() - (this.lastActivityAt || 0);

    if (idleTime > configuredIdleTimeoutMs) {
      logger.warn('iFlow 连接闲置时间过长，可能不健康', {
        idleSeconds: Math.round(idleTime / 1000),
        configuredIdleMinutes: Math.round(configuredIdleTimeoutMs / 60000)
      });
      return false;
    }

    return true;
  }

  /**
   * 启动健康检查
   */
  startHealthCheck() {
    // 清除旧的检查
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // 每 2 分钟检查一次
    this.healthCheckInterval = setInterval(() => {
      if (!this.isConnectionHealthy()) {
        logger.warn('iFlow 连接健康检查失败，将在下次使用时重建');
        this.isConnected = false;
      }
    }, 2 * 60 * 1000);
  }

  /**
   * 停止健康检查
   */
  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * 任务开始
   */
  taskStart() {
    this.activeTaskCount++;
    this.lastActivityAt = Date.now();
    logger.debug('任务开始使用连接', { activeTaskCount: this.activeTaskCount });
  }

  /**
   * 任务结束
   */
  taskEnd() {
    this.activeTaskCount = Math.max(0, this.activeTaskCount - 1);
    this.lastActivityAt = Date.now();
    logger.debug('任务结束使用连接', { activeTaskCount: this.activeTaskCount });
  }

  /**
   * 断开连接
   * @param {boolean} force - 是否强制断开（忽略活跃任务计数）
   */
  async disconnect(force = false) {
    if (!force && this.activeTaskCount > 0) {
      logger.warn('仍有活跃任务，跳过断开连接', {
        activeTaskCount: this.activeTaskCount
      });
      return;
    }

    this.stopHealthCheck();

    if (this.client) {
      try {
        logger.info('断开 iFlow 连接');
        await this.client.disconnect();
      } catch (error) {
        logger.warn('断开连接时出错（已忽略）', { error: error.message });
      }
    }

    this.client = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.lastActivityAt = null;
    this.activeTaskCount = 0;

    this.emit('disconnected');
  }

  /**
   * 重置连接（强制重建）
   */
  async reset() {
    logger.info('重置 iFlow 连接池');
    await this.disconnect(true);

    if (this.connectionConfig) {
      return this.createConnection(this.connectionConfig);
    }
  }

  /**
   * 超时包装器
   */
  withTimeout(promise, ms, code) {
    const timeoutMs = typeof ms === 'number' && ms > 0 ? ms : null;
    if (!timeoutMs) return promise;

    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error(code || 'IFLOW_TIMEOUT');
        err.code = code || 'IFLOW_TIMEOUT';
        reject(err);
      }, timeoutMs);
    });

    return Promise.race([promise, timeout]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  /**
   * 获取连接池状态
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      activeTaskCount: this.activeTaskCount,
      lastActivityAt: this.lastActivityAt,
      idleSeconds: this.lastActivityAt
        ? Math.round((Date.now() - this.lastActivityAt) / 1000)
        : null,
      isHealthy: this.isConnectionHealthy()
    };
  }
}

// 单例模式
let instance = null;

module.exports = {
  /**
   * 获取连接池单例
   */
  getConnectionPool() {
    if (!instance) {
      instance = new IFlowConnectionPool();
    }
    return instance;
  },

  /**
   * 重置连接池（用于测试）
   */
  resetConnectionPool() {
    if (instance) {
      instance.disconnect(true).catch(() => {});
      instance = null;
    }
  }
};
