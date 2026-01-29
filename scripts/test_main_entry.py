#!/usr/bin/env python3
"""
Test the main entry point without starting the server
"""
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Import the main function
from claude_code_web_chat.__main__ import main

if __name__ == "__main__":
    print("🧪 Testing main entry point...")
    try:
        # Run in dry-run mode to test setup without starting server
        success = main(dry_run=True)
        if success:
            print("✅ Main entry point test passed!")
        else:
            print("❌ Main entry point test failed!")
            sys.exit(1)
    except Exception as e:
        print(f"❌ Error during test: {e}")
        sys.exit(1)