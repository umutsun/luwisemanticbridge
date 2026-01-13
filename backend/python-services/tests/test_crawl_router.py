import pytest
from unittest.mock import AsyncMock, patch
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
from routers.crawl_router import router as crawl_router

# Integration / Router tests for Crawl Service - Isolated

@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(crawl_router, prefix="/api/python/crawl")
    return app

@pytest.fixture
def mock_crawl_service():
    with patch("routers.crawl_router.crawl4ai_service") as mock:
        yield mock

@pytest.mark.asyncio
async def test_crawl_page_auto_mode(app, mock_crawl_service):
    """Test auto crawl mode endpoint"""
    mock_result = {
        "url": "https://example.com",
        "title": "Example Domain",
        "content": "Example content",
        "markdown": "# Example Domain",
        "metadata": {"tags": []},
        "links": [],
        "images": []
    }
    mock_crawl_service.crawl_auto = AsyncMock(return_value=mock_result)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(
            "/api/python/crawl/",
            json={"url": "https://example.com", "mode": "auto"}
        )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["url"] == "https://example.com"
    
    mock_crawl_service.crawl_auto.assert_awaited_once()

@pytest.mark.asyncio
async def test_crawl_validation_error(app):
    """Test input validation"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Missing URL
        response = await ac.post(
            "/api/python/crawl/",
            json={"mode": "auto"}
        )
        assert response.status_code == 422 

