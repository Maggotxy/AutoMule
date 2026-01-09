class ManusUI {
    constructor() {
        this.socket = null;
        this.apps = [];
        this.tasksCache = [];
        this.pendingIdeas = new Map(); // ideaKey -> { revision, content, timestamp }
        this.activeApp = null;
        this.activeIdeaKey = null;
        this.activeIdeaFileName = null;
        this.activeTreeSelectedPath = null;
        this.rightTab = 'tree';
        this.leftCollapsed = false;
        this.rightCollapsed = false;
        this.newAppMode = false;
        this.isAutoSelecting = false;
        this.liveByTaskId = new Map(); // taskId -> text
        this.refreshConversationTimer = null;
        this.refreshAppsTimer = null;
        this.elapsedTicker = null;
        this.tickInFlight = false;
        this.hasProcessing = false;
        this.hasProcessing = false;
        this.niuMaStation = null;
        this.niurnaStates = {};

        this.init();
    }

    init() {
        this.loadPaneState();
        this.connectSocket();
        this.refreshAll();
        this.bindInputUI();
        this.startElapsedTicker();
    }

    formatElapsed(ms) {
        const total = Math.max(0, Math.floor((ms || 0) / 1000));
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        const pad2 = (n) => String(n).padStart(2, '0');
        return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
    }

    formatElapsedFromIso(iso) {
        const t = Date.parse(String(iso || ''));
        if (!t || Number.isNaN(t)) return '00:00';
        return this.formatElapsed(Date.now() - t);
    }

    startElapsedTicker() {
        if (this.elapsedTicker) return;
        this.elapsedTicker = setInterval(() => {
            this.updateElapsedDom();
        }, 1000);
    }

    updateElapsedDom() {
        const nodes = document.querySelectorAll('[data-elapsed-from]');
        nodes.forEach((el) => {
            const iso = el.getAttribute('data-elapsed-from');
            if (!iso) return;
            el.textContent = this.formatElapsedFromIso(iso);
        });

        // Keep "processing/creating" timers feeling real-time even when iFlow is quiet.
        const hasCreating = (this.apps || []).some(a => a && a.status === 'creating');
        if ((this.hasProcessing || hasCreating) && !this.tickInFlight) {
            this.tickInFlight = true;
            Promise.resolve()
                .then(() => this.refreshConversation())
                .catch(() => undefined)
                .finally(() => {
                    this.tickInFlight = false;
                });
            this.renderApps();
            this.updateRunButtons();
        }
    }

    bindInputUI() {
        const input = document.getElementById('chatInput');
        const sendBtn = document.getElementById('sendBtn');
        const clearBtn = document.getElementById('clearBtn');
        const wrap = input ? input.closest('.input-wrap') : null;
        if (!input) return;

        const update = () => {
            const hasText = input.value.trim().length > 0;
            if (sendBtn) sendBtn.disabled = !hasText;
            if (clearBtn) clearBtn.style.visibility = hasText ? 'visible' : 'hidden';
            if (wrap) wrap.classList.toggle('has-text', hasText);
        };

        input.addEventListener('focus', () => {
            if (wrap) wrap.classList.add('is-focus');
        });
        input.addEventListener('blur', () => {
            if (wrap) wrap.classList.remove('is-focus');
        });
        input.addEventListener('input', update);
        update();
    }

    loadPaneState() {
        try {
            const left = localStorage.getItem('pane.leftCollapsed');
            const right = localStorage.getItem('pane.rightCollapsed');
            if (left !== null) this.leftCollapsed = left === 'true';
            if (right !== null) this.rightCollapsed = right === 'true';
        } catch {
            // ignore
        }
        this.applyPaneState();
    }

    savePaneState() {
        try {
            localStorage.setItem('pane.leftCollapsed', String(this.leftCollapsed));
            localStorage.setItem('pane.rightCollapsed', String(this.rightCollapsed));
        } catch {
            // ignore
        }
    }

    applyPaneState() {
        const shell = document.getElementById('shell');
        if (!shell) return;
        shell.classList.toggle('left-collapsed', !!this.leftCollapsed);
        shell.classList.toggle('right-collapsed', !!this.rightCollapsed);
        shell.classList.toggle('preview-mode', this.rightTab === 'preview' && !this.rightCollapsed);
    }

    toggleLeftPane() {
        this.leftCollapsed = !this.leftCollapsed;
        this.applyPaneState();
        this.savePaneState();
    }

    toggleRightPane() {
        this.rightCollapsed = !this.rightCollapsed;
        this.applyPaneState();
        this.savePaneState();
    }

    connectSocket() {
        this.socket = io();

        this.socket.on('connect', () => {
            this.setStatus('在线');
        });
        this.socket.on('disconnect', () => {
            this.setStatus('离线');
        });

        // 任务更新/新代码时，刷新会话展示
        this.socket.on('taskUpdate', (task) => {
            this.upsertTaskCache(task);
            this.scheduleRefreshConversation();
            this.scheduleRefreshApps();
        });
        this.socket.on('newCode', () => {
            this.scheduleRefreshConversation();
            this.refreshProject();
            this.scheduleRefreshApps();
        });

        // 断线重连后，服务端会推送一次完整 tasks 快照；用它填充 cache，避免必须刷新页面/请求接口才显示气泡。
        this.socket.on('tasks', (data) => {
            this.tasksCache = this.normalizeTasksPayload(data);
            this.scheduleRefreshConversation();
            this.scheduleRefreshApps();
        });

        // 新想法先落地一个“待执行”的用户气泡（即使 taskUpdate 丢了也不会空白）
        this.socket.on('newIdea', (idea) => {
            if (idea && typeof idea.ideaKey === 'string' && idea.ideaKey) {
                this.pendingIdeas.set(idea.ideaKey, {
                    revision: idea.revision ?? null,
                    content: idea.content || '',
                    timestamp: idea.timestamp || new Date().toISOString()
                });
                this.activeIdeaKey = this.activeIdeaKey || idea.ideaKey;
                this.activeIdeaFileName = this.activeIdeaFileName || String(idea.ideaKey).split(/[/\\\\]/).pop();
            }
            this.scheduleRefreshConversation();
        });

        this.socket.on('log', (entry) => {
            // Only surface logs that can be correlated to a task in the UI.
            const taskId = entry?.meta?.taskId;
            if (!taskId) return;
            const level = String(entry.level || '').toUpperCase();
            const msg = String(entry.message || '');
            const text = msg ? `[${level}] ${msg}` : `[${level}]`;
            this.onTaskStream({ taskId, type: 'status', text });
        });

        this.socket.on('taskStream', (payload) => {
            this.onTaskStream(payload);
        });
    }

    setStatus(text) {
        const el = document.getElementById('systemStatusText');
        if (el) el.textContent = text;
    }

    async refreshAll() {
        await this.refreshApps();
        await this.refreshConversation();
        await this.refreshProject();
        this.applyRightTab();
        this.updateRunButtons();
    }

    async refreshApps() {
        try {
            const res = await fetch('/api/apps');
            const data = await res.json();
            if (!data.success) return;
            this.apps = data.apps || [];

            // activeApp 同步最新状态（port/status/name）
            if (this.activeApp) {
                const latest = this.apps.find(a => a.id === this.activeApp.id);
                if (latest) {
                    this.activeApp = latest;
                    if (latest.ideaKey) {
                        this.activeIdeaKey = latest.ideaKey;
                        this.activeIdeaFileName = String(latest.ideaKey).split(/[/\\\\]/).pop();
                    }
                }
            }

            this.renderApps();
            this.updateRunButtons();
        } catch (e) {
            this.renderAppsError('加载应用失败');
        }
    }

    async refreshNiuMaStation() {
        try {
            const res = await fetch('/api/niuma-station');
            const data = await res.json();
            if (data.success) {
                this.niuMaStation = data;
                this.niurnaStates = data.allNiuma || {};
                if (this.activeApp && this.niurnaStates[this.activeApp.id]) {
                    // Sync if needed
                }
            }
        } catch (e) {
            console.warn('获取牛马工作站状态失败', e);
        }
    }

    renderAppsError(msg) {
        const container = document.getElementById('apps');
        if (!container) return;
        container.innerHTML = `<div class="text-center py-5 text-muted">${this.escapeHtml(msg)}</div>`;
    }

    renderApps() {
        const container = document.getElementById('apps');
        if (!container) return;

        if (!this.apps.length) {
            container.innerHTML = `<div class="text-center py-5 text-muted">暂无应用</div>`;
            // no-op
            return;
        }

        const search = (document.getElementById('appSearch')?.value || '').toLowerCase();
        const filtered = this.apps.filter(a => {
            const hay = `${a.name} ${a.id} ${a.type}`.toLowerCase();
            return !search || hay.includes(search);
        });

        container.innerHTML = (this.apps || []).map(app => {
            const statusClass = app.status || 'stopped';
            const statusText = statusClass === 'running' ? '运行中'
                : statusClass === 'starting' ? '启动中'
                    : '已停止';

            // NiuMa 状态
            const niuMaState = this.niurnaStates[app.id];
            const isNiuMaActive = niuMaState && niuMaState.enabled;
            const niuMaStatus = niuMaState ? niuMaState.status : 'idle'; // working, resting, paused, idle
            const niuMaFocus = niuMaState ? (niuMaState.focusDimension || '') : '';

            // 构建 NiuMa 状态 UI (赛博牛马风)
            let niuMaBadge = '';
            let niuMaControls = '';

            if (isNiuMaActive) {
                const statusMap = {
                    'working': { icon: '🔥', text: '搬砖中', class: 'text-danger' },
                    'resting': { icon: '☕', text: '摸鱼中', class: 'text-success' },
                    'paused': { icon: '⏸️', text: '暂停', class: 'text-warning' },
                    'idle': { icon: '💤', text: '待命', class: 'text-muted' }
                };
                const st = statusMap[niuMaStatus] || statusMap['idle'];
                niuMaBadge = `<span class="badge" title="24小时自动打工中" style="margin-left:auto;"><i class="bi bi-robot"></i> ${st.icon} ${st.text}</span>`;
            }

            // NiuMa 控制区
            const dimensions = [
                { k: '', v: '⚖️ 均衡' },
                { k: 'ui', v: '🎨 颜值' },
                { k: 'userEffect', v: '❤️ 体验' },
                { k: 'codeQuality', v: '🛡️ 质量' },
                { k: 'efficiency', v: '⚡ 效率' }
            ];

            const btnText = isNiuMaActive ? '☕ 摸鱼' : '🐂 搬砖';
            // Stop propagation to prevent selecting the app when clicking buttons
            niuMaControls = `
                <div class="niuma-controls mt-2 d-flex flex-row gap-1 align-items-center" onclick="event.stopPropagation()" style="width: 100%;">
                    <button class="btn btn-sm ${isNiuMaActive ? 'btn-outline-danger' : 'btn-outline-primary'}" 
                        onclick="toggleNiuMa('${app.id}')"
                        style="white-space: nowrap; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;">
                        ${btnText}
                    </button>
                    <select class="form-select form-select-sm" style="flex-grow: 1; min-width: 0;" 
                        onchange="setNiuMaFocus('${app.id}', this.value)" 
                        onclick="event.stopPropagation()">
                        ${dimensions.map(d => `<option value="${d.k}" ${niuMaFocus === d.k ? 'selected' : ''}>${d.v}</option>`).join('')}
                    </select>
                </div>
            `;

            const displayStatusClass = statusClass === 'creating' ? 'starting' : statusClass;
            const displayStatusText = statusClass === 'creating' ? '生成中' : statusText;
            const displayStatusTextSafe = statusClass === 'creating' ? '\u751f\u6210\u4e2d' : statusText; // "生成中" safe string
            const displayStatusTextFinal = statusClass === 'creating'
                ? `${displayStatusTextSafe} ${this.formatElapsedFromIso(app.createdAt || app.updatedAt)}`
                : displayStatusTextSafe;

            const creatingFrom = app.createdAt || app.updatedAt || '';
            const badge = statusClass === 'creating'
                ? `<span class="badge ${displayStatusClass}">\u751f\u6210\u4e2d <span data-elapsed-from="${this.escapeHtml(creatingFrom)}">${this.formatElapsedFromIso(creatingFrom)}</span></span>`
                : `<span class="badge ${displayStatusClass}">${displayStatusTextFinal}</span>`;

            const ideaFile = app.ideaKey ? String(app.ideaKey).split(/[/\\\\]/).pop() : '';
            const isActive = this.activeApp && this.activeApp.id === app.id;

            return `
                <div class="app-row ${isActive ? 'active' : ''}" onclick="selectApp('${this.escapeHtml(app.id)}')">
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="name fw-bold">${this.escapeHtml(app.name || app.id)}</div>
                        ${niuMaBadge}
                    </div>
                    
                    <div class="meta mt-1">
                        ${badge}
                        <span class="badge bg-light text-dark border"><i class="bi bi-tag"></i> ${this.escapeHtml(app.type || 'default')}</span>
                        ${app.port ? `<span class="badge bg-light text-dark border"><i class="bi bi-router"></i> ${app.port}</span>` : ''}
                    </div>
                    
                    ${isActive || isNiuMaActive ? niuMaControls : ''}
                </div>
            `;
        }).join('');
    }

    filterApps() {
        this.renderApps();
    }

    createNewApp() {
        this.activeApp = null;
        this.activeIdeaKey = null;
        this.activeIdeaFileName = null;
        this.newAppMode = true;

        // 清空输入框并聚焦
        this.clearInput();
        const input = document.getElementById('chatInput');
        if (input) input.focus();

        // 刷新 UI 以显示默认的“添加灵感”界面
        this.renderApps();
        this.refreshConversation();
        this.refreshProject();
    }

    async selectApp(appId) {
        const app = this.apps.find(a => a.id === appId);
        if (!app) return;
        this.activeApp = app;
        this.activeIdeaKey = app.ideaKey || null;
        this.activeIdeaFileName = this.activeIdeaKey ? String(this.activeIdeaKey).split(/[/\\\\]/).pop() : null;
        this.activeTreeSelectedPath = null;

        this.renderApps();
        await this.refreshConversation();
        await this.refreshProject();
        this.autoPickRightTab();
        this.applyRightTab();
        this.updateRunButtons();
    }

    maybeAutoSelectFromIdeaKey(ideaKey) {
        if (this.isAutoSelecting) return false;
        if (!ideaKey || typeof ideaKey !== 'string') return false;

        const app = this.apps.find(a => a.ideaKey === ideaKey);
        if (!app) return false;

        this.isAutoSelecting = true;
        this.activeApp = app;
        this.activeIdeaKey = app.ideaKey || null;
        this.activeIdeaFileName = this.activeIdeaKey ? String(this.activeIdeaKey).split(/[/\\\\]/).pop() : null;
        this.activeTreeSelectedPath = null;
        this.renderApps();
        this.updateRunButtons();
        this.isAutoSelecting = false;
        return true;
    }

    autoPickRightTab() {
        if (this.activeApp?.status === 'running' && this.activeApp?.port) {
            this.rightTab = 'preview';
        } else {
            this.rightTab = 'tree';
        }
    }

    setRightTab(tab) {
        if (tab !== 'tree' && tab !== 'preview') return;
        this.rightTab = tab;
        this.applyRightTab();
        this.refreshProject();
    }

    applyRightTab() {
        const tabTree = document.getElementById('tabTree');
        const tabPreview = document.getElementById('tabPreview');
        const viewTree = document.getElementById('rightTreeView');
        const viewPreview = document.getElementById('rightPreviewView');
        const shell = document.getElementById('shell');

        const isTree = this.rightTab === 'tree';
        if (tabTree) tabTree.classList.toggle('active', isTree);
        if (tabPreview) tabPreview.classList.toggle('active', !isTree);
        if (viewTree) viewTree.classList.toggle('active', isTree);
        if (viewPreview) viewPreview.classList.toggle('active', !isTree);
        if (shell) shell.classList.toggle('preview-mode', this.rightTab === 'preview' && !this.rightCollapsed);
    }

    updateRunButtons() {
        const runBtn = document.getElementById('runBtn');
        const previewStatus = document.getElementById('previewStatus');
        const openTabBtn = document.getElementById('openTabBtn');
        const activeAppBadge = document.getElementById('activeAppBadge');

        if (!runBtn || !previewStatus || !openTabBtn) return;
        if (!this.activeApp) {
            // 未显式选中 app：若已有应用，允许点击“启动”自动选择最近的应用
            runBtn.disabled = !(this.apps && this.apps.length);
            openTabBtn.disabled = true;
            previewStatus.textContent = '';
            if (activeAppBadge) activeAppBadge.textContent = '';
            runBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
            return;
        }

        runBtn.disabled = false;
        openTabBtn.disabled = !this.activeApp.port;
        if (activeAppBadge) activeAppBadge.textContent = this.activeApp.name || this.activeApp.id;

        if (this.activeApp.status === 'creating' || this.activeApp.type === 'pending') {
            runBtn.disabled = true;
            openTabBtn.disabled = true;
            runBtn.innerHTML = '<i class="bi bi-hourglass-split"></i>';
            const iso = this.activeApp.createdAt || this.activeApp.updatedAt || '';
            previewStatus.innerHTML = `\u751f\u6210\u4e2d <span data-elapsed-from="${this.escapeHtml(iso)}">${this.formatElapsedFromIso(iso)}</span>`;
            return;
        }
        if (this.activeApp.status === 'running' && this.activeApp.port) {
            runBtn.innerHTML = '<i class="bi bi-stop-fill"></i>';
            previewStatus.textContent = `运行中 :${this.activeApp.port}`;
        } else {
            runBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
            previewStatus.textContent = '';
        }
    }

    async toggleRun() {
        if (!this.activeApp) {
            // 自动选择一个应用（优先：最近任务关联的 app/ideaKey，其次：最新创建的 app）
            await this.refreshApps();
            const inferred = await this.inferActiveApp();
            if (inferred) {
                await this.selectApp(inferred.id);
            }
        }
        if (!this.activeApp) return;
        try {
            if (this.activeApp.status === 'running') {
                await fetch(`/api/apps/${encodeURIComponent(this.activeApp.id)}/stop`, { method: 'POST' });
            } else {
                await fetch(`/api/apps/${encodeURIComponent(this.activeApp.id)}/start`, { method: 'POST' });
            }
        } finally {
            // 等待后刷新列表与预览
            setTimeout(() => this.refreshApps().then(() => this.refreshProject()), 1500);
        }
    }

    async inferActiveApp() {
        // 1) 从最近任务里找 appId
        const tasks = await this.fetchTasks();
        const latestWithApp = [...tasks].reverse().find(t => t && t.app && t.app.id);
        if (latestWithApp?.app?.id) {
            const hit = this.apps.find(a => a.id === latestWithApp.app.id);
            if (hit) return hit;
        }

        // 2) 从最近任务里找 ideaKey
        const latestWithIdeaKey = [...tasks].reverse().find(t => typeof t.ideaKey === 'string' && t.ideaKey);
        if (latestWithIdeaKey?.ideaKey) {
            const hit = this.apps.find(a => a.ideaKey === latestWithIdeaKey.ideaKey);
            if (hit) return hit;
        }

        // 3) 退化：选最新创建的 app（createdAt 最大）
        const sorted = [...(this.apps || [])].sort((a, b) => {
            const at = Date.parse(a.createdAt || a.lastOutputAt || 0) || 0;
            const bt = Date.parse(b.createdAt || b.lastOutputAt || 0) || 0;
            return bt - at;
        });
        return sorted[0] || null;
    }

    openPreviewTab() {
        if (!this.activeApp?.port) return;
        window.open(`http://localhost:${this.activeApp.port}`, '_blank');
    }

    clearInput() {
        const el = document.getElementById('chatInput');
        if (el) {
            el.value = '';
            el.dispatchEvent(new Event('input'));
        }
    }

    async sendIteration() {
        const input = document.getElementById('chatInput');
        if (!input) return;
        const content = input.value.trim();
        if (!content) return;

        // 绑定：优先使用当前 app 的 ideaKey 文件名；否则新建一个 web 文件
        const fileName = (this.newAppMode ? null : this.activeIdeaFileName) || `idea_web_${Date.now()}.txt`;

        // ✅ 乐观更新：立即添加用户气泡（提交前）
        const tempIdeaKey = this.activeIdeaKey || `temp_${Date.now()}`;
        const currentRevision = this.activeApp?.ideaHistory?.length || 0;

        this.pendingIdeas.set(tempIdeaKey, {
            revision: currentRevision + 1,
            content,
            timestamp: new Date().toISOString()
        });

        // 立即刷新 UI 显示用户气泡
        this.refreshConversation();

        // 清空输入框
        input.value = '';
        input.dispatchEvent(new Event('input'));

        try {
            const res = await fetch('/api/idea-files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName, content })
            });

            if (!res.ok) {
                throw new Error(`提交失败: ${res.status}`);
            }

            const data = await res.json();
            if (data && data.ideaKey) {
                // 用真实 ideaKey 替换临时数据
                if (tempIdeaKey !== data.ideaKey && this.pendingIdeas.has(tempIdeaKey)) {
                    this.pendingIdeas.delete(tempIdeaKey);
                }
                this.activeIdeaKey = data.ideaKey;
                this.activeIdeaFileName = data.fileName || String(data.ideaKey).split(/[/\\]/).pop();
            }
        } catch (error) {
            // ✅ 提交失败：清除临时数据并提示
            this.pendingIdeas.delete(tempIdeaKey);
            console.error('提交想法失败:', error);
            // 可选：显示错误提示
            alert(`提交失败: ${error.message}`);
            // 恢复输入内容
            input.value = content;
            input.dispatchEvent(new Event('input'));
            return;
        }

        this.newAppMode = false;
        await this.refreshConversation();
        // 应用可能在首次成功后才出现 ideaKey/appId 对应关系
        setTimeout(() => this.refreshApps(), 1500);
    }

    async refreshConversation() {
        const stream = document.getElementById('chatStream');
        const centerPane = document.getElementById('centerPane');
        if (!stream) return;

        const tasks = await this.fetchTasks();
        this.hasProcessing = Array.isArray(tasks) && tasks.some(t => t && t.status === 'processing');

        if (this.newAppMode) {
            stream.innerHTML = `<div class="text-muted"></div>`;
            if (centerPane) centerPane.classList.add('center-empty');
            return;
        }

        // 未选择应用时：默认展示“最近 ideaKey”的对话，并尽可能自动选中对应 app
        if (!this.activeApp) {
            const latestWithIdeaKey = [...tasks].reverse().find(t => typeof t.ideaKey === 'string' && t.ideaKey);
            const inferredIdeaKey = latestWithIdeaKey ? latestWithIdeaKey.ideaKey : null;
            if (inferredIdeaKey) {
                this.maybeAutoSelectFromIdeaKey(inferredIdeaKey);
                this.activeIdeaKey = inferredIdeaKey;
                this.activeIdeaFileName = String(inferredIdeaKey).split(/[/\\\\]/).pop();
            }
        }

        const ideaKey = this.activeIdeaKey || null;
        const related = ideaKey ? tasks.filter(t => t.ideaKey === ideaKey) : tasks;
        const pendingForKey = ideaKey && this.pendingIdeas.has(ideaKey) ? this.pendingIdeas.get(ideaKey) : null;

        // 优先使用应用自身的 ideaHistory 渲染“对话流”，避免任务队列只保留最近 N 条导致启动后对话消失
        const appHistory = this.activeApp && Array.isArray(this.activeApp.ideaHistory) ? this.activeApp.ideaHistory : [];

        const messages = [];
        if (appHistory.length) {
            // 只展示最近 20 轮
            const recent = appHistory.slice(-20);
            const seenTaskIds = new Set();
            const seenRevisions = new Set();
            for (const h of recent) {
                const text = (h && typeof h.text === 'string') ? h.text : '';
                const rev = h && h.revision != null ? String(h.revision) : '';
                if (h && h.revision != null) seenRevisions.add(h.revision);
                if (text) {
                    messages.push({ role: 'user', text, meta: rev ? `rev ${rev}` : '' });
                }

                // assistant：优先用保存到 history 的 assistantPreview，其次用任务状态/流式输出
                const preview = h && typeof h.assistantPreview === 'string' ? h.assistantPreview : '';
                if (preview) {
                    messages.push({ role: 'assistant', text: preview, meta: '' });
                    continue;
                }

                const task = related.find(t => (h.revision != null && t.revision === h.revision)) || null;
                if (task) {
                    if (task.id) seenTaskIds.add(task.id);
                    if (task.status === 'processing') {
                        const live = this.liveByTaskId.get(task.id);
                        const elapsed = this.formatElapsedFromIso(task.startedAt || task.createdAt);
                        messages.push({ role: 'assistant', text: live || `处理中… (${elapsed})`, meta: `processing ${elapsed}` });
                    } else if (task.status === 'completed') {
                        messages.push({ role: 'assistant', text: this.buildAssistantSummary(task), meta: '' });
                        this.liveByTaskId.delete(task.id);
                    } else if (task.status === 'failed') {
                        messages.push({ role: 'assistant', text: `失败：${task.error || '未知错误'}`, meta: 'failed' });
                        this.liveByTaskId.delete(task.id);
                    } else {
                        messages.push({ role: 'assistant', text: '等待执行…', meta: 'pending' });
                    }
                } else {
                    // 没有对应任务（可能被队列裁剪），仍保持一问一答结构
                    messages.push({ role: 'assistant', text: '', meta: '' });
                }
            }

            // 当任务还在进行、metadata.ideaHistory 尚未写回时，补齐本轮增量输入的气泡（从 tasks 渲染）。
            const extras = related
                .filter(t => t && t.id && !seenTaskIds.has(t.id))
                .filter(t => (t.revision == null) || !seenRevisions.has(t.revision))
                .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

            for (const t of extras) {
                const userText = t.idea?.content || '';
                if (userText) {
                    messages.push({ role: 'user', text: userText, meta: `rev ${t.revision || ''}`.trim() });
                }
                if (t.status === 'processing') {
                    const live = this.liveByTaskId.get(t.id);
                    const elapsed = this.formatElapsedFromIso(t.startedAt || t.createdAt);
                    messages.push({ role: 'assistant', text: live || `处理中…(${elapsed})`, meta: `processing ${elapsed}` });
                } else if (t.status === 'completed') {
                    messages.push({ role: 'assistant', text: this.buildAssistantSummary(t), meta: '' });
                    this.liveByTaskId.delete(t.id);
                } else if (t.status === 'failed') {
                    messages.push({ role: 'assistant', text: `失败：${t.error || '未知错误'}`, meta: 'failed' });
                    this.liveByTaskId.delete(t.id);
                } else {
                    messages.push({ role: 'assistant', text: '等待执行…', meta: 'pending' });
                }
            }
        } else {
            // fallback：用任务队列渲染
            for (const t of related) {
                const userText = t.idea?.content || '';
                if (userText) {
                    messages.push({ role: 'user', text: userText, meta: `rev ${t.revision || ''}`.trim() });
                }
                if (t.status === 'processing') {
                    const live = this.liveByTaskId.get(t.id);
                    const elapsed = this.formatElapsedFromIso(t.startedAt || t.createdAt);
                    messages.push({ role: 'assistant', text: live || `处理中… (${elapsed})`, meta: `processing ${elapsed}` });
                }
                if (t.status === 'completed') {
                    const assistantText = this.buildAssistantSummary(t);
                    messages.push({ role: 'assistant', text: assistantText, meta: t.app?.id ? `app ${t.app.id}` : '' });
                    this.liveByTaskId.delete(t.id);
                }
                if (t.status === 'failed') {
                    messages.push({ role: 'assistant', text: `失败：${t.error || '未知错误'}`, meta: 'failed' });
                    this.liveByTaskId.delete(t.id);
                }
            }
        }

        // 如果没有任务，但收到了 newIdea（或 taskUpdate 丢失），也显示一个待执行的“你”气泡
        // ✅ 修复重复显示问题：只有当 messages 里没有相同的文本时才添加 pending
        if (pendingForKey && pendingForKey.content) {
            const alreadyExists = messages.some(m => m.role === 'user' && m.text === pendingForKey.content);
            if (!alreadyExists) {
                const meta = pendingForKey.revision != null ? `rev ${pendingForKey.revision}` : '';
                messages.push({ role: 'user', text: pendingForKey.content, meta });
                messages.push({ role: 'assistant', text: '等待执行…', meta: 'pending' });
            }
        }

        // ✅ 检查当前 App 是否有正在进行的 NiuMa 任务（赛博牛马）
        const niuMaState = this.activeApp ? this.niurnaStates[this.activeApp.id] : null;
        if (niuMaState && niuMaState.status === 'working' && niuMaState.currentTaskId) {
            const taskId = niuMaState.currentTaskId;
            const alreadyShown = messages.some(m => m.meta && m.meta.includes('processing') && this.liveByTaskId.get(taskId));

            if (!alreadyShown) {
                const live = this.liveByTaskId.get(taskId);
                const elapsed = this.formatElapsedFromIso(niuMaState.lastIterateAt || new Date().toISOString());
                const text = live || `🐂 牛马正在大力搬砖中... (${elapsed})\n🎯 专注维度：${niuMaState.focusDimension || '均衡'}\n💭 正在思考如何让老板满意...`;
                messages.push({
                    role: 'assistant',
                    text: text,
                    meta: `processing ${elapsed} (NiuMa)`
                });
            }
        }

        if (messages.length === 0) {
            stream.innerHTML = `<div class="text-muted"></div>`;
            if (centerPane) centerPane.classList.add('center-empty');
            return;
        }

        if (centerPane) centerPane.classList.remove('center-empty');

        stream.innerHTML = messages.map(m => {
            if (m.role === 'assistant' && !m.text) return '';
            const icon = m.role === 'user' ? '<i class="bi bi-person"></i>' : '<i class="bi bi-robot"></i>';
            const label = m.role === 'user' ? '你' : 'iFlow';
            const meta = m.meta ? `<span class="badge">${this.escapeHtml(m.meta)}</span>` : '';
            return `
                <div class="msg-row ${m.role}">
                    <div class="msg ${m.role}">
                        <div class="label">${icon} ${label} ${meta}</div>
                        <div class="msg-text">${this.escapeHtml(m.text)}</div>
                    </div>
                </div>
            `;
        }).join('');

        // scroll to bottom
        stream.scrollTop = stream.scrollHeight;
    }

    scheduleRefreshConversation() {
        if (this.refreshConversationTimer) return;
        this.refreshConversationTimer = setTimeout(() => {
            this.refreshConversationTimer = null;
            this.refreshConversation();
        }, 200);
    }

    scheduleRefreshApps() {
        if (this.refreshAppsTimer) return;
        this.refreshAppsTimer = setTimeout(() => {
            this.refreshAppsTimer = null;
            this.refreshApps();
        }, 300);
    }

    onTaskStream(payload) {
        if (!payload || !payload.taskId) return;
        const current = this.liveByTaskId.get(payload.taskId) || '';

        if (payload.type === 'assistant_chunk' && typeof payload.text === 'string' && payload.text) {
            const next = (current + payload.text).slice(-12000);
            this.liveByTaskId.set(payload.taskId, next);
            this.scheduleRefreshConversation();
            return;
        }

        if ((payload.type === 'status' || payload.type === 'log') && typeof payload.text === 'string' && payload.text) {
            const next = (current + (current ? '\n' : '') + payload.text).slice(-12000);
            this.liveByTaskId.set(payload.taskId, next);
            this.scheduleRefreshConversation();
        }
    }

    buildAssistantSummary(task) {
        // ✅ 优先展示完整日志（包含提示词和执行过程）
        if (task.result && task.result.logs) {
            return task.result.logs;
        }

        const app = task.app;
        const lines = [];
        if (app?.port) lines.push(`http://localhost:${app.port}`);
        if (task.outputFile) lines.push(`${task.outputFile}`);
        return lines.join('\n') || '已完成';
    }

    async fetchTasks() {
        try {
            const res = await fetch('/api/tasks');
            const data = await res.json();
            const flat = [];

            const push = (arr, status) => {
                (arr || []).forEach(t => flat.push({ ...t, status }));
            };

            push(data.pending, 'pending');
            push(data.processing, 'processing');
            push(data.completed, 'completed');
            push(data.failed, 'failed');

            // keep only last 50 per ideaKey for UI
            const normalized = flat.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)).slice(-200);
            this.tasksCache = normalized;
            return normalized;
        } catch {
            return Array.isArray(this.tasksCache) ? this.tasksCache : [];
        }
    }

    normalizeTasksPayload(data) {
        try {
            const flat = [];
            const push = (arr, status) => {
                (arr || []).forEach(t => flat.push({ ...t, status }));
            };
            push(data?.pending, 'pending');
            push(data?.processing, 'processing');
            push(data?.completed, 'completed');
            push(data?.failed, 'failed');
            return flat.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)).slice(-200);
        } catch {
            return Array.isArray(this.tasksCache) ? this.tasksCache : [];
        }
    }

    upsertTaskCache(task) {
        if (!task || !task.id) return;
        const cache = Array.isArray(this.tasksCache) ? [...this.tasksCache] : [];
        const idx = cache.findIndex(t => t && t.id === task.id);
        if (idx >= 0) {
            cache[idx] = { ...cache[idx], ...task };
        } else {
            cache.push(task);
        }
        if (task.ideaKey) {
            // 一旦进入队列/开始处理，就不再需要“pendingIdeas”的占位气泡
            this.pendingIdeas.delete(task.ideaKey);
        }
        this.tasksCache = cache
            .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
            .slice(-200);
    }

    async refreshProject() {
        const treeEl = document.getElementById('tree');
        const fileView = document.getElementById('fileView');
        const projectPath = document.getElementById('projectPath');
        const iframe = document.getElementById('previewFrame');
        const previewStatus = document.getElementById('previewStatus');

        if (!treeEl || !fileView || !projectPath || !iframe) return;

        if (!this.activeApp) {
            projectPath.textContent = '未选择';
            treeEl.innerHTML = `<div class="text-muted">选择应用后显示目录</div>`;
            fileView.style.display = 'none';
            iframe.removeAttribute('src');
            if (previewStatus) previewStatus.textContent = '未选择';
            return;
        }

        projectPath.textContent = this.activeApp.id;

        // iframe 仅在“预览”Tab激活时加载，避免占比过大/抢占布局
        if (this.rightTab === 'preview' && this.activeApp.status === 'running' && this.activeApp.port) {
            iframe.src = `http://localhost:${this.activeApp.port}`;
        } else {
            iframe.removeAttribute('src');
        }

        try {
            const res = await fetch(`/api/apps/${encodeURIComponent(this.activeApp.id)}/tree?depth=4`);
            const data = await res.json();
            if (!data.success) {
                treeEl.innerHTML = `<div class="text-muted">无法加载目录</div>`;
                return;
            }
            treeEl.innerHTML = this.renderTree(data.tree, 0);
        } catch {
            treeEl.innerHTML = `<div class="text-muted">无法加载目录</div>`;
        }
    }

    renderTree(node, indent) {
        if (!node) return '';
        const pad = '&nbsp;'.repeat(indent * 4);
        const icon = node.type === 'dir' ? '<i class="bi bi-folder2"></i>' : '<i class="bi bi-file-earmark-text"></i>';
        const isActive = this.activeTreeSelectedPath && this.activeTreeSelectedPath === node.path;
        const click = node.type === 'file'
            ? `onclick="openFile(${JSON.stringify(node.path)})"`
            : '';

        let html = `<div class="tree-item ${isActive ? 'active' : ''}" ${click}>${pad}${icon} ${this.escapeHtml(node.name)}</div>`;
        if (node.type === 'dir' && Array.isArray(node.children)) {
            for (const child of node.children) {
                html += this.renderTree(child, indent + 1);
            }
        }
        return html;
    }

    async openFile(relPath) {
        if (!this.activeApp) return;
        this.activeTreeSelectedPath = relPath;

        const fileView = document.getElementById('fileView');
        if (!fileView) return;
        fileView.style.display = 'block';
        fileView.textContent = '加载中...';

        try {
            const res = await fetch(`/api/apps/${encodeURIComponent(this.activeApp.id)}/file?path=${encodeURIComponent(relPath)}`);
            const data = await res.json();
            if (!data.success) {
                fileView.textContent = data.error || '读取失败';
                return;
            }
            fileView.textContent = data.content || '';
            await this.refreshProject(); // re-render tree highlight
        } catch {
            fileView.textContent = '读取失败';
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = String(text ?? '');
        return div.innerHTML;
    }
}

let ui;
document.addEventListener('DOMContentLoaded', () => {
    ui = new ManusUI();
});

// Global bindings
window.refreshAll = () => ui.refreshAll();
window.refreshApps = () => ui.refreshApps();
window.filterApps = () => ui.filterApps();
window.selectApp = (appId) => ui.selectApp(appId);
window.newApp = () => ui.startNewApp();
window.sendIteration = () => ui.sendIteration();
window.clearInput = () => ui.clearInput();
window.refreshProject = () => ui.refreshProject();
window.openFile = (relPath) => ui.openFile(relPath);
window.toggleRun = () => ui.toggleRun();
window.openPreviewTab = () => ui.openPreviewTab();
window.setRightTab = (tab) => ui.setRightTab(tab);
window.toggleLeftPane = () => ui.toggleLeftPane();
window.toggleRightPane = () => ui.toggleRightPane();
window.newApp = () => ui.createNewApp();
window.refreshApps = () => ui.refreshApps();
window.refreshAll = () => ui.refreshAll();

// ========== 赛博牛马控制 (Cyber NiuMa) ==========

let autoIterateState = null;

// 切换自动迭代
window.toggleAutoIterate = async () => {
    if (!ui.activeApp) {
        alert('请先选择一个应用');
        return;
    }
    const appId = ui.activeApp.id;
    await window.toggleNiuMa(appId);
};

// 切换指定应用的牛马（独立控制）
window.toggleNiuMa = async (appId) => {
    try {
        const res = await fetch(`/api/apps/${encodeURIComponent(appId)}/auto-iterate`);
        const data = await res.json();
        const isRunning = data.state && data.state.enabled;

        if (isRunning) {
            await fetch(`/api/apps/${encodeURIComponent(appId)}/auto-iterate/stop`, { method: 'POST' });
        } else {
            await fetch(`/api/apps/${encodeURIComponent(appId)}/auto-iterate/start`, { method: 'POST' });
        }

        await ui.refreshNiuMaStation();
        ui.renderApps();
    } catch (e) {
        console.error('牛马控制失败', e);
    }
};

// 设置指定应用的牛马关注维度
window.setNiuMaFocus = async (appId, dimension) => {
    try {
        await fetch(`/api/apps/${encodeURIComponent(appId)}/auto-iterate/focus`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dimension })
        });
        await ui.refreshNiuMaStation();
        ui.renderApps();
        console.log(`🎯 牛马 ${appId} 关注维度设置为: ${dimension || '均衡'}`);
    } catch (e) {
        console.error('设置关注维度失败', e);
    }
};

// 刷新自动迭代状态
async function refreshAutoIterateState() {
    if (!ui.activeApp) {
        updateAutoIterateUI(null);
        return;
    }
    try {
        const res = await fetch(`/api/apps/${encodeURIComponent(ui.activeApp.id)}/auto-iterate`);
        const data = await res.json();
        autoIterateState = data.state;
        updateAutoIterateUI(autoIterateState);
    } catch (e) {
        updateAutoIterateUI(null);
    }
}

// 更新自动迭代 UI
function updateAutoIterateUI(state) {
    const statusEl = document.getElementById('iterateStatusDisplay');
    const focusSelect = document.getElementById('focusDimensionSelect');

    if (!state) {
        if (statusEl) statusEl.textContent = '待命';
        if (focusSelect) focusSelect.value = '';
        return;
    }

    if (statusEl) {
        const statusMap = {
            'idle': '待命',
            'working': '搬砖中🔥',
            'resting': '摸鱼中☕',
            'paused': '暂停⏸️'
        };
        statusEl.textContent = statusMap[state.status] || state.status;
    }
    if (focusSelect && state.focusDimension !== undefined) {
        focusSelect.value = state.focusDimension || '';
    }
}

// 更新工作站统计 UI
function updateStationUI() {
    if (!ui || !ui.niuMaStation) return;

    const station = ui.niuMaStation.station;
    const generator = ui.niuMaStation.generator;

    // 更新工作站统计
    const workingEl = document.getElementById('workingCount');
    const totalIterEl = document.getElementById('totalIterations');
    if (station) {
        if (workingEl) workingEl.textContent = station.workingCount || 0;
        if (totalIterEl) totalIterEl.textContent = station.totalIterations || 0;
    }

    // 更新想法生成器状态
    const genBtn = document.getElementById('toggleGeneratorBtn');
    const genBadge = document.getElementById('generatorStatusBadge');
    if (generator) {
        if (genBtn) {
            genBtn.textContent = generator.enabled ? '停止' : '启动';
            genBtn.style.background = generator.enabled ? 'rgba(231, 76, 60, 0.2)' : 'rgba(155, 89, 182, 0.2)';
        }
        if (genBadge) {
            genBadge.textContent = generator.enabled ? `转动中 (${generator.todayCount}/${generator.maxIdeasPerDay})` : '停止';
            genBadge.style.background = generator.enabled ? 'rgba(46, 204, 113, 0.3)' : 'rgba(149, 165, 166, 0.3)';
        }
    }
}

// 切换想法生成器
window.toggleIdeaGenerator = async () => {
    try {
        const res = await fetch('/api/idea-generator');
        const data = await res.json();
        const isRunning = data.enabled;

        if (isRunning) {
            await fetch('/api/idea-generator/stop', { method: 'POST' });
        } else {
            await fetch('/api/idea-generator/start', { method: 'POST' });
        }
        await ui.refreshNiuMaStation();
        updateStationUI();
    } catch (e) {
        console.error('切换想法生成器失败', e);
    }
};

// 定期刷新状态
setInterval(async () => {
    if (ui) {
        await ui.refreshNiuMaStation();
        updateStationUI();
        if (ui.activeApp) {
            await refreshAutoIterateState();
        }
    }
}, 5000);

// 在选择应用时刷新自动迭代状态
const originalSelectApp = ui ? ui.selectApp.bind(ui) : null;
if (ui && originalSelectApp) {
    ui.selectApp = async function (appId) {
        await originalSelectApp(appId);
        await refreshAutoIterateState();
        updateStationUI();
    };
}

// 初始加载时更新工作站 UI
setTimeout(() => {
    if (ui) {
        ui.refreshNiuMaStation().then(() => updateStationUI());
    }
}, 2000);
