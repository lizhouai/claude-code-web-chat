// 测试历史会话mode字段修复功能的脚本
// 在浏览器控制台中运行

// 1. 清理现有数据
console.log('=== 清理现有数据 ===');
localStorage.removeItem('claude_mcp_sessions');

// 2. 创建没有mode字段的历史会话数据
console.log('=== 创建历史会话数据（无mode字段）===');
const legacySessionData = {
    'legacy-session-1': {
        id: 'legacy-session-1',
        name: '历史会话1（无settings）',
        createdAt: '2024-01-01T10:00:00Z',
        updatedAt: '2024-01-01T10:00:00Z',
        messages: []
        // 注意：完全没有settings字段
    },
    'legacy-session-2': {
        id: 'legacy-session-2',
        name: '历史会话2（无mode）',
        createdAt: '2024-01-02T10:00:00Z',
        updatedAt: '2024-01-02T10:00:00Z',
        settings: {
            systemPrompt: '你是一个助手',
            maxTurns: 10,
            allowedTools: ['WebSearch']
            // 注意：没有mode字段
        },
        messages: []
    }
};

localStorage.setItem('claude_mcp_sessions', JSON.stringify(legacySessionData));
console.log('已设置历史会话数据:', legacySessionData);

// 3. 检查当前localStorage状态
console.log('=== 当前localStorage状态 ===');
const currentData = JSON.parse(localStorage.getItem('claude_mcp_sessions') || '{}');
Object.entries(currentData).forEach(([id, session]) => {
    console.log(`会话 ${id}:`);
    console.log(`  - 有settings: ${!!session.settings}`);
    console.log(`  - 有mode: ${!!(session.settings && session.settings.mode)}`);
    if (session.settings) {
        console.log(`  - mode值: ${session.settings.mode || 'undefined'}`);
    }
});

// 4. 提示用户刷新页面
console.log('=== 测试指令 ===');
console.log('1. 刷新页面');
console.log('2. 在控制台运行以下代码检查结果:');
console.log('const sessions = JSON.parse(localStorage.getItem("claude_mcp_sessions") || "{}");');
console.log('Object.entries(sessions).forEach(([id, session]) => {');
console.log('  console.log(`${id}: mode=${session.settings?.mode}`);');
console.log('});');