"""
Configuration management for the Claude Code Web Chat.
This module ensures that only local configuration files are used.
"""
import os
import json
from typing import Dict, Any, Optional
from dotenv import load_dotenv


class LocalConfigManager:
    """Manages local configuration files, ignoring global Claude Code settings."""
    
    def __init__(self, project_root: Optional[str] = None):
        self.project_root = project_root or os.getcwd()
        self._load_local_env()
        
    def _load_local_env(self):
        """Load environment variables from .env file in ~/.claudecodechat or project root."""
        # First try ~/.claudecodechat/.env (preferred location)
        user_env_path = os.path.expanduser("~/.claudecodechat/.env")
        # Fallback to project root .env
        project_env_path = os.path.join(self.project_root, '.env')

        if os.path.exists(user_env_path):
            load_dotenv(user_env_path, override=True)
        elif os.path.exists(project_env_path):
            load_dotenv(project_env_path, override=True)
            
    def get_mcp_config_path(self) -> str:
        """Get the path to local MCP configuration file."""
        return os.path.join(self.project_root, self.get_env_var('MCP_SERVERS_CONFIG_PATH' ,'.mcp.json'))
        
    def load_mcp_config(self) -> Dict[str, Any]:
        """Load MCP configuration from local file only."""
        config_path = self.get_mcp_config_path()
        
        if not os.path.exists(config_path):
            return {"mcpServers": {}, "settings": {}}
            
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            print(f"Warning: Could not load MCP config from {config_path}: {e}")
            return {"mcpServers": {}, "settings": {}}
            
    def get_env_var(self, key: str, default: Any = None) -> Any:
        """Get environment variable, preferring current environment over .env file."""
        # Prefer current environment variables, then values from .env file
        return os.getenv(key, default)
        
    def get_api_config(self) -> Dict[str, Any]:
        """Get API configuration from local environment."""
        return {
            "host": self.get_env_var("API_HOST", "0.0.0.0"),
            "port": int(self.get_env_var("API_PORT", "8000")),
            "debug": self.get_env_var("API_DEBUG", "True").lower() == "true"
        }

        
    def get_logging_config(self) -> Dict[str, Any]:
        """Get logging configuration from local environment."""
        log_dir = self.get_env_var("LOG_DIR", "~/.claudecodechat/logs")
        # Expand ~ to user home directory if present
        if log_dir.startswith("~"):
            log_dir = os.path.expanduser(log_dir)

        return {
            "log_level": self.get_env_var("LOG_LEVEL", "INFO"),
            "log_dir": log_dir,
            "log_console": self.get_env_var("LOG_CONSOLE", "true").lower() == "true",
            "log_file_size": int(self.get_env_var("LOG_FILE_SIZE", str(10 * 1024 * 1024))),
            "log_backup_count": int(self.get_env_var("LOG_BACKUP_COUNT", "5")),
        }

    def get_data_config(self) -> Dict[str, Any]:
        """Get data storage configuration from local environment."""
        data_dir = self.get_env_var("DATA_DIR", "~/.claudecodechat/data")
        # Expand ~ to user home directory if present
        if data_dir.startswith("~"):
            data_dir = os.path.expanduser(data_dir)

        return {
            "data_dir": data_dir,
        }
        
    def get_mcp_config(self) -> Dict[str, Any]:
        """Get MCP configuration with environment variable substitution."""
        config = self.load_mcp_config()
        
        # Substitute environment variables in MCP config
        def substitute_env_vars(obj):
            if isinstance(obj, dict):
                return {k: substitute_env_vars(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [substitute_env_vars(item) for item in obj]
            elif isinstance(obj, str) and obj.startswith("${") and obj.endswith("}"):
                env_var = obj[2:-1]
                return self.get_env_var(env_var, obj)
            else:
                return obj
                
        return substitute_env_vars(config)


# Global instance for the application
local_config = LocalConfigManager()