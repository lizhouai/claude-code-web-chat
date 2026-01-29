/**
 * 会话管理系统
 * 功能：会话创建、删除、重命名、持久化存储
 */
class SessionManager {
    constructor(chatApp = null) {
        this.sessions = new Map();
        this.currentSessionId = null;
        this.sessionStoragePath = '/api/v1/sessions';
        this.defaultSessionName = '新对话';
        this.maxSessionNameLength = 50;
        this.chatApp = chatApp;
        
        this.init();
    }
    
    async init() {
        try {
            // 启动时进行数据同步
            await this.initializeWithSync();
            this.renderSessionList();
            
            // 如果没有会话，创建默认会话
            if (this.sessions.size === 0) {
                await this.createSession();
            } else {
                // 尝试恢复上次选中的会话
                this.restoreLastSelectedSession();
            }
            
            // 启动定期同步
            this.startPeriodicSync();
            
        } catch (error) {
            console.error('初始化会话管理器失败:', error);
            // 创建默认会话作为fallback
            await this.createSession();
        }
    }
    
    /**
     * 初始化时进行数据同步
     */
    async initializeWithSync() {
        console.log('开始初始化数据同步...');
        
        // 首先加载localStorage中的数据
        this.loadSessionsFromLocalStorage();
        const localSessions = Array.from(this.sessions.values());
        
        try {
            // 尝试与服务器合并数据
            const response = await fetch(`${this.sessionStoragePath}/merge`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(localSessions)
            });
            
            if (response.ok) {
                const mergeResult = await response.json();
                console.log('数据合并成功:', mergeResult.stats);
                
                // 更新本地数据
                this.sessions.clear();
                const updatedSessions = [];

                for (const sessionData of mergeResult.sessions) {
                    // 检查是否需要兼容性处理
                    const hadSettings = !!sessionData.settings;
                    const hadMode = hadSettings && !!sessionData.settings.mode;

                    // 确保历史会话有正确的settings和mode字段
                    this.ensureSessionSettingsCompat(sessionData);
                    this.sessions.set(sessionData.id, sessionData);

                    // 如果添加了新的设置字段，记录需要更新的会话
                    if (!hadSettings || !hadMode) {
                        updatedSessions.push(sessionData);
                        console.log(`为合并会话 ${sessionData.id} 添加了mode字段:`, sessionData.settings.mode);
                    }
                }

                // 立即保存有变化的会话到服务器
                if (updatedSessions.length > 0) {
                    for (const session of updatedSessions) {
                        try {
                            await this.saveSession(session);
                        } catch (error) {
                            console.warn(`更新合并会话 ${session.id} 失败:`, error);
                        }
                    }
                    console.log(`已更新 ${updatedSessions.length} 个合并会话的设置`);
                }

                // 同步更新localStorage
                this.syncAllToLocalStorage();
                
                // 处理冲突
                if (mergeResult.conflicts.length > 0) {
                    this.handleSyncConflicts(mergeResult.conflicts);
                }
                
                console.log(`同步完成: 本地${mergeResult.stats.total_local}个, 服务器${mergeResult.stats.total_server}个, 合并后${mergeResult.sessions.length}个会话`);
            } else {
                throw new Error(`服务器响应错误: ${response.status}`);
            }
        } catch (error) {
            console.warn('无法连接服务器，使用本地数据:', error.message);
            // 服务器不可用时，继续使用localStorage数据
        }
    }
    
    /**
     * 创建新会话
     * @param {string} name - 会话名称
     * @returns {string} 新会话的ID
     */
    getDefaultSettings() {
        // 从ChatApp获取general模式的默认配置
        if (this.chatApp && this.chatApp.modeConfigs && this.chatApp.modeConfigs.general) {
            const generalConfig = this.chatApp.modeConfigs.general;
            return {
                mode: 'general', // 添加模式字段
                systemPrompt: generalConfig.systemPrompt,
                maxTurns: generalConfig.maxTurns,
                allowedTools: [...generalConfig.allowedTools]
            };
        }

        // 如果无法获取ChatApp配置，使用fallback默认值
        return {
            mode: 'general', // 默认使用General Model
            systemPrompt: '你是一个非常实用的助手。',
            maxTurns: 20,
            allowedTools: ['WebSearch', 'Read']
        };
    }
    
    async createSession(name = null) {
        const sessionId = this.generateSessionId();
        const sessionName = name || this.generateDefaultSessionName();
        
        const session = {
            id: sessionId,
            name: sessionName,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: [],
            settings: this.getDefaultSettings()
        };
        
        this.sessions.set(sessionId, session);
        
        try {
            await this.saveSession(session);
            this.renderSessionList();
            this.setCurrentSession(sessionId);
            
            // 立即同步到localStorage
            this.saveSessionToLocalStorage(session);
            
            // 通知会话数量变化
            this.onSessionCountChange();
            
            return sessionId;
        } catch (error) {
            console.error('保存会话失败:', error);
            this.sessions.delete(sessionId);
            throw error;
        }
    }
    
    /**
     * 删除会话
     * @param {string} sessionId - 会话ID
     */
    async deleteSession(sessionId) {
        if (!this.sessions.has(sessionId)) {
            throw new Error('会话不存在');
        }
        
        if (this.sessions.size <= 1) {
            throw new Error('不能删除最后一个会话');
        }
        
        try {
            await this.removeSessionFromStorage(sessionId);
            this.sessions.delete(sessionId);
            
            // 立即从localStorage删除
            this.removeSessionFromLocalStorage(sessionId);

            // 清除当前会话ID记录（如果删除的是当前会话）
            this.clearCurrentSessionIdIfMatch(sessionId);

            // 如果删除的是当前会话，切换到最近更新的会话
            if (this.currentSessionId === sessionId) {
                this.restoreLastSelectedSession();
            }
            
            this.renderSessionList();
            
            // 通知会话数量变化
            this.onSessionCountChange();
        } catch (error) {
            console.error('删除会话失败:', error);
            throw error;
        }
    }
    
    /**
     * 重命名会话
     * @param {string} sessionId - 会话ID
     * @param {string} newName - 新名称
     */
    async renameSession(sessionId, newName) {
        if (!this.sessions.has(sessionId)) {
            throw new Error('会话不存在');
        }
        
        const trimmedName = newName.trim();
        if (!trimmedName) {
            throw new Error('会话名称不能为空');
        }
        
        if (trimmedName.length > this.maxSessionNameLength) {
            throw new Error(`会话名称不能超过${this.maxSessionNameLength}个字符`);
        }
        
        const session = this.sessions.get(sessionId);
        session.name = trimmedName;
        session.updatedAt = new Date().toISOString();
        
        try {
            await this.saveSession(session);
            this.renderSessionList();
            
            // 立即同步到localStorage
            this.saveSessionToLocalStorage(session);
            
        } catch (error) {
            console.error('重命名会话失败:', error);
            throw error;
        }
    }
    
    /**
     * 设置当前活动会话
     * @param {string} sessionId - 会话ID
     */
    setCurrentSession(sessionId) {
        if (!this.sessions.has(sessionId)) {
            throw new Error('会话不存在');
        }
        
        // 如果是同一个会话，直接返回
        if (this.currentSessionId === sessionId) {
            return;
        }
        
        this.currentSessionId = sessionId;

        // 保存当前选中的会话到localStorage
        this.saveCurrentSessionId(sessionId);

        // 只更新会话列表的激活状态，不重新渲染整个列表
        this.updateSessionListActiveState();

        // 触发会话切换事件
        this.onSessionChange(sessionId);
    }
    
    /**
     * 获取当前会话
     * @returns {Object|null} 当前会话对象
     */
    getCurrentSession() {
        if (!this.currentSessionId) {
            return null;
        }
        return this.sessions.get(this.currentSessionId);
    }
    
    /**
     * 更新当前会话的消息
     * @param {Array} messages - 消息列表
     */
    async updateCurrentSessionMessages(messages) {
        const session = this.getCurrentSession();
        if (!session) {
            throw new Error('没有活动会话');
        }
        
        session.messages = messages;
        session.updatedAt = new Date().toISOString();
        
        // 实时更新UI中的消息数量
        this.updateSessionMessageCount(session.id, messages.length);
        
        try {
            await this.saveSession(session);
        } catch (error) {
            console.error('保存会话消息失败:', error);
        }
    }
    
    /**
     * 更新当前会话的设置
     * @param {Object} settings - 会话设置
     */
    async updateCurrentSessionSettings(settings) {
        const session = this.getCurrentSession();
        if (!session) {
            throw new Error('没有活动会话');
        }

        session.settings = { ...session.settings, ...settings };
        session.updatedAt = new Date().toISOString();

        try {
            await this.saveSession(session);

            // 立即同步到localStorage
            this.saveSessionToLocalStorage(session);
        } catch (error) {
            console.error('保存会话设置失败:', error);
        }
    }

    /**
     * 更新当前会话的模式
     * @param {string} mode - 新的模式
     */
    async updateCurrentSessionMode(mode) {
        const session = this.getCurrentSession();
        if (!session) {
            throw new Error('没有活动会话');
        }

        // 获取新模式的默认配置
        if (this.chatApp && this.chatApp.modeConfigs && this.chatApp.modeConfigs[mode]) {
            const modeConfig = this.chatApp.modeConfigs[mode];
            session.settings = {
                mode: mode,
                systemPrompt: modeConfig.systemPrompt,
                maxTurns: modeConfig.maxTurns,
                allowedTools: [...modeConfig.allowedTools]
            };
        } else {
            // 如果模式不存在，保持原有设置但更新模式
            session.settings.mode = mode;
        }

        session.updatedAt = new Date().toISOString();

        try {
            await this.saveSession(session);

            // 立即同步到localStorage
            this.saveSessionToLocalStorage(session);
        } catch (error) {
            console.error('保存会话模式失败:', error);
        }
    }
    
    /**
     * 从存储加载所有会话
     */
    async loadSessions() {
        try {
            const response = await fetch(`${this.sessionStoragePath}/list`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const sessionList = await response.json();
            
            this.sessions.clear();
            const updatedSessions = [];

            for (const sessionData of sessionList) {
                // 检查是否需要兼容性处理
                const hadSettings = !!sessionData.settings;
                const hadMode = hadSettings && !!sessionData.settings.mode;

                // 确保历史会话有正确的settings和mode字段
                this.ensureSessionSettingsCompat(sessionData);
                this.sessions.set(sessionData.id, sessionData);

                // 如果添加了新的设置字段，记录需要更新的会话
                if (!hadSettings || !hadMode) {
                    updatedSessions.push(sessionData);
                    console.log(`为服务器历史会话 ${sessionData.id} 添加了mode字段:`, sessionData.settings.mode);
                }
            }

            // 立即保存有变化的会话到服务器
            if (updatedSessions.length > 0) {
                for (const session of updatedSessions) {
                    try {
                        await this.saveSession(session);
                    } catch (error) {
                        console.warn(`更新服务器会话 ${session.id} 失败:`, error);
                    }
                }
                // 更新localStorage
                this.saveAllSessionsToLocalStorage();
                console.log(`已更新 ${updatedSessions.length} 个历史会话的设置`);
            }
        } catch (error) {
            console.error('加载会话列表失败:', error);
            // 如果后端不可用，尝试从localStorage加载
            this.loadSessionsFromLocalStorage();
        }
    }
    
    /**
     * 保存会话到存储
     * @param {Object} session - 会话对象
     */
    async saveSession(session) {
        try {
            const response = await fetch(`${this.sessionStoragePath}/${session.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(session)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('保存会话到服务器失败:', error);
            // 备份到localStorage
            this.saveSessionToLocalStorage(session);
        }
    }
    
    /**
     * 从存储删除会话
     * @param {string} sessionId - 会话ID
     */
    async removeSessionFromStorage(sessionId) {
        try {
            const response = await fetch(`${this.sessionStoragePath}/${sessionId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok && response.status !== 404) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('从服务器删除会话失败:', error);
        }
        
        // 同时从localStorage删除
        this.removeSessionFromLocalStorage(sessionId);
    }

    /**
     * 确保会话设置兼容性
     * @param {Object} sessionData - 会话数据
     */
    ensureSessionSettingsCompat(sessionData) {
        console.log(`检查会话 ${sessionData.id} 的兼容性...`);

        // 如果会话没有settings，创建默认设置
        if (!sessionData.settings) {
            console.log(`会话 ${sessionData.id} 没有settings，创建默认设置`);
            sessionData.settings = this.getDefaultSettings();
            return;
        }

        // 如果会话settings没有mode字段，添加默认mode
        if (!sessionData.settings.mode) {
            console.log(`会话 ${sessionData.id} 没有mode字段，添加默认mode: general`);
            sessionData.settings.mode = 'general';
        }

        // 验证mode是否有效（防止无效模式导致显示问题）
        const validModes = ['general', 'pct_analysis_v2'];
        if (!validModes.includes(sessionData.settings.mode)) {
            console.log(`会话 ${sessionData.id} 的mode "${sessionData.settings.mode}" 无效，重置为 general`);
            sessionData.settings.mode = 'general';
        }

        // 确保其他必要字段存在
        const defaultSettings = this.getDefaultSettings();
        if (!sessionData.settings.systemPrompt) {
            console.log(`会话 ${sessionData.id} 没有systemPrompt，使用默认值`);
            sessionData.settings.systemPrompt = defaultSettings.systemPrompt;
        }
        if (!sessionData.settings.maxTurns) {
            console.log(`会话 ${sessionData.id} 没有maxTurns，使用默认值`);
            sessionData.settings.maxTurns = defaultSettings.maxTurns;
        }
        if (!sessionData.settings.allowedTools) {
            console.log(`会话 ${sessionData.id} 没有allowedTools，使用默认值`);
            sessionData.settings.allowedTools = defaultSettings.allowedTools;
        }

        console.log(`会话 ${sessionData.id} 兼容性检查完成，最终mode: ${sessionData.settings.mode}`);
    }

    /**
     * 强制检查所有会话的兼容性（调试用）
     */
    forceCompatibilityCheck() {
        console.log('=== 强制兼容性检查开始 ===');
        const sessionsData = localStorage.getItem('claude_mcp_sessions');
        if (!sessionsData) {
            console.log('没有找到localStorage会话数据');
            return;
        }

        const sessions = JSON.parse(sessionsData);
        let updated = false;

        Object.entries(sessions).forEach(([id, session]) => {
            const hadMode = !!(session.settings && session.settings.mode);
            this.ensureSessionSettingsCompat(session);
            if (!hadMode && session.settings.mode) {
                updated = true;
            }
        });

        if (updated) {
            localStorage.setItem('claude_mcp_sessions', JSON.stringify(sessions));
            console.log('已更新localStorage中的会话数据');
        }
        console.log('=== 强制兼容性检查完成 ===');
    }

    /**
     * 从localStorage加载会话
     */
    loadSessionsFromLocalStorage() {
        try {
            const sessionsData = localStorage.getItem('claude_mcp_sessions');
            if (sessionsData) {
                const sessions = JSON.parse(sessionsData);
                this.sessions.clear();
                let needsSave = false;

                for (const [id, sessionData] of Object.entries(sessions)) {
                    // 检查是否需要兼容性处理
                    const hadSettings = !!sessionData.settings;
                    const hadMode = hadSettings && !!sessionData.settings.mode;

                    // 确保历史会话有正确的settings和mode字段
                    this.ensureSessionSettingsCompat(sessionData);
                    this.sessions.set(id, sessionData);

                    // 如果添加了新的设置字段，标记需要保存
                    if (!hadSettings || !hadMode) {
                        needsSave = true;
                        console.log(`为历史会话 ${id} 添加了mode字段:`, sessionData.settings.mode);
                    }
                }

                // 如果有更新，保存回localStorage
                if (needsSave) {
                    this.saveAllSessionsToLocalStorage();
                    console.log('已更新localStorage中的历史会话设置');
                }
            }
        } catch (error) {
            console.error('从localStorage加载会话失败:', error);
        }
    }
    
    /**
     * 保存会话到localStorage
     * @param {Object} session - 会话对象
     */
    saveSessionToLocalStorage(session) {
        try {
            const sessionsData = localStorage.getItem('claude_mcp_sessions') || '{}';
            const sessions = JSON.parse(sessionsData);
            sessions[session.id] = session;
            localStorage.setItem('claude_mcp_sessions', JSON.stringify(sessions));
        } catch (error) {
            console.error('保存会话到localStorage失败:', error);
        }
    }

    /**
     * 保存所有会话到localStorage
     */
    saveAllSessionsToLocalStorage() {
        try {
            const sessionsObject = {};
            for (const [id, session] of this.sessions) {
                sessionsObject[id] = session;
            }
            localStorage.setItem('claude_mcp_sessions', JSON.stringify(sessionsObject));
        } catch (error) {
            console.error('保存所有会话到localStorage失败:', error);
        }
    }
    
    /**
     * 从localStorage删除会话
     * @param {string} sessionId - 会话ID
     */
    removeSessionFromLocalStorage(sessionId) {
        try {
            const sessionsData = localStorage.getItem('claude_mcp_sessions') || '{}';
            const sessions = JSON.parse(sessionsData);
            delete sessions[sessionId];
            localStorage.setItem('claude_mcp_sessions', JSON.stringify(sessions));
        } catch (error) {
            console.error('从localStorage删除会话失败:', error);
        }
    }
    
    /**
     * 生成会话ID
     * @returns {string} 唯一会话ID
     */
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * 生成默认会话名称
     * @returns {string} 默认会话名称
     */
    generateDefaultSessionName() {
        const count = this.sessions.size + 1;
        return `${this.defaultSessionName} ${count}`;
    }
    
    /**
     * 渲染会话列表UI
     */
    renderSessionList() {
        const sessionsList = document.getElementById('sessionsList');
        if (!sessionsList) {
            console.warn('会话列表容器不存在');
            return;
        }
        
        sessionsList.innerHTML = '';
        
        // 添加新建会话按钮
        const newSessionBtn = document.createElement('div');
        newSessionBtn.className = 'session-item new-session';
        newSessionBtn.innerHTML = `
            <div class="session-content">
                <span class="session-icon">➕</span>
                <span class="session-name">新建对话</span>
            </div>
        `;
        newSessionBtn.addEventListener('click', () => this.createSession());
        sessionsList.appendChild(newSessionBtn);
        
        // 渲染现有会话
        const sortedSessions = Array.from(this.sessions.values())
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        
        for (const session of sortedSessions) {
            const sessionItem = this.createSessionElement(session);
            sessionsList.appendChild(sessionItem);
        }
    }
    
    /**
     * 创建会话元素
     * @param {Object} session - 会话对象
     * @returns {HTMLElement} 会话元素
     */
    createSessionElement(session) {
        const sessionItem = document.createElement('div');
        sessionItem.className = `session-item ${session.id === this.currentSessionId ? 'active' : ''}`;
        sessionItem.dataset.sessionId = session.id;
        
        sessionItem.innerHTML = `
            <div class="session-content">
                <span class="session-icon">💬</span>
                <span class="session-name" title="${session.name}">${session.name}</span>
                <div class="session-actions">
                    <button class="session-action-btn rename-btn" title="重命名">✏️</button>
                    <button class="session-action-btn delete-btn" title="删除">🗑️</button>
                </div>
            </div>
            <div class="session-meta">
                <span class="session-time">${this.formatTime(session.updatedAt)}</span>
                <span class="session-count">${session.messages.length} 条消息</span>
            </div>
        `;
        
        // 绑定事件
        const sessionContent = sessionItem.querySelector('.session-content');
        const renameBtn = sessionItem.querySelector('.rename-btn');
        const deleteBtn = sessionItem.querySelector('.delete-btn');
        
        // 点击会话切换
        // 整个会话项区域都可以点击切换
        sessionItem.addEventListener('click', (e) => {
            // 只有点击操作按钮时不切换会话
            if (e.target.closest('.session-action-btn')) {
                return;
            }
            // 阻止事件冒泡
            e.stopPropagation();
            if (true) {
                this.setCurrentSession(session.id);
            }
        });
        
        // 重命名
        renameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showRenameDialog(session.id, session.name);
        });
        
        // 删除
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showDeleteDialog(session.id, session.name);
        });
        
        return sessionItem;
    }
    
    /**
     * 显示重命名对话框
     * @param {string} sessionId - 会话ID
     * @param {string} currentName - 当前名称
     */
    async showRenameDialog(sessionId, currentName) {
        try {
            const newName = await window.showInput({
                title: '重命名会话',
                message: '请输入新的会话名称:',
                placeholder: '输入会话名称',
                defaultValue: currentName,
                confirmText: '重命名',
                cancelText: '取消',
                validate: (value) => {
                    if (!value) {
                        return false; // 不能为空
                    }
                    if (value.length > this.maxSessionNameLength) {
                        return false; // 不能超过最大长度
                    }
                    return true;
                }
            });
            
            if (newName !== null && newName !== currentName) {
                await this.renameSession(sessionId, newName);
            }
        } catch (error) {
            // 显示错误通知而不是alert
            if (window.chatApp && window.chatApp.showNotification) {
                window.chatApp.showNotification(`重命名失败: ${error.message}`, 'error');
            } else {
                alert(`重命名失败: ${error.message}`);
            }
        }
    }
    
    /**
     * 显示删除确认对话框
     * @param {string} sessionId - 会话ID
     * @param {string} sessionName - 会话名称
     */
    async showDeleteDialog(sessionId, sessionName) {
        try {
            const confirmed = await window.confirmDelete(sessionName, '会话');
            if (confirmed) {
                await this.deleteSession(sessionId);
            }
        } catch (error) {
            // 显示错误通知而不是alert
            if (window.chatApp && window.chatApp.showNotification) {
                window.chatApp.showNotification(`删除失败: ${error.message}`, 'error');
            } else {
                alert(`删除失败: ${error.message}`);
            }
        }
    }
    
    /**
     * 格式化时间
     * @param {string} timestamp - 时间戳
     * @returns {string} 格式化后的时间
     */
    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) { // 1分钟内
            return '刚刚';
        } else if (diff < 3600000) { // 1小时内
            return `${Math.floor(diff / 60000)}分钟前`;
        } else if (diff < 86400000) { // 1天内
            return `${Math.floor(diff / 3600000)}小时前`;
        } else if (diff < 2592000000) { // 30天内
            return `${Math.floor(diff / 86400000)}天前`;
        } else {
            return date.toLocaleDateString();
        }
    }
    
    /**
     * 会话切换回调
     * @param {string} sessionId - 新的会话ID
     */
    /**
     * 处理同步冲突
     * @param {Array} conflicts - 冲突列表
     */
    handleSyncConflicts(conflicts) {
        if (conflicts.length === 0) return;
        
        console.warn(`检测到 ${conflicts.length} 个会话冲突:`);
        conflicts.forEach(conflict => {
            console.warn(`会话 "${conflict.session_id}": 本地更新时间 ${conflict.local_time}, 服务器更新时间 ${conflict.server_time}`);
        });
        
        // 可以在这里添加用户界面来让用户选择如何解决冲突
        // 目前默认使用服务器版本
    }
    
    /**
     * 同步所有会话到localStorage
     */
    syncAllToLocalStorage() {
        try {
            const allSessions = {};
            for (const [id, session] of this.sessions.entries()) {
                allSessions[id] = session;
            }
            localStorage.setItem('claude_mcp_sessions', JSON.stringify(allSessions));
            console.log(`已同步 ${this.sessions.size} 个会话到localStorage`);
        } catch (error) {
            console.error('同步到localStorage失败:', error);
        }
    }
    
    /**
     * 启动定期同步
     */
    startPeriodicSync() {
        // 每5分钟同步一次
        this.syncInterval = setInterval(async () => {
            await this.performBackgroundSync();
        }, 5 * 60 * 1000);
        
        console.log('已启动定期同步 (每5分钟)');
    }
    
    /**
     * 停止定期同步
     */
    stopPeriodicSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('已停止定期同步');
        }
    }
    
    /**
     * 执行后台同步
     */
    async performBackgroundSync() {
        try {
            const localSessions = Array.from(this.sessions.values());
            
            const response = await fetch(`${this.sessionStoragePath}/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(localSessions)
            });
            
            if (response.ok) {
                const syncedSessions = await response.json();
                
                // 检查是否有变化
                let hasChanges = false;
                if (syncedSessions.length !== this.sessions.size) {
                    hasChanges = true;
                } else {
                    for (const session of syncedSessions) {
                        const localSession = this.sessions.get(session.id);
                        if (!localSession || localSession.updatedAt !== session.updatedAt) {
                            hasChanges = true;
                            break;
                        }
                    }
                }
                
                if (hasChanges) {
                    console.log('检测到会话变化，更新本地数据');
                    
                    // 保存当前选中的会话
                    const currentSessionId = this.currentSessionId;
                    
                    // 更新会话数据
                    this.sessions.clear();
                    for (const sessionData of syncedSessions) {
                        this.sessions.set(sessionData.id, sessionData);
                    }
                    
                    // 同步到localStorage
                    this.syncAllToLocalStorage();
                    
                    // 重新渲染界面
                    this.renderSessionList();
                    
                    // 恢复当前选中的会话
                    if (currentSessionId && this.sessions.has(currentSessionId)) {
                        this.setCurrentSession(currentSessionId);
                    }
                    
                    // 通知会话数量变化
                    this.onSessionCountChange();
                    
                    this.lastSyncTime = new Date().toISOString();
                    console.log(`后台同步完成: ${syncedSessions.length} 个会话`);
                }
            } else {
                console.warn('后台同步失败:', response.status);
            }
        } catch (error) {
            console.warn('后台同步错误:', error.message);
        }
    }
    
    /**
     * 手动触发同步
     */
    async manualSync() {
        console.log('开始手动同步...');
        await this.performBackgroundSync();
        return true;
    }
    
    /**
     * 强制上传本地数据到服务器
     */
    async forceUploadToServer() {
        try {
            const localSessions = Array.from(this.sessions.values());
            
            for (const session of localSessions) {
                await this.saveSession(session);
            }
            
            console.log(`已强制上传 ${localSessions.length} 个会话到服务器`);
            return true;
        } catch (error) {
            console.error('强制上传失败:', error);
            return false;
        }
    }
    
    /**
     * 强制从服务器下载数据
     */
    async forceDownloadFromServer() {
        try {
            const response = await fetch(`${this.sessionStoragePath}/list`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const serverSessions = await response.json();
            
            // 保存当前选中的会话
            const currentSessionId = this.currentSessionId;
            
            // 替换本地数据
            this.sessions.clear();
            for (const sessionData of serverSessions) {
                this.sessions.set(sessionData.id, sessionData);
            }
            
            // 同步到localStorage
            this.syncAllToLocalStorage();
            
            // 重新渲染界面
            this.renderSessionList();
            
            // 尝试恢复当前选中的会话
            if (currentSessionId && this.sessions.has(currentSessionId)) {
                this.setCurrentSession(currentSessionId);
            } else if (this.sessions.size > 0) {
                this.restoreLastSelectedSession();
            }
            
            // 通知会话数量变化
            this.onSessionCountChange();
            
            console.log(`已强制下载 ${serverSessions.length} 个会话从服务器`);
            return true;
        } catch (error) {
            console.error('强制下载失败:', error);
            return false;
        }
    }
    
    /**
     * 获取同步状态
     */
    getSyncStatus() {
        return {
            hasPeriodicSync: !!this.syncInterval,
            totalSessions: this.sessions.size,
            currentSession: this.currentSessionId,
            lastSyncTime: this.lastSyncTime || null
        };
    }
    
    /**
     * 高效更新会话列表的激活状态（不重新渲染整个列表）
     */
    updateSessionListActiveState() {
        const sessionsList = document.getElementById('sessionsList');
        if (!sessionsList) return;
        
        // 移除所有活跃状态
        const sessionItems = sessionsList.querySelectorAll('.session-item');
        sessionItems.forEach(item => {
            item.classList.remove('active');
        });
        
        // 为当前会话添加活跃状态
        if (this.currentSessionId) {
            const currentSessionItem = sessionsList.querySelector(`[data-session-id="${this.currentSessionId}"]`);
            if (currentSessionItem) {
                currentSessionItem.classList.add('active');
            }
        }
    }
    
    onSessionChange(sessionId) {
        // 这个方法会被ChatApp重写
        console.log(`切换到会话: ${sessionId}`);
    }
    
    onSessionCountChange() {
        // 这个方法会被ChatApp重写，用于更新会话计数显示
        console.log(`会话数量变化: ${this.sessions.size} 个会话`);
    }
    
    /**
     * 实时更新UI中指定会话的消息数量
     * @param {string} sessionId - 会话ID
     * @param {number} messageCount - 新的消息数量
     */
    updateSessionMessageCount(sessionId, messageCount) {
        const sessionsList = document.getElementById('sessionsList');
        if (!sessionsList) return;
        
        const sessionItem = sessionsList.querySelector(`[data-session-id="${sessionId}"]`);
        if (!sessionItem) return;
        
        const sessionCountElement = sessionItem.querySelector('.session-count');
        if (sessionCountElement) {
            sessionCountElement.textContent = `${messageCount} 条消息`;
        }
    }

    /**
     * 保存当前选中的会话ID到localStorage
     * @param {string} sessionId - 会话ID
     */
    saveCurrentSessionId(sessionId) {
        try {
            localStorage.setItem('claude_mcp_current_session', sessionId);
        } catch (error) {
            console.error('保存当前会话ID失败:', error);
        }
    }

    /**
     * 从localStorage获取上次选中的会话ID
     * @returns {string|null} 会话ID或null
     */
    getLastSelectedSessionId() {
        try {
            return localStorage.getItem('claude_mcp_current_session');
        } catch (error) {
            console.error('获取上次选中会话ID失败:', error);
            return null;
        }
    }

    /**
     * 恢复上次选中的会话，如果不存在则选择最近更新的会话
     */
    restoreLastSelectedSession() {
        const lastSessionId = this.getLastSelectedSessionId();

        // 如果上次的会话仍然存在，恢复它
        if (lastSessionId && this.sessions.has(lastSessionId)) {
            console.log('恢复上次选中的会话:', lastSessionId);
            this.setCurrentSession(lastSessionId);
            return;
        }

        // 否则选择最近更新的会话（按updatedAt倒序排列的第一个）
        const sortedSessions = Array.from(this.sessions.values())
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        if (sortedSessions.length > 0) {
            const mostRecentSessionId = sortedSessions[0].id;
            console.log('选择最近更新的会话:', mostRecentSessionId);
            this.setCurrentSession(mostRecentSessionId);
        }
    }

    /**
     * 清除保存的当前会话ID（在会话被删除时调用）
     * @param {string} sessionId - 被删除的会话ID
     */
    clearCurrentSessionIdIfMatch(sessionId) {
        const currentStoredSessionId = this.getLastSelectedSessionId();
        if (currentStoredSessionId === sessionId) {
            try {
                localStorage.removeItem('claude_mcp_current_session');
            } catch (error) {
                console.error('清除当前会话ID失败:', error);
            }
        }
    }
}