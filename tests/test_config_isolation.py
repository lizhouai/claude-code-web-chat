#!/usr/bin/env python3
"""
测试配置隔离脚本
验证项目是否只使用本地配置文件，而不受全局 Claude Code 配置影响
"""
import sys
import os
import json
from app.utils.config import local_config

def test_config_isolation():
    """测试配置隔离"""
    print("🔍 测试 Claude Code Web Chat 配置隔离")
    print("=" * 50)

    # 1. 测试项目根目录
    print(f"✅ 项目根目录: {local_config.project_root}")
    assert local_config.project_root.endswith("claude-code-web-chat"), "项目根目录不正确"
    
    # 2. 测试本地配置文件
    mcp_config_path = local_config.get_mcp_config_path()
    print(f"✅ MCP配置文件: {mcp_config_path}")
    assert os.path.exists(mcp_config_path), f"MCP配置文件不存在: {mcp_config_path}"
    
    # 3. 测试环境变量加载
    env_path = os.path.join(local_config.project_root, '.env')
    print(f"✅ 环境变量文件: {env_path}")
    assert os.path.exists(env_path), f"环境变量文件不存在: {env_path}"
    
    # 4. 测试 MCP 配置内容
    mcp_config = local_config.get_mcp_config()
    mcp_servers = mcp_config.get('mcpServers', {})
    print(f"✅ 本地 MCP 服务器数量: {len(mcp_servers)}")
    
    # 验证只加载了本地配置的服务器
    local_servers = list(mcp_servers.keys())
    print(f"✅ 本地 MCP 服务器: {local_servers}")
    
    # 确保没有加载 serena（这是全局配置中的）
    if 'serena' in local_servers:
        print("⚠️  警告: 检测到 serena MCP 服务器，可能仍在使用全局配置")
        return False
    
    # 5. 测试 API 配置
    api_config = local_config.get_api_config()
    print(f"✅ API 端口: {api_config['port']}")
    print(f"✅ API 主机: {api_config['host']}")
    
    # 6. 测试环境变量替换
    if mcp_servers:
        for server_name, server_config in mcp_servers.items():
            if 'env' in server_config:
                env_vars = server_config['env']
                for key, value in env_vars.items():
                    if isinstance(value, str) and not value.startswith('${'):
                        print(f"✅ 环境变量 {key} 已正确替换")
    
    print("\n🎉 配置隔离测试通过！")
    print("项目现在只使用本地配置文件：")
    print("  - .env (环境变量)")
    print("  - mcp_servers.json (MCP 服务器配置)")
    print("不再受 Claude Code 全局配置影响")
    
    return True

if __name__ == "__main__":
    try:
        success = test_config_isolation()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        sys.exit(1)