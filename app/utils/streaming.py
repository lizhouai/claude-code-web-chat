import json
import asyncio
from typing import AsyncGenerator, Dict, Any

async def stream_json_response(data_generator: AsyncGenerator[Dict[str, Any], None]) -> AsyncGenerator[str, None]:
    """将数据生成器转换为SSE格式的流式响应"""
    try:
        async for data in data_generator:
            yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
    except Exception as e:
        error_data = {"error": str(e), "type": "stream_error"}
        yield f"data: {json.dumps(error_data, ensure_ascii=False)}\n\n"
    finally:
        # 发送结束标记
        yield f"data: {json.dumps({'type': 'stream_end'}, ensure_ascii=False)}\n\n"

async def stream_text_response(text_generator: AsyncGenerator[str, None]) -> AsyncGenerator[str, None]:
    """将文本生成器转换为SSE格式的流式响应"""
    try:
        async for text in text_generator:
            data = {"text": text, "type": "text_chunk"}
            yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
    except Exception as e:
        error_data = {"error": str(e), "type": "stream_error"}
        yield f"data: {json.dumps(error_data, ensure_ascii=False)}\n\n"
    finally:
        yield f"data: {json.dumps({'type': 'stream_end'}, ensure_ascii=False)}\n\n"

class StreamingHelper:
    """流式响应辅助类"""
    
    @staticmethod
    def format_sse_message(data: Dict[str, Any], event_type: str = None) -> str:
        """格式化SSE消息"""
        message = ""
        if event_type:
            message += f"event: {event_type}\n"
        message += f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
        return message
    
    @staticmethod
    async def handle_stream_error(error: Exception) -> str:
        """处理流式响应错误"""
        error_data = {
            "error": str(error),
            "type": "error",
            "timestamp": asyncio.get_event_loop().time()
        }
        return StreamingHelper.format_sse_message(error_data, "error")
    
    @staticmethod
    async def create_heartbeat_stream(interval: int = 30) -> AsyncGenerator[str, None]:
        """创建心跳流，保持连接活跃"""
        while True:
            await asyncio.sleep(interval)
            heartbeat_data = {"type": "heartbeat", "timestamp": asyncio.get_event_loop().time()}
            yield StreamingHelper.format_sse_message(heartbeat_data, "heartbeat")