"""
Pydantic models for CSV Transform Worker
Handles large CSV file transformations using PostgreSQL COPY
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime


class TransformStatus(str, Enum):
    """Status enum for transform jobs"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class CSVTransformRequest(BaseModel):
    """Request model for CSV transformation"""
    file_path: str = Field(..., description="Absolute path to the CSV file")
    table_name: str = Field(..., description="Target PostgreSQL table name")
    database_url: str = Field(..., description="PostgreSQL connection string")
    job_id: str = Field(..., description="Unique job identifier for tracking")

    # Optional parameters
    batch_size: int = Field(default=50000, description="Rows per batch for COPY")
    delimiter: str = Field(default=",", description="CSV delimiter character")
    encoding: str = Field(default="utf-8", description="File encoding")
    skip_header: bool = Field(default=True, description="Skip first row as header")
    truncate_table: bool = Field(default=False, description="Truncate table before import")

    # Column mapping (optional)
    column_mapping: Optional[Dict[str, str]] = Field(
        default=None,
        description="Map CSV columns to DB columns {csv_col: db_col}"
    )

    # Data type hints (optional)
    column_types: Optional[Dict[str, str]] = Field(
        default=None,
        description="Override column types {col_name: pg_type}"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "file_path": "/var/www/vergilex/docs/DANISTAYKARARLARI.csv",
                "table_name": "danistaykararlari",
                "database_url": "postgresql://user:pass@localhost:5432/vergilex_db",
                "job_id": "transform_abc123",
                "batch_size": 50000,
                "delimiter": ",",
                "encoding": "utf-8"
            }
        }


class CSVTransformResponse(BaseModel):
    """Response model for transform job initiation"""
    job_id: str
    status: TransformStatus
    message: str
    estimated_rows: Optional[int] = None
    estimated_time_seconds: Optional[int] = None

    class Config:
        json_schema_extra = {
            "example": {
                "job_id": "transform_abc123",
                "status": "processing",
                "message": "Transform job started successfully",
                "estimated_rows": 142678,
                "estimated_time_seconds": 180
            }
        }


class TransformProgress(BaseModel):
    """Progress model for real-time updates via Redis pub/sub"""
    job_id: str
    status: TransformStatus
    progress: float = Field(..., ge=0, le=100, description="Progress percentage")
    rows_processed: int = Field(default=0)
    total_rows: int = Field(default=0)
    current_batch: int = Field(default=0)
    total_batches: int = Field(default=0)

    # Performance metrics
    rows_per_second: Optional[float] = None
    elapsed_seconds: Optional[float] = None
    estimated_remaining_seconds: Optional[float] = None

    # Error info (if failed)
    error_message: Optional[str] = None
    error_row: Optional[int] = None

    # Timestamps
    started_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    class Config:
        json_schema_extra = {
            "example": {
                "job_id": "transform_abc123",
                "status": "processing",
                "progress": 45.5,
                "rows_processed": 65000,
                "total_rows": 142678,
                "current_batch": 2,
                "total_batches": 3,
                "rows_per_second": 25000.5,
                "elapsed_seconds": 2.6,
                "estimated_remaining_seconds": 3.1
            }
        }


class TableSchema(BaseModel):
    """Schema information for auto-generated tables"""
    table_name: str
    columns: List[Dict[str, Any]]
    primary_key: Optional[str] = None
    created: bool = False


class TransformJobInfo(BaseModel):
    """Complete job information for status queries"""
    job_id: str
    file_path: str
    table_name: str
    status: TransformStatus
    progress: TransformProgress
    table_schema: Optional[TableSchema] = None

    # Statistics
    file_size_bytes: Optional[int] = None
    total_rows: Optional[int] = None

    # Timing
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
