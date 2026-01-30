#!/usr/bin/env python3
"""
Script to setup environment from ~/.claudecodechat/env.conf file
This script reads configuration from ~/.claudecodechat/env.conf and generates .env file
"""
import os
import sys
from pathlib import Path
import shutil
import configparser


def find_config_file():
    """Find the configuration file in user's home directory"""
    config_dir = Path.home() / '.claudecodechat'
    config_file = config_dir / 'env.conf'

    if not config_file.exists():
        print(f"❌ Configuration file not found: {config_file}")
        print(f"\nPlease create the configuration file at: {config_file}")
        print(f"Example content:")
        print(f"""
[DEFAULT]
ANTHROPIC_CUSTOM_HEADERS=anthropic-beta: context-1m-2025-08-07
DISABLE_NON_ESSENTIAL_MODEL_CALLS=1
DISABLE_TELEMETRY=1
ANTHROPIC_BASE_URL=your_base_url_here
ANTHROPIC_AUTH_TOKEN=your_auth_token_here
ANTHROPIC_MODEL=claude-4.5-sonnet
ANTHROPIC_DEFAULT_OPUS_MODEL=claude-4.1-opus
ANTHROPIC_DEFAULT_SONNET_MODEL=claude-4.5-sonnet
ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-3.5-haiku
CLAUDE_CODE_SUBAGENT_MODEL=claude-4.5-sonnet
DISABLE_NON_ESSENTIAL_MODEL_CALLS=1
API_HOST=0.0.0.0
API_PORT=8000
API_DEBUG=True
LOG_LEVEL=INFO
LOG_DIR=~/.claudecodechat/logs
LOG_CONSOLE=true
LOG_FILE_SIZE=10485760
LOG_BACKUP_COUNT=5
RATE_LIMIT_PER_MINUTE=60
DATA_DIR=~/.claudecodechat/data
MCP_SERVERS_CONFIG_PATH=mcp_servers.json
MCP_ENABLE_AUTO_DISCOVERY=true
MCP_JIRA_SERVER_URL=https://your-company.atlassian.net
MCP_JIRA_USERNAME=your_jira_username@example.com
MCP_JIRA_API_TOKEN=your_jira_api_token_here
MCP_CONFLUENCE_SERVER_URL=https://your-company.atlassian.net/wiki
MCP_CONFLUENCE_USERNAME=your_confluence_username@example.com
MCP_CONFLUENCE_API_TOKEN=your_confluence_api_token_here
...
""")
        return None
    
    return config_file


def load_config_from_file(config_file):
    """Load configuration from the conf file"""
    config_data = {}
    
    try:
        with open(config_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Try to detect if it's INI format by looking for section headers
        if '[DEFAULT]' in content or ('[' in content and ']' in content):
            # Use ConfigParser for INI format
            config = configparser.ConfigParser()
            config.read(config_file, encoding='utf-8')
            config_data = dict(config['DEFAULT'])
            print("📋 Detected INI format configuration")
        else:
            # Parse simple key=value format
            print("📋 Detected simple key=value format configuration")
            lines = content.splitlines()
            for line_num, line in enumerate(lines, 1):
                line = line.strip()
                
                # Skip empty lines and comments
                if not line or line.startswith('#'):
                    continue
                
                # Parse key=value pairs
                if '=' in line:
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip()
                    
                    # Remove quotes if present
                    if value.startswith('"') and value.endswith('"'):
                        value = value[1:-1]
                    elif value.startswith("'") and value.endswith("'"):
                        value = value[1:-1]
                    
                    config_data[key] = value
                else:
                    print(f"⚠️ Warning: Skipping invalid line {line_num}: {line}")
        
        return config_data
        
    except Exception as e:
        print(f"❌ Error reading configuration file: {e}")
        return None


def generate_env_file(config_data):
    """Generate .env file from configuration data using .env.example as template"""
    # Try multiple locations for .env.example file
    current_dir = Path.cwd()
    script_dir = Path(__file__).parent.parent

    # Search locations for .env.example
    search_paths = [
        current_dir / '.env.example',  # Current working directory
        script_dir / '.env.example',   # Project root (development)
        script_dir / 'conf' / '.env.example',  # New location in conf directory
        Path(__file__).parent.parent.parent / '.env.example',  # Package root when installed
    ]

    env_example_path = None
    for path in search_paths:
        if path.exists():
            env_example_path = path
            break

    # Note: .env.example should be available via data-files configuration
    # when installed through uvx or pip

    if env_example_path is None:
        print(f"❌ Template file not found in any of these locations:")
        for path in search_paths:
            print(f"   - {path.absolute()}")
        print(f"   Current working directory: {current_dir.absolute()}")
        return False

    # Place .env in ~/.claudecodechat directory
    env_dir = Path.home() / '.claudecodechat'
    env_dir.mkdir(exist_ok=True)  # Ensure the directory exists
    env_path = env_dir / '.env'

    print(f"📝 Reading template from {env_example_path}")

    # Read the template file (handle both file paths and importlib.resources references)
    try:
        # Check if it's an importlib.resources reference
        if hasattr(env_example_path, 'read_text'):
            template_content = env_example_path.read_text(encoding='utf-8')
        else:
            # Regular file path
            with open(env_example_path, 'r', encoding='utf-8') as f:
                template_content = f.read()
    except Exception as e:
        print(f"❌ Error reading template file: {e}")
        return False
    
    # Generate new content by replacing values
    new_content = []
    
    for line in template_content.split('\n'):
        line = line.strip()
        
        # Skip empty lines and comments, but preserve them
        if not line or line.startswith('#'):
            new_content.append(line)
            continue
        
        # Parse key=value pairs
        if '=' in line:
            key = line.split('=')[0].strip()
            
            # If we have a value for this key in config, use it
            if key in config_data:
                new_value = config_data[key]

                # Expand ~ to user home directory for path-related variables
                if key in ['LOG_DIR', 'DATA_DIR'] and new_value.startswith('~'):
                    expanded_value = os.path.expanduser(new_value)
                    new_content.append(f"{key}={expanded_value}")
                    print(f"  ✓ {key}: {new_value} → {expanded_value}")
                else:
                    new_content.append(f"{key}={new_value}")
                    print(f"  ✓ {key}: {'***' if 'TOKEN' in key or 'KEY' in key else new_value}")
            else:
                # Keep the original line from template
                new_content.append(line)
        else:
            new_content.append(line)
    
    # Write the .env file
    try:
        with open(env_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(new_content))
        
        print(f"✅ Successfully generated {env_path}")
        return True
        
    except Exception as e:
        print(f"❌ Error writing .env file: {e}")
        return False


def main():
    """Main function"""
    print("🚀 Setting up environment configuration...")
    
    # Find configuration file
    config_file = find_config_file()
    if not config_file:
        return False
    
    print(f"📖 Loading configuration from {config_file}")
    
    # Load configuration
    config_data = load_config_from_file(config_file)
    if not config_data:
        return False
    
    print(f"✅ Configuration loaded successfully ({len(config_data)} variables)")
    
    # Generate .env file
    if not generate_env_file(config_data):
        return False

    # Create necessary directories
    create_user_directories(config_data)

    print("🎉 Environment setup completed successfully!")
    return True


def create_user_directories(config_data):
    """Create necessary user directories"""
    print("📁 Creating user directories...")

    # Create ~/.claudecodechat directory
    base_dir = Path.home() / '.claudecodechat'
    base_dir.mkdir(exist_ok=True)
    print(f"  ✓ Base directory: {base_dir}")

    # Create logs directory
    log_dir = config_data.get('LOG_DIR', '~/.claudecodechat/logs')
    if log_dir.startswith('~'):
        log_dir = os.path.expanduser(log_dir)
    Path(log_dir).mkdir(parents=True, exist_ok=True)
    print(f"  ✓ Logs directory: {log_dir}")

    # Create data directory
    data_dir = config_data.get('DATA_DIR', '~/.claudecodechat/data')
    if data_dir.startswith('~'):
        data_dir = os.path.expanduser(data_dir)
    Path(data_dir).mkdir(parents=True, exist_ok=True)
    print(f"  ✓ Data directory: {data_dir}")

    # Create sessions subdirectory in data
    sessions_dir = Path(data_dir) / 'sessions'
    sessions_dir.mkdir(exist_ok=True)
    print(f"  ✓ Sessions directory: {sessions_dir}")


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)