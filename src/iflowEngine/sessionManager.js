/**
 * SessionManager - 多 iFlow 会话管理器
 * 
 * 支持多个想法/应用同时拥有独立的 iFlow 会话，实现并行开发。
 * 
 * 设计原则：
 * - 每个应用可以有独立的 iFlow WebSocket 会话
 * - 会话数受 maxConcurrentSessions 限制
 * - 会话可以复用（应用释放后，会话可分配给其他应用）
 * - 超过最大会话数时，新请求进入等待队列
 */

const { spawn } = require('child_process');
const net = require('net');
const logger = require('../utils/logger');

/**
 * 单个 iFlow 会话实例
 */
class IFlowSession {
    constructor({ port, process: proc, createdAt }) {
        this.port = port;
        this.process = proc;
        this.createdAt = createdAt;
        this.appId = null;        // 当前绑定的应用 ID
        this.status = 'idle';     // idle | busy | starting | stopping
        this.lastUsedAt = null;
        this.useCount = 0;
    }

    /**
     * 绑定到指定应用
     */
    bind(appId) {
        this.appId = appId;
        this.status = 'busy';
        this.lastUsedAt = new Date();
        this.useCount++;
    }

    /**
     * 释放会话（解绑应用）
     */
    release() {
        this.appId = null;
        this.status = 'idle';
        this.lastUsedAt = new Date();
    }

    /**
     * 获取 WebSocket URL
     */
    getWsUrl() {
        return `ws://localhost:${this.port}/acp`;
    }
}

/**
 * 会话管理器
 */
class SessionManager {
    constructor(config) {
        this.config = config;
        this.maxSessions = config?.system?.maxConcurrentSessions || 10;
        this.basePort = config?.iflow?.processStartPort || 8090;
        this.portRange = config?.iflow?.portRange || 50;

        // 会话池：port -> IFlowSession
        this.sessions = new Map();

        // 应用到会话的映射：appId -> port
        this.appToSession = new Map();

        // 等待队列：等待获取会话的请求
        this.waitQueue = [];

        // 已使用的端口
        this.usedPorts = new Set();

        logger.info('SessionManager 初始化', {
            maxSessions: this.maxSessions,
            basePort: this.basePort,
            portRange: this.portRange
        });

        // 定期清理长时间闲置的会话
        setInterval(() => this.cleanupIdleSessions(), 60 * 60 * 1000); // 1小时检查一次
    }

    /**
     * 清理长时间闲置的会话 (> 1小时)
     */
    cleanupIdleSessions() {
        const now = Date.now();
        const IDLE_TIMEOUT = 60 * 60 * 1000;
        let count = 0;

        for (const [port, session] of this.sessions) {
            if (session.status === 'idle' && session.lastUsedAt) {
                const idleTime = now - session.lastUsedAt.getTime();
                if (idleTime > IDLE_TIMEOUT) {
                    logger.info('♻️ 回收长时间闲置的 iFlow 会话', { port, idleTime });
                    try {
                        if (session.process) session.process.kill();
                    } catch (e) { }
                    this.sessions.delete(port);
                    this.usedPorts.delete(port);
                    count++;
                }
            }
        }

        if (count > 0) {
            logger.info('已回收闲置会话', { count, remaining: this.sessions.size });
        }
    }

    /**
     * 检查端口是否可用（未被占用）
     */
    async isPortAvailable(port, timeoutMs = 500) {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            let done = false;

            const finish = (available) => {
                if (done) return;
                done = true;
                try { socket.destroy(); } catch { }
                resolve(available);
            };

            socket.setTimeout(timeoutMs);
            socket.once('connect', () => finish(false)); // 端口被占用
            socket.once('timeout', () => finish(true));  // 超时=未占用
            socket.once('error', () => finish(true));    // 连接失败=未占用
            socket.connect(port, '127.0.0.1');
        });
    }

    /**
     * 检查端口是否已就绪（iFlow 服务已启动）
     */
    async isPortReady(port, timeoutMs = 500) {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            let done = false;

            const finish = (ready) => {
                if (done) return;
                done = true;
                try { socket.destroy(); } catch { }
                resolve(ready);
            };

            socket.setTimeout(timeoutMs);
            socket.once('connect', () => finish(true));
            socket.once('timeout', () => finish(false));
            socket.once('error', () => finish(false));
            socket.connect(port, '127.0.0.1');
        });
    }

    /**
     * 寻找一个可用的端口
     */
    async findAvailablePort() {
        for (let i = 0; i < this.portRange; i++) {
            const port = this.basePort + i;
            if (this.usedPorts.has(port)) continue;

            // eslint-disable-next-line no-await-in-loop
            const available = await this.isPortAvailable(port);
            if (available) {
                return port;
            }
        }
        return null;
    }

    /**
     * 启动一个新的 iFlow 进程
     */
    async startIFlowProcess(port) {
        logger.info('启动新的 iFlow 进程', { port });

        // 跨平台: Linux 使用 sh -c, Windows 使用 cmd /c
        const isWindows = process.platform === 'win32';
        const shell = isWindows ? 'cmd' : 'sh';
        const shellArgs = isWindows
            ? ['/c', 'iflow', '--experimental-acp', '--port', String(port)]
            : ['-c', `iflow --experimental-acp --port ${port}`];

        const child = spawn(shell, shellArgs, {
            stdio: 'pipe',
            windowsHide: true
        });

        child.stdout.on('data', (d) => {
            logger.debug(`iflow:${port} stdout`, { output: d.toString().trim() });
        });
        child.stderr.on('data', (d) => {
            logger.warn(`iflow:${port} stderr`, { output: d.toString().trim() });
        });
        child.on('close', (code) => {
            logger.warn(`iflow:${port} 进程退出`, { code });
            this.handleProcessExit(port);
        });

        // 等待端口就绪 (增加到 60s 以应对并发启动卡顿)
        const deadline = Date.now() + 60000;
        while (Date.now() < deadline) {
            // eslint-disable-next-line no-await-in-loop
            if (await this.isPortReady(port, 500)) {
                return child;
            }
            // eslint-disable-next-line no-await-in-loop
            await new Promise(r => setTimeout(r, 300));
        }

        // 超时，杀死进程
        try { child.kill(); } catch { }
        throw new Error(`启动 iFlow 进程超时（端口 ${port} 未就绪）`);
    }

    /**
     * 处理进程退出
     */
    handleProcessExit(port) {
        const session = this.sessions.get(port);
        if (!session) return;

        // 如果会话正在被使用，通知相关应用
        if (session.appId) {
            const appId = session.appId;
            this.appToSession.delete(appId);
            logger.warn('iFlow 会话异常退出，已解绑应用', { port, appId });
        }

        this.sessions.delete(port);
        this.usedPorts.delete(port);

        // 尝试处理等待队列
        this.processWaitQueue();
    }

    /**
     * 创建新会话
     */
    async createSession() {
        if (this.sessions.size >= this.maxSessions) {
            return null;
        }

        const port = await this.findAvailablePort();
        if (!port) {
            throw new Error('没有可用的 iFlow 端口');
        }

        this.usedPorts.add(port);

        try {
            const proc = await this.startIFlowProcess(port);
            const session = new IFlowSession({
                port,
                process: proc,
                createdAt: new Date()
            });
            this.sessions.set(port, session);
            return session;
        } catch (error) {
            this.usedPorts.delete(port);
            throw error;
        }
    }

    /**
     * 获取空闲会话
     */
    getIdleSession() {
        for (const session of this.sessions.values()) {
            if (session.status === 'idle') {
                return session;
            }
        }
        return null;
    }

    /**
     * 为应用获取或创建会话
     * @param {string} appId 应用 ID
     * @param {number} timeoutMs 等待超时时间
     * @returns {Promise<IFlowSession>}
     */
    async getOrCreateSession(appId, timeoutMs = 60000) {
        // 检查应用是否已有会话
        const existingPort = this.appToSession.get(appId);
        if (existingPort) {
            const session = this.sessions.get(existingPort);
            if (session && session.status !== 'stopping') {
                return session;
            }
        }

        // 尝试获取空闲会话
        let session = this.getIdleSession();
        if (session) {
            session.bind(appId);
            this.appToSession.set(appId, session.port);
            logger.info('复用空闲会话', { appId, port: session.port });
            return session;
        }

        // 尝试创建新会话
        if (this.sessions.size < this.maxSessions) {
            try {
                session = await this.createSession();
                if (session) {
                    session.bind(appId);
                    this.appToSession.set(appId, session.port);
                    logger.info('创建新会话', { appId, port: session.port });
                    return session;
                }
            } catch (error) {
                logger.error('创建会话失败', { appId, error: error.message });
                throw error;
            }
        }

        // 会话已满，进入等待队列
        return new Promise((resolve, reject) => {
            const request = {
                appId,
                resolve,
                reject,
                createdAt: Date.now(),
                timeoutMs
            };

            const timer = setTimeout(() => {
                const idx = this.waitQueue.indexOf(request);
                if (idx !== -1) {
                    this.waitQueue.splice(idx, 1);
                    reject(new Error(`获取会话超时（${timeoutMs}ms），当前所有会话均被占用`));
                }
            }, timeoutMs);

            request.timer = timer;
            this.waitQueue.push(request);

            logger.info('应用进入会话等待队列', {
                appId,
                queueLength: this.waitQueue.length,
                activeSessions: this.sessions.size
            });
        });
    }

    /**
     * 处理等待队列
     */
    processWaitQueue() {
        if (this.waitQueue.length === 0) return;

        const session = this.getIdleSession();
        if (!session) return;

        const request = this.waitQueue.shift();
        if (!request) return;

        clearTimeout(request.timer);

        session.bind(request.appId);
        this.appToSession.set(request.appId, session.port);

        logger.info('从等待队列分配会话', {
            appId: request.appId,
            port: session.port,
            waitedMs: Date.now() - request.createdAt
        });

        request.resolve(session);
    }

    /**
     * 释放应用的会话
     * @param {string} appId 应用 ID
     */
    releaseSession(appId) {
        const port = this.appToSession.get(appId);
        if (!port) return;

        const session = this.sessions.get(port);
        if (!session) return;

        session.release();
        this.appToSession.delete(appId);

        logger.info('释放会话', { appId, port });

        // 处理等待队列
        this.processWaitQueue();
    }

    /**
     * 获取应用当前的会话（如果有）
     * @param {string} appId 应用 ID
     * @returns {IFlowSession|null}
     */
    getSessionForApp(appId) {
        const port = this.appToSession.get(appId);
        if (!port) return null;
        return this.sessions.get(port) || null;
    }

    /**
     * 获取所有会话的状态
     */
    getStatus() {
        const sessions = [];
        for (const session of this.sessions.values()) {
            sessions.push({
                port: session.port,
                status: session.status,
                appId: session.appId,
                useCount: session.useCount,
                lastUsedAt: session.lastUsedAt,
                createdAt: session.createdAt
            });
        }

        return {
            maxSessions: this.maxSessions,
            activeSessions: this.sessions.size,
            busySessions: sessions.filter(s => s.status === 'busy').length,
            idleSessions: sessions.filter(s => s.status === 'idle').length,
            waitQueueLength: this.waitQueue.length,
            sessions
        };
    }

    /**
     * 关闭所有会话
     */
    async shutdown() {
        logger.info('关闭所有 iFlow 会话');

        // 拒绝所有等待请求
        for (const request of this.waitQueue) {
            clearTimeout(request.timer);
            request.reject(new Error('SessionManager 正在关闭'));
        }
        this.waitQueue = [];

        // 关闭所有会话
        for (const session of this.sessions.values()) {
            try {
                if (session.process) {
                    session.process.kill();
                }
            } catch { }
        }

        this.sessions.clear();
        this.appToSession.clear();
        this.usedPorts.clear();
    }

    /**
     * 强制终止所有会话（同步版本，用于进程退出时）
     */
    terminateAllSessions() {
        logger.info('🧹 强制终止所有 iFlow 会话...');
        let killed = 0;

        // 拒绝所有等待请求
        for (const request of this.waitQueue) {
            try {
                clearTimeout(request.timer);
                request.reject(new Error('系统正在关闭'));
            } catch (e) { }
        }
        this.waitQueue = [];

        // 强制杀死所有会话进程
        for (const session of this.sessions.values()) {
            try {
                if (session.process && !session.process.killed) {
                    session.process.kill('SIGKILL'); // 强制杀死
                    killed++;
                    logger.debug('已终止 iFlow 会话进程', { port: session.port, pid: session.process.pid });
                }
            } catch (e) {
                logger.warn('终止会话进程失败', { port: session.port, error: e.message });
            }
        }

        this.sessions.clear();
        this.appToSession.clear();
        this.usedPorts.clear();

        logger.info('✅ 所有 iFlow 会话已终止', { killed });
    }
}

module.exports = { SessionManager, IFlowSession };
