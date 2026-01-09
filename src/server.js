const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const logger = require('./utils/logger');

class WebServer {
    constructor(system) {
        this.system = system;
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server);
        this.ideasDir = path.join(__dirname, '../ideas');

        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
    }

    setupMiddleware() {
        this.app.use(express.json());
        // 禁用静态文件缓存，确保前端每次加载最新 JS
        this.app.use(express.static(path.join(__dirname, '../public'), {
            etag: false,
            lastModified: false,
            setHeaders: (res, path) => {
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
            }
        }));
    }

    setupRoutes() {
        // API 路由
        this.app.get('/api/stats', (req, res) => {
            const stats = this.system.monitor.getFormattedMetrics();
            const queueStats = this.system.taskQueue.getStats();
            const ideaStats = this.system.ideaCapturer.getStats();

            res.json({
                ...stats,
                ...queueStats,
                ...ideaStats
            });
        });

        // iFlow 连接池状态
        this.app.get('/api/iflow/connection-status', (req, res) => {
            try {
                const { getConnectionPool } = require('./iflowEngine/IFlowConnectionPool');
                const connectionPool = getConnectionPool();
                const status = connectionPool.getStatus();
                res.json({ success: true, ...status });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.get('/api/tasks', (req, res) => {
            const queueDetails = this.system.taskQueue.getQueueDetails();
            res.json(queueDetails);
        });

        this.app.get('/api/tasks/:taskId/code', (req, res) => {
            const taskId = req.params.taskId;

            // 直接从文件系统查找代码文件
            const generatedCodeDir = path.join(__dirname, '../generated-code');
            const files = fs.readdirSync(generatedCodeDir);

            // 查找匹配的代码文件
            const codeFile = files.find(f => f.includes(taskId));

            if (!codeFile) {
                return res.status(404).json({ error: 'Code file not found' });
            }

            const codePath = path.join(generatedCodeDir, codeFile);
            const content = fs.readFileSync(codePath, 'utf-8');

            res.json({
                taskId,
                content,
                createdAt: fs.statSync(codePath).mtime.toISOString()
            });
        });

        this.app.post('/api/ideas', (req, res) => {
            const { content, priority = 'medium', fileName } = req.body;

            if (!content) {
                return res.status(400).json({ error: 'Content is required' });
            }

            // 为了保证持续迭代（ideaKey），Web 输入统一落到 ideas/*.txt，由文件监听触发入队
            try {
                if (!fs.existsSync(this.ideasDir)) {
                    fs.mkdirSync(this.ideasDir, { recursive: true });
                }

                const safeName = typeof fileName === 'string' && fileName.trim()
                    ? fileName.trim()
                    : `idea_web_${Date.now()}.txt`;
                const finalName = safeName.toLowerCase().endsWith('.txt') ? safeName : `${safeName}.txt`;
                if (!/^[\w\-. ]+\.txt$/i.test(finalName)) {
                    return res.status(400).json({ success: false, error: 'Invalid fileName' });
                }

                const targetPath = path.join(this.ideasDir, finalName);
                const nextBlock = content.replace(/\r\n/g, '\n').trim();
                let nextFile = `${nextBlock}\n`;
                if (fs.existsSync(targetPath)) {
                    const prev = fs.readFileSync(targetPath, 'utf-8').replace(/\r\n/g, '\n').trimEnd();
                    nextFile = prev ? `${prev}\n\n${nextBlock}\n` : `${nextBlock}\n`;
                }
                fs.writeFileSync(targetPath, nextFile, 'utf-8');

                res.json({
                    success: true,
                    ideaId: Date.now().toString(),
                    priority,
                    fileName: finalName,
                    filePath: targetPath,
                    ideaKey: path.resolve(targetPath)
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Idea 文件（用于“持续迭代同一应用”）
        this.app.get('/api/idea-files', (req, res) => {
            try {
                if (!fs.existsSync(this.ideasDir)) {
                    fs.mkdirSync(this.ideasDir, { recursive: true });
                }

                const apps = this.system.iflowEngine.getAppsList();
                const appByIdeaKey = new Map();
                apps.forEach(app => {
                    if (app.ideaKey) {
                        appByIdeaKey.set(app.ideaKey, { id: app.id, name: app.name, type: app.type, port: app.port, status: app.status });
                    }
                });

                const files = fs.readdirSync(this.ideasDir)
                    .filter(f => f.endsWith('.txt'))
                    .map(fileName => {
                        const filePath = path.join(this.ideasDir, fileName);
                        const stat = fs.statSync(filePath);
                        const ideaKey = path.resolve(filePath);
                        return {
                            fileName,
                            filePath,
                            ideaKey,
                            mtime: stat.mtime.toISOString(),
                            size: stat.size,
                            app: appByIdeaKey.get(ideaKey) || null
                        };
                    })
                    .sort((a, b) => new Date(b.mtime) - new Date(a.mtime));

                res.json({ success: true, files });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.get('/api/idea-files/:fileName', (req, res) => {
            try {
                const fileName = req.params.fileName;
                if (!/^[\w\-. ]+\.txt$/i.test(fileName)) {
                    return res.status(400).json({ success: false, error: 'Invalid fileName' });
                }

                const filePath = path.join(this.ideasDir, fileName);
                if (!fs.existsSync(filePath)) {
                    return res.status(404).json({ success: false, error: 'File not found' });
                }

                const content = fs.readFileSync(filePath, 'utf-8');
                res.json({
                    success: true,
                    fileName,
                    filePath,
                    ideaKey: path.resolve(filePath),
                    content
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/api/idea-files', (req, res) => {
            try {
                const { fileName, content } = req.body || {};
                if (typeof content !== 'string' || !content.trim()) {
                    return res.status(400).json({ success: false, error: 'Content is required' });
                }

                const safeName = typeof fileName === 'string' && fileName.trim()
                    ? fileName.trim()
                    : `idea_${Date.now()}.txt`;

                const finalName = safeName.toLowerCase().endsWith('.txt') ? safeName : `${safeName}.txt`;
                if (!/^[\w\-. ]+\.txt$/i.test(finalName)) {
                    return res.status(400).json({ success: false, error: 'Invalid fileName' });
                }

                if (!fs.existsSync(this.ideasDir)) {
                    fs.mkdirSync(this.ideasDir, { recursive: true });
                }

                const filePath = path.join(this.ideasDir, finalName);
                const nextBlock = content.replace(/\r\n/g, '\n').trim();

                // 同一个 ideaKey（同一个文件）走“追加式”记录，便于保留完整想法历史；
                // IdeaCapturer 会自动提取增量尾部内容作为本次迭代输入。
                let nextFile = `${nextBlock}\n`;
                if (fs.existsSync(filePath)) {
                    const prev = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n').trimEnd();
                    nextFile = prev ? `${prev}\n\n${nextBlock}\n` : `${nextBlock}\n`;
                }

                fs.writeFileSync(filePath, nextFile, 'utf-8');

                res.json({
                    success: true,
                    fileName: finalName,
                    filePath,
                    ideaKey: path.resolve(filePath)
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/api/preview', (req, res) => {
            const { code } = req.body;

            if (!code) {
                return res.status(400).json({ error: 'Code is required' });
            }

            // 提取 HTML 内容
            const htmlMatch = code.match(/```html\n([\s\S]*?)\n```/);
            const htmlContent = htmlMatch ? htmlMatch[1] : code;

            res.json({
                html: htmlContent,
                success: true
            });
        });

        // 想法生成 API
        this.app.post('/api/ideas/generate', async (req, res) => {
            try {
                const count = parseInt(req.body.count || '1', 10);
                const limit = Math.min(count, 5); // 限制最大并发 5 个

                logger.info(`收到批量生成想法请求`, { count: limit });

                const results = [];
                // 暂时循环调用单次生成，稍后在 ideaGenerator 中实现真正的批量
                for (let i = 0; i < limit; i++) {
                    const result = await this.system.ideaGenerator.manualGenerate();
                    results.push(result);
                }

                res.json({ success: true, results });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 应用管理 API
        this.app.get('/api/apps', (req, res) => {
            try {
                const apps = this.system.iflowEngine.getAppsList();
                res.json({ success: true, apps });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 应用文件树（只读）
        this.app.get('/api/apps/:appId/tree', (req, res) => {
            try {
                const { appId } = req.params;
                const depth = Math.min(parseInt(req.query.depth || '2', 10) || 2, 6);
                const ignore = new Set(['node_modules', '.git', '.staging']);

                // 处理 pending 应用（还没有实际目录）
                if (appId.startsWith('pending_')) {
                    return res.json({
                        success: true,
                        appId,
                        root: null,
                        tree: { name: appId, path: '.', type: 'dir', children: [], pending: true },
                        message: '应用正在生成中...'
                    });
                }

                const appDir = path.join(__dirname, '../generated-apps', appId);
                if (!fs.existsSync(appDir) || !fs.statSync(appDir).isDirectory()) {
                    return res.status(404).json({ success: false, error: 'App not found' });
                }

                const root = path.resolve(appDir);
                const walk = (dir, currentDepth) => {
                    const name = path.basename(dir);
                    if (ignore.has(name)) return null;

                    const node = {
                        name,
                        path: path.relative(root, dir) || '.',
                        type: 'dir',
                        children: []
                    };

                    if (currentDepth <= 0) return node;

                    let entries = [];
                    try {
                        entries = fs.readdirSync(dir, { withFileTypes: true });
                    } catch {
                        return node;
                    }

                    const children = entries
                        .filter(e => !ignore.has(e.name))
                        .map(e => {
                            const full = path.join(dir, e.name);
                            if (e.isDirectory()) return walk(full, currentDepth - 1);
                            return {
                                name: e.name,
                                path: path.relative(root, full),
                                type: 'file'
                            };
                        })
                        .filter(Boolean)
                        .sort((a, b) => {
                            if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
                            return a.name.localeCompare(b.name);
                        });

                    node.children = children;
                    return node;
                };

                const tree = walk(root, depth);
                res.json({ success: true, appId, root, tree });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 应用文件读取（只读）
        this.app.get('/api/apps/:appId/file', (req, res) => {
            try {
                const { appId } = req.params;
                const relPath = String(req.query.path || '').trim();
                if (!relPath || relPath.includes('..')) {
                    return res.status(400).json({ success: false, error: 'Invalid path' });
                }

                const appDir = path.join(__dirname, '../generated-apps', appId);
                const root = path.resolve(appDir);
                const fullPath = path.resolve(path.join(appDir, relPath));
                if (!fullPath.startsWith(root + path.sep) && fullPath !== root) {
                    return res.status(400).json({ success: false, error: 'Path out of bounds' });
                }
                if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
                    return res.status(404).json({ success: false, error: 'File not found' });
                }

                const content = fs.readFileSync(fullPath, 'utf-8');
                res.json({ success: true, appId, path: relPath, content });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/api/apps/:appId/start', async (req, res) => {
            try {
                const { appId } = req.params;
                const result = await this.system.iflowEngine.startApp(appId);
                res.json(result);
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/api/apps/:appId/stop', (req, res) => {
            try {
                const { appId } = req.params;
                const result = this.system.iflowEngine.stopApp(appId);
                res.json(result);
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 批量操作 API
        this.app.post('/api/apps/start-all', async (req, res) => {
            try {
                const results = await this.system.iflowEngine.startAllApps();
                const successCount = results.filter(r => r.success).length;
                res.json({ success: true, results, successCount });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/api/apps/stop-all', async (req, res) => {
            try {
                const results = await this.system.iflowEngine.stopAllApps();
                const successCount = results.filter(r => r.success).length;
                res.json({ success: true, results, successCount });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 会话管理 API（多想法并行开发）
        this.app.get('/api/sessions', (req, res) => {
            try {
                const sessionManager = this.system.iflowEngine.sessionManager;
                if (!sessionManager) {
                    return res.json({
                        success: true,
                        enabled: false,
                        message: 'SessionManager 未启用',
                        sessions: []
                    });
                }

                const status = sessionManager.getStatus();
                res.json({
                    success: true,
                    enabled: true,
                    ...status
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 为指定应用获取/创建会话
        this.app.post('/api/apps/:appId/session', async (req, res) => {
            try {
                const { appId } = req.params;
                const sessionManager = this.system.iflowEngine.sessionManager;

                if (!sessionManager) {
                    return res.status(400).json({
                        success: false,
                        error: 'SessionManager 未启用'
                    });
                }

                const session = await sessionManager.getOrCreateSession(appId);
                res.json({
                    success: true,
                    appId,
                    port: session.port,
                    wsUrl: session.getWsUrl(),
                    status: session.status
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 释放指定应用的会话
        this.app.delete('/api/apps/:appId/session', (req, res) => {
            try {
                const { appId } = req.params;
                const sessionManager = this.system.iflowEngine.sessionManager;

                if (!sessionManager) {
                    return res.status(400).json({
                        success: false,
                        error: 'SessionManager 未启用'
                    });
                }

                sessionManager.releaseSession(appId);
                res.json({
                    success: true,
                    appId,
                    message: '会话已释放'
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ========== 自动迭代 API（赛博牛马）==========

        // 获取自动迭代配置和所有状态
        this.app.get('/api/auto-iterate', (req, res) => {
            try {
                const autoIterator = this.system.iflowEngine.autoIterator;
                if (!autoIterator) {
                    return res.json({ success: true, enabled: false, states: {} });
                }

                const config = this.system.config?.autoIterate || {};
                res.json({
                    success: true,
                    enabled: config.enabled !== false,
                    dimensions: config.dimensions || {},
                    defaultMaxIterations: config.defaultMaxIterations || 10,
                    intervalMs: config.intervalMs || 60000,
                    states: autoIterator.getAllStates()
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 获取应用的自动迭代状态
        this.app.get('/api/apps/:appId/auto-iterate', (req, res) => {
            try {
                const { appId } = req.params;
                const autoIterator = this.system.iflowEngine.autoIterator;

                if (!autoIterator) {
                    return res.json({ success: true, enabled: false, state: null });
                }

                const state = autoIterator.getState(appId);
                res.json({ success: true, state });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 启动自动迭代（启动牛马）
        this.app.post('/api/apps/:appId/auto-iterate/start', async (req, res) => {
            try {
                const { appId } = req.params;
                const autoIterator = this.system.iflowEngine.autoIterator;

                if (!autoIterator) {
                    return res.status(400).json({
                        success: false,
                        error: '自动迭代器未启用'
                    });
                }

                const result = await autoIterator.start(appId);
                res.json(result);
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 停止自动迭代（让牛马休息）
        this.app.post('/api/apps/:appId/auto-iterate/stop', (req, res) => {
            try {
                const { appId } = req.params;
                const autoIterator = this.system.iflowEngine.autoIterator;

                if (!autoIterator) {
                    return res.status(400).json({
                        success: false,
                        error: '自动迭代器未启用'
                    });
                }

                const result = autoIterator.stop(appId);
                res.json(result);
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 设置重点关注维度
        this.app.put('/api/apps/:appId/auto-iterate/focus', (req, res) => {
            try {
                const { appId } = req.params;
                const { dimension } = req.body || {};
                const autoIterator = this.system.iflowEngine.autoIterator;

                if (!autoIterator) {
                    return res.status(400).json({
                        success: false,
                        error: '自动迭代器未启用'
                    });
                }

                const result = autoIterator.setFocus(appId, dimension);
                res.json(result);
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 更新启用的维度
        this.app.put('/api/apps/:appId/auto-iterate/dimensions', (req, res) => {
            try {
                const { appId } = req.params;
                const { dimensions } = req.body || {};
                const autoIterator = this.system.iflowEngine.autoIterator;

                if (!autoIterator) {
                    return res.status(400).json({
                        success: false,
                        error: '自动迭代器未启用'
                    });
                }

                if (!Array.isArray(dimensions)) {
                    return res.status(400).json({
                        success: false,
                        error: 'dimensions 必须是数组'
                    });
                }

                const result = autoIterator.updateDimensions(appId, dimensions);
                res.json(result);
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ========== 想法生成器 API ==========

        // 获取想法生成器状态
        this.app.get('/api/idea-generator', (req, res) => {
            try {
                const generator = this.system.ideaGenerator;
                if (!generator) {
                    return res.json({ success: true, enabled: false });
                }
                res.json({ success: true, ...generator.getStatus() });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 启动想法生成器
        this.app.post('/api/idea-generator/start', (req, res) => {
            try {
                const generator = this.system.ideaGenerator;
                if (!generator) {
                    return res.status(400).json({ success: false, error: '想法生成器未初始化' });
                }
                const result = generator.start();
                res.json(result);
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 停止想法生成器
        this.app.post('/api/idea-generator/stop', (req, res) => {
            try {
                const generator = this.system.ideaGenerator;
                if (!generator) {
                    return res.status(400).json({ success: false, error: '想法生成器未初始化' });
                }
                const result = generator.stop();
                res.json(result);
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 手动触发生成一个想法
        this.app.post('/api/idea-generator/generate', async (req, res) => {
            try {
                const generator = this.system.ideaGenerator;
                if (!generator) {
                    return res.status(400).json({ success: false, error: '想法生成器未初始化' });
                }
                const result = await generator.manualGenerate();
                res.json(result);
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 获取想法列表
        this.app.get('/api/ideas', (req, res) => {
            try {
                const generator = this.system.ideaGenerator;
                if (!generator) {
                    return res.json({ success: true, ideas: [], webCount: 0, aiCount: 0, cachedCount: 0 });
                }

                // 从想法生成器获取缓存的想法
                const cachedIdeas = generator.cachedIdeas || [];
                const usedIdeas = generator.usedIdeas || new Set();

                // 构建想法列表
                const ideas = [];

                // 添加缓存的想法（网络获取的）
                cachedIdeas.forEach((content, index) => {
                    if (!usedIdeas.has(content)) {
                        ideas.push({
                            content,
                            source: 'web',
                            timestamp: new Date(generator.lastWebFetchTime || Date.now()).toISOString(),
                            analysis: `来自网络资源，排名第 ${index + 1}`
                        });
                    }
                });

                // 添加已使用的想法（用于历史记录）
                usedIdeas.forEach((content) => {
                    if (!ideas.find(i => i.content === content)) {
                        ideas.push({
                            content,
                            source: 'cached',
                            timestamp: new Date().toISOString(),
                            analysis: '已使用的想法'
                        });
                    }
                });

                // 统计
                const webCount = ideas.filter(i => i.source === 'web').length;
                const aiCount = 0; // 当前实现中 AI 生成的想法会立即使用，不会缓存
                const cachedCount = ideas.filter(i => i.source === 'cached').length;

                res.json({
                    success: true,
                    ideas: ideas.slice(0, 20), // 只返回最近 20 个
                    webCount,
                    aiCount,
                    cachedCount,
                    lastFetchTime: generator.lastWebFetchTime || 0
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ========== 牛马工作站统计 API ==========

        // 获取工作站统计
        this.app.get('/api/niuma-station', (req, res) => {
            try {
                const autoIterator = this.system.iflowEngine.autoIterator;
                const generator = this.system.ideaGenerator;

                const stationStats = autoIterator ? autoIterator.getStationStats() : null;
                const generatorStatus = generator ? generator.getStatus() : null;

                res.json({
                    success: true,
                    station: stationStats,
                    generator: generatorStatus,
                    allNiuma: autoIterator ? autoIterator.getAllStates() : {}
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 主页路由
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../public/index.html'));
        });
    }

    setupWebSocket() {
        this.io.on('connection', (socket) => {
            logger.info('客户端已连接', { socketId: socket.id });

            // 发送初始数据
            socket.emit('stats', this.getStats());
            socket.emit('tasks', this.getTasks());

            socket.on('disconnect', () => {
                logger.info('客户端已断开', { socketId: socket.id });
            });
        });
    }

    getStats() {
        const stats = this.system.monitor.getFormattedMetrics();
        const queueStats = this.system.taskQueue.getStats();
        const ideaStats = this.system.ideaCapturer.getStats();

        return {
            ...stats,
            ...queueStats,
            ...ideaStats
        };
    }

    getTasks() {
        return this.system.taskQueue.getQueueDetails();
    }

    broadcast(event, data) {
        this.io.emit(event, data);
    }

    start(port = 8080) {
        return new Promise((resolve, reject) => {
            try {
                this.server.listen(port, () => {
                    logger.info(`Web 服务器已启动`, { port });
                    console.log(`\n🌐 前端界面访问地址: http://localhost:${port}`);
                    resolve();
                });
            } catch (error) {
                logger.error('Web 服务器启动失败', { error: error.message });
                reject(error);
            }
        });
    }

    stop() {
        return new Promise((resolve) => {
            this.server.close(() => {
                logger.info('Web 服务器已停止');
                resolve();
            });
        });
    }
}

module.exports = WebServer;
