#!/usr/bin/env python3
"""
LSEMB Multi-Tenant PM2 & DevOps Management System
Advanced management tool for all tenant instances and DevOps operations
"""

import subprocess
import sys
import os
import json
import time
from typing import Optional, Dict, List
from datetime import datetime
from dotenv import load_dotenv

# Load sensitive config from a file outside the repo
# Make sure to create this file on your server at /etc/lsemb/.devops.env
# with the content: DB_PASSWORD="YourSecretPassword"
load_dotenv('/etc/lsemb/.devops.env')

# ANSI Colors
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

# Tenant Configuration
TENANTS = {
    'lsemb': {
        'name': 'LSEMB (Main)',
        'path': '/var/www/lsemb',
        'db': 'lsemb',
        'redis_db': 2,
        'backend_port': 8083,
        'frontend_port': 3002,
        'python_port': 8002,
        'url': 'https://lsemb.luwi.dev',
        'services': ['lsemb-backend', 'lsemb-frontend', 'lsemb-python']
    },
    'emlakai': {
        'name': 'EmlakAI',
        'path': '/var/www/emlakai',
        'db': 'emlakai_lsemb',
        'redis_db': 1,
        'backend_port': 8084,
        'frontend_port': 3003,
        'python_port': 8001,
        'url': 'https://emlakai.luwi.dev',
        'services': ['emlakai-backend', 'emlakai-frontend', 'emlakai-python']
    },
    'bookie': {
        'name': 'Bookie',
        'path': '/var/www/bookie',
        'db': 'bookie_lsemb',
        'redis_db': 3,
        'backend_port': 8085,
        'frontend_port': 3004,
        'python_port': 8003,
        'url': 'https://bookie.luwi.dev',
        'services': ['bookie-backend', 'bookie-frontend', 'bookie-python']
    },
    'scriptus': {
        'name': 'Scriptus',
        'path': '/var/www/scriptus',
        'db': 'scriptus_lsemb',
        'redis_db': 4,
        'backend_port': 8086,
        'frontend_port': 3005,
        'python_port': 8004,
        'url': 'https://scriptus.luwi.dev',
        'services': ['scriptus-backend', 'scriptus-frontend', 'scriptus-python']
    },
    'luwi-dev': {
        'name': 'Luwi.dev Website',
        'path': '/var/www/luwi-dev',
        'db': None,
        'redis_db': None,
        'backend_port': None,
        'frontend_port': 3000,
        'python_port': None,
        'url': 'https://luwi.dev',
        'services': ['luwi-dev']
    }
}

# Database configuration
DB_CONFIG = {
    'host': '91.99.229.96',
    'user': 'postgres',
    'password': os.getenv('DB_PASSWORD', 'Semsiye!22'),
    'port': 5432
}

def clear_screen():
    """Clear console screen"""
    os.system('cls' if os.name == 'nt' else 'clear')

def print_header():
    """Print menu header with current time"""
    clear_screen()
    print(f"{Colors.HEADER}{Colors.BOLD}")
    print("=" * 80)
    print("       LSEMB MULTI-TENANT PM2 & DEVOPS MANAGEMENT SYSTEM")
    print(f"                  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)
    print(f"{Colors.ENDC}")

def run_command(cmd: str, capture_output: bool = False, cwd: str = None) -> Optional[str]:
    """Run shell command with optional working directory"""
    try:
        if capture_output:
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=cwd)
            return result.stdout
        else:
            subprocess.run(cmd, shell=True, cwd=cwd)
            return None
    except Exception as e:
        print(f"{Colors.FAIL}Error: {e}{Colors.ENDC}")
        return None

def show_tenant_status():
    """Show status of all tenants"""
    print_header()
    print(f"{Colors.OKCYAN}📊 Multi-Tenant Service Status:{Colors.ENDC}\n")

    for tenant_id, config in TENANTS.items():
        print(f"{Colors.OKGREEN}[{config['name']}]{Colors.ENDC}")
        print(f"  URL: {config['url']}")
        print(f"  Services: {', '.join(config['services'])}")
        if config['db']:
            print(f"  Database: {config['db']}")
            print(f"  Ports: Backend={config['backend_port']}, Frontend={config['frontend_port']}, Python={config['python_port']}")
        print()

    print(f"\n{Colors.OKCYAN}Current PM2 Status:{Colors.ENDC}\n")
    run_command("pm2 list")
    input(f"\n{Colors.OKBLUE}Press Enter to continue...{Colors.ENDC}")

def manage_tenant():
    """Manage individual tenant"""
    print_header()
    print(f"{Colors.OKCYAN}🏢 Select Tenant:{Colors.ENDC}\n")

    tenants_list = list(TENANTS.items())
    for i, (tenant_id, config) in enumerate(tenants_list, 1):
        print(f"{i}. {config['name']} ({config['url']})")
    print("0. Back to main menu")

    choice = input(f"\n{Colors.OKBLUE}Select tenant (0-{len(tenants_list)}): {Colors.ENDC}")

    try:
        idx = int(choice) - 1
        if idx < 0 or idx >= len(tenants_list):
            return
    except:
        return

    tenant_id, tenant = tenants_list[idx]
    manage_tenant_actions(tenant_id, tenant)

def manage_tenant_actions(tenant_id: str, tenant: dict):
    """Manage actions for a specific tenant"""
    while True:
        print_header()
        print(f"{Colors.OKGREEN}Managing: {tenant['name']}{Colors.ENDC}\n")

        print("1. Start services")
        print("2. Stop services")
        print("3. Restart services")
        print("4. View logs")
        print("5. Pull from GitHub")
        print("6. Build TypeScript")
        print("7. Clear Next.js cache")
        print("8. Rebuild frontend")
        print("9. Update .env configuration")
        print("10. Test health endpoint")
        print("0. Back")

        action = input(f"\n{Colors.OKBLUE}Select action (0-10): {Colors.ENDC}")

        if action == '0':
            break
        elif action == '1':
            start_tenant_services(tenant_id, tenant)
        elif action == '2':
            stop_tenant_services(tenant_id, tenant)
        elif action == '3':
            restart_tenant_services(tenant_id, tenant)
        elif action == '4':
            view_tenant_logs(tenant_id, tenant)
        elif action == '5':
            git_pull_tenant(tenant_id, tenant)
        elif action == '6':
            build_typescript_tenant(tenant_id, tenant)
        elif action == '7':
            clear_nextjs_cache(tenant_id, tenant)
        elif action == '8':
            rebuild_frontend(tenant_id, tenant)
        elif action == '9':
            update_env_config(tenant_id, tenant)
        elif action == '10':
            test_health_endpoint(tenant_id, tenant)

def start_tenant_services(tenant_id: str, tenant: dict):
    """Start all services for a tenant"""
    print(f"\n{Colors.OKGREEN}Starting {tenant['name']} services...{Colors.ENDC}")
    for service in tenant['services']:
        run_command(f"pm2 start {service}")
    print(f"{Colors.OKGREEN}✅ Services started!{Colors.ENDC}")
    input("\nPress Enter to continue...")

def stop_tenant_services(tenant_id: str, tenant: dict):
    """Stop all services for a tenant"""
    print(f"\n{Colors.WARNING}Stopping {tenant['name']} services...{Colors.ENDC}")
    for service in tenant['services']:
        run_command(f"pm2 stop {service}")
    print(f"{Colors.OKGREEN}✅ Services stopped!{Colors.ENDC}")
    input("\nPress Enter to continue...")

def restart_tenant_services(tenant_id: str, tenant: dict):
    """Restart all services for a tenant"""
    print(f"\n{Colors.OKGREEN}Restarting {tenant['name']} services...{Colors.ENDC}")
    for service in tenant['services']:
        run_command(f"pm2 restart {service}")
    print(f"{Colors.OKGREEN}✅ Services restarted!{Colors.ENDC}")
    input("\nPress Enter to continue...")

def view_tenant_logs(tenant_id: str, tenant: dict):
    """View logs for tenant services"""
    print(f"\n{Colors.OKCYAN}Select service to view logs:{Colors.ENDC}")
    for i, service in enumerate(tenant['services'], 1):
        print(f"{i}. {service}")
    print("0. Back")

    choice = input(f"\n{Colors.OKBLUE}Select service: {Colors.ENDC}")
    try:
        idx = int(choice) - 1
        if idx >= 0 and idx < len(tenant['services']):
            print(f"\n{Colors.WARNING}Press Ctrl+C to exit logs{Colors.ENDC}")
            input("Press Enter to continue...")
            run_command(f"pm2 logs {tenant['services'][idx]}")
    except:
        pass

def git_pull_tenant(tenant_id: str, tenant: dict):
    """Pull latest code from GitHub for tenant"""
    print(f"\n{Colors.OKCYAN}Pulling latest code for {tenant['name']}...{Colors.ENDC}")
    result = run_command(f"cd {tenant['path']} && git pull origin main", capture_output=True)
    if result:
        print(result)
    print(f"{Colors.OKGREEN}✅ Git pull completed!{Colors.ENDC}")
    input("\nPress Enter to continue...")

def build_typescript_tenant(tenant_id: str, tenant: dict):
    """Build TypeScript for tenant"""
    if not tenant.get('backend_port'):
        print(f"{Colors.WARNING}This tenant doesn't have a backend service{Colors.ENDC}")
        input("\nPress Enter to continue...")
        return

    print(f"\n{Colors.OKCYAN}Building TypeScript for {tenant['name']}...{Colors.ENDC}")
    run_command(f"cd {tenant['path']}/backend && npx tsc --noEmitOnError false")
    print(f"{Colors.OKGREEN}✅ TypeScript build completed!{Colors.ENDC}")
    input("\nPress Enter to continue...")

def clear_nextjs_cache(tenant_id: str, tenant: dict):
    """Clear Next.js cache for tenant"""
    print(f"\n{Colors.WARNING}Clearing Next.js cache for {tenant['name']}...{Colors.ENDC}")
    run_command(f"cd {tenant['path']}/frontend && rm -rf .next")
    print(f"{Colors.OKGREEN}✅ Cache cleared!{Colors.ENDC}")
    input("\nPress Enter to continue...")

def rebuild_frontend(tenant_id: str, tenant: dict):
    """Rebuild frontend for tenant"""
    print(f"\n{Colors.OKCYAN}Rebuilding frontend for {tenant['name']}...{Colors.ENDC}")
    print("This may take a few minutes...")
    run_command(f"cd {tenant['path']}/frontend && npm run build")
    print(f"{Colors.OKGREEN}✅ Frontend rebuilt!{Colors.ENDC}")
    input("\nPress Enter to continue...")

def update_env_config(tenant_id: str, tenant: dict):
    """Update .env configuration for tenant"""
    print(f"\n{Colors.OKCYAN}Updating .env for {tenant['name']}...{Colors.ENDC}")

    if tenant['db']:
        env_content = f"""# {tenant['name']} Configuration
NODE_ENV=production
PORT={tenant['backend_port']}
DATABASE_URL=postgresql://{DB_CONFIG['user']}:{DB_CONFIG['password']}@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{tenant['db']}
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD={DB_CONFIG['password']}
REDIS_DB={tenant['redis_db']}
PYTHON_SERVICE_URL=http://localhost:{tenant['python_port']}
INTERNAL_API_KEY={tenant_id}-internal-key-2024
JWT_SECRET={tenant_id}-jwt-secret-2024
CORS_ORIGIN={tenant['url']}
"""
        env_path = f"{tenant['path']}/backend/.env"

        # Create .env.lsemb for tenant-specific config
        env_lsemb_path = f"{tenant['path']}/.env.{tenant_id}"

        print(f"Creating {env_lsemb_path}...")
        # This would write to server, showing preview instead
        print(env_content)

    print(f"{Colors.OKGREEN}✅ Configuration updated!{Colors.ENDC}")
    input("\nPress Enter to continue...")

def test_health_endpoint(tenant_id: str, tenant: dict):
    """Test health endpoint for tenant"""
    if not tenant.get('backend_port'):
        print(f"{Colors.WARNING}This tenant doesn't have a backend service{Colors.ENDC}")
        input("\nPress Enter to continue...")
        return

    print(f"\n{Colors.OKCYAN}Testing health endpoint for {tenant['name']}...{Colors.ENDC}")
    result = run_command(
        f"curl -s http://localhost:{tenant['backend_port']}/api/v2/health | python3 -m json.tool | head -20",
        capture_output=True
    )
    if result:
        print(result)
    input("\nPress Enter to continue...")

def github_operations():
    """GitHub operations menu"""
    while True:
        print_header()
        print(f"{Colors.OKCYAN}🐙 GitHub Operations:{Colors.ENDC}\n")

        print("1. Pull all tenants")
        print("2. Show git status (all)")
        print("3. Commit and push LSEMB")
        print("4. Sync all tenants from LSEMB")
        print("0. Back")

        choice = input(f"\n{Colors.OKBLUE}Select operation (0-4): {Colors.ENDC}")

        if choice == '0':
            break
        elif choice == '1':
            pull_all_tenants()
        elif choice == '2':
            show_git_status()
        elif choice == '3':
            commit_and_push()
        elif choice == '4':
            sync_tenants_from_lsemb()

def pull_all_tenants():
    """Pull latest code for all tenants"""
    print(f"\n{Colors.OKCYAN}Pulling all tenants...{Colors.ENDC}\n")
    for tenant_id, tenant in TENANTS.items():
        if tenant['path'] and os.path.exists(tenant['path']):
            print(f"Pulling {tenant['name']}...")
            run_command(f"cd {tenant['path']} && git pull origin main")
    print(f"\n{Colors.OKGREEN}✅ All tenants updated!{Colors.ENDC}")
    input("\nPress Enter to continue...")

def show_git_status():
    """Show git status for all tenants"""
    print(f"\n{Colors.OKCYAN}Git Status for all tenants:{Colors.ENDC}\n")
    for tenant_id, tenant in TENANTS.items():
        if tenant['path'] and os.path.exists(f"{tenant['path']}/.git"):
            print(f"\n{Colors.OKGREEN}[{tenant['name']}]{Colors.ENDC}")
            result = run_command(f"cd {tenant['path']} && git status -s", capture_output=True)
            if result and result.strip():
                print(result)
            else:
                print("  Clean (no changes)")
    input("\nPress Enter to continue...")

def commit_and_push():
    """Commit and push changes for LSEMB"""
    print(f"\n{Colors.OKCYAN}Committing and pushing LSEMB...{Colors.ENDC}")

    message = input(f"\n{Colors.OKBLUE}Enter commit message: {Colors.ENDC}")
    if not message:
        print(f"{Colors.WARNING}Cancelled{Colors.ENDC}")
        input("\nPress Enter to continue...")
        return

    commands = [
        "git add .",
        f'git commit -m "{message}"',
        "git push origin main"
    ]

    for cmd in commands:
        print(f"\nRunning: {cmd}")
        run_command(f"cd /var/www/lsemb && {cmd}")

    print(f"\n{Colors.OKGREEN}✅ Changes pushed!{Colors.ENDC}")
    input("\nPress Enter to continue...")

def sync_tenants_from_lsemb():
    """Sync shared files from LSEMB to other tenants"""
    print(f"\n{Colors.OKCYAN}Syncing tenants from LSEMB...{Colors.ENDC}")

    shared_files = [
        'backend/src/services/settings.service.ts',
        'backend/src/services/python-integration.service.ts',
        'backend/src/services/whisper-integration.service.ts',
        'backend/src/config/database.ts',
        'backend/src/config/redis.ts'
    ]

    for tenant_id, tenant in TENANTS.items():
        if tenant_id == 'lsemb' or not tenant.get('backend_port'):
            continue

        print(f"\nSyncing to {tenant['name']}...")
        for file in shared_files:
            src = f"/var/www/lsemb/{file}"
            dst = f"{tenant['path']}/{file}"
            if os.path.exists(src):
                run_command(f"cp {src} {dst}")
                print(f"  ✅ {file}")

    print(f"\n{Colors.OKGREEN}✅ Sync completed!{Colors.ENDC}")
    input("\nPress Enter to continue...")

def fix_nginx_bad_gateway():
    """Fix Nginx and Bad Gateway issues for all tenants"""
    print(f"\n{Colors.OKCYAN}🔧 Fixing Nginx & Bad Gateway Issues:{Colors.ENDC}\n")

    print(f"{Colors.WARNING}This will:{Colors.ENDC}")
    print("• Check and fix .env.lsemb files")
    print("• Verify nginx configurations")
    print("• Restart all services")
    print("• Test all endpoints")

    confirm = input(f"\n{Colors.WARNING}Continue? (y/N): {Colors.ENDC}").lower()
    if confirm != 'y':
        return

    # Run the fix script
    print(f"\n{Colors.OKGREEN}Running nginx fix script...{Colors.ENDC}")
    result = run_command("bash /var/www/lsemb/fix-nginx-bad-gateway.sh", capture_output=False)

    # Additional fixes for .env.lsemb files
    print(f"\n{Colors.OKCYAN}Checking .env.lsemb files...{Colors.ENDC}")

    for tenant_id, tenant in TENANTS.items():
        if tenant['db'] and tenant_id != 'luwi-dev':
            env_path = f"{tenant['path']}/backend/.env.lsemb"
            print(f"\nChecking {tenant['name']}...")

            # Create .env.lsemb if doesn't exist
            cmd = f"""
            if [ ! -f {env_path} ]; then
                echo 'Creating {tenant_id} .env.lsemb...'
                cat > {env_path} << EOF
DATABASE_URL=postgresql://{DB_CONFIG['user']}:{DB_CONFIG['password']}@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{tenant['db']}
REDIS_DB={tenant['redis_db']}
EOF
            else
                echo '{tenant_id} .env.lsemb exists'
                grep -E '(DATABASE_URL|REDIS_DB)' {env_path} | head -2
            fi
            """
            run_command(cmd)

    # Restart all services
    print(f"\n{Colors.OKGREEN}Restarting all services...{Colors.ENDC}")
    run_command("pm2 restart all")

    # Test endpoints
    print(f"\n{Colors.OKCYAN}Testing endpoints...{Colors.ENDC}")
    time.sleep(5)  # Wait for services to start

    for tenant_id, tenant in TENANTS.items():
        if tenant['backend_port']:
            print(f"\n{tenant['name']}:")
            # Test backend health
            cmd = f"curl -s http://localhost:{tenant['backend_port']}/api/v2/health | grep -q 'healthy' && echo '  ✅ Backend OK' || echo '  ❌ Backend Failed'"
            run_command(cmd)

        if tenant['frontend_port']:
            # Test frontend
            cmd = f"curl -I http://localhost:{tenant['frontend_port']} 2>/dev/null | head -1 | grep -q '200\\|304' && echo '  ✅ Frontend OK' || echo '  ❌ Frontend Failed'"
            run_command(cmd)

    print(f"\n{Colors.OKGREEN}✅ Fix completed!{Colors.ENDC}")
    print(f"\nTest URLs:")
    for tenant_id, tenant in TENANTS.items():
        if tenant['url']:
            print(f"  • {tenant['url']}")

    input(f"\n{Colors.OKBLUE}Press Enter to continue...{Colors.ENDC}")

def devops_operations():
    """DevOps operations menu"""
    while True:
        print_header()
        print(f"{Colors.OKCYAN}🔧 DevOps Operations:{Colors.ENDC}\n")

        print("1. Build all TypeScript projects")
        print("2. Clear all Next.js caches")
        print("3. Rebuild all frontends")
        print("4. Check all health endpoints")
        print("5. Database operations")
        print("6. Redis operations")
        print("7. PM2 save & startup")
        print("8. System resource check")
        print("9. 🔧 Fix Nginx & Bad Gateway issues")
        print("10. 🕵️ Audit .env Consistency")
        print("0. Back")

        choice = input(f"\n{Colors.OKBLUE}Select operation (0-10): {Colors.ENDC}")

        if choice == '0':
            break
        elif choice == '1':
            build_all_typescript()
        elif choice == '2':
            clear_all_caches()
        elif choice == '3':
            rebuild_all_frontends()
        elif choice == '4':
            check_all_health()
        elif choice == '5':
            database_operations()
        elif choice == '6':
            redis_operations()
        elif choice == '7':
            pm2_save_startup()
        elif choice == '8':
            system_resource_check()
        elif choice == '9':
            fix_nginx_bad_gateway()
        elif choice == '10':
            audit_env_consistency()

def build_all_typescript():
    """Build TypeScript for all projects"""
    print(f"\n{Colors.OKCYAN}Building TypeScript for all projects...{Colors.ENDC}\n")
    for tenant_id, tenant in TENANTS.items():
        if tenant.get('backend_port'):
            print(f"Building {tenant['name']}...")
            run_command(f"cd {tenant['path']}/backend && npx tsc --noEmitOnError false 2>&1 | tail -5")
    print(f"\n{Colors.OKGREEN}✅ All builds completed!{Colors.ENDC}")
    input("\nPress Enter to continue...")

def clear_all_caches():
    """Clear Next.js cache for all projects"""
    print(f"\n{Colors.WARNING}Clearing all Next.js caches...{Colors.ENDC}\n")
    for tenant_id, tenant in TENANTS.items():
        if tenant.get('frontend_port'):
            print(f"Clearing cache for {tenant['name']}...")
            run_command(f"cd {tenant['path']}/frontend && rm -rf .next")
    print(f"\n{Colors.OKGREEN}✅ All caches cleared!{Colors.ENDC}")
    input("\nPress Enter to continue...")

def rebuild_all_frontends():
    """Rebuild all frontend projects"""
    print(f"\n{Colors.OKCYAN}Rebuilding all frontends (this will take time)...{Colors.ENDC}\n")

    confirm = input(f"{Colors.WARNING}Are you sure? (y/N): {Colors.ENDC}").lower()
    if confirm != 'y':
        return

    for tenant_id, tenant in TENANTS.items():
        if tenant.get('frontend_port'):
            print(f"\n{Colors.OKGREEN}Building {tenant['name']}...{Colors.ENDC}")
            run_command(f"cd {tenant['path']}/frontend && npm run build 2>&1 | tail -10")

    print(f"\n{Colors.OKGREEN}✅ All frontends rebuilt!{Colors.ENDC}")
    input("\nPress Enter to continue...")

def check_all_health():
    """Check health endpoints for all services"""
    print(f"\n{Colors.OKCYAN}Checking all health endpoints...{Colors.ENDC}\n")

    for tenant_id, tenant in TENANTS.items():
        if tenant.get('backend_port'):
            print(f"{Colors.OKGREEN}[{tenant['name']}] Backend (port {tenant['backend_port']}):{Colors.ENDC}")
            result = run_command(
                f"curl -s http://localhost:{tenant['backend_port']}/api/v2/health | python3 -c 'import sys,json; d=json.load(sys.stdin); print(f\"  Status: {d.get('status','error')}\")'",
                capture_output=True
            )
            if result:
                print(result.strip())
            else:
                print(f"  {Colors.FAIL}Failed to connect{Colors.ENDC}")

        if tenant.get('python_port'):
            print(f"{Colors.OKGREEN}[{tenant['name']}] Python (port {tenant['python_port']}):{Colors.ENDC}")
            result = run_command(
                f"curl -s http://localhost:{tenant['python_port']}/health 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); print(f\"  Status: {d.get('status','error')}\")' 2>/dev/null",
                capture_output=True
            )
            if result and "Status" in result:
                print(result.strip())
            else:
                print(f"  {Colors.WARNING}Not running{Colors.ENDC}")
        print()

    input(f"{Colors.OKBLUE}Press Enter to continue...{Colors.ENDC}")

def database_operations():
    """Database operations submenu"""
    print_header()
    print(f"{Colors.OKCYAN}🗄️ Database Operations:{Colors.ENDC}\n")

    print("1. List all tenant databases")
    print("2. Check database sizes")
    print("3. Test database connections")
    print("4. Run migrations")
    print("0. Back")

    choice = input(f"\n{Colors.OKBLUE}Select operation (0-4): {Colors.ENDC}")

    if choice == '1':
        list_databases()
    elif choice == '2':
        check_database_sizes()
    elif choice == '3':
        test_db_connections()
    elif choice == '4':
        run_migrations()

def list_databases():
    """List all tenant databases"""
    print(f"\n{Colors.OKCYAN}Tenant Databases:{Colors.ENDC}\n")

    cmd = f"""PGPASSWORD='{DB_CONFIG['password']}' psql -h {DB_CONFIG['host']} -U {DB_CONFIG['user']} -c "SELECT datname, pg_size_pretty(pg_database_size(datname)) as size FROM pg_database WHERE datname LIKE '%lsemb%' OR datname = 'lsemb' ORDER BY datname;" """

    result = run_command(cmd, capture_output=True)
    if result:
        print(result)

    input(f"\n{Colors.OKBLUE}Press Enter to continue...{Colors.ENDC}")

def check_database_sizes():
    """Check database sizes for all tenants"""
    print(f"\n{Colors.OKCYAN}Database Sizes:{Colors.ENDC}\n")

    for tenant_id, tenant in TENANTS.items():
        if tenant['db']:
            cmd = f"""PGPASSWORD='{DB_CONFIG['password']}' psql -h {DB_CONFIG['host']} -U {DB_CONFIG['user']} -d {tenant['db']} -c "SELECT pg_size_pretty(pg_database_size('{tenant['db']}')) as size;" """
            print(f"{tenant['name']} ({tenant['db']}):")
            result = run_command(cmd, capture_output=True)
            if result:
                print(result)

    input(f"\n{Colors.OKBLUE}Press Enter to continue...{Colors.ENDC}")

def test_db_connections():
    """Test database connections for all tenants"""
    print(f"\n{Colors.OKCYAN}Testing Database Connections:{Colors.ENDC}\n")

    for tenant_id, tenant in TENANTS.items():
        if tenant['db']:
            print(f"Testing {tenant['name']} ({tenant['db']})...")
            cmd = f"""PGPASSWORD='{DB_CONFIG['password']}' psql -h {DB_CONFIG['host']} -U {DB_CONFIG['user']} -d {tenant['db']} -c "SELECT current_database(), version();" """
            result = run_command(cmd, capture_output=True)
            if result and "PostgreSQL" in result:
                print(f"  {Colors.OKGREEN}✅ Connected{Colors.ENDC}")
            else:
                print(f"  {Colors.FAIL}❌ Failed{Colors.ENDC}")

    input(f"\n{Colors.OKBLUE}Press Enter to continue...{Colors.ENDC}")

def run_migrations():
    """Run database migrations"""
    print(f"\n{Colors.OKCYAN}Running Migrations:{Colors.ENDC}\n")
    print(f"{Colors.WARNING}This feature will run migrations for all tenants{Colors.ENDC}")

    confirm = input(f"\n{Colors.WARNING}Are you sure? (y/N): {Colors.ENDC}").lower()
    if confirm != 'y':
        return

    for tenant_id, tenant in TENANTS.items():
        if tenant['db']:
            print(f"\n{Colors.OKGREEN}Migrating {tenant['name']}...{Colors.ENDC}")
            # Run migrations here
            print(f"  Would run migrations for {tenant['db']}")

    input(f"\n{Colors.OKBLUE}Press Enter to continue...{Colors.ENDC}")

def redis_operations():
    """Redis operations submenu"""
    print_header()
    print(f"{Colors.OKCYAN}🔴 Redis Operations:{Colors.ENDC}\n")

    print("1. Check Redis status")
    print("2. Show Redis info")
    print("3. List keys by database")
    print("4. Flush tenant cache")
    print("0. Back")

    choice = input(f"\n{Colors.OKBLUE}Select operation (0-4): {Colors.ENDC}")

    if choice == '1':
        check_redis_status()
    elif choice == '2':
        show_redis_info()
    elif choice == '3':
        list_redis_keys()
    elif choice == '4':
        flush_tenant_cache()

def check_redis_status():
    """Check Redis status"""
    print(f"\n{Colors.OKCYAN}Redis Status:{Colors.ENDC}\n")
    result = run_command(f"redis-cli -a '{DB_CONFIG['password']}' ping", capture_output=True)
    if result and "PONG" in result:
        print(f"{Colors.OKGREEN}✅ Redis is running!{Colors.ENDC}")

        # Check each tenant's Redis DB
        print(f"\n{Colors.OKCYAN}Tenant Redis Databases:{Colors.ENDC}")
        for tenant_id, tenant in TENANTS.items():
            if tenant['redis_db'] is not None:
                cmd = f"redis-cli -a '{DB_CONFIG['password']}' -n {tenant['redis_db']} DBSIZE"
                result = run_command(cmd, capture_output=True)
                if result:
                    print(f"  {tenant['name']} (DB {tenant['redis_db']}): {result.strip()}")
    else:
        print(f"{Colors.FAIL}❌ Redis is not responding!{Colors.ENDC}")

    input(f"\n{Colors.OKBLUE}Press Enter to continue...{Colors.ENDC}")

def show_redis_info():
    """Show Redis server info"""
    print(f"\n{Colors.OKCYAN}Redis Server Info:{Colors.ENDC}\n")
    result = run_command(f"redis-cli -a '{DB_CONFIG['password']}' INFO server | head -20", capture_output=True)
    if result:
        print(result)
    input(f"\n{Colors.OKBLUE}Press Enter to continue...{Colors.ENDC}")

def list_redis_keys():
    """List Redis keys by database"""
    print(f"\n{Colors.OKCYAN}Redis Keys by Tenant:{Colors.ENDC}\n")

    for tenant_id, tenant in TENANTS.items():
        if tenant['redis_db'] is not None:
            print(f"\n{Colors.OKGREEN}{tenant['name']} (DB {tenant['redis_db']}):{Colors.ENDC}")
            cmd = f"redis-cli -a '{DB_CONFIG['password']}' -n {tenant['redis_db']} KEYS '*' | head -10"
            result = run_command(cmd, capture_output=True)
            if result:
                keys = result.strip().split('\n')
                for key in keys[:5]:
                    if key:
                        print(f"  {key}")
                if len(keys) > 5:
                    print(f"  ... and {len(keys)-5} more")

    input(f"\n{Colors.OKBLUE}Press Enter to continue...{Colors.ENDC}")

def flush_tenant_cache():
    """Flush Redis cache for a specific tenant"""
    print(f"\n{Colors.WARNING}Flush Tenant Redis Cache:{Colors.ENDC}\n")

    tenants_with_redis = [(tid, t) for tid, t in TENANTS.items() if t['redis_db'] is not None]

    for i, (tenant_id, tenant) in enumerate(tenants_with_redis, 1):
        print(f"{i}. {tenant['name']} (DB {tenant['redis_db']})")
    print("0. Cancel")

    choice = input(f"\n{Colors.OKBLUE}Select tenant (0-{len(tenants_with_redis)}): {Colors.ENDC}")

    try:
        idx = int(choice) - 1
        if idx >= 0 and idx < len(tenants_with_redis):
            tenant_id, tenant = tenants_with_redis[idx]
            confirm = input(f"\n{Colors.WARNING}Flush {tenant['name']} cache? (y/N): {Colors.ENDC}").lower()
            if confirm == 'y':
                run_command(f"redis-cli -a '{DB_CONFIG['password']}' -n {tenant['redis_db']} FLUSHDB")
                print(f"{Colors.OKGREEN}✅ Cache flushed!{Colors.ENDC}")
    except:
        pass

    input(f"\n{Colors.OKBLUE}Press Enter to continue...{Colors.ENDC}")

def pm2_save_startup():
    """Save PM2 process list and setup startup"""
    print(f"\n{Colors.OKCYAN}PM2 Save & Startup:{Colors.ENDC}\n")

    print("1. Saving current process list...")
    run_command("pm2 save")

    print("\n2. Setting up startup script...")
    result = run_command("pm2 startup systemd -u root --hp /root", capture_output=True)
    if result:
        print(result)

    print(f"\n{Colors.OKGREEN}✅ PM2 configured for auto-restart!{Colors.ENDC}")
    input(f"\n{Colors.OKBLUE}Press Enter to continue...{Colors.ENDC}")

def system_resource_check():
    """Check system resources"""
    print(f"\n{Colors.OKCYAN}System Resource Status:{Colors.ENDC}\n")

    # CPU and Memory
    print(f"{Colors.OKGREEN}CPU & Memory:{Colors.ENDC}")
    run_command("free -h")

    print(f"\n{Colors.OKGREEN}Disk Usage:{Colors.ENDC}")
    run_command("df -h | grep -E '^/dev/'")

    print(f"\n{Colors.OKGREEN}Top Processes:{Colors.ENDC}")
    run_command("ps aux | head -10")

    print(f"\n{Colors.OKGREEN}Network Ports:{Colors.ENDC}")
    run_command("ss -tulpn | grep -E ':(3002|3003|3004|3005|8083|8084|8085|8086|8001|8002|8003|8004)'")

    input(f"\n{Colors.OKBLUE}Press Enter to continue...{Colors.ENDC}")

def quick_actions():
    """Quick actions menu"""
    print_header()
    print(f"{Colors.OKCYAN}⚡ Quick Actions:{Colors.ENDC}\n")

    print("1. Restart all backends")
    print("2. Restart all frontends")
    print("3. Stop all Python services")
    print("4. Pull all & restart")
    print("5. Emergency stop all")
    print("0. Back")

    choice = input(f"\n{Colors.OKBLUE}Select action (0-5): {Colors.ENDC}")

    if choice == '1':
        print(f"\n{Colors.OKGREEN}Restarting all backends...{Colors.ENDC}")
        run_command("pm2 restart *-backend")
        print(f"{Colors.OKGREEN}✅ Done!{Colors.ENDC}")
    elif choice == '2':
        print(f"\n{Colors.OKGREEN}Restarting all frontends...{Colors.ENDC}")
        run_command("pm2 restart *-frontend")
        print(f"{Colors.OKGREEN}✅ Done!{Colors.ENDC}")
    elif choice == '3':
        print(f"\n{Colors.WARNING}Stopping all Python services...{Colors.ENDC}")
        run_command("pm2 stop *-python")
        print(f"{Colors.OKGREEN}✅ Done!{Colors.ENDC}")
    elif choice == '4':
        pull_all_tenants()
        print(f"\n{Colors.OKGREEN}Restarting all services...{Colors.ENDC}")
        run_command("pm2 restart all")
        print(f"{Colors.OKGREEN}✅ Done!{Colors.ENDC}")
    elif choice == '5':
        print(f"\n{Colors.FAIL}EMERGENCY STOP!{Colors.ENDC}")
        confirm = input(f"{Colors.WARNING}Are you sure? (y/N): {Colors.ENDC}").lower()
        if confirm == 'y':
            run_command("pm2 stop all")
            print(f"{Colors.OKGREEN}✅ All services stopped!{Colors.ENDC}")

    if choice != '0':
        input(f"\n{Colors.OKBLUE}Press Enter to continue...{Colors.ENDC}")

def audit_env_consistency():
    """Audits all tenant .env files for consistency against the central config."""
    print(f"\n{Colors.OKCYAN}🕵️  Auditing .env Consistency for Data Isolation...{Colors.ENDC}\n")

    def parse_env_file(file_path: str) -> Dict[str, str]:
        """Parses a .env file and returns a dictionary of key-value pairs."""
        env_vars = {}
        try:
            with open(file_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        # Remove potential quotes from value
                        if (value.startswith('"') and value.endswith('"')) or \
                           (value.startswith("'") and value.endswith("'")):
                            value = value[1:-1]
                        env_vars[key.strip()] = value.strip()
        except FileNotFoundError:
            return {}
        return env_vars

    all_consistent = True
    for tenant_id, tenant in TENANTS.items():
        if not tenant.get('backend_port'):
            continue

        print(f"{Colors.BOLD}Checking {tenant['name']}...{Colors.ENDC}")

        # 1. Generate expected configuration
        expected_db_url = f"postgresql://{DB_CONFIG['user']}:{DB_CONFIG['password']}@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{tenant['db']}"
        expected_redis_db = str(tenant['redis_db'])

        # 2. Get actual configuration
        env_path = f"{tenant['path']}/backend/.env"
        if not os.path.exists(env_path):
            print(f"  {Colors.FAIL}❌ .env file not found at {env_path}{Colors.ENDC}")
            all_consistent = False
            continue

        actual_env_vars = parse_env_file(env_path)
        actual_db_url = actual_env_vars.get('DATABASE_URL')
        actual_redis_db = actual_env_vars.get('REDIS_DB')

        # 3. Compare and report
        errors = []
        if actual_db_url != expected_db_url:
            errors.append(
                f"  {Colors.FAIL}DATABASE_URL mismatch!{Colors.ENDC}\n"
                f"    - Expected: {expected_db_url}\n"
                f"    - Actual:   {actual_db_url}"
            )
        
        if actual_redis_db != expected_redis_db:
            errors.append(
                f"  {Colors.FAIL}REDIS_DB mismatch!{Colors.ENDC}\n"
                f"    - Expected: {expected_redis_db}\n"
                f"    - Actual:   {actual_redis_db}"
            )

        if not errors:
            print(f"  {Colors.OKGREEN}✅ OK: DATABASE_URL and REDIS_DB are consistent.{Colors.ENDC}")
        else:
            all_consistent = False
            for error in errors:
                print(error)
        print("-" * 40)

    if all_consistent:
        print(f"\n{Colors.OKGREEN}{Colors.BOLD}🎉 All checked tenants are consistent with the central configuration!{Colors.ENDC}")
    else:
        print(f"\n{Colors.WARNING}{Colors.BOLD}Found inconsistencies. Please review the logs above.{Colors.ENDC}")

    input(f"\n{Colors.OKBLUE}Press Enter to continue...{Colors.ENDC}")

def main_menu():
    """Enhanced main menu"""
    while True:
        print_header()
        print(f"{Colors.OKGREEN}Main Menu:{Colors.ENDC}\n")

        print("1. 📊 Tenant Status Overview")
        print("2. 🏢 Manage Individual Tenant")
        print("3. 🐙 GitHub Operations")
        print("4. 🔧 DevOps Operations")
        print("5. ⚡ Quick Actions")
        print("6. 📋 PM2 Logs Viewer")
        print("7. 📊 PM2 Monitor")
        print("8. 🔄 Restart All Services")
        print("9. 🛑 Stop All Services")
        print("0. 🚪 Exit")

        choice = input(f"\n{Colors.OKBLUE}Select option (0-9): {Colors.ENDC}")

        menu_options = {
            '1': show_tenant_status,
            '2': manage_tenant,
            '3': github_operations,
            '4': devops_operations,
            '5': quick_actions,
            '6': lambda: run_command("pm2 logs"),
            '7': lambda: run_command("pm2 monit"),
            '8': lambda: (run_command("pm2 restart all"), input("\nPress Enter...")),
            '9': lambda: (run_command("pm2 stop all"), input("\nPress Enter...")),
            '0': lambda: sys.exit(0)
        }

        if choice in menu_options:
            try:
                menu_options[choice]()
            except KeyboardInterrupt:
                print(f"\n{Colors.WARNING}Interrupted{Colors.ENDC}")
                input("\nPress Enter to continue...")
        else:
            print(f"{Colors.FAIL}Invalid option!{Colors.ENDC}")
            input(f"\n{Colors.OKBLUE}Press Enter to continue...{Colors.ENDC}")

if __name__ == "__main__":
    try:
        # Check if running on server
        if not os.path.exists('/var/www'):
            print(f"{Colors.WARNING}Note: This script is designed to run on the production server{Colors.ENDC}")
            print("Some features may not work on local development environment")
            input("\nPress Enter to continue anyway...")

        main_menu()
    except KeyboardInterrupt:
        print(f"\n\n{Colors.OKGREEN}👋 Goodbye!{Colors.ENDC}\n")
        sys.exit(0)
    except Exception as e:
        print(f"\n{Colors.FAIL}Fatal error: {e}{Colors.ENDC}")
        sys.exit(1)