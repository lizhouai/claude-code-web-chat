"""
Session management service
"""
import os
import json
import asyncio
from pathlib import Path

from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

class SessionManager:
    def __init__(self):
        # Get data directory from environment, defaulting to user directory
        data_dir = os.getenv('DATA_DIR', '~/.claudecodechat/data')
        # Expand ~ if present
        if data_dir.startswith('~'):
            data_dir = os.path.expanduser(data_dir)
        self.sessions_dir = os.path.join(data_dir, 'sessions')
        self.ensure_sessions_directory()
    
    def ensure_sessions_directory(self):
        """Ensure sessions directory exists"""
        if not os.path.exists(self.sessions_dir):
            os.makedirs(self.sessions_dir, exist_ok=True)
            logger.info(f"Created sessions directory: {self.sessions_dir}")
    
    def get_session_file_path(self, session_id: str) -> str:
        """Get session file path"""
        return os.path.join(self.sessions_dir, f"{session_id}.json")
    
    async def list_sessions(self) -> List[Dict[str, Any]]:
        """Get all sessions list with optimized batch reading"""
        sessions = []
        
        try:
            # Get all JSON files first
            session_files = []
            for filename in os.listdir(self.sessions_dir):
                if filename.endswith(".json"):
                    session_id = filename[:-5]  # Remove .json suffix
                    file_path = self.get_session_file_path(session_id)
                    session_files.append((session_id, file_path))
            
            # Batch read all session files asynchronously
            import asyncio
            
            async def read_session_file(session_id: str, file_path: str) -> Optional[Dict[str, Any]]:
                try:
                    if not os.path.exists(file_path):
                        return None

                    # Use asyncio to make file reading non-blocking
                    loop = asyncio.get_event_loop()
                    content = await loop.run_in_executor(
                        None,
                        lambda: open(file_path, 'r', encoding='utf-8').read()
                    )
                    session_data = json.loads(content)

                    # 兼容性处理：确保历史会话有mode字段
                    if session_data.get('settings') and 'mode' not in session_data['settings']:
                        session_data['settings']['mode'] = 'general'
                        # 异步保存修复后的会话数据
                        await self.save_session(session_data)
                        logger.info(f"Added mode field to session {session_id}")

                    return session_data
                except Exception as e:
                    logger.error(f"Failed to read session file {session_id}: {e}")
                    return None
            
            # Read all files concurrently with limited concurrency
            semaphore = asyncio.Semaphore(10)  # Limit concurrent file operations
            
            async def read_with_semaphore(session_id: str, file_path: str):
                async with semaphore:
                    return await read_session_file(session_id, file_path)
            
            # Execute concurrent reads
            tasks = [read_with_semaphore(session_id, file_path) for session_id, file_path in session_files]
            session_results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Filter valid sessions and handle exceptions
            for result in session_results:
                if isinstance(result, Exception):
                    logger.error(f"Session read error: {result}")
                elif result is not None:
                    sessions.append(result)
            
            # Sort by update time in descending order
            sessions.sort(key=lambda x: x.get('updatedAt', ''), reverse=True)
            
        except Exception as e:
            logger.error(f"Failed to get session list: {e}")
        
        return sessions

    async def _read_session_file_async(self, filepath: Path) -> Optional[Dict[str, Any]]:
        """异步读取单个会话文件"""
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                return json.loads(content)
        except (FileNotFoundError, json.JSONDecodeError, UnicodeDecodeError) as e:
            logger.warning(f"Failed to read session file {filepath}: {e}")
            return None

    async def list_sessions_optimized(self) -> List[Dict[str, Any]]:
        """优化版本的list_sessions，使用并发读取"""
        if not os.path.exists(self.sessions_dir):
            return []
        
        # 获取所有会话文件路径
        session_files = []
        for filename in os.listdir(self.sessions_dir):
            if filename.endswith(".json"):
                filepath = Path(self.sessions_dir) / filename
                session_files.append(filepath)
        
        if not session_files:
            return []
        
        # 并发读取所有会话文件
        tasks = [self._read_session_file_async(filepath) for filepath in session_files]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # 过滤有效的会话
        sessions = []
        for result in results:
            if isinstance(result, dict) and result is not None:
                sessions.append(result)
            elif isinstance(result, Exception):
                logger.warning(f"Exception during session read: {result}")
        
        # 按修改时间排序
        sessions.sort(key=lambda x: x.get('updated_at', ''), reverse=True)
        return sessions

    async def get_sessions_for_merge_fast(self, session_ids: List[str]) -> List[Dict[str, Any]]:
        """专门为合并操作优化的快速会话读取方法"""
        if not session_ids:
            return []
        
        # 并发读取指定的会话
        tasks = []
        for session_id in session_ids:
            filepath = Path(self.sessions_dir) / f"{session_id}.json"
            tasks.append(self._read_session_file_async(filepath))
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # 过滤有效的会话
        sessions = []
        for i, result in enumerate(results):
            if isinstance(result, dict) and result is not None:
                sessions.append(result)
            elif isinstance(result, Exception):
                logger.warning(f"Failed to read session {session_ids[i]}: {result}")
        
        return sessions

    async def batch_save_sessions(self, sessions: List[Dict[str, Any]]) -> bool:
        """批量保存会话，提升写入性能"""
        try:
            # 并发写入所有会话
            tasks = []
            for session in sessions:
                session_id = session.get('id')
                if session_id:
                    tasks.append(self._save_session_async(session_id, session))
            
            if tasks:
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                # 检查是否有失败的写入
                failed_count = 0
                for result in results:
                    if isinstance(result, Exception):
                        logger.error(f"Failed to save session: {result}")
                        failed_count += 1
                
                if failed_count > 0:
                    logger.warning(f"{failed_count} sessions failed to save")
                    return False
            
            return True
        except Exception as e:
            logger.error(f"Batch save sessions failed: {e}")
            return False

    async def _save_session_async(self, session_id: str, session_data: Dict[str, Any]) -> bool:
        """异步保存单个会话"""
        try:
            session_file = os.path.join(self.sessions_dir, f"{session_id}.json")
            with open(session_file, 'w', encoding='utf-8') as f:
                json.dump(session_data, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            logger.error(f"Failed to save session {session_id}: {e}")
            return False

    async def list_sessions_fast(self) -> List[Dict[str, Any]]:
        """Fast version of list_sessions with minimal validation for merge operations"""
        sessions = []
        
        try:
            import asyncio
            import json
            
            # Get all JSON files
            session_files = []
            for filename in os.listdir(self.sessions_dir):
                if filename.endswith(".json"):
                    file_path = os.path.join(self.sessions_dir, filename)
                    session_files.append(file_path)
            
            # Batch read all files with high concurrency for merge operations
            async def read_file_fast(file_path: str) -> Optional[Dict[str, Any]]:
                try:
                    loop = asyncio.get_event_loop()
                    content = await loop.run_in_executor(None, lambda: open(file_path, 'r', encoding='utf-8').read())
                    return json.loads(content)
                except Exception:
                    return None  # Silently skip invalid files for fast operation
            
            # Use higher concurrency for merge operations since they're typically done during startup
            tasks = [read_file_fast(file_path) for file_path in session_files]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Filter valid sessions
            for result in results:
                if isinstance(result, dict) and 'id' in result:
                    sessions.append(result)
            
            # Sort by update time in descending order
            sessions.sort(key=lambda x: x.get('updatedAt', ''), reverse=True)
            
        except Exception as e:
            logger.error(f"Failed to get session list fast: {e}")
            # Fallback to regular method
            return await self.list_sessions()
        
        return sessions

    async def _batch_save_sessions(self, sessions: List[Dict[str, Any]]) -> None:
        """Batch save multiple sessions with concurrent I/O for better performance"""
        import asyncio
        
        async def save_single_session(session_data: Dict[str, Any]) -> None:
            try:
                session_id = session_data["id"]
                file_path = self.get_session_file_path(session_id)
                
                # Ensure the session has required fields
                if "createdAt" not in session_data:
                    session_data["createdAt"] = datetime.now(timezone.utc).isoformat()
                if "updatedAt" not in session_data:
                    session_data["updatedAt"] = datetime.now(timezone.utc).isoformat()
                
                # Use asyncio to make file writing non-blocking
                loop = asyncio.get_event_loop()
                json_content = json.dumps(session_data, ensure_ascii=False, indent=2)
                
                await loop.run_in_executor(
                    None,
                    lambda: open(file_path, 'w', encoding='utf-8').write(json_content)
                )
                
            except Exception as e:
                logger.error(f"Failed to save session {session_data.get('id', 'unknown')}: {e}")
        
        # Save all sessions concurrently with limited concurrency
        if sessions:
            semaphore = asyncio.Semaphore(20)  # Higher concurrency for write operations
            
            async def save_with_semaphore(session_data: Dict[str, Any]):
                async with semaphore:
                    await save_single_session(session_data)
            
            tasks = [save_with_semaphore(session) for session in sessions]
            await asyncio.gather(*tasks, return_exceptions=True)
    
    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get specified session"""
        file_path = self.get_session_file_path(session_id)

        if not os.path.exists(file_path):
            return None

        try:
            # Use standard file reading instead of aiofiles to avoid dependency issues
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                session_data = json.loads(content)

                # 兼容性处理：确保历史会话有mode字段
                if session_data.get('settings') and 'mode' not in session_data['settings']:
                    session_data['settings']['mode'] = 'general'
                    # 保存修复后的会话数据
                    await self.save_session(session_data)
                    logger.info(f"Added mode field to session {session_id}")

                return session_data
        except Exception as e:
            logger.error(f"Failed to read session file {session_id}: {e}")
            return None
    
    async def create_session(self, name: Optional[str] = None) -> Dict[str, Any]:
        """Create new session"""
        session_id = self.generate_session_id()
        session_name = name or self.generate_default_session_name()
        
        session_data = {
            "id": session_id,
            "name": session_name,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "messages": [],
            "settings": {
                "mode": "general",  # 添加mode字段，默认为General Model
                "systemPrompt": "You are a helpful assistant",
                "maxTurns": 5,
                "allowedTools": ["WebSearch", "Read"]
            }
        }
        
        await self.save_session(session_data)
        return session_data
    
    async def update_session(
        self, 
        session_id: str,
        name: Optional[str] = None,
        messages: Optional[List[Dict[str, Any]]] = None,
        settings: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """Update session"""
        session = await self.get_session(session_id)
        if not session:
            return None
        
        # Update fields
        if name is not None:
            session["name"] = name
        if messages is not None:
            session["messages"] = messages
        if settings is not None:
            session["settings"] = {**session["settings"], **settings}
        
        session["updatedAt"] = datetime.now(timezone.utc).isoformat()
        
        await self.save_session(session)
        return session
    
    async def delete_session(self, session_id: str) -> bool:
        """Delete session"""
        file_path = self.get_session_file_path(session_id)
        
        if not os.path.exists(file_path):
            return False
        
        try:
            os.remove(file_path)
            return True
        except Exception as e:
            logger.error(f"Failed to delete session file {session_id}: {e}")
            return False
    
    async def save_session(self, session_data: Dict[str, Any]) -> bool:
        """Save session data"""
        file_path = self.get_session_file_path(session_data["id"])
        
        try:
            # Use standard file writing instead of aiofiles to avoid dependency issues
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(json.dumps(session_data, indent=2, ensure_ascii=False))
            return True
        except Exception as e:
            logger.error(f"Failed to save session file {session_data['id']}: {e}")
            return False
    
    def generate_session_id(self) -> str:
        """Generate session ID"""
        import time
        import random
        import string
        
        timestamp = int(time.time() * 1000)
        random_str = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
        return f"session_{timestamp}_{random_str}"
    
    def generate_default_session_name(self) -> str:
        """Generate default session name"""
        current_time = datetime.now()
        return f"New Chat {current_time.strftime('%m-%d %H:%M')}"
    
    def _parse_datetime_safe(self, time_str: str) -> datetime:
        """Safely parse timestamp, ensuring timezone-aware datetime object is returned"""
        try:
            # Handle various timestamp formats
            if time_str.endswith('Z'):
                # UTC format: 2023-01-01T12:00:00Z
                time_str = time_str[:-1] + '+00:00'
            elif '+' not in time_str and time_str.count(':') >= 2:
                # If no timezone info, assume UTC
                if 'T' in time_str:
                    time_str = time_str + '+00:00'
            
            # Try to parse as timezone-aware datetime
            dt = datetime.fromisoformat(time_str)
            
            # If parsed datetime is naive, treat it as UTC
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            
            return dt
        except (ValueError, AttributeError) as e:
            logger.warning(f"Failed to parse timestamp: {e}, timestamp: {time_str}, using current UTC time")
            return datetime.now(timezone.utc)
    
    async def sync_sessions(self, local_sessions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Batch synchronize session data"""
        synced_sessions = []
        
        # Get existing sessions on server side
        server_sessions = await self.list_sessions()
        server_sessions_dict = {s["id"]: s for s in server_sessions}
        
        for local_session in local_sessions:
            session_id = local_session["id"]
            
            if session_id in server_sessions_dict:
                # Session exists, compare update time to decide which version to use
                server_session = server_sessions_dict[session_id]
                
                # Safely parse timestamps
                local_time = self._parse_datetime_safe(local_session.get("updatedAt", ""))
                server_time = self._parse_datetime_safe(server_session.get("updatedAt", ""))
                
                if local_time > server_time:
                    # Local version is newer, save to server
                    await self.save_session(local_session)
                    synced_sessions.append(local_session)
                    logger.info(f"Sync local session to server: {session_id}")
                else:
                    # Server version is newer, use server version
                    synced_sessions.append(server_session)
                    logger.info(f"Use server session version: {session_id}")
            else:
                # New session, save to server
                await self.save_session(local_session)
                synced_sessions.append(local_session)
                logger.info(f"Save new session to server: {session_id}")
        
        # Add server-side unique sessions
        local_session_ids = {s["id"] for s in local_sessions}
        for server_session in server_sessions:
            if server_session["id"] not in local_session_ids:
                synced_sessions.append(server_session)
                logger.info(f"Add server unique session: {server_session['id']}")
        
        return synced_sessions
    
    async def merge_sessions(self, local_sessions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Merge local and server session data with optimized performance"""
        # Get server-side sessions using fast method for better performance
        server_sessions = await self.list_sessions_fast()
        server_sessions_dict = {s["id"]: s for s in server_sessions}
        
        merged_sessions = []
        conflicts = []
        stats = {
            "total_local": len(local_sessions),
            "total_server": len(server_sessions),
            "merged": 0,
            "conflicts": 0,
            "new_from_local": 0,
            "new_from_server": 0
        }
        
        # Batch process local sessions for better performance
        batch_save_sessions = []
        
        # Process local sessions
        for local_session in local_sessions:
            session_id = local_session["id"]
            
            if session_id in server_sessions_dict:
                server_session = server_sessions_dict[session_id]
                
                # Compare update times
                local_time = self._parse_datetime_safe(local_session.get("updatedAt", ""))
                server_time = self._parse_datetime_safe(server_session.get("updatedAt", ""))
                
                time_diff = abs((local_time - server_time).total_seconds())
                
                if time_diff < 5:  # Within 5 seconds considered same version
                    merged_sessions.append(server_session)
                    stats["merged"] += 1
                elif local_time > server_time:
                    # Local version is newer - batch save later
                    batch_save_sessions.append(local_session)
                    merged_sessions.append(local_session)
                    stats["merged"] += 1
                else:
                    # Server version is newer, but check for substantial conflicts
                    has_conflict = self._check_session_conflict(local_session, server_session)
                    if has_conflict:
                        conflicts.append({
                            "session_id": session_id,
                            "local": local_session,
                            "server": server_session,
                            "local_time": local_time.isoformat(),
                            "server_time": server_time.isoformat()
                        })
                        stats["conflicts"] += 1
                    
                    merged_sessions.append(server_session)
                    stats["merged"] += 1
            else:
                # Local unique session - batch save later
                batch_save_sessions.append(local_session)
                merged_sessions.append(local_session)
                stats["new_from_local"] += 1
        
        # Batch save all new/updated sessions
        if batch_save_sessions:
            await self._batch_save_sessions(batch_save_sessions)
        
        # Add server unique sessions
        local_session_ids = {s["id"] for s in local_sessions}
        for server_session in server_sessions:
            if server_session["id"] not in local_session_ids:
                merged_sessions.append(server_session)
                stats["new_from_server"] += 1
        
        return {
            "sessions": merged_sessions,
            "conflicts": conflicts,
            "stats": stats,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    
    def _check_session_conflict(self, local_session: Dict[str, Any], server_session: Dict[str, Any]) -> bool:
        """Check if two sessions have substantial conflicts"""
        # Check if names are different
        if local_session["name"] != server_session["name"]:
            return True
        
        # Check if message count differs significantly
        local_msg_count = len(local_session.get("messages", []))
        server_msg_count = len(server_session.get("messages", []))
        if abs(local_msg_count - server_msg_count) > 2:
            return True
        
        # Check if settings are different
        local_settings = local_session.get("settings", {})
        server_settings = server_session.get("settings", {})
        if local_settings.get("systemPrompt") != server_settings.get("systemPrompt"):
            return True
        
        return False

# Create global session manager instance
session_manager = SessionManager()