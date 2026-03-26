import os
import asyncio
from typing import Any, Dict, List, Optional
from neo4j import AsyncGraphDatabase
from loguru import logger

class Neo4jService:
    """
    Neo4j Service for Knowledge Graph management.
    Connects to Neo4j and provides methods for creating nodes and relationships.
    """
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(Neo4jService, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if hasattr(self, '_initialized') and self._initialized:
            return
            
        self.uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.user = os.getenv("NEO4J_USER", "neo4j")
        self.password = os.getenv("NEO4J_PASSWORD", "password")
        self.driver = None
        self._initialized = True

    async def connect(self):
        """Establish connection to Neo4j."""
        if not self.driver:
            try:
                self.driver = AsyncGraphDatabase.driver(self.uri, auth=(self.user, self.password))
                # Test connection
                await self.driver.verify_connectivity()
                logger.info(f"Successfully connected to Neo4j at {self.uri}")
            except Exception as e:
                logger.error(f"Failed to connect to Neo4j: {e}")
                self.driver = None

    async def close(self):
        """Close Neo4j connection."""
        if self.driver:
            await self.driver.close()
            self.driver = None

    async def run_query(self, query: str, parameters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Run a Cypher query and return results."""
        if not self.driver:
            await self.connect()
            if not self.driver:
                return []

        try:
            async with self.driver.session() as session:
                result = await session.run(query, parameters or {})
                records = await result.data()
                return records
        except Exception as e:
            logger.error(f"Neo4j Query Error: {e}\nQuery: {query}")
            return []

    # ─────────────────────────────────────────────────────────────────
    # Domain Specific Methods (Knowledge Graph Ingestion)
    # ─────────────────────────────────────────────────────────────────

    async def upsert_chunk_node(self, workspace_id: str, chunk_id: int, content: str, metadata: Dict[str, Any]):
        """Create or update a Document Chunk node tied to a workspace."""
        query = """
        MERGE (c:Chunk {id: $chunk_id, workspace_id: $workspace_id})
        SET c.content = $content,
            c.law_code = $law_code,
            c.article_number = $article_number,
            c.source_table = $source_table,
            c.updated_at = datetime()
        WITH c
        // Link to Law node if present
        FOREACH (dummy IN CASE WHEN $law_code IS NOT NULL THEN [1] ELSE [] END |
            MERGE (l:Law {code: $law_code, workspace_id: $workspace_id})
            MERGE (c)-[:PART_OF]->(l)
        )
        RETURN c
        """
        params = {
            "workspace_id": workspace_id,
            "chunk_id": chunk_id,
            "content": content[:2000], 
            "law_code": metadata.get("law_code"),
            "article_number": metadata.get("article_number"),
            "source_table": metadata.get("source_table")
        }
        await self.run_query(query, params)

    async def add_relationship(
        self, 
        workspace_id: str,
        source_id: int, 
        target_id: Optional[int], 
        rel_type: str, 
        target_ref: str,
        target_law: Optional[str] = None,
        target_article: Optional[str] = None
    ):
        """Create a relationship between chunks or a chunk and a reference, scoped by workspace."""
        safe_rel_type = rel_type.upper().replace(" ", "_")
        
        if target_id:
            # Relationship between two known chunks in same workspace
            query = f"""
            MATCH (s:Chunk {{id: $source_id, workspace_id: $workspace_id}})
            MATCH (t:Chunk {{id: $target_id, workspace_id: $workspace_id}})
            MERGE (s)-[r:{safe_rel_type}]->(t)
            SET r.extracted_at = datetime()
            """
            await self.run_query(query, {
                "workspace_id": workspace_id, 
                "source_id": source_id, 
                "target_id": target_id
            })
        else:
            # Relationship to an external reference in same workspace
            query = f"""
            MATCH (s:Chunk {{id: $source_id, workspace_id: $workspace_id}})
            MERGE (ref:Reference {{name: $target_ref, workspace_id: $workspace_id}})
            SET ref.law_code = $target_law,
                ref.article_number = $target_article
            MERGE (s)-[r:{safe_rel_type}]->(ref)
            SET r.extracted_at = datetime()
            """
            await self.run_query(query, {
                "workspace_id": workspace_id,
                "source_id": source_id, 
                "target_ref": target_ref,
                "target_law": target_law,
                "target_article": target_article
            })

    async def add_entity(self, workspace_id: str, chunk_id: int, entity_type: str, entity_value: str):
        """Link a chunk to an entity node, scoped by workspace."""
        label_map = {
            "law_code": "Law",
            "article_number": "Article",
            "institution": "Institution",
            "date": "Date",
            "rate": "Rate",
            "penalty": "Penalty",
            "concept": "Concept"
        }
        label = label_map.get(entity_type.lower(), entity_type.capitalize())
        
        query = f"""
        MATCH (c:Chunk {{id: $chunk_id, workspace_id: $workspace_id}})
        MERGE (e:{label} {{name: $entity_value, workspace_id: $workspace_id}})
        MERGE (c)-[:MENTIONS]->(e)
        """
        await self.run_query(query, {
            "workspace_id": workspace_id, 
            "chunk_id": chunk_id, 
            "entity_value": entity_value
        })

    async def resolve_references(self, workspace_id: str):
        """
        Heuristic-based reference resolution.
        Finds 'Reference' nodes that match actual 'Chunk' nodes by law_code and article_number
        and creates a direct link, then cleans up the Reference node if needed.
        """
        query = """
        MATCH (ref:Reference {workspace_id: $workspace_id})
        WHERE ref.law_code IS NOT NULL AND ref.article_number IS NOT NULL
        MATCH (target:Chunk {workspace_id: $workspace_id, law_code: ref.law_code, article_number: ref.article_number})
        MATCH (source:Chunk {workspace_id: $workspace_id})-[rel]->(ref)
        
        // Create relationship between source and actual target
        CALL apoc.merge.relationship(source, type(rel), {}, {extracted_at: datetime()}, target) YIELD rel as newRel
        
        // Mark as resolved or delete Reference node if no more refs
        DETACH DELETE ref
        RETURN count(newRel) as resolved_count
        """
        # Note: Requires APOC for dynamic relationship types, fallback if not available
        try:
            result = await self.run_query(query, {"workspace_id": workspace_id})
            logger.info(f"🕸️ Knowledge Graph: Resolved {result[0].get('resolved_count', 0) if result else 0} references in workspace {workspace_id}")
        except Exception as e:
            logger.warning(f"🕸️ Knowledge Graph: Resolution failed (possibly missing APOC): {e}")
            # Fallback for standard Cypher (hardcoded relationship types or multiple runs)
            fallback_query = """
            MATCH (source:Chunk {workspace_id: $workspace_id})-[r:REFERENCES]->(ref:Reference {workspace_id: $workspace_id})
            MATCH (target:Chunk {workspace_id: $workspace_id, law_code: ref.law_code, article_number: ref.article_number})
            MERGE (source)-[newRel:REFERENCES]->(target)
            SET newRel.extracted_at = datetime()
            DETACH DELETE ref
            RETURN count(newRel) as resolved_count
            """
            result = await self.run_query(fallback_query, {"workspace_id": workspace_id})
            logger.info(f"🕸️ Knowledge Graph: Fallback resolved {result[0].get('resolved_count', 0) if result else 0} references")

    async def cleanup_deleted_chunks(self, workspace_id: str, chunk_ids: List[int]):
        """
        Remove chunks from Neo4j that have been deleted from PostgreSQL.
        """
        if not self.driver:
            logger.warning("Neo4j driver not initialized, skipping cleanup")
            return

        try:
            query = """
            MATCH (c:Chunk)
            WHERE c.id IN $chunk_ids
              AND c.workspace_id = $workspace_id
            DETACH DELETE c
            """
            await self.run_query(query, {"chunk_ids": chunk_ids, "workspace_id": workspace_id})
            logger.info(f"🗑️ Neo4j cleanup: Deleted {len(chunk_ids)} chunks for workspace {workspace_id}")
        except Exception as e:
            logger.error(f"❌ Neo4j cleanup failed: {e}")

    async def cleanup_orphaned_nodes(self, workspace_id: str):
        """
        Remove orphaned chunk nodes from Neo4j.
        Orphaned nodes are chunks that are not connected to any Document node.
        
        Args:
            workspace_id: Workspace ID for filtering
        """
        if not self.driver:
            logger.warning("Neo4j driver not initialized, skipping orphaned node cleanup")
            return

        try:
            query = """
            MATCH (c:Chunk {workspace_id: $workspace_id})
            WHERE NOT EXISTS {
                MATCH (c)<-[:BELONGS_TO]-(d:Document)
            }
            DETACH DELETE c
            """
            result = await self.run_query(query, {"workspace_id": workspace_id})
            deleted_count = result[0].get('deleted_count', 0) if result else 0
            logger.info(f"🗑️ Neo4j orphaned nodes cleanup: Deleted {deleted_count} orphaned chunks for workspace {workspace_id}")
            return deleted_count
        except Exception as e:
            logger.error(f"❌ Neo4j orphaned nodes cleanup failed: {e}")
            return 0

    async def calculate_page_rank(self, workspace_id: str, damping_factor: float = 0.85, iterations: int = 20):
        """
        Calculate PageRank for chunks in the workspace.
        This helps identify central/most-cited chunks for prioritization in search results.
        
        Args:
            workspace_id: Workspace ID for filtering
            damping_factor: Damping factor for PageRank algorithm (default: 0.85)
            iterations: Number of iterations for PageRank calculation (default: 20)
        """
        if not self.driver:
            logger.warning("Neo4j driver not initialized, skipping PageRank calculation")
            return

        try:
            query = """
            MATCH (c:Chunk {workspace_id: $workspace_id})
            WITH c, count(DISTINCT (c)<-[:REFERENCES]->()) AS in_degree
            WITH c, in_degree, 1.0 AS rank
            CALL apoc.algo.pageRank(c, 'REFERENCES', $damping_factor, $iterations)
            YIELD node, score
            SET node.page_rank = score
            RETURN count(node) AS nodes_with_rank
            """
            result = await self.run_query(query, {
                "workspace_id": workspace_id,
                "damping_factor": damping_factor,
                "iterations": iterations
            })
            nodes_count = result[0].get('nodes_with_rank', 0) if result else 0
            logger.info(f"📊 Neo4j PageRank: Calculated PageRank for {nodes_count} chunks in workspace {workspace_id}")
            return nodes_count
        except Exception as e:
            logger.error(f"❌ Neo4j PageRank calculation failed: {e}")
            return 0

    async def get_chunk_with_context(
        self,
        workspace_id: str,
        chunk_id: int,
        max_hops: int = 2
    ) -> Dict[str, Any]:
        """
        Get a chunk and its context (related chunks) from Neo4j.
        Uses Redis caching for performance.
        
        Args:
            workspace_id: Workspace ID for filtering
            chunk_id: Chunk ID to retrieve
            max_hops: Maximum number of hops for related chunks (default: 2)
        
        Returns:
            Dictionary containing chunk and related chunks
        """
        if not self.driver:
            logger.warning("Neo4j driver not initialized, skipping chunk context retrieval")
            return {"chunk": None, "related_chunks": []}
        
        # Check cache
        cache_key = f"neo4j:chunk:{workspace_id}:{chunk_id}:hops{max_hops}"
        cached = await cache_get(cache_key)
        if cached:
            return json.loads(cached)
        
        try:
            query = f"""
            MATCH (c:Chunk {{id: $chunk_id, workspace_id: $workspace_id}})
            WITH c
            MATCH (c)-[r*1..{max_hops}]->(related)
            RETURN c, collect(DISTINCT related) AS related_chunks
            """
            result = await self.run_query(query, {"chunk_id": chunk_id, "workspace_id": workspace_id})
            
            if not result:
                return {"chunk": None, "related_chunks": []}
            
            chunk_data = result[0]
            response = {
                "chunk": chunk_data.get('c'),
                "related_chunks": chunk_data.get('related_chunks', [])
            }
            
            # Cache result for 5 minutes
            await cache_set(cache_key, json.dumps(response), ttl=300)
            
            return response
        except Exception as e:
            logger.error(f"❌ Neo4j chunk context retrieval failed: {e}")
            return {"chunk": None, "related_chunks": []}

    async def get_workspace_statistics(self, workspace_id: str) -> Dict[str, Any]:
        """
        Get statistics about the knowledge graph for a workspace.
        
        Args:
            workspace_id: Workspace ID for filtering
        
        Returns:
            Dictionary containing various statistics
        """
        if not self.driver:
            logger.warning("Neo4j driver not initialized, skipping workspace statistics")
            return {}
        
        try:
            query = """
            MATCH (c:Chunk {workspace_id: $workspace_id})
            WITH c
            MATCH (c)-[r]->(related)
            RETURN
                count(DISTINCT c) AS total_chunks,
                count(DISTINCT r) AS total_relationships,
                count(DISTINCT (c)<-[:REFERENCES]->()) AS total_references,
                count(DISTINCT (c)<-[:AMENDS]->()) AS total_amends,
                count(DISTINCT (c)<-[:PARENT_OF]->()) AS total_parent_of
            """
            result = await self.run_query(query, {"workspace_id": workspace_id})
            
            if not result:
                return {}
            
            stats = result[0]
            return {
                "workspace_id": workspace_id,
                "total_chunks": stats.get('total_chunks', 0),
                "total_relationships": stats.get('total_relationships', 0),
                "total_references": stats.get('total_references', 0),
                "total_amends": stats.get('total_amends', 0),
                "total_parent_of": stats.get('total_parent_of', 0)
            }
        except Exception as e:
            logger.error(f"❌ Neo4j workspace statistics failed: {e}")
            return {}

# Global singleton
neo4j_service = Neo4jService()
