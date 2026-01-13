"""
Data Health Router - Veri Sağlığı API Endpoints
================================================
Migration ekranı için veri sağlığı yönetimi.

Endpoints:
- GET /health/report - Genel veri sağlığı raporu
- GET /health/tables - Embedded tablo listesi
- POST /health/fix-metadata - Eksik metadata düzelt
- POST /health/delete-orphans - Orphan kayıtları sil
- POST /health/delete-duplicates - Duplicate kayıtları sil
"""

import os
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field
import asyncpg
from loguru import logger

from services.database import get_db
from services.data_health import DataHealthService, HealthMetrics, MetadataFixResult

router = APIRouter(prefix="/api/python/data-health", tags=["Data Health"])


# =====================================================
# Source DB Pool Management
# =====================================================

_source_pool: Optional[asyncpg.Pool] = None


async def get_source_pool() -> asyncpg.Pool:
    """Get source database pool (vergilex_db, geolex_db, etc.)"""
    global _source_pool

    if _source_pool is not None:
        return _source_pool

    # Source DB URL from settings or environment
    source_db_url = os.getenv("SOURCE_DATABASE_URL")

    if not source_db_url:
        # Try to build from DATABASE_URL pattern
        # DATABASE_URL: postgresql://user:pass@host:port/vergilex_lsemb
        # SOURCE_DB: postgresql://user:pass@host:port/vergilex_db
        db_url = os.getenv("DATABASE_URL", "")
        if db_url:
            # Replace database name suffix
            if "_lsemb" in db_url:
                source_db_url = db_url.replace("_lsemb", "_db")
            elif "lsemb" in db_url:
                source_db_url = db_url.replace("lsemb", "vergilex_db")
            else:
                # Fallback: use same DB
                source_db_url = db_url

    if not source_db_url:
        raise ValueError("SOURCE_DATABASE_URL not configured")

    try:
        _source_pool = await asyncpg.create_pool(
            source_db_url,
            min_size=2,
            max_size=10,
            command_timeout=60,
        )
        logger.info(f"✅ Source DB connected")
        return _source_pool
    except Exception as e:
        logger.error(f"❌ Source DB connection failed: {e}")
        raise


async def get_data_health_service() -> DataHealthService:
    """Get data health service with both pools"""
    system_pool = await get_db()
    source_pool = await get_source_pool()
    return DataHealthService(system_pool, source_pool)


# =====================================================
# Request/Response Models
# =====================================================

class HealthReportResponse(BaseModel):
    """Veri sağlığı raporu response"""
    generated_at: str
    summary: dict
    tables: dict
    recommendations: List[str]


class FixMetadataRequest(BaseModel):
    """Metadata düzeltme request"""
    table_name: str = Field(..., description="Tablo adı (örn: ozelge, mevzuat)")
    dry_run: bool = Field(default=True, description="True ise değişiklik yapmaz")
    batch_size: int = Field(default=100, ge=10, le=500)
    limit: int = Field(default=1000, ge=1, le=10000)


class FixMetadataResponse(BaseModel):
    """Metadata düzeltme response"""
    table: str
    total_records: int
    fixed_count: int
    skipped_count: int
    error_count: int
    sample_fixes: List[dict]


class DeleteOrphansRequest(BaseModel):
    """Orphan silme request"""
    table_name: str = Field(..., description="Tablo adı")
    dry_run: bool = Field(default=True, description="True ise silmez")
    limit: int = Field(default=1000, ge=1, le=10000)


class DeleteOrphansResponse(BaseModel):
    """Orphan silme response"""
    table: str
    orphans_found: int
    deleted_count: int
    dry_run: bool
    sample_orphans: List[dict]


class DeleteDuplicatesRequest(BaseModel):
    """Duplicate silme request"""
    table_name: str = Field(..., description="Tablo adı")
    dry_run: bool = Field(default=True, description="True ise silmez")
    keep: str = Field(default="newest", description="newest veya oldest")


class DeleteDuplicatesResponse(BaseModel):
    """Duplicate silme response"""
    table: str
    duplicates_found: int
    deleted_count: int
    dry_run: bool
    sample_duplicates: List[dict]


class TableListResponse(BaseModel):
    """Tablo listesi response"""
    tables: List[str]
    total_count: int


# =====================================================
# Endpoints
# =====================================================

@router.get("/report", response_model=HealthReportResponse)
async def get_health_report(
    service: DataHealthService = Depends(get_data_health_service)
):
    """
    Genel veri sağlığı raporu.
    Tüm tablolar için orphan, missing metadata, duplicate sayılarını döner.
    """
    try:
        report = await service.generate_health_report()
        return HealthReportResponse(**report)
    except Exception as e:
        logger.error(f"Error generating health report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tables", response_model=TableListResponse)
async def get_embedded_tables(
    service: DataHealthService = Depends(get_data_health_service)
):
    """
    Unified embeddings'de kayıtlı tabloları listele.
    """
    try:
        tables = await service._get_embedded_tables()
        return TableListResponse(
            tables=tables,
            total_count=len(tables)
        )
    except Exception as e:
        logger.error(f"Error listing tables: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fix-metadata", response_model=FixMetadataResponse)
async def fix_missing_metadata(
    request: FixMetadataRequest,
    service: DataHealthService = Depends(get_data_health_service)
):
    """
    Eksik metadata'yı source DB'den doldur.

    UYARI: dry_run=False yaparak gerçek değişiklik yapılır!

    Örnek:
    - ozelge tablosu için daire, tarih, sayisirano, konusu alanları doldurulur
    - mevzuat tablosu için kanun_no, madde_no, tarih, baslik alanları doldurulur
    """
    try:
        result = await service.fix_missing_metadata(
            table_name=request.table_name,
            dry_run=request.dry_run,
            batch_size=request.batch_size,
            limit=request.limit
        )
        return FixMetadataResponse(
            table=result.table,
            total_records=result.total_records,
            fixed_count=result.fixed_count,
            skipped_count=result.skipped_count,
            error_count=result.error_count,
            sample_fixes=result.sample_fixes
        )
    except Exception as e:
        logger.error(f"Error fixing metadata: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/delete-orphans", response_model=DeleteOrphansResponse)
async def delete_orphan_records(
    request: DeleteOrphansRequest,
    service: DataHealthService = Depends(get_data_health_service)
):
    """
    Source DB'de karşılığı olmayan embedding kayıtlarını sil.

    UYARI: dry_run=False yaparak gerçek silme yapılır!

    Orphan kayıtlar:
    - Source tablosunda silinmiş kayıtlara ait embeddings
    - Yanlış tablo/id eşleşmesi olan kayıtlar
    """
    try:
        result = await service.delete_orphans(
            table_name=request.table_name,
            dry_run=request.dry_run,
            limit=request.limit
        )
        return DeleteOrphansResponse(**result)
    except Exception as e:
        logger.error(f"Error deleting orphans: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/delete-duplicates", response_model=DeleteDuplicatesResponse)
async def delete_duplicate_records(
    request: DeleteDuplicatesRequest,
    service: DataHealthService = Depends(get_data_health_service)
):
    """
    Content hash bazlı duplicate kayıtları sil.

    UYARI: dry_run=False yaparak gerçek silme yapılır!

    Options:
    - keep=newest: En yeni kaydı tut, eskileri sil
    - keep=oldest: En eski kaydı tut, yenileri sil
    """
    try:
        result = await service.delete_duplicates(
            table_name=request.table_name,
            dry_run=request.dry_run,
            keep=request.keep
        )
        return DeleteDuplicatesResponse(**result)
    except Exception as e:
        logger.error(f"Error deleting duplicates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =====================================================
# Quick Actions
# =====================================================

@router.post("/quick-fix/{table_name}")
async def quick_fix_table(
    table_name: str,
    dry_run: bool = Query(default=True, description="True ise değişiklik yapmaz"),
    service: DataHealthService = Depends(get_data_health_service)
):
    """
    Tek tablo için hızlı düzeltme: orphans + duplicates + missing metadata.

    Bu endpoint sırayla:
    1. Orphan kayıtları siler
    2. Duplicate kayıtları siler
    3. Eksik metadata'yı doldurur
    """
    results = {
        "table": table_name,
        "dry_run": dry_run,
        "orphans": None,
        "duplicates": None,
        "metadata": None,
        "success": True
    }

    try:
        # 1. Delete orphans
        orphan_result = await service.delete_orphans(
            table_name=table_name,
            dry_run=dry_run,
            limit=5000
        )
        results["orphans"] = orphan_result

        # 2. Delete duplicates
        dup_result = await service.delete_duplicates(
            table_name=table_name,
            dry_run=dry_run,
            keep="newest"
        )
        results["duplicates"] = dup_result

        # 3. Fix metadata
        meta_result = await service.fix_missing_metadata(
            table_name=table_name,
            dry_run=dry_run,
            batch_size=100,
            limit=5000
        )
        results["metadata"] = {
            "total_records": meta_result.total_records,
            "fixed_count": meta_result.fixed_count,
            "skipped_count": meta_result.skipped_count,
            "error_count": meta_result.error_count
        }

        return results

    except Exception as e:
        logger.error(f"Error in quick-fix for {table_name}: {e}")
        results["success"] = False
        results["error"] = str(e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/table/{table_name}/stats")
async def get_table_stats(
    table_name: str,
    service: DataHealthService = Depends(get_data_health_service)
):
    """
    Tek tablo için detaylı istatistikler.
    """
    try:
        metrics = await service._analyze_table_health(table_name)
        return {
            "table": table_name,
            "total_embeddings": metrics.total_embeddings,
            "orphan_count": metrics.orphan_count,
            "missing_metadata_count": metrics.missing_metadata_count,
            "duplicate_count": metrics.duplicate_count,
            "stale_count": metrics.stale_count,
            "healthy_count": metrics.healthy_count,
            "health_score": round(metrics.health_score, 2)
        }
    except Exception as e:
        logger.error(f"Error getting stats for {table_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =====================================================
# Pending & Stuck Embeddings
# =====================================================

@router.get("/pending-embeddings")
async def get_pending_embeddings(
    service: DataHealthService = Depends(get_data_health_service)
):
    """
    Henuz embed edilmemis kayitlari bul.
    Source DB'deki toplam kayit sayisi ile embedded sayisini karsilastirir.
    """
    try:
        return await service.get_pending_embeddings()
    except Exception as e:
        logger.error(f"Error getting pending embeddings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/missing-ids/{table_name}")
async def get_missing_source_ids(
    table_name: str,
    limit: int = Query(default=100, ge=1, le=1000),
    service: DataHealthService = Depends(get_data_health_service)
):
    """
    Belirli bir tablo icin embed edilmemis source_id'leri getir.
    """
    try:
        return await service.find_missing_source_ids(table_name, limit)
    except Exception as e:
        logger.error(f"Error finding missing IDs for {table_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/queue-status")
async def get_queue_status(
    service: DataHealthService = Depends(get_data_health_service)
):
    """
    import_jobs tablosundan embedding kuyrugu durumunu getir.
    Pending, processing, stuck job sayilarini doner.
    """
    try:
        return await service.get_embedding_queue_status()
    except Exception as e:
        logger.error(f"Error getting queue status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reset-stuck")
async def reset_stuck_jobs(
    dry_run: bool = Query(default=True, description="True ise degisiklik yapmaz"),
    service: DataHealthService = Depends(get_data_health_service)
):
    """
    10 dakikadan uzun suredir 'processing' durumunda kalan isleri resetle.

    UYARI: dry_run=False yaparak gercek degisiklik yapilir!
    """
    try:
        return await service.reset_stuck_jobs(dry_run)
    except Exception as e:
        logger.error(f"Error resetting stuck jobs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/optimize")
async def optimize_data(
    dry_run: bool = Query(default=True, description="True ise degisiklik yapmaz"),
    service: DataHealthService = Depends(get_data_health_service)
):
    """
    Tek tikla veri optimizasyonu:
    1. Stuck job'lari resetle
    2. Orphan kayitlari sil
    3. Duplicate kayitlari sil
    4. Eksik metadata'yi doldur

    Tum tablolar icin calisir.
    """
    results = {
        "dry_run": dry_run,
        "stuck_reset": None,
        "orphans_deleted": 0,
        "duplicates_deleted": 0,
        "metadata_fixed": 0,
        "tables_processed": [],
        "errors": []
    }

    try:
        # 1. Reset stuck jobs
        stuck_result = await service.reset_stuck_jobs(dry_run)
        results["stuck_reset"] = stuck_result.get("reset_count", 0)

        # 2. Get all tables
        tables = await service._get_embedded_tables()

        for table in tables:
            table_result = {"table": table, "orphans": 0, "duplicates": 0, "metadata": 0}

            try:
                # Delete orphans
                orphan_result = await service.delete_orphans(table, dry_run, limit=5000)
                table_result["orphans"] = orphan_result.get("deleted_count", 0)
                results["orphans_deleted"] += table_result["orphans"]

                # Delete duplicates
                dup_result = await service.delete_duplicates(table, dry_run, keep="newest")
                table_result["duplicates"] = dup_result.get("deleted_count", 0)
                results["duplicates_deleted"] += table_result["duplicates"]

                # Fix metadata
                meta_result = await service.fix_missing_metadata(table, dry_run, batch_size=100, limit=5000)
                table_result["metadata"] = meta_result.fixed_count
                results["metadata_fixed"] += table_result["metadata"]

                results["tables_processed"].append(table_result)

            except Exception as e:
                results["errors"].append({"table": table, "error": str(e)})
                logger.error(f"Error optimizing {table}: {e}")

        return results

    except Exception as e:
        logger.error(f"Error in optimize: {e}")
        raise HTTPException(status_code=500, detail=str(e))
