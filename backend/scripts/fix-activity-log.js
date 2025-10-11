const { Pool } = require('pg');

async function fixActivityLog() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || '',
    database: process.env.POSTGRES_DB || 'asemb'
  });

  try {
    console.log('Fixing activity_log table schema...');

    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'activity_log'
      );
    `);

    if (tableCheck.rows[0].exists) {
      console.log('Table activity_log exists');

      // Check columns
      const columns = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'activity_log'
        ORDER BY ordinal_position;
      `);

      console.log('Current columns:', columns.rows.map(r => r.column_name));

      // Add missing columns
      const existingColumns = columns.rows.map(r => r.column_name);

      if (!existingColumns.includes('activity_type')) {
        console.log('Adding activity_type column...');
        await pool.query(`
          ALTER TABLE activity_log
          ADD COLUMN activity_type VARCHAR(50)
          CHECK (activity_type IN ('model_change', 'chat_start', 'chat_message', 'settings_change'))
        `);
        console.log('✅ Added activity_type column');
      }

      if (!existingColumns.includes('details')) {
        console.log('Adding details column...');
        await pool.query(`
          ALTER TABLE activity_log
          ADD COLUMN details JSONB
        `);
        console.log('✅ Added details column');
      }

      if (!existingColumns.includes('created_at')) {
        console.log('Adding created_at column...');
        await pool.query(`
          ALTER TABLE activity_log
          ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        `);
        console.log('✅ Added created_at column');
      }

      // Create indexes
      console.log('Creating indexes...');
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
        CREATE INDEX IF NOT EXISTS idx_activity_log_activity_type ON activity_log(activity_type);
        CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
      `);
      console.log('✅ Indexes created');

    } else {
      console.log('Table does not exist, creating it...');
      await pool.query(`
        CREATE TABLE activity_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id VARCHAR(255) NOT NULL,
            activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN ('model_change', 'chat_start', 'chat_message', 'settings_change')),
            details JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE INDEX idx_activity_log_user_id ON activity_log(user_id);
        CREATE INDEX idx_activity_log_activity_type ON activity_log(activity_type);
        CREATE INDEX idx_activity_log_created_at ON activity_log(created_at DESC);
      `);
      console.log('✅ Table created');
    }

    console.log('✅ Activity log schema fix completed');

  } catch (error) {
    console.error('❌ Fix failed:', error);
  } finally {
    await pool.end();
  }
}

fixActivityLog();