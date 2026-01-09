/**
 * AutoIterator - 赛博牛马自动迭代器
 * 
 * 每个应用都是一个独立的牛马，24小时不间断自动迭代。
 * 
 * 六维度评估体系：
 * 1. UI展示 - 视觉美观、布局合理、响应式设计、动画流畅
 * 2. 用户效果 - 功能完整、交互直观、结果正确
 * 3. 使用感受 - 操作便捷、学习成本低、反馈及时
 * 4. 点击反馈 - 按钮响应、状态变化、加载提示
 * 5. 运行效率 - 页面加载速度、代码执行效率、资源占用
 * 6. 代码质量 - 结构清晰、可维护性、错误处理
 */

const EventEmitter = require('events');
const logger = require('../utils/logger');

/**
 * 单个牛马的状态（每个应用 = 一个牛马）
 */
class NiuMaState {
    constructor(appId, config = {}) {
        this.appId = appId;
        this.enabled = false;
        this.iterationCount = 0;
        // 无限迭代模式 - 牛马永不停歇
        this.maxIterations = config.maxIterations || Infinity;
        this.iterationIntervalMs = config.iterationIntervalMs || 60000; // 迭代间隔
        this.restAfterIterationMs = config.restAfterIterationMs || 30000; // 完成后休息
        this.focusDimension = null; // 重点关注的维度
        this.enabledDimensions = new Set(['ui', 'userEffect', 'experience', 'feedback', 'efficiency', 'codeQuality']);
        this.lastIterateAt = null;
        this.timer = null;
        this.status = 'idle'; // idle | working | resting | paused
        this.history = []; // 迭代历史
        this.createdAt = new Date();
        this.totalWorkTimeMs = 0; // 累计干活时间
        this.totalWorkTimeMs = 0; // 累计干活时间
        this.lastWorkStartAt = null;
        this.currentTaskId = null; // 当前正在进行的任务ID
    }

    /**
     * 设置重点关注维度
     */
    setFocus(dimension) {
        this.focusDimension = dimension || null;
    }

    /**
     * 启用/禁用某个维度
     */
    toggleDimension(dimension, enabled) {
        if (enabled) {
            this.enabledDimensions.add(dimension);
        } else {
            this.enabledDimensions.delete(dimension);
        }
    }

    /**
     * 记录一次迭代
     */
    recordIteration(result) {
        this.iterationCount++;
        this.lastIterateAt = new Date();

        // 计算本次干活时间
        if (this.lastWorkStartAt) {
            this.totalWorkTimeMs += Date.now() - this.lastWorkStartAt.getTime();
        }

        this.history.push({
            iteration: this.iterationCount,
            timestamp: this.lastIterateAt.toISOString(),
            focus: this.focusDimension,
            dimensions: [...this.enabledDimensions],
            result: result ? { success: result.success, summary: result.summary } : null
        });

        // 只保留最近 50 条记录
        if (this.history.length > 50) {
            this.history = this.history.slice(-50);
        }
    }

    /**
     * 开始干活
     */
    startWork() {
        this.status = 'working';
        this.lastWorkStartAt = new Date();
    }

    /**
     * 开始休息
     */
    startRest() {
        this.status = 'resting';
        if (this.lastWorkStartAt) {
            this.totalWorkTimeMs += Date.now() - this.lastWorkStartAt.getTime();
            this.lastWorkStartAt = null;
        }
    }

    /**
     * 检查是否达到最大迭代次数（无限模式下永远返回 false）
     */
    isMaxReached() {
        return this.maxIterations !== Infinity && this.iterationCount >= this.maxIterations;
    }

    /**
     * 获取状态摘要
     */
    getSummary() {
        return {
            appId: this.appId,
            enabled: this.enabled,
            status: this.status,
            iterationCount: this.iterationCount,
            maxIterations: this.maxIterations === Infinity ? '∞' : this.maxIterations,
            iterationIntervalMs: this.iterationIntervalMs,
            restAfterIterationMs: this.restAfterIterationMs,
            focusDimension: this.focusDimension,
            enabledDimensions: [...this.enabledDimensions],
            lastIterateAt: this.lastIterateAt ? this.lastIterateAt.toISOString() : null,
            createdAt: this.createdAt.toISOString(),
            totalWorkTimeMs: this.totalWorkTimeMs,
            historyCount: this.history.length,
            currentTaskId: this.currentTaskId
        };
    }
}

/**
 * 牛马工作站管理器
 * 
 * 管理所有牛马的生命周期：
 * - 自动启动新创建的牛马
 * - 调度牛马的迭代循环
 * - 提供全局状态查看
 */
class AutoIterator extends EventEmitter {
    constructor(config, iflowEngine) {
        super();
        this.config = config?.autoIterate || {};
        this.niuMaConfig = config?.niuMaStation || {};
        this.iflowEngine = iflowEngine;
        this.dimensions = this.config.dimensions || {};
        this.states = new Map(); // appId -> NiuMaState

        // 工作站配置
        this.autoStartOnCreate = this.niuMaConfig.autoStartOnCreate !== false;
        this.maxConcurrentNiuma = this.niuMaConfig.maxConcurrentNiuma || 5;

        logger.info('🐂 牛马工作站初始化', {
            enabled: this.config.enabled,
            autoStartOnCreate: this.autoStartOnCreate,
            maxConcurrentNiuma: this.maxConcurrentNiuma,
            dimensionCount: Object.keys(this.dimensions).length
        });

        // 监听应用创建事件，自动启动牛马
        if (this.iflowEngine && this.autoStartOnCreate) {
            this.iflowEngine.on('appCreated', (app) => {
                if (app && app.id) {
                    logger.info('🐂 检测到新应用，准备启动牛马', { appId: app.id });
                    // 延迟启动，等待应用初始化完成
                    setTimeout(() => this.start(app.id), 5000);
                }
            });
        }
    }

    /**
     * 获取当前干活中的牛马数量
     */
    getActiveNiumaCount() {
        let count = 0;
        for (const state of this.states.values()) {
            if (state.enabled && (state.status === 'working' || state.status === 'resting')) {
                count++;
            }
        }
        return count;
    }

    /**
     * 获取或创建牛马状态
     */
    getOrCreateState(appId) {
        if (!this.states.has(appId)) {
            this.states.set(appId, new NiuMaState(appId, {
                maxIterations: Infinity, // 无限迭代
                iterationIntervalMs: this.niuMaConfig.iterationIntervalMs || 60000,
                restAfterIterationMs: this.niuMaConfig.restAfterIterationMs || 30000
            }));
        }
        return this.states.get(appId);
    }

    /**
     * 启动牛马（让牛马开始干活）
     */
    async start(appId) {
        const state = this.getOrCreateState(appId);

        if (state.enabled) {
            logger.warn('🐂 牛马已经在干活了', { appId });
            return { success: false, error: '牛马已经在干活了' };
        }

        // 检查并发限制
        const activeCount = this.getActiveNiumaCount();
        if (activeCount >= this.maxConcurrentNiuma) {
            logger.warn('🐂 牛马数量已达上限，等待其他牛马休息', {
                appId,
                activeCount,
                max: this.maxConcurrentNiuma
            });
            return { success: false, error: `牛马数量已达上限 (${this.maxConcurrentNiuma})` };
        }

        state.enabled = true;
        state.status = 'working';

        logger.info('🐂 牛马开始干活！', { appId, iterationCount: state.iterationCount });
        this.emit('niuMaStart', { appId, state: state.getSummary() });

        // 开始迭代循环
        this.scheduleNextIteration(appId);

        return { success: true, state: state.getSummary() };
    }

    /**
     * 暂停牛马（让牛马休息）
     */
    stop(appId) {
        const state = this.states.get(appId);
        if (!state) {
            return { success: false, error: '未找到该牛马' };
        }

        if (state.timer) {
            clearTimeout(state.timer);
            state.timer = null;
        }

        state.enabled = false;
        state.status = 'paused';

        // 如果正在干活，尝试终止当前任务
        if (state.currentTaskId) {
            logger.info('🐂 牛马被强行停止，正在终止当前任务', { appId, taskId: state.currentTaskId });
            try {
                this.iflowEngine.terminateTask(state.currentTaskId);
            } catch (e) {
                logger.warn('终止任务失败', { error: e.message });
            }
            state.currentTaskId = null;
        }

        logger.info('🐂 牛马休息了', { appId, iterationCount: state.iterationCount });
        this.emit('niuMaStop', { appId, state: state.getSummary() });

        return { success: true, state: state.getSummary() };
    }

    /**
     * 设置重点关注维度
     */
    setFocus(appId, dimension) {
        const state = this.getOrCreateState(appId);
        state.setFocus(dimension);

        logger.info('🐂 牛马重点关注维度已更新', { appId, dimension });
        this.emit('focusChange', { appId, dimension, state: state.getSummary() });

        return { success: true, state: state.getSummary() };
    }

    /**
     * 更新启用的维度
     */
    updateDimensions(appId, dimensions) {
        const state = this.getOrCreateState(appId);
        state.enabledDimensions = new Set(dimensions);

        logger.info('🐂 牛马评估维度已更新', { appId, dimensions });
        return { success: true, state: state.getSummary() };
    }

    /**
     * 调度下一次迭代
     */
    scheduleNextIteration(appId) {
        const state = this.states.get(appId);
        if (!state || !state.enabled) return;

        // 无限模式下不检查 maxIterations
        if (state.isMaxReached()) {
            state.status = 'paused';
            state.enabled = false;
            logger.info('🐂 牛马达到最大迭代次数，休息了', { appId, count: state.iterationCount });
            this.emit('niuMaCompleted', { appId, state: state.getSummary() });
            return;
        }

        // 计算下次迭代时间
        const delay = state.iterationCount === 0
            ? 2000 // 首次快速启动
            : state.restAfterIterationMs; // 干完活休息一下

        state.status = state.iterationCount === 0 ? 'working' : 'resting';

        state.timer = setTimeout(async () => {
            await this.runIteration(appId);
        }, delay);
    }

    /**
     * 执行一次迭代（牛马干一次活）
     */
    async runIteration(appId) {
        const state = this.states.get(appId);
        if (!state || !state.enabled) return;

        logger.info('🐂 [牛马迭代] 开始执行', { appId, iteration: state.iterationCount + 1 });

        try {
            state.startWork();
            this.emit('iterationStart', { appId, iteration: state.iterationCount + 1 });

            // 构建六维度评估提示词
            const prompt = this.buildIteratePrompt(appId, state);

            // 获取应用的 ideaKey
            const apps = this.iflowEngine.getAppsList();
            const app = apps.find(a => a.id === appId);

            logger.info('🐂 [牛马迭代] 查找应用', {
                appId,
                found: !!app,
                ideaKey: app?.ideaKey,
                totalApps: apps.length
            });

            if (!app) {
                throw new Error(`牛马找不到应用: ${appId}`);
            }
            if (!app.ideaKey) {
                throw new Error(`应用 ${appId} 没有 ideaKey，无法迭代`);
            }

            // 调用 iFlow 进行迭代
            const idea = {
                content: prompt,
                ideaKey: app.ideaKey,
                revision: state.iterationCount + 1
            };

            const taskId = `niuma_${appId}_${Date.now()}`;
            state.currentTaskId = taskId;

            logger.info('🐂 [牛马迭代] 调用 iFlow', { appId, ideaKey: app.ideaKey, revision: idea.revision, taskId });

            const result = await this.iflowEngine.calliFlow(idea, taskId);
            // 任务完成，清除 ID
            state.currentTaskId = null;

            state.recordIteration({ success: true, summary: '干完一轮活' });
            state.startRest();

            logger.info('🐂 牛马干完一轮活，休息一下', {
                appId,
                iteration: state.iterationCount,
                focus: state.focusDimension
            });

            this.emit('iterationComplete', {
                appId,
                iteration: state.iterationCount,
                state: state.getSummary(),
                result
            });

            // 调度下一轮
            this.scheduleNextIteration(appId);

        } catch (error) {
            state.currentTaskId = null; // 清除 ID
            state.recordIteration({ success: false, summary: error.message });
            state.startRest();

            logger.error('🐂 牛马干活出错了，休息后重试', { appId, error: error.message });
            this.emit('iterationError', { appId, error: error.message, state: state.getSummary() });

            // 失败后也继续尝试（除非已禁用）
            if (state.enabled) {
                this.scheduleNextIteration(appId);
            }
        }
    }

    /**
     * 构建六维度评估提示词
     */
    buildIteratePrompt(appId, state) {
        const enabledDims = [...state.enabledDimensions];
        const focus = state.focusDimension;
        const iteration = state.iterationCount + 1;

        const dimensionDescriptions = enabledDims.map(dim => {
            const d = this.dimensions[dim];
            if (!d) return null;
            const isFocus = focus === dim;
            return `${isFocus ? '【重点】' : ''}${d.name}：${d.description}`;
        }).filter(Boolean);

        const focusNote = focus && this.dimensions[focus]
            ? `\n\n【本轮重点关注】${this.dimensions[focus].name}\n请特别优化「${this.dimensions[focus].name}」相关的问题。`
            : '';

        return `
【赛博牛马自动迭代 - 第 ${iteration} 轮】

你是一个不知疲倦的赛博牛马🐂，24小时不间断工作。

【任务】
审视当前应用，从以下维度选择 1-3 个最值得改进的点进行优化：

${dimensionDescriptions.map((d, i) => `${i + 1}. ${d}`).join('\n')}
${focusNote}

【工作流程】
1. 运行当前应用，发现可改进的点
2. 选择最重要的问题进行修复/优化
3. 验证改进效果
4. 简要总结本轮改进

【输出格式】
- 🔍 发现问题：[简述]
- 🔧 改进措施：[具体做了什么]
- ✅ 改进效果：[效果描述]

牛马永不停歇！🐂💪
`.trim();
    }

    /**
     * 获取牛马状态
     */
    getState(appId) {
        const state = this.states.get(appId);
        return state ? state.getSummary() : null;
    }

    /**
     * 获取所有牛马状态
     */
    getAllStates() {
        const result = {};
        for (const [appId, state] of this.states) {
            result[appId] = state.getSummary();
        }
        return result;
    }

    /**
     * 获取工作站统计
     */
    getStationStats() {
        let totalNiuma = this.states.size;
        let workingCount = 0;
        let restingCount = 0;
        let pausedCount = 0;
        let totalIterations = 0;

        for (const state of this.states.values()) {
            totalIterations += state.iterationCount;
            if (state.status === 'working') workingCount++;
            else if (state.status === 'resting') restingCount++;
            else if (state.status === 'paused') pausedCount++;
        }

        return {
            totalNiuma,
            workingCount,
            restingCount,
            pausedCount,
            totalIterations,
            maxConcurrentNiuma: this.maxConcurrentNiuma
        };
    }

    /**
     * 关闭工作站（所有牛马下班）
     */
    shutdown() {
        for (const [appId, state] of this.states) {
            if (state.timer) {
                clearTimeout(state.timer);
            }
            state.enabled = false;
            state.status = 'paused';
        }
        logger.info('🐂 牛马工作站已关闭，所有牛马下班了');
    }
}

module.exports = { AutoIterator, NiuMaState };
