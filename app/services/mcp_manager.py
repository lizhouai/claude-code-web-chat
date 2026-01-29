import asyncio
import json
import logging
import os
import subprocess
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from app.utils.config import local_config

logger = logging.getLogger(__name__)

class MCPServerInfo:
    def __init__(self, name: str, config: Dict[str, Any]):
        self.name = name
        self.command = config.get('command')
        self.args = config.get('args', [])
        self.env = config.get('env', {})
        self.description = config.get('description', '')
        self.enabled = config.get('enabled', True)
        self.tools = config.get('tools', [])
        self.process: Optional[subprocess.Popen] = None
        self.last_health_check = None
        self.health_status = 'unknown'
        self.error_count = 0

class MCPManager:
    """MCP Server Manager"""
    
    def __init__(self):
        self.servers: Dict[str, MCPServerInfo] = {}
        self.config_path = local_config.get_mcp_config_path()
        self.auto_discovery = local_config.get_env_var('MCP_ENABLE_AUTO_DISCOVERY', 'true').lower() == 'true'
        self.settings = {
            'timeout': 30000,
            'maxRetries': 3,
            'healthCheckInterval': 60000,
            'autoRestart': True,
            'logLevel': 'INFO'
        }
        self._health_check_task = None
        
    async def initialize(self):
        """Initialize MCP Manager"""
        try:
            await self.load_config()
            await self.start_enabled_servers()
            if self.auto_discovery:
                await self.discover_servers()
            await self.start_health_monitor()
            logger.info("MCP Manager initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize MCP Manager: {e}")
            raise

    async def load_config(self):
        """加载MCP服务器配置"""
        try:
            if not os.path.exists(self.config_path):
                logger.warning(f"MCP config file not found: {self.config_path}")
                return
                
            # 使用本地配置管理器加载配置
            config = local_config.get_mcp_config()
                
            # 加载服务器配置
            mcp_servers = config.get('mcpServers', {})
            for name, server_config in mcp_servers.items():
                self.servers[name] = MCPServerInfo(name, server_config)
                
            # 加载设置
            if 'settings' in config:
                self.settings.update(config['settings'])
                
            logger.info(f"Loaded {len(self.servers)} MCP servers from config")
            
        except Exception as e:
            logger.error(f"Failed to load MCP config: {e}")
            raise

    def _process_env_vars(self, config: Dict) -> Dict:
        """处理配置中的环境变量"""
        processed = {}
        for key, value in config.items():
            if isinstance(value, str) and value.startswith('${') and value.endswith('}'):
                env_var = value[2:-1]
                processed[key] = os.getenv(env_var, '')
            elif isinstance(value, dict):
                processed[key] = self._process_env_vars(value)
            else:
                processed[key] = value
        return processed

    async def start_server(self, name: str) -> bool:
        """启动MCP服务器"""
        if name not in self.servers:
            logger.error(f"MCP server '{name}' not found in config")
            return False
            
        server = self.servers[name]
        if not server.enabled:
            logger.info(f"MCP server '{name}' is disabled")
            return False
            
        try:
            # 检查是否已经运行
            if server.process and server.process.returncode is None:
                logger.info(f"MCP server '{name}' is already running")
                return True
                
            # 准备环境变量
            env = os.environ.copy()
            env.update(server.env)
            
            # 启动进程
            cmd = [server.command] + server.args
            logger.info(f"Starting MCP server '{name}': {' '.join(cmd)}")
            
            server.process = await asyncio.create_subprocess_exec(
                *cmd,
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            # 等待启动
            await asyncio.sleep(2)
            
            # 检查进程状态
            if server.process.returncode is None:
                server.health_status = 'running'
                server.error_count = 0
                logger.info(f"MCP server '{name}' started successfully")
                return True
            else:
                stderr = await server.process.stderr.read()
                logger.error(f"MCP server '{name}' failed to start: {stderr.decode()}")
                server.health_status = 'failed'
                return False
                
        except Exception as e:
            logger.error(f"Failed to start MCP server '{name}': {e}")
            server.health_status = 'error'
            server.error_count += 1
            return False

    async def stop_server(self, name: str) -> bool:
        """停止MCP服务器"""
        if name not in self.servers:
            return False
            
        server = self.servers[name]
        if not server.process:
            return True
            
        try:
            server.process.terminate()
            try:
                await asyncio.wait_for(server.process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                server.process.kill()
                await server.process.wait()
                
            server.process = None
            server.health_status = 'stopped'
            logger.info(f"MCP server '{name}' stopped")
            return True
            
        except Exception as e:
            logger.error(f"Failed to stop MCP server '{name}': {e}")
            return False

    async def restart_server(self, name: str) -> bool:
        """重启MCP服务器"""
        await self.stop_server(name)
        await asyncio.sleep(1)
        return await self.start_server(name)

    async def start_enabled_servers(self):
        """启动所有启用的服务器"""
        tasks = []
        for name, server in self.servers.items():
            if server.enabled:
                tasks.append(self.start_server(name))
                
        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            success_count = sum(1 for r in results if r is True)
            logger.info(f"Started {success_count}/{len(tasks)} MCP servers")

    async def discover_servers(self):
        """自动发现可用的MCP服务器"""
        # 这里可以实现自动发现逻辑
        # 例如扫描常见的MCP服务器端口或注册表
        logger.info("MCP server auto-discovery completed")

    async def health_check(self, name: str) -> Dict[str, Any]:
        """检查MCP服务器健康状态"""
        if name not in self.servers:
            return {'status': 'not_found', 'message': 'Server not configured'}
            
        server = self.servers[name]
        
        # 检查进程状态
        if not server.process:
            status = 'stopped'
        elif server.process.returncode is None:
            status = 'running'
        else:
            status = 'failed'
            
        server.health_status = status
        server.last_health_check = datetime.now()
        
        return {
            'status': status,
            'name': name,
            'description': server.description,
            'tools': server.tools,
            'error_count': server.error_count,
            'last_check': server.last_health_check.isoformat(),
            'enabled': server.enabled
        }

    async def start_health_monitor(self):
        """启动健康检查监控"""
        if self._health_check_task:
            return
            
        async def monitor():
            while True:
                try:
                    for name, server in self.servers.items():
                        if server.enabled:
                            health = await self.health_check(name)
                            
                            # 自动重启失败的服务器
                            if (self.settings.get('autoRestart', True) and 
                                health['status'] == 'failed' and 
                                server.error_count < self.settings.get('maxRetries', 3)):
                                
                                logger.warning(f"Auto-restarting failed MCP server '{name}'")
                                await self.restart_server(name)
                                
                    await asyncio.sleep(self.settings.get('healthCheckInterval', 60000) / 1000)
                    
                except Exception as e:
                    logger.error(f"Health monitor error: {e}")
                    await asyncio.sleep(60)
                    
        self._health_check_task = asyncio.create_task(monitor())

    async def get_available_tools(self) -> Dict[str, List[str]]:
        """获取所有可用的MCP工具"""
        tools = {}
        for name, server in self.servers.items():
            if server.enabled and server.health_status == 'running':
                tools[name] = server.tools
        return tools

    async def get_server_status(self) -> Dict[str, Dict]:
        """获取所有服务器状态"""
        status = {}
        for name in self.servers.keys():
            status[name] = await self.health_check(name)
        return status

    async def reload_config(self):
        """重新加载配置"""
        try:
            # 停止所有服务器
            for name in list(self.servers.keys()):
                await self.stop_server(name)
                
            # 清空配置
            self.servers.clear()
            
            # 重新加载
            await self.load_config()
            await self.start_enabled_servers()
            
            logger.info("MCP configuration reloaded successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to reload MCP config: {e}")
            return False

    async def shutdown(self):
        """关闭MCP管理器"""
        # 停止健康检查任务
        if self._health_check_task:
            self._health_check_task.cancel()
            try:
                await self._health_check_task
            except asyncio.CancelledError:
                pass
                
        # 停止所有服务器
        for name in list(self.servers.keys()):
            await self.stop_server(name)
            
        logger.info("MCP Manager shutdown completed")

# 全局MCP管理器实例
mcp_manager = MCPManager()