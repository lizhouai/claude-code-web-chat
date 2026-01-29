#!/usr/bin/env python3
"""
Test script to validate the uvx setup process
This script creates a test configuration and verifies the setup works
"""
import os
import tempfile
import shutil
from pathlib import Path


def create_test_config():
    """Create a test configuration file"""
    config_dir = Path.home() / '.trendaiagent'
    config_file = config_dir / 'env.conf'
    
    # Create backup if exists
    backup_file = None
    if config_file.exists():
        backup_file = config_file.with_suffix('.conf.backup')
        shutil.copy2(config_file, backup_file)
        print(f"📦 Backed up existing config to {backup_file}")
    
    # Create directory if not exists
    config_dir.mkdir(exist_ok=True)
    
    # Create test configuration
    test_config = """[DEFAULT]
ANTHROPIC_BASE_URL=https://api.rdsec.trendmicro.com/prod/aiendpoint/
ANTHROPIC_AUTH_TOKEN=test_token_here
ANTHROPIC_MODEL=claude-4.5-sonnet
ANTHROPIC_DEFAULT_OPUS_MODEL=claude-4.1-opus
ANTHROPIC_DEFAULT_SONNET_MODEL=claude-4.5-sonnet
ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-3.5-haiku
CLAUDE_CODE_SUBAGENT_MODEL=claude-4.5-sonnet
DISABLE_NON_ESSENTIAL_MODEL_CALLS=1
API_HOST=127.0.0.1
API_PORT=8000
API_DEBUG=True
LOG_LEVEL=INFO
LOG_DIR=logs
LOG_CONSOLE=true
LOG_FILE_SIZE=10485760
LOG_BACKUP_COUNT=5
RATE_LIMIT_PER_MINUTE=60
MCP_SERVERS_CONFIG_PATH=mcp_servers.json
MCP_ENABLE_AUTO_DISCOVERY=true
MCP_JIRA_SERVER_URL=https://trendmicro.atlassian.net
MCP_JIRA_USERNAME=test_user@trendmicro.com
MCP_JIRA_API_TOKEN=test_jira_token
MCP_CONFLUENCE_SERVER_URL=https://trendmicro.atlassian.net/wiki
MCP_CONFLUENCE_USERNAME=test_user@trendmicro.com
MCP_CONFLUENCE_API_TOKEN=test_confluence_token
"""
    
    with open(config_file, 'w', encoding='utf-8') as f:
        f.write(test_config)
    
    print(f"✅ Created test configuration at {config_file}")
    return backup_file


def test_setup_env():
    """Test the setup_env script"""
    print("\n🧪 Testing setup_env script...")
    
    # Add current directory to path for imports
    import sys
    sys.path.insert(0, '.')
    
    # Import and run the setup
    try:
        from scripts.setup_env import main as setup_env_main
        
        result = setup_env_main()
        if result:
            print("✅ setup_env script works correctly")
            
            # Check if .env file was created
            env_file = Path('.env')
            if env_file.exists():
                print("✅ .env file was generated")
                with open(env_file, 'r') as f:
                    content = f.read()
                    if 'test_token_here' in content:
                        print("✅ Configuration values were properly set")
                    else:
                        print("⚠️ Configuration values might not be set correctly")
            else:
                print("❌ .env file was not generated")
                return False
        else:
            print("❌ setup_env script failed")
            return False
            
    except Exception as e:
        print(f"❌ Error running setup_env: {e}")
        return False
    
    return True


def test_claude_settings():
    """Test the Claude settings generation"""
    print("\n🧪 Testing Claude settings generation...")
    
    try:
        from scripts.generate_claude_settings import generate_claude_settings
        
        result = generate_claude_settings()
        if result:
            print("✅ Claude settings generation works correctly")
            
            # Check if settings file was created
            settings_file = Path('.claude/settings.local.json')
            if settings_file.exists():
                print("✅ Claude settings file was generated")
            else:
                print("❌ Claude settings file was not generated")
                return False
        else:
            print("❌ Claude settings generation failed")
            return False
            
    except Exception as e:
        print(f"❌ Error running Claude settings generation: {e}")
        return False
    
    return True


def cleanup_test_files():
    """Clean up test files"""
    print("\n🧹 Cleaning up test files...")
    
    # Remove generated .env file
    env_file = Path('.env')
    if env_file.exists():
        env_file.unlink()
        print("🗑️ Removed test .env file")
    
    # Remove generated Claude settings
    settings_file = Path('.claude/settings.local.json')
    if settings_file.exists():
        settings_file.unlink()
        print("🗑️ Removed test Claude settings file")


def restore_config(backup_file):
    """Restore original configuration if exists"""
    if backup_file and backup_file.exists():
        config_file = Path.home() / '.trendaiagent' / 'env.conf'
        shutil.copy2(backup_file, config_file)
        backup_file.unlink()
        print(f"🔄 Restored original configuration from backup")
    else:
        # Remove test config
        config_file = Path.home() / '.trendaiagent' / 'env.conf'
        if config_file.exists():
            config_file.unlink()
            print("🗑️ Removed test configuration")


def main():
    """Main test function"""
    print("🧪 Testing uvx setup process...")
    print("=" * 50)
    
    backup_file = None
    
    try:
        # Create test configuration
        backup_file = create_test_config()
        
        # Test setup_env
        if not test_setup_env():
            print("❌ setup_env test failed")
            return False
        
        # Test Claude settings generation
        if not test_claude_settings():
            print("❌ Claude settings test failed")
            return False
        
        print("\n" + "=" * 50)
        print("✅ All tests passed!")
        print("🎉 uvx setup process is working correctly")
        
        return True
        
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        return False
        
    finally:
        # Clean up
        cleanup_test_files()
        restore_config(backup_file)


if __name__ == "__main__":
    import sys
    os.chdir(Path(__file__).parent.parent)  # Change to project root
    
    success = main()
    sys.exit(0 if success else 1)