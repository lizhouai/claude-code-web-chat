/**
 * 自定义确认对话框组件
 * 与setting面板风格保持一致
 */
class ConfirmDialog {
    constructor() {
        this.dialog = null;
        this.titleEl = null;
        this.messageEl = null;
        this.cancelBtn = null;
        this.okBtn = null;
        this.currentResolve = null;
        this.currentMode = 'confirm'; // 'confirm' or 'input'
        this.inputElement = null;
        
        this.init();
    }
    
    init() {
        this.dialog = document.getElementById('confirmDialog');
        this.titleEl = document.getElementById('confirmTitle');
        this.messageEl = document.getElementById('confirmMessage');
        this.cancelBtn = document.getElementById('confirmCancel');
        this.okBtn = document.getElementById('confirmOk');
        
        this.bindEvents();
    }
    
    bindEvents() {
        // 取消按钮
        this.cancelBtn.addEventListener('click', () => {
            this.handleCancel();
        });
        
        // 确定按钮
        this.okBtn.addEventListener('click', () => {
            this.handleConfirm();
        });
        
        // 点击遮罩关闭
        this.dialog.addEventListener('click', (e) => {
            if (e.target === this.dialog) {
                this.handleCancel();
            }
        });
        
        // ESC键关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.dialog.classList.contains('show')) {
                this.handleCancel();
            }
        });
    }
    
    handleConfirm() {
        if (this.currentMode === 'input') {
            this.handleInputConfirm();
        } else {
            this.hide();
            if (this.currentResolve) {
                this.currentResolve(true);
                this.currentResolve = null;
            }
        }
    }
    
    handleCancel() {
        this.hide();
        if (this.currentMode === 'input' && this.inputElement) {
            this.inputElement.remove();
            this.inputElement = null;
        }
        if (this.currentResolve) {
            this.currentResolve(this.currentMode === 'input' ? null : false);
            this.currentResolve = null;
        }
    }
    
    handleInputConfirm() {
        if (!this.inputElement) return;
        
        const value = this.inputElement.value.trim();
        
        // 简单验证 - 如果有更复杂的验证需求，可以通过options传入
        if (this.validateFn && !this.validateFn(value)) {
            this.inputElement.focus();
            return;
        }
        
        this.hide();
        this.inputElement.remove();
        this.inputElement = null;
        if (this.currentResolve) {
            this.currentResolve(value);
            this.currentResolve = null;
        }
    }
    
    /**
     * 显示确认对话框
     * @param {Object} options - 配置选项
     * @param {string} options.title - 标题
     * @param {string} options.message - 消息内容
     * @param {string} options.type - 类型 (danger, primary, warning)
     * @param {string} options.confirmText - 确认按钮文本
     * @param {string} options.cancelText - 取消按钮文本
     * @returns {Promise<boolean>} 用户选择结果
     */
    show(options = {}) {
        return new Promise((resolve) => {
            const {
                title = '确认操作',
                message = '您确定要执行此操作吗？',
                type = 'danger',
                confirmText = '确定',
                cancelText = '取消'
            } = options;
            
            // 设置模式
            this.currentMode = 'confirm';
            this.validateFn = null;
            
            // 设置内容
            this.titleEl.textContent = title;
            this.messageEl.textContent = message;
            this.cancelBtn.textContent = cancelText;
            this.okBtn.textContent = confirmText;
            
            // 设置按钮样式
            this.okBtn.className = `confirm-btn ${type}`;
            
            // 显示对话框
            this.dialog.classList.add('show');
            
            // 保存resolve函数
            this.currentResolve = resolve;
            
            // 聚焦到取消按钮（安全默认）
            this.cancelBtn.focus();
        });
    }
    
    /**
     * 隐藏对话框
     */
    hide() {
        this.dialog.classList.remove('show');
    }
    
    /**
     * 显示删除确认对话框
     * @param {string} itemName - 要删除的项目名称
     * @param {string} itemType - 项目类型（如：会话、文件等）
     * @returns {Promise<boolean>}
     */
    confirmDelete(itemName, itemType = '项目') {
        return this.show({
            title: '确认删除',
            message: `确定要删除${itemType}"${itemName}"吗？\n此操作不可恢复。`,
            type: 'danger',
            confirmText: '删除',
            cancelText: '取消'
        });
    }
    
    /**
     * 显示清空确认对话框
     * @param {string} content - 要清空的内容描述
     * @returns {Promise<boolean>}
     */
    confirmClear(content = '所有内容') {
        return this.show({
            title: '确认清空',
            message: `确定要清空${content}吗？\n此操作不可恢复。`,
            type: 'danger',
            confirmText: '清空',
            cancelText: '取消'
        });
    }
    
    /**
     * 显示保存确认对话框
     * @param {string} message - 自定义消息
     * @returns {Promise<boolean>}
     */
    confirmSave(message = '确定要保存当前更改吗？') {
        return this.show({
            title: '确认保存',
            message: message,
            type: 'primary',
            confirmText: '保存',
            cancelText: '取消'
        });
    }
    
    /**
     * 显示重置确认对话框
     * @param {string} content - 要重置的内容描述
     * @returns {Promise<boolean>}
     */
    confirmReset(content = '设置') {
        return this.show({
            title: '确认重置',
            message: `确定要重置${content}吗？
此操作将恢复到默认状态。`,
            type: 'danger',
            confirmText: '重置',
            cancelText: '取消'
        });
    }
    
    /**
     * 显示输入对话框
     * @param {Object} options - 配置选项
     * @param {string} options.title - 标题
     * @param {string} options.message - 提示消息
     * @param {string} options.placeholder - 输入框占位符
     * @param {string} options.defaultValue - 默认值
     * @param {string} options.confirmText - 确认按钮文本
     * @param {string} options.cancelText - 取消按钮文本
     * @param {Function} options.validate - 输入验证函数
     * @returns {Promise<string|null>} 用户输入的值，取消时返回null
     */
    showInput(options = {}) {
        return new Promise((resolve) => {
            const {
                title = '输入',
                message = '请输入内容:',
                placeholder = '',
                defaultValue = '',
                confirmText = '确定',
                cancelText = '取消',
                validate = null
            } = options;
            
            // 设置模式
            this.currentMode = 'input';
            this.validateFn = validate;
            
            // 创建输入框
            this.inputElement = document.createElement('input');
            this.inputElement.type = 'text';
            this.inputElement.className = 'confirm-input';
            this.inputElement.placeholder = placeholder;
            this.inputElement.value = defaultValue;
            
            // 设置内容
            this.titleEl.textContent = title;
            this.messageEl.textContent = message;
            this.cancelBtn.textContent = cancelText;
            this.okBtn.textContent = confirmText;
            
            // 插入输入框
            this.messageEl.parentNode.insertBefore(this.inputElement, this.messageEl.nextSibling);
            
            // 设置按钮样式
            this.okBtn.className = 'confirm-btn primary';
            
            // 回车确认
            this.inputElement.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleInputConfirm();
                }
            });
            
            // 显示对话框并聚焦输入框
            this.dialog.classList.add('show');
            this.currentResolve = resolve;
            
            // 聚焦输入框并选中默认值
            setTimeout(() => {
                this.inputElement.focus();
                if (defaultValue) {
                    this.inputElement.select();
                }
            }, 100);
        });
    }
}

// 创建全局实例
window.confirmDialog = new ConfirmDialog();

// 提供简便的全局函数
window.showConfirm = (options) => window.confirmDialog.show(options);
window.showInput = (options) => window.confirmDialog.showInput(options);
window.confirmDelete = (itemName, itemType) => window.confirmDialog.confirmDelete(itemName, itemType);
window.confirmClear = (content) => window.confirmDialog.confirmClear(content);
window.confirmSave = (message) => window.confirmDialog.confirmSave(message);
window.confirmReset = (content) => window.confirmDialog.confirmReset(content);