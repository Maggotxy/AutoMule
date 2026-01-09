const { spawn } = require('child_process');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const net = require('net');
const logger = require('../utils/logger');
const { runIFlowIteration, logIFlowFailureHint } = require('./iflowSdk');
const { SessionManager } = require('./sessionManager');
const { AutoIterator } = require('./autoIterator');

class iFlowEngine extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.activeProcesses = new Map();
    this.activeApps = new Map(); // 存储运行中的应用
    this.ideaKeyToAppId = new Map();
    this.pendingApps = new Map(); // ideaKey -> placeholder app (in-memory, no disk)
    this.outputDirectory = config.codeRepository.outputDirectory;
    this.appsDirectory = path.join(__dirname, '../../generated-apps');
    this.nextPort = 3001; // 从 3001 开始分配端口
    this.usedPorts = new Set(); // 记录已使用的端口
    this.portRange = { min: 3001, max: 3999 }; // 端口范围
    this.iflowProcess = null;

    if (!fs.existsSync(this.outputDirectory)) {
      fs.mkdirSync(this.outputDirectory, { recursive: true });
    }

    if (!fs.existsSync(this.appsDirectory)) {
      fs.mkdirSync(this.appsDirectory, { recursive: true });
    }

    // 初始化时扫描已存在的应用
    this.scanExistingApps();
    this.buildIdeaKeyIndex();

    // 初始化多会话管理器
    this.sessionManager = new SessionManager(config);

    // 初始化自动迭代器（赛博牛马）
    this.autoIterator = new AutoIterator(config, this);
    this.cleanupStagingRoot();
  }

  getIFlowPort() {
    const url = this.config?.iflow?.url;
    if (typeof url !== 'string' || !url) {
      return this.config?.iflow?.processStartPort || 8090;
    }
    const m = url.match(/:(\d+)\//);
    if (m) return parseInt(m[1], 10);
    return this.config?.iflow?.processStartPort || 8090;
  }

  makePendingId(ideaKey) {
    const s = String(ideaKey || '');
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return `pending_${(h >>> 0).toString(16)}`;
  }

  inferPendingName(text) {
    const raw = String(text || '').trim();
    if (!raw) return '新应用';
    const oneLine = raw.replace(/\s+/g, ' ').trim();
    return oneLine.length > 14 ? `${oneLine.slice(0, 14)}…` : oneLine;
  }

  upsertPendingApp({ ideaKey, ideaText, taskId }) {
    if (!ideaKey) return null;
    if (this.ideaKeyToAppId.has(ideaKey)) return null;

    const existing = this.pendingApps.get(ideaKey);
    if (existing) {
      existing.lastTaskId = taskId || existing.lastTaskId;
      existing.lastIdeaText = typeof ideaText === 'string' ? ideaText : existing.lastIdeaText;
      if (!existing.name && ideaText) existing.name = this.inferPendingName(ideaText);
      existing.updatedAt = new Date().toISOString();
      return existing;
    }

    const now = new Date().toISOString();
    const placeholder = {
      id: this.makePendingId(ideaKey),
      name: this.inferPendingName(ideaText),
      type: 'pending',
      status: 'creating',
      port: null,
      startTime: null,
      createdAt: now,
      lastOutputAt: null,
      ideaKey,
      ideaHistory: [{ revision: null, timestamp: now, text: String(ideaText || '') }],
      lastTaskId: taskId || null,
      lastIdeaText: String(ideaText || ''),
      path: null
    };

    this.pendingApps.set(ideaKey, placeholder);
    return placeholder;
  }

  clearPendingApp(ideaKey) {
    if (!ideaKey) return;
    this.pendingApps.delete(ideaKey);
  }

  isPortOpen(port, timeoutMs = 800) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        try { socket.destroy(); } catch { }
        resolve(ok);
      };

      socket.setTimeout(timeoutMs);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));
      socket.connect(port, '127.0.0.1');
    });
  }

  async ensureIFlowRunning() {
    const iflowCfg = this.config?.iflow;
    if (!iflowCfg?.autoStartProcess) return;
    if (process.platform !== 'win32') return; // 非 Windows 交给 SDK 自己处理

    const port = this.getIFlowPort();
    const already = await this.isPortOpen(port);
    if (already) return;

    logger.info('检测到 iFlow ACP 未运行，尝试启动 iflow CLI', { port });

    // 用 cmd.exe 启动，避免 Windows 下直接 spawn 可执行文件解析失败
    const args = ['/c', 'iflow', '--experimental-acp', '--port', String(port)];
    const child = spawn('cmd', args, {
      stdio: 'pipe',
      windowsHide: true
    });

    this.iflowProcess = child;

    child.stdout.on('data', (d) => logger.info('iflow stdout', { output: d.toString().trim() }));
    child.stderr.on('data', (d) => logger.warn('iflow stderr', { output: d.toString().trim() }));
    child.on('close', (code) => {
      logger.warn('iflow 进程退出', { code });
      if (this.iflowProcess === child) this.iflowProcess = null;
    });

    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      if (await this.isPortOpen(port, 500)) return;
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, 300));
    }

    throw new Error(`启动 iflow CLI 超时（端口 ${port} 未就绪）。请确认已安装 iflow，并可运行: iflow --version`);
  }

  isIgnoredAppDirName(name) {
    return !name || name.startsWith('.') || name === 'node_modules';
  }

  readJsonFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (error) {
      logger.warn('读取 JSON 文件失败', { filePath, error: error.message });
      return null;
    }
  }

  writeJsonFile(filePath, data) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch (error) {
      logger.error('写入 JSON 文件失败', { filePath, error: error.message });
      return false;
    }
  }

  ensureServerUsesEnvPort(appDir) {
    const serverPath = path.join(appDir, 'server.js');
    if (!fs.existsSync(serverPath)) return;

    try {
      const content = fs.readFileSync(serverPath, 'utf-8');
      let next = content;

      // Pattern A: const PORT = 3001;
      next = next.replace(
        /const\s+PORT\s*=\s*(\d+)\s*;/,
        "const PORT = parseInt(process.env.PORT || '$1', 10);"
      );

      // Pattern B: app.listen(3001, ...) or server.listen(3001, ...)
      if (next === content && !/process\.env\.PORT/.test(next)) {
        const m = next.match(/\b(app|server)\.listen\(\s*(\d+)\s*(,|\))/);
        if (m) {
          const port = m[2];
          if (!/\bconst\s+PORT\b/.test(next)) {
            const insertAfter = next.match(/^\s*const\s+(app|server)\s*=.*$/m) || next.match(/^\s*const\s+express\s*=.*$/m);
            if (insertAfter && insertAfter.index != null) {
              const idx = insertAfter.index + insertAfter[0].length;
              next = `${next.slice(0, idx)}\nconst PORT = parseInt(process.env.PORT || '${port}', 10);\n${next.slice(idx)}`;
            } else {
              next = `const PORT = parseInt(process.env.PORT || '${port}', 10);\n${next}`;
            }
          }
          next = next.replace(/\b(app|server)\.listen\(\s*\d+\s*(,|\))/g, `$1.listen(PORT$2`);
        }
      }

      if (next !== content) fs.writeFileSync(serverPath, next, 'utf-8');
    } catch (error) {
      // ✅ 改进：记录警告日志
      logger.warn('修改 server.js 端口配置失败（非致命）', {
        appDir,
        error: error.message
      });
    }
  }

  async findFreeAppPort(preferredPort) {
    const start = Number.isInteger(preferredPort) ? preferredPort : this.portRange.min;
    for (let port = start; port <= this.portRange.max; port++) {
      if (this.usedPorts.has(port)) continue;
      // eslint-disable-next-line no-await-in-loop
      const open = await this.isPortOpen(port, 250);
      if (!open) {
        this.usedPorts.add(port);
        return port;
      }
    }

    // fallback: search from min if preferred was high and range is fragmented
    for (let port = this.portRange.min; port < start; port++) {
      if (this.usedPorts.has(port)) continue;
      // eslint-disable-next-line no-await-in-loop
      const open = await this.isPortOpen(port, 250);
      if (!open) {
        this.usedPorts.add(port);
        return port;
      }
    }

    throw new Error('没有可用端口（3001-3999）。请关闭占用的进程或调整端口范围。');
  }

  buildIdeaKeyIndex() {
    if (!fs.existsSync(this.appsDirectory)) {
      return;
    }

    const appDirs = fs.readdirSync(this.appsDirectory);
    appDirs.forEach(appId => {
      if (this.isIgnoredAppDirName(appId)) {
        return;
      }
      const appDir = path.join(this.appsDirectory, appId);
      const metadataPath = path.join(appDir, 'metadata.json');
      const metadata = this.readJsonFile(metadataPath);
      if (metadata && typeof metadata.ideaKey === 'string' && metadata.ideaKey) {
        this.ideaKeyToAppId.set(metadata.ideaKey, appId);
      }
    });
  }

  getStagingRoot() {
    return path.join(this.appsDirectory, '.staging');
  }

  ensureStagingRoot() {
    const root = this.getStagingRoot();
    if (!fs.existsSync(root)) {
      fs.mkdirSync(root, { recursive: true });
    }
    return root;
  }

  cleanupStagingRoot() {
    const root = this.getStagingRoot();
    if (!fs.existsSync(root)) return;
    try {
      const entries = fs.readdirSync(root);
      for (const name of entries) {
        const p = path.join(root, name);
        try {
          fs.rmSync(p, { recursive: true, force: true });
        } catch (error) {
          logger.warn('清理 staging 目录失败（已跳过）', {
            path: p,
            error: error.message
          });
        }
      }
      logger.info('staging 目录清理完成', { root, cleaned: entries.length });
    } catch (error) {
      logger.warn('清理 staging 根目录失败（非致命）', {
        root,
        error: error.message
      });
    }
  }

  createStagingDir(appId) {
    const root = this.ensureStagingRoot();
    const dirName = `${appId}`;
    const stagingDir = path.join(root, dirName);
    // 复用同一 staging 目录：避免 .staging 持续堆积；若上次异常遗留则直接清理
    try {
      if (fs.existsSync(stagingDir)) {
        logger.info('清理旧的 staging 目录', { stagingDir });
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }
    } catch (error) {
      logger.warn('清理旧 staging 目录失败', {
        stagingDir,
        error: error.message
      });
      // 如果清理失败，尝试使用带时间戳的目录名避免冲突
      const fallbackDir = path.join(root, `${appId}_${Date.now()}`);
      logger.info('使用备用 staging 目录', { fallbackDir });
      return this.createStagingDirInternal(fallbackDir);
    }
    return this.createStagingDirInternal(stagingDir);
  }

  createStagingDirInternal(stagingDir) {
    fs.mkdirSync(stagingDir, { recursive: true });
    fs.mkdirSync(path.join(stagingDir, 'public'), { recursive: true });
    return stagingDir;
  }

  validateAppDir(appDir) {
    const required = [
      path.join(appDir, 'package.json'),
      path.join(appDir, 'server.js'),
      path.join(appDir, 'public', 'index.html'),
      path.join(appDir, 'public', 'style.css'),
      path.join(appDir, 'public', 'app.js')
    ];
    const missing = required.filter(p => !fs.existsSync(p));
    return { ok: missing.length === 0, missing };
  }

  sleepSync(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return;
    try {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, n);
    } catch { }
  }

  renameSyncWithRetry(fromDir, toDir, { retries = 10, baseDelayMs = 80 } = {}) {
    const retryable = new Set(['EBUSY', 'EPERM', 'EACCES', 'ENOTEMPTY']);
    let lastErr = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        fs.renameSync(fromDir, toDir);
        return;
      } catch (e) {
        lastErr = e;
        const code = e && e.code ? String(e.code) : '';
        if (!retryable.has(code) || attempt >= retries) break;
        const delay = baseDelayMs * Math.min(25, Math.pow(1.35, attempt));
        this.sleepSync(delay);
      }
    }

    throw lastErr || new Error(`rename failed: ${fromDir} -> ${toDir}`);
  }

  safeRenameDir(fromDir, toDir) {
    if (fs.existsSync(toDir)) {
      throw new Error(`目标目录已存在，无法重命名覆盖: ${toDir}`);
    }
    this.renameSyncWithRetry(fromDir, toDir);
  }

  replaceDirAtomic(stagingDir, finalDir) {
    if (!fs.existsSync(finalDir)) {
      this.safeRenameDir(stagingDir, finalDir);
      return;
    }

    const backupDir = `${finalDir}.bak_${Date.now()}`;
    logger.info('原子替换目录', { stagingDir, finalDir, backupDir });

    try {
      // 步骤1：重命名旧目录为备份
      this.renameSyncWithRetry(finalDir, backupDir);
      logger.debug('备份旧目录成功', { finalDir, backupDir });

      // 步骤2：重命名新目录到最终位置
      this.renameSyncWithRetry(stagingDir, finalDir);
      logger.debug('新目录就位成功', { stagingDir, finalDir });

      // 步骤3：删除备份
      fs.rmSync(backupDir, { recursive: true, force: true });
      logger.info('原子替换完成，备份已清理', { finalDir });
    } catch (error) {
      logger.error('原子替换失败，尝试回滚', {
        error: error.message,
        code: error.code,
        finalDir,
        backupDir,
        stagingDirExists: fs.existsSync(stagingDir),
        finalDirExists: fs.existsSync(finalDir),
        backupDirExists: fs.existsSync(backupDir)
      });

      // ✅ 改进：智能回滚逻辑
      try {
        // 清理可能部分创建的 finalDir
        if (fs.existsSync(finalDir)) {
          try {
            fs.rmSync(finalDir, { recursive: true, force: true });
            logger.debug('清理失败的新目录', { finalDir });
          } catch (cleanupError) {
            logger.warn('清理失败目录时出错', {
              finalDir,
              error: cleanupError.message
            });
          }
        }

        // 尝试从 backupDir 恢复（如果存在）
        if (fs.existsSync(backupDir)) {
          this.renameSyncWithRetry(backupDir, finalDir);
          logger.info('回滚成功，从备份恢复原目录', { backupDir, finalDir });
        } else {
          // backupDir 不存在 → 步骤1失败（EPERM等）→ finalDir 可能仍存在或已部分损坏
          logger.warn('备份目录不存在，检查原目录状态', { backupDir });

          if (!fs.existsSync(finalDir)) {
            // 原目录也不见了（罕见但可能发生）→ 尝试从 staging 恢复
            if (fs.existsSync(stagingDir)) {
              logger.warn('原目录丢失，尝试从 staging 恢复', { stagingDir, finalDir });
              this.renameSyncWithRetry(stagingDir, finalDir);
              logger.info('紧急恢复成功，从 staging 恢复目录', { stagingDir, finalDir });
            } else {
              logger.error('原目录和 staging 都不存在，数据损坏！', { finalDir, stagingDir });
              throw new Error(`数据损坏：${finalDir} 和 ${stagingDir} 都不存在`);
            }
          } else {
            // 原目录还在 → EPERM 导致无法备份 → 保留 staging 以便用户手动恢复
            logger.warn('原目录保持不变（EPERM），staging 目录已保留', {
              finalDir,
              stagingDir,
              hint: '可手动检查 staging 目录并决定是否覆盖'
            });
          }
        }
      } catch (rollbackError) {
        logger.error('回滚失败！', {
          backupDir,
          finalDir,
          stagingDir,
          error: rollbackError.message,
          stagingDirExists: fs.existsSync(stagingDir),
          finalDirExists: fs.existsSync(finalDir),
          backupDirExists: fs.existsSync(backupDir)
        });
      }

      throw error;
    }
  }

  // 扫描已存在的应用
  scanExistingApps() {
    if (fs.existsSync(this.appsDirectory)) {
      const appDirs = fs.readdirSync(this.appsDirectory);
      appDirs.forEach(appId => {
        if (this.isIgnoredAppDirName(appId)) {
          return;
        }
        const appDir = path.join(this.appsDirectory, appId);
        const packageJsonPath = path.join(appDir, 'package.json');

        if (fs.existsSync(packageJsonPath)) {
          try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            if (packageJson.port) {
              this.usedPorts.add(packageJson.port);
            }
          } catch (error) {
            // 忽略解析错误
          }
        }
      });
    }
  }

  // 获取可用端口
  getAvailablePort() {
    for (let port = this.portRange.min; port <= this.portRange.max; port++) {
      if (!this.usedPorts.has(port)) {
        this.usedPorts.add(port);
        return port;
      }
    }
    throw new Error('没有可用的端口');
  }

  // 释放端口
  releasePort(port) {
    this.usedPorts.delete(port);
  }

  async executeTask(task) {
    const taskId = task.id;
    const idea = task.idea;

    logger.info(`开始执行 iFlow 任务`, { taskId, idea: idea.content });

    try {
      const result = await this.calliFlow(idea, taskId);
      logger.info(`iFlow 任务执行成功`, { taskId });

      const appId = result.appId;
      const appMetadata = appId
        ? this.readJsonFile(path.join(this.appsDirectory, appId, 'metadata.json'))
        : null;

      return {
        success: true,
        output: result.logs, // Changed to logs
        outputFile: null, // Removed outputFile
        app: appId ? { id: appId, port: appMetadata ? appMetadata.port : null } : null,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`iFlow 任务执行失败`, { taskId, error: error.message });

      const appId = idea && typeof idea.ideaKey === 'string' && idea.ideaKey
        ? this.ideaKeyToAppId.get(idea.ideaKey)
        : null;
      const appMetadata = appId
        ? this.readJsonFile(path.join(this.appsDirectory, appId, 'metadata.json'))
        : null;

      return {
        success: false,
        error: error.message,
        app: appId ? { id: appId, port: appMetadata ? appMetadata.port : null } : null,
        timestamp: new Date().toISOString()
      };
    }
  }

  async calliFlow(idea, taskId) {
    return new Promise((resolve, reject) => {
      // const outputFile = path.join(this.outputDirectory, `${taskId}_result.md`); // Removed outputFile

      logger.info(`开始生成代码解决方案（iFlow CLI）`, { taskId, idea: idea.content });

      (async () => {
        let prep = null;
        let restartAfterIteration = false;
        let session = null; // Declare session here
        let appIdForSession = null; // Declare appIdForSession here
        try {
          if (idea && typeof idea.ideaKey === 'string' && idea.ideaKey) {
            this.upsertPendingApp({ ideaKey: idea.ideaKey, ideaText: idea.content, taskId });
          }

          if (!this.config?.iflow) {
            throw new Error('缺少 config.iflow 配置，无法启用 iFlow CLI 真实迭代');
          }
          if (this.config.iflow.enabled !== true) {
            throw new Error('当前已移除模板兜底，请将 config.json 的 iflow.enabled 设为 true');
          }

          // 使用 SessionManager 获取会话（多会话模式）
          // 如果 SessionManager 可用，获取独立会话；否则回退到 ensureIFlowRunning
          if (this.sessionManager) {
            appIdForSession = idea && typeof idea.ideaKey === 'string' ? this.ideaKeyToAppId.get(idea.ideaKey) || `temp_${taskId}` : `temp_${taskId}`;
            session = await this.sessionManager.getOrCreateSession(appIdForSession);
            logger.info('已获取 iFlow 会话', { appId: appIdForSession, port: session.port });
          } else {
            // ✅ 仅在首次调用时启动 iFlow CLI 进程
            // 后续任务会复用同一个进程和连接
            await this.ensureIFlowRunning();
          }

          // 若该 ideaKey 对应应用正在运行，则先停止（避免 Windows 文件锁/端口冲突），迭代完成后再自动重启
          if (idea && typeof idea.ideaKey === 'string' && idea.ideaKey) {
            const existingAppId = this.ideaKeyToAppId.get(idea.ideaKey);
            if (existingAppId && this.activeApps.has(existingAppId)) {
              try {
                await this.stopApp(existingAppId);
                restartAfterIteration = true;
              } catch (e) {
                // stop 失败也不阻塞：后续会在提交阶段再次防护
                logger.warn('停止运行中的应用失败，将继续尝试迭代', { appId: existingAppId, error: e.message });
              }
            }
          }

          // 传入会话的 WebSocket URL（如果使用多会话模式）
          const wsUrl = session ? session.getWsUrl() : undefined;

          prep = this.prepareAppForIFlow(idea);
          const prompt = this.buildIFlowPrompt(prep.promptContext);

          // 📢 发送提示词到前端流，以便溯源
          const promptLog = `🎯 [本次迭代目标]\n${prompt}\n\n========================\n`;
          this.emit('taskStream', {
            taskId,
            ideaKey: idea && typeof idea.ideaKey === 'string' ? idea.ideaKey : null,
            appId: prep ? prep.appId : null,
            sessionPort: session ? session.port : null,
            type: 'log', // 使用 log 类型，使其包含在 liveByTaskId 中
            text: promptLog
          });

          // 收集日志以便持久化
          const accumulatedLogs = [promptLog];

          const { text, summary } = await runIFlowIteration({
            prompt,
            appDir: prep.stagingDir,
            config: this.config.iflow || {},
            taskId,
            wsUrl, // 多会话模式下使用指定的 WebSocket URL
            onEvent: (evt) => {
              if (!evt) return;

              // 收集文本日志
              if (evt.type === 'log' || evt.type === 'status') {
                accumulatedLogs.push(evt.text ? evt.text + '\n' : '');
              }

              this.emit('taskStream', {
                taskId,
                ideaKey: idea && typeof idea.ideaKey === 'string' ? idea.ideaKey : null,
                appId: prep ? prep.appId : null,
                sessionPort: session ? session.port : null, // 增加会话端口信息
                ...evt
              });
            }
          });

          const validation = this.validateAppDir(prep.stagingDir);
          if (!validation.ok) {
            throw new Error(`iFlow 生成未通过校验，缺少文件: ${validation.missing.join(', ')}`);
          }

          // 避免在应用运行时替换目录（Windows 常见文件锁）
          if (this.activeApps.has(prep.appId)) {
            try {
              await this.stopApp(prep.appId);
              restartAfterIteration = true;
            } catch (e) {
              throw new Error(`应用正在运行中且停止失败，无法提交迭代结果: ${prep.appId}（${e.message}）`);
            }
          }

          // ✅ 改进：等待文件句柄释放（Windows 特定）
          if (restartAfterIteration) {
            logger.debug('等待 Windows 释放文件句柄', { appId: prep.appId });
            await new Promise(r => setTimeout(r, 500));
          }

          // 通过校验后再落盘到最终目录（失败则不产生"已生成应用"）
          this.replaceDirAtomic(prep.stagingDir, prep.finalDir);
          this.ideaKeyToAppId.set(prep.ideaKey, prep.appId);
          this.clearPendingApp(prep.ideaKey);

          const result = {
            stdout: (text || '(iFlow 未返回可见文本，可能主要通过工具调用修改文件)') +
              `\n\n---\niFlow Summary: toolCalls=${summary.toolCalls.length}, errors=${summary.errors.length}, plans=${summary.plans.length}`,
            stderr: '',
            exitCode: 0,
            outputFile
          };

          this.saveOutput(outputFile, result.stdout, idea);

          // 迭代完成后按需自动重启应用（不影响主流程）
          if (restartAfterIteration) {
            this.startApp(prep.appId).catch((e) => {
              logger.warn('自动重启应用失败', { appId: prep.appId, error: e.message });
            });
          }
          resolve(result);
          // 释放会话（多会话模式）
          if (session && this.sessionManager) {
            this.sessionManager.releaseSession(appIdForSession);
            logger.info('已释放 iFlow 会话', { appId: appIdForSession, port: session.port });
          }
        } catch (error) {
          try { logIFlowFailureHint(error); } catch (hintError) {
            logger.warn('记录 iFlow 失败提示时出错', { error: hintError.message });
          }

          try {
            if (idea && typeof idea.ideaKey === 'string' && idea.ideaKey) {
              this.clearPendingApp(idea.ideaKey);
            }
          } catch (clearError) {
            logger.warn('清理 pending app 时出错', { error: clearError.message });
          }

          // 清理 staging（避免生成失败也出现在 apps 列表）
          try {
            if (prep && prep.stagingDir && fs.existsSync(prep.stagingDir)) {
              logger.info('清理失败任务的 staging 目录', { stagingDir: prep.stagingDir });
              fs.rmSync(prep.stagingDir, { recursive: true, force: true });
            }
          } catch (rmError) {
            logger.warn('清理 staging 目录失败（非致命）', {
              stagingDir: prep?.stagingDir,
              error: rmError.message
            });
          }

          logger.error(`生成代码失败`, { taskId, error: error.message });

          // 释放会话（多会话模式）
          if (session && this.sessionManager) {
            try {
              this.sessionManager.releaseSession(appIdForSession);
              logger.info('已释放 iFlow 会话（失败后）', { appId: appIdForSession, port: session.port });
            } catch { }
          }

          reject(new Error(`生成代码失败: ${error.message}`));
        }
      })();

      // 超时由 runIFlowIteration 内部的 overallTimeout/idleTimeout 统一控制，避免外层提前 reject 导致内部仍在运行、Web 卡住和 .staging 残留。
    });
  }

  prepareAppForIFlow(idea) {
    const ideaText = idea.content || '';
    const ideaKey = idea.ideaKey;

    if (typeof ideaKey !== 'string' || !ideaKey) {
      throw new Error('缺少 ideaKey：仅支持通过 ideas/*.txt 文件驱动的持续迭代');
    }

    const existingAppId = this.ideaKeyToAppId.get(ideaKey);
    const appId = existingAppId || `app_${Date.now()}`;
    const finalDir = path.join(this.appsDirectory, appId);

    const previousMetadata = existingAppId ? this.readJsonFile(path.join(finalDir, 'metadata.json')) : null;
    const port = previousMetadata?.port || this.getAvailablePort();
    this.usedPorts.add(port);

    const stagingDir = this.createStagingDir(appId);
    if (existingAppId) {
      // 复制已有应用到 staging，确保失败不会污染最终目录
      const ignoredTop = new Set(['node_modules', '.git', '.staging', 'uploads', 'output']);
      fs.cpSync(finalDir, stagingDir, {
        recursive: true,
        filter: (src) => {
          try {
            const rel = path.relative(finalDir, src);
            if (!rel) return true;
            const top = rel.split(path.sep)[0];
            if (ignoredTop.has(top)) return false;
            if (top.includes('.bak_') || top.endsWith('.bak')) return false;
            return true;
          } catch (error) {
            logger.warn('复制文件过滤时出错', { src, error: error.message });
            return true;
          }
        }
      });
    }

    const previousHistory = previousMetadata && Array.isArray(previousMetadata.ideaHistory) ? previousMetadata.ideaHistory : [];
    const historyEntry = {
      revision: idea.revision || null,
      timestamp: new Date().toISOString(),
      text: ideaText
    };

    const nextHistory = [...previousHistory, historyEntry].slice(-20);
    const lastOutputPreview = previousMetadata && typeof previousMetadata.lastOutputPreview === 'string'
      ? previousMetadata.lastOutputPreview
      : '';

    const combinedIdeaText = [
      ...nextHistory.map(h => h.text).filter(Boolean),
      lastOutputPreview ? `\n[上次输出摘要]\n${lastOutputPreview}` : ''
    ].join('\n');

    let appType = previousMetadata?.type || 'default';
    let appName = previousMetadata?.name || '未命名应用';

    const metadataOverrides = {
      ideaKey,
      ideaHistory: nextHistory,
      lastRevision: idea.revision || null,
      lastPreparedAt: new Date().toISOString()
    };

    const isNewApp = !previousMetadata;
    // staging 中更新元数据（最终提交后即生效）
    const metadataPath = path.join(stagingDir, 'metadata.json');
    const current = this.readJsonFile(metadataPath) || {};
    const nextMetadata = {
      ...current,
      id: appId,
      name: appName,
      type: appType,
      port,
      status: current.status || 'stopped',
      createdAt: current.createdAt || new Date().toISOString(),
      ...metadataOverrides
    };
    fs.writeFileSync(metadataPath, JSON.stringify(nextMetadata, null, 2));

    return {
      ideaKey,
      appId,
      port,
      stagingDir,
      finalDir,
      promptContext: { appId, appDir: stagingDir, port, appType, appName, combinedIdeaText, isNewApp }
    };
  }

  buildIFlowPrompt({ appId, appDir, port, appType, appName, combinedIdeaText, isNewApp }) {
    return [
      '【角色】',
      '你是资深全栈工程师 + 严谨的代码审查者。目标是把需求落实为可运行的 Node.js(>=22) + Express Web 应用，并持续迭代。',
      '',
      '【工作目录与边界】',
      `- 唯一允许读写的目录：${appDir}`,
      `- 严禁在 ${appDir} 之外创建/修改任何文件或目录`,
      `- 严禁创建新的“应用目录/项目根目录”；只能在 ${appDir} 内工作`,
      '- 不要生成无关文档/日志文件（README、设计文档、report、log 等），除非需求明确要求',
      '',
      '【固定约束（必须遵守）】',
      `- 服务端口必须保持为 ${port}（server.js 监听端口/配置不得改成别的）`,
      isNewApp
        ? '- 首次生成：当前目录只有 metadata.json（以及空的 public/），你需要在该目录内创建完整可运行的应用文件'
        : '- 增量迭代：请在现有实现基础上小步修改，避免推倒重来',
      '- 首次生成必须确保这些文件存在且可用：',
      `  - ${appDir}${path.sep}package.json（包含可用的 start 脚本：node server.js）`,
      `  - ${appDir}${path.sep}server.js（Express 服务，监听 ${port}，静态托管 public/，至少提供健康检查路由）`,
      `  - ${appDir}${path.sep}public${path.sep}index.html`,
      `  - ${appDir}${path.sep}public${path.sep}style.css`,
      `  - ${appDir}${path.sep}public${path.sep}app.js`,
      '- 依赖最小化：能不用新依赖就不用；若必须新增依赖，必须写入 package.json 并保证 npm install 后可运行',
      '- 应用命名：请根据本轮需求为应用起一个简洁的中文名，并写入 metadata.json 的 name 字段；必要时同步更新 type 字段（例如 calculator/dashboard/...），避免泛化名称',
      '',
      '【输入：需求（按时间顺序汇总）】',
      combinedIdeaText,
      '',
      '【你要做的事（强制工作流）】',
      '1) 先给出一个 3-7 条的“执行计划”（粒度到文件/功能点），再开始改',
      `2) 在 ${appDir} 内创建/修改必要文件以实现需求（首次生成=从零搭起；迭代=小步修改）`,
      '3) 做最小自检：确保服务可启动、核心页面可访问、无明显运行时错误',
      '4) 最终输出必须包含：',
      '   - 本次计划（已完成项）',
      '   - 变更文件列表（逐文件一句话说明）',
      `   - 如何运行/验证（命令 + 访问地址 http://localhost:${port}）`,
      '   - 若有取舍/假设：明确列出',
      '',
      '【重要策略（减少来回问答，提升一次成功率）】',
      '- 遇到不明确需求：不要停下来问；做合理默认实现，并在“假设”中写明',
      `- 工具调用尽量合并、少而关键；写文件时确保路径在 ${appDir} 内且内容完整`,
      '',
      `【应用信息】${appName}/${appType}（appId=${appId}）`
    ].join('\n');
  }

  getOrCreateAppForIdeaKey(ideaKey) {
    const existingAppId = this.ideaKeyToAppId.get(ideaKey);
    if (existingAppId) {
      const appDir = path.join(this.appsDirectory, existingAppId);
      const metadataPath = path.join(appDir, 'metadata.json');
      const metadata = this.readJsonFile(metadataPath);
      const port = metadata && metadata.port ? metadata.port : null;

      if (fs.existsSync(appDir)) {
        if (port) {
          this.usedPorts.add(port);
        }
        return { appId: existingAppId, appDir, port, metadata };
      }

      this.ideaKeyToAppId.delete(ideaKey);
    }

    const appId = `app_${Date.now()}`;
    const appDir = path.join(this.appsDirectory, appId);
    const port = this.getAvailablePort();
    fs.mkdirSync(appDir, { recursive: true });
    fs.mkdirSync(path.join(appDir, 'public'), { recursive: true });

    this.ideaKeyToAppId.set(ideaKey, appId);
    return { appId, appDir, port, metadata: null };
  }

  generateSolution(idea) {
    const ideaText = idea.content || '';
    const ideaKey = idea.ideaKey;

    let appId = `app_${Date.now()}`;
    let appDir = path.join(this.appsDirectory, appId);
    let port = null;
    let previousMetadata = null;

    if (typeof ideaKey === 'string' && ideaKey) {
      const appInfo = this.getOrCreateAppForIdeaKey(ideaKey);
      appId = appInfo.appId;
      appDir = appInfo.appDir;
      port = appInfo.port;
      previousMetadata = appInfo.metadata;
    }

    if (!port) {
      port = this.getAvailablePort();
      this.usedPorts.add(port);
    }

    // 确定应用类型和名称
    let appType = 'default';
    let appName = '通用工具';

    const previousHistory = previousMetadata && Array.isArray(previousMetadata.ideaHistory) ? previousMetadata.ideaHistory : [];
    const historyEntry = {
      revision: idea.revision || null,
      timestamp: new Date().toISOString(),
      text: ideaText
    };

    const nextHistory = [...previousHistory, historyEntry].slice(-20);
    const lastOutputPreview = previousMetadata && typeof previousMetadata.lastOutputPreview === 'string'
      ? previousMetadata.lastOutputPreview
      : '';

    const combinedIdeaText = [
      ...nextHistory.map(h => h.text).filter(Boolean),
      lastOutputPreview ? `\n[上次输出摘要]\n${lastOutputPreview}` : ''
    ].join('\n');

    const content = combinedIdeaText.toLowerCase();

    if (content.includes('格式化') || content.includes('format')) {
      appType = 'formatter';
      appName = '代码格式化工具';
    } else if (content.includes('数据库') || content.includes('database') || content.includes('查询')) {
      appType = 'database';
      appName = 'SQL 查询优化器';
    } else if (content.includes('可视化') || content.includes('仪表板') || content.includes('dashboard')) {
      appType = 'dashboard';
      appName = '数据可视化仪表板';
    } else if (content.includes('移动端') || content.includes('mobile') || content.includes('响应')) {
      appType = 'mobile';
      appName = '图片优化器';
    } else if (content.includes('暗黑') || content.includes('dark') || content.includes('主题')) {
      appType = 'darkmode';
      appName = '主题切换器';
    } else if (content.includes('测试') || content.includes('test')) {
      appType = 'test';
      appName = '单元测试运行器';
    } else if (content.includes('登录') || content.includes('login') || content.includes('认证')) {
      appType = 'login';
      appName = '用户登录系统';
    }

    // 生成应用文件
    this.generateAppFiles(appDir, port, combinedIdeaText, appType, appName, {
      ideaKey,
      ideaHistory: nextHistory,
      lastRevision: idea.revision || null
    });

    return this.getAppSolution(appId, port, combinedIdeaText, appName, appType);
  }

  getFormatterSolution() {
    return `# 自动化代码格式化工具

## 问题分析
当前项目中缺少统一的代码格式化标准，导致代码风格不一致，影响可读性和维护性。

## 解决方案设计
使用 ESLint + Prettier 组合实现自动化代码格式化。

## 代码实现

### 1. 安装依赖
\`\`\`bash
npm install --save-dev eslint prettier eslint-config-prettier eslint-plugin-prettier
\`\`\`

### 2. 配置 ESLint (.eslintrc.json)
\`\`\`json
{
  "extends": ["eslint:recommended", "prettier"],
  "plugins": ["prettier"],
  "rules": {
    "prettier/prettier": "error",
    "no-unused-vars": "warn",
    "no-console": "warn"
  }
}
\`\`\`

### 3. 配置 Prettier (.prettierrc)
\`\`\`json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2
}
\`\`\`

## 使用说明
1. 运行 \`npm run format\` 格式化所有代码
2. 运行 \`npm run lint\` 检查代码质量
3. 运行 \`npm run lint:fix\` 自动修复问题

## 测试建议
- 测试不同文件类型的格式化效果
- 验证 ESLint 规则是否生效
- 检查格式化后的代码是否符合团队规范`;
  }

  getDatabaseSolution() {
    return `# 数据库查询性能优化方案

## 问题分析
数据库查询响应慢，影响系统性能和用户体验。

## 解决方案设计
通过索引优化、查询重构和缓存策略提升性能。

## 代码实现

### 1. 添加索引
\`\`\`sql
CREATE INDEX idx_user_email ON users(email);
CREATE INDEX idx_order_date ON orders(created_at);
\`\`\`

### 2. 查询优化
\`\`\`javascript
// 使用 JOIN 替代 N+1 查询
async function getUsersWithOrders() {
  const results = await db.query(\`
    SELECT u.*, JSON_ARRAYAGG(
      JSON_OBJECT('id', o.id, 'total', o.total)
    ) as orders
    FROM users u
    LEFT JOIN orders o ON u.id = o.user_id
    GROUP BY u.id
  \`);
  return results;
}
\`\`\`

## 使用说明
1. 分析慢查询日志，识别性能瓶颈
2. 为常用查询字段添加适当的索引
3. 使用 JOIN 替代 N+1 查询`;
  }

  getVisualizationSolution() {
    return `# 实时数据可视化仪表板

## 问题分析
需要实时展示系统关键指标，帮助决策和监控。

## 解决方案设计
使用 WebSocket 实现实时数据推送，Chart.js 进行可视化展示。

## 代码实现

### 1. 后端 WebSocket 服务
\`\`\`javascript
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8081 });

function generateMetrics() {
  return {
    timestamp: Date.now(),
    users: Math.floor(Math.random() * 1000) + 500,
    requests: Math.floor(Math.random() * 10000) + 5000
  };
}

setInterval(() => {
  const metrics = generateMetrics();
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(metrics));
    }
  });
}, 1000);
\`\`\`

## 使用说明
1. 启动 WebSocket 服务器: \`node server.js\`
2. 在浏览器中打开 dashboard.html
3. 数据会自动实时更新`;
  }

  getMobileSolution() {
    return `# 移动端响应速度优化方案

## 问题分析
移动端页面加载慢，交互响应迟钝，影响用户体验。

## 解决方案设计
通过资源优化、懒加载和性能监控提升移动端性能。

## 代码实现

### 1. 图片优化
\`\`\`javascript
const sharp = require('sharp');

async function optimizeImage(inputPath, outputPath) {
  await sharp(inputPath)
    .resize(800, 600, { fit: 'inside' })
    .jpeg({ quality: 80 })
    .toFile(outputPath);
}
\`\`\`

### 2. 懒加载实现
\`\`\`javascript
const lazyImages = document.querySelectorAll('img[data-src]');

const imageObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target;
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
      observer.unobserve(img);
    }
  });
});

lazyImages.forEach(img => imageObserver.observe(img));
\`\`\`

## 使用说明
1. 压缩和优化所有图片资源
2. 实现图片和组件的懒加载
3. 配置代码分割减少初始加载体积`;
  }

  getDarkModeSolution() {
    return `# 暗黑模式支持方案

## 问题分析
用户希望在低光环境下使用暗黑主题，保护眼睛并节省电量。

## 解决方案设计
使用 CSS 变量实现主题切换，支持系统自动检测和手动切换。

## 代码实现

### 1. CSS 变量定义
\`\`\`css
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --text-primary: #333333;
  --text-secondary: #666666;
  --border-color: #e0e0e0;
  --accent-color: #6C5CE7;
}

[data-theme="dark"] {
  --bg-primary: #1a1a1a;
  --bg-secondary: #2d2d2d;
  --text-primary: #ffffff;
  --text-secondary: #b0b0b0;
  --border-color: #404040;
  --accent-color: #a29bfe;
}

body {
  background-color: var(--bg-primary);
  color: var(--text-primary);
  transition: background-color 0.3s, color 0.3s;
}
\`\`\`

### 2. 主题切换组件
\`\`\`javascript
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
}
\`\`\`

## 使用说明
1. 使用 CSS 变量定义所有颜色值
2. 实现主题切换组件
3. 支持系统主题自动检测
4. 保存用户偏好到 localStorage`;
  }

  getTestSolution() {
    return `# 单元测试实施方案

## 问题分析
项目缺乏足够的单元测试，代码质量无法保证。

## 解决方案设计
使用 Jest 测试框架，搭建完整的测试体系。

## 代码实现

### 1. 安装依赖
\`\`\`bash
npm install --save-dev jest @types/jest ts-jest @testing-library/react @testing-library/jest-dom
\`\`\`

### 2. Jest 配置
\`\`\`javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/tests/**'
  ]
};
\`\`\`

### 3. 单元测试示例
\`\`\`javascript
describe('UserService', () => {
  it('应该返回用户数据', async () => {
    const mockUser = { id: 1, name: 'Test User' };
    mockDb.query.mockResolvedValue([mockUser]);
    
    const result = await userService.getUserById(1);
    expect(result).toEqual(mockUser);
  });
});
\`\`\`

## 使用说明
1. 为每个模块编写单元测试
2. 运行 \`npm test\` 执行测试
3. 使用 \`npm run test:coverage\` 查看覆盖率
4. 在 CI/CD 中集成测试`;
  }

  getLoginSolution() {
    return `# 简化登录流程方案

## 问题分析
当前登录流程复杂，步骤多，用户体验差。

## 解决方案设计
实现一键登录、社交登录和记住密码功能。

## 代码实现

### 1. 一键登录（邮箱验证码）
\`\`\`javascript
async function sendVerificationCode(email) {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  await redis.setex(\`login_code:\${email}\`, 300, code);
  await sendEmail({ to: email, subject: '登录验证码', html: \`验证码: \${code}\` });
  return { success: true };
}

async function loginWithCode(email, code) {
  const savedCode = await redis.get(\`login_code:\${email}\`);
  if (!savedCode || savedCode !== code) {
    throw new Error('验证码错误或已过期');
  }
  
  let user = await db.query('SELECT * FROM users WHERE email = ?', [email]);
  if (user.length === 0) {
    const result = await db.query('INSERT INTO users SET ?', { email });
    user = await db.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
  }
  
  const token = generateToken(user[0]);
  await redis.del(\`login_code:\${email}\`);
  return { token, user: user[0] };
}
\`\`\`

## 使用说明
1. 用户可以选择密码、验证码或社交登录
2. 验证码登录更安全便捷
3. 社交登录一键完成
4. 记住密码功能减少重复登录`;
  }

  getDefaultSolution() {
    return `# 代码解决方案

## 用户需求
根据您的需求，我们需要开发相应的功能模块。

## 解决方案设计
采用模块化设计，确保代码可维护和可扩展。

## 代码实现

### 1. 核心模块
\`\`\`javascript
class SolutionModule {
  constructor(config) {
    this.config = config;
    this.state = {};
  }
  
  async initialize() {
    console.log('初始化模块...');
  }
  
  async execute() {
    console.log('执行任务...');
  }
}
\`\`\`

### 2. 使用示例
\`\`\`javascript
const module = new SolutionModule(config);
await module.initialize();
await module.execute();
\`\`\`

## 使用说明
1. 根据实际需求调整配置
2. 运行主模块执行功能
3. 监控日志输出
4. 处理异常情况`;
  }

  saveOutput(outputFile, content, idea) {
    try {
      let contextBlock = '';
      try {
        // ✅ 修复：先获取 metadata，再使用
        if (idea && typeof idea.ideaKey === 'string' && idea.ideaKey) {
          const appId = this.ideaKeyToAppId.get(idea.ideaKey);
          if (appId) {
            const metadataPath = path.join(this.appsDirectory, appId, 'metadata.json');
            const metadata = this.readJsonFile(metadataPath);

            if (metadata && Array.isArray(metadata.ideaHistory)) {
              const recent = metadata.ideaHistory.slice(-8);
              if (recent.length) {
                const lines = recent.map(h => {
                  const rev = h && h.revision != null ? `rev ${h.revision}` : 'rev ?';
                  const text = (h && typeof h.text === 'string') ? h.text.replace(/\s+/g, ' ').trim() : '';
                  return `- ${rev}: ${text}`;
                }).filter(Boolean);
                if (lines.length) {
                  contextBlock += `\n## 想法历史（最近）\n${lines.join('\n')}\n`;
                }
              }

              const prev = (metadata.lastOutputPreview || '').toString().trim();
              if (prev) {
                contextBlock += `\n## 上轮输出摘要（截断）\n${prev.slice(0, 800)}\n`;
              }
            }
          }
        }
      } catch (ctxError) {
        logger.warn('构建上下文块时出错', { error: ctxError.message });
      }

      const output = `
# iFlow 自动生成代码

## 用户想法
${idea.content}

## 来源
${idea.source}

## ideaKey
${idea.ideaKey || ''}

## revision
${idea.revision || ''}
${contextBlock}

## 生成时间
${new Date().toISOString()}

## 解决方案

${content}

---
*此文件由 iFlow Continuous Development System 自动生成*
`;

      fs.writeFileSync(outputFile, output, 'utf-8');
      logger.info(`输出已保存`, { outputFile });

      if (idea && typeof idea.ideaKey === 'string' && idea.ideaKey) {
        const appId = this.ideaKeyToAppId.get(idea.ideaKey);
        if (appId) {
          const metadataPath = path.join(this.appsDirectory, appId, 'metadata.json');
          const metadata = this.readJsonFile(metadataPath) || {};
          const preview = (content || '').toString().slice(0, 5000);
          const history = Array.isArray(metadata.ideaHistory) ? metadata.ideaHistory : [];
          const nextHistory = history.map(h => ({ ...h }));
          // 尝试把本轮输出绑定到对应 revision 的历史条目上，便于前端显示“上一轮对话”
          const targetRev = idea.revision || null;
          if (nextHistory.length) {
            let idx = -1;
            if (targetRev != null) {
              idx = nextHistory.map(h => h.revision).lastIndexOf(targetRev);
            }
            if (idx === -1) idx = nextHistory.length - 1;
            nextHistory[idx] = {
              ...nextHistory[idx],
              outputFile,
              assistantPreview: preview.slice(0, 1200)
            };
          }
          const nextMetadata = {
            ...metadata,
            ideaHistory: nextHistory,
            lastOutputPreview: preview,
            lastOutputAt: new Date().toISOString()
          };
          fs.writeFileSync(metadataPath, JSON.stringify(nextMetadata, null, 2));
        }
      }
    } catch (error) {
      logger.error(`保存输出失败`, { outputFile, error: error.message });
    }
  }

  getActiveTasks() {
    return Array.from(this.activeProcesses.keys());
  }

  getActiveTaskCount() {
    return this.activeProcesses.size;
  }

  terminateTask(taskId) {
    const process = this.activeProcesses.get(taskId);
    if (process) {
      this.activeProcesses.delete(taskId);
      logger.info(`任务已终止`, { taskId });
      return true;
    }
    return false;
  }

  terminateAllTasks() {
    const taskIds = Array.from(this.activeProcesses.keys());
    taskIds.forEach(taskId => this.terminateTask(taskId));
    logger.info(`所有任务已终止`, { count: taskIds.length });
    return taskIds.length;
  }

  // 生成完整 Web 应用的方法
  generateAppFiles(appDir, port, idea, appType, appName, metadataOverrides = {}) {
    // 生成 package.json
    const packageJson = {
      name: `iflow-app-${appType}`,
      version: '1.0.0',
      description: 'Generated by iFlow',
      main: 'server.js',
      port: port,
      appType: appType,
      appName: appName,
      scripts: {
        start: 'node server.js'
      },
      dependencies: {
        express: '^4.18.2',
        'socket.io': '^4.7.2'
      }
    };
    fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(packageJson, null, 2));

    // 生成 HTML
    const htmlContent = this.getHtmlTemplate(appType, idea);
    fs.writeFileSync(path.join(appDir, 'public/index.html'), htmlContent);

    // 生成 CSS
    const cssContent = this.getCssTemplate(appType);
    fs.writeFileSync(path.join(appDir, 'public/style.css'), cssContent);

    // 生成 JS
    const jsContent = this.getJsTemplate(appType, port);
    fs.writeFileSync(path.join(appDir, 'public/app.js'), jsContent);

    // 生成服务器
    const serverContent = this.getServerTemplate(port, appType);
    fs.writeFileSync(path.join(appDir, 'server.js'), serverContent);

    // 保存应用元数据
    const metadata = {
      id: path.basename(appDir),
      name: appName,
      type: appType,
      port: port,
      idea: idea,
      createdAt: new Date().toISOString(),
      status: 'stopped',
      ...metadataOverrides
    };
    fs.writeFileSync(path.join(appDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
  }

  getHtmlTemplate(appType, idea) {
    const title = this.getAppTitle(appType);
    const content = this.getAppContent(appType);

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="app-container">
        <header>
            <h1>🚀 ${title}</h1>
        </header>
        <main>
            ${content}
        </main>
    </div>
    <script src="app.js"></script>
</body>
</html>`;
  }

  getAppContent(appType) {
    const templates = {
      formatter: `
        <div class="tool-container">
            <div class="input-section">
                <label>输入代码：</label>
                <textarea id="codeInput" placeholder="在此粘贴需要格式化的代码..."></textarea>
            </div>
            <div class="actions">
                <button onclick="formatCode()" class="btn-primary">✨ 格式化代码</button>
                <button onclick="clearCode()" class="btn-secondary">🗑️ 清空</button>
            </div>
            <div class="output-section">
                <label>格式化结果：</label>
                <textarea id="codeOutput" readonly placeholder="格式化后的代码将显示在这里..."></textarea>
            </div>
        </div>
      `,
      dashboard: `
        <div class="dashboard-container">
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value" id="stat1">0</div>
                    <div class="stat-label">活跃用户</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="stat2">0</div>
                    <div class="stat-label">请求数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="stat3">0</div>
                    <div class="stat-label">响应时间</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="stat4">0%</div>
                    <div class="stat-label">成功率</div>
                </div>
            </div>
            <div class="chart-container">
                <h3>📊 实时数据</h3>
                <canvas id="dataChart"></canvas>
            </div>
        </div>
      `,
      darkmode: `
        <div class="theme-switcher">
            <div class="preview-box">
                <h2>主题预览</h2>
                <p>这是示例文本，用于预览主题效果。</p>
                <button class="preview-btn">示例按钮</button>
            </div>
            <div class="theme-selector">
                <button onclick="setTheme('light')" class="theme-btn active" data-theme="light">
                    ☀️ 浅色模式
                </button>
                <button onclick="setTheme('dark')" class="theme-btn" data-theme="dark">
                    🌙 深色模式
                </button>
            </div>
        </div>
      `,
      mobile: `
        <div class="mobile-optimizer">
            <div class="upload-area">
                <label>上传图片进行优化：</label>
                <input type="file" id="imageInput" accept="image/*" onchange="optimizeImage(event)">
            </div>
            <div class="preview-area">
                <div class="image-preview">
                    <h3>原始图片</h3>
                    <div id="originalPreview"></div>
                </div>
                <div class="image-preview">
                    <h3>优化后</h3>
                    <div id="optimizedPreview"></div>
                </div>
            </div>
            <div class="stats" id="imageStats"></div>
        </div>
      `,
      database: `
        <div class="query-optimizer">
            <div class="input-section">
                <label>输入 SQL 查询：</label>
                <textarea id="sqlInput" placeholder="SELECT * FROM users WHERE..."></textarea>
            </div>
            <button onclick="optimizeQuery()" class="btn-primary">⚡ 优化查询</button>
            <div class="output-section">
                <label>优化建议：</label>
                <div id="queryOutput"></div>
            </div>
        </div>
      `,
      test: `
        <div class="test-runner">
            <div class="test-input">
                <label>测试代码：</label>
                <textarea id="testCode" placeholder="function add(a, b) { return a + b; }"></textarea>
            </div>
            <div class="test-input">
                <label>测试用例（JSON）：</label>
                <textarea id="testCases" placeholder='[{"input": [1, 2], "expected": 3}]'></textarea>
            </div>
            <button onclick="runTests()" class="btn-primary">🧪 运行测试</button>
            <div class="test-results" id="testOutput"></div>
        </div>
      `,
      login: `
        <div class="login-container">
            <div class="login-form">
                <h2>🔐 用户登录</h2>
                <div class="form-group">
                    <label>邮箱：</label>
                    <input type="email" id="email" placeholder="your@email.com">
                </div>
                <div class="form-group">
                    <label>密码：</label>
                    <input type="password" id="password" placeholder="••••••••">
                </div>
                <button onclick="handleLogin()" class="btn-primary">登录</button>
                <div class="login-status" id="loginStatus"></div>
            </div>
        </div>
      `,
      default: `
        <div class="default-tool">
            <h2>欢迎使用 iFlow 生成的工具</h2>
            <p>这是一个通用工具模板</p>
            <button onclick="showInfo()" class="btn-primary">点击测试</button>
            <div id="infoOutput"></div>
        </div>
      `
    };

    return templates[appType] || templates.default;
  }

  getCssTemplate(appType) {
    return `* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
}

.app-container {
    background: white;
    border-radius: 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    max-width: 900px;
    width: 100%;
    padding: 40px;
}

header {
    text-align: center;
    margin-bottom: 30px;
    border-bottom: 2px solid #f0f0f0;
    padding-bottom: 20px;
}

header h1 {
    color: #333;
    font-size: 2em;
}

main {
    padding: 10px 0;
}

/* 通用工具样式 */
.tool-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.input-section, .output-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

label {
    font-weight: 600;
    color: #333;
    font-size: 0.95em;
}

textarea {
    width: 100%;
    min-height: 200px;
    padding: 15px;
    border: 2px solid #e0e0e0;
    border-radius: 10px;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    resize: vertical;
}

textarea:focus {
    outline: none;
    border-color: #667eea;
}

.actions {
    display: flex;
    gap: 10px;
    justify-content: center;
}

button {
    padding: 12px 24px;
    border: none;
    border-radius: 25px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s;
}

.btn-primary {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
}

.btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
}

.btn-secondary {
    background: #f0f0f0;
    color: #333;
}

.btn-secondary:hover {
    background: #e0e0e0;
}

/* 仪表板样式 */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    margin-bottom: 30px;
}

.stat-card {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 20px;
    border-radius: 15px;
    text-align: center;
}

.stat-value {
    font-size: 2.5em;
    font-weight: 700;
    margin-bottom: 5px;
}

.stat-label {
    font-size: 0.9em;
    opacity: 0.9;
}

.chart-container {
    background: #f9f9f9;
    padding: 20px;
    border-radius: 15px;
    text-align: center;
}

.chart-container canvas {
    max-width: 100%;
}

/* 主题切换器样式 */
.theme-switcher {
    display: flex;
    flex-direction: column;
    gap: 30px;
}

.preview-box {
    padding: 30px;
    border-radius: 15px;
    background: #f9f9f9;
    transition: all 0.3s;
}

.preview-box h2 {
    margin-bottom: 15px;
}

.preview-btn {
    padding: 10px 20px;
    background: #667eea;
    color: white;
    border: none;
    border-radius: 20px;
    cursor: pointer;
}

.theme-selector {
    display: flex;
    gap: 15px;
    justify-content: center;
}

.theme-btn {
    flex: 1;
    padding: 15px 30px;
    border: 2px solid #e0e0e0;
    border-radius: 15px;
    background: white;
    font-size: 16px;
    cursor: pointer;
    transition: all 0.3s;
}

.theme-btn.active {
    border-color: #667eea;
    background: #667eea;
    color: white;
}

.theme-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
}

/* 移动端优化器样式 */
.mobile-optimizer {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.upload-area input {
    width: 100%;
    padding: 10px;
    border: 2px dashed #e0e0e0;
    border-radius: 10px;
}

.preview-area {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
}

.image-preview {
    text-align: center;
}

.image-preview h3 {
    margin-bottom: 10px;
}

.image-preview img {
    max-width: 100%;
    border-radius: 10px;
}

.stats {
    background: #f9f9f9;
    padding: 15px;
    border-radius: 10px;
}

/* 测试运行器样式 */
.test-runner {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.test-input {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.test-results {
    background: #f9f9f9;
    padding: 20px;
    border-radius: 10px;
    min-height: 100px;
}

.test-results .pass {
    color: #4CAF50;
    font-weight: 600;
}

.test-results .fail {
    color: #f44336;
    font-weight: 600;
}

/* 登录表单样式 */
.login-container {
    display: flex;
    justify-content: center;
}

.login-form {
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.login-form h2 {
    text-align: center;
    color: #333;
}

.form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.form-group input {
    padding: 12px;
    border: 2px solid #e0e0e0;
    border-radius: 10px;
    font-size: 16px;
}

.form-group input:focus {
    outline: none;
    border-color: #667eea;
}

.login-status {
    text-align: center;
    padding: 10px;
    border-radius: 10px;
    font-weight: 600;
}

.login-status.success {
    background: #4CAF50;
    color: white;
}

.login-status.error {
    background: #f44336;
    color: white;
}

/* 暗黑模式 */
[data-theme="dark"] .app-container {
    background: #2d2d2d;
    color: #f0f0f0;
}

[data-theme="dark"] header h1 {
    color: #f0f0f0;
}

[data-theme="dark"] label {
    color: #e0e0e0;
}

[data-theme="dark"] textarea {
    background: #1a1a1a;
    color: #e0e0e0;
    border-color: #404040;
}

[data-theme="dark"] .preview-box {
    background: #1a1a1a;
    color: #e0e0e0;
}

@media (max-width: 768px) {
    .stats-grid {
        grid-template-columns: repeat(2, 1fr);
    }
    
    .preview-area {
        grid-template-columns: 1fr;
    }
}`;
  }

  getJsTemplate(appType, port) {
    const templates = {
      formatter: `
// 代码格式化工具
function formatCode() {
    const input = document.getElementById('codeInput').value;
    if (!input.trim()) {
        alert('请输入需要格式化的代码');
        return;
    }
    
    try {
        // 基本的代码格式化逻辑
        let formatted = input;
        
        // 移除多余空行
        formatted = formatted.replace(/\\n\\s*\\n/g, '\\n');
        
        // 统一缩进（4个空格）
        const lines = formatted.split('\\n');
        let indentLevel = 0;
        const formattedLines = lines.map(line => {
            const trimmed = line.trim();
            if (!trimmed) return '';
            
            // 减少缩进
            if (trimmed.startsWith('}') || trimmed.startsWith(']') || trimmed.startsWith(')')) {
                indentLevel = Math.max(0, indentLevel - 1);
            }
            
            const indented = '    '.repeat(indentLevel) + trimmed;
            
            // 增加缩进
            if (trimmed.endsWith('{') || trimmed.endsWith('[') || trimmed.endsWith('(')) {
                indentLevel++;
            }
            
            return indented;
        });
        
        formatted = formattedLines.filter(line => line !== '').join('\\n');
        
        document.getElementById('codeOutput').value = formatted;
    } catch (error) {
        alert('格式化失败: ' + error.message);
    }
}

function clearCode() {
    document.getElementById('codeInput').value = '';
    document.getElementById('codeOutput').value = '';
}
      `,
      dashboard: `
// 数据可视化仪表板
document.addEventListener('DOMContentLoaded', function() {
    // 模拟实时数据
    const stats = {
        activeUsers: 0,
        requests: 0,
        responseTime: 0,
        successRate: 0
    };
    
    // 更新统计数据
    function updateStats() {
        stats.activeUsers = Math.floor(Math.random() * 100) + 50;
        stats.requests += Math.floor(Math.random() * 10);
        stats.responseTime = Math.floor(Math.random() * 200) + 50;
        stats.successRate = (95 + Math.random() * 5).toFixed(1);
        
        document.getElementById('stat1').textContent = stats.activeUsers;
        document.getElementById('stat2').textContent = stats.requests;
        document.getElementById('stat3').textContent = stats.responseTime + 'ms';
        document.getElementById('stat4').textContent = stats.successRate + '%';
    }
    
    // 绘制图表（使用 Canvas）
    function drawChart() {
        const canvas = document.getElementById('dataChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = 300;
        
        // 清空画布
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 绘制背景
        ctx.fillStyle = '#f9f9f9';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // 模拟数据点
        const dataPoints = [];
        for (let i = 0; i < 10; i++) {
            dataPoints.push(Math.random() * 200 + 50);
        }
        
        // 绘制折线图
        ctx.beginPath();
        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 3;
        
        const stepX = canvas.width / (dataPoints.length - 1);
        const maxY = Math.max(...dataPoints);
        
        dataPoints.forEach((value, index) => {
            const x = index * stepX;
            const y = canvas.height - (value / maxY) * (canvas.height - 40) - 20;
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        // 绘制数据点
        dataPoints.forEach((value, index) => {
            const x = index * stepX;
            const y = canvas.height - (value / maxY) * (canvas.height - 40) - 20;
            
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#764ba2';
            ctx.fill();
        });
    }
    
    // 初始化
    updateStats();
    drawChart();
    
    // 定时更新
    setInterval(updateStats, 2000);
    setInterval(drawChart, 2000);
    
    // 窗口大小改变时重绘
    window.addEventListener('resize', drawChart);
});
      `,
      darkmode: `
// 主题切换器
function setTheme(theme) {
    // 更新按钮状态
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.theme === theme) {
            btn.classList.add('active');
        }
    });
    
    // 应用主题
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.querySelector('.preview-box').style.background = '#1a1a1a';
        document.querySelector('.preview-box').style.color = '#e0e0e0';
    } else {
        document.documentElement.removeAttribute('data-theme');
        document.querySelector('.preview-box').style.background = '#f9f9f9';
        document.querySelector('.preview-box').style.color = '#333';
    }
}
      `,
      mobile: `
// 移动端图片优化器
function optimizeImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            // 显示原始图片
            const originalDiv = document.getElementById('originalPreview');
            originalDiv.innerHTML = '<img src="' + e.target.result + '" alt="Original">';
            
            // 创建优化后的图片
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // 调整尺寸（最大宽度 800px）
            const maxWidth = 800;
            const scale = Math.min(1, maxWidth / img.width);
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            
            // 绘制并压缩
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const optimizedData = canvas.toDataURL('image/jpeg', 0.7);
            
            // 显示优化后的图片
            const optimizedDiv = document.getElementById('optimizedPreview');
            optimizedDiv.innerHTML = '<img src="' + optimizedData + '" alt="Optimized">';
            
            // 显示统计信息
            const originalSize = (file.size / 1024).toFixed(2);
            const optimizedSize = (optimizedData.length * 0.75 / 1024).toFixed(2);
            const reduction = ((1 - optimizedSize / originalSize) * 100).toFixed(1);
            
            document.getElementById('imageStats').innerHTML = 
                '<p>原始大小: ' + originalSize + ' KB</p>' +
                '<p>优化后: ' + optimizedSize + ' KB</p>' +
                '<p>压缩率: ' + reduction + '%</p>';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}
      `,
      database: `
// SQL 查询优化器
function optimizeQuery() {
    const input = document.getElementById('sqlInput').value;
    if (!input.trim()) {
        alert('请输入 SQL 查询');
        return;
    }
    
    const suggestions = [];
    const query = input.toLowerCase();
    
    // 检查 SELECT *
    if (query.includes('select *')) {
        suggestions.push({
            type: 'warning',
            message: '避免使用 SELECT *，只选择需要的列可以提高性能'
        });
    }
    
    // 检查 WHERE 子句
    if (!query.includes('where') && query.includes('from')) {
        suggestions.push({
            type: 'warning',
            message: '建议添加 WHERE 子句来限制结果集'
        });
    }
    
    // 检查 JOIN
    if (query.includes('join')) {
        suggestions.push({
            type: 'info',
            message: '确保 JOIN 的列有索引'
        });
    }
    
    // 检查 ORDER BY
    if (query.includes('order by')) {
        suggestions.push({
            type: 'info',
            message: 'ORDER BY 的列应该有索引以提高排序性能'
        });
    }
    
    // 检查 LIMIT
    if (!query.includes('limit') && query.includes('select')) {
        suggestions.push({
            type: 'warning',
            message: '建议添加 LIMIT 来限制返回的行数'
        });
    }
    
    // 显示结果
    const output = document.getElementById('queryOutput');
    if (suggestions.length === 0) {
        output.innerHTML = '<p style="color: #4CAF50;">✅ 查询看起来不错！</p>';
    } else {
        output.innerHTML = suggestions.map(s => 
            '<p style="color: ' + (s.type === 'warning' ? '#FF9800' : '#2196F3') + '">' + s.message + '</p>'
        ).join('');
    }
}
      `,
      test: `
// 单元测试运行器
function runTests() {
    const code = document.getElementById('testCode').value;
    const testCasesJson = document.getElementById('testCases').value;
    
    if (!code.trim() || !testCasesJson.trim()) {
        alert('请输入测试代码和测试用例');
        return;
    }
    
    try {
        // 执行测试代码
        const testFunction = new Function('return ' + code)();
        
        // 解析测试用例
        const testCases = JSON.parse(testCasesJson);
        
        // 运行测试
        const results = [];
        testCases.forEach((testCase, index) => {
            try {
                const result = testFunction(...testCase.input);
                const passed = result === testCase.expected;
                
                results.push({
                    case: index + 1,
                    input: testCase.input,
                    expected: testCase.expected,
                    actual: result,
                    passed: passed
                });
            } catch (error) {
                results.push({
                    case: index + 1,
                    input: testCase.input,
                    expected: testCase.expected,
                    actual: 'Error: ' + error.message,
                    passed: false
                });
            }
        });
        
        // 显示结果
        const output = document.getElementById('testOutput');
        const passedCount = results.filter(r => r.passed).length;
        
        output.innerHTML = '<h3>测试结果: ' + passedCount + '/' + results.length + ' 通过</h3>';
        output.innerHTML += results.map(r => 
            '<div class="' + (r.passed ? 'pass' : 'fail') + '">' +
            '测试 ' + r.case + ': ' + (r.passed ? '✅ 通过' : '❌ 失败') + '<br>' +
            '输入: ' + JSON.stringify(r.input) + '<br>' +
            '期望: ' + JSON.stringify(r.expected) + '<br>' +
            '实际: ' + JSON.stringify(r.actual) +
            '</div>'
        ).join('');
        
    } catch (error) {
        alert('执行失败: ' + error.message);
    }
}
      `,
      login: `
// 登录系统
function handleLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const status = document.getElementById('loginStatus');
    
    if (!email || !password) {
        status.className = 'login-status error';
        status.textContent = '请填写所有字段';
        return;
    }
    
    // 模拟登录验证
    status.className = 'login-status';
    status.textContent = '登录中...';
    
    setTimeout(() => {
        // 简单的邮箱验证
        const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
        
        if (emailRegex.test(email) && password.length >= 6) {
            status.className = 'login-status success';
            status.textContent = '✅ 登录成功！欢迎回来，' + email;
        } else {
            status.className = 'login-status error';
            status.textContent = '❌ 登录失败：邮箱格式不正确或密码太短';
        }
    }, 1000);
}
      `,
      default: `
// 通用工具
function showInfo() {
    const output = document.getElementById('infoOutput');
    output.innerHTML = '<p>🎉 工具运行正常！</p><p>当前时间: ' + new Date().toLocaleString() + '</p>';
}
      `
    };

    const template = templates[appType] || templates.default;

    return `// iFlow 生成的应用前端
${template}
`;
  }

  getServerTemplate(port, appType) {
    return `const express = require('express');
const http = require('http');
const app = express();
const server = http.createServer(app);

// 静态文件
app.use(express.static('public'));

// API 路由
app.get('/api/status', (req, res) => {
    res.json({
        status: 'running',
        timestamp: new Date().toISOString(),
        appType: '${appType}'
    });
});

app.get('/api/health', (req, res) => {
    res.json({ health: 'ok' });
});

// 启动服务器
server.listen(${port}, () => {
    console.log('✅ 应用已启动');
    console.log('🌐 访问地址: http://localhost:${port}');
    console.log('📊 API 端点: http://localhost:${port}/api/status');
});`;
  }

  getAppTitle(appType) {
    const titles = {
      formatter: '✨ 代码格式化工具',
      database: '⚡ SQL 查询优化器',
      dashboard: '📊 数据可视化仪表板',
      mobile: '📱 图片优化器',
      darkmode: '🌙 主题切换器',
      test: '🧪 单元测试运行器',
      login: '🔐 用户登录系统',
      default: '🚀 iFlow 生成工具'
    };
    return titles[appType] || titles.default;
  }

  getAppSolution(appId, port, idea, appName, appType) {
    return `# iFlow 自动生成 Web 应用

## 应用信息
- 应用名称: ${appName}
- 应用 ID: ${appId}
- 应用类型: ${appType}
- 访问端口: ${port}
- 访问地址: http://localhost:${port}

## 用户想法
${idea}

## 应用说明
这是一个完整的 Web 应用程序，包含：
- 前端界面（HTML + CSS + JavaScript）
- 后端服务器（Node.js + Express）
- RESTful API 接口

## 如何启动
\`\`\`bash
cd generated-apps/${appId}
npm install
npm start
\`\`\`

## API 端点
- GET /api/status - 查看应用状态
- GET /api/health - 健康检查

## 文件结构
\`\`\`
${appId}/
├── package.json      # 项目配置
├── metadata.json     # 应用元数据
├── server.js         # 后端服务器
└── public/
    ├── index.html    # 前端页面
    ├── style.css     # 样式文件
    └── app.js        # 前端脚本
\`\`\`

---
*此应用由 iFlow Continuous Development System 自动生成*
*生成时间: ${new Date().toISOString()}*`;
  }

  // 生成特定类型的应用
  generateFormatterApp(appDir, port, idea) {
    this.generateAppFiles(appDir, port, idea, 'formatter');
  }

  generateDatabaseApp(appDir, port, idea) {
    this.generateAppFiles(appDir, port, idea, 'database');
  }

  generateDashboardApp(appDir, port, idea) {
    this.generateAppFiles(appDir, port, idea, 'dashboard');
  }

  generateMobileApp(appDir, port, idea) {
    this.generateAppFiles(appDir, port, idea, 'mobile');
  }

  generateDarkModeApp(appDir, port, idea) {
    this.generateAppFiles(appDir, port, idea, 'darkmode');
  }

  generateTestApp(appDir, port, idea) {
    this.generateAppFiles(appDir, port, idea, 'test');
  }

  generateLoginApp(appDir, port, idea) {
    this.generateAppFiles(appDir, port, idea, 'login');
  }

  generateDefaultApp(appDir, port, idea) {
    this.generateAppFiles(appDir, port, idea, 'default');
  }

  // 应用管理方法
  async startApp(appId) {
    const appDir = path.join(this.appsDirectory, appId);
    const packageJsonPath = path.join(appDir, 'package.json');
    const metadataPath = path.join(appDir, 'metadata.json');

    if (!fs.existsSync(packageJsonPath)) {
      throw new Error(`应用不存在: ${appId}`);
    }

    // 检查应用是否已经在运行
    if (this.activeApps.has(appId)) {
      throw new Error(`应用已经在运行: ${appId}`);
    }

    // 端口：优先用 metadata.json 里记录的端口；若被占用则自动换一个空闲端口并回写 metadata
    const metadata = this.readJsonFile(metadataPath) || {};
    const preferredPort = Number.isInteger(metadata.port) ? metadata.port : null;
    const port = await this.findFreeAppPort(preferredPort);

    try {
      if (metadata && metadata.port !== port) {
        this.writeJsonFile(metadataPath, { ...metadata, port });
      }

      // 尽量保证应用可通过 env.PORT 覆盖端口（修复硬编码端口导致的 EADDRINUSE）
      this.ensureServerUsesEnvPort(appDir);

      // 启动应用
      const child = spawn('node', ['server.js'], {
        cwd: appDir,
        stdio: 'pipe',
        env: { ...process.env, PORT: String(port) }
      });

      this.activeApps.set(appId, {
        process: child,
        port,
        startTime: new Date(),
        status: 'starting'
      });

      child.stdout.on('data', (data) => {
        const output = data.toString();
        logger.info(`应用输出 [${appId}]`, { output: output.trim() });

        // 从输出中提取端口号
        const portMatch = output.match(/localhost:(\d+)/);
        if (portMatch) {
          const appInfo = this.activeApps.get(appId);
          if (appInfo) {
            appInfo.port = parseInt(portMatch[1]);
            appInfo.status = 'running';
          }
        }
      });

      child.stderr.on('data', (data) => {
        const errText = data.toString().trim();
        logger.error(`应用错误 [${appId}]`, { error: errText });

        // EADDRINUSE 常见于端口硬编码或残留进程占用
        if (errText.includes('EADDRINUSE')) {
          const appInfo = this.activeApps.get(appId);
          if (appInfo) {
            appInfo.status = 'stopped';
          }
        }
      });

      // ✅ 改进：进程关闭时自动释放端口
      child.on('close', (code) => {
        logger.info(`应用已停止 [${appId}]`, { code });
        const appInfo = this.activeApps.get(appId);
        if (appInfo && appInfo.port) {
          this.releasePort(appInfo.port);
          logger.debug('已释放端口', { appId, port: appInfo.port });
        }
        this.activeApps.delete(appId);
      });

      return { success: true, appId, status: 'starting', port };
    } catch (error) {
      // ✅ 改进：启动失败时释放端口
      this.releasePort(port);
      logger.error('应用启动失败，已释放端口', { appId, port, error: error.message });
      throw error;
    }
  }

  stopApp(appId) {
    const appInfo = this.activeApps.get(appId);
    if (!appInfo) {
      throw new Error(`应用未在运行: ${appId}`);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        logger.warn('应用停止超时，强制清理', { appId });
        if (appInfo.port) {
          this.releasePort(appInfo.port);
        }
        this.activeApps.delete(appId);
        resolve({ success: true, appId, status: 'stopped', timedOut: true });
      }, 10000); // 10秒超时

      // ✅ 改进：监听进程退出事件
      const onExit = (code) => {
        clearTimeout(timeout);
        logger.info('应用进程已退出', { appId, code });

        // 释放端口
        if (appInfo.port) {
          this.releasePort(appInfo.port);
        }

        this.activeApps.delete(appId);
        resolve({ success: true, appId, status: 'stopped' });
      };

      // 检查进程是否已经退出
      if (appInfo.process.killed || !appInfo.process.pid) {
        clearTimeout(timeout);
        if (appInfo.port) {
          this.releasePort(appInfo.port);
        }
        this.activeApps.delete(appId);
        resolve({ success: true, appId, status: 'stopped' });
        return;
      }

      try {
        // 添加一次性退出监听器
        appInfo.process.once('exit', onExit);

        // 发送终止信号
        logger.info('停止应用进程', { appId, pid: appInfo.process.pid });
        appInfo.process.kill();
      } catch (error) {
        clearTimeout(timeout);
        logger.error('停止应用失败', { appId, error: error.message });
        // 即使 kill 失败也清理状态
        if (appInfo.port) {
          this.releasePort(appInfo.port);
        }
        this.activeApps.delete(appId);
        reject(error);
      }
    });
  }

  // 批量启动应用
  async startAllApps() {
    const apps = this.getAppsList();
    const results = [];

    for (const app of apps) {
      if (app.status === 'stopped') {
        try {
          await this.startApp(app.id);
          results.push({ appId: app.id, success: true });
          // 等待2秒再启动下一个应用，避免端口冲突
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          results.push({ appId: app.id, success: false, error: error.message });
        }
      }
    }

    return results;
  }

  // 批量停止应用
  async stopAllApps() {
    const appIds = Array.from(this.activeApps.keys());
    const results = [];

    for (const appId of appIds) {
      try {
        await this.stopApp(appId);
        results.push({ appId, success: true });
      } catch (error) {
        results.push({ appId, success: false, error: error.message });
      }
    }

    return results;
  }

  getAppsList() {
    const apps = [];

    if (fs.existsSync(this.appsDirectory)) {
      const appDirs = fs.readdirSync(this.appsDirectory);

      appDirs.forEach(appId => {
        if (this.isIgnoredAppDirName(appId)) {
          return;
        }
        const appDir = path.join(this.appsDirectory, appId);
        const metadataPath = path.join(appDir, 'metadata.json');

        // 读取应用元数据
        let metadata = {
          id: appId,
          name: 'iFlow 生成的应用',
          type: 'default',
          port: null,
          createdAt: null,
          idea: '',
          ideaKey: null,
          ideaHistory: [],
          lastRevision: null,
          lastOutputAt: null
        };

        if (fs.existsSync(metadataPath)) {
          try {
            metadata = { ...metadata, ...JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) };
          } catch (error) {
            // 使用默认元数据
          }
        }

        // 检查运行状态
        const isRunning = this.activeApps.has(appId);
        const runningInfo = this.activeApps.get(appId);

        let status = 'stopped';
        let startTime = null;
        let currentPort = metadata.port;

        if (isRunning && runningInfo) {
          status = runningInfo.status;
          startTime = runningInfo.startTime;
          currentPort = runningInfo.port || metadata.port;
        }

        apps.push({
          id: appId,
          name: metadata.name,
          type: metadata.type,
          status,
          port: currentPort,
          startTime,
          createdAt: metadata.createdAt,
          idea: metadata.idea,
          ideaKey: metadata.ideaKey,
          ideaHistory: metadata.ideaHistory,
          lastRevision: metadata.lastRevision,
          lastOutputAt: metadata.lastOutputAt,
          path: appDir
        });
      });
    }

    // 按创建时间排序（最新的在前）
    // Merge in-memory pending apps (no disk side effects)
    for (const p of this.pendingApps.values()) {
      if (!p || !p.ideaKey) continue;
      if (this.ideaKeyToAppId.has(p.ideaKey)) continue;
      apps.push({ ...p });
    }

    return apps.sort((a, b) => {
      if (!a.createdAt) return 1;
      if (!b.createdAt) return -1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }
}

module.exports = iFlowEngine;
