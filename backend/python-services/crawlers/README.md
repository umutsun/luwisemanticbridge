# Crawler Scripts

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
