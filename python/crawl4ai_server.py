from flask import Flask, request, jsonify
from flask_cors import CORS
from crawl4ai import AsyncWebCrawler
import asyncio
import json
import uuid
import traceback
from datetime import datetime
import os
import sys

app = Flask(__name__)
CORS(app)  # CORS desteği için

# Global crawler instance
crawler = None
crawler_config = {
    'headless': True,
    'verbose': True,
    'browser_type': 'chromium'
}

@app.route('/health', methods=['GET'])
def health():
    """API sağlık kontrolü"""
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0"
    })

@app.route('/info', methods=['GET'])
def info():
    """API sunucu bilgileri"""
    return jsonify({
        "name": "Crawl4AI API Server",
        "version": "1.0.0",
        "crawl4ai_version": "0.3.0",  # Güncel sürüm
        "browser_type": crawler_config['browser_type'],
        "headless": crawler_config['headless'],
        "timestamp": datetime.now().isoformat()
    })

@app.route('/scrape', methods=['POST'])
def scrape():
    """Web scraping endpoint'i"""
    global crawler
    
    data = request.json
    url = data.get('url')
    options = data.get('options', {})
    
    if not url:
        return jsonify({
            "success": False,
            "error": "URL is required"
        }), 400
    
    try:
        # Crawler'ı başlat
        if not crawler:
            print("Starting Crawl4AI crawler...")
            crawler = AsyncWebCrawler(
                headless=options.get('headless', crawler_config['headless']),
                verbose=options.get('verbose', crawler_config['verbose']),
                browser_type=options.get('browser_type', crawler_config['browser_type'])
            )
            asyncio.run(crawler.astart())
            print("Crawler started successfully")
        
        # Scraping işlemini yap
        print(f"Scraping URL: {url}")
        result = asyncio.run(crawler.arun(
            url=url,
            word_count_threshold=options.get('word_count_threshold', 10),
            extraction_strategy=options.get('extraction_strategy'),
            css_selector=options.get('css_selector'),
            wait_for=options.get('wait_for'),
            js_code=options.get('js_code'),
            use_js=options.get('use_js', True),
            bypass_cache=options.get('bypass_cache', False),
            session_id=options.get('session_id'),
            headers=options.get('headers'),
            user_agent=options.get('user_agent'),
            proxy=options.get('proxy'),
            screenshot=options.get('screenshot', False),
            extract_text=options.get('extract_text', True),
            extract_links=options.get('extract_links', True),
            extract_images=options.get('extract_images', False)
        ))
        
        # Sonucu formatla
        response = {
            "success": True,
            "url": url,
            "title": result.title,
            "content": result.cleaned_text if hasattr(result, 'cleaned_text') else result.markdown,
            "markdown": result.markdown if hasattr(result, 'markdown') else '',
            "description": result.description if hasattr(result, 'description') else '',
            "keywords": result.keywords if hasattr(result, 'keywords') else [],
            "links": result.links if hasattr(result, 'links') else [],
            "images": result.images if hasattr(result, 'images') else [],
            "metadata": {
                "scraping_method": "crawl4ai-api",
                "session_id": result.session_id if hasattr(result, 'session_id') else str(uuid.uuid4()),
                "extracted_at": datetime.now().isoformat(),
                "word_count": result.word_count if hasattr(result, 'word_count') else 0,
                "html_length": len(result.html) if hasattr(result, 'html') else 0,
                "screenshot_path": result.screenshot_path if hasattr(result, 'screenshot_path') else None
            }
        }
        
        print(f"Scraping completed successfully for: {url}")
        return jsonify(response)
        
    except Exception as e:
        error_msg = str(e)
        traceback_str = traceback.format_exc()
        
        print(f"Error scraping {url}: {error_msg}")
        print(f"Traceback: {traceback_str}")
        
        return jsonify({
            "success": False,
            "error": error_msg,
            "url": url,
            "traceback": traceback_str
        }), 500

@app.route('/scrape/batch', methods=['POST'])
def scrape_batch():
    """Toplu scraping endpoint'i"""
    data = request.json
    urls = data.get('urls', [])
    options = data.get('options', {})
    
    if not urls or not isinstance(urls, list):
        return jsonify({
            "success": False,
            "error": "URLs array is required"
        }), 400
    
    try:
        # Sonuçları topla
        results = []
        
        for url in urls:
            try:
                # Tek tek scrape et
                result = asyncio.run(scrape_single_url(url, options))
                results.append(result)
            except Exception as e:
                # Hata durumunda bile devam et
                results.append({
                    "success": False,
                    "url": url,
                    "error": str(e)
                })
        
        return jsonify({
            "success": True,
            "results": results,
            "total": len(urls),
            "successful": sum(1 for r in results if r.get("success", False)),
            "failed": sum(1 for r in results if not r.get("success", False))
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

async def scrape_single_url(url, options):
    """Tek URL için scraping yardımcı fonksiyonu"""
    global crawler
    
    if not crawler:
        crawler = AsyncWebCrawler(
            headless=options.get('headless', crawler_config['headless']),
            verbose=options.get('verbose', crawler_config['verbose']),
            browser_type=options.get('browser_type', crawler_config['browser_type'])
        )
        await crawler.astart()
    
    result = await crawler.arun(
        url=url,
        word_count_threshold=options.get('word_count_threshold', 10),
        css_selector=options.get('css_selector'),
        wait_for=options.get('wait_for'),
        js_code=options.get('js_code'),
        use_js=options.get('use_js', True),
        bypass_cache=options.get('bypass_cache', False),
        session_id=options.get('session_id'),
        headers=options.get('headers'),
        user_agent=options.get('user_agent'),
        proxy=options.get('proxy'),
        screenshot=options.get('screenshot', False),
        extract_text=options.get('extract_text', True),
        extract_links=options.get('extract_links', True),
        extract_images=options.get('extract_images', False)
    )
    
    return {
        "success": True,
        "url": url,
        "title": result.title,
        "content": result.cleaned_text if hasattr(result, 'cleaned_text') else result.markdown,
        "markdown": result.markdown if hasattr(result, 'markdown') else '',
        "description": result.description if hasattr(result, 'description') else '',
        "keywords": result.keywords if hasattr(result, 'keywords') else [],
        "links": result.links if hasattr(result, 'links') else [],
        "images": result.images if hasattr(result, 'images') else [],
        "metadata": {
            "scraping_method": "crawl4ai-api",
            "session_id": result.session_id if hasattr(result, 'session_id') else str(uuid.uuid4()),
            "extracted_at": datetime.now().isoformat(),
            "word_count": result.word_count if hasattr(result, 'word_count') else 0
        }
    }

@app.route('/shutdown', methods=['POST'])
def shutdown():
    """API sunucusunu kapat"""
    global crawler
    
    try:
        if crawler:
            asyncio.run(crawler.aclose())
            crawler = None
        
        return jsonify({
            "success": True,
            "message": "Server shutdown initiated"
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

if __name__ == '__main__':
    # Komut satırı argümanlarını kontrol et
    port = int(os.environ.get('PORT', 5000))
    host = os.environ.get('HOST', '0.0.0.0')
    debug = os.environ.get('DEBUG', 'false').lower() == 'true'
    
    print(f"Starting Crawl4AI API Server on {host}:{port}")
    print(f"Debug mode: {debug}")
    
    # Sunucuyu başlat
    app.run(host=host, port=port, debug=debug)