/**
 * IdeaGenerator - 想法自动生成器
 * 
 * 持续生成新想法，自动创建新的赛博牛马。
 * 
 * 想法来源：
 * 1. AI 自动生成 - 让 AI 思考有价值的应用想法
 * 2. 外部采集 - 从网络获取灵感
 * 3. 随机痛点 - 基于预设主题生成
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

/**
 * 预设的应用主题和想法模板
 */
const IDEA_TEMPLATES = {
    tools: [
        '创建一个在线文本对比工具，支持高亮显示差异',
        '创建一个 JSON 格式化和校验工具，带语法高亮',
        '创建一个正则表达式测试工具，实时匹配和解释',
        '创建一个 Base64 编解码工具',
        '创建一个颜色选择器和调色板工具',
        '创建一个 Markdown 实时预览编辑器',
        '创建一个二维码生成器',
        '创建一个图片压缩工具',
        '创建一个密码生成器',
        '创建一个时区转换工具'
    ],
    games: [
        '创建一个2048小游戏，带动画效果',
        '创建一个扫雷游戏',
        '创建一个贪吃蛇游戏',
        '创建一个打字练习游戏',
        '创建一个记忆翻牌游戏',
        '创建一个井字棋游戏，支持 AI 对战',
        '创建一个俄罗斯方块游戏',
        '创建一个弹球游戏',
        '创建一个猜数字游戏',
        '创建一个成语接龙游戏'
    ],
    visualization: [
        '创建一个随机艺术生成器',
        '创建一个粒子动画效果展示',
        '创建一个音乐可视化器',
        '创建一个数据图表生成器',
        '创建一个流程图绘制工具',
        '创建一个 CSS 动画演示页面',
        '创建一个 3D 旋转立方体展示',
        '创建一个星空动画背景生成器',
        '创建一个波浪动画效果页面',
        '创建一个渐变色调色板生成器'
    ],
    productivity: [
        '创建一个番茄钟倒计时器',
        '创建一个待办事项清单应用',
        '创建一个便签笔记应用',
        '创建一个习惯打卡追踪器',
        '创建一个倒计时日历',
        '创建一个每日名言展示页',
        '创建一个白噪音播放器',
        '创建一个屏幕休息提醒工具',
        '创建一个快速笔记本',
        '创建一个时间追踪器'
    ],
    fun: [
        '创建一个随机头像生成器',
        '创建一个今天吃什么决策器',
        '创建一个随机名字生成器',
        '创建一个表情包生成器',
        '创建一个抽奖转盘',
        '创建一个运势测试页面',
        '创建一个每日一问答题页',
        '创建一个随机电影推荐器',
        '创建一个座右铭生成器',
        '创建一个摇骰子工具'
    ]
};

/**
 * 想法生成器
 */
class IdeaGenerator extends EventEmitter {
    constructor(config, iflowEngine) {
        super();
        this.config = config?.ideaGenerator || {};
        this.iflowEngine = iflowEngine;
        this.enabled = false;
        this.timer = null;
        this.generatedCount = 0;
        this.maxIdeasPerDay = this.config.maxIdeasPerDay || 10;
        this.intervalMs = this.config.intervalMs || 300000; // 默认 5 分钟
        this.ideasDir = path.join(__dirname, '../ideas');
        this.usedIdeas = new Set(); // 避免重复
        this.todayCount = 0;
        this.lastResetDate = new Date().toDateString();

        logger.info('🤖 想法生成器初始化', {
            enabled: this.config.enabled,
            intervalMs: this.intervalMs,
            maxIdeasPerDay: this.maxIdeasPerDay
        });
    }

    /**
     * 启动想法生成器
     */
    start() {
        if (this.enabled) {
            return { success: false, error: '想法生成器已在运行' };
        }

        this.enabled = true;
        logger.info('🤖 想法生成器启动');
        this.emit('start');

        // 首次延迟启动
        this.scheduleNextGeneration(10000);

        return { success: true };
    }

    /**
     * 停止想法生成器
     */
    stop() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.enabled = false;
        logger.info('🤖 想法生成器停止');
        this.emit('stop');

        return { success: true, generatedCount: this.generatedCount };
    }

    /**
     * 调度下一次生成
     */
    scheduleNextGeneration(delayMs) {
        if (!this.enabled) return;

        this.timer = setTimeout(async () => {
            await this.generateAndSpawn();
        }, delayMs || this.intervalMs);
    }

    /**
     * 检查是否需要重置每日计数
     */
    checkDailyReset() {
        const today = new Date().toDateString();
        if (today !== this.lastResetDate) {
            this.todayCount = 0;
            this.lastResetDate = today;
            logger.info('🤖 新的一天开始，重置想法计数');
        }
    }

    /**
     * 生成新想法并创建牛马
     */
    async generateAndSpawn() {
        if (!this.enabled) return;

        this.checkDailyReset();

        // 检查每日限制
        if (this.todayCount >= this.maxIdeasPerDay) {
            logger.info('🤖 今日想法配额已用完，明天继续', { count: this.todayCount });
            this.scheduleNextGeneration();
            return;
        }

        // 检查牛马数量限制
        if (this.iflowEngine && this.iflowEngine.autoIterator) {
            const stats = this.iflowEngine.autoIterator.getStationStats();
            if (stats.totalNiuma >= stats.maxConcurrentNiuma + 2) {
                logger.info('🤖 牛马数量较多，暂缓生成新想法', { totalNiuma: stats.totalNiuma });
                this.scheduleNextGeneration();
                return;
            }
        }

        try {
            // 生成想法
            const idea = await this.generateIdea();

            if (idea) {
                // 写入 ideas 目录，触发牛马创建
                await this.spawnNiuMa(idea);
                this.todayCount++;
                this.generatedCount++;

                logger.info('🤖 生成新想法并创建牛马', {
                    idea: idea.substring(0, 50) + '...',
                    todayCount: this.todayCount
                });

                this.emit('ideaGenerated', { idea, todayCount: this.todayCount, total: this.generatedCount });
            }
        } catch (error) {
            logger.error('🤖 生成想法失败', { error: error.message });
            this.emit('error', { error: error.message });
        }

        // 调度下一次
        this.scheduleNextGeneration();
    }

    /**
     * 生成想法（从模板中随机选择）
     */
    async generateIdea() {
        // 获取所有主题
        const topics = Object.keys(IDEA_TEMPLATES);

        // 随机选择主题
        const topic = topics[Math.floor(Math.random() * topics.length)];
        const ideas = IDEA_TEMPLATES[topic];

        // 过滤掉已使用的想法
        const available = ideas.filter(i => !this.usedIdeas.has(i));

        if (available.length === 0) {
            // 所有想法都用过了，清空重来
            this.usedIdeas.clear();
            return ideas[Math.floor(Math.random() * ideas.length)];
        }

        const idea = available[Math.floor(Math.random() * available.length)];
        this.usedIdeas.add(idea);

        return idea;
    }

    /**
     * 创建新牛马（写入 ideas 目录）
     */
    async spawnNiuMa(ideaContent) {
        // 确保目录存在
        if (!fs.existsSync(this.ideasDir)) {
            fs.mkdirSync(this.ideasDir, { recursive: true });
        }

        // 生成文件名
        const timestamp = Date.now();
        const fileName = `auto_${timestamp}.txt`;
        const filePath = path.join(this.ideasDir, fileName);

        // 写入文件
        const content = `${ideaContent}

【自动生成】
此想法由赛博牛马工作站自动生成
生成时间：${new Date().toLocaleString('zh-CN')}
`;

        fs.writeFileSync(filePath, content, 'utf-8');

        logger.info('🤖 创建想法文件', { fileName, filePath });

        return { fileName, filePath };
    }

    /**
     * 获取生成器状态
     */
    getStatus() {
        this.checkDailyReset();

        return {
            enabled: this.enabled,
            intervalMs: this.intervalMs,
            maxIdeasPerDay: this.maxIdeasPerDay,
            todayCount: this.todayCount,
            totalGenerated: this.generatedCount,
            usedIdeasCount: this.usedIdeas.size,
            availableTemplates: Object.values(IDEA_TEMPLATES).flat().length - this.usedIdeas.size
        };
    }

    /**
     * 手动触发生成
     */
    async manualGenerate() {
        if (!this.enabled) {
            return { success: false, error: '生成器未启动' };
        }

        const idea = await this.generateIdea();
        if (idea) {
            await this.spawnNiuMa(idea);
            this.todayCount++;
            this.generatedCount++;
            return { success: true, idea };
        }

        return { success: false, error: '无法生成想法' };
    }
}

module.exports = { IdeaGenerator, IDEA_TEMPLATES };
