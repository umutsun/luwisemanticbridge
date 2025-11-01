# Playwright Deployment Guide (CentOS Production Server)

## Overview

This guide covers installing Playwright + Chromium on the CentOS production server for web scraping with Python crawlers.

## Prerequisites

- CentOS 7/8 server
- Python 3.10+ installed
- Root or sudo access
- ~500MB free disk space (for Chromium + dependencies)

## Installation Steps

### 1. Connect to Server

```bash
ssh root@91.99.229.96
cd /var/www/lsemb/backend/python-services
```

### 2. Run Installation Script

```bash
# Make script executable
chmod +x install-playwright-centos.sh

# Run installation (installs system deps + Playwright)
./install-playwright-centos.sh
```

The script will:
- Install system dependencies (fonts, libraries, X11 utils)
- Install Playwright Python package
- Download Chromium browser binary
- Install Chromium system dependencies

### 3. Verify Installation

```bash
# Activate virtual environment
source venv/bin/activate

# Test Playwright
python -c "from playwright.sync_api import sync_playwright; print('✅ Playwright works!')"

# Test crawler
cd crawlers
python iskultur_crawler.py https://www.iskultur.com.tr/kitap/cocuk-okul-oncesi/
```

### 4. Configure Crawler for Production

Crawlers are already configured to run in headless mode. To change:

```python
# In crawler file (e.g., iskultur_crawler.py)
HEADLESS = True   # Production (no visible browser)
HEADLESS = False  # Development (see browser window)
```

### 5. Start Crawler via Backend API

```bash
# Backend will automatically run crawlers in headless mode
# No manual configuration needed
```

## Troubleshooting

### Issue 1: Chromium Fails to Launch

**Symptom:** `Browser crashed` or `Failed to launch browser`

**Solution:**
```bash
# Check missing dependencies
cd /var/www/lsemb/backend/python-services
source venv/bin/activate

# List chromium dependencies
ldd venv/lib/python*/site-packages/playwright/driver/package/.local-browsers/chromium-*/chrome-linux/chrome

# Install missing libraries (example)
sudo yum install -y libatk-1.0.so.0 libatk-bridge-2.0.so.0
```

### Issue 2: Permission Denied

**Symptom:** `EACCES: permission denied`

**Solution:**
```bash
# Fix permissions
sudo chown -R root:root /var/www/lsemb/backend/python-services/venv

# If still failing, run with explicit permissions
chmod -R 755 venv/lib/python*/site-packages/playwright/driver
```

### Issue 3: Out of Memory

**Symptom:** `Chromium crashed` during crawling

**Solution:**
```python
# In crawler script, add memory limits
browser = await p.chromium.launch(
    headless=True,
    args=[
        '--no-sandbox',
        '--disable-dev-shm-usage',  # Important for limited memory
        '--disable-gpu',
        '--single-process',  # Use less memory
        '--disable-software-rasterizer'
    ]
)
```

### Issue 4: Slow Performance

**Symptom:** Crawler is very slow

**Solution:**
```python
# Disable unnecessary features
browser = await p.chromium.launch(
    headless=True,
    args=[
        '--disable-images',  # Don't load images (faster)
        '--disable-javascript',  # Only if site doesn't need JS
        '--blink-settings=imagesEnabled=false'
    ]
)
```

## Alternative: Lightweight Scraper (No Playwright)

If Playwright causes too many issues, use a simple HTTP scraper:

### Install Lightweight Dependencies

```bash
pip install requests beautifulsoup4 lxml
```

### Create Simple Scraper

```python
import requests
from bs4 import BeautifulSoup

def scrape_static_page(url):
    """Use for static HTML pages (no JavaScript rendering needed)"""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

    response = requests.get(url, headers=headers, timeout=10)
    soup = BeautifulSoup(response.content, 'html.parser')

    # Extract data
    title = soup.find('h1').text if soup.find('h1') else None
    # ... rest of extraction

    return {'title': title, ...}
```

**When to use:**
- ✅ Static HTML pages (most e-commerce sites)
- ✅ Low resource usage (~5MB vs ~300MB)
- ✅ Faster for simple scraping
- ❌ Cannot handle JavaScript-rendered content
- ❌ Cannot interact with dynamic elements

## Resource Comparison

| Method | Disk Space | Memory | Speed | JavaScript Support |
|--------|-----------|--------|-------|-------------------|
| Playwright | ~300MB | ~150MB/page | Slower | ✅ Full |
| Requests + BS4 | ~5MB | ~10MB/page | Faster | ❌ None |

## PM2 Configuration

Crawlers run as background tasks triggered by API, not as PM2 services.

Backend (Node.js) → Spawns Python crawler → Runs in background → Stops when done

No additional PM2 configuration needed.

## Monitoring

```bash
# Check crawler logs in real-time
pm2 logs lsemb-backend --lines 100 | grep -i crawler

# Check Python process
ps aux | grep python | grep crawler

# Kill stuck crawler
pkill -f "iskultur_crawler.py"
```

## Disk Space Management

```bash
# Check Playwright cache size
du -sh /var/www/lsemb/backend/python-services/venv/lib/python*/site-packages/playwright/

# Clear Playwright cache (if needed)
playwright uninstall chromium
playwright install chromium
```

## Production Checklist

- [x] System dependencies installed
- [x] Playwright + Chromium installed
- [x] Crawlers configured for headless mode
- [x] `--no-sandbox` flag enabled (required for root)
- [x] Memory limits configured
- [x] Error handling in place
- [ ] Test crawler on production server
- [ ] Monitor first few runs
- [ ] Set up log rotation

## Support

If issues persist:
1. Check logs: `pm2 logs lsemb-backend`
2. Test manually: `python crawlers/iskultur_crawler.py <url>`
3. Check system resources: `free -h` and `df -h`
4. Consider lightweight scraper if Playwright too heavy
