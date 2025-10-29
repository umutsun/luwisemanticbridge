"""
Quick test to verify Python environment
"""

print("Testing Python environment...")

# Test imports
try:
    import fastapi
    print("✅ FastAPI installed")
except ImportError:
    print("❌ FastAPI not installed")

try:
    import asyncpg
    print("✅ asyncpg installed")
except ImportError:
    print("❌ asyncpg not installed")

try:
    import crawl4ai
    print("✅ Crawl4AI installed")
except ImportError:
    print("❌ Crawl4AI not installed")

try:
    import redis
    print("✅ Redis installed")
except ImportError:
    print("❌ Redis not installed")

# Test database connection
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

async def test_db():
    try:
        import asyncpg
        conn = await asyncpg.connect(os.getenv("DATABASE_URL"))
        version = await conn.fetchval("SELECT version()")
        print(f"✅ Database connected: {version[:50]}...")
        await conn.close()
    except Exception as e:
        print(f"❌ Database connection failed: {e}")

print("\nTesting database connection...")
asyncio.run(test_db())

print("\nEnvironment test complete!")
print("If all checks pass, run: python main.py")