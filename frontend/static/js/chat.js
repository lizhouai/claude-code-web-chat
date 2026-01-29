// API缓存类，用于减少重复请求和提高性能
class APICache {
    constructor() {
        this.cache = new Map();
        this.pendingRequests = new Map();
    }
    
    async fetch(url, options = {}, ttl = 30000) {
        const key = `${url}_${JSON.stringify(options)}`;
        
        // 检查缓存
        if (this.cache.has(key)) {
            const cached = this.cache.get(key);
            if (Date.now() - cached.timestamp < ttl) {
                return cached.data;
            }
        }
        
        // 检查是否有正在进行的相同请求
        if (this.pendingRequests.has(key)) {
            return this.pendingRequests.get(key);
        }
        
        // 发起新请求
        const promise = fetch(url, options).then(async response => {
            const data = response.ok ? await response.json() : null;
            this.cache.set(key, { data, timestamp: Date.now() });
            this.pendingRequests.delete(key);
            return data;
        }).catch(error => {
            this.pendingRequests.delete(key);
            throw error;
        });
        
        this.pendingRequests.set(key, promise);
        return promise;
    }
    
    // 清理过期缓存
    cleanup() {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > 300000) { // 5分钟过期
                this.cache.delete(key);
            }
        }
    }
}

class ChatApp {
    constructor() {
        this.API_BASE = '/api/v1';
        this.apiCache = new APICache();

        // 每5分钟清理一次API缓存
        setInterval(() => {
            this.apiCache.cleanup();
        }, 300000);
        this.currentMode = 'general';
        this.chatHistory = [];
        this.isStreaming = false;
        this.currentSessionId = null;  // Track current session for interruption
        // Initial settings directly use general mode configuration
        this.settings = {
            systemPrompt: '',
            maxTurns: 20,
            allowedTools: []
        };

        // Initialize session manager
        this.sessionManager = null;

        this.mcpStatusInterval = null;
        this.mcpStatusVisible = false;

        this.modeConfigs = {
            general: {
                systemPrompt: '你是一个非常实用的助手。',
                maxTurns: 10,
                maxTurnsRange: { min: 1, max: 100 },
                allowedTools: ['WebSearch', 'Read', 'Grep'],  // Complete toolset without Bash
                endpoint: '/query'
            },
            pct_analysis_v2: {
                systemPrompt: null, // Will be loaded asynchronously
                systemPromptFile: './static/js/prompts/pct_analysis_v2.txt',
                maxTurns: 100,
                maxTurnsRange: { min: 1, max: 100 },
                allowedTools: ['WebSearch', 'Read', 'Grep', 'Write', 'Edit', 'Bash'], // Full toolset
                endpoint: '/query'
            }
        };

        // Load system prompts asynchronously
        this.loadSystemPrompts();
        
        // Tool permission level definitions
        this.toolLayers = {
            basic: ['WebSearch'],
            readOnly: ['Read', 'Grep'], 
            writeCapable: ['Write', 'Edit'],
            systemLevel: ['Bash']
        };
        
        // Immediately apply general mode default configuration
        this.applyModeDefaults(this.modeConfigs.general);
        
        // Clean up old localStorage settings (if exists)
        this.cleanupLegacySettings();
        
        this.init();
    }

    async loadSystemPrompts() {
        // Load system prompts for modes that have external files
        for (const [modeName, config] of Object.entries(this.modeConfigs)) {
            if (config.systemPromptFile && !config.systemPrompt) {
                try {
                    const response = await fetch(config.systemPromptFile);
                    if (response.ok) {
                        config.systemPrompt = await response.text();
                        console.log(`Loaded system prompt for ${modeName} mode`);
                    } else {
                        console.warn(`Failed to load system prompt file for ${modeName}: ${response.status}`);
                        // Fallback to a default prompt
                        config.systemPrompt = `你是一个非常有用的助手。`;
                    }
                } catch (error) {
                    console.error(`Error loading system prompt for ${modeName}:`, error);
                    // Fallback to a default prompt
                    config.systemPrompt = `你是一个非常有用的助手。`;
                }
            }
        }
    }

    async ensureDOMReady() {
        return new Promise((resolve) => {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', resolve);
            } else {
                resolve();
            }
        });
    }
    
    async init() {
        // 阶段1：关键UI功能 - 立即执行
        this.bindEvents();
        await this.ensureDOMReady();
        await this.updateModeSettings();
        this.autoResizeTextarea();
        this.loadSidebarState();
        
        // 阶段2：会话管理 - 轻微延迟以改善感知性能
        setTimeout(async () => {
            try {
                await this.initSessionManager();
            } catch (error) {
                console.error('Session manager initialization failed:', error);
                this.showNotification('会话加载失败，请刷新页面重试', 'error');
            }
        }, 50);
        
        // 阶段3：非关键功能 - 更大延迟
        setTimeout(() => {
            this.checkAPIConnection();
        }, 200);
        
        // 阶段4：后台功能 - 最低优先级
        setTimeout(() => {
            this.startMcpStatusPolling();
        }, 1000);
    }
    
    async initSessionManager() {
        this.sessionManager = new SessionManager(this);
        
        // Set session change callback
        this.sessionManager.onSessionChange = (sessionId) => {
            this.onSessionChange(sessionId);
        };
        
        // 设置会话数量变化回调
        this.sessionManager.onSessionCountChange = () => {
            const syncStatus = this.sessionManager.getSyncStatus();
            this.updateSyncStatus('ready', `${syncStatus.totalSessions} 个会话`);
        };
        
        await this.sessionManager.init();
        
        // 设置同步事件监听器
        this.setupSyncEventListeners();
        
        // 初始化同步状态显示
        const syncStatus = this.sessionManager.getSyncStatus();
        this.updateSyncStatus('ready', `${syncStatus.totalSessions} 个会话`);
    }
    
    bindEvents() {
        // 发送按钮
        document.getElementById('sendBtn').addEventListener('click', () => this.handleSendButtonClick());
        
        // 输入框回车发送
        document.getElementById('messageInput').addEventListener('keydown', (e) => {
            // 检查是否正在使用输入法（IME）
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // 输入框自动调整高度
        document.getElementById('messageInput').addEventListener('input', () => {
            this.autoResizeTextarea();
        });
        
        // 模式选择按钮和面板
        document.getElementById('modeBtn').addEventListener('click', () => this.showModePanel());
        
        // 点击遮罩关闭模式面板
        document.getElementById('modePanel').addEventListener('click', (e) => {
            if (e.target.id === 'modePanel') {
                this.hideModePanel();
            }
        });
        
        // 模式选择
        document.querySelectorAll('.mode-option').forEach(option => {
            option.addEventListener('click', async (e) => {
                const newMode = e.currentTarget.dataset.mode;
                if (newMode !== this.currentMode) {
                    await this.switchToMode(newMode);
                }
                this.hideModePanel();
            });
        });
        
        // 设置面板
        document.getElementById('settingsBtn').addEventListener('click', () => this.showSettings());
        document.getElementById('saveSettings').addEventListener('click', () => this.saveSettings());
        document.getElementById('closeSettings').addEventListener('click', () => this.hideSettings());
        
        // 清空对话
        document.getElementById('clearBtn').addEventListener('click', () => this.clearChat());
        
        // 侧边栏切换
        document.getElementById('sidebarToggleBtn').addEventListener('click', () => this.toggleSidebar());
        
        // 手动同步按钮
        document.getElementById('syncBtn').addEventListener('click', () => this.handleManualSync());
        
        // 点击遮罩关闭设置
        document.getElementById('settingsPanel').addEventListener('click', (e) => {
            if (e.target.id === 'settingsPanel') {
                this.hideSettings();
            }
        });
        
        // ESC键关闭设置和模式面板
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideSettings();
                this.hideModePanel();
            }
        });
    }
    
    async handleSendButtonClick() {
        if (this.isStreaming && this.currentSessionId) {
            // If streaming, interrupt the current session
            await this.interruptCurrentSession();
        } else {
            // If not streaming, send a new message
            await this.sendMessage();
        }
    }
    
    async interruptCurrentSession() {
        if (!this.currentSessionId) {
            return;
        }
        
        try {
            const response = await fetch(`${this.API_BASE}/query/interrupt/${this.currentSessionId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            // 检查HTTP状态码
            if (!response.ok) {
                // 处理HTTP错误状态
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.detail || errorData.message || `HTTP ${response.status}: ${response.statusText}`;
                this.showNotification('中断失败: ' + errorMessage, 'warning');
                return;
            }
            
            const result = await response.json();
            
            if (result.success) {
                this.addMessage('assistant', '思考已被中断');
                this.showNotification('思考已中断', 'info');
            } else {
                // 处理不同的错误消息格式
                const errorMessage = result.message || result.detail || '未知错误';
                this.showNotification('中断失败: ' + errorMessage, 'warning');
            }
        } catch (error) {
            console.error('中断请求失败:', error);
            // 区分不同类型的网络错误
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                this.showNotification('网络连接失败，请检查网络状态', 'error');
            } else {
                this.showNotification('中断请求失败: ' + error.message, 'error');
            }
        } finally {
            // Reset streaming state
            this.setStreamingState(false);
            this.currentSessionId = null;
        }
    }
    
    async sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();
        
        if (!message || this.isStreaming) {
            return;
        }
        
        // 显示用户消息
        this.addMessage('user', message);
        messageInput.value = '';
        this.autoResizeTextarea();
        
        // 禁用发送按钮
        this.setStreamingState(true);
        
        // 显示打字指示器
        const typingId = this.showTypingIndicator();
        
        try {
            await this.sendGeneralQuery(message);
        } catch (error) {
            console.error('发送消息失败:', error);
            this.addMessage('assistant', `❌ 发送失败: ${error.message}`);
        } finally {
            this.hideTypingIndicator(typingId);
            this.setStreamingState(false);
        }
    }
    
    async sendGeneralQuery(message) {
        const response = await fetch(`${this.API_BASE}/query/stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream'
            },
            body: JSON.stringify({
                prompt: message,
                conversation_history: this.chatHistory,
                system_prompt: this.settings.systemPrompt,
                max_turns: this.settings.maxTurns,
                allowed_tools: this.settings.allowedTools,
                stream: true
            })
        });
        
        if (!response.ok) {
            throw new Error(`API错误: ${response.status}`);
        }
        
        await this.handleStreamResponse(response);
    }
    

    
    async handleStreamResponse(response) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantMessageId = null;
        let accumulatedText = '';
        let displayedText = ''; // 跟踪已显示的文本

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));

                        if (data.text) {
                            // 如果已有内容且新内容不为空，则在新内容前添加换行符
                            if (accumulatedText.length > 0 && data.text.trim().length > 0) {
                                accumulatedText += '\n' + data.text;
                            } else {
                                accumulatedText += data.text;
                            }

                            if (!assistantMessageId) {
                                // 如果有thinking状态的消息，直接复用它
                                const thinkingMessage = document.querySelector('.message.thinking');
                                if (thinkingMessage) {
                                    assistantMessageId = thinkingMessage.id;
                                    // 保留thinking类，在流式回复过程中继续显示呼吸灯效果
                                    await this.typewriterUpdate(assistantMessageId, accumulatedText, displayedText);
                                } else {
                                    // 创建新消息时也添加thinking类
                                    assistantMessageId = this.addMessage('assistant', '');
                                    const messageElement = document.getElementById(assistantMessageId);
                                    if (messageElement) {
                                        messageElement.classList.add('thinking');
                                    }
                                    await this.typewriterUpdate(assistantMessageId, accumulatedText, displayedText);
                                }
                            } else {
                                await this.typewriterUpdate(assistantMessageId, accumulatedText, displayedText);
                            }

                            // 更新已显示的文本长度
                            displayedText = accumulatedText;
                        } else if (data.done) {
                            // 先切换到绿色完成状态动画，然后延迟移除
                            if (assistantMessageId) {
                                const messageElement = document.getElementById(assistantMessageId);
                                if (messageElement) {
                                    // 移除黄色呼吸灯，添加绿色完成动画
                                    messageElement.classList.remove('thinking');
                                    messageElement.classList.add('completing');
                                    
                                    // 4秒后移除完成动画（与CSS动画时长一致）
                                    setTimeout(() => {
                                        messageElement.classList.remove('completing');
                                    }, 4000);
                                }
                            }

                            // Cost display has been hidden
                            // if (data.cost) {
                            //     accumulatedText += `
                            //
                            // 💰 费用: $${data.cost}`;
                            //     this.updateMessage(assistantMessageId, accumulatedText);
                            // }
                            
                            // 流式输出完成后自动聚焦到输入框
                            setTimeout(() => {
                                const messageInput = document.getElementById('messageInput');
                                if (messageInput && !messageInput.disabled) {
                                    messageInput.focus();
                                }
                            }, 100); // 稍微延迟以确保UI更新完成
                            
                            // Clear session ID when done
                            this.currentSessionId = null;
                        } else if (data.session_id) {
                            // Store session ID for potential interruption
                            this.currentSessionId = data.session_id;
                        } else if (data.error) {
                            // 错误时也使用绿色完成动画过渡，然后移除
                            if (assistantMessageId) {
                                const messageElement = document.getElementById(assistantMessageId);
                                if (messageElement) {
                                    // 移除黄色呼吸灯，添加绿色完成动画
                                    messageElement.classList.remove('thinking');
                                    messageElement.classList.add('completing');
                                    
                                    // 4秒后移除完成动画（与CSS动画时长一致）
                                    setTimeout(() => {
                                        messageElement.classList.remove('completing');
                                    }, 4000);
                                }
                            }

                            const errorMessage = `❌ 错误: ${data.error}`;
                            if (!assistantMessageId) {
                                assistantMessageId = this.addMessage('assistant', '');
                                await this.typewriterUpdate(assistantMessageId, errorMessage, '');
                            } else {
                                const fullMessage = accumulatedText + '\n\n' + errorMessage;
                                await this.typewriterUpdate(assistantMessageId, fullMessage, displayedText);
                            }
                            
                            // 错误处理完成后也自动聚焦到输入框
                            setTimeout(() => {
                                const messageInput = document.getElementById('messageInput');
                                if (messageInput && !messageInput.disabled) {
                                    messageInput.focus();
                                }
                            }, 100);
                        }
                    } catch (e) {
                        console.warn('解析SSE数据失败:', line, e);
                    }
                }
            }
        }
    }
    
    addMessage(sender, content, shouldSaveToSession = true) {
        const messagesContainer = document.getElementById('chatMessages');
        const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        messageDiv.id = messageId;
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = sender === 'user' ? '👤' : '🤖';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        if (sender === 'assistant') {
            contentDiv.innerHTML = this.formatMessage(content);
        } else {
            contentDiv.textContent = content;
        }
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentDiv);
        messagesContainer.appendChild(messageDiv);
        
        // 滚动到底部
        this.scrollToBottom();
        
        // 保存到历史记录
        const messageData = { 
            role: sender, 
            content, 
            timestamp: new Date().toISOString() 
        };
        this.chatHistory.push(messageData);
        
        // 同步保存到会话管理器
        if (shouldSaveToSession && this.sessionManager) {
            this.sessionManager.updateCurrentSessionMessages([...this.chatHistory]);
        }
        
        return messageId;
    }
    
    updateMessage(messageId, content) {
        const messageElement = document.getElementById(messageId);
        if (messageElement) {
            const contentDiv = messageElement.querySelector('.message-content');
            contentDiv.innerHTML = this.formatMessage(content);
            this.scrollToBottom();
            
            // 查找并更新聊天历史中的对应消息
            const messageTimestamp = messageId.split('-')[1]; // 从ID中提取时间戳
            const isAssistant = messageElement.classList.contains('assistant');
            
            if (isAssistant && this.chatHistory.length > 0) {
                // 更新最后一条assistant消息
                for (let i = this.chatHistory.length - 1; i >= 0; i--) {
                    if (this.chatHistory[i].role === 'assistant') {
                        this.chatHistory[i].content = content;
                        
                        // 同步保存到会话管理器
                        if (this.sessionManager) {
                            this.sessionManager.updateCurrentSessionMessages([...this.chatHistory]);
                        }
                        break;
                    }
                }
            }
        }
    }

    // 将文本分割成对markdown渲染安全的片段
    getMarkdownSafeChunks(text) {
        const chunks = [];
        let currentChunk = '';
        let inCodeBlock = false;
        let inInlineCode = false;
        
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];
            
            currentChunk += char;
            
            // 检测代码块
            if (char === '`' && nextChar === '`' && text[i + 2] === '`') {
                inCodeBlock = !inCodeBlock;
                currentChunk += text[i + 1] + text[i + 2];
                i += 2;
            }
            // 检测行内代码
            else if (char === '`' && !inCodeBlock) {
                inInlineCode = !inInlineCode;
            }
            
            // 如果在代码块或行内代码中，直接添加字符，不做特殊处理
            if (inCodeBlock || inInlineCode) {
                continue;
            }
            
            // 检测合适的分割点
            const isWordBoundary = /\s/.test(char) || char === '\n';
            const isMarkdownChar = /[*_~`#\[\]()]/.test(char);
            
            // 在以下情况下结束当前片段：
            // 1. 遇到空格或换行（词边界）且片段有一定长度
            // 2. 累积了一定字符数
            // 3. 遇到潜在的markdown语法边界
            if (
                (isWordBoundary && currentChunk.length > 3) ||
                currentChunk.length >= 20 ||
                (isMarkdownChar && currentChunk.length > 5 && isWordBoundary)
            ) {
                chunks.push(currentChunk);
                currentChunk = '';
            }
        }
        
        // 添加剩余的文本
        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }
        
        return chunks;
    }

    // 智能逐字更新消息内容，支持markdown渲染
    async typewriterUpdate(messageId, newText, currentDisplayedText = '') {
        const messageElement = document.getElementById(messageId);
        if (!messageElement) return;

        const contentDiv = messageElement.querySelector('.message-content');
        if (!contentDiv) return;

        // 计算需要新增的文本
        const textToAdd = newText.slice(currentDisplayedText.length);

        // 如果没有新文本需要添加，直接返回
        if (textToAdd.length === 0) return;

        // 将文本分割成markdown安全的片段
        const chunks = this.getMarkdownSafeChunks(textToAdd);
        let processedText = currentDisplayedText;

        // 逐片段添加文本
        for (const chunk of chunks) {
            processedText += chunk;
            contentDiv.innerHTML = this.formatMessage(processedText);

            // 每个片段添加后滚动到底部
            this.scrollToBottom();

            // 根据片段长度调整等待时间，保持自然的打字节奏
            const delay = Math.min(chunk.length * 15, 120); // 15ms per character, max 120ms
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        // 更新聊天历史中的对应消息
        const isAssistant = messageElement.classList.contains('assistant');
        if (isAssistant && this.chatHistory.length > 0) {
            for (let i = this.chatHistory.length - 1; i >= 0; i--) {
                if (this.chatHistory[i].role === 'assistant') {
                    this.chatHistory[i].content = newText;

                    // 同步保存到会话管理器
                    if (this.sessionManager) {
                        this.sessionManager.updateCurrentSessionMessages([...this.chatHistory]);
                    }
                    break;
                }
            }
        }
    }

    formatMessage(content) {
        // 输入验证
        if (!content || typeof content !== 'string') {
            return '';
        }

        // 缓存机制 - 初始化缓存（如果不存在）
        if (!this._formatCache) {
            this._formatCache = {};
            this._formatCacheSize = 0;
        }

        // 检查缓存
        if (this._formatCache[content]) {
            return this._formatCache[content];
        }

        // 基础Markdown格式化（总是可用的后备方案）
        let formatted = content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');

        // 代码块处理
        formatted = formatted.replace(/```(\w+)?\n?([\s\S]*?)```/g, (match, lang, code) => {
            return `<pre><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`;
        });

        // URL预览处理 - 检测URL并添加预览
        formatted = this.addUrlPreviews(formatted);

        // 如果高级格式化器可用，尝试使用它
        if (window.markdownFormatter && typeof window.markdownFormatter.formatMessage === 'function') {
            try {
                formatted = window.markdownFormatter.formatMessage(content);
                // 对已格式化的内容再次处理URL预览
                formatted = this.addUrlPreviews(formatted);
            } catch (error) {
                console.warn('Markdown formatter error, using fallback formatting:', error);
                // 继续使用基础格式化的结果
            }
        }

        // 缓存结果（带缓存大小限制）
        if (this._formatCacheSize >= 100) {
            // 简单的缓存清理策略：清空一半
            const keys = Object.keys(this._formatCache);
            for (let i = 0; i < keys.length / 2; i++) {
                delete this._formatCache[keys[i]];
            }
            this._formatCacheSize = Math.floor(this._formatCacheSize / 2);
        }

        this._formatCache[content] = formatted;
        this._formatCacheSize++;

        return formatted;
    }

    addUrlPreviews(content) {
        // URL正则表达式，匹配http(s)开头的URL
        const urlRegex = /(https?:\/\/[^\s<>\"]+)/gi;

        return content.replace(urlRegex, (url) => {
            // 检查URL是否已经在链接标签中（避免重复处理）
            const beforeMatch = content.substring(0, content.indexOf(url));
            if (beforeMatch.includes('<a ') && !beforeMatch.includes('</a>')) {
                return url; // 已经在链接中，不处理
            }

            // 创建带预览的链接
            const previewId = `preview-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            return `<a href="${url}" target="_blank" class="url-link" data-url="${url}" data-preview-id="${previewId}">${url}</a>
                    <div class="web-preview" id="${previewId}" style="display: none;">
                        <div class="preview-loading">正在加载预览...</div>
                    </div>`;
        });
    }

    async loadWebPreview(url, previewId) {
        try {
            const response = await fetch(`${this.API_BASE}/web-preview`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url })
            });

            const previewElement = document.getElementById(previewId);
            if (!previewElement) return;

            if (!response.ok) {
                previewElement.innerHTML = `<div class="preview-error">预览加载失败</div>`;
                return;
            }

            const previewData = await response.json();
            this.renderWebPreview(previewElement, previewData);

        } catch (error) {
            console.error('Failed to load web preview:', error);
            const previewElement = document.getElementById(previewId);
            if (previewElement) {
                previewElement.innerHTML = `<div class="preview-error">预览加载失败</div>`;
            }
        }
    }

    renderWebPreview(element, data) {
        const thumbnailHtml = data.thumbnail ?
            `<div class="preview-thumbnail">
                <img src="${data.thumbnail}" alt="Preview" onerror="this.style.display='none'">
            </div>` : '';

        element.innerHTML = `
            <div class="preview-content">
                ${thumbnailHtml}
                <div class="preview-text">
                    <div class="preview-title">${data.title || '无标题'}</div>
                    <div class="preview-description">${data.description || '无描述'}</div>
                    <div class="preview-domain">${data.domain || ''}</div>
                </div>
            </div>
            <div class="preview-actions">
                <button class="preview-btn" onclick="window.open('${data.url}', '_blank')">
                    🔗 访问链接
                </button>
                <button class="preview-btn" onclick="this.closest('.web-preview').style.display='none'">
                    ✕ 关闭预览
                </button>
            </div>
        `;
        element.style.display = 'block';
    }

    showTypingIndicator() {
        const typingId = this.addMessage('assistant', '正在思考...');
        const messageElement = document.getElementById(typingId);

        // 添加思考状态的类，启用呼吸灯效果
        messageElement.classList.add('thinking');

        // 滚动到消息位置
        this.scrollToBottom();

        return typingId;
    }
    
    hideTypingIndicator(typingId) {
        const typingElement = document.getElementById(typingId);
        if (typingElement && typingElement.classList.contains('thinking')) {
            // 如果还在思考状态（未被复用），则删除
            typingElement.remove();
        }
    }
    
    setStreamingState(isStreaming) {
        this.isStreaming = isStreaming;
        const sendBtn = document.getElementById('sendBtn');
        const sendIcon = sendBtn.querySelector('.send-icon');
        const messageInput = document.getElementById('messageInput');
        const statusText = document.getElementById('statusText');
        const statusDot = document.querySelector('.status-dot');
        
        if (isStreaming) {
            // Change to interrupt button
            sendBtn.disabled = false;  // Keep enabled for interruption
            sendBtn.classList.add('interrupt-mode');
            sendBtn.title = '中断思考';
            if (sendIcon) {
                sendIcon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                            <rect x="4" y="6" width="16" height="16" rx="2"/>
                                      </svg>`;  // Stop icon
            }
            messageInput.disabled = true;
            statusText.textContent = '思考中...';
            statusDot.classList.add('connecting');
        } else {
            // Change back to send button
            sendBtn.disabled = false;
            sendBtn.classList.remove('interrupt-mode');
            sendBtn.title = '发送消息';
            if (sendIcon) {
                sendIcon.textContent = '📤';  // Send icon
            }
            messageInput.disabled = false;
            statusText.textContent = '就绪';
            statusDot.classList.remove('connecting');
            
            // 流式输出结束时自动聚焦到输入框
            setTimeout(() => {
                if (messageInput && !messageInput.disabled) {
                    messageInput.focus();
                }
            }, 50); // 短暂延迟确保DOM更新完成
        }
    }
    
    autoResizeTextarea() {
        const textarea = document.getElementById('messageInput');
        textarea.style.height = 'auto';
        const newHeight = Math.min(textarea.scrollHeight, 120);
        textarea.style.height = newHeight + 'px';
    }
    
    scrollToBottom() {
        const messagesContainer = document.getElementById('chatMessages');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    async updateModeSettings() {
        const config = this.modeConfigs[this.currentMode];
        if (config) {
            // 确保系统提示词已加载（如果有外部文件）
            if (config.systemPromptFile && !config.systemPrompt) {
                await this.loadSystemPrompts();
                // 验证加载是否成功
                if (!config.systemPrompt) {
                    console.warn(`Failed to load system prompt for ${this.currentMode}, using fallback`);
                    config.systemPrompt = `你是 ${this.currentMode} 产品方面的专家。`;
                }
            }

            // 优先使用当前会话的设置
            const currentSession = this.sessionManager ? this.sessionManager.getCurrentSession() : null;
            if (currentSession && currentSession.settings && Object.keys(currentSession.settings).length > 0) {
                // 使用会话的设置
                this.settings = { ...this.settings, ...currentSession.settings };
            } else {
                // 检查是否有该模式的专用设置（仅作为备用）
                const modeSettingsKey = `chatSettings_${this.currentMode}`;
                const savedModeSettings = localStorage.getItem(modeSettingsKey);

                if (savedModeSettings) {
                    // 加载该模式的专用设置
                    try {
                        const modeSettings = JSON.parse(savedModeSettings);
                        this.settings = { ...this.settings, ...modeSettings };
                    } catch (error) {
                        console.warn('加载模式设置失败:', error);
                        // 使用模式默认值
                        this.applyModeDefaults(config);
                    }
                } else {
                    // 使用模式默认值
                    this.applyModeDefaults(config);
                }
            }

            // 更新UI（如果DOM元素存在）
            this.updateModeUI();
            this.updateSettingsUIIfReady();
            this.updateMaxTurnsRange(config.maxTurnsRange);
        }
    }
    
    applyModeDefaults(config) {
        // Ensure systemPrompt is not null - use fallback if needed
        this.settings.systemPrompt = config.systemPrompt || `你是 ${this.currentMode} 产品方面的专家。`;
        this.settings.maxTurns = config.maxTurns;
        this.settings.allowedTools = [...config.allowedTools];
    }
    
    cleanupLegacySettings() {
        // 清理旧的chatSettings（不按模式区分的设置）
        if (localStorage.getItem('chatSettings')) {
            console.log('清理旧的localStorage设置');
            localStorage.removeItem('chatSettings');
        }

        // 清理按模式保存的设置（现在都保存在会话中了）
        Object.keys(this.modeConfigs).forEach(mode => {
            const modeSettingsKey = `chatSettings_${mode}`;
            if (localStorage.getItem(modeSettingsKey)) {
                console.log(`清理旧的模式设置: ${mode}`);
                localStorage.removeItem(modeSettingsKey);
            }
        });
    }
    
    updateMaxTurnsRange(range) {
        const maxTurnsInput = document.getElementById('maxTurns');
        if (maxTurnsInput && range) {
            maxTurnsInput.min = range.min;
            maxTurnsInput.max = range.max;
        }
    }
    
    updateToolsCheckboxes() {
        const checkboxes = document.querySelectorAll('.tools-layers input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = this.settings.allowedTools.includes(checkbox.value);
        });
    }
    
    showSettings() {
        const panel = document.getElementById('settingsPanel');
        panel.classList.add('show');
        
        // 填充当前设置
        document.getElementById('systemPrompt').value = this.settings.systemPrompt;
        document.getElementById('maxTurns').value = this.settings.maxTurns;
        this.updateToolsCheckboxes();
    }
    
    hideSettings() {
        const panel = document.getElementById('settingsPanel');
        panel.classList.remove('show');
    }
    
    // 模式面板相关方法
    showModePanel() {
        const panel = document.getElementById('modePanel');
        const modeBtn = document.getElementById('modeBtn');
        
        // 更新当前选中状态
        this.updateModeSelection();
        
        // 显示面板并添加按钮激活状态
        panel.classList.add('show');
        modeBtn.classList.add('active');
    }
    
    hideModePanel() {
        const panel = document.getElementById('modePanel');
        const modeBtn = document.getElementById('modeBtn');
        
        panel.classList.remove('show');
        modeBtn.classList.remove('active');
    }
    
    updateModeSelection() {
        // 移除所有选中状态
        document.querySelectorAll('.mode-option').forEach(option => {
            option.classList.remove('selected');
        });
        
        // 添加当前模式的选中状态
        const currentOption = document.querySelector(`.mode-option[data-mode="${this.currentMode}"]`);
        if (currentOption) {
            currentOption.classList.add('selected');
        }
    }
    
    async switchToMode(newMode) {
        const oldMode = this.currentMode;
        
        try {
            this.currentMode = newMode;
            
            // 更新当前会话的模式
            if (this.sessionManager) {
                await this.sessionManager.updateCurrentSessionMode(newMode);
                // 重新加载模式配置
                await this.updateModeSettings();
                this.showNotification(`已切换到${this.getModeDisplayName(newMode)}模式`, 'success');
            } else {
                await this.updateModeSettings();
            }
            
            // 更新按钮显示文字
            this.updateModeButtonText();
            
        } catch (error) {
            console.error('切换模式失败:', error);
            this.showNotification('模式切换失败', 'error');
            
            // 恢复到原模式
            this.currentMode = oldMode;
        }
    }
    
    updateModeButtonText() {
        const currentModeSpan = document.getElementById('currentMode');
        if (currentModeSpan) {
            currentModeSpan.textContent = this.getModeDisplayName(this.currentMode);
        }
    }
    
    async saveSettings() {
        // 获取设置值
        const newSettings = {
            mode: this.currentMode,
            systemPrompt: document.getElementById('systemPrompt').value,
            maxTurns: parseInt(document.getElementById('maxTurns').value)
        };

        // 获取选中的工具
        const checkedTools = Array.from(document.querySelectorAll('.tools-layers input[type="checkbox"]:checked'))
            .map(cb => cb.value);

        // 如果启用了Bash(系统级权限)，自动包含所有工具权限
        if (checkedTools.includes('Bash')) {
            const allTools = [...this.toolLayers.basic, ...this.toolLayers.readOnly,
                           ...this.toolLayers.writeCapable, ...this.toolLayers.systemLevel];
            newSettings.allowedTools = [...new Set(allTools)]; // 去重
        } else {
            newSettings.allowedTools = checkedTools;
        }

        // 更新本地设置
        this.settings = { ...this.settings, ...newSettings };

        // 保存到当前会话
        if (this.sessionManager) {
            try {
                await this.sessionManager.updateCurrentSessionSettings(newSettings);
                this.showNotification('设置已保存到当前会话', 'success');
            } catch (error) {
                console.error('保存会话设置失败:', error);
                this.showNotification('设置保存失败', 'error');
                return; // 保存失败时不关闭设置面板
            }
        } else {
            // 如果没有会话管理器，保存到本地存储作为备用
            const modeSettingsKey = `chatSettings_${this.currentMode}`;
            localStorage.setItem(modeSettingsKey, JSON.stringify(this.settings));
            this.showNotification('设置已保存', 'success');
        }

        this.hideSettings();
    }

    getModeDisplayName(mode) {
        const modeNames = {
            'general': 'General Model',
            'pct_analysis_v2': 'PCT Analysis V2'
        };
        return modeNames[mode] || mode;
    }
    
    // loadSettings方法已移除，现在使用updateModeSettings按模式加载设置
    
    async clearChat() {
        const confirmed = await window.confirmClear('所有对话');
        if (confirmed) {
            const messagesContainer = document.getElementById('chatMessages');
            // 保留欢迎消息
            const welcomeMessage = messagesContainer.querySelector('.message.assistant');
            messagesContainer.innerHTML = '';
            if (welcomeMessage) {
                messagesContainer.appendChild(welcomeMessage);
            }
            
            this.chatHistory = [];
            this.showNotification('对话已清空', 'info');
        }
        
        // 同时更新会话管理器中的消息
        if (this.sessionManager) {
            this.sessionManager.updateCurrentSessionMessages([]);
        }
    }
    
    // 会话管理相关方法
    onSessionChange(sessionId) {
        const session = this.sessionManager.getCurrentSession();
        if (!session) {
            console.error('无法获取当前会话');
            return;
        }
        
        // 显示切换加载状态
        this.showSessionSwitchLoading(session.name);
        
        // 使用requestAnimationFrame来分解工作，避免阻塞UI
        requestAnimationFrame(() => {
            // 清空当前聊天界面
            this.clearChatMessages();
            
            requestAnimationFrame(() => {
                // 智能选择加载方式：大量消息使用分片加载，少量消息使用批量加载
                if (session.messages && session.messages.length > 50) {
                    this.loadSessionMessagesInChunks(session.messages);
                    return; // 分片加载会自己处理后续步骤
                } else {
                    this.loadSessionMessagesBatch(session.messages);
                }
                
                // 立即更新模式设置，确保UI同步
                if (session.settings && Object.keys(session.settings).length > 0) {
                    // 会话有特定设置，使用会话设置
                    this.settings = { ...this.settings, ...session.settings };

                    // 如果会话有指定模式，切换到该模式
                    if (session.settings.mode) {
                        this.currentMode = session.settings.mode;
                        console.log(`切换到会话模式: ${this.currentMode}`);
                    }
                } else {
                    // 会话没有设置，确保使用当前模式的默认配置
                    console.log(`会话没有设置，使用当前模式: ${this.currentMode}`);
                    this.applyModeDefaults(this.modeConfigs[this.currentMode]);
                }

                // 立即更新UI显示，确保模式显示同步
                this.updateModeUI();
                this.updateSettingsUI();

                requestAnimationFrame(() => {
                    // 隐藏加载状态
                    this.hideSessionSwitchLoading();

                    console.log(`已切换到会话: ${session.name}，模式: ${this.currentMode}`);
                });
            });
        });
    }
    
    clearChatMessages() {
        const messagesContainer = document.getElementById('chatMessages');
        // 保留欢迎消息
        const welcomeMessage = messagesContainer.querySelector('.message.assistant');
        messagesContainer.innerHTML = '';
        if (welcomeMessage) {
            messagesContainer.appendChild(welcomeMessage);
        }
        this.chatHistory = [];
    }
    
    loadSessionMessages(messages) {
        for (const message of messages) {
            this.addMessage(message.role, message.content, false);
            this.chatHistory.push(message);
        }
    }
    
    /**
     * 批量加载会话消息（性能优化版本）
     */
    loadSessionMessagesBatch(messages) {
        if (!messages || messages.length === 0) {
            return;
        }
        
        const messagesContainer = document.getElementById('chatMessages');
        const fragment = document.createDocumentFragment();
        
        // 批量创建消息元素，减少DOM操作
        messages.forEach(message => {
            const messageElement = this.createMessageElement(message.role, message.content);
            fragment.appendChild(messageElement);
            this.chatHistory.push(message);
        });
        
        // 一次性添加所有消息到DOM
        messagesContainer.appendChild(fragment);
        
        // 滚动到底部
        this.scrollToBottom();
    }
    
    // 分片加载大量消息，提高性能
    loadSessionMessagesInChunks(messages, chunkSize = 20) {
        if (!messages || messages.length === 0) {
            return;
        }
        
        // 如果消息数量不多，直接使用批量加载
        if (messages.length <= chunkSize) {
            this.loadSessionMessagesBatch(messages);
            return;
        }
        
        // 分片处理
        const chunks = [];
        for (let i = 0; i < messages.length; i += chunkSize) {
            chunks.push(messages.slice(i, i + chunkSize));
        }
        
        let currentChunk = 0;
        const messagesContainer = document.getElementById('chatMessages');
        
        const loadNextChunk = () => {
            if (currentChunk < chunks.length) {
                const chunk = chunks[currentChunk];
                const fragment = document.createDocumentFragment();
                
                // 批量创建当前分片的消息元素
                chunk.forEach(message => {
                    const messageElement = this.createMessageElement(message.role, message.content);
                    fragment.appendChild(messageElement);
                    this.chatHistory.push(message);
                });
                
                // 添加到DOM
                messagesContainer.appendChild(fragment);
                
                currentChunk++;
                
                // 使用 requestAnimationFrame 保持UI响应性
                if (currentChunk < chunks.length) {
                    requestAnimationFrame(loadNextChunk);
                } else {
                    // 所有消息加载完成
                    this.scrollToBottom();
                    this.hideSessionSwitchLoading();
                }
            }
        };
        
        // 开始加载第一个分片
        loadNextChunk();
    }
    
    /**
     * 创建消息元素（不直接添加到DOM）
     */
    createMessageElement(sender, content) {
        const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        messageDiv.id = messageId;
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = sender === 'user' ? '👤' : '🤖';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        if (sender === 'assistant') {
            contentDiv.innerHTML = this.formatMessage(content);
        } else {
            contentDiv.textContent = content;
        }
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentDiv);
        
        return messageDiv;
    }
    
    updateSettingsUIIfReady() {
        // 只在DOM元素存在时更新UI
        const systemPromptEl = document.getElementById('systemPrompt');
        const maxTurnsEl = document.getElementById('maxTurns');
        
        if (systemPromptEl && maxTurnsEl) {
            this.updateSettingsUI();
        }
    }
    
    updateModeUI() {
        // 更新模式按钮显示文字
        this.updateModeButtonText();
        
        // 更新模式面板中的选中状态（如果面板已显示）
        this.updateModeSelection();
    }

    updateSettingsUI() {
        // 更新设置面板的UI
        const systemPromptEl = document.getElementById('systemPrompt');
        const maxTurnsEl = document.getElementById('maxTurns');

        if (systemPromptEl) {
            systemPromptEl.value = this.settings.systemPrompt;
        }
        if (maxTurnsEl) {
            maxTurnsEl.value = this.settings.maxTurns;
        }

        // 更新工具权限设置
        this.updateToolPermissionsUI();
    }
    
    updateToolPermissionsUI() {
        const toolCheckboxes = document.querySelectorAll('.layer-tools input[type="checkbox"]');
        toolCheckboxes.forEach(checkbox => {
            checkbox.checked = this.settings.allowedTools.includes(checkbox.value);
        });
    }
    
    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('collapsed');
        
        // 保存侧边栏状态
        const isCollapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem('sidebar_collapsed', isCollapsed.toString());
    }
    
    loadSidebarState() {
        const isCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
        if (isCollapsed) {
            document.getElementById('sidebar').classList.add('collapsed');
        }
    }
    
    // 同步相关方法
    async handleManualSync() {
        if (!this.sessionManager) {
            this.showNotification('会话管理器未初始化', 'error');
            return;
        }
        
        this.updateSyncStatus('syncing', '同步中...');
        
        try {
            await this.sessionManager.manualSync();
            this.updateSyncStatus('success', '同步成功');
            this.showNotification('会话同步成功', 'success');
            
            // 3秒后恢复就绪状态
            setTimeout(() => {
                this.updateSyncStatus('ready', '就绪');
            }, 3000);
            
        } catch (error) {
            console.error('手动同步失败:', error);
            this.updateSyncStatus('error', '同步失败');
            this.showNotification('会话同步失败', 'error');
            
            // 5秒后恢复就绪状态
            setTimeout(() => {
                this.updateSyncStatus('ready', '就绪');
            }, 5000);
        }
    }
    
    updateSyncStatus(status, text) {
        const syncBtn = document.getElementById('syncBtn');
        const syncIndicator = document.getElementById('syncIndicator');
        const syncText = document.getElementById('syncText');
        
        // 清除所有状态类
        syncBtn.classList.remove('syncing');
        syncIndicator.classList.remove('syncing', 'error');
        
        switch (status) {
            case 'syncing':
                syncBtn.classList.add('syncing');
                syncIndicator.classList.add('syncing');
                syncBtn.disabled = true;
                break;
            case 'success':
                // 成功状态，绿色指示器
                break;
            case 'error':
                syncIndicator.classList.add('error');
                break;
            case 'ready':
            default:
                syncBtn.disabled = false;
                break;
        }
        
        syncText.textContent = text;
    }
    
    // 监听会话管理器的同步事件
    setupSyncEventListeners() {
        if (!this.sessionManager) return;
        
        // 重写会话管理器的方法来更新UI状态
        const originalPerformBackgroundSync = this.sessionManager.performBackgroundSync.bind(this.sessionManager);
        this.sessionManager.performBackgroundSync = async () => {
            try {
                await originalPerformBackgroundSync();
                this.updateSyncStatus('ready', `就绪 (${this.formatTime(new Date())})`);
            } catch (error) {
                this.updateSyncStatus('error', '离线模式');
            }
        };
    }
    
    formatTime(date) {
        return date.toLocaleTimeString('zh-CN', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }
    
    /**
     * 显示会话切换加载状态
     */
    showSessionSwitchLoading(sessionName) {
        const statusText = document.getElementById('statusText');
        const statusDot = document.querySelector('.status-dot');
        
        if (statusText) {
            statusText.textContent = `切换到 ${sessionName}...`;
        }
        if (statusDot) {
            statusDot.classList.add('connecting');
        }
    }
    
    /**
     * 隐藏会话切换加载状态
     */
    hideSessionSwitchLoading() {
        const statusText = document.getElementById('statusText');
        const statusDot = document.querySelector('.status-dot');
        
        if (statusText) {
            statusText.textContent = '就绪';
        }
        if (statusDot) {
            statusDot.classList.remove('connecting');
        }
    }
    
    showNotification(message, type = 'info') {
        // 获取或创建 notification 容器
        let container = document.getElementById('notificationContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notificationContainer';
            container.className = 'notification-container';
            document.body.appendChild(container);
        }

        // 创建新通知
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // 将新通知插入到容器的最前面（顶部）
        container.insertBefore(notification, container.firstChild);
        
        // 使用 requestAnimationFrame 确保 DOM 更新后再添加动画类
        requestAnimationFrame(() => {
            notification.classList.add('show');
        });
        
        // 3秒后自动隐藏
        setTimeout(() => {
            this.hideNotification(notification);
        }, 3000);
    }

    hideNotification(notification) {
        if (!notification || !notification.parentNode) return;
        
        notification.classList.remove('show');
        notification.classList.add('hide');
        
        // 等待隐藏动画完成后移除元素
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }
    
    async checkAPIConnection() {
        try {
            // 使用缓存的API调用，5秒缓存时间
            const data = await this.apiCache.fetch('/health', {}, 5000);
            
            if (!data) {
                this.updateConnectionStatus('disconnected', 'API服务无响应');
                return;
            }
            
            if (data.status === 'healthy') {
                this.updateConnectionStatus('connected', 'LLM 连接正常');
            } else {
                this.updateConnectionStatus('disconnected', 'API服务异常');
            }
            
            // 初始化时更新MCP状态按钮
            this.updateMcpButtonStatus();
            
        } catch (error) {
            console.error('API连接检查失败:', error);
            this.updateConnectionStatus('disconnected', 'API连接失败');
        }
    }
    
    startMcpStatusPolling() {
        // 清除现有的轮询
        if (this.mcpStatusInterval) {
            clearInterval(this.mcpStatusInterval);
        }
        
        // 每30秒更新一次MCP状态
        this.mcpStatusInterval = setInterval(async () => {
            if (this.mcpStatusVisible) {
                await this.refreshMcpStatus();
            } else {
                // 即使面板不可见，也要更新按钮状态
                await this.updateMcpButtonStatus();
            }
        }, 30000);
    }
    
    stopMcpStatusPolling() {
        if (this.mcpStatusInterval) {
            clearInterval(this.mcpStatusInterval);
            this.mcpStatusInterval = null;
        }
    }
    
    async updateMcpButtonStatus() {
        try {
            const response = await fetch('/api/v1/mcp/health');
            const data = await response.json();
            this.updateMcpHeaderStatus(data.overall_status);
        } catch (error) {
            console.error('Failed to update MCP button status:', error);
            this.updateMcpHeaderStatus('unknown');
        }
    }
    
    updateConnectionStatus(status, message) {
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.getElementById('statusText');
        
        statusDot.className = `status-dot ${status}`;
        statusText.textContent = message;
    }
    
    exportChat() {
        if (this.chatHistory.length === 0) {
            this.showNotification('没有对话记录可导出', 'warning');
            return;
        }
        
        const content = this.chatHistory.map(msg => {
            const time = new Date(msg.timestamp).toLocaleString();
            return `[${time}] ${msg.sender.toUpperCase()}: ${msg.content}`;
        }).join('\n\n');
        
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-history-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showNotification('对话已导出', 'success');
    }
    
    // 语音输入功能（如果浏览器支持）
    initSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            return false;
        }
        
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = 'zh-CN';
        
        this.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            document.getElementById('messageInput').value = transcript;
            this.autoResizeTextarea();
        };
        
        this.recognition.onerror = (event) => {
            console.error('语音识别错误:', event.error);
            this.showNotification('语音识别失败', 'error');
        };
        
        return true;
    }
    
    startVoiceInput() {
        if (this.recognition) {
            this.recognition.start();
            this.showNotification('开始语音输入...', 'info');
        }
    }
    
    // 快捷键支持
    initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + Enter 发送消息
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.sendMessage();
            }
            
            // Ctrl/Cmd + K 清空对话
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.clearChat();
            }
            
            // Ctrl/Cmd + , 打开设置
            if ((e.ctrlKey || e.metaKey) && e.key === ',') {
                e.preventDefault();
                this.showSettings();
            }
        });
    }
    
    // 主题切换
    initThemeToggle() {
        const savedTheme = localStorage.getItem('chatTheme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                const currentTheme = document.documentElement.getAttribute('data-theme');
                const newTheme = currentTheme === 'light' ? 'dark' : 'light';
                
                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('chatTheme', newTheme);
                
                this.showNotification(`已切换到${newTheme === 'light' ? '浅色' : '深色'}主题`, 'info');
            });
        }
    }
    
    // MCP状态管理方法
    async showMcpStatus() {
        const panel = document.getElementById('mcpStatusPanel');
        panel.classList.add('show');
        this.mcpStatusVisible = true;
        
        await this.refreshMcpStatus();
        this.startMcpStatusPolling();
    }
    
    hideMcpStatus() {
        const panel = document.getElementById('mcpStatusPanel');
        panel.classList.remove('show');
        this.mcpStatusVisible = false;
        this.stopMcpStatusPolling();
    }
    
    async refreshMcpStatus(showNotification = false) {
        const refreshButton = document.getElementById('refreshMcpBtn');
        if (showNotification && refreshButton) {
            this.setMcpButtonActive(refreshButton);
        }
        
        try {
            // 不使用缓存，确保获取最新状态
            const data = await this.apiCache.fetch('/api/v1/mcp/health', {}, 0);
            
            if (!data) {
                this.showNotification('获取MCP状态失败', 'error');
                return;
            }
            
            this.updateMcpOverview(data);
            this.updateMcpServersList(data.servers);
            this.updateMcpHeaderStatus(data.overall_status);
            
            // 只在明确要求时显示成功通知（主动点击刷新按钮）
            if (showNotification) {
                this.showNotification('MCP状态已刷新', 'success');
            }
            
        } catch (error) {
            console.error('Failed to fetch MCP status:', error);
            this.showNotification('获取MCP状态失败', 'error');
        } finally {
            const refreshButton = document.getElementById('refreshMcpBtn');
            if (showNotification && refreshButton) {
                this.removeMcpButtonActive(refreshButton);
            }
        }
    }
    
    updateMcpOverview(data) {
        document.getElementById('mcpTotalServers').textContent = data.total_servers;
        document.getElementById('mcpRunningServers').textContent = data.healthy_servers;
        
        // 获取工具数量
        this.getMcpTools().then(tools => {
            document.getElementById('mcpTotalTools').textContent = tools.total_tools || 0;
        });
        
        // 更新整体状态
        const statusBadge = document.getElementById('mcpOverallStatus').querySelector('.status-badge');
        statusBadge.className = `status-badge ${data.overall_status}`;
        
        const statusText = {
            'healthy': '全部正常',
            'degraded': '部分异常', 
            'unhealthy': '服务异常'
        };
        statusBadge.textContent = statusText[data.overall_status] || '未知状态';
    }
    
    updateMcpServersList(servers) {
        const container = document.getElementById('mcpServersList');
        
        if (!servers || Object.keys(servers).length === 0) {
            container.innerHTML = '<div class="mcp-no-servers">未配置MCP服务器</div>';
            return;
        }
        
        // 保存当前所有活动按钮的状态
        const activeButtons = new Map();
        const existingButtons = container.querySelectorAll('.mcp-action-btn.active');
        existingButtons.forEach(btn => {
            const serverItem = btn.closest('.mcp-server-item');
            const serverName = serverItem ? serverItem.querySelector('.mcp-server-name')?.textContent.trim() : null;
            const buttonText = btn.textContent.trim();
            if (serverName) {
                activeButtons.set(`${serverName}-${buttonText}`, true);
            }
        });
        
        const serversList = Object.entries(servers).map(([name, server]) => {
            const statusClass = this.getMcpStatusClass(server.status);
            const statusText = this.getMcpStatusText(server.status);
            
            // 确定按钮的活动状态
            const startBtnActive = activeButtons.has(`${name}-启动`) ? ' active' : '';
            const stopBtnActive = activeButtons.has(`${name}-停止`) ? ' active' : '';
            const restartBtnActive = activeButtons.has(`${name}-重启`) ? ' active' : '';
            
            return `
                <div class="mcp-server-item">
                    <div class="mcp-server-info">
                        <div class="mcp-server-name">${name}</div>
                        <div class="mcp-server-description">${server.description || '无描述'}</div>
                        <div class="mcp-server-tools">工具: ${server.tools ? server.tools.join(', ') : '无'}</div>
                    </div>
                    <div class="mcp-server-status">
                        <span class="mcp-status-badge ${statusClass}">${statusText}</span>
                        <div class="mcp-server-actions">
                            ${server.status === 'running' ? 
                                `<button onclick="window.chatApp.stopMcpServer('${name}')" class="mcp-action-btn small${stopBtnActive}">停止</button>` :
                                `<button onclick="window.chatApp.startMcpServer('${name}')" class="mcp-action-btn small primary${startBtnActive}">启动</button>`
                            }
                            <button onclick="window.chatApp.restartMcpServer('${name}')" class="mcp-action-btn small${restartBtnActive}">重启</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = serversList;
    }
    
    updateMcpHeaderStatus(overallStatus) {
        const mcpBtn = document.getElementById('mcpStatusBtn');
        const mcpStatusText = document.getElementById('mcpStatusText');
        
        mcpBtn.className = `mcp-status-btn ${overallStatus}`;
        
        const statusTexts = {
            'healthy': 'MCP',
            'degraded': 'MCP ⚠️',
            'unhealthy': 'MCP ❌'
        };
        
        mcpStatusText.textContent = statusTexts[overallStatus] || 'MCP';
    }
    
    getMcpStatusClass(status) {
        const statusMap = {
            'running': 'running',
            'stopped': 'stopped', 
            'failed': 'failed',
            'error': 'error'
        };
        return statusMap[status] || 'unknown';
    }
    
    getMcpStatusText(status) {
        const statusMap = {
            'running': '运行中',
            'stopped': '已停止',
            'failed': '失败',
            'error': '错误'
        };
        return statusMap[status] || '未知';
    }
    
    async getMcpTools() {
        try {
            const response = await fetch('/api/v1/mcp/tools');
            return await response.json();
        } catch (error) {
            console.error('Failed to fetch MCP tools:', error);
            return { total_tools: 0 };
        }
    }
    
    // Helper methods for button state management
    setMcpButtonActive(buttonElement) {
        if (buttonElement) {
            buttonElement.classList.add('active');
        }
    }

    removeMcpButtonActive(buttonElement) {
        if (buttonElement) {
            buttonElement.classList.remove('active');
        }
    }

    findMcpButtonByText(containerSelector, textContent) {
        const container = document.querySelector(containerSelector);
        if (!container) return null;
        
        const buttons = container.querySelectorAll('.mcp-action-btn');
        return Array.from(buttons).find(btn => btn.textContent.trim() === textContent);
    }

    findMcpServerButton(serverName, action) {
        // Find button in server list for individual server operations
        const serverItems = document.querySelectorAll('.mcp-server-item');
        for (const item of serverItems) {
            const nameElement = item.querySelector('.mcp-server-name');
            if (nameElement && nameElement.textContent.trim() === serverName) {
                const actionButtons = item.querySelectorAll('.mcp-action-btn');
                return Array.from(actionButtons).find(btn => 
                    btn.textContent.trim().includes(action)
                );
            }
        }
        return null;
    }

    async startMcpServer(serverName) {
        const startButton = this.findMcpServerButton(serverName, '启动');
        this.setMcpButtonActive(startButton);
        
        try {
            const response = await fetch(`/api/v1/mcp/servers/${serverName}/start`, {
                method: 'POST'
            });
            
            if (response.ok) {
                this.showNotification(`服务器 ${serverName} 启动成功`, 'success');
                await this.refreshMcpStatus();
            } else {
                throw new Error(`启动失败: ${response.status}`);
            }
        } catch (error) {
            console.error('Failed to start MCP server:', error);
            this.showNotification(`启动服务器 ${serverName} 失败`, 'error');
        } finally {
            // 在状态刷新后，查找当前存在的按钮（可能是停止按钮）
            const currentButton = this.findMcpServerButton(serverName, '停止') || 
                                 this.findMcpServerButton(serverName, '启动');
            this.removeMcpButtonActive(currentButton);
        }
    }
    
    async stopMcpServer(serverName) {
        const stopButton = this.findMcpServerButton(serverName, '停止');
        this.setMcpButtonActive(stopButton);
        
        try {
            const response = await fetch(`/api/v1/mcp/servers/${serverName}/stop`, {
                method: 'POST'
            });
            
            if (response.ok) {
                this.showNotification(`服务器 ${serverName} 停止成功`, 'success');
                await this.refreshMcpStatus();
            } else {
                throw new Error(`停止失败: ${response.status}`);
            }
        } catch (error) {
            console.error('Failed to stop MCP server:', error);
            this.showNotification(`停止服务器 ${serverName} 失败`, 'error');
        } finally {
            // 在状态刷新后，查找当前存在的按钮（可能是启动按钮）
            const currentButton = this.findMcpServerButton(serverName, '启动') || 
                                 this.findMcpServerButton(serverName, '停止');
            this.removeMcpButtonActive(currentButton);
        }
    }
    
    async restartMcpServer(serverName) {
        const restartButton = this.findMcpServerButton(serverName, '重启');
        this.setMcpButtonActive(restartButton);
        
        try {
            const response = await fetch(`/api/v1/mcp/servers/${serverName}/restart`, {
                method: 'POST'
            });
            
            if (response.ok) {
                this.showNotification(`服务器 ${serverName} 重启成功`, 'success');
                await this.refreshMcpStatus();
            } else {
                throw new Error(`重启失败: ${response.status}`);
            }
        } catch (error) {
            console.error('Failed to restart MCP server:', error);
            this.showNotification(`重启服务器 ${serverName} 失败`, 'error');
        } finally {
            // 重启按钮在操作完成后仍然是重启按钮，但为了安全起见也查找当前按钮
            const currentButton = this.findMcpServerButton(serverName, '重启');
            this.removeMcpButtonActive(currentButton);
        }
    }
    
    async startAllMcpServers() {
        const startAllButton = document.getElementById('mcpStartAllBtn');
        this.setMcpButtonActive(startAllButton);
        
        try {
            const statusResponse = await fetch('/api/v1/mcp/servers');
            const statusData = await statusResponse.json();
            
            const startPromises = Object.entries(statusData.servers)
                .filter(([name, server]) => server.status !== 'running' && server.enabled)
                .map(([name]) => this._startMcpServerInternal(name));
            
            await Promise.all(startPromises);
            
            // 批量操作完成后统一刷新状态
            await this.refreshMcpStatus();
            this.showNotification('所有服务器启动完成', 'success');
            
        } catch (error) {
            console.error('Failed to start all servers:', error);
            this.showNotification('批量启动失败', 'error');
            // 即使失败也要刷新状态以显示真实情况
            await this.refreshMcpStatus();
        } finally {
            this.removeMcpButtonActive(startAllButton);
        }
    }
    
    async stopAllMcpServers() {
        const stopAllButton = document.getElementById('mcpStopAllBtn');
        this.setMcpButtonActive(stopAllButton);
        
        try {
            const statusResponse = await fetch('/api/v1/mcp/servers');
            const statusData = await statusResponse.json();
            
            const stopPromises = Object.entries(statusData.servers)
                .filter(([name, server]) => server.status === 'running')
                .map(([name]) => this._stopMcpServerInternal(name));
            
            await Promise.all(stopPromises);
            
            // 批量操作完成后统一刷新状态
            await this.refreshMcpStatus();
            this.showNotification('所有服务器停止完成', 'success');
            
        } catch (error) {
            console.error('Failed to stop all servers:', error);
            this.showNotification('批量停止失败', 'error');
            // 即使失败也要刷新状态以显示真实情况
            await this.refreshMcpStatus();
        } finally {
            this.removeMcpButtonActive(stopAllButton);
        }
    }
    
    async reloadMcpConfig() {
        const reloadButton = document.getElementById('mcpReloadConfigBtn');
        this.setMcpButtonActive(reloadButton);
        
        try {
            const response = await fetch('/api/v1/mcp/reload', {
                method: 'POST'
            });
            
            if (response.ok) {
                this.showNotification('MCP配置重载成功', 'success');
                await this.refreshMcpStatus();
            } else {
                throw new Error(`重载失败: ${response.status}`);
            }
        } catch (error) {
            console.error('Failed to reload MCP config:', error);
            this.showNotification('MCP配置重载失败', 'error');
        } finally {
            this.removeMcpButtonActive(reloadButton);
        }
    }
    
    
    // 内部方法：不自动刷新状态的服务器操作（用于批量操作）
    async _startMcpServerInternal(serverName) {
        const response = await fetch(`/api/v1/mcp/servers/${serverName}/start`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error(`启动 ${serverName} 失败: ${response.status}`);
        }
        
        return response;
    }
    
    async _stopMcpServerInternal(serverName) {
        const response = await fetch(`/api/v1/mcp/servers/${serverName}/stop`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error(`停止 ${serverName} 失败: ${response.status}`);
        }
        
        return response;
    }

    startMcpStatusPolling() {
        // 清除现有的轮询
        if (this.mcpStatusInterval) {
            clearInterval(this.mcpStatusInterval);
        }
        
        // 每30秒更新一次MCP状态
        this.mcpStatusInterval = setInterval(async () => {
            if (this.mcpStatusVisible) {
                await this.refreshMcpStatus();
            } else {
                // 即使面板不可见，也要更新按钮状态
                await this.updateMcpButtonStatus();
            }
        }, 30000);
    }
    
    stopMcpStatusPolling() {
        if (this.mcpStatusInterval) {
            clearInterval(this.mcpStatusInterval);
            this.mcpStatusInterval = null;
        }
    }
    
    async updateMcpButtonStatus() {
        try {
            const response = await fetch('/api/v1/mcp/health');
            const data = await response.json();
            this.updateMcpHeaderStatus(data.overall_status);
        } catch (error) {
            console.error('Failed to update MCP button status:', error);
            this.updateMcpHeaderStatus('unknown');
        }
    }
}

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.chatApp = new ChatApp();
    
    // 添加MCP状态相关事件监听器
    document.getElementById('mcpStatusBtn').addEventListener('click', () => window.chatApp.showMcpStatus());
    document.getElementById('closeMcpStatus').addEventListener('click', () => window.chatApp.hideMcpStatus());
    document.getElementById('refreshMcpBtn').addEventListener('click', () => window.chatApp.refreshMcpStatus(true));
    
    // MCP操作按钮
    document.getElementById('mcpStartAllBtn').addEventListener('click', () => window.chatApp.startAllMcpServers());
    document.getElementById('mcpStopAllBtn').addEventListener('click', () => window.chatApp.stopAllMcpServers());
    document.getElementById('mcpReloadConfigBtn').addEventListener('click', () => window.chatApp.reloadMcpConfig());
    
    // 点击遮罩关闭MCP面板
    document.getElementById('mcpStatusPanel').addEventListener('click', (e) => {
        if (e.target.id === 'mcpStatusPanel') {
            window.chatApp.hideMcpStatus();
        }
    });
});
            