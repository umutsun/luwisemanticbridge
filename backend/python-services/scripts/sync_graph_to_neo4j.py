import asyncio
import json
import os
import sys
from typing import List, Dict, Any

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.database import get_db
from services.neo4j_service import neo4j_service
from loguru import logger

async def sync_postgresql_to_neo4j():
    """
    Migration script to sync chunks, entities and relationships from PostgreSQL to Neo4j.
    """
    logger.info("🚀 Starting Knowledge Graph Sync: PostgreSQL -> Neo4j")
    
    pool = await get_db()
    await neo4j_service.connect()
    
    workspace_id = os.getenv("TENANT_ID", "default")
    logger.info(f"🔑 Using Workspace ID: {workspace_id}")
    
    if not neo4j_service.driver:
        logger.error("❌ Could not connect to Neo4j. Aborting sync.")
        return

    # 1. Sync Chunks (Nodes)
    logger.info("📦 Step 1: Syncing Chunks...")
    chunk_rows = await pool.fetch("""
        SELECT id, content, metadata, source_table, source_type 
        FROM unified_embeddings 
        WHERE content IS NOT NULL AND content != ''
    """)
    
    for i, row in enumerate(chunk_rows):
        metadata = json.loads(row['metadata']) if row['metadata'] else {}
        metadata['source_table'] = row['source_table']
        # Add workspace_id from metadata if present, else use env
        node_workspace = metadata.get("workspace_id") or workspace_id
        await neo4j_service.upsert_chunk_node(node_workspace, row['id'], row['content'], metadata)
        if (i + 1) % 100 == 0:
            logger.info(f"  Processed {i+1}/{len(chunk_rows)} chunks")

    # 2. Sync Entities
    logger.info("🏷️ Step 2: Syncing Entities...")
    entity_rows = await pool.fetch("SELECT chunk_id, entity_type, entity_value FROM chunk_entities")
    for i, row in enumerate(entity_rows):
        await neo4j_service.add_entity(workspace_id, row['chunk_id'], row['entity_type'], row['entity_value'])
        if (i + 1) % 500 == 0:
            logger.info(f"  Processed {i+1}/{len(entity_rows)} entities")

    # 3. Sync Relationships
    logger.info("🕸️ Step 3: Syncing Relationships...")
    rel_rows = await pool.fetch("""
        SELECT source_chunk_id, target_chunk_id, relationship_type, target_reference, 
               target_law_code, target_article_number 
        FROM chunk_relationships
    """)
    for i, row in enumerate(rel_rows):
        await neo4j_service.add_relationship(
            workspace_id=workspace_id,
            source_id=row['source_chunk_id'],
            target_id=row['target_chunk_id'],
            rel_type=row['relationship_type'],
            target_ref=row['target_reference'] or "",
            target_law=row['target_law_code'],
            target_article=row['target_article_number']
        )
        if (i + 1) % 100 == 0:
            logger.info(f"  Processed {i+1}/{len(rel_rows)} relationships")

    logger.info("✅ Knowledge Graph Sync Completed Successfully!")
    await neo4j_service.close()

if __name__ == "__main__":
    asyncio.run(sync_postgresql_to_neo4j())
