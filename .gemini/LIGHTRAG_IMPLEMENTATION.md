# 🚀 ASB LightRAG Integration Plan

## 📋 Gemini için Görevler

### Step 1: Graph Database Schema Oluştur

```sql
-- backend/migrations/001_create_graph_schema.sql

-- Create graph schema
CREATE SCHEMA IF NOT EXISTS lightrag;

-- Entities table (varlıklar)
CREATE TABLE IF NOT EXISTS lightrag.entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id VARCHAR(255) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type VARCHAR(50) NOT NULL, -- person, organization, law, date, concept
  metadata JSONB DEFAULT '{}',
  embedding vector(1536),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Relationships table (ilişkiler)
CREATE TABLE IF NOT EXISTS lightrag.relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity_id VARCHAR(255) REFERENCES lightrag.entities(entity_id),
  target_entity_id VARCHAR(255) REFERENCES lightrag.entities(entity_id),
  relationship_type VARCHAR(100) NOT NULL,
  weight FLOAT DEFAULT 1.0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Entity-Document associations
CREATE TABLE IF NOT EXISTS lightrag.entity_documents (
  entity_id VARCHAR(255) REFERENCES lightrag.entities(entity_id),
  document_id BIGINT,
  relevance_score FLOAT DEFAULT 1.0,
  positions JSONB, -- where entity appears in document
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (entity_id, document_id)
);

-- Create indexes
CREATE INDEX idx_entities_type ON lightrag.entities(type);
CREATE INDEX idx_entities_name ON lightrag.entities(name);
CREATE INDEX idx_entities_embedding ON lightrag.entities USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_relationships_source ON lightrag.relationships(source_entity_id);
CREATE INDEX idx_relationships_target ON lightrag.relationships(target_entity_id);
CREATE INDEX idx_entity_docs_doc ON lightrag.entity_documents(document_id);
```

### Step 2: Entity Extraction Service

```typescript
// backend/src/services/lightrag/entity-extraction.service.ts

import { Pool } from 'pg';
import { OpenAI } from 'openai';
import { v4 as uuidv4 } from 'uuid';

export class EntityExtractionService {
  constructor(
    private pool: Pool,
    private openai: OpenAI
  ) {}

  /**
   * Extract entities from document using GPT
   */
  async extractEntitiesFromDocument(docId: string, text: string, title: string) {
    const chunks = this.chunkText(text, 2000);
    const allEntities = new Map();
    const allRelationships = [];

    for (const chunk of chunks) {
      const result = await this.extractEntitiesFromChunk(chunk);
      
      // Merge entities
      result.entities.forEach(entity => {
        const key = `${entity.type}:${entity.name}`;
        if (!allEntities.has(key)) {
          allEntities.set(key, {
            ...entity,
            entity_id: this.generateEntityId(entity.type, entity.name)
          });
        }
      });

      // Collect relationships
      allRelationships.push(...result.relationships);
    }

    // Save to database
    await this.saveEntitiesAndRelationships(
      Array.from(allEntities.values()),
      allRelationships,
      docId
    );

    return {
      entityCount: allEntities.size,
      relationshipCount: allRelationships.length
    };
  }

  private async extractEntitiesFromChunk(text: string) {
    const prompt = `
Aşağıdaki Türkçe hukuki metinden önemli varlıkları ve ilişkileri çıkar.

Varlık türleri:
- person: Kişi isimleri
- organization: Kurum, bakanlık, şirket isimleri
- law: Kanun, yönetmelik, tebliğ, özelge numaraları
- date: Tarihler
- concept: Hukuki kavramlar (KDV, vergi, muafiyet vb.)

Metin:
${text}

Yanıt formatı (JSON):
{
  "entities": [
    {"name": "Maliye Bakanlığı", "type": "organization"},
    {"name": "KDV", "type": "concept"},
    {"name": "26659", "type": "law"}
  ],
  "relationships": [
    {"source": "Maliye Bakanlığı", "target": "26659", "type": "yayımladı"},
    {"source": "26659", "target": "KDV", "type": "ilgili"}
  ]
}
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo-1106',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3
      });

      return JSON.parse(response.choices[0].message.content || '{}');
    } catch (error) {
      console.error('Entity extraction error:', error);
      return { entities: [], relationships: [] };
    }
  }

  private async saveEntitiesAndRelationships(
    entities: any[],
    relationships: any[],
    documentId: string
  ) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Insert entities
      for (const entity of entities) {
        // Generate embedding for entity name
        const embedding = await this.generateEmbedding(entity.name);
        
        await client.query(`
          INSERT INTO lightrag.entities (entity_id, name, type, metadata, embedding)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (entity_id) DO UPDATE
          SET metadata = lightrag.entities.metadata || $4,
              updated_at = NOW()
        `, [
          entity.entity_id,
          entity.name,
          entity.type,
          JSON.stringify(entity),
          JSON.stringify(embedding)
        ]);

        // Link to document
        await client.query(`
          INSERT INTO lightrag.entity_documents (entity_id, document_id, relevance_score)
          VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING
        `, [entity.entity_id, documentId, 1.0]);
      }

      // Insert relationships
      for (const rel of relationships) {
        const sourceId = this.generateEntityId('', rel.source);
        const targetId = this.generateEntityId('', rel.target);
        
        await client.query(`
          INSERT INTO lightrag.relationships (source_entity_id, target_entity_id, relationship_type)
          VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING
        `, [sourceId, targetId, rel.type]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private generateEntityId(type: string, name: string): string {
    return `${type}:${name}`.toLowerCase().replace(/\s+/g, '_');
  }

  private chunkText(text: string, chunkSize: number): string[] {
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text
      });
      return response.data[0].embedding;
    } catch (error) {
      return new Array(1536).fill(0);
    }
  }
}
```

### Step 3: Graph Query Service

```typescript
// backend/src/services/lightrag/graph-query.service.ts

export class GraphQueryService {
  constructor(private pool: Pool) {}

  /**
   * Find entities and their relationships for a query
   */
  async queryGraph(query: string, depth: number = 2) {
    // Extract entities from query
    const queryEntities = await this.findEntitiesInQuery(query);
    
    if (queryEntities.length === 0) {
      return { nodes: [], links: [], documents: [] };
    }

    // Get related entities up to specified depth
    const graphData = await this.traverseGraph(queryEntities, depth);
    
    // Get relevant documents
    const documents = await this.getDocumentsForEntities(graphData.nodes);
    
    return {
      ...graphData,
      documents
    };
  }

  private async findEntitiesInQuery(query: string): Promise<string[]> {
    const result = await this.pool.query(`
      SELECT entity_id, name, type
      FROM lightrag.entities
      WHERE name ILIKE ANY(ARRAY[
        $1,
        '%' || $1 || '%'
      ])
      OR EXISTS (
        SELECT 1 FROM lightrag.entities e2
        WHERE e2.embedding <=> (
          SELECT embedding FROM lightrag.entities 
          WHERE name ILIKE '%' || $1 || '%' 
          LIMIT 1
        ) < 0.5
      )
      ORDER BY 
        CASE 
          WHEN name ILIKE $1 THEN 0
          WHEN name ILIKE '%' || $1 || '%' THEN 1
          ELSE 2
        END
      LIMIT 5
    `, [query]);

    return result.rows.map(r => r.entity_id);
  }

  private async traverseGraph(startEntities: string[], maxDepth: number) {
    const query = `
      WITH RECURSIVE graph_traversal AS (
        -- Starting nodes
        SELECT 
          e.entity_id,
          e.name,
          e.type,
          e.metadata,
          0 as depth,
          ARRAY[e.entity_id] as path
        FROM lightrag.entities e
        WHERE e.entity_id = ANY($1)
        
        UNION
        
        -- Traverse relationships
        SELECT 
          e2.entity_id,
          e2.name,
          e2.type,
          e2.metadata,
          gt.depth + 1,
          gt.path || e2.entity_id
        FROM graph_traversal gt
        JOIN lightrag.relationships r ON (
          gt.entity_id = r.source_entity_id OR 
          gt.entity_id = r.target_entity_id
        )
        JOIN lightrag.entities e2 ON (
          (r.source_entity_id = gt.entity_id AND r.target_entity_id = e2.entity_id) OR
          (r.target_entity_id = gt.entity_id AND r.source_entity_id = e2.entity_id)
        )
        WHERE gt.depth < $2
          AND NOT (e2.entity_id = ANY(gt.path))
      ),
      all_relationships AS (
        SELECT DISTINCT
          r.source_entity_id,
          r.target_entity_id,
          r.relationship_type
        FROM lightrag.relationships r
        WHERE r.source_entity_id IN (SELECT entity_id FROM graph_traversal)
          OR r.target_entity_id IN (SELECT entity_id FROM graph_traversal)
      )
      SELECT 
        json_build_object(
          'nodes', json_agg(DISTINCT jsonb_build_object(
            'id', gt.entity_id,
            'name', gt.name,
            'type', gt.type,
            'depth', gt.depth
          )),
          'links', (
            SELECT json_agg(jsonb_build_object(
              'source', ar.source_entity_id,
              'target', ar.target_entity_id,
              'type', ar.relationship_type
            ))
            FROM all_relationships ar
          )
        ) as graph_data
      FROM graph_traversal gt
    `;

    const result = await this.pool.query(query, [startEntities, maxDepth]);
    return result.rows[0]?.graph_data || { nodes: [], links: [] };
  }

  private async getDocumentsForEntities(nodes: any[]) {
    const entityIds = nodes.map(n => n.id);
    
    const query = `
      SELECT DISTINCT
        d.id,
        d.title,
        d.source_table,
        LEFT(d.text, 300) as excerpt,
        array_agg(DISTINCT e.name) as related_entities
      FROM lightrag.entity_documents ed
      JOIN rag_data.documents d ON d.id = ed.document_id
      JOIN lightrag.entities e ON e.entity_id = ed.entity_id
      WHERE ed.entity_id = ANY($1)
      GROUP BY d.id, d.title, d.source_table, d.text
      ORDER BY COUNT(DISTINCT ed.entity_id) DESC
      LIMIT 10
    `;

    const result = await this.pool.query(query, [entityIds]);
    return result.rows;
  }
}
```

### Step 4: API Routes

```typescript
// backend/src/routes/lightrag.routes.ts

import { Router } from 'express';
import { entityExtraction, graphQuery } from '../services/lightrag';

const router = Router();

// Extract entities from all documents
router.post('/api/v2/lightrag/extract-all', async (req, res) => {
  try {
    const documents = await db.query('SELECT id, title, text FROM rag_data.documents LIMIT 100');
    
    let totalEntities = 0;
    let totalRelationships = 0;
    
    for (const doc of documents.rows) {
      const result = await entityExtraction.extractEntitiesFromDocument(
        doc.id,
        doc.text,
        doc.title
      );
      totalEntities += result.entityCount;
      totalRelationships += result.relationshipCount;
    }
    
    res.json({
      processedDocuments: documents.rows.length,
      totalEntities,
      totalRelationships
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Query with graph
router.post('/api/v2/lightrag/query', async (req, res) => {
  try {
    const { query, depth = 2 } = req.body;
    const graphData = await graphQuery.queryGraph(query, depth);
    
    res.json(graphData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get entity details
router.get('/api/v2/lightrag/entity/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const entity = await db.query(
      'SELECT * FROM lightrag.entities WHERE entity_id = $1',
      [id]
    );
    
    const relationships = await db.query(`
      SELECT * FROM lightrag.relationships 
      WHERE source_entity_id = $1 OR target_entity_id = $1
    `, [id]);
    
    res.json({
      entity: entity.rows[0],
      relationships: relationships.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

### Step 5: Migration Script

```typescript
// backend/scripts/migrate-to-lightrag.ts

async function migratToLightRAG() {
  console.log('🚀 Starting LightRAG migration...');
  
  // 1. Create schema
  await db.query(fs.readFileSync('migrations/001_create_graph_schema.sql', 'utf8'));
  
  // 2. Process documents in batches
  const batchSize = 10;
  let offset = 0;
  
  while (true) {
    const docs = await db.query(
      'SELECT id, title, text FROM rag_data.documents ORDER BY id LIMIT $1 OFFSET $2',
      [batchSize, offset]
    );
    
    if (docs.rows.length === 0) break;
    
    for (const doc of docs.rows) {
      console.log(`Processing document ${doc.id}: ${doc.title}`);
      await entityExtraction.extractEntitiesFromDocument(doc.id, doc.text, doc.title);
    }
    
    offset += batchSize;
  }
  
  console.log('✅ Migration complete!');
}

// Run: npm run migrate:lightrag
```

## 📋 Gemini İçin Adım Adım Görevler

1. **Schema Oluştur** (30 dk)
   ```bash
   cd backend
   psql $DATABASE_URL < migrations/001_create_graph_schema.sql
   ```

2. **Services Oluştur** (2 saat)
   - entity-extraction.service.ts
   - graph-query.service.ts

3. **API Routes Ekle** (1 saat)
   - /api/v2/lightrag/extract-all
   - /api/v2/lightrag/query
   - /api/v2/lightrag/entity/:id

4. **Migration Script** (30 dk)
   - Mevcut dökümanlardan entity çıkar

5. **Test** (1 saat)
   - Entity extraction test et
   - Graph query test et

## 🎯 Beklenen Sonuç

```bash
# Test query
curl -X POST http://localhost:8080/api/v2/lightrag/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Maliye Bakanlığı", "depth": 2}'

# Response
{
  "nodes": [
    {"id": "organization:maliye_bakanlığı", "name": "Maliye Bakanlığı", "type": "organization"},
    {"id": "law:26659", "name": "26659", "type": "law"},
    {"id": "concept:kdv", "name": "KDV", "type": "concept"}
  ],
  "links": [
    {"source": "organization:maliye_bakanlığı", "target": "law:26659", "type": "yayımladı"},
    {"source": "law:26659", "target": "concept:kdv", "type": "ilgili"}
  ],
  "documents": [
    {"id": "26659", "title": "Aktife arsa olarak...", "related_entities": ["Maliye Bakanlığı", "KDV"]}
  ]
}
```

Bu şekilde Python LightRAG yerine Node.js'de kendi LightRAG implementasyonumuzu yapabiliriz!
