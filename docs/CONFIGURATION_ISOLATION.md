# Configuration Isolation Documentation

*Updated for Claude Code Web Chat v1.1.0*

## Overview

To ensure that the Claude Code Web Chat project uses only local configuration files without being affected by global Claude Code configurations, we have implemented a configuration isolation mechanism. This feature is part of the v1.1.0 release improvements.

## Configuration Isolation Implementation

### 1. Local Configuration Manager

Created the `app/utils/config.py` file implementing the `LocalConfigManager` class:

- Only loads `.env` files from the project directory
- Only reads `mcp_servers.json` files from the project directory
- Provides environment variable substitution functionality
- Not affected by global Claude Code configurations

### 2. Claude SDK Configuration

Modified `app/services/claude_service.py` when initializing `ClaudeCodeOptions`:

```python
ClaudeCodeOptions(
    system_prompt=request.system_prompt,
    max_turns=request.max_turns,
    allowed_tools=enhanced_tools,
    mcp_config_files=[local_config.get_mcp_config_path()],
    disable_global_mcp_config=True,
    project_root=local_config.project_root
)
```

### 3. MCP Manager Updates

Updated `app/services/mcp_manager.py` to use the local configuration manager:

- Use `local_config.get_mcp_config_path()` to get configuration file path
- Use `local_config.get_mcp_config()` to load configuration (including environment variable substitution)
- Use `local_config.get_env_var()` to get environment variables

## Configuration File Priority

The current configuration reading order is:

1. **Local `.env` file** - Environment variables from the project root directory
2. **Local `mcp_servers.json` file** - Project's MCP server configuration
3. **Global Claude Code configuration is no longer read**

## Validating Configuration Isolation

Run the test script to validate configuration isolation:

```bash
python test_config_isolation.py
```

This script validates:
- Project root directory is correct
- Local configuration files exist
- Only local MCP server configurations are loaded
- Environment variables are correctly substituted
- Global configuration servers (such as serena) are not included

## Environment Variable Configuration

Refer to the `.env.local.example` file to configure your local environment variables:

```bash
# Copy the example file
cp .env.local.example .env

# Edit configuration
vim .env
```

## Benefits

1. **Configuration Isolation**: Project configuration is independent and not affected by global Claude Code settings
2. **Portability**: Project can run independently in different environments
3. **Security**: Avoids accidental use of sensitive information from global configurations
4. **Maintainability**: All configurations are within the project, facilitating version control and team collaboration

## Important Notes

- Ensure the `.env` file contains all necessary environment variables
- Do not commit `.env` files containing sensitive information to version control
- Use `.env.local.example` as a configuration template
- Regularly run `test_config_isolation.py` to verify configuration isolation

---

*This documentation is part of Claude Code Web Chat v1.1.0 release documentation.*