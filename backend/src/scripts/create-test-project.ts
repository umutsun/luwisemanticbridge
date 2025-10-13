import { siteConfigurationService } from '../services/site-configuration.service';
import { lsembPool } from '../config/database.config';

async function createPinokyoTestProject() {
  console.log('Creating Pinokyo test project...');

  try {
    // 1. Create project
    const projectResult = await lsembPool.query(`
      INSERT INTO advanced_scraping_projects
      (name, description, category, auto_process, auto_embeddings, real_time, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW())
      RETURNING *
    `, [
      'Pinokyo Analysis',
      'Comprehensive scraping of Pinocchio related content from various sources',
      'pinokyo',
      true,
      true,
      true
    ]);

    const project = projectResult.rows[0];
    console.log(`✅ Project created: ${project.name} (ID: ${project.id})`);

    // 2. Create site configurations

    // Wikipedia Configuration
    const wikiUrl = await siteConfigurationService.searchWikipedia('Pinocchio', 'en');
    const wikiConfig = await siteConfigurationService.createConfig({
      name: 'Wikipedia - Pinocchio',
      baseUrl: wikiUrl,
      type: 'wiki',
      category: 'pinokyo',
      selectors: {
        content: '#mw-content-text',
        title: '#firstHeading',
        description: '.mw-parser-output > p:first-child',
        links: '#mw-content-text a',
        wait: '#mw-content-text'
      },
      transforms: {
        cleanHtml: true,
        extractMetadata: true
      },
      rateLimit: 5
    });
    console.log(`✅ Wiki config created: ${wikiUrl}`);

    // News Site Configuration (Example: BBC)
    const newsConfig = await siteConfigurationService.createConfig({
      name: 'Google News - Pinocchio',
      baseUrl: 'https://news.google.com',
      type: 'news',
      category: 'pinokyo',
      selectors: {
        content: 'article',
        title: 'h3, h4',
        links: 'a[href]'
      },
      rateLimit: 10
    });
    console.log(`✅ News config created`);

    // Blog Configuration (Example: Medium)
    const blogConfig = await siteConfigurationService.createConfig({
      name: 'Blog Search',
      baseUrl: 'https://medium.com',
      type: 'blog',
      category: 'pinokyo',
      selectors: {
        content: 'article',
        title: 'h1, h2',
        description: 'p',
        links: 'a'
      },
      rateLimit: 8
    });
    console.log(`✅ Blog config created`);

    // 3. Store configurations in database
    const configs = [wikiConfig, newsConfig, blogConfig];

    for (const config of configs) {
      // Only insert if config has a baseUrl
      if (config.baseUrl) {
        await lsembPool.query(`
          INSERT INTO advanced_site_configurations
          (id, name, base_url, type, category, selectors, auth_config, rate_limit,
           pagination_config, filters, transforms, active, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, NOW())
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            base_url = EXCLUDED.base_url,
            type = EXCLUDED.type,
            category = EXCLUDED.category,
            selectors = EXCLUDED.selectors,
            updated_at = CURRENT_TIMESTAMP
        `, [
          config.id,
          config.name,
          config.baseUrl,
          config.type,
          config.category,
          JSON.stringify(config.selectors || {}),
          JSON.stringify(config.auth || {}),
          config.rateLimit || 10,
          JSON.stringify(config.pagination || {}),
          JSON.stringify(config.filters || {}),
          JSON.stringify(config.transforms || {})
        ]);
      }
    }

    console.log('\n✅ Test project setup complete!');
    console.log(`Project ID: ${project.id}`);
    console.log(`Site Configs: ${configs.length} sites configured`);
    console.log('\nYou can now test scraping at: http://localhost:3002/scraper');

  } catch (error) {
    console.error('❌ Failed to create test project:', error);
  }
}

// Run if called directly
if (require.main === module) {
  createPinokyoTestProject().then(() => {
    console.log('\nDone!');
    process.exit(0);
  });
}

export default createPinokyoTestProject;