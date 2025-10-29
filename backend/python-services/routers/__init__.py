"""
LSEMB Python API Routers
"""

from .health import router as health_router
from .crawl_router import router as crawl_router
from .pgai_router import router as pgai_router

__all__ = ["health_router", "crawl_router", "pgai_router"]