"""
Session management routes
"""
from fastapi import APIRouter, HTTPException, status, Body
from fastapi.responses import JSONResponse
from typing import List, Optional, Any
from pydantic import BaseModel, ValidationError
from app.services.session_manager import session_manager
import logging

logger = logging.getLogger(__name__)

router = APIRouter(tags=["sessions"])

# Data models
class SessionMessage(BaseModel):
    role: str
    content: str
    timestamp: str

class SessionSettings(BaseModel):
    mode: str = "general"  # 添加mode字段，默认为General Model
    systemPrompt: str = "You are a helpful assistant"
    maxTurns: int = 5
    allowedTools: List[str] = ["WebSearch", "Read"]

class SessionData(BaseModel):
    id: str
    name: str
    createdAt: str
    updatedAt: str
    messages: List[SessionMessage] = []
    settings: SessionSettings = SessionSettings()

class CreateSessionRequest(BaseModel):
    name: Optional[str] = None

class UpdateSessionRequest(BaseModel):
    name: Optional[str] = None
    messages: Optional[List[SessionMessage]] = None
    settings: Optional[SessionSettings] = None

class UpsertSessionRequest(BaseModel):
    """Complete session data model for PUT requests (supports create or update)"""
    id: str
    name: str
    createdAt: str
    updatedAt: str
    messages: List[SessionMessage] = []
    settings: SessionSettings = SessionSettings()

@router.get("/list", response_model=List[SessionData])
async def list_sessions():
    """Get all sessions list"""
    try:
        sessions = await session_manager.list_sessions()
        return sessions
    except Exception as e:
        logger.error(f"Failed to get session list: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get session list"
        )

@router.get("/{session_id}", response_model=SessionData)
async def get_session(session_id: str):
    """Get specified session"""
    try:
        session = await session_manager.get_session(session_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        return session
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get session"
        )

@router.post("/", response_model=SessionData)
async def create_session(request: CreateSessionRequest):
    """Create new session"""
    try:
        session = await session_manager.create_session(request.name)
        return session
    except Exception as e:
        logger.error(f"Failed to create session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create session"
        )

@router.put("/{session_id}", response_model=SessionData)
async def update_session(session_id: str, request: UpsertSessionRequest):
    """Update or create session (Upsert operation)"""
    try:
        # Verify if session_id in URL matches id in request body
        if session_id != request.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="session_id in URL does not match id in request body"
            )
        
        # Check if session already exists
        existing_session = await session_manager.get_session(session_id)
        
        # Convert request data to dictionary format
        session_data = {
            "id": request.id,
            "name": request.name,
            "createdAt": request.createdAt,
            "updatedAt": request.updatedAt,
            "messages": [msg.model_dump() if hasattr(msg, 'model_dump') else msg for msg in request.messages],
            "settings": request.settings.model_dump() if hasattr(request.settings, 'model_dump') else request.settings
        }
        
        if existing_session:
            # Session exists, perform update operation
            session = await session_manager.update_session(
                session_id,
                name=request.name,
                messages=session_data["messages"],
                settings=session_data["settings"]
            )
            logger.info(f"Session updated successfully: {session_id}")
        else:
            # Session does not exist, perform create operation
            # Directly save complete session data
            success = await session_manager.save_session(session_data)
            if success:
                session = session_data
                logger.info(f"Session created successfully: {session_id}")
            else:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to save session"
                )
        
        return session
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to process session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process session"
        )

@router.delete("/{session_id}")
async def delete_session(session_id: str):
    """Delete session"""
    try:
        success = await session_manager.delete_session(session_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"message": "Session deleted successfully"}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete session"
        )

@router.post("/sync", response_model=List[SessionData])
async def sync_sessions(sessions_data: List[Any] = Body(...)):
    """Batch synchronize session data"""
    try:
        # Log the raw input for debugging
        logger.info(f"Received sync request with {len(sessions_data)} sessions")

        # Validate and convert to SessionData objects
        validated_sessions = []
        for i, session_data in enumerate(sessions_data):
            try:
                validated_session = SessionData(**session_data)
                validated_sessions.append(validated_session)
            except ValidationError as e:
                logger.error(f"Session {i} validation failed: {e}")
                logger.error(f"Session data: {session_data}")
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Session {i} validation error: {str(e)}"
                )

        # Convert Pydantic models to dictionaries
        sessions_dict = [session.model_dump() for session in validated_sessions]
        synced_sessions = await session_manager.sync_sessions(sessions_dict)
        return synced_sessions
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Failed to sync sessions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to sync sessions"
        )

@router.post("/merge")
async def merge_sessions(local_sessions: List[SessionData]):
    """Merge local and server session data"""
    try:
        # Convert Pydantic models to dictionaries
        sessions_dict = [session.model_dump() for session in local_sessions]
        merged_result = await session_manager.merge_sessions(sessions_dict)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=merged_result
        )
    except Exception as e:
        logger.error(f"Failed to merge sessions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to merge sessions"
        )