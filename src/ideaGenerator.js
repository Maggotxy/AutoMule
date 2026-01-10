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
 * AI 生成提示词模板 - 具体、可实现的应用想法
 * 
 * 统一风格要求：简约高级，自定义原生 CSS（不使用 Tailwind）
 */
const STYLE_SUFFIX = '。【样式要求】使用原生 CSS（不要用 Tailwind），简约高级风格，注重细节和动画，配色和谐统一。';

const AI_PROMPT_TEMPLATES = [
    // MD风格博客/文档
    '创建一个极简风格的 Markdown 博客首页，白灰黑配色，支持文章列表展示，具有现代感的排版设计' + STYLE_SUFFIX,
    '做一个高级感的个人作品集页面，采用黑白灰配色方案，卡片式布局，hover 有流畅动画效果' + STYLE_SUFFIX,
    '设计一个技术文档展示页面，左侧目录导航，右侧内容区，深色模式，代码高亮显示' + STYLE_SUFFIX,

    // 像素风/复古风
    '创建一个像素风格的个人主页，8-bit 复古配色，像素字体，有趣的像素动画效果' + STYLE_SUFFIX,
    '做一个复古游戏风格的计时器应用，像素艺术风格，霓虹色彩，带音效反馈' + STYLE_SUFFIX,
    '设计一个像素风格的天气展示卡片，可爱的像素图标，简洁的天气信息展示' + STYLE_SUFFIX,

    // 仪表盘/数据展示
    '创建一个现代风格的数据仪表盘，深色主题，渐变色卡片，模拟数据展示，响应式布局' + STYLE_SUFFIX,
    '做一个系统状态监控面板，实时数据模拟，进度条和图表展示，科技感 UI 设计' + STYLE_SUFFIX,
    '设计一个简约的统计数据展示页，数字滚动动画，图标配合，浅色清爽风格' + STYLE_SUFFIX,

    // 工具类应用
    '创建一个简洁的番茄钟应用，圆形进度条，可自定义时间，完成提示动画' + STYLE_SUFFIX,
    '做一个 CSS 渐变色生成器，可视化调节颜色，实时预览，一键复制代码' + STYLE_SUFFIX,
    '设计一个随机名言生成器，优雅的卡片展示，一键切换，支持复制分享' + STYLE_SUFFIX,

    // 互动展示
    '创建一个 3D 卡片翻转效果展示，鼠标悬停触发，正反面不同内容，流畅过渡动画' + STYLE_SUFFIX,
    '做一个粒子背景效果页面，鼠标跟随互动，可调节粒子数量和颜色' + STYLE_SUFFIX,
    '设计一个打字机效果展示页，逐字显示文字，光标闪烁，可配置的打字速度' + STYLE_SUFFIX,

    // 登录/注册页面
    '创建一个高级感的登录页面，毛玻璃效果背景，悬浮卡片表单，输入框聚焦动画' + STYLE_SUFFIX,
    '做一个渐变背景的注册页面，左右分栏布局，表单验证提示，提交按钮加载动画' + STYLE_SUFFIX,

    // 着陆页
    '创建一个产品着陆页，Hero 大图区域，特性卡片展示，CTA 按钮，白色简约风格' + STYLE_SUFFIX,
    '做一个 SaaS 产品首页，定价卡片对比，客户评价轮播，渐变色按钮' + STYLE_SUFFIX
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

        // 持久化存储
        this.ideasDataDir = path.join(__dirname, '../data');
        this.ideasDataFile = path.join(this.ideasDataDir, 'ideas.json');
        this.allIdeas = []; // 所有生成的想法（持久化）
        this.loadIdeas(); // 启动时加载

        logger.info('🤖 想法生成器初始化', {
            enabled: this.config.enabled,
            intervalMs: this.intervalMs,
            maxIdeasPerDay: this.maxIdeasPerDay,
            sources: this.config.sources,
            persistentIdeas: this.allIdeas.length
        });
    }

    /**
     * 加载持久化的想法
     */
    loadIdeas() {
        try {
            if (fs.existsSync(this.ideasDataFile)) {
                const data = JSON.parse(fs.readFileSync(this.ideasDataFile, 'utf-8'));
                this.allIdeas = data.ideas || [];
                logger.info('📂 加载持久化想法', { count: this.allIdeas.length });
            }
        } catch (error) {
            logger.warn('📂 加载想法失败，将使用空列表', { error: error.message });
            this.allIdeas = [];
        }
    }

    /**
     * 保存想法到文件
     */
    saveIdeas() {
        try {
            if (!fs.existsSync(this.ideasDataDir)) {
                fs.mkdirSync(this.ideasDataDir, { recursive: true });
            }
            const data = {
                ideas: this.allIdeas,
                lastUpdated: new Date().toISOString(),
                totalCount: this.allIdeas.length
            };
            fs.writeFileSync(this.ideasDataFile, JSON.stringify(data, null, 2), 'utf-8');
        } catch (error) {
            logger.error('📂 保存想法失败', { error: error.message });
        }
    }

    /**
     * 添加一个想法到持久化存储
     */
    addIdea(content, source = 'unknown', analysis = null) {
        const idea = {
            id: `idea_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            content,
            source,
            analysis,
            timestamp: Date.now(),
            used: false,
            createdAt: new Date().toISOString()
        };
        this.allIdeas.unshift(idea); // 最新的在前

        // 限制最多保留 500 条
        if (this.allIdeas.length > 500) {
            this.allIdeas = this.allIdeas.slice(0, 500);
        }

        this.saveIdeas();
        return idea;
    }

    /**
     * 获取所有持久化的想法
     */
    getAllIdeas() {
        return this.allIdeas;
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
            '创建一个简约的个人名片页面，白灰黑配色，居中布局，社交链接图标',
            '做一个时钟展示页面，数字时钟样式，深色背景，秒针动画效果',
            '设计一个待办事项列表，可添加删除任务，本地存储，简洁 UI',
            '创建一个图片画廊展示页，网格布局，点击放大预览，过渡动画',
            '做一个简单的计算器界面，按钮网格布局，支持基本运算',
            '设计一个倒计时页面，大数字显示，可设置目标日期，进度条展示',
            '创建一个音乐播放器 UI，播放进度条，播放控制按钮，专辑封面展示',
            '做一个天气卡片组件，温度显示，天气图标，城市名称，渐变背景'
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
    async spawnNiuMa(ideaContent, source = 'unknown', analysis = null) {
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

        // 持久化到 ideas.json
        const persistedIdea = this.addIdea(ideaContent, source, analysis);

        logger.info('🤖 创建想法文件', { fileName, filePath, ideaId: persistedIdea.id });

        return { fileName, filePath, idea: persistedIdea };
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
