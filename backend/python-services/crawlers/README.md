# Crawler Scripts

## Built-in Crawlers

The following built-in crawlers are available in the system:

### 1. WordPress Crawler (`wordpress_crawler.py`)
- **Type**: REST API + Sitemap
- **Use Cases**: Generic WordPress sites
- **Features**:
  - WordPress REST API support (/wp-json/wp/v2/posts, pages)
  - Sitemap.xml fallback
  - Category and tag extraction
  - Featured images
- **Example**: `python wordpress_crawler.py https://example.com/`

### 2. Drupal Crawler (`drupal_crawler.py`)
- **Type**: JSON:API + Sitemap
- **Use Cases**: Drupal 8+ sites
- **Features**:
  - Drupal JSON:API support
  - Multiple endpoint patterns
  - Pagination support
  - Sitemap.xml fallback
- **Example**: `python drupal_crawler.py https://yeditepe.edu.tr/`

### 3. WooCommerce Crawler (`woocommerce_crawler.py`)
- **Type**: E-commerce Product API
- **Use Cases**: WooCommerce stores
- **Features**:
  - Product variations
  - Stock status
  - Categories and tags
  - Images and galleries
- **Example**: `python woocommerce_crawler.py https://store.example.com/`

### 4. Shopify Crawler (`shopify_crawler.py`)
- **Type**: Storefront JSON API
- **Use Cases**: Shopify stores
- **Features**:
  - Product variants
  - Collections
  - Pagination support
  - Vendor and tags
- **Example**: `python shopify_crawler.py https://shop.example.com/`

### 5. Wix Crawler (`wix_crawler.py`)
- **Type**: Playwright-based
- **Use Cases**: Wix websites
- **Features**:
  - JavaScript rendering
  - Dynamic content extraction
  - Page navigation
- **Example**: `python wix_crawler.py https://example.wixsite.com/`
- **Note**: Requires Playwright installation

### 6. Cloudflare Bypass Crawler (`cloudflare_crawler.py`)
- **Type**: Stealth Playwright
- **Use Cases**: Cloudflare-protected sites
- **Features**:
  - Cloudflare challenge bypass
  - Stealth mode
  - Automatic retry
  - Rate limiting
- **Example**: `python cloudflare_crawler.py https://protected-site.com/ 50`
- **Note**: Requires Playwright installation

## Playwright Installation (Production Server)

### CentOS Server Setup

1. **Install system dependencies:**
```bash
ssh root@91.99.229.96
cd /var/www/lsemb/backend/python-services
chmod +x install-playwright-centos.sh
./install-playwright-centos.sh
```

2. **Test Playwright installation:**
```bash
source venv/bin/activate
python -c "from playwright.sync_api import sync_playwright; print('✅ Playwright works!')"
```

3. **Test crawler:**
```bash
cd crawlers
python iskultur_crawler.py https://www.iskultur.com.tr/kitap/cocuk-okul-oncesi/
```

### Alternative: Lightweight Scraper (No Playwright)

If Playwright is too heavy or causes issues, use `requests + BeautifulSoup`:

```python
import requests
from bs4 import BeautifulSoup

def scrape_without_playwright(url):
    """Lightweight scraper for static pages"""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
    response = requests.get(url, headers=headers, timeout=10)
    soup = BeautifulSoup(response.content, 'html.parser')

    # Extract data
    data = {
        'title': soup.find('h1').text if soup.find('h1') else None,
        'content': soup.get_text(strip=True)
    }
    return data
```

### Troubleshooting

**Issue: Chromium fails to launch**
```bash
# Check dependencies
ldd /var/www/lsemb/backend/python-services/venv/lib/python3.*/site-packages/playwright/driver/package/.local-browsers/chromium-*/chrome-linux/chrome

# Install missing libs
sudo yum install -y <missing-package>
```

**Issue: Permission denied**
```bash
# Make sure venv has correct permissions
sudo chown -R root:root /var/www/lsemb/backend/python-services/venv
```

**Issue: Chromium crashes**
```bash
# Run in headless mode with additional args
# In your crawler script:
browser = await playwright.chromium.launch(
    headless=True,
    args=[
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
    ]
)
```

### Disk Space Requirements

- **Playwright + Chromium**: ~300MB
- **requests + BeautifulSoup**: ~5MB

Choose based on your needs:
- **Dynamic content (JS-rendered)**: Use Playwright
- **Static HTML**: Use requests + BeautifulSoup
