"""
Pydantic models for Chunk Relationship Extraction
Handles entity extraction, cross-reference detection, and graph traversal.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime


class RelationshipType(str, Enum):
    """Types of relationships between chunks"""
    REFERENCES = "references"       # Atif: chunk mentions another law/article
    AMENDS = "amends"               # Degistirme: law amendment relationship
    PARENT_OF = "parent_of"         # Hiyerarsi: kanun -> bolum -> madde -> fikra
    RELATED_TO = "related_to"       # General semantic relationship
    SUPERSEDES = "supersedes"       # Yururlukten kaldirma: replaces older version
    INTERPRETS = "interprets"       # Yorumlama: ozelge/danistay interpreting a law


class EntityType(str, Enum):
    """Types of entities extracted from chunk content"""
    LAW_CODE = "law_code"           # VUK, GVK, KDVK, etc.
    ARTICLE_NUMBER = "article_number"  # 114, 40, 29/A, etc.
    INSTITUTION = "institution"     # Danistay, GIB, Maliye Bakanligi
    DATE = "date"                   # 26.05.2024, 2024 yili
    RATE = "rate"                   # %18, %1, binde 20
    PENALTY = "penalty"             # Usulsuzluk cezasi, gecikme faizi
    CONCEPT = "concept"             # Zamanasimi, muafiyet, istisna


class ExtractionStatus(str, Enum):
    """Status enum for extraction jobs"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


# =============================================
# Entity Models
# =============================================

class EntityResult(BaseModel):
    """Single extracted entity"""
    entity_type: EntityType = Field(alias="type")
    value: str = Field(..., description="Raw entity value from text")
    normalized: Optional[str] = Field(None, description="Normalized value (e.g., '%18' -> '0.18')")
    position_start: Optional[int] = Field(None, description="Character offset start in content")
    position_end: Optional[int] = Field(None, description="Character offset end in content")

    model_config = {"populate_by_name": True}


class EntityDB(BaseModel):
    """Entity as stored in database"""
    id: int
    chunk_id: int
    entity_type: str
    entity_value: str
    normalized_value: Optional[str] = None
    position_start: Optional[int] = None
    position_end: Optional[int] = None
    metadata: Dict[str, Any] = {}
    created_at: Optional[datetime] = None


# =============================================
# Relationship Models
# =============================================

class ReferenceResult(BaseModel):
    """Single extracted cross-reference"""
    target_law: Optional[str] = Field(None, description="Target law code: VUK, GVK, etc.")
    target_article: Optional[str] = Field(None, description="Target article number: 114, 40, 29/A")
    relationship_type: RelationshipType = Field(default=RelationshipType.REFERENCES, alias="type")
    context: Optional[str] = Field(None, description="Surrounding text where reference was found")
    confidence: float = Field(default=0.8, ge=0.0, le=1.0)

    model_config = {"populate_by_name": True}


class RelationshipDB(BaseModel):
    """Relationship as stored in database"""
    id: int
    source_chunk_id: int
    target_chunk_id: Optional[int] = None
    relationship_type: str
    confidence: float = 0.0
    extracted_by: str = "llm"
    target_reference: Optional[str] = None
    target_law_code: Optional[str] = None
    target_article_number: Optional[str] = None
    metadata: Dict[str, Any] = {}
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class RelatedChunk(BaseModel):
    """A chunk related via graph traversal"""
    chunk_id: int
    content: str
    source_table: str
    source_type: str
    relationship_type: str
    relationship_direction: str = Field(description="'outgoing' or 'incoming'")
    confidence: float
    hop_distance: int = Field(default=1, description="Graph distance from original chunk")


# =============================================
# Request Models
# =============================================

class ExtractRequest(BaseModel):
    """Request to extract entities/relationships from a single chunk"""
    chunk_id: int
    content: Optional[str] = Field(None, description="If not provided, fetched from DB")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Chunk metadata for context")

    class Config:
        json_schema_extra = {
            "example": {
                "chunk_id": 12345,
                "content": "VUK 114. maddesine gore zamanasimi suresi 5 yildir. GVK 40. maddesi uyarinca..."
            }
        }


class BatchExtractRequest(BaseModel):
    """Request to start batch extraction job"""
    source_table: Optional[str] = Field(None, description="Filter by source table (e.g., csv_ozelge)")
    source_type: Optional[str] = Field(None, description="Filter by source type (e.g., kanun)")
    limit: Optional[int] = Field(None, description="Max chunks to process. None = all matching.")
    offset: int = Field(default=0, description="Skip first N chunks")
    force_reprocess: bool = Field(default=False, description="Re-extract even if already processed")

    class Config:
        json_schema_extra = {
            "example": {
                "source_table": "csv_ozelge",
                "limit": 1000,
                "offset": 0,
                "force_reprocess": False
            }
        }


class ResolveRequest(BaseModel):
    """Request to resolve unresolved references"""
    dry_run: bool = Field(default=False, description="If true, only report matches without updating")


# =============================================
# Response Models
# =============================================

class ExtractionResult(BaseModel):
    """Result of extracting from a single chunk"""
    chunk_id: int
    entities: List[EntityResult] = []
    references: List[ReferenceResult] = []
    entities_stored: int = 0
    relationships_stored: int = 0
    extraction_time_ms: float = 0.0
    model_used: str = ""
    fallback_used: bool = Field(default=False, description="True if regex fallback was used instead of LLM")


class BatchExtractResponse(BaseModel):
    """Response when starting a batch extraction job"""
    job_id: str
    status: ExtractionStatus = ExtractionStatus.PENDING
    source_table: Optional[str] = None
    total_chunks: int = 0
    message: str = ""


class BatchProgressResponse(BaseModel):
    """Progress of a batch extraction job"""
    job_id: str
    status: ExtractionStatus
    total_chunks: int = 0
    processed_chunks: int = 0
    failed_chunks: int = 0
    relationships_found: int = 0
    entities_found: int = 0
    progress_pct: float = 0.0
    elapsed_seconds: Optional[float] = None
    eta_seconds: Optional[float] = None
    error_message: Optional[str] = None


class ResolveResponse(BaseModel):
    """Result of reference resolution"""
    total_unresolved: int = 0
    resolved: int = 0
    still_unresolved: int = 0
    dry_run: bool = False


class ChunkRelationshipsResponse(BaseModel):
    """Relationships for a specific chunk"""
    chunk_id: int
    outgoing: List[RelationshipDB] = []
    incoming: List[RelationshipDB] = []
    total: int = 0


class RelatedChunksResponse(BaseModel):
    """Graph-traversal result for a chunk"""
    chunk_id: int
    related: List[RelatedChunk] = []
    hops_used: int = 1
    total: int = 0


class ExtractionStatsResponse(BaseModel):
    """Overall extraction statistics"""
    total_chunks: int = 0
    chunks_with_relationships: int = 0
    chunks_with_entities: int = 0
    total_relationships: int = 0
    total_entities: int = 0
    relationships_by_type: Dict[str, int] = {}
    entities_by_type: Dict[str, int] = {}
    unresolved_references: int = 0
    extraction_coverage_pct: float = 0.0
    active_jobs: int = 0


# =============================================
# LLM Extraction Response Schema
# =============================================

class LLMExtractionResponse(BaseModel):
    """Expected JSON structure from LLM extraction call"""
    entities: List[EntityResult] = []
    references: List[ReferenceResult] = []


class CleanupRequest(BaseModel):
    """Request to remove chunks from Neo4j after deletion from PG"""
    workspace_id: str
    chunk_ids: List[int]
