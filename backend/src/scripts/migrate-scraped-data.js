const { asembPool } = require('../config/database.config');

async function migrateData() {
  try {
    console.log('🔄 Migrating scraped data to new tables...\n');

    // First, let's see what data sources we have
    console.log('=== Checking Data Sources ===');
    let result = await asembPool.query(`
      SELECT DISTINCT source_id, COUNT(*) as cnt
      FROM unified_embeddings
      WHERE source_id IS NOT NULL
      GROUP BY source_id
      ORDER BY cnt DESC
    `);
    console.log('Data sources:');
    result.rows.forEach(row => {
      console.log(`  - ${row.source}: ${row.cnt} records`);
    });

    // Get sample data from unified_embeddings
    console.log('\n=== Sample Data from unified_embeddings ===');
    result = await asembPool.query(`
      SELECT *
      FROM unified_embeddings
      WHERE source_url IS NOT NULL
      LIMIT 3
    `);
    console.log('Sample records:');
    result.rows.forEach(row => {
      console.log(`  - URL: ${row.source_url?.substring(0, 50)}...`);
      console.log(`    Title: ${row.title?.substring(0, 50)}...`);
      console.log(`    Source: ${row.source}`);
      console.log(`    Created: ${row.created_at}`);
      console.log('');
    });

    // Create a test project if not exists
    console.log('=== Creating Test Project ===');
    result = await asembPool.query(`
      SELECT id FROM scraping_projects WHERE name = 'Migrated Data'
    `);

    let projectId;
    if (result.rowCount === 0) {
      const newProject = await asembPool.query(`
        INSERT INTO scraping_projects
        (name, description, category, auto_process, auto_embeddings, real_time, status, created_at)
        VALUES ('Migrated Data', 'Data migrated from unified_embeddings', 'legacy', false, true, true, 'active', NOW())
        RETURNING id
      `);
      projectId = newProject.rows[0].id;
      console.log(`✅ Created project with ID: ${projectId}`);
    } else {
      projectId = result.rows[0].id;
      console.log(`✅ Using existing project with ID: ${projectId}`);
    }

    // Create a site configuration if not exists
    console.log('\n=== Creating Site Configuration ===');
    result = await asembPool.query(`
      SELECT id FROM site_configurations WHERE name = 'Legacy Data'
    `);

    let siteId;
    if (result.rowCount === 0) {
      const newSite = await asembPool.query(`
        INSERT INTO site_configurations
        (name, base_url, type, category, active, created_at)
        VALUES ('Legacy Data', 'https://legacy.sources', 'migration', 'legacy', true, NOW())
        RETURNING id
      `);
      siteId = newSite.rows[0].id;
      console.log(`✅ Created site config with ID: ${siteId}`);
    } else {
      siteId = result.rows[0].id;
      console.log(`✅ Using existing site config with ID: ${siteId}`);
    }

    // Migrate some sample data
    console.log('\n=== Migrating Sample Data ===');
    const sampleData = await asembPool.query(`
      SELECT id, content, source_url, title, metadata, created_at
      FROM unified_embeddings
      WHERE source_url IS NOT NULL
      AND source_url NOT IN (
        SELECT url FROM scraped_content WHERE url IS NOT NULL
      )
      LIMIT 100
    `);

    console.log(`Found ${sampleData.rowCount} records to migrate`);

    if (sampleData.rowCount > 0) {
      let migratedCount = 0;
      for (const row of sampleData.rows) {
        try {
          await asembPool.query(`
            INSERT INTO scraped_content
            (project_id, site_id, url, title, content, metadata, processed, embedding_generated, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, true, true, $7)
          `, [
            projectId,
            siteId,
            row.source_url,
            row.title || 'Untitled',
            row.content || '',
            JSON.stringify({
              migrated_from: 'unified_embeddings',
              original_id: row.id,
              source: row.source,
              metadata: row.metadata
            }),
            row.created_at || new Date()
          ]);
          migratedCount++;
        } catch (e) {
          console.error(`Failed to migrate ${row.id}: ${e.message}`);
        }
      }
      console.log(`✅ Successfully migrated ${migratedCount} records`);
    }

    // Check final result
    console.log('\n=== Final Check ===');
    const finalCount = await asembPool.query('SELECT COUNT(*) as cnt FROM scraped_content');
    console.log(`📊 Total records in scraped_content: ${finalCount.rows[0].cnt}`);

    await asembPool.end();
    console.log('\n✅ Migration complete!');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

migrateData();