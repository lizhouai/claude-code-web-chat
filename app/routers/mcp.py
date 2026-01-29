from fastapi import APIRouter, HTTPException, Query
from starlette.requests import Request
from typing import Dict, List, Optional
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.services.mcp_manager import mcp_manager
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

# 创建限制器实例（MCP管理接口使用更宽松的限制）
limiter = Limiter(key_func=get_remote_address)

# 延迟导入Claude服务避免循环导入
def get_claude_service():
    from app.routers.query import claude_service
    return claude_service

@router.get("/health")
async def get_mcp_health():
    """获取所有MCP服务器健康状态"""
    try:
        status = await mcp_manager.get_server_status()
        
        # 计算总体健康状态
        total_servers = len(status)
        healthy_servers = sum(1 for s in status.values() if s['status'] == 'running')
        
        overall_status = "healthy" if healthy_servers == total_servers else "degraded"
        if healthy_servers == 0:
            overall_status = "unhealthy"
            
        return {
            "overall_status": overall_status,
            "healthy_servers": healthy_servers,
            "total_servers": total_servers,
            "servers": status
        }
        
    except Exception as e:
        logger.error(f"Failed to get MCP health status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/servers")
async def list_mcp_servers():
    """列出所有配置的MCP服务器"""
    try:
        status = await mcp_manager.get_server_status()
        return {"servers": status}
        
    except Exception as e:
        logger.error(f"Failed to list MCP servers: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/servers/{server_name}/health")
async def get_server_health(server_name: str):
    """获取特定MCP服务器的健康状态"""
    try:
        health = await mcp_manager.health_check(server_name)
        
        if health['status'] == 'not_found':
            raise HTTPException(status_code=404, detail=f"Server '{server_name}' not found")
            
        return health
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to check server health: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/servers/{server_name}/start")
@limiter.limit("10/minute")  # 限制服务器操作频率
async def start_mcp_server(server_name: str, request: Request):
    """启动MCP服务器"""
    try:
        success = await mcp_manager.start_server(server_name)
        
        if not success:
            raise HTTPException(status_code=400, detail=f"Failed to start server '{server_name}'")
        
        # 使Claude服务的MCP工具缓存失效
        try:
            claude_service = get_claude_service()
            claude_service.invalidate_mcp_cache()
        except Exception as e:
            logger.warning(f"Failed to invalidate Claude service cache: {e}")
            
        return {"message": f"Server '{server_name}' started successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to start server: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/servers/{server_name}/stop")
async def stop_mcp_server(server_name: str):
    """停止MCP服务器"""
    try:
        success = await mcp_manager.stop_server(server_name)
        
        if not success:
            raise HTTPException(status_code=400, detail=f"Failed to stop server '{server_name}'")
        
        # 使Claude服务的MCP工具缓存失效
        try:
            claude_service = get_claude_service()
            claude_service.invalidate_mcp_cache()
        except Exception as e:
            logger.warning(f"Failed to invalidate Claude service cache: {e}")
            
        return {"message": f"Server '{server_name}' stopped successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to stop server: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/servers/{server_name}/restart")
async def restart_mcp_server(server_name: str):
    """重启MCP服务器"""
    try:
        success = await mcp_manager.restart_server(server_name)
        
        if not success:
            raise HTTPException(status_code=400, detail=f"Failed to restart server '{server_name}'")
        
        # 使Claude服务的MCP工具缓存失效
        try:
            claude_service = get_claude_service()
            claude_service.invalidate_mcp_cache()
        except Exception as e:
            logger.warning(f"Failed to invalidate Claude service cache: {e}")
            
        return {"message": f"Server '{server_name}' restarted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to restart server: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tools")
async def get_available_tools():
    """获取所有可用的MCP工具"""
    try:
        tools = await mcp_manager.get_available_tools()
        
        # 格式化工具信息
        formatted_tools = {}
        for server_name, server_tools in tools.items():
            formatted_tools[server_name] = {
                "tools": server_tools,
                "count": len(server_tools),
                "namespace": f"mcp__{server_name}__"
            }
            
        total_tools = sum(len(tools) for tools in tools.values())
        
        return {
            "total_tools": total_tools,
            "servers": formatted_tools
        }
        
    except Exception as e:
        logger.error(f"Failed to get available tools: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reload")
async def reload_mcp_config():
    """重新加载MCP配置"""
    try:
        success = await mcp_manager.reload_config()
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to reload MCP configuration")
            
        return {"message": "MCP configuration reloaded successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to reload config: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/metrics")
async def get_mcp_metrics():
    """获取MCP服务器指标"""
    try:
        status = await mcp_manager.get_server_status()
        
        # 计算指标
        total_servers = len(status)
        running_servers = sum(1 for s in status.values() if s['status'] == 'running')
        failed_servers = sum(1 for s in status.values() if s['status'] == 'failed')
        stopped_servers = sum(1 for s in status.values() if s['status'] == 'stopped')
        
        # 错误统计
        total_errors = sum(s.get('error_count', 0) for s in status.values())
        
        # 工具统计
        tools = await mcp_manager.get_available_tools()
        total_tools = sum(len(server_tools) for server_tools in tools.values())
        
        return {
            "servers": {
                "total": total_servers,
                "running": running_servers,
                "failed": failed_servers,
                "stopped": stopped_servers
            },
            "tools": {
                "total": total_tools,
                "by_server": {name: len(tools) for name, tools in tools.items()}
            },
            "errors": {
                "total": total_errors,
                "by_server": {name: s.get('error_count', 0) for name, s in status.items()}
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to get MCP metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))