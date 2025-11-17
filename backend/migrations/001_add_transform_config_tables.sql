-- ============================================================================
-- TRANSFORM CONFIGURATION TABLES
-- Generic, project-agnostic schema for template-based data transformation
-- ============================================================================

-- Template Table Schemas: Defines database tables for each template
CREATE TABLE IF NOT EXISTS template_table_schemas (
  id SERIAL PRIMARY KEY,
  template_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  schema_definition JSONB NOT NULL,  -- { columns: [], primary_key: [], indexes: [], constraints: [] }
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(template_id, table_name)
);

-- Template Field Mappings: Maps extracted metadata fields to database columns
CREATE TABLE IF NOT EXISTS template_field_mappings (
  id SERIAL PRIMARY KEY,
  template_id TEXT NOT NULL,
  source_field TEXT NOT NULL,        -- Path in extracted_metadata (e.g., "mevzuatNo")
  target_table TEXT NOT NULL,        -- Target table name
  target_column TEXT NOT NULL,       -- Target column name
  transform_function TEXT,           -- Optional: JS/SQL function name for transformation
  default_value TEXT,                -- Default value if source is null
  is_required BOOLEAN DEFAULT false,
  priority INTEGER DEFAULT 0,        -- Order of execution
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(template_id, source_field, target_table, target_column)
);

-- Template Transform Rules: Business logic for transformations
CREATE TABLE IF NOT EXISTS template_transform_rules (
  id SERIAL PRIMARY KEY,
  template_id TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL,           -- 'pre_transform', 'post_transform', 'validation', 'enrichment'
  rule_definition JSONB NOT NULL,    -- Rule configuration (conditions, actions, etc.)
  priority INTEGER DEFAULT 0,        -- Execution order
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(template_id, rule_name)
);

-- Transform Jobs: Track transformation executions
CREATE TABLE IF NOT EXISTS transform_jobs (
  id SERIAL PRIMARY KEY,
  job_id TEXT UNIQUE NOT NULL,
  template_id TEXT NOT NULL,
  folder_config JSONB,               -- Folder detection config used
  status TEXT DEFAULT 'pending',     -- 'pending', 'running', 'completed', 'failed'
  total_documents INTEGER DEFAULT 0,
  processed_documents INTEGER DEFAULT 0,
  created_tables TEXT[],             -- List of created table names
  errors JSONB,                      -- Array of error objects
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_template_table_schemas_template ON template_table_schemas(template_id);
CREATE INDEX IF NOT EXISTS idx_template_field_mappings_template ON template_field_mappings(template_id);
CREATE INDEX IF NOT EXISTS idx_template_field_mappings_table ON template_field_mappings(target_table);
CREATE INDEX IF NOT EXISTS idx_template_transform_rules_template ON template_transform_rules(template_id);
CREATE INDEX IF NOT EXISTS idx_template_transform_rules_type ON template_transform_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_transform_jobs_status ON transform_jobs(status);
CREATE INDEX IF NOT EXISTS idx_transform_jobs_template ON transform_jobs(template_id);

-- Comments
COMMENT ON TABLE template_table_schemas IS 'Defines database table structures for each template (generic, reusable)';
COMMENT ON TABLE template_field_mappings IS 'Maps template fields to database columns (no hardcoded project names)';
COMMENT ON TABLE template_transform_rules IS 'Business logic rules for data transformation';
COMMENT ON TABLE transform_jobs IS 'Tracks transformation job executions and results';

-- ============================================================================
-- EXAMPLE: Turkish Tax Law Template Configuration (Optional Initial Data)
-- This can be inserted via UI or kept in separate seed files
-- ============================================================================

-- Note: Actual data should be inserted through the Transform UI, not hardcoded here
-- This is just an example structure for reference
