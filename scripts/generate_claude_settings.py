#!/usr/bin/env python3
"""
Script to generate .claude/settings.local.json from .env file
"""
import os
import json
from pathlib import Path
from dotenv import load_dotenv


def generate_claude_settings():
    """Generate Claude settings from .env file"""
    # First try ~/.claudecodechat/.env (preferred location)
    user_env_path = Path.home() / '.claudecodechat' / '.env'
    # Fallback to project root .env
    project_env_path = Path('.env')

    env_path = None
    if user_env_path.exists():
        env_path = user_env_path
    elif project_env_path.exists():
        env_path = project_env_path
    else:
        print("Error: .env file not found in ~/.claudecodechat/ or current directory")
        print("Please run setup to generate a .env file from .env.example")
        return False

    print(f"Loading environment variables from {env_path}")
    load_dotenv(env_path)
    
    # Read required environment variables
    env_vars = {
        "ANTHROPIC_CUSTOM_HEADERS": os.getenv("ANTHROPIC_CUSTOM_HEADERS"),
        "DISABLE_NON_ESSENTIAL_MODEL_CALLS": os.getenv("DISABLE_NON_ESSENTIAL_MODEL_CALLS"),
        "DISABLE_TELEMETRY": os.getenv("DISABLE_TELEMETRY"),
        "ANTHROPIC_BASE_URL": os.getenv("ANTHROPIC_BASE_URL"),
        "ANTHROPIC_AUTH_TOKEN": os.getenv("ANTHROPIC_AUTH_TOKEN"), 
        "ANTHROPIC_MODEL": os.getenv("ANTHROPIC_MODEL"),
        "ANTHROPIC_DEFAULT_OPUS_MODEL": os.getenv("ANTHROPIC_DEFAULT_OPUS_MODEL"),
        "ANTHROPIC_DEFAULT_SONNET_MODEL": os.getenv("ANTHROPIC_DEFAULT_SONNET_MODEL"),
        "ANTHROPIC_DEFAULT_HAIKU_MODEL": os.getenv("ANTHROPIC_DEFAULT_HAIKU_MODEL"),
        "CLAUDE_CODE_SUBAGENT_MODEL": os.getenv("CLAUDE_CODE_SUBAGENT_MODEL"),
        "DISABLE_NON_ESSENTIAL_MODEL_CALLS": os.getenv("DISABLE_NON_ESSENTIAL_MODEL_CALLS")
    }
    
    # Check for missing required variables
    missing_vars = []
    required_vars = ["ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN"]
    
    for var in required_vars:
        if not env_vars[var]:
            missing_vars.append(var)
    
    if missing_vars:
        print(f"Error: Missing required environment variables in .env:")
        for var in missing_vars:
            print(f"  - {var}")
        print("\nPlease add these variables to your .env file")
        return False
    
    # Create settings with defaults for optional variables
    settings = {
        "env": {
            "ANTHROPIC_BASE_URL": env_vars["ANTHROPIC_BASE_URL"],
            "ANTHROPIC_AUTH_TOKEN": env_vars["ANTHROPIC_AUTH_TOKEN"],
            "ANTHROPIC_MODEL": env_vars["ANTHROPIC_MODEL"] or "claude-4.5-sonnet",
            "ANTHROPIC_DEFAULT_OPUS_MODEL": env_vars["ANTHROPIC_DEFAULT_OPUS_MODEL"] or "claude-4.1-opus",
            "ANTHROPIC_DEFAULT_SONNET_MODEL": env_vars["ANTHROPIC_DEFAULT_SONNET_MODEL"] or "claude-4.5-sonnet",
            "ANTHROPIC_DEFAULT_HAIKU_MODEL": env_vars["ANTHROPIC_DEFAULT_HAIKU_MODEL"] or "claude-3.5-haiku",
            "CLAUDE_CODE_SUBAGENT_MODEL": env_vars["CLAUDE_CODE_SUBAGENT_MODEL"] or "claude-4.5-sonnet",
            "DISABLE_NON_ESSENTIAL_MODEL_CALLS": env_vars["DISABLE_NON_ESSENTIAL_MODEL_CALLS"] or "1"
        }
    }
    
    # Create .claude directory if it doesn't exist
    claude_dir = Path('.claude')
    claude_dir.mkdir(exist_ok=True)
    
    # Check if settings.local.json exists and preserve non-env fields
    settings_path = claude_dir / 'settings.local.json'
    
    if settings_path.exists():
        try:
            with open(settings_path, 'r', encoding='utf-8') as f:
                existing_settings = json.load(f)
            
            # Preserve existing non-env fields (like feedbackSurveyState)
            for key, value in existing_settings.items():
                if key != 'env':
                    settings[key] = value
                    
            print(f"Preserving existing settings (non-env fields)")
            
        except json.JSONDecodeError as e:
            print(f"Warning: Existing settings.local.json is not valid JSON: {e}")
            print("Will create a new settings file")
    
    # Write the settings file
    try:
        with open(settings_path, 'w', encoding='utf-8') as f:
            json.dump(settings, f, indent=2, ensure_ascii=False)
        
        print(f"✅ Successfully generated {settings_path}")
        
        # Show which values were set
        print("\nGenerated environment variables:")
        for key, value in settings['env'].items():
            if value:
                # Mask sensitive tokens for display
                if 'TOKEN' in key or 'KEY' in key:
                    if len(value) > 20:
                        masked_value = value[:10] + "..." + value[-5:]
                    else:
                        masked_value = "***"
                    print(f"  ✓ {key}: {masked_value}")
                else:
                    print(f"  ✓ {key}: {value}")
            else:
                print(f"  ⚠ {key}: (using default)")
        
        return True
        
    except Exception as e:
        print(f"Error writing settings file: {e}")
        return False


if __name__ == "__main__":
    print("Generating Claude settings from .env file...")
    success = generate_claude_settings()
    
    if success:
        print("\n✅ Claude settings generated successfully!")
        print("You can now use Claude Code with the environment variables from your .env file.")
    else:
        print("\n❌ Failed to generate Claude settings.")
        exit(1)