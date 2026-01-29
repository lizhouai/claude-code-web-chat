from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class QueryRequest(BaseModel):
    prompt: str = Field(..., description="用户查询内容")
    system_prompt: str = Field(default="你是一个非常实用的助手。", description="系统提示词")
    max_turns: int = Field(default=20, ge=1, le=100, description="最大对话轮次")
    allowed_tools: List[str] = Field(default=["Bash", "Read", "WebSearch"], description="允许使用的工具")
    stream: bool = Field(default=False, description="是否使用流式响应")
    conversation_history: Optional[List[Dict[str, Any]]] = Field(default=None, description="对话历史记录")

class QueryResponse(BaseModel):
    result: str = Field(..., description="查询结果")
    cost: float = Field(..., description="API调用费用")
    duration_ms: int = Field(..., description="处理耗时(毫秒)")
    session_id: Optional[str] = Field(None, description="会话ID")
    num_turns: Optional[int] = Field(None, description="实际对话轮次")

class ErrorResponse(BaseModel):
    error: str = Field(..., description="错误信息")
    detail: Optional[str] = Field(None, description="错误详情")
    timestamp: Optional[str] = Field(None, description="错误时间")