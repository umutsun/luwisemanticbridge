"""
Crawl4AI Web Scraping Service
Advanced AI-powered web scraping with LLM extraction
"""

import os
import json
from typing import Optional, Dict, Any, List
from datetime import datetime
import hashlib

from crawl4ai import AsyncWebCrawler
from crawl4ai.extraction_strategy import (
    LLMExtractionStrategy,
    JsonCssExtractionStrategy,
    CosineStrategy
)
from loguru import logger

from services.database import execute_update, execute_query
from services.redis_client import cache_get, cache_set

class Crawl4AIService:
    """Service for AI-powered web scraping using Crawl4AI"""

    def __init__(self):
        self.max_workers = int(os.getenv("CRAWL4AI_MAX_WORKERS", 5))
        self.timeout = int(os.getenv("CRAWL4AI_TIMEOUT", 30))
        self.max_retries = int(os.getenv("CRAWL4AI_MAX_RETRIES", 3))
        self.use_cache = os.getenv("CRAWL4AI_USE_CACHE", "true").lower() == "true"

    async def crawl_with_llm(
        self,
        url: str,
        extraction_prompt: str,
        model: str = "gpt-4",
        provider: str = "openai",
        js_code: Optional[str] = None,
        wait_for: Optional[str] = None,
        screenshot: bool = False,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Crawl a webpage and extract structured data using LLM

        Args:
            url: Target URL to crawl
            extraction_prompt: Instructions for LLM extraction
            model: LLM model to use
            provider: LLM provider (openai, anthropic, etc.)
            js_code: JavaScript to execute before extraction
            wait_for: CSS selector to wait for
            screenshot: Whether to take a screenshot
            **kwargs: Additional crawl options

        Returns:
            Extracted data with metadata
        """
        # Check cache first
        if self.use_cache:
            cache_key = self._generate_cache_key(url, extraction_prompt)
            cached = await cache_get(cache_key)
            if cached:
                logger.info(f"Cache hit for {url}")
                return cached

        try:
            async with AsyncWebCrawler(verbose=True) as crawler:
                # Configure extraction strategy
                extraction_strategy = LLMExtractionStrategy(
                    provider=provider,
                    api_token=os.getenv("OPENAI_API_KEY") if provider == "openai" else None,
                    model=model,
                    instruction=extraction_prompt,
                    max_tokens=kwargs.get("max_tokens", 4000),
                    temperature=kwargs.get("temperature", 0.7)
                )

                # Perform crawl
                result = await crawler.arun(
                    url=url,
                    extraction_strategy=extraction_strategy,
                    js_code=js_code,
                    wait_for=wait_for,
                    screenshot=screenshot,
                    bypass_cache=True,  # We handle our own caching
                    timeout=self.timeout,
                    **kwargs
                )

                # Process result
                processed = await self._process_crawl_result(result, url)

                # Store in database
                await self._store_scraped_content(processed)

                # Cache result
                if self.use_cache:
                    await cache_set(cache_key, processed, expire=3600)

                return processed

        except Exception as e:
            logger.error(f"Crawl4AI LLM extraction failed for {url}: {e}")
            raise

    async def crawl_auto(
        self,
        url: str,
        max_depth: int = 1,
        follow_links: bool = False,
        content_type: str = "all",
        **kwargs
    ) -> Dict[str, Any]:
        """
        Auto crawl with intelligent content extraction

        Args:
            url: Target URL
            max_depth: Maximum crawl depth
            follow_links: Whether to follow links
            content_type: Type of content to extract (all, article, product, etc.)

        Returns:
            Extracted content with metadata
        """
        try:
            async with AsyncWebCrawler(verbose=True) as crawler:
                # Use cosine similarity strategy for semantic extraction
                extraction_strategy = CosineStrategy(
                    semantic_filter=kwargs.get("semantic_filter"),
                    word_count_threshold=kwargs.get("word_count_threshold", 10)
                ) if content_type == "semantic" else None

                # Crawl with auto mode
                result = await crawler.arun(
                    url=url,
                    extraction_strategy=extraction_strategy,
                    bypass_cache=True,
                    timeout=self.timeout,
                    **kwargs
                )

                # Handle multiple pages if follow_links is enabled
                all_content = [result]
                if follow_links and max_depth > 1:
                    links = await self._extract_links(result)
                    for link in links[:10]:  # Limit to 10 links
                        try:
                            link_result = await crawler.arun(
                                url=link,
                                extraction_strategy=extraction_strategy,
                                bypass_cache=True,
                                timeout=self.timeout
                            )
                            all_content.append(link_result)
                        except Exception as e:
                            logger.warning(f"Failed to crawl linked page {link}: {e}")

                # Process and combine results
                processed = await self._process_multi_page_results(all_content, url)

                # Store in database
                await self._store_scraped_content(processed)

                return processed

        except Exception as e:
            logger.error(f"Auto crawl failed for {url}: {e}")
            raise

    async def crawl_with_schema(
        self,
        url: str,
        schema: Dict[str, Any],
        css_selectors: Optional[Dict[str, str]] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Crawl with structured data extraction using schema

        Args:
            url: Target URL
            schema: JSON schema for extraction
            css_selectors: CSS selectors for specific fields

        Returns:
            Structured data matching schema
        """
        try:
            async with AsyncWebCrawler(verbose=True) as crawler:
                # Configure JSON/CSS extraction
                extraction_strategy = JsonCssExtractionStrategy(
                    schema=schema,
                    css_selectors=css_selectors
                ) if schema else None

                result = await crawler.arun(
                    url=url,
                    extraction_strategy=extraction_strategy,
                    bypass_cache=True,
                    timeout=self.timeout,
                    **kwargs
                )

                # Process result
                processed = await self._process_crawl_result(result, url)

                # Validate against schema if provided
                if schema:
                    processed["structured_data"] = result.extracted_content

                # Store in database
                await self._store_scraped_content(processed)

                return processed

        except Exception as e:
            logger.error(f"Schema-based crawl failed for {url}: {e}")
            raise

    async def _process_crawl_result(
        self,
        result: Any,
        url: str
    ) -> Dict[str, Any]:
        """Process and structure crawl result"""
        return {
            "url": url,
            "title": getattr(result, "title", ""),
            "content": getattr(result, "cleaned_text", ""),
            "markdown": getattr(result, "markdown", ""),
            "extracted_content": getattr(result, "extracted_content", None),
            "metadata": {
                "crawled_at": datetime.now().isoformat(),
                "success": getattr(result, "success", True),
                "status_code": getattr(result, "status_code", 200),
                "content_type": getattr(result, "content_type", "text/html"),
                "word_count": len(getattr(result, "cleaned_text", "").split()),
                "links_count": len(getattr(result, "links", [])),
                "images_count": len(getattr(result, "images", [])),
                "screenshot": getattr(result, "screenshot", None)
            },
            "links": getattr(result, "links", [])[:50],  # Limit links
            "images": getattr(result, "images", [])[:20]  # Limit images
        }

    async def _process_multi_page_results(
        self,
        results: List[Any],
        base_url: str
    ) -> Dict[str, Any]:
        """Process multiple page results"""
        combined = {
            "url": base_url,
            "pages": [],
            "total_content": "",
            "total_links": set(),
            "total_images": set(),
            "metadata": {
                "crawled_at": datetime.now().isoformat(),
                "pages_crawled": len(results),
                "total_word_count": 0
            }
        }

        for result in results:
            processed = await self._process_crawl_result(result, result.url if hasattr(result, 'url') else base_url)
            combined["pages"].append(processed)
            combined["total_content"] += processed["content"] + "\n\n"
            combined["total_links"].update(processed["links"])
            combined["total_images"].update(processed["images"])
            combined["metadata"]["total_word_count"] += processed["metadata"]["word_count"]

        # Convert sets to lists
        combined["total_links"] = list(combined["total_links"])[:100]
        combined["total_images"] = list(combined["total_images"])[:50]

        return combined

    async def _extract_links(self, result: Any) -> List[str]:
        """Extract relevant links from crawl result"""
        links = getattr(result, "links", [])
        # Filter for relevant links (same domain, not media files, etc.)
        base_domain = result.url.split('/')[2] if hasattr(result, 'url') else ""
        filtered = []
        for link in links:
            if base_domain in link and not any(ext in link for ext in ['.jpg', '.png', '.pdf', '.zip']):
                filtered.append(link)
        return filtered[:20]  # Limit to 20 links

    async def _store_scraped_content(self, data: Dict[str, Any]):
        """Store scraped content in database"""
        try:
            content_hash = hashlib.md5(
                (data["url"] + data.get("content", "")).encode()
            ).hexdigest()

            await execute_update("""
                INSERT INTO scraped_pages (
                    url, title, content, markdown,
                    metadata, content_hash, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
                ON CONFLICT (url) DO UPDATE SET
                    title = EXCLUDED.title,
                    content = EXCLUDED.content,
                    markdown = EXCLUDED.markdown,
                    metadata = EXCLUDED.metadata,
                    content_hash = EXCLUDED.content_hash,
                    updated_at = NOW()
            """,
                data["url"],
                data.get("title", ""),
                data.get("content", ""),
                data.get("markdown", ""),
                json.dumps(data.get("metadata", {})),
                content_hash
            )
            logger.info(f"Stored scraped content for {data['url']}")
        except Exception as e:
            logger.error(f"Failed to store scraped content: {e}")

    def _generate_cache_key(self, url: str, prompt: str) -> str:
        """Generate cache key for URL and prompt combination"""
        return f"crawl4ai:{hashlib.md5((url + prompt).encode()).hexdigest()}"

# Global service instance
crawl4ai_service = Crawl4AIService()