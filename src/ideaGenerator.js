/**
 * IdeaGenerator - 想法自动生成器
 *
 * 持续生成新想法，自动创建新的赛博牛马。
 *
 * 想法来源：
 * 1. AI 自动生成 - 让 AI 思考有价值的应用想法
 * 2. 外部采集 - 从网络获取灵感
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const https = require('https');
const logger = require('./utils/logger');

/**
 * 网络资源来源配置
 */
const WEB_SOURCES = {
    // GitHub Trending 项目
    githubTrending: {
        enabled: true,
        url: 'https://github.com/trending',
        description: 'GitHub 热门项目'
    },
    // Product Hunt 热门产品
    productHunt: {
        enabled: true,
        url: 'https://www.producthunt.com',
        description: 'Product Hunt 热门产品'
    },
    // Hacker News 热门讨论
    hackerNews: {
        enabled: true,
        url: 'https://news.ycombinator.com',
        description: 'Hacker News 热门讨论'
    },
    // Reddit 热门话题
    reddit: {
        enabled: true,
        url: 'https://www.reddit.com/r/webdev',
        description: 'Reddit Web 开发社区'
    }
};

/**
 * AI 生成提示词模板
 */
const AI_PROMPT_TEMPLATES = [
    '基于当前技术趋势，生成一个创新的 Web 应用想法',
    '想象一个解决日常痛点的实用工具',
    '设计一个有趣的小游戏或互动应用',
    '创建一个数据可视化或创意展示应用',
    '构建一个提升工作效率的生产力工具',
    '开发一个具有教育意义的学习应用',
    '设计一个社交互动类应用',
    '创建一个音乐或艺术相关的创意应用'
];

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
        this.webSources = WEB_SOURCES;
        this.aiPromptTemplates = AI_PROMPT_TEMPLATES;
        this.cachedIdeas = []; // 缓存从网络获取的想法
        this.lastWebFetchTime = 0;
        this.webFetchInterval = 3600000; // 每小时从网络获取一次

        logger.info('🤖 想法生成器初始化', {
            enabled: this.config.enabled,
            intervalMs: this.intervalMs,
            maxIdeasPerDay: this.maxIdeasPerDay,
            sources: this.config.sources
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
     * 生成想法（从网络获取或AI生成）
     */
    async generateIdea() {
        const sources = this.config.sources || { templates: false, ai: true, external: true };

        // 优先从网络获取
        if (sources.external) {
            const webIdea = await this.fetchIdeaFromWeb();
            if (webIdea) {
                return webIdea;
            }
        }

        // 其次使用 AI 生成
        if (sources.ai) {
            const aiIdea = await this.generateIdeaWithAI();
            if (aiIdea) {
                return aiIdea;
            }
        }

        // 如果都失败，生成一个基础想法
        return this.generateFallbackIdea();
    }

    /**
     * 从网络获取想法
     */
    async fetchIdeaFromWeb() {
        const now = Date.now();

        // 如果缓存充足且未过期，直接使用缓存
        if (this.cachedIdeas.length > 0 && (now - this.lastWebFetchTime) < this.webFetchInterval) {
            const idea = this.cachedIdeas.shift();
            // 简单去重
            const signature = idea.substring(0, 20);
            if (!this.usedIdeas.has(signature)) {
                this.usedIdeas.add(signature);
                return idea;
            }
        }

        // 从网络获取新想法
        try {
            logger.info('🌐 开始从网络抓取真实数据...');
            const newIdeas = await this.scrapeWebSources();
            if (newIdeas && newIdeas.length > 0) {
                this.cachedIdeas = newIdeas;
                this.lastWebFetchTime = now;
                logger.info('🌐 从网络获取到新想法', { count: newIdeas.length });

                const idea = this.cachedIdeas.shift();
                const signature = idea.substring(0, 20);
                this.usedIdeas.add(signature);
                return idea;
            }
        } catch (error) {
            logger.warn('🌐 从网络获取想法失败', { error: error.message });
        }

        return null;
    }

    /**
     * 抓取网络资源
     */
    async scrapeWebSources() {
        const ideas = [];
        const sources = this.config.webSources || this.webSources;
        const enabledSources = Object.entries(sources).filter(([_, source]) => source.enabled);

        if (enabledSources.length === 0) return ideas;

        // 并行抓取所有启用的源
        const promises = enabledSources.map(async ([key, source]) => {
            try {
                const fetchedIdeas = await this.fetchAndParse(key, source);
                return fetchedIdeas;
            } catch (err) {
                logger.warn(`抓取源 ${key} 失败`, { error: err.message });
                return [];
            }
        });

        const results = await Promise.all(promises);
        results.forEach(list => ideas.push(...list));

        // 随机打乱
        return ideas.sort(() => Math.random() - 0.5);
    }

    /**
     * 发送 HTTPS 请求
     */
    fetchUrl(url) {
        return new Promise((resolve, reject) => {
            const req = https.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
            }, (res) => {
                if (res.statusCode < 200 || res.statusCode > 299) {
                    return reject(new Error(`Status Code: ${res.statusCode}`));
                }

                const data = [];
                res.on('data', chunk => data.push(chunk));
                res.on('end', () => resolve(Buffer.concat(data).toString()));
            });

            req.on('error', reject);
            req.setTimeout(10000, () => {
                req.destroy();
                reject(new Error('Request Timeout'));
            });
        });
    }

    /**
     * 抓取并解析特定源
     */
    async fetchAndParse(key, source) {
        const content = await this.fetchUrl(source.url);
        const ideas = [];

        if (source.dataType === 'json') {
            // Reddit JSON 解析
            try {
                const json = JSON.parse(content);
                const posts = json.data?.children || [];
                for (const post of posts) {
                    const title = post.data?.title;
                    if (title) {
                        const idea = this.analyzePainPoint(title, source.description);
                        if (idea) ideas.push(idea);
                    }
                }
            } catch (e) {
                logger.warn(`解析 JSON 失败 (${key})`, { error: e.message });
            }
        } else if (source.dataType === 'rss' || source.dataType === 'xml') {
            // 简单 RSS 解析 (正则)
            const itemRegex = /<item>([\s\S]*?)<\/item>|<entry>([\s\S]*?)<\/entry>/g;
            const titleRegex = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/;

            let match;
            while ((match = itemRegex.exec(content)) !== null) {
                const itemContent = match[0];
                const titleMatch = titleRegex.exec(itemContent);
                if (titleMatch && titleMatch[1]) {
                    const title = titleMatch[1].trim();
                    const idea = this.analyzePainPoint(title, source.description);
                    if (idea) ideas.push(idea);
                }
            }
        }

        return ideas;
    }

    /**
     * 分析标题，提取痛点转化为想法
     */
    analyzePainPoint(text, sourceName) {
        // 简单的关键词匹配和转化
        // 如果包含特定词汇，认为是有价值的痛点或需求
        const keywords = ['how to', 'help', 'error', 'fail', 'slow', 'stuck', 'best way', 'alternative',
            '怎么', '如何', '报错', '慢', '卡顿', '求推荐', '替代'];

        const hasKeyword = keywords.some(k => text.toLowerCase().includes(k));

        // 如果是 Hacker News 或 V2EX，所有热门话题都可能有价值，放宽限制
        // Reddit 则过滤掉 meme 和无意义内容
        if (sourceName.includes('Reddit') && !hasKeyword) {
            // 尝试保留一些虽然没有关键词看起来像项目的
            if (text.length < 20 || text.includes('meme')) return null;
        }

        const prompt = `
【来源：${sourceName}】
【原文】：${text}

【任务】：请根据这条信息，分析用户可能存在的痛点或需求，设计一个 Web 应用或工具来解决它。
如果原文已经是一个产品，请思考如何改进它或做一个更好的替代品。
请详细描述这个应用的功能、目标用户和核心价值。
        `.trim();

        return prompt;
    }

    /**
     * 使用 AI 生成想法
     */
    async generateIdeaWithAI() {
        try {
            // 随机选择一个提示词模板
            const promptTemplate = this.aiPromptTemplates[Math.floor(Math.random() * this.aiPromptTemplates.length)];

            // 生成创意想法
            const idea = this.generateAIInspiredIdea(promptTemplate);

            if (idea && !this.usedIdeas.has(idea)) {
                this.usedIdeas.add(idea);
                logger.info('🤖 AI 生成想法', { idea: idea.substring(0, 50) + '...' });
                return idea;
            }
        } catch (error) {
            logger.warn('🤖 AI 生成想法失败', { error: error.message });
        }

        return null;
    }

    /**
     * 生成 AI 启发的想法
     */
    generateAIInspiredIdea(promptTemplate) {
        const techTrends = ['AI 助手', '机器学习', '自然语言处理', '计算机视觉', '数据分析', '自动化'];
        const userNeeds = ['提升效率', '简化流程', '增强体验', '降低成本', '提高质量'];
        const platforms = ['Web 应用', '移动应用', '桌面应用', '浏览器插件', 'API 服务'];

        const trend = techTrends[Math.floor(Math.random() * techTrends.length)];
        const need = userNeeds[Math.floor(Math.random() * userNeeds.length)];
        const platform = platforms[Math.floor(Math.random() * platforms.length)];

        return `创建一个基于${trend}的${platform}，用于${need}，${promptTemplate}`;
    }

    /**
     * 生成备用想法
     */
    generateFallbackIdea() {
        const fallbackIdeas = [
            '创建一个创新的 Web 应用，解决实际问题',
            '开发一个有趣的小工具，提升用户体验',
            '设计一个实用的生产力应用，帮助用户更高效地工作',
            '构建一个互动式应用，增加用户参与度',
            '实现一个创意项目，展示技术能力'
        ];

        const idea = fallbackIdeas[Math.floor(Math.random() * fallbackIdeas.length)];
        if (!this.usedIdeas.has(idea)) {
            this.usedIdeas.add(idea);
            return idea;
        }

        // 如果所有备用想法都用过了，清空记录
        this.usedIdeas.clear();
        return fallbackIdeas[Math.floor(Math.random() * fallbackIdeas.length)];
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
            cachedIdeasCount: this.cachedIdeas.length,
            lastWebFetchTime: this.lastWebFetchTime,
            sources: this.config.sources
        };
    }

    /**
     * 手动触发生成
     */
    async manualGenerate() {
        if (!this.enabled) {
            return { success: false, error: '生成器未启动' };
        }

        const sources = this.config.sources || { templates: false, ai: true, external: true };

        // 尝试从网络获取
        if (sources.external) {
            const webIdea = await this.fetchIdeaFromWeb();
            if (webIdea) {
                await this.spawnNiuMa(webIdea);
                this.todayCount++;
                this.generatedCount++;
                return {
                    success: true,
                    idea: webIdea,
                    source: 'web',
                    analysis: '从网络资源获取'
                };
            }
        }

        // 尝试 AI 生成
        if (sources.ai) {
            const aiIdea = await this.generateIdeaWithAI();
            if (aiIdea) {
                await this.spawnNiuMa(aiIdea);
                this.todayCount++;
                this.generatedCount++;
                return {
                    success: true,
                    idea: aiIdea,
                    source: 'ai',
                    analysis: 'AI 自动生成'
                };
            }
        }

        // 使用备用想法
        const fallbackIdea = this.generateFallbackIdea();
        if (fallbackIdea) {
            await this.spawnNiuMa(fallbackIdea);
            this.todayCount++;
            this.generatedCount++;
            return {
                success: true,
                idea: fallbackIdea,
                source: 'fallback',
                analysis: '备用想法'
            };
        }

        return { success: false, error: '无法生成想法' };
    }
}

module.exports = { IdeaGenerator };
