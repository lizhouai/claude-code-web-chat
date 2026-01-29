#!/usr/bin/env python3
"""
测试API修复是否正常工作
"""
import json
import asyncio
import sys
import os

# 添加app目录到Python路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app'))

from services.session_manager import session_manager

async def test_sync_functionality():
    """测试同步功能"""
    print("🧪 测试会话同步功能...")
    
    # 创建测试会话数据
    test_sessions = [
        {
            "id": "test_session_1",
            "name": "测试会话1",
            "createdAt": "2024-01-20T10:00:00.000Z",
            "updatedAt": "2024-01-20T10:30:00.000Z",
            "messages": [
                {
                    "role": "user",
                    "content": "测试消息",
                    "timestamp": "2024-01-20T10:30:00.000Z"
                }
            ],
            "settings": {
                "systemPrompt": "You are a helpful assistant",
                "maxTurns": 5,
                "allowedTools": ["WebSearch", "Read"]
            }
        },
        {
            "id": "test_session_2", 
            "name": "测试会话2",
            "createdAt": "2024-01-20T11:00:00.000Z",
            "updatedAt": "2024-01-20T11:15:00.000Z",
            "messages": [],
            "settings": {
                "systemPrompt": "You are a coding assistant",
                "maxTurns": 10,
                "allowedTools": ["WebSearch", "Read", "Write"]
            }
        }
    ]
    
    try:
        # 测试同步功能
        print("📤 测试同步会话...")
        synced_sessions = await session_manager.sync_sessions(test_sessions)
        print(f"✅ 同步成功: {len(synced_sessions)} 个会话")
        
        # 测试合并功能
        print("🔀 测试合并会话...")
        merge_result = await session_manager.merge_sessions(test_sessions)
        print(f"✅ 合并成功: {len(merge_result['sessions'])} 个会话")
        print(f"   统计信息: {merge_result['stats']}")
        
        if merge_result['conflicts']:
            print(f"⚠️  检测到 {len(merge_result['conflicts'])} 个冲突")
        
        print("🎉 所有测试通过！")
        return True
        
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_time_parsing():
    """测试时间戳解析"""
    print("\n⏰ 测试时间戳解析...")
    
    from datetime import datetime
    
    test_timestamps = [
        "2024-01-20T10:30:00.000Z",
        "2024-01-20T10:30:00.000+00:00", 
        "2024-01-20T10:30:00.000",
        "2024-01-20T10:30:00Z",
        "invalid_timestamp"
    ]
    
    for ts in test_timestamps:
        try:
            # 使用与session_manager相同的逻辑
            time_str = ts
            if time_str.endswith('Z'):
                time_str = time_str[:-1] + '+00:00'
            parsed_time = datetime.fromisoformat(time_str)
            print(f"✅ {ts} -> {parsed_time}")
        except (ValueError, Exception) as e:
            print(f"❌ {ts} -> 解析失败: {e}")

async def test_data_directory():
    """测试数据目录"""
    print("\n📁 测试数据目录...")
    
    sessions_dir = "data/sessions"
    if not os.path.exists(sessions_dir):
        print(f"❌ 数据目录不存在: {sessions_dir}")
        print("   创建数据目录...")
        os.makedirs(sessions_dir, exist_ok=True)
        print(f"✅ 数据目录创建成功: {sessions_dir}")
    else:
        print(f"✅ 数据目录存在: {sessions_dir}")
    
    # 列出现有文件
    files = os.listdir(sessions_dir)
    print(f"📋 现有会话文件: {len(files)} 个")
    for file in files[:5]:  # 只显示前5个
        print(f"   - {file}")
    
    if len(files) > 5:
        print(f"   ... 还有 {len(files) - 5} 个文件")

async def main():
    """主测试函数"""
    print("🚀 开始API修复测试\n")
    
    await test_data_directory()
    await test_time_parsing()
    
    success = await test_sync_functionality()
    
    if success:
        print("\n🎉 所有测试通过，API修复成功！")
        return 0
    else:
        print("\n❌ 测试失败，需要进一步调试")
        return 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)