import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database';
import { authenticateToken } from '../middleware/auth.middleware';

const router = express.Router();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Create translation_embeddings table
router.post('/create-table', authenticateToken, async (req, res) => {
  try {
    const { tableName = 'translation_embeddings' } = req.body;

    // Create the table with pgvector extension
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_text TEXT NOT NULL,
        translated_text TEXT NOT NULL,
        source_language VARCHAR(10) NOT NULL,
        target_language VARCHAR(10) NOT NULL,
        translation_provider VARCHAR(50) NOT NULL,
        embedding vector(1536),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_${tableName}_source_lang ON ${tableName}(source_language);
      CREATE INDEX IF NOT EXISTS idx_${tableName}_target_lang ON ${tableName}(target_language);
      CREATE INDEX IF NOT EXISTS idx_${tableName}_provider ON ${tableName}(translation_provider);
      CREATE INDEX IF NOT EXISTS idx_${tableName}_created_at ON ${tableName}(created_at DESC);

      -- Create vector index for similarity search
      CREATE INDEX IF NOT EXISTS idx_${tableName}_embedding_cosine ON ${tableName}
      USING ivfflat (embedding vector_cosine_ops);
    `;

    const { error } = await supabase.rpc('execute_sql', { sql: createTableSQL });

    if (error) {
      console.error('Table creation error:', error);
      return res.status(500).json({
        error: 'Failed to create translation_embeddings table',
        details: error.message
      });
    }

    res.json({
      message: 'Translation embeddings table created successfully',
      tableName
    });

  } catch (error: any) {
    console.error('Create table error:', error);
    res.status(500).json({
      error: 'Failed to create table',
      details: error.message
    });
  }
});

// Store translation with embedding
router.post('/store', authenticateToken, async (req, res) => {
  try {
    const {
      sourceText,
      translatedText,
      sourceLanguage,
      targetLanguage,
      provider,
      embedding,
      metadata = {}
    } = req.body;

    if (!sourceText || !translatedText || !sourceLanguage || !targetLanguage || !provider) {
      return res.status(400).json({
        error: 'Missing required fields: sourceText, translatedText, sourceLanguage, targetLanguage, provider'
      });
    }

    const tableName = 'translation_embeddings';

    // Insert translation with embedding
    const { data, error } = await supabase
      .from(tableName)
      .insert({
        source_text: sourceText,
        translated_text: translatedText,
        source_language: sourceLanguage,
        target_language: targetLanguage,
        translation_provider: provider,
        embedding: embedding || null,
        metadata: {
          ...metadata,
          created_by: req.user?.id,
          created_at: new Date().toISOString()
        }
      })
      .select()
      .single();

    if (error) {
      console.error('Store translation error:', error);
      return res.status(500).json({
        error: 'Failed to store translation',
        details: error.message
      });
    }

    res.json({
      message: 'Translation stored successfully',
      translation: data
    });

  } catch (error: any) {
    console.error('Store translation error:', error);
    res.status(500).json({
      error: 'Failed to store translation',
      details: error.message
    });
  }
});

// Search similar translations using vector similarity
router.post('/search', authenticateToken, async (req, res) => {
  try {
    const {
      queryEmbedding,
      sourceLanguage,
      targetLanguage,
      limit = 10,
      threshold = 0.7
    } = req.body;

    if (!queryEmbedding) {
      return res.status(400).json({
        error: 'Query embedding is required for vector search'
      });
    }

    const tableName = 'translation_embeddings';

    // Build the search query
    let whereClause = '1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (sourceLanguage) {
      whereClause += ` AND source_language = $${paramIndex++}`;
      params.push(sourceLanguage);
    }

    if (targetLanguage) {
      whereClause += ` AND target_language = $${paramIndex++}`;
      params.push(targetLanguage);
    }

    // Add embedding parameter
    params.push(queryEmbedding);
    const embeddingParam = `$${paramIndex++}`;

    // Vector similarity search query
    const searchQuery = `
      SELECT
        id,
        source_text,
        translated_text,
        source_language,
        target_language,
        translation_provider,
        metadata,
        created_at,
        1 - (embedding <=> ${embeddingParam}) as similarity_score
      FROM ${tableName}
      WHERE ${whereClause}
        AND 1 - (embedding <=> ${embeddingParam}) > $${paramIndex}
      ORDER BY similarity_score DESC
      LIMIT $${paramIndex + 1}
    `;

    params.push(threshold, limit);

    const { data, error } = await supabase.rpc('execute_sql', {
      sql: searchQuery,
      params
    });

    if (error) {
      console.error('Search error:', error);
      return res.status(500).json({
        error: 'Failed to search translations',
        details: error.message
      });
    }

    res.json({
      message: 'Search completed successfully',
      results: data || [],
      count: data?.length || 0
    });

  } catch (error: any) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Failed to search translations',
      details: error.message
    });
  }
});

// Get translation statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const tableName = 'translation_embeddings';

    const statsQuery = `
      SELECT
        COUNT(*) as total_translations,
        COUNT(DISTINCT source_language) as source_languages,
        COUNT(DISTINCT target_language) as target_languages,
        COUNT(DISTINCT translation_provider) as providers,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as embedded_count,
        MAX(created_at) as last_translation,
        source_language,
        target_language
      FROM ${tableName}
      GROUP BY source_language, target_language
    `;

    const { data, error } = await supabase.rpc('execute_sql', { sql: statsQuery });

    if (error) {
      console.error('Stats error:', error);
      return res.status(500).json({
        error: 'Failed to get statistics',
        details: error.message
      });
    }

    const totalTranslations = data?.reduce((sum: number, row: any) => sum + parseInt(row.total_translations), 0) || 0;
    const totalEmbedded = data?.reduce((sum: number, row: any) => sum + parseInt(row.embedded_count), 0) || 0;
    const uniqueSourceLangs = new Set(data?.map((row: any) => row.source_language) || []).size;
    const uniqueTargetLangs = new Set(data?.map((row: any) => row.target_language) || []).size;
    const uniqueProviders = new Set(data?.map((row: any) => row.translation_provider) || []).size;
    const lastTranslation = data?.reduce((latest: string, row: any) =>
      row.last_translation > latest ? row.last_translation : latest, '') || null;

    res.json({
      total_translations: totalTranslations,
      embedded_count: totalEmbedded,
      source_languages: uniqueSourceLangs,
      target_languages: uniqueTargetLangs,
      providers: uniqueProviders,
      last_translation: lastTranslation,
      language_pairs: data || []
    });

  } catch (error: any) {
    console.error('Stats error:', error);
    res.status(500).json({
      error: 'Failed to get statistics',
      details: error.message
    });
  }
});

// Get recent translations
router.get('/recent', authenticateToken, async (req, res) => {
  try {
    const { limit = 20, sourceLanguage, targetLanguage } = req.query;
    const tableName = 'translation_embeddings';

    let whereClause = '1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (sourceLanguage) {
      whereClause += ` AND source_language = $${paramIndex++}`;
      params.push(sourceLanguage);
    }

    if (targetLanguage) {
      whereClause += ` AND target_language = $${paramIndex++}`;
      params.push(targetLanguage);
    }

    params.push(parseInt(limit as string) || 20);

    const recentQuery = `
      SELECT
        id,
        source_text,
        translated_text,
        source_language,
        target_language,
        translation_provider,
        metadata,
        created_at
      FROM ${tableName}
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex}
    `;

    const { data, error } = await supabase.rpc('execute_sql', {
      sql: recentQuery,
      params
    });

    if (error) {
      console.error('Recent translations error:', error);
      return res.status(500).json({
        error: 'Failed to get recent translations',
        details: error.message
      });
    }

    res.json({
      translations: data || [],
      count: data?.length || 0
    });

  } catch (error: any) {
    console.error('Recent translations error:', error);
    res.status(500).json({
      error: 'Failed to get recent translations',
      details: error.message
    });
  }
});

// Delete translation
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const tableName = 'translation_embeddings';

    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Delete translation error:', error);
      return res.status(500).json({
        error: 'Failed to delete translation',
        details: error.message
      });
    }

    res.json({ message: 'Translation deleted successfully' });

  } catch (error: any) {
    console.error('Delete translation error:', error);
    res.status(500).json({
      error: 'Failed to delete translation',
      details: error.message
    });
  }
});

export default router;