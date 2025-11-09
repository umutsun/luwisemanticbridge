"""
Crawl4AI API Router
Endpoints for AI-powered web scraping
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field, HttpUrl
from typing import Optional, Dict, Any, List
from enum import Enum
from loguru import logger

from services.crawl4ai_service import crawl4ai_service

router = APIRouter()

class CrawlMode(str, Enum):
    """Crawl mode options"""
    LLM = "llm"
    AUTO = "auto"
    SCHEMA = "schema"

class CrawlRequest(BaseModel):
    """Request model for web crawling"""
    url: HttpUrl = Field(..., description="Target URL to crawl")
    mode: CrawlMode = Field(CrawlMode.AUTO, description="Crawl mode")

    # LLM extraction options
    extraction_prompt: Optional[str] = Field(None, description="LLM extraction instructions")
    model: Optional[str] = Field("gpt-4", description="LLM model")
    provider: Optional[str] = Field("openai", description="LLM provider")

    # Auto crawl options
    max_depth: Optional[int] = Field(1, ge=1, le=5, description="Maximum crawl depth")
    follow_links: Optional[bool] = Field(False, description="Follow links")
    content_type: Optional[str] = Field("all", description="Content type filter")

    # Schema extraction options
    schema: Optional[Dict[str, Any]] = Field(None, description="JSON schema for extraction")
    css_selectors: Optional[Dict[str, str]] = Field(None, description="CSS selectors")

    # Common options
    js_code: Optional[str] = Field(None, description="JavaScript to execute")
    wait_for: Optional[str] = Field(None, description="CSS selector to wait for")
    screenshot: Optional[bool] = Field(False, description="Take screenshot")
    timeout: Optional[int] = Field(30, description="Timeout in seconds")

    class Config:
        json_schema_extra = {
            "example": {
                "url": "https://example.com",
                "mode": "llm",
                "extraction_prompt": "Extract the main article title and content",
                "model": "gpt-4",
                "screenshot": True
            }
        }

class CrawlResponse(BaseModel):
    """Response model for crawl results"""
    success: bool
    url: str
    title: Optional[str]
    content: Optional[str]
    markdown: Optional[str]
    extracted_content: Optional[Any]
    metadata: Dict[str, Any]
    links: Optional[List[str]]
    images: Optional[List[str]]

class BatchCrawlRequest(BaseModel):
    """Request model for batch crawling"""
    urls: List[HttpUrl] = Field(..., min_items=1, max_items=50)
    mode: CrawlMode = Field(CrawlMode.AUTO)
    extraction_prompt: Optional[str] = None
    parallel: bool = Field(True, description="Process URLs in parallel")

@router.post("/", response_model=CrawlResponse)
async def crawl_page(request: CrawlRequest) -> CrawlResponse:
    """
    Crawl a single webpage with AI extraction

    Modes:
    - **llm**: Use LLM for intelligent extraction
    - **auto**: Automatic content extraction
    - **schema**: Extract structured data using schema
    """
    try:
        logger.info(f"Crawling {request.url} with mode: {request.mode}")

        result = None

        if request.mode == CrawlMode.LLM:
            if not request.extraction_prompt:
                raise HTTPException(
                    status_code=400,
                    detail="extraction_prompt is required for LLM mode"
                )

            result = await crawl4ai_service.crawl_with_llm(
                url=str(request.url),
                extraction_prompt=request.extraction_prompt,
                model=request.model,
                provider=request.provider,
                js_code=request.js_code,
                wait_for=request.wait_for,
                screenshot=request.screenshot,
                timeout=request.timeout
            )

        elif request.mode == CrawlMode.AUTO:
            result = await crawl4ai_service.crawl_auto(
                url=str(request.url),
                max_depth=request.max_depth,
                follow_links=request.follow_links,
                content_type=request.content_type,
                js_code=request.js_code,
                wait_for=request.wait_for,
                screenshot=request.screenshot,
                timeout=request.timeout
            )

        elif request.mode == CrawlMode.SCHEMA:
            if not request.schema:
                raise HTTPException(
                    status_code=400,
                    detail="schema is required for SCHEMA mode"
                )

            result = await crawl4ai_service.crawl_with_schema(
                url=str(request.url),
                schema=request.schema,
                css_selectors=request.css_selectors,
                js_code=request.js_code,
                wait_for=request.wait_for,
                screenshot=request.screenshot,
                timeout=request.timeout
            )

        return CrawlResponse(
            success=True,
            url=result["url"],
            title=result.get("title"),
            content=result.get("content"),
            markdown=result.get("markdown"),
            extracted_content=result.get("extracted_content"),
            metadata=result.get("metadata", {}),
            links=result.get("links", []),
            images=result.get("images", [])
        )

    except Exception as e:
        logger.error(f"Crawl failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/batch")
async def batch_crawl(
    request: BatchCrawlRequest,
    background_tasks: BackgroundTasks
) -> Dict[str, Any]:
    """
    Crawl multiple URLs in batch

    Returns immediately with a job ID for tracking
    """
    import uuid
    job_id = str(uuid.uuid4())

    # Add to background tasks
    background_tasks.add_task(
        _process_batch_crawl,
        job_id,
        request
    )

    return {
        "job_id": job_id,
        "status": "queued",
        "urls_count": len(request.urls),
        "message": "Batch crawl job queued. Check status with /status/{job_id}"
    }

async def _process_batch_crawl(job_id: str, request: BatchCrawlRequest):
    """Process batch crawl in background"""
    from services.redis_client import cache_set
    import asyncio

    results = []

    try:
        # Update status
        await cache_set(f"crawl:batch:{job_id}:status", "processing", 3600)

        if request.parallel:
            # Process URLs in parallel
            tasks = []
            for url in request.urls:
                if request.mode == CrawlMode.LLM:
                    task = crawl4ai_service.crawl_with_llm(
                        url=str(url),
                        extraction_prompt=request.extraction_prompt or ""
                    )
                else:
                    task = crawl4ai_service.crawl_auto(url=str(url))
                tasks.append(task)

            results = await asyncio.gather(*tasks, return_exceptions=True)
        else:
            # Process URLs sequentially
            for url in request.urls:
                try:
                    if request.mode == CrawlMode.LLM:
                        result = await crawl4ai_service.crawl_with_llm(
                            url=str(url),
                            extraction_prompt=request.extraction_prompt or ""
                        )
                    else:
                        result = await crawl4ai_service.crawl_auto(url=str(url))
                    results.append(result)
                except Exception as e:
                    results.append({"url": str(url), "error": str(e)})

        # Store results
        await cache_set(f"crawl:batch:{job_id}:results", results, 3600)
        await cache_set(f"crawl:batch:{job_id}:status", "completed", 3600)

    except Exception as e:
        logger.error(f"Batch crawl failed: {e}")
        await cache_set(f"crawl:batch:{job_id}:status", "failed", 3600)
        await cache_set(f"crawl:batch:{job_id}:error", str(e), 3600)

@router.get("/status/{job_id}")
async def get_crawl_status(job_id: str) -> Dict[str, Any]:
    """Get batch crawl job status"""
    from services.redis_client import cache_get

    status = await cache_get(f"crawl:batch:{job_id}:status")
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")

    response = {"job_id": job_id, "status": status}

    if status == "completed":
        results = await cache_get(f"crawl:batch:{job_id}:results")
        response["results"] = results
    elif status == "failed":
        error = await cache_get(f"crawl:batch:{job_id}:error")
        response["error"] = error

    return response

class RecrawlRequest(BaseModel):
    """Request model for re-crawling specific URLs"""
    crawler_name: str = Field(..., description="Crawler name (e.g., 'emlakai', 'yky')")
    urls: List[str] = Field(..., min_items=1, max_items=100, description="URLs to re-crawl")

class ExtractRequest(BaseModel):
    """Request model for HTML extraction"""
    html: str = Field(..., description="HTML content")
    extraction_prompt: str = Field(..., description="Extraction instructions")
    model: str = Field("gpt-4", description="LLM model")

@router.post("/recrawl")
async def recrawl_urls(request: RecrawlRequest) -> Dict[str, Any]:
    """
    Re-crawl specific URLs by removing them from visited set and adding to queue

    This endpoint allows you to re-crawl pages that were already crawled,
    useful for updating content or fixing incomplete crawls.
    Also removes the item from Redis to avoid confusion.
    """
    import json
    from pathlib import Path
    from services.redis_client import get_redis

    try:
        # Construct state file path (go up to backend/ directory)
        # Handle both formats: "emlakai" and "emlakai_crawler"
        crawler_base = request.crawler_name.replace("_crawler", "") if "_crawler" in request.crawler_name else request.crawler_name
        state_file = Path(__file__).parent.parent.parent / f"{crawler_base}_crawler_state.json"

        if not state_file.exists():
            raise HTTPException(
                status_code=404,
                detail=f"Crawler '{request.crawler_name}' hasn't been run yet or state file is missing. Please run the crawler first to generate the state file."
            )

        # Read state file
        with open(state_file, 'r', encoding='utf-8') as f:
            state = json.load(f)

        queue = state.get('queue', [])
        visited = set(state.get('visited', []))
        failed_urls = state.get('failed_urls', [])

        # Get URLs already in queue (queue items are tuples: (url, category_path))
        queue_urls = set(item[0] if isinstance(item, (list, tuple)) else item for item in queue)

        # Get Redis client for deleting cached data
        redis_client = await get_redis()
        deleted_from_redis = []

        # Process URLs for re-crawling
        added = []
        not_found = []
        already_in_queue = []

        for url in request.urls:
            # Check if URL is already in queue
            if url in queue_urls:
                already_in_queue.append(url)
                logger.warning(f"⚠️ Already in queue: {url}")
            elif url in visited:
                # Remove from visited and add to queue
                visited.remove(url)
                queue.append((url, []))  # Add with empty category path
                queue_urls.add(url)  # Update the set
                added.append(url)
                logger.info(f"✅ Re-queued: {url}")

                # Delete from Redis to avoid showing stale data
                if redis_client:
                    try:
                        # Find Redis keys matching this URL
                        # Extract slug from URL for pattern matching
                        url_slug = url.rstrip('/').split('/')[-1]
                        pattern = f"crawl4ai:{request.crawler_name}:*{url_slug}*"

                        # Find all matching keys
                        matching_keys = []
                        cursor = 0
                        while True:
                            cursor, keys = await redis_client.scan(cursor, match=pattern, count=100)
                            matching_keys.extend(keys)
                            if cursor == 0:
                                break

                        # Delete all matching keys
                        if matching_keys:
                            await redis_client.delete(*matching_keys)
                            deleted_from_redis.extend(matching_keys)
                            logger.info(f"🗑️ Deleted {len(matching_keys)} Redis keys for {url}")
                    except Exception as redis_error:
                        logger.warning(f"⚠️ Failed to delete from Redis: {redis_error}")
            else:
                not_found.append(url)
                logger.warning(f"⚠️ URL not in visited set: {url}")

        # Remove from failed_urls if present
        if failed_urls:
            for url in added:
                if url in failed_urls:
                    failed_urls.remove(url)

        # Update state
        state['queue'] = queue
        state['visited'] = list(visited)
        if failed_urls:
            state['failed_urls'] = failed_urls

        # Save state file
        with open(state_file, 'w', encoding='utf-8') as f:
            json.dump(state, f, ensure_ascii=False, indent=2)

        logger.info(f"🎉 Re-crawl: {len(added)} URLs added to queue, {len(deleted_from_redis)} Redis keys deleted")

        return {
            "success": True,
            "crawler_name": request.crawler_name,
            "added_count": len(added),
            "not_found_count": len(not_found),
            "already_queued_count": len(already_in_queue),
            "queue_size": len(queue),
            "visited_size": len(visited),
            "added_urls": added,
            "not_found_urls": not_found,
            "already_queued_urls": already_in_queue,
            "deleted_from_redis_count": len(deleted_from_redis)
        }

    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="Failed to parse state file. File may be corrupted."
        )
    except Exception as e:
        logger.error(f"Re-crawl failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/extract")
async def extract_from_html(request: ExtractRequest) -> Dict[str, Any]:
    """
    Extract structured data from HTML using LLM

    Useful when you already have HTML and just need extraction
    """
    # This would use Crawl4AI's extraction capabilities on provided HTML
    # Implementation depends on Crawl4AI's API for direct HTML processing
    return {
        "message": "Direct HTML extraction endpoint",
        "note": "To be implemented based on Crawl4AI capabilities"
    }