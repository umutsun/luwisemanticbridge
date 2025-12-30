"""
LSEMB Python API Routers
"""

from .health import router as health_router
from .crawl_router import router as crawl_router
from .pgai_router import router as pgai_router
from .whisper_router import router as whisper_router
from .import_router import router as import_router
from .worker_router import router as worker_router
from .pdf_router import router as pdf_router
from .csv_transform_router import router as csv_transform_router
from .embedding_router import router as embedding_router
from .document_analyzer_router import router as document_analyzer_router
from .semantic_search_router import router as semantic_search_router
from .devops_router import router as devops_router

__all__ = [
    "health_router",
    "crawl_router",
    "pgai_router",
    "whisper_router",
    "import_router",
    "worker_router",
    "pdf_router",
    "csv_transform_router",
    "embedding_router",
    "document_analyzer_router",
    "semantic_search_router",
    "devops_router"
]