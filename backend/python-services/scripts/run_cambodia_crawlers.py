#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Cambodia Crawlers Runner Script
Links and runs all Cambodia crawlers on the ASEANlex instance
"""

import requests
import json
import time
import sys

# ASEANlex API base URL
# Use localhost:8087 for server-side calls, or the public URL for external calls
import os
ASEANLEX_API = os.environ.get("ASEANLEX_API", "http://localhost:8087/api/v2")

# Cambodia crawlers configuration
CAMBODIA_CRAWLERS = [
    {
        "name": "odc_cambodia_crawler",
        "script": "odc",  # API adds _crawler.py suffix
        "url": "https://opendevelopmentcambodia.net",
        "display_name": "Open Development Cambodia",
        "description": "Laws, Royal Decrees, Sub-decrees, Ministry Directives"
    },
    {
        "name": "cdc_cambodia_crawler",
        "script": "cdc",  # API adds _crawler.py suffix
        "url": "https://cambodiainvestment.gov.kh",
        "display_name": "Council for Development of Cambodia",
        "description": "QIP laws, Foreign investment incentives, SEZ regulations"
    },
    {
        "name": "moc_cambodia_crawler",
        "script": "moc",  # API adds _crawler.py suffix
        "url": "https://moc.gov.kh",
        "display_name": "Ministry of Commerce",
        "description": "Commercial Enterprises Law, Trademark rules, Company registration"
    },
    {
        "name": "khmersme_cambodia_crawler",
        "script": "khmersme",  # API adds _crawler.py suffix
        "url": "https://khmersme.gov.kh",
        "display_name": "KhmerSME",
        "description": "Business legal requirements, Licensing conditions"
    },
    {
        "name": "mlvt_cambodia_crawler",
        "script": "mlvt",  # API adds _crawler.py suffix
        "url": "https://mlvt.gov.kh",
        "display_name": "Ministry of Labour",
        "description": "Labor Law, Work permits, Foreign worker quotas"
    },
    {
        "name": "gdi_cambodia_crawler",
        "script": "gdi",  # API adds _crawler.py suffix
        "url": "https://immigration.gov.kh",
        "display_name": "General Department of Immigration",
        "description": "Visa types, Extension rules, Overstay penalties"
    },
    {
        "name": "gdt_cambodia_crawler",
        "script": "gdt",  # API adds _crawler.py suffix
        "url": "https://tax.gov.kh",
        "display_name": "General Department of Taxation",
        "description": "Corporate tax, Withholding tax, VAT rates"
    },
    {
        "name": "gdce_cambodia_crawler",
        "script": "gdce",  # API adds _crawler.py suffix
        "url": "https://customs.gov.kh",
        "display_name": "General Department of Customs",
        "description": "Customs tariffs, Import/export procedures"
    },
    {
        "name": "acar_cambodia_crawler",
        "script": "acar",  # API adds _crawler.py suffix
        "url": "https://acar.gov.kh",
        "display_name": "Accounting and Auditing Regulator",
        "description": "CIFRS, Annual audit requirements"
    }
]


def check_crawler_exists(crawler_name: str) -> bool:
    """Check if crawler is registered in Redis"""
    try:
        response = requests.get(f"{ASEANLEX_API}/crawler/crawler-directories")
        if response.status_code == 200:
            data = response.json()
            crawlers = data.get('directories', [])
            return any(c['name'] == crawler_name for c in crawlers)
    except Exception as e:
        print(f"[ERROR] Failed to check crawler existence: {e}")
    return False


def link_script_to_crawler(crawler_name: str, script_name: str) -> bool:
    """Link built-in script to crawler"""
    try:
        # Use the built-in crawler linking feature
        response = requests.post(
            f"{ASEANLEX_API}/crawler/crawler-directories/{crawler_name}/script",
            data={
                "builtIn": "true",
                "crawlerName": script_name
            }
        )
        
        if response.status_code == 200:
            print(f"[SUCCESS] Linked {script_name} to {crawler_name}")
            return True
        else:
            print(f"[ERROR] Failed to link script: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"[ERROR] Exception linking script: {e}")
        return False


def run_crawler(crawler_name: str, url: str) -> dict:
    """Run a crawler script"""
    try:
        response = requests.post(
            f"{ASEANLEX_API}/crawler/crawler-directories/{crawler_name}/script/run",
            json={"url": url}
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"[SUCCESS] Started crawler: {crawler_name}")
            print(f"  Job ID: {result.get('jobId', 'N/A')}")
            return result
        else:
            print(f"[ERROR] Failed to run crawler: {response.status_code} - {response.text}")
            return {"success": False, "error": response.text}
    except Exception as e:
        print(f"[ERROR] Exception running crawler: {e}")
        return {"success": False, "error": str(e)}


def get_crawler_status(crawler_name: str) -> dict:
    """Get crawler status"""
    try:
        response = requests.get(f"{ASEANLEX_API}/crawler/crawler-directories")
        if response.status_code == 200:
            data = response.json()
            crawlers = data.get('directories', [])
            for c in crawlers:
                if c['name'] == crawler_name:
                    return c
    except Exception as e:
        print(f"[ERROR] Failed to get crawler status: {e}")
    return {}


def main():
    """Main entry point"""
    print("=" * 70)
    print("CAMBODIA CRAWLERS RUNNER")
    print("Target: ASEANlex (aseanlex.luwi.dev)")
    print("=" * 70)
    
    # Parse command line arguments
    action = sys.argv[1] if len(sys.argv) > 1 else "status"
    crawler_filter = sys.argv[2] if len(sys.argv) > 2 else "all"
    
    if action == "status":
        # Show status of all crawlers
        print("\n[INFO] Checking crawler status...")
        for crawler in CAMBODIA_CRAWLERS:
            status = get_crawler_status(crawler['name'])
            exists = check_crawler_exists(crawler['name'])
            print(f"\n  {crawler['display_name']}:")
            print(f"    Name: {crawler['name']}")
            print(f"    Registered: {'Yes' if exists else 'No'}")
            print(f"    Items: {status.get('itemCount', 0)}")
            print(f"    Script Attached: {status.get('scriptAttached', False)}")
    
    elif action == "link":
        # Link scripts to crawlers
        print("\n[INFO] Linking scripts to crawlers...")
        for crawler in CAMBODIA_CRAWLERS:
            if crawler_filter != "all" and crawler['name'] != crawler_filter:
                continue
            
            print(f"\n  Linking {crawler['script']} -> {crawler['name']}...")
            link_script_to_crawler(crawler['name'], crawler['script'])
    
    elif action == "run":
        # Run crawlers
        print("\n[INFO] Running crawlers...")
        for crawler in CAMBODIA_CRAWLERS:
            if crawler_filter != "all" and crawler['name'] != crawler_filter:
                continue
            
            print(f"\n  Running {crawler['name']}...")
            print(f"  URL: {crawler['url']}")
            run_crawler(crawler['name'], crawler['url'])
            
            # Wait between crawlers to avoid overwhelming the server
            time.sleep(5)
    
    elif action == "setup":
        # Full setup: check, link, and run
        print("\n[INFO] Full setup: checking, linking, and running crawlers...")
        
        for crawler in CAMBODIA_CRAWLERS:
            if crawler_filter != "all" and crawler['name'] != crawler_filter:
                continue
            
            print(f"\n{'='*60}")
            print(f"Processing: {crawler['display_name']}")
            print(f"{'='*60}")
            
            # Check if exists
            exists = check_crawler_exists(crawler['name'])
            if not exists:
                print(f"  [WARN] Crawler not registered. Skipping...")
                continue
            
            # Link script
            print(f"  Linking script...")
            link_script_to_crawler(crawler['name'], crawler['script'])
            
            # Run crawler
            print(f"  Starting crawl...")
            run_crawler(crawler['name'], crawler['url'])
            
            time.sleep(3)
    
    else:
        print(f"\n[ERROR] Unknown action: {action}")
        print("Usage: python run_cambodia_crawlers.py [status|link|run|setup] [crawler_name]")
        print("\nActions:")
        print("  status - Show status of all crawlers")
        print("  link  - Link scripts to crawlers")
        print("  run   - Run crawlers")
        print("  setup - Full setup (check, link, run)")
        sys.exit(1)
    
    print("\n" + "=" * 70)
    print("DONE")
    print("=" * 70)


if __name__ == "__main__":
    main()
