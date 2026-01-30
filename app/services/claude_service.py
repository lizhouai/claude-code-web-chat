import asyncio
import json
import os
import logging
import aiohttp
import re
from typing import AsyncGenerator, Dict, Any, List
from claude_code_sdk import ClaudeSDKClient, ClaudeCodeOptions
from app.models import QueryRequest, QueryResponse
from app.services.mcp_manager import mcp_manager
from app.utils.config import local_config
logger = logging.getLogger(__name__)


class ClaudeService:
    def __init__(self):
        self.client = None
        self.mcp_tools = []
        self.mcp_tools_cache_valid = False
        self.active_sessions = {}  # Store active sessions for interruption
        # Setup environment on initialization
        
    
    def build_conversation_prompt(self, request: QueryRequest) -> str:
        """Build complete prompt including conversation history"""
        if not request.conversation_history or len(request.conversation_history) == 0:
            return request.prompt
        
        # Build conversation history
        conversation_parts = []
        for msg in request.conversation_history:
            role = msg.get('role', 'user')
            content = msg.get('content', '')
            if role == 'user':
                conversation_parts.append(f"Human: {content}")
            elif role == 'assistant':
                conversation_parts.append(f"Assistant: {content}")
        
        # Add current user message
        conversation_parts.append(f"Human: {request.prompt}")
        
        # Combine complete conversation
        full_conversation = "\n\n".join(conversation_parts)
        
        # Add context explanation
        context_prompt = """Please continue this conversation while maintaining context and memory of our previous exchanges. Here is our conversation history:

""" + full_conversation + """

Please respond as the Assistant, maintaining awareness of all previous context in this conversation."""
        
        return context_prompt
            
    async def query(self, request: QueryRequest) -> QueryResponse:
        """Basic query service"""
        # Get MCP configuration file path
        mcp_config_file = local_config.get_env_var('MCP_SERVERS_CONFIG_PATH')
        mcp_config_path = mcp_config_file or local_config.get_mcp_config_path()
        
        # Get enhanced tools list
        enhanced_tools = await self.get_enhanced_tools(request.allowed_tools)
        logger.info(f"Using tools: {enhanced_tools}")
        
        # Build prompt including conversation history
        full_prompt = self.build_conversation_prompt(request)
        
        async with ClaudeSDKClient(
            options=ClaudeCodeOptions(
                system_prompt=request.system_prompt,
                max_turns=request.max_turns,
                allowed_tools=enhanced_tools,
                mcp_servers=mcp_config_path,
                cwd=local_config.project_root
            )
        ) as client:
            await client.query(full_prompt)
            
            full_response = []
            async for message in client.receive_response():
                if hasattr(message, 'content'):
                    for block in message.content:
                        if hasattr(block, 'text'):
                            full_response.append(block.text)
                
                if type(message).__name__ == "ResultMessage":
                    return QueryResponse(
                        result=''.join(full_response),
                        cost=message.total_cost_usd,
                        duration_ms=message.duration_ms,
                        session_id=getattr(message, 'session_id', None),
                        num_turns=getattr(message, 'num_turns', None)
                    )
    
    async def interrupt_session(self, session_id: str):
        """Interrupt an active session"""
        logger.info(f"Processing interrupt request for session: {session_id}")
        
        if session_id not in self.active_sessions:
            logger.info(f"Session {session_id} not found in active sessions")
            return False
        
        session_info = self.active_sessions[session_id]
        if 'client' not in session_info:
            logger.warning(f"Session {session_id} has no client, removing from active sessions")
            del self.active_sessions[session_id]
            return False
        
        # 尝试优雅地中断客户端
        client_interrupt_success = False
        try:
            logger.info(f"Attempting to interrupt client for session {session_id}")
            await session_info['client'].interrupt()
            client_interrupt_success = True
            logger.info(f"Successfully interrupted client for session {session_id}")
        except Exception as e:
            logger.warning(f"Client interrupt failed for session {session_id}: {e}")
        
        # 无论客户端中断是否成功，都要清理会话状态
        # 这确保了用户界面的一致性和避免僵尸会话
        try:
            del self.active_sessions[session_id]
            logger.info(f"Session {session_id} removed from active sessions. Remaining active sessions: {len(self.active_sessions)}")
        except KeyError:
            logger.warning(f"Session {session_id} was already removed from active sessions")
        
        # 返回 True 表示会话已被有效停止（无论客户端中断是否成功）
        # 从用户体验的角度，会话清理比客户端中断更重要
        return True
    
    async def stream_query(self, request: QueryRequest) -> AsyncGenerator[Dict[str, Any], None]:
        """Streaming query service"""
        try:
            # Get MCP configuration file path
            mcp_config_file = local_config.get_env_var('MCP_SERVERS_CONFIG_PATH')
            if mcp_config_file and not os.path.isabs(mcp_config_file):
                mcp_config_file = os.path.join(local_config.project_root, mcp_config_file)
            mcp_config_path = mcp_config_file or local_config.get_mcp_config_path()
            
            # Get enhanced tools list
            enhanced_tools = await self.get_enhanced_tools(request.allowed_tools)

            
            # Build prompt including conversation history
            full_prompt = self.build_conversation_prompt(request)
            
            async with ClaudeSDKClient(
                options=ClaudeCodeOptions(
                system_prompt=request.system_prompt,
                max_turns=request.max_turns,
                allowed_tools=enhanced_tools,
                mcp_servers=mcp_config_path,
                cwd=local_config.project_root
            )
            ) as client:
                # Generate session ID and store client for potential interruption
                import uuid
                session_id = str(uuid.uuid4())
                self.active_sessions[session_id] = {'client': client}
                
                # Send session ID to frontend immediately
                yield {"session_id": session_id, "type": "session_start"}
                
                await client.query(full_prompt)
                
                try:
                    async for message in client.receive_response():
                        if hasattr(message, 'content'):
                            for block in message.content:
                                if hasattr(block, 'text'):
                                    yield {"text": block.text, "type": "text_chunk"}
                                elif hasattr(block, 'type') and block.type == 'tool_use':
                                    yield {
                                        "type": "tool_use", 
                                        "tool_name": block.name,
                                        "tool_id": getattr(block, 'id', None)
                                    }
                        
                        if type(message).__name__ == "ResultMessage":
                            # Clean up session from active sessions
                            if session_id in self.active_sessions:
                                del self.active_sessions[session_id]
                            yield {
                                "done": True, 
                                "cost": message.total_cost_usd,
                                "duration_ms": message.duration_ms,
                                "session_id": session_id
                            }
                except GeneratorExit:
                    # Clean up session when generator exits
                    if session_id in self.active_sessions:
                        del self.active_sessions[session_id]
                    return
                        
        except GeneratorExit:
            # Handle generator exit properly
            return
        except Exception as e:
            yield {"error": str(e), "type": "error"}
        finally:
            # Ensure session cleanup
            if 'session_id' in locals() and session_id in self.active_sessions:
                del self.active_sessions[session_id]
    
    async def get_session_info(self, session_id: str) -> Dict[str, Any]:
        """Get session information"""
        # Session information query logic can be implemented here
        return {
            "session_id": session_id,
            "status": "active",
            "created_at": "2025-01-01T00:00:00Z"
        }
    
    async def initialize_mcp_tools(self):
        """Initialize MCP tools"""
        try:
            # Get all available MCP tools
            mcp_tools = await mcp_manager.get_available_tools()
            
            # Build tools list
            self.mcp_tools = []
            for server_name, tools in mcp_tools.items():
                for tool in tools:
                    self.mcp_tools.append(f"mcp__{server_name}__{tool}")
            
            # Mark cache as valid
            self.mcp_tools_cache_valid = True
            return self.mcp_tools
            
        except Exception as e:
            print(f"Failed to initialize MCP tools: {e}")
            self.mcp_tools_cache_valid = False
            return []
    
    def invalidate_mcp_cache(self):
        """Invalidate MCP tools cache, force refresh on next access"""
        self.mcp_tools_cache_valid = False
    
    async def get_enhanced_tools(self, base_tools: List[str]) -> List[str]:
        """Get enhanced tools list (including MCP tools)"""
        # If cache is invalid or empty, refresh MCP tools
        if not self.mcp_tools_cache_valid or not self.mcp_tools:
            await self.initialize_mcp_tools()
        
        # Merge base tools and MCP tools
        enhanced_tools = list(base_tools)
        enhanced_tools.extend(self.mcp_tools)
        
        return enhanced_tools
    
    async def get_available_mcp_servers(self) -> Dict[str, Dict]:
        """Get available MCP server status"""
        return await mcp_manager.get_server_status()

    async def get_web_preview(self, url: str) -> Dict[str, Any]:
        """Get web page preview with title, description and optional thumbnail"""
        try:
            # Validate URL
            if not url.startswith(('http://', 'https://')):
                url = 'https://' + url

            async with aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=10),
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
            ) as session:
                async with session.get(url) as response:
                    if response.status != 200:
                        raise ValueError(f"HTTP {response.status}: Failed to fetch page")

                    content_type = response.headers.get('content-type', '').lower()
                    if 'text/html' not in content_type:
                        raise ValueError("URL does not point to an HTML page")

                    html_content = await response.text()

            # Parse meta information
            preview_data = {
                'url': url,
                'title': self._extract_title(html_content),
                'description': self._extract_description(html_content),
                'thumbnail': self._extract_thumbnail(html_content, url),
                'domain': self._extract_domain(url),
                'status': 'success'
            }

            return preview_data

        except aiohttp.ClientError as e:
            logger.error(f"Network error fetching {url}: {e}")
            raise ValueError(f"Failed to fetch page: Network error")
        except Exception as e:
            logger.error(f"Error getting web preview for {url}: {e}")
            raise ValueError(f"Failed to get web preview: {str(e)}")

    def _extract_title(self, html: str) -> str:
        """Extract page title from HTML"""
        # Try Open Graph title first
        og_title_match = re.search(r'<meta[^>]*property=["\']og:title["\'][^>]*content=["\']([^"\']*)["\']', html, re.IGNORECASE)
        if og_title_match:
            return og_title_match.group(1).strip()

        # Try Twitter card title
        twitter_title_match = re.search(r'<meta[^>]*name=["\']twitter:title["\'][^>]*content=["\']([^"\']*)["\']', html, re.IGNORECASE)
        if twitter_title_match:
            return twitter_title_match.group(1).strip()

        # Try regular title tag
        title_match = re.search(r'<title[^>]*>([^<]*)</title>', html, re.IGNORECASE)
        if title_match:
            return title_match.group(1).strip()

        return "无标题"

    def _extract_description(self, html: str) -> str:
        """Extract page description from HTML"""
        # Try Open Graph description
        og_desc_match = re.search(r'<meta[^>]*property=["\']og:description["\'][^>]*content=["\']([^"\']*)["\']', html, re.IGNORECASE)
        if og_desc_match:
            return og_desc_match.group(1).strip()

        # Try Twitter card description
        twitter_desc_match = re.search(r'<meta[^>]*name=["\']twitter:description["\'][^>]*content=["\']([^"\']*)["\']', html, re.IGNORECASE)
        if twitter_desc_match:
            return twitter_desc_match.group(1).strip()

        # Try meta description
        meta_desc_match = re.search(r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']*)["\']', html, re.IGNORECASE)
        if meta_desc_match:
            return meta_desc_match.group(1).strip()

        return "无描述"

    def _extract_thumbnail(self, html: str, base_url: str) -> str:
        """Extract thumbnail image from HTML"""
        # Try Open Graph image
        og_image_match = re.search(r'<meta[^>]*property=["\']og:image["\'][^>]*content=["\']([^"\']*)["\']', html, re.IGNORECASE)
        if og_image_match:
            return self._resolve_url(og_image_match.group(1), base_url)

        # Try Twitter card image
        twitter_image_match = re.search(r'<meta[^>]*name=["\']twitter:image["\'][^>]*content=["\']([^"\']*)["\']', html, re.IGNORECASE)
        if twitter_image_match:
            return self._resolve_url(twitter_image_match.group(1), base_url)

        # Try to find first reasonable image in content
        img_match = re.search(r'<img[^>]*src=["\']([^"\']*)["\']', html, re.IGNORECASE)
        if img_match:
            return self._resolve_url(img_match.group(1), base_url)

        return ""

    def _extract_domain(self, url: str) -> str:
        """Extract domain from URL"""
        match = re.search(r'https?://([^/]+)', url)
        return match.group(1) if match else ""

    def _resolve_url(self, url: str, base_url: str) -> str:
        """Resolve relative URL to absolute URL"""
        if url.startswith(('http://', 'https://')):
            return url
        elif url.startswith('//'):
            return 'https:' + url
        elif url.startswith('/'):
            base_match = re.search(r'(https?://[^/]+)', base_url)
            if base_match:
                return base_match.group(1) + url
        else:
            # Relative URL
            base_match = re.search(r'(https?://[^/]+/.*/)([^/]*)$', base_url)
            if base_match:
                return base_match.group(1) + url

        return url