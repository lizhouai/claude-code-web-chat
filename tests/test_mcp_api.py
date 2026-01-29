#!/usr/bin/env python3

import asyncio
from app.services.mcp_manager import mcp_manager

async def test_mcp_manager():
    try:
        print("Testing MCP manager...")
        
        # 重新初始化管理器
        await mcp_manager.initialize()
        print("MCP manager initialized")
        
        # 测试获取服务器状态
        status = await mcp_manager.get_server_status()
        print(f"Server status: {status}")
        
        # 测试获取可用工具
        tools = await mcp_manager.get_available_tools()
        print(f"Available tools: {tools}")
        
        print("MCP manager test completed successfully!")
        
    except Exception as e:
        print(f"MCP manager test failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_mcp_manager())