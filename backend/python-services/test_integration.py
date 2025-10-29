"""
Test script for Python services integration
"""

import asyncio
import aiohttp
import json
from typing import Dict, Any

BASE_URL = "http://localhost:8001"

async def test_health():
    """Test health endpoint"""
    print("Testing health endpoint...")
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{BASE_URL}/health") as response:
            data = await response.json()
            print(f"Health Status: {data['status']}")
            return response.status == 200

async def test_crawl_auto():
    """Test auto crawl mode"""
    print("\nTesting auto crawl mode...")

    payload = {
        "url": "https://example.com",
        "mode": "auto",
        "timeout": 10
    }

    headers = {
        "Content-Type": "application/json",
        "X-API-Key": "default-dev-key"
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{BASE_URL}/api/python/crawl",
            json=payload,
            headers=headers
        ) as response:
            if response.status == 200:
                data = await response.json()
                print(f"Success! Title: {data.get('title', 'N/A')}")
                print(f"Content length: {len(data.get('content', ''))}")
                return True
            else:
                print(f"Failed with status: {response.status}")
                error = await response.text()
                print(f"Error: {error}")
                return False

async def test_pgai_status():
    """Test pgai status endpoint"""
    print("\nTesting pgai status...")

    headers = {
        "X-API-Key": "default-dev-key"
    }

    async with aiohttp.ClientSession() as session:
        async with session.get(
            f"{BASE_URL}/api/python/pgai/status",
            headers=headers
        ) as response:
            data = await response.json()
            print(f"pgai installed: {data.get('installed', False)}")
            if not data.get('installed'):
                print(f"Message: {data.get('message', 'N/A')}")
            return response.status == 200

async def main():
    """Run all tests"""
    print("=" * 50)
    print("LSEMB Python Services Integration Test")
    print("=" * 50)

    results = []

    # Test health
    results.append(("Health Check", await test_health()))

    # Test crawl
    try:
        results.append(("Crawl Auto Mode", await test_crawl_auto()))
    except Exception as e:
        print(f"Crawl test failed: {e}")
        results.append(("Crawl Auto Mode", False))

    # Test pgai
    try:
        results.append(("pgai Status", await test_pgai_status()))
    except Exception as e:
        print(f"pgai test failed: {e}")
        results.append(("pgai Status", False))

    # Print summary
    print("\n" + "=" * 50)
    print("Test Summary:")
    print("=" * 50)
    for test_name, passed in results:
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{test_name}: {status}")

    all_passed = all(result[1] for result in results)

    if all_passed:
        print("\n🎉 All tests passed!")
    else:
        print("\n⚠️ Some tests failed. Please check the logs.")

if __name__ == "__main__":
    print("Make sure the Python service is running on port 8001")
    print("You can start it with: python main.py")
    print()
    input("Press Enter to start tests...")

    asyncio.run(main())