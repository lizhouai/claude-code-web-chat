/**
 * Markdown格式化工具类
 * 提供更好的Markdown渲染支持
 */
class MarkdownFormatter {
    constructor() {
        this.isMarkedLoaded = false;
        this.isPrismLoaded = false;
        this.checkLibraries();
    }
    
    checkLibraries() {
        // 检查marked库是否已加载
        this.isMarkedLoaded = typeof marked !== 'undefined';
        // 检查Prism库是否已加载
        this.isPrismLoaded = typeof Prism !== 'undefined';
        
        if (this.isMarkedLoaded) {
            this.setupMarked();
        }
    }
    
    setupMarked() {
        // 配置marked选项
        marked.setOptions({
            breaks: true,          // 支持换行符转换为<br>
            gfm: true,            // 启用GitHub风格的Markdown
            sanitize: false,      // 允许HTML标签
            headerIds: false,     // 禁用标题ID生成
            mangle: false,        // 禁用邮箱地址混淆
            highlight: (code, lang) => this.highlightCode(code, lang)
        });
    }
    
    highlightCode(code, lang) {
        if (!this.isPrismLoaded || !lang) {
            return code;
        }
        
        try {
            // 确保语言名称是小写
            const language = lang.toLowerCase();
            
            // 检查语言是否被Prism支持
            if (Prism.languages[language]) {
                return Prism.highlight(code, Prism.languages[language], language);
            } else {
                // 如果不支持该语言，尝试加载
                if (typeof Prism.plugins !== 'undefined' && Prism.plugins.autoloader) {
                    // 异步加载语言，此次先返回原始代码
                    Prism.plugins.autoloader.loadLanguages([language]);
                }
                return code;
            }
        } catch (error) {
            console.warn('代码高亮失败:', error);
            return code;
        }
    }
    
    /**
     * 格式化Markdown内容
     * @param {string} content - 原始Markdown内容
     * @returns {string} - 格式化后的HTML内容
     */
    formatMessage(content) {
        if (!content) return '';
        
        try {
            if (this.isMarkedLoaded) {
                // 使用marked.js渲染Markdown
                const html = marked.parse(content);
                
                // 后处理：确保代码块有正确的class
                return this.postProcessHtml(html);
            } else {
                console.warn('marked库未加载，使用基础格式化');
                return this.basicFormatMessage(content);
            }
        } catch (error) {
            console.error('Markdown渲染失败:', error);
            return this.basicFormatMessage(content);
        }
    }
    
    /**
     * 后处理HTML，添加必要的class和样式
     * @param {string} html - 原始HTML
     * @returns {string} - 处理后的HTML
     */
    postProcessHtml(html) {
        // 为表格添加响应式class
        html = html.replace(/<table>/g, '<table class="markdown-table">');
        
        // 为代码块添加行号支持（如果需要）
        html = html.replace(/<pre><code class="language-(\w+)">/g, 
            '<pre class="line-numbers"><code class="language-$1">');
        
        // 为链接添加target="_blank"（可选）
        html = html.replace(/<a href="http/g, '<a target="_blank" href="http');
        
        return html;
    }
    
    /**
     * 基础格式化方法（备用）
     * @param {string} content - 原始内容
     * @returns {string} - 基础格式化后的HTML
     */
    basicFormatMessage(content) {
        let formatted = content
            // 加粗文本
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // 斜体文本
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            // 行内代码
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            // 链接
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
            // 换行
            .replace(/\n/g, '<br>');
        
        // 代码块处理
        formatted = formatted.replace(/```(\w+)?\n?([\s\S]*?)```/g, (match, lang, code) => {
            const language = lang || 'text';
            return `<pre><code class="language-${language}">${this.escapeHtml(code.trim())}</code></pre>`;
        });
        
        // 引用块处理
        formatted = formatted.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
        
        // 标题处理
        formatted = formatted.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        formatted = formatted.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        formatted = formatted.replace(/^# (.+)$/gm, '<h1>$1</h1>');
        
        // 列表处理
        formatted = formatted.replace(/^\* (.+)$/gm, '<li>$1</li>');
        formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        
        return formatted;
    }
    
    /**
     * 转义HTML特殊字符
     * @param {string} text - 需要转义的文本
     * @returns {string} - 转义后的文本
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * 获取支持的语言列表
     * @returns {Array} - 支持的语言列表
     */
    getSupportedLanguages() {
        if (!this.isPrismLoaded) {
            return ['text', 'javascript', 'python', 'css', 'html'];
        }
        
        return Object.keys(Prism.languages);
    }
    
    /**
     * 手动触发代码高亮
     * @param {Element} element - 包含代码的DOM元素
     */
    highlightElement(element) {
        if (this.isPrismLoaded && element) {
            Prism.highlightAllUnder(element);
        }
    }
}

// 创建全局实例
window.markdownFormatter = new MarkdownFormatter();