from fastapi import APIRouter, HTTPException
from starlette.requests import Request
from fastapi.responses import StreamingResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.models import QueryRequest, QueryResponse
from app.services.claude_service import ClaudeService
from app.utils.streaming import stream_json_response
from app.utils.rate_limiter import get_rate_limit
import json
import logging

logger = logging.getLogger(__name__)
router = APIRouter()
claude_service = ClaudeService()

# Create limiter instance (for decorator)
limiter = Limiter(key_func=get_remote_address)

@router.post("/query", response_model=QueryResponse)
@limiter.limit(get_rate_limit())  # Read rate limit from environment variables
async def query_claude(query_request: QueryRequest, request: Request):
    """Basic query endpoint"""
    try:
        logger.info(f"Received query request: {query_request.prompt[:100]}...")
        return await claude_service.query(query_request)
    except Exception as e:
        logger.error(f"Query failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/query/stream")
@limiter.limit(get_rate_limit())  # Read rate limit from environment variables
async def stream_query(query_request: QueryRequest, request: Request):
    """Streaming query endpoint"""
    try:
        logger.info(f"Received streaming query request: {query_request.prompt[:100]}...")
        
        async def generate():
            try:
                async for chunk in claude_service.stream_query(query_request):
                    yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
            except GeneratorExit:
                # Normal exit when client disconnects
                return
            except Exception as e:
                logger.error(f"Stream generation error: {e}")
                yield f"data: {json.dumps({'error': str(e), 'type': 'error'}, ensure_ascii=False)}\n\n"
        
        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",  # Disable nginx buffering
            }
        )
    except Exception as e:
        logger.error(f"Streaming query failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sessions/{session_id}")
async def get_session_info(session_id: str):
    """Get session information"""
    try:
        return await claude_service.get_session_info(session_id)
    except Exception as e:
        logger.error(f"Failed to get session information: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/query/interrupt/{session_id}")
@limiter.limit(get_rate_limit())
async def interrupt_query(session_id: str, request: Request):
    """Interrupt an active query session"""
    logger.info(f"Received interrupt request for session: {session_id}")

    # 调用中断服务，这个方法内部已经处理了所有中断相关的异常
    success = await claude_service.interrupt_session(session_id)

    if success:
        return {"success": True, "message": "Session interrupted successfully"}
    else:
        return {"success": False, "message": "Session not found or already completed"}

@router.post("/web-preview")
@limiter.limit(get_rate_limit())
async def get_web_preview(request: Request):
    """Get web page preview with title, description and thumbnail"""
    try:
        data = await request.json()
        url = data.get('url')

        if not url:
            raise HTTPException(status_code=400, detail="URL is required")

        # Basic URL validation
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url

        preview_data = await claude_service.get_web_preview(url)
        return preview_data

    except ValueError as e:
        logger.error(f"Invalid URL: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Invalid URL: {str(e)}")
    except Exception as e:
        logger.error(f"Web preview failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))