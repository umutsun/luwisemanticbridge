"""
Data Health Service - Veri Sağlığı Yönetimi
============================================
Bu servis unified_embeddings tablosundaki veri kalitesini yönetir:

1. Orphan Detection: Source DB'de karşılığı olmayan embedding kayıtları
2. Metadata Fix: Eksik metadata'yı source DB'den doldurmak
3. Duplicate Detection: Aynı içeriğe sahip tekrarlanan kayıtlar
4. Stale Detection: Çok eski veya güncellenmemiş kayıtlar

Kullanım:
    from services.data_health import DataHealthService

    service = DataHealthService(system_pool, source_pool)
    report = await service.generate_health_report()
    fixed = await service.fix_missing_metadata("ozelge", dry_run=False)
"""

import asyncio
import hashlib
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
import asyncpg

logger = logging.getLogger(__name__)


@dataclass
class HealthMetrics:
    """Veri sağlığı metrikleri"""
    total_embeddings: int = 0
    orphan_count: int = 0
    missing_metadata_count: int = 0
    duplicate_count: int = 0
    stale_count: int = 0
    healthy_count: int = 0
    health_score: float = 0.0  # 0-100


@dataclass
class OrphanRecord:
    """Orphan kayıt detayı"""
    id: int
    source_table: str
    source_id: int
    source_name: str
    created_at: datetime
    reason: str  # 'source_deleted', 'table_not_found', 'id_mismatch'


@dataclass
class MetadataFixResult:
    """Metadata düzeltme sonucu"""
    table: str
    total_records: int
    fixed_count: int
    skipped_count: int
    error_count: int
    sample_fixes: List[Dict[str, Any]]


class DataHealthService:
    """
    Unified embeddings veri sağlığı servisi
    """

    # Metadata alanları - tabloya göre hangi alanların metadata olarak alınacağı
    METADATA_FIELDS = {
        'ozelge': ['daire', 'tarih', 'sayisirano', 'konusu'],
        'danistaykararlari': ['daire', 'tarih', 'esas_no', 'karar_no', 'konu'],
        'sorucevap': ['kategori', 'soru', 'cevap'],
        'makale': ['yazar', 'baslik', 'tarih', 'dergi', 'sayi'],
        'gib_sirkuler': ['sirkuler_no', 'tarih', 'konu', 'aciklama'],
        'vergilex_mevzuat': ['kanun_no', 'madde_no', 'tarih', 'baslik', 'tur'],
        'mevzuat': ['kanun_no', 'madde_no', 'tarih', 'baslik', 'tur'],
        'default': ['tarih', 'konu', 'baslik', 'kategori', 'yil']
    }

    # Primary key mapping
    PRIMARY_KEYS = {
        'ozelge': 'row_id',
        'danistaykararlari': 'row_id',
        'sorucevap': 'row_id',
        'makale': 'row_id',
        'gib_sirkuler': 'row_id',
        'vergilex_mevzuat': 'row_id',
        'mevzuat': 'row_id',
        'default': 'row_id'
    }

    def __init__(self, system_pool: asyncpg.Pool, source_pool: asyncpg.Pool):
        """
        Args:
            system_pool: System DB bağlantı havuzu (unified_embeddings)
            source_pool: Source DB bağlantı havuzu (ozelge, mevzuat vb.)
        """
        self.system_pool = system_pool
        self.source_pool = source_pool

    async def generate_health_report(self) -> Dict[str, Any]:
        """
        Tüm tablolar için veri sağlığı raporu oluştur
        """
        logger.info("Generating data health report...")

        # Tablo bazlı metrikler
        table_metrics = {}
        total_metrics = HealthMetrics()

        # Unified embeddings'deki tabloları bul
        tables = await self._get_embedded_tables()

        for table_name in tables:
            metrics = await self._analyze_table_health(table_name)
            table_metrics[table_name] = asdict(metrics)

            # Toplam metrikleri güncelle
            total_metrics.total_embeddings += metrics.total_embeddings
            total_metrics.orphan_count += metrics.orphan_count
            total_metrics.missing_metadata_count += metrics.missing_metadata_count
            total_metrics.duplicate_count += metrics.duplicate_count
            total_metrics.stale_count += metrics.stale_count
            total_metrics.healthy_count += metrics.healthy_count

        # Genel sağlık skoru hesapla
        if total_metrics.total_embeddings > 0:
            total_metrics.health_score = (
                total_metrics.healthy_count / total_metrics.total_embeddings
            ) * 100

        return {
            "generated_at": datetime.utcnow().isoformat(),
            "summary": asdict(total_metrics),
            "tables": table_metrics,
            "recommendations": self._generate_recommendations(total_metrics, table_metrics)
        }

    async def _get_embedded_tables(self) -> List[str]:
        """Unified embeddings'de kayıtlı tabloları listele"""
        query = """
            SELECT DISTINCT
                COALESCE(source_table, metadata->>'table') as table_name,
                COUNT(*) as cnt
            FROM unified_embeddings
            WHERE source_table IS NOT NULL
              AND source_table != ''
              AND source_table != 'documents'
            GROUP BY COALESCE(source_table, metadata->>'table')
            ORDER BY cnt DESC
        """
        rows = await self.system_pool.fetch(query)
        return [r['table_name'] for r in rows if r['table_name']]

    async def _analyze_table_health(self, table_name: str) -> HealthMetrics:
        """Tek bir tablo için sağlık analizi"""
        metrics = HealthMetrics()

        # Total embedding count
        count_query = """
            SELECT COUNT(*) as cnt FROM unified_embeddings
            WHERE source_table = $1 OR metadata->>'table' = $1
        """
        result = await self.system_pool.fetchrow(count_query, table_name)
        metrics.total_embeddings = result['cnt']

        if metrics.total_embeddings == 0:
            return metrics

        # Orphan count (source'da karşılığı yok)
        metrics.orphan_count = await self._count_orphans(table_name)

        # Missing metadata count
        metrics.missing_metadata_count = await self._count_missing_metadata(table_name)

        # Duplicate count (content_hash bazlı)
        metrics.duplicate_count = await self._count_duplicates(table_name)

        # Stale count (30 günden eski, hiç güncellenmemiş)
        metrics.stale_count = await self._count_stale(table_name)

        # Healthy = total - (orphans + missing_meta + duplicates)
        unhealthy = metrics.orphan_count + metrics.missing_metadata_count + metrics.duplicate_count
        metrics.healthy_count = max(0, metrics.total_embeddings - unhealthy)

        # Health score
        metrics.health_score = (metrics.healthy_count / metrics.total_embeddings) * 100

        return metrics

    def _get_source_table_name(self, table_name: str) -> str:
        """Source DB'de gerçek tablo adını bul (csv_ prefix'li olabilir)"""
        # csv_ prefix'i varsa aynen döndür
        if table_name.startswith('csv_'):
            return table_name
        # Yoksa csv_ prefix'li versiyonu dene
        return f"csv_{table_name}"

    async def _count_orphans(self, table_name: str) -> int:
        """Source DB'de karşılığı olmayan kayıtları say"""
        try:
            # Source tablo adını belirle (csv_ prefix'li olabilir)
            source_table = self._get_source_table_name(table_name)

            # Source tablosunun varlığını kontrol et
            check_query = """
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = $1
                )
            """
            exists = await self.source_pool.fetchval(check_query, source_table)

            if not exists:
                # csv_ olmadan da dene
                exists = await self.source_pool.fetchval(check_query, table_name)
                if exists:
                    source_table = table_name

            if not exists:
                # Tablo yoksa tüm kayıtlar orphan sayılmaz (veri kaynağı farklı olabilir)
                logger.warning(f"Source table not found: {table_name} or {source_table}")
                return 0

            # Primary key bul
            pk = self.PRIMARY_KEYS.get(table_name, self.PRIMARY_KEYS['default'])

            # Orphan count: unified'da var ama source'da yok
            orphan_query = f"""
                SELECT COUNT(*) FROM unified_embeddings ue
                WHERE (ue.source_table = $1 OR ue.metadata->>'table' = $1)
                AND NOT EXISTS (
                    SELECT 1 FROM "{source_table}" src
                    WHERE src.{pk} = ue.source_id
                )
            """
            return await self.system_pool.fetchval(orphan_query, table_name)

        except Exception as e:
            logger.error(f"Error counting orphans for {table_name}: {e}")
            return 0

    async def _count_missing_metadata(self, table_name: str) -> int:
        """Metadata'sı eksik olan kayıtları say"""
        # Metadata sadece {table, id, content_hash, model} içeriyorsa eksik sayılır
        query = """
            SELECT COUNT(*) FROM unified_embeddings
            WHERE (source_table = $1 OR metadata->>'table' = $1)
            AND (
                metadata IS NULL
                OR metadata = '{}'::jsonb
                OR (
                    NOT metadata ? 'tarih'
                    AND NOT metadata ? 'daire'
                    AND NOT metadata ? 'sayisirano'
                    AND NOT metadata ? 'konu'
                    AND NOT metadata ? 'konusu'
                    AND NOT metadata ? 'baslik'
                )
            )
        """
        return await self.system_pool.fetchval(query, table_name)

    async def _count_duplicates(self, table_name: str) -> int:
        """Content hash bazlı duplicate sayısı"""
        query = """
            SELECT COUNT(*) - COUNT(DISTINCT content_hash) as dup_count
            FROM unified_embeddings
            WHERE (source_table = $1 OR metadata->>'table' = $1)
            AND content_hash IS NOT NULL
        """
        result = await self.system_pool.fetchval(query, table_name)
        return max(0, result or 0)

    async def _count_stale(self, table_name: str, days: int = 30) -> int:
        """Eski/güncellenmemiş kayıtları say"""
        query = """
            SELECT COUNT(*) FROM unified_embeddings
            WHERE (source_table = $1 OR metadata->>'table' = $1)
            AND updated_at < NOW() - INTERVAL '%s days'
            AND updated_at = created_at
        """ % days
        return await self.system_pool.fetchval(query, table_name)

    # ==========================================
    # FIX OPERATIONS
    # ==========================================

    async def fix_missing_metadata(
        self,
        table_name: str,
        dry_run: bool = True,
        batch_size: int = 100,
        limit: int = 1000
    ) -> MetadataFixResult:
        """
        Eksik metadata'yı source DB'den doldurmak

        Args:
            table_name: Tablo adı
            dry_run: True ise değişiklik yapmaz, sadece rapor döner
            batch_size: Batch boyutu
            limit: Maksimum işlenecek kayıt
        """
        logger.info(f"Fixing missing metadata for {table_name} (dry_run={dry_run})")

        result = MetadataFixResult(
            table=table_name,
            total_records=0,
            fixed_count=0,
            skipped_count=0,
            error_count=0,
            sample_fixes=[]
        )

        try:
            # Source tablo adını belirle
            source_table = self._get_source_table_name(table_name)

            # Source tablo varlığını kontrol et
            check_query = """
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = $1
                )
            """
            exists = await self.source_pool.fetchval(check_query, source_table)

            if not exists:
                # csv_ olmadan da dene
                exists = await self.source_pool.fetchval(check_query, table_name)
                if exists:
                    source_table = table_name

            if not exists:
                logger.warning(f"Source table {table_name} or {source_table} does not exist")
                return result

            # Metadata alanlarını al
            meta_fields = self.METADATA_FIELDS.get(
                table_name,
                self.METADATA_FIELDS['default']
            )
            pk = self.PRIMARY_KEYS.get(table_name, self.PRIMARY_KEYS['default'])

            # Eksik metadata olan kayıtları bul
            missing_query = """
                SELECT id, source_id, metadata
                FROM unified_embeddings
                WHERE (source_table = $1 OR metadata->>'table' = $1)
                AND (
                    metadata IS NULL
                    OR metadata = '{}'::jsonb
                    OR (
                        NOT metadata ? 'tarih'
                        AND NOT metadata ? 'daire'
                        AND NOT metadata ? 'sayisirano'
                        AND NOT metadata ? 'konu'
                        AND NOT metadata ? 'konusu'
                    )
                )
                LIMIT $2
            """
            records = await self.system_pool.fetch(missing_query, table_name, limit)
            result.total_records = len(records)

            if not records:
                logger.info(f"No missing metadata found for {table_name}")
                return result

            # Batch işle
            for i in range(0, len(records), batch_size):
                batch = records[i:i + batch_size]
                source_ids = [r['source_id'] for r in batch]

                # Source'dan metadata çek
                fields_sql = ", ".join(meta_fields)
                source_query = f"""
                    SELECT {pk} as source_id, {fields_sql}
                    FROM "{source_table}"
                    WHERE {pk} = ANY($1)
                """
                source_data = await self.source_pool.fetch(source_query, source_ids)
                source_map = {r['source_id']: dict(r) for r in source_data}

                # Her kayıt için metadata güncelle
                for record in batch:
                    source_row = source_map.get(record['source_id'])

                    if not source_row:
                        result.skipped_count += 1
                        continue

                    try:
                        # Yeni metadata oluştur
                        current_meta = record['metadata'] or {}
                        new_meta = {**current_meta}

                        for field in meta_fields:
                            if field in source_row and source_row[field]:
                                new_meta[field] = source_row[field]

                        if not dry_run:
                            # Güncelle
                            update_query = """
                                UPDATE unified_embeddings
                                SET metadata = $1, updated_at = NOW()
                                WHERE id = $2
                            """
                            await self.system_pool.execute(
                                update_query,
                                new_meta,
                                record['id']
                            )

                        result.fixed_count += 1

                        # Sample kaydet (ilk 5)
                        if len(result.sample_fixes) < 5:
                            result.sample_fixes.append({
                                "id": record['id'],
                                "source_id": record['source_id'],
                                "old_metadata": current_meta,
                                "new_metadata": new_meta
                            })

                    except Exception as e:
                        logger.error(f"Error fixing record {record['id']}: {e}")
                        result.error_count += 1

            logger.info(f"Metadata fix complete: {result.fixed_count} fixed, {result.skipped_count} skipped")
            return result

        except Exception as e:
            logger.error(f"Error in fix_missing_metadata: {e}")
            raise

    async def delete_orphans(
        self,
        table_name: str,
        dry_run: bool = True,
        limit: int = 1000
    ) -> Dict[str, Any]:
        """
        Orphan kayıtları sil

        Args:
            table_name: Tablo adı (None ise tüm tablolar)
            dry_run: True ise silmez, sadece liste döner
            limit: Maksimum silinecek kayıt
        """
        logger.info(f"Deleting orphans for {table_name} (dry_run={dry_run})")

        result = {
            "table": table_name,
            "orphans_found": 0,
            "deleted_count": 0,
            "dry_run": dry_run,
            "sample_orphans": []
        }

        try:
            pk = self.PRIMARY_KEYS.get(table_name, self.PRIMARY_KEYS['default'])

            # Source tablo adını belirle
            source_table = self._get_source_table_name(table_name)

            # Source tablosunun varlığını kontrol et
            check_query = """
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = $1
                )
            """
            exists = await self.source_pool.fetchval(check_query, source_table)

            if not exists:
                # csv_ olmadan da dene
                exists = await self.source_pool.fetchval(check_query, table_name)
                if exists:
                    source_table = table_name

            if not exists:
                logger.warning(f"Source table not found for orphan check: {table_name}")
                return result

            # Orphan kayıtları bul
            orphan_query = f"""
                SELECT ue.id, ue.source_id, ue.source_name, ue.created_at
                FROM unified_embeddings ue
                WHERE (ue.source_table = $1 OR ue.metadata->>'table' = $1)
                AND NOT EXISTS (
                    SELECT 1 FROM "{source_table}" src
                    WHERE src.{pk} = ue.source_id
                )
                LIMIT $2
            """
            orphans = await self.system_pool.fetch(orphan_query, table_name, limit)
            result["orphans_found"] = len(orphans)

            # Sample kaydet
            for orphan in orphans[:10]:
                result["sample_orphans"].append({
                    "id": orphan['id'],
                    "source_id": orphan['source_id'],
                    "source_name": orphan['source_name'],
                    "created_at": orphan['created_at'].isoformat() if orphan['created_at'] else None
                })

            if not dry_run and orphans:
                orphan_ids = [o['id'] for o in orphans]
                delete_query = """
                    DELETE FROM unified_embeddings
                    WHERE id = ANY($1)
                """
                await self.system_pool.execute(delete_query, orphan_ids)
                result["deleted_count"] = len(orphan_ids)

            return result

        except Exception as e:
            logger.error(f"Error deleting orphans: {e}")
            raise

    async def delete_duplicates(
        self,
        table_name: str,
        dry_run: bool = True,
        keep: str = 'newest'  # 'newest' or 'oldest'
    ) -> Dict[str, Any]:
        """
        Duplicate kayıtları sil (content_hash bazlı)

        Args:
            table_name: Tablo adı
            dry_run: True ise silmez
            keep: 'newest' = en yeni kaydı tut, 'oldest' = en eski kaydı tut
        """
        logger.info(f"Deleting duplicates for {table_name} (dry_run={dry_run}, keep={keep})")

        result = {
            "table": table_name,
            "duplicates_found": 0,
            "deleted_count": 0,
            "dry_run": dry_run,
            "sample_duplicates": []
        }

        try:
            order = "DESC" if keep == 'newest' else "ASC"

            # Duplicate gruplarını bul
            dup_query = f"""
                WITH duplicates AS (
                    SELECT
                        content_hash,
                        array_agg(id ORDER BY created_at {order}) as ids,
                        COUNT(*) as cnt
                    FROM unified_embeddings
                    WHERE (source_table = $1 OR metadata->>'table' = $1)
                    AND content_hash IS NOT NULL
                    GROUP BY content_hash
                    HAVING COUNT(*) > 1
                )
                SELECT
                    content_hash,
                    ids[1] as keep_id,
                    ids[2:] as delete_ids,
                    cnt
                FROM duplicates
            """
            duplicates = await self.system_pool.fetch(dup_query, table_name)

            all_delete_ids = []
            for dup in duplicates:
                result["duplicates_found"] += len(dup['delete_ids'])
                all_delete_ids.extend(dup['delete_ids'])

                if len(result["sample_duplicates"]) < 5:
                    result["sample_duplicates"].append({
                        "content_hash": dup['content_hash'][:16] + "...",
                        "keep_id": dup['keep_id'],
                        "delete_ids": dup['delete_ids'][:3],
                        "total_copies": dup['cnt']
                    })

            if not dry_run and all_delete_ids:
                delete_query = """
                    DELETE FROM unified_embeddings
                    WHERE id = ANY($1)
                """
                await self.system_pool.execute(delete_query, all_delete_ids)
                result["deleted_count"] = len(all_delete_ids)

            return result

        except Exception as e:
            logger.error(f"Error deleting duplicates: {e}")
            raise

    def _generate_recommendations(
        self,
        total: HealthMetrics,
        tables: Dict[str, Dict]
    ) -> List[str]:
        """Sağlık raporuna göre öneriler üret"""
        recommendations = []

        if total.health_score < 80:
            recommendations.append(
                f"⚠️ Genel sağlık skoru düşük ({total.health_score:.1f}%). "
                "Veri temizliği önerilir."
            )

        if total.orphan_count > 0:
            recommendations.append(
                f"🗑️ {total.orphan_count} orphan kayıt bulundu. "
                "delete_orphans() ile temizlenebilir."
            )

        if total.missing_metadata_count > 0:
            recommendations.append(
                f"📝 {total.missing_metadata_count} kayıtta metadata eksik. "
                "fix_missing_metadata() ile düzeltilebilir."
            )

        if total.duplicate_count > 0:
            recommendations.append(
                f"🔄 {total.duplicate_count} duplicate kayıt bulundu. "
                "delete_duplicates() ile temizlenebilir."
            )

        # Tablo bazlı öneriler
        for table_name, metrics in tables.items():
            if metrics['health_score'] < 50:
                recommendations.append(
                    f"🔴 {table_name} tablosu kritik durumda "
                    f"(skor: {metrics['health_score']:.1f}%). "
                    "Öncelikli temizlik gerekli."
                )

        if not recommendations:
            recommendations.append("✅ Veri sağlığı iyi durumda!")

        return recommendations
