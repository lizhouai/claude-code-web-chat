"""
Test script to verify rate limiting functionality.
"""
import asyncio
import httpx
import time
from typing import List, Dict


async def test_rate_limiting():
    """Test rate limiting by making multiple requests quickly."""
    
    base_url = "http://localhost:8000"
    
    # Test data for query endpoint
    test_query = {
        "prompt": "Hello, this is a test query",
        "session_id": "test-session"
    }
    
    print("Testing rate limiting...")
    print(f"Making requests to {base_url}/api/v1/query")
    
    async with httpx.AsyncClient() as client:
        responses = []
        start_time = time.time()
        
        # Make 5 requests quickly (should exceed most rate limits)
        for i in range(5):
            try:
                response = await client.post(
                    f"{base_url}/api/v1/query", 
                    json=test_query,
                    timeout=10.0
                )
                responses.append({
                    "request_num": i + 1,
                    "status_code": response.status_code,
                    "response_time": time.time() - start_time,
                    "headers": dict(response.headers),
                    "content": response.text[:200] if response.status_code == 429 else "Success"
                })
                print(f"Request {i+1}: Status {response.status_code}")
                
            except Exception as e:
                responses.append({
                    "request_num": i + 1,
                    "error": str(e),
                    "response_time": time.time() - start_time
                })
                print(f"Request {i+1}: Error - {e}")
            
            # Small delay between requests
            await asyncio.sleep(0.1)
    
    # Analyze results
    print("\n" + "="*50)
    print("RATE LIMITING TEST RESULTS")
    print("="*50)
    
    success_count = sum(1 for r in responses if r.get("status_code") == 200)
    rate_limited_count = sum(1 for r in responses if r.get("status_code") == 429)
    error_count = sum(1 for r in responses if "error" in r)
    
    print(f"Total requests: {len(responses)}")
    print(f"Successful requests: {success_count}")
    print(f"Rate limited (429): {rate_limited_count}")
    print(f"Errors: {error_count}")
    
    if rate_limited_count > 0:
        print("\n✅ Rate limiting is working!")
        print("Some requests were blocked with 429 status code.")
    else:
        print("\n⚠️  Rate limiting might not be working as expected.")
        print("All requests succeeded - check configuration.")
    
    print("\nDetailed responses:")
    for response in responses:
        print(f"  Request {response['request_num']}: {response}")


async def test_health_endpoint():
    """Test the health endpoint (should not be rate limited as much)."""
    
    base_url = "http://localhost:8000"
    
    print("\n" + "="*50)
    print("Testing health endpoint...")
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{base_url}/health", timeout=5.0)
            print(f"Health check: {response.status_code}")
            print(f"Response: {response.json()}")
        except Exception as e:
            print(f"Health check failed: {e}")


if __name__ == "__main__":
    print("Rate Limiting Test")
    print("Make sure the server is running on localhost:8000")
    print("You can start it with: python app/main.py")
    print()
    
    try:
        asyncio.run(test_health_endpoint())
        asyncio.run(test_rate_limiting())
    except KeyboardInterrupt:
        print("\nTest interrupted by user")
    except Exception as e:
        print(f"\nTest failed with error: {e}")