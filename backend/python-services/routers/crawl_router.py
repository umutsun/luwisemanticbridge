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

class ExtractRequest(BaseModel):
    """Request model for HTML extraction"""
    html: str = Field(..., description="HTML content")
    extraction_prompt: str = Field(..., description="Extraction instructions")
    model: str = Field("gpt-4", description="LLM model")

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