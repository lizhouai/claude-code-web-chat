#!/usr/bin/env python3
"""
Main entry point for Claude Code Web Chat when installed via uvx
This module handles:
1. Configuration setup from ~/.claudecodechat/env.conf
2. Claude settings generation
3. Service startup
"""
import sys
import os
import subprocess
import webbrowser
import time
from pathlib import Path

# Add the project root to Python path
def find_project_root():
    """Find the project root directory by looking for .env.example"""
    current = Path(__file__).parent.parent

    # First try the default path (for development/local clone)
    if (current / '.env.example').exists():
        return current

    # If not found, search upwards from current directory
    search_path = Path.cwd()
    for _ in range(10):  # Limit search to avoid infinite loop
        if (search_path / '.env.example').exists():
            return search_path
        if search_path.parent == search_path:  # Reached root
            break
        search_path = search_path.parent

    # Fallback: use the module's parent directory
    return current

project_root = find_project_root()
sys.path.insert(0, str(project_root))

# Now we can import our modules
from scripts.setup_env import main as setup_env_main
from scripts.generate_claude_settings import generate_claude_settings


def run_setup():
    """Run the complete setup process"""
    print("🔧 Starting Claude Code Web Chat setup...")

    # Step 1: Setup environment from ~/.claudecodechat/env.conf
    print("\n📋 Step 1: Setting up environment configuration...")
    if not setup_env_main():
        print("❌ Failed to setup environment configuration")
        return False
    
    # Step 2: Generate Claude settings
    print("\n📋 Step 2: Generating Claude settings...")
    if not generate_claude_settings():
        print("❌ Failed to generate Claude settings")
        return False
    
    print("✅ Setup completed successfully!")
    return True


def start_server():
    """Start the FastAPI server"""
    print("\n🚀 Starting Claude Code Web Chat server...")
    
    # Import and run the FastAPI app
    try:
        import uvicorn
        from app.main import app
        
        # Start server in a separate process so we can open browser
        print("🌐 Server will be available at: http://127.0.0.1:8000")
        print("📱 Opening browser...")
        
        # Open browser after a short delay
        def open_browser():
            time.sleep(3)  # Give server time to start
            try:
                webbrowser.open('http://127.0.0.1:8000')
                print("✅ Browser opened successfully")
            except Exception as e:
                print(f"⚠️ Could not open browser automatically: {e}")
                print("Please manually open: http://127.0.0.1:8000")
        
        # Start browser opening in background
        import threading
        browser_thread = threading.Thread(target=open_browser)
        browser_thread.daemon = True
        browser_thread.start()
        
        # Start the server
        uvicorn.run(
            app,
            host="127.0.0.1",
            port=8000,
            log_level="info"
        )
        
    except KeyboardInterrupt:
        print("\n👋 Shutting down Claude Code Web Chat...")
        return True
    except Exception as e:
        print(f"❌ Error starting server: {e}")
        return False


def main(dry_run=False):
    """Main entry point"""
    print("=" * 60)
    print("🤖 Claude Code Web Chat")
    print("    Intelligent Agent Web Service based on Claude Code SDK")
    print("=" * 60)
    
    # Change to project directory
    print(f"📁 Project root: {project_root.absolute()}")
    print(f"📄 Looking for .env.example at: {(project_root / '.env.example').absolute()}")

    if not (project_root / '.env.example').exists():
        print(f"⚠️  Warning: .env.example not found at expected location")
        print(f"Current working directory: {Path.cwd().absolute()}")

    os.chdir(project_root)
    
    # Run setup
    if not run_setup():
        print("\n❌ Setup failed. Please check the error messages above.")
        sys.exit(1)
    
    print("\n" + "=" * 60)
    print("🎉 Setup completed successfully!")
    
    if dry_run:
        print("🧪 Dry-run mode: skipping server startup")
        return True
    
    print("🚀 Starting web service...")
    print("📍 You can access the web interface at: http://127.0.0.1:8000")
    print("🛑 Press Ctrl+C to stop the service")
    print("=" * 60)
    
    # Start server
    try:
        start_server()
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()