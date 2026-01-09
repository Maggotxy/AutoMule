const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

function ensureWhichShimOnWindows() {
  if (process.platform !== 'win32') return;

  const toolsDir = path.resolve(__dirname, '../../tools');
  const shimPath = path.join(toolsDir, 'which.cmd');
  if (!fs.existsSync(shimPath)) return;

  const delimiter = path.delimiter;
  const currentPath = process.env.PATH || '';
  const parts = currentPath.split(delimiter).filter(Boolean);
  if (parts.includes(toolsDir)) return;

  process.env.PATH = `${toolsDir}${delimiter}${currentPath}`;
}

// Ensure the shim is available before any SDK/internal process checks happen.
ensureWhichShimOnWindows();

function listContextFiles(appDir) {
  const candidates = [
    'package.json',
    'server.js',
    'metadata.json',
    path.join('public', 'index.html'),
    path.join('public', 'style.css'),
    path.join('public', 'app.js')
  ];

  return candidates
    .map(p => path.join(appDir, p))
    .filter(p => fs.existsSync(p));
}

function normalizeApproveType(value) {
  return String(value || '').trim().toLowerCase();
}

function shouldApproveToolCall(message, config) {
  const permissionMode = normalizeApproveType(config.permissionMode);
  if (permissionMode === 'manual') {
    return { approve: false, reason: 'permissionMode=manual' };
  }

  const confirmationType = normalizeApproveType(message?.confirmation?.type);
  const autoApproveTypes = Array.isArray(config.autoApproveTypes) ? config.autoApproveTypes : [];
  const allowList = new Set(autoApproveTypes.map(normalizeApproveType).filter(Boolean));

  if (permissionMode === 'auto') {
    return { approve: true };
  }

  // selective
  if (allowList.size > 0) {
    return { approve: allowList.has(confirmationType) };
  }

  // default selective: allow edit only
  return { approve: confirmationType === 'edit' };
}

function buildSdkOptions({ appDir, config }) {
  const port = config.processStartPort || 8090;
  let url = config.url || `ws://localhost:${port}/acp`;

  return {
    url,
    cwd: appDir,
    timeout: config.timeout,
    logLevel: config.logLevel,
    // Windows 下 child_process 直接执行 `which`/`iflow` 常失败；进程启动交由宿主处理
    autoStartProcess: config.autoStartProcess !== false && process.platform !== 'win32',
    processStartPort: (config.autoStartProcess !== false && process.platform !== 'win32') ? (config.processStartPort || port) : undefined,
    permissionMode: config.permissionMode,
    autoApproveTypes: config.autoApproveTypes,
    fileAccess: config.fileAccess,
    fileMaxSize: config.fileMaxSize,
    fileReadOnly: config.fileReadOnly,
    fileAllowedDirs: [appDir],
    metadata: {
      source: 'iflow-continuous-dev',
      appDir
    }
  };
}

function withTimeout(promise, ms, code) {
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

async function loadSdk() {
  let sdk;
  try {
    sdk = require('@iflow-ai/iflow-cli-sdk');
  } catch (error) {
    const err = new Error(
      '无法加载 @iflow-ai/iflow-cli-sdk，请先在项目根目录运行 npm install 再启用 iflow.enabled'
    );
    err.cause = error;
    throw err;
  }
  return sdk;
}

async function runIFlowQuery({ prompt, appDir, config }) {
  const sdk = await loadSdk();
  const files = listContextFiles(appDir);
  const options = buildSdkOptions({ appDir, config });

  return sdk.query(prompt, files, options);
}

module.exports = {
  listContextFiles,
  runIFlowQuery,
  runIFlowIteration: async ({ prompt, appDir, config, onEvent, taskId, wsUrl }) => {
    const sdk = await loadSdk();
    const { IFlowClient, MessageType } = sdk;
    const { getConnectionPool } = require('./IFlowConnectionPool');
    const connectionPool = getConnectionPool();

    // 传入 wsUrl 以支持多会话（如果提供了 wsUrl，则 options.url 会被覆盖）
    const options = buildSdkOptions({ appDir, config, wsUrl });

    const chunks = [];
    const plans = [];
    const toolCalls = [];
    const errors = [];

    // 如果指定了 wsUrl，说明是独立会话，直接直连不走单例连接池
    // 或者是 SessionManager 管理的会话
    let client;
    if (wsUrl) {
      client = new IFlowClient(options);
    } else {
      // 否则走连接池（兼容旧模式）
      connectionPool.taskStart();
    }

    try {
      const sendTimeoutMs = typeof config.sendTimeoutMs === 'number' ? config.sendTimeoutMs : 120000;

      if (wsUrl) {
        // 独立连接模式
        if (onEvent) onEvent({ type: 'status', text: '连接独立 iFlow 进程…' });
        const connectTimeoutMs = typeof config.connectTimeoutMs === 'number' ? config.connectTimeoutMs : 30000;
        await withTimeout(client.connect(), connectTimeoutMs, `IFLOW_CONNECT_TIMEOUT: ${connectTimeoutMs}ms`);
      } else {
        // 连接池模式
        if (onEvent) onEvent({ type: 'status', text: '获取 iFlow 连接…' });
        client = await connectionPool.getConnection(options);
      }

      if (onEvent) onEvent({ type: 'status', text: '发送任务…' });
      await withTimeout(client.sendMessage(prompt, files), sendTimeoutMs, `IFLOW_SEND_TIMEOUT: ${sendTimeoutMs}ms`);

      const idleTimeoutMs = typeof config.idleTimeoutMs === 'number' ? config.idleTimeoutMs : 30000;
      const firstIdleTimeoutMs = typeof config.firstIdleTimeoutMs === 'number' ? config.firstIdleTimeoutMs : Math.max(idleTimeoutMs, 300000);
      const overallTimeoutMs = typeof config.timeout === 'number' ? config.timeout : 300000;
      const startedAt = Date.now();
      let lastMessageAt = Date.now();
      let hasAnyMessage = false;
      const iterator = client.receiveMessages();

      const nextWithTimeout = async (ms) => {
        return Promise.race([
          iterator.next(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('IFLOW_IDLE_TIMEOUT')), ms))
        ]);
      };

      while (true) {
        const elapsed = Date.now() - startedAt;
        if (elapsed > overallTimeoutMs) {
          throw new Error(`IFLOW_OVERALL_TIMEOUT: ${overallTimeoutMs}ms`);
        }

        const idleElapsed = Date.now() - lastMessageAt;
        const remainingOverall = overallTimeoutMs - elapsed;
        const currentIdleLimit = hasAnyMessage ? idleTimeoutMs : firstIdleTimeoutMs;
        const waitMs = Math.max(2000, Math.min(currentIdleLimit - idleElapsed, remainingOverall));

        let next;
        try {
          // eslint-disable-next-line no-await-in-loop
          next = await nextWithTimeout(waitMs);
        } catch (error) {
          if (error && error.message === 'IFLOW_IDLE_TIMEOUT') {
            const currentIdleLimit = hasAnyMessage ? idleTimeoutMs : firstIdleTimeoutMs;
            throw new Error(`IFLOW_IDLE_TIMEOUT: ${currentIdleLimit}ms`);
          }
          throw error;
        }

        if (next.done) {
          break;
        }

        lastMessageAt = Date.now();
        hasAnyMessage = true;
        const message = next.value;

        // 🔍 调试日志：记录所有收到的消息类型
        logger.debug('iFlow 消息', {
          taskId,
          type: message.type,
          hasChunkText: !!(message.chunk && message.chunk.text),
          hasToolName: !!message.toolName,
          status: message.status,
          messageKeys: Object.keys(message || {})
        });

        if (message.type === MessageType.ASSISTANT && message.chunk?.text) {
          chunks.push(message.chunk.text);
          if (onEvent) onEvent({ type: 'assistant_chunk', text: message.chunk.text });
        } else if (message.type === MessageType.PLAN && Array.isArray(message.entries)) {
          plans.push(...message.entries);
          if (onEvent) onEvent({ type: 'plan', entries: message.entries });
        } else if (message.type === MessageType.TOOL_CALL) {
          toolCalls.push({
            id: message.id,
            status: message.status,
            toolName: message.toolName,
            confirmationType: message.confirmation?.type
          });
          if (onEvent) {
            const t = message.toolName ? `工具: ${message.toolName}` : '工具调用';
            const s = message.status ? `(${message.status})` : '';
            onEvent({ type: 'status', text: `${t}${s}` });
          }

          if (message.status === 'pending' && message.confirmation?.type) {
            const decision = shouldApproveToolCall(message, config);
            if (decision.approve) {
              // eslint-disable-next-line no-await-in-loop
              await client.approveToolCall(message.id);
              if (onEvent) onEvent({ type: 'status', text: `已自动批准: ${message.confirmation?.type}` });
            } else {
              const permissionMode = normalizeApproveType(config.permissionMode);
              if (permissionMode === 'manual') {
                // 手动模式下如果没有外部审批通道，直接失败比“无输出超时”更友好
                const typ = normalizeApproveType(message.confirmation?.type);
                const hint = `需要手动审批工具调用(type=${typ})，请把 config.iflow.permissionMode 设为 selective/auto，或配置 autoApproveTypes。`;
                if (onEvent) onEvent({ type: 'status', text: hint });
                throw new Error(`IFLOW_TOOL_APPROVAL_REQUIRED: ${typ}`);
              }

              // eslint-disable-next-line no-await-in-loop
              await client.rejectToolCall(message.id);
              errors.push({
                type: 'tool_call_rejected',
                id: message.id,
                reason: decision.reason || 'rejected'
              });
              if (onEvent) onEvent({ type: 'status', text: `已拒绝工具调用: ${message.confirmation?.type}` });
            }
          }
        } else if (message.type === MessageType.ERROR) {
          errors.push(message);
          if (onEvent) onEvent({ type: 'status', text: `iFlow 错误: ${message.message || 'unknown'}` });
        } else if (message.type === MessageType.TASK_FINISH) {
          if (onEvent) onEvent({ type: 'status', text: '任务结束' });
          break;
        } else {
          // ✅ fallback：捕获所有未处理的消息类型
          logger.debug('未识别的消息类型', {
            taskId,
            type: message.type,
            messageKeys: Object.keys(message || {}),
            sample: JSON.stringify(message).slice(0, 200)
          });

          // 🔧 尝试从任意消息中提取有用信息并转发给前端
          let statusText = null;
          if (message.toolName) {
            statusText = `工具: ${message.toolName}${message.status ? ` (${message.status})` : ''}`;
          } else if (message.status && typeof message.status === 'string') {
            statusText = `状态: ${message.status}`;
          } else if (message.message && typeof message.message === 'string') {
            statusText = message.message;
          } else if (message.type && typeof message.type === 'string') {
            statusText = `消息类型: ${message.type}`;
          }

          if (statusText && onEvent) {
            onEvent({ type: 'status', text: statusText });
          }
        }
      }

      const text = chunks.join('');
      return {
        text: text || '',
        summary: {
          plans,
          toolCalls,
          errors
        }
      };
    } catch (error) {
      // 连接出错时标记为不健康，下次将重建
      connectionPool.isConnected = false;
      throw error;
    } finally {
      // ✅ 不再断开连接，仅标记任务结束
      connectionPool.taskEnd();
    }
  },
  logIFlowFailureHint: (err) => {
    if (!err || !err.message) return;
    if (String(err.message).includes('IFLOW_IDLE_TIMEOUT')) {
      logger.warn('iFlow 无消息超时：可能卡在工具调用审批/无输出。可尝试把 config.iflow.permissionMode 设为 selective 或 auto。');
    }
  }
};
