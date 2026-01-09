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
        this.app.use(express.static(path.join(__dirname, '../public')));
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
