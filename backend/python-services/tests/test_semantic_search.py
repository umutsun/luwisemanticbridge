import pytest
from unittest.mock import AsyncMock, patch
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
from routers.semantic_search_router import router as semantic_search_router

@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(semantic_search_router, prefix="/api/python/semantic-search")
    return app

@pytest.fixture
def mock_semantic_service():
    with patch("routers.semantic_search_router.semantic_search_service") as mock:
        yield mock

@pytest.mark.asyncio
async def test_semantic_search(app, mock_semantic_service):
    mock_result = {
        "success": True,
        "query": "test query",
        "results": [{"id": 1, "content": "test content", "score": 0.9}],
        "total": 1
    }
    mock_semantic_service.semantic_search = AsyncMock(return_value=mock_result)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(
            "/api/python/semantic-search/search",
            json={"query": "test query", "limit": 5}
        )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["results"]) == 1
    assert data["results"][0]["content"] == "test content"

    mock_semantic_service.semantic_search.assert_awaited_once_with(
        query="test query",
        limit=5,
        use_cache=True,
        debug=False
    )

@pytest.mark.asyncio
async def test_embedding_generation(app, mock_semantic_service):
    mock_service_embedding = [0.1, 0.2, 0.3]
    mock_semantic_service.generate_embedding = AsyncMock(return_value=mock_service_embedding)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(
            "/api/python/semantic-search/embedding",
            json={"text": "test text"}
        )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["embedding"] == mock_service_embedding

