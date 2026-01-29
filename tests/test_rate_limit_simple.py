#!/usr/bin/env python3
"""
Simple test script for rate limiting middleware
"""
import asyncio
import httpx
import time
from typing import Dict, Any

async def test_rate_limiting():
    """Test the rate limiting functionality"""
    print("Testing rate limiting middleware...")
    
    # Start the server in background (manual step)
    print("Note: Please start the server manually with:")
    print("source /Users/li_zhou/Dev/ai/claude_code/claude-code-web-service/claudeCodeWebSrvEnv/bin/activate")
    print("python -m app.main")
    print("Then press Enter to continue...")
    input()
    
    base_url = "http://127.0.0.1:8000"
    health_endpoint = f"{base_url}/health"
    
    async with httpx.AsyncClient() as client:
        # Test basic connectivity
        try:
            response = await client.get(health_endpoint)
            print(f"✓ Health check: {response.status_code}")
            print(f"Response: {response.json()}")
        except Exception as e:
            print(f"✗ Health check failed: {e}")
            return
        
        # Test rate limiting by making multiple rapid requests
        print("\nTesting rate limiting (making 15 requests rapidly)...")
        responses = []
        start_time = time.time()
        
        for i in range(15):
            try:
                response = await client.get(health_endpoint)
                responses.append({
                    "request": i + 1,
                    "status": response.status_code,
                    "time": time.time() - start_time
                })
                print(f"Request {i+1}: {response.status_code}")
            except Exception as e:
                print(f"Request {i+1} failed: {e}")
            
            # Small delay to avoid overwhelming
            await asyncio.sleep(0.1)
        
        # Analyze results
        successful_requests = [r for r in responses if r["status"] == 200]
        rate_limited_requests = [r for r in responses if r["status"] == 429]
        
        print(f"\n--- Results ---")
        print(f"Total requests: {len(responses)}")
        print(f"Successful (200): {len(successful_requests)}")
        print(f"Rate limited (429): {len(rate_limited_requests)}")
        
        if len(rate_limited_requests) > 0:
            print("✓ Rate limiting is working!")
        else:
            print("? Rate limiting might not be triggered (all requests succeeded)")

if __name__ == "__main__":
    asyncio.run(test_rate_limiting())