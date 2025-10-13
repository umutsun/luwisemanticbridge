import { lsembPool } from '../config/database.config';
import { intelligentScraperService } from './intelligent-scraper.service';
import { v4 as uuidv4 } from 'uuid';

interface ProjectSite {
  id: string;
  projectId: string;
  siteId: string;
  scrapingConfig: any;
  isActive: boolean;
  addedAt: Date;
}

interface SiteConfigurationForProject {
  name: string;
  baseUrl: string;
  category?: string;
  type?: 'website' | 'ecommerce' | 'blog' | 'news' | 'api';
  autoDetect?: boolean;
}

interface EcommerceFeatures {
  hasCart: boolean;
  hasCheckout: boolean;
  hasUserAccounts: boolean;
  hasReviews: boolean;
  hasWishlist: boolean;
  hasFilters: boolean;
  currency: string;
}

interface EntityTypeConfig {
  type: string;
  label: string;
  selector?: string;
  pattern?: string;
  enabled: boolean;
  category: 'product' | 'content' | 'user' | 'location' | 'contact';
}

export class ProjectSiteManagerService {
  /**
   * Add a site to a project with automatic configuration
   */
  async addSiteToProject(
    projectId: string,
    siteConfig: SiteConfigurationForProject
  ): Promise<ProjectSite> {
    try {
      // First, create the site configuration if it doesn't exist
      const site = await this.createOrUpdateSiteConfiguration(siteConfig);

      // Then add it to the project
      const projectSiteId = uuidv4();

      // Analyze site structure if auto-detect is enabled
      let scrapingConfig = {};
      let structure = null;
      let entityTypes: EntityTypeConfig[] = [];

      if (siteConfig.autoDetect !== false) {
        try {
          structure = await intelligentScraperService.analyzeSiteStructure(site.baseUrl);
          scrapingConfig = this.generateScrapingConfig(structure);

          // Detect and configure entity types based on site type
          if (structure.ecommerce) {
            entityTypes = this.getEcommerceEntityTypes();
          } else {
            entityTypes = this.getDefaultEntityTypes();
          }

          // Store entity types in the config
          scrapingConfig.entityTypes = entityTypes;
        } catch (error) {
          console.error('Failed to analyze site structure:', error);
          // Use default config
          scrapingConfig = this.getDefaultScrapingConfig();
          entityTypes = this.getDefaultEntityTypes();
        }
      }

      // Save the project-site relationship
      await lsembPool.query(`
        INSERT INTO project_sites (id, project_id, site_id, scraping_config, is_active, added_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        RETURNING id, project_id, site_id, scraping_config, is_active, added_at
      `, [projectSiteId, projectId, site.id, JSON.stringify(scrapingConfig), true]);

      // Update project to include site in its sites array
      await this.updateProjectSitesList(projectId, site.id);

      return {
        id: projectSiteId,
        projectId,
        siteId: site.id,
        scrapingConfig,
        isActive: true,
        addedAt: new Date()
      };
    } catch (error) {
      console.error('Failed to add site to project:', error);
      throw error;
    }
  }

  /**
   * Create or update site configuration
   */
  private async createOrUpdateSiteConfiguration(siteConfig: SiteConfigurationForProject) {
    // Check if site already exists
    const existingSite = await lsembPool.query(
      'SELECT * FROM site_configurations WHERE base_url = $1',
      [siteConfig.baseUrl]
    );

    if (existingSite.rows.length > 0) {
      return existingSite.rows[0];
    }

    // Create new site configuration
    const result = await lsembPool.query(`
      INSERT INTO site_configurations (id, name, base_url, type, category, selectors, active)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      uuidv4(),
      siteConfig.name,
      siteConfig.baseUrl,
      'website',
      siteConfig.category || 'general',
      JSON.stringify({}), // Will be populated with scraping config
      true
    ]);

    return result.rows[0];
  }

  /**
   * Generate scraping configuration from site structure
   */
  private generateScrapingConfig(structure: any): any {
    const config: any = {
      version: '1.0',
      detectedAt: new Date().toISOString(),
      routes: structure.routes || [],
      searchPatterns: [],
      contentPatterns: [],
      categoryPatterns: [],
      contentSelectors: structure.contentSelectors || {},
      pagination: {
        enabled: structure.pagination?.hasNext || false,
        nextSelector: structure.pagination?.nextSelector || '',
        maxPages: 10
      },
      rateLimit: 1000, // ms between requests
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };

    // Add e-commerce specific configuration
    if (structure.ecommerce) {
      config.ecommerce = {
        productGrid: '.product-grid, .products, .items',
        productCard: '.product, .item, .card',
        productName: '.title, .name, h2, h3',
        productPrice: '.price, .cost, .amount',
        productImage: '.image img, .photo img, img',
        productLink: 'a',
        addToCart: '.add-to-cart, .buy, .purchase',
        inStock: '.stock, .availability, .in-stock'
      };
    }

    // Extract route patterns
    if (structure.routes && structure.routes.length > 0) {
      // Group routes by type
      const searchRoutes = structure.routes.filter(r => r.type === 'search');
      const contentRoutes = structure.routes.filter(r => r.type === 'article' || r.type === 'content');
      const categoryRoutes = structure.routes.filter(r => r.type === 'category');

      if (searchRoutes.length > 0) {
        config.searchPatterns = searchRoutes.map(r => r.url);
        config.hasSearch = true;
      }

      if (contentRoutes.length > 0) {
        // Extract URL patterns for content pages
        const patterns = this.extractUrlPatterns(contentRoutes);
        config.contentPatterns = patterns;
      }

      if (categoryRoutes.length > 0) {
        config.categoryPatterns = categoryRoutes.map(r => r.url);
      }
    }

    // Set default content selectors if not detected
    if (!config.contentSelectors.content) {
      config.contentSelectors = {
        ...config.contentSelectors,
        content: 'main, article, .content, #content, .post-content',
        title: 'h1, .title, .page-title',
        date: '.date, .published, time, .timestamp',
        author: '.author, .byline',
        navigation: 'nav, .nav, .navigation'
      };
    }

    return config;
  }

  /**
   * Extract URL patterns from routes
   */
  private extractUrlPatterns(routes: any[]): string[] {
    const patterns: string[] = [];
    const pathCounts: Record<string, number> = {};

    for (const route of routes) {
      try {
        const url = new URL(route.url);
        const path = url.pathname;

        // Convert dynamic parts to placeholders
        const pattern = path
          .replace(/\d+/g, '{id}')
          .replace(/[a-f0-9-]{36}/g, '{uuid}')
          .replace(/\/[^\/]+-\d+/g, '/{slug}-{id}');

        pathCounts[pattern] = (pathCounts[pattern] || 0) + 1;
      } catch (error) {
        // Invalid URL, skip
      }
    }

    // Get the most common patterns
    const sortedPatterns = Object.entries(pathCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([pattern]) => pattern);

    return sortedPatterns;
  }

  /**
   * Get default scraping configuration
   */
  private getDefaultScrapingConfig(): any {
    return {
      version: '1.0',
      contentSelectors: {
        content: 'main, article, .content, #content, .post-content',
        title: 'h1, .title, .page-title',
        date: '.date, .published, time',
        author: '.author, .byline',
        navigation: 'nav, .nav, .navigation'
      },
      searchPatterns: [],
      contentPatterns: ['/{slug}', '/{id}', '/p/{id}', '/article/{slug}'],
      pagination: {
        enabled: false,
        nextSelector: '.next, .pagination .next',
        maxPages: 10
      },
      rateLimit: 1000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };
  }

  /**
   * Update project's sites list
   */
  private async updateProjectSitesList(projectId: string, siteId: string): Promise<void> {
    try {
      // Get current project
      const projectResult = await lsembPool.query(
        'SELECT site_ids FROM scraping_projects WHERE id = $1',
        [projectId]
      );

      if (projectResult.rows.length === 0) {
        throw new Error('Project not found');
      }

      // Update site_ids array
      const currentSiteIds = projectResult.rows[0].site_ids || [];
      if (!currentSiteIds.includes(siteId)) {
        currentSiteIds.push(siteId);

        await lsembPool.query(`
          UPDATE scraping_projects
          SET site_ids = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [currentSiteIds, projectId]);
      }
    } catch (error) {
      console.error('Failed to update project sites list:', error);
    }
  }

  /**
   * Get all sites for a project
   */
  async getProjectSites(projectId: string): Promise<any[]> {
    try {
      const result = await lsembPool.query(`
        SELECT
          ps.id as project_site_id,
          ps.scraping_config,
          ps.is_active,
          ps.added_at,
          sc.*,
          sp.name as project_name
        FROM project_sites ps
        JOIN site_configurations sc ON ps.site_id = sc.id
        JOIN scraping_projects sp ON ps.project_id = sp.id
        WHERE ps.project_id = $1
        ORDER BY ps.added_at DESC
      `, [projectId]);

      return result.rows;
    } catch (error) {
      console.error('Failed to get project sites:', error);
      return [];
    }
  }

  /**
   * Remove a site from a project
   */
  async removeSiteFromProject(projectId: string, siteId: string): Promise<void> {
    try {
      // Remove from project_sites table
      await lsembPool.query(
        'DELETE FROM project_sites WHERE project_id = $1 AND site_id = $2',
        [projectId, siteId]
      );

      // Update project's site_ids array
      const projectResult = await lsembPool.query(
        'SELECT site_ids FROM scraping_projects WHERE id = $1',
        [projectId]
      );

      if (projectResult.rows.length > 0) {
        const siteIds = (projectResult.rows[0].site_ids || [])
          .filter((id: string) => id !== siteId);

        await lsembPool.query(`
          UPDATE scraping_projects
          SET site_ids = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [siteIds, projectId]);
      }
    } catch (error) {
      console.error('Failed to remove site from project:', error);
      throw error;
    }
  }

  /**
   * Update scraping config for a project site
   */
  async updateScrapingConfig(
    projectId: string,
    siteId: string,
    config: any
  ): Promise<void> {
    try {
      await lsembPool.query(`
        UPDATE project_sites
        SET scraping_config = $1, updated_at = CURRENT_TIMESTAMP
        WHERE project_id = $2 AND site_id = $3
      `, [JSON.stringify(config), projectId, siteId]);
    } catch (error) {
      console.error('Failed to update scraping config:', error);
      throw error;
    }
  }

  /**
   * Re-analyze a site and update its config
   */
  async reanalyzeSite(projectId: string, siteId: string): Promise<any> {
    try {
      // Get site info
      const siteResult = await lsembPool.query(
        'SELECT * FROM site_configurations WHERE id = $1',
        [siteId]
      );

      if (siteResult.rows.length === 0) {
        throw new Error('Site not found');
      }

      const site = siteResult.rows[0];

      // Re-analyze structure
      const structure = await intelligentScraperService.analyzeSiteStructure(site.base_url);
      const newConfig = this.generateScrapingConfig(structure);

      // Update config
      await this.updateScrapingConfig(projectId, siteId, newConfig);

      // Also update site configuration with new selectors
      await lsembPool.query(`
        UPDATE site_configurations
        SET selectors = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [JSON.stringify(structure), siteId]);

      return {
        structure,
        config: newConfig
      };
    } catch (error) {
      console.error('Failed to reanalyze site:', error);
      throw error;
    }
  }

  /**
   * Get default entity types for general content sites
   */
  private getDefaultEntityTypes(): EntityTypeConfig[] {
    return [
      {
        type: 'EMAIL',
        label: 'Email Address',
        pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
        enabled: true,
        category: 'contact'
      },
      {
        type: 'PHONE',
        label: 'Phone Number',
        pattern: '\\(?\\d{3}\\)?[ -]?\\d{3}[ -]?\\d{4}',
        enabled: true,
        category: 'contact'
      },
      {
        type: 'DATE',
        label: 'Date',
        pattern: '\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|\\d{4}[/-]\\d{1,2}[/-]\\d{1,2}',
        enabled: true,
        category: 'content'
      },
      {
        type: 'IMAGE_URL',
        label: 'Image URL',
        pattern: 'https?://[^\\s]+\\.(jpg|jpeg|png|gif|webp|svg)',
        enabled: true,
        category: 'content'
      },
      {
        type: 'SOURCE_URL',
        label: 'Source URL',
        pattern: 'https?://[^\\s]+',
        enabled: true,
        category: 'content'
      }
    ];
  }

  /**
   * Get e-commerce specific entity types
   */
  private getEcommerceEntityTypes(): EntityTypeConfig[] {
    return [
      ...this.getDefaultEntityTypes(),
      {
        type: 'ISBN',
        label: 'ISBN Number',
        pattern: 'ISBN[:\\s]*978[-\\d\\s]{10,17}',
        enabled: true,
        category: 'product'
      },
      {
        type: 'PRODUCT_ID',
        label: 'Product ID/SKU',
        pattern: '\\b(?:SKU|ID|MODEL)[\\s:]*([A-Z0-9-_]+)',
        enabled: true,
        category: 'product'
      },
      {
        type: 'PRICE',
        label: 'Price',
        pattern: '\\$\\d+(?:\\.\\d{2})?|\\d+(?:\\.\\d{2})?\\s*(?:TL|USD|EUR|£)',
        enabled: true,
        category: 'product'
      },
      {
        type: 'CURRENCY',
        label: 'Currency',
        pattern: '(?:\\$|USD|EUR|£|TL|TRY)',
        enabled: true,
        category: 'product'
      },
      {
        type: 'BARCODE',
        label: 'Barcode',
        pattern: '\\b\\d{8,14}\\b',
        enabled: true,
        category: 'product'
      },
      {
        type: 'AVAILABILITY',
        label: 'Stock Status',
        pattern: '(?:in stock|out of stock|available|unavailable|stokta var|stokta yok)',
        enabled: true,
        category: 'product'
      },
      {
        type: 'DISCOUNT',
        label: 'Discount',
        pattern: '\\d+%(?:\\s*off|\\s*indirim)',
        enabled: true,
        category: 'product'
      }
    ];
  }

  /**
   * Ensure project_sites table exists
   */
  async ensureTablesExist(): Promise<void> {
    try {
      // Create project_sites table
      await lsembPool.query(`
        CREATE TABLE IF NOT EXISTS project_sites (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id UUID NOT NULL REFERENCES scraping_projects(id) ON DELETE CASCADE,
          site_id UUID NOT NULL REFERENCES site_configurations(id) ON DELETE CASCADE,
          scraping_config JSONB DEFAULT '{}',
          is_active BOOLEAN DEFAULT true,
          added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(project_id, site_id)
        )
      `);

      // Add site_ids column to scraping_projects if it doesn't exist
      await lsembPool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'scraping_projects'
            AND column_name = 'site_ids'
          ) THEN
            ALTER TABLE scraping_projects ADD COLUMN site_ids UUID[] DEFAULT '{}';
          END IF;
        END $$;
      `);

      // Create indexes
      await lsembPool.query(`
        CREATE INDEX IF NOT EXISTS idx_project_sites_project_id ON project_sites(project_id);
        CREATE INDEX IF NOT EXISTS idx_project_sites_site_id ON project_sites(site_id);
        CREATE INDEX IF NOT EXISTS idx_scraping_projects_site_ids ON scraping_projects USING GIN(site_ids);
      `);
    } catch (error) {
      console.error('Failed to ensure tables exist:', error);
    }
  }
}

// Export singleton instance
export const projectSiteManagerService = new ProjectSiteManagerService();