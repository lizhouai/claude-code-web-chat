# 测试文件说明

这个目录包含了项目的各种测试和调试工具，包括前端和后端的测试。

## 前端测试文件

### Web测试页面（需要通过Web服务器访问）
- `test-mode-persistence.html` - 测试会话模式字段的持久化功能
- `test-session-compatibility.html` - 测试会话兼容性处理
- `test-server-mode-fix.html` - 测试服务器端模式字段修复
- `test-markdown.html` - 测试Markdown渲染功能
- `debug-localstorage.html` - 可视化查看和管理localStorage数据

### JavaScript测试脚本
- `test-mode-fix.js` - 模式字段修复的测试脚本

## 后端测试文件

### Python测试模块
- `test_api_fix.py` - API修复相关测试
- `test_config_isolation.py` - 配置隔离测试
- `test_fix_simple.py` - 简单修复功能测试
- `test_mcp_api.py` - MCP API测试
- `test_rate_limit.py` - 速率限制测试
- `test_rate_limit_simple.py` - 简化的速率限制测试

### HTML系统测试页面
- `test_session_performance.html` - 会话性能测试
- `test_session_ui.html` - 会话UI测试
- `test_sync_system.html` - 同步系统测试

## 使用方法

### 前端测试
1. 启动Web服务：
```bash
python app/main.py
```

2. 在浏览器中访问测试页面，例如：
- http://localhost:8000/tests/test-mode-persistence.html
- http://localhost:8000/tests/debug-localstorage.html

### 后端测试
运行Python测试：
```bash
python -m pytest tests/test_api_fix.py
python -m pytest tests/test_mcp_api.py
```

## 注意事项

- 前端测试页面需要在与主应用相同的域下运行
- 确保Web服务已启动（端口8000）
- 建议在开发者工具的控制台中查看详细日志
- Python测试需要安装pytest：`pip install pytest`
- 这些测试文件仅用于开发和调试，生产环境中不应包含这些文件