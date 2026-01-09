const EventEmitter = require('events');
const logger = require('../utils/logger');

class TaskQueue extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.queue = [];
    this.processingTasks = [];
    this.completedTasks = [];
    this.failedTasks = [];
  }

  addTask(idea) {
    if (this.queue.length >= this.config.taskQueue.maxSize) {
      logger.warn('任务队列已满，无法添加新任务', { ideaId: idea.id });
      return false;
    }

    // ✅ 新增：检查 ideaKey 是否有 pending/processing 任务（避免重复）
    if (idea.ideaKey) {
      const existing = this.findTaskByIdeaKey(idea.ideaKey);
      if (existing) {
        logger.warn('任务已存在，跳过重复添加', {
          ideaKey: idea.ideaKey,
          existingTaskId: existing.id,
          existingStatus: existing.status
        });
        return false;
      }
    }

    const task = {
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ideaId: idea.id,
      ideaKey: idea.ideaKey,
      revision: idea.revision,
      idea: idea,
      status: 'pending',
      priority: idea.priority,
      createdAt: new Date().toISOString(),
      attempts: 0,
      maxAttempts: 3
    };

    this.queue.push(task);
    this.queue.sort((a, b) => this.getPriorityValue(b.priority) - this.getPriorityValue(a.priority));

    this.emit('taskAdded', task);
    // ✅ 移除重复日志（index.js 的事件监听器已记录）
    return true;
  }

  getPriorityValue(priority) {
    const priorityMap = { high: 3, medium: 2, low: 1 };
    return priorityMap[priority] || 1;
  }

  /**
   * ✅ 新增：查找指定 ideaKey 的 pending 或 processing 任务
   */
  findTaskByIdeaKey(ideaKey) {
    if (!ideaKey) return null;
    return [...this.queue, ...this.processingTasks]
      .find(t => t.ideaKey === ideaKey);
  }

  getNextTask() {
    if (this.queue.length === 0) {
      return null;
    }

    const task = this.queue.shift();
    task.status = 'processing';
    task.startedAt = new Date().toISOString();
    this.processingTasks.push(task);

    this.emit('taskStarted', task);
    // ✅ 移除重复日志（index.js 的事件监听器已记录）
    return task;
  }

  completeTask(taskId, result) {
    const processingIndex = this.processingTasks.findIndex(t => t.id === taskId);
    if (processingIndex === -1) {
      logger.warn('任务未找到', { taskId });
      return false;
    }

    const task = this.processingTasks.splice(processingIndex, 1)[0];
    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    task.result = result;

    this.completedTasks.push(task);
    this.emit('taskCompleted', task);
    logger.info('任务完成', { taskId, duration: this.calculateDuration(task.startedAt, task.completedAt) });
    return true;
  }

  failTask(taskId, error) {
    const processingIndex = this.processingTasks.findIndex(t => t.id === taskId);
    if (processingIndex === -1) {
      logger.warn('任务未找到', { taskId });
      return false;
    }

	    const task = this.processingTasks.splice(processingIndex, 1)[0];
	    task.attempts++;

	    const errText = String(error || '');
	    const isNonRetryable =
	      errText.includes('IFLOW_IDLE_TIMEOUT') ||
	      errText.includes('IFLOW_CONNECT_TIMEOUT') ||
	      errText.includes('IFLOW_SEND_TIMEOUT') ||
	      errText.includes('IFLOW_OVERALL_TIMEOUT');

	    if (isNonRetryable) {
	      task.attempts = task.maxAttempts;
	    }

	    if (task.attempts < task.maxAttempts) {
	      task.status = 'pending';
	      this.queue.push(task);
      this.queue.sort((a, b) => this.getPriorityValue(b.priority) - this.getPriorityValue(a.priority));
      logger.info('任务重试', { taskId, attempt: task.attempts });
    } else {
      task.status = 'failed';
      task.failedAt = new Date().toISOString();
      task.error = error;
      this.failedTasks.push(task);
      this.emit('taskFailed', task);
      logger.error('任务失败', { taskId, error });
    }

    return true;
  }

  calculateDuration(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    return Math.round((end - start) / 1000);
  }

  getStats() {
    return {
      pending: this.queue.length,
      processing: this.processingTasks.length,
      completed: this.completedTasks.length,
      failed: this.failedTasks.length,
      total: this.queue.length + this.processingTasks.length + this.completedTasks.length + this.failedTasks.length
    };
  }

  getQueueDetails() {
    return {
      pending: this.queue.map(t => ({
        id: t.id,
        priority: t.priority,
        ideaKey: t.ideaKey,
        revision: t.revision,
        idea: t.idea,
        status: t.status,
        createdAt: t.createdAt
      })),
      processing: this.processingTasks.map(t => ({
        id: t.id,
        priority: t.priority,
        ideaKey: t.ideaKey,
        revision: t.revision,
        idea: t.idea,
        status: t.status,
        createdAt: t.createdAt,
        startedAt: t.startedAt
      })),
      completed: this.completedTasks.slice(-10).map(t => ({
        id: t.id,
        priority: t.priority,
        ideaKey: t.ideaKey,
        revision: t.revision,
        idea: t.idea,
        app: t.result?.app || null,
        outputFile: t.result?.outputFile || t.result?.output?.outputFile || null,
        status: t.status,
        createdAt: t.createdAt,
        completedAt: t.completedAt
      })),
      failed: this.failedTasks.slice(-10).map(t => ({
        id: t.id,
        priority: t.priority,
        ideaKey: t.ideaKey,
        revision: t.revision,
        idea: t.idea,
        app: t.result?.app || null,
        status: t.status,
        createdAt: t.createdAt,
        error: t.error,
        failedAt: t.failedAt
      }))
    };
  }

  clearCompleted() {
    const count = this.completedTasks.length;
    this.completedTasks = [];
    logger.info(`清除已完成任务`, { count });
    return count;
  }

  clearFailed() {
    const count = this.failedTasks.length;
    this.failedTasks = [];
    logger.info(`清除失败任务`, { count });
    return count;
  }
}

module.exports = TaskQueue;
