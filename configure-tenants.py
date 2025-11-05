#!/usr/bin/env python3
"""
Multi-Tenant Configuration Manager
Ensures each tenant has proper configuration for database and services
"""

import os
import json
import subprocess
import sys
from pathlib import Path

# Tenant configurations
TENANTS = {
    'lsemb': {
        'name': 'LSEMB',
        'domain': 'lsemb.luwi.dev',
        'path': 'c:/xampp/htdocs/lsemb',
        'backend_port': 8083,
        'frontend_port': 3002,
        'python_port': 8002,
        'db_name': 'lsemb',
        'redis_db': 2,
        'jwt_secret': 'lsemb-jwt-secret-2024',
        'internal_key': 'lsemb-internal-key-2024'
    },
    'emlakai': {
        'name': 'EmlakAI',
        'domain': 'emlakai.luwi.dev',
        'path': 'c:/xampp/htdocs/emlakai',
        'backend_port': 8084,
        'frontend_port': 3003,
        'python_port': 8001,
        'db_name': 'emlakai_lsemb',
        'redis_db': 1,
        'jwt_secret': 'emlakai-jwt-secret-2024',
        'internal_key': 'emlakai-internal-key-2024'
    },
    'bookie': {
        'name': 'Bookie',
        'domain': 'bookie.luwi.dev',
        'path': 'c:/xampp/htdocs/bookie',
        'backend_port': 8085,
        'frontend_port': 3004,
        'python_port': 8003,
        'db_name': 'bookie_lsemb',
        'redis_db': 3,
        'jwt_secret': 'bookie-jwt-secret-2024',
        'internal_key': 'bookie-internal-key-2024'
    },
    'luwi': {
        'name': 'Luwi.dev',
        'domain': 'luwi.dev',
        'path': 'c:/xampp/htdocs/luwi-dev',
        'backend_port': None,
        'frontend_port': 3000,
        'python_port': None,
        'db_name': None,
        'redis_db': None,
        'jwt_secret': None,
        'internal_key': None
    }
}

# Database configuration
DB_CONFIG = {
    'local': {
        'host': 'localhost',
        'port': 5432,
        'user': 'postgres',
        'password': '12Kemal1221'
    },
    'remote': {
        'host': '91.99.229.96',
        'port': 5432,
        'user': 'postgres',
        'password': 'Semsiye!22'
    }
}

def create_env_lsemb(tenant_id, config, environment='local'):
    """Create .env.lsemb file for a tenant"""
    db_config = DB_CONFIG[environment]

    env_content = f"""# {config['name']} Environment Configuration (.env.{tenant_id})
# This file contains tenant-specific configuration
# It should be loaded by the application

# Application
APP_NAME={config['name']}
TENANT_ID={tenant_id}
NODE_ENV={'development' if environment == 'local' else 'production'}

# Ports
PORT={config['backend_port'] if config['backend_port'] else ''}
FRONTEND_PORT={config['frontend_port']}
PYTHON_SERVICE_PORT={config['python_port'] if config['python_port'] else ''}

# Database
DATABASE_URL=postgresql://{db_config['user']}:{db_config['password']}@{db_config['host']}:{db_config['port']}/{config['db_name'] if config['db_name'] else ''}

# Redis
REDIS_HOST={'localhost' if environment == 'local' else 'localhost'}
REDIS_PORT=6379
REDIS_PASSWORD={'' if environment == 'local' else db_config['password']}
REDIS_DB={config['redis_db'] if config['redis_db'] else ''}

# Python Service
PYTHON_SERVICE_URL=http://localhost:{config['python_port'] if config['python_port'] else ''}

# Security
JWT_SECRET={config['jwt_secret'] if config['jwt_secret'] else ''}
INTERNAL_API_KEY={config['internal_key'] if config['internal_key'] else ''}

# CORS
CORS_ORIGIN={'http://localhost:' + str(config['frontend_port']) if environment == 'local' else 'https://' + config['domain']}

# Domain
PUBLIC_URL={'http://localhost:' + str(config['frontend_port']) if environment == 'local' else 'https://' + config['domain']}
API_URL={'http://localhost:' + str(config['backend_port']) if config['backend_port'] and environment == 'local' else ('https://' + config['domain'] if config['backend_port'] else '')}
"""

    return env_content

def create_backend_env(tenant_id, config, environment='local'):
    """Create backend/.env file for a tenant"""
    db_config = DB_CONFIG[environment]

    if not config['backend_port']:
        return None

    env_content = f"""# {config['name']} Backend Configuration
NODE_ENV={'development' if environment == 'local' else 'production'}
PORT={config['backend_port']}
DATABASE_URL=postgresql://{db_config['user']}:{db_config['password']}@{db_config['host']}:{db_config['port']}/{config['db_name']}
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD={'' if environment == 'local' else db_config['password']}
REDIS_DB={config['redis_db']}
PYTHON_SERVICE_URL=http://localhost:{config['python_port']}
INTERNAL_API_KEY={config['internal_key']}
JWT_SECRET={config['jwt_secret']}
CORS_ORIGIN={'http://localhost:' + str(config['frontend_port']) if environment == 'local' else 'https://' + config['domain']}

# OpenAI (use environment variable OPENAI_API_KEY)
# Set this in your environment, not in the code
"""

    return env_content

def create_frontend_env(tenant_id, config, environment='local'):
    """Create frontend/.env.local file for a tenant"""
    if environment == 'local':
        env_content = f"""# {config['name']} Frontend Configuration
NEXT_PUBLIC_API_URL=http://localhost:{config['backend_port'] if config['backend_port'] else '3000'}
NEXT_PUBLIC_GRAPHQL_URL=http://localhost:{config['backend_port'] if config['backend_port'] else '3000'}/graphql
NEXT_PUBLIC_WS_URL=ws://localhost:{config['backend_port'] if config['backend_port'] else '3000'}
NEXT_PUBLIC_APP_NAME={config['name']}
NEXT_PUBLIC_TENANT_ID={tenant_id}
"""
    else:
        env_content = f"""# {config['name']} Frontend Configuration
NEXT_PUBLIC_API_URL=https://{config['domain']}
NEXT_PUBLIC_GRAPHQL_URL=https://{config['domain']}/graphql
NEXT_PUBLIC_WS_URL=wss://{config['domain']}
NEXT_PUBLIC_APP_NAME={config['name']}
NEXT_PUBLIC_TENANT_ID={tenant_id}
"""

    return env_content

def create_ecosystem_config(tenant_id, config):
    """Create ecosystem.config.js for PM2"""
    if not config['backend_port']:
        # For static sites like luwi.dev
        return f"""module.exports = {{
  apps: [
    {{
      name: '{tenant_id}-frontend',
      script: 'npm',
      args: 'start',
      cwd: '{config['path']}/frontend',
      env: {{
        PORT: {config['frontend_port']},
        NODE_ENV: 'production'
      }}
    }}
  ]
}};
"""

    # For full-stack tenants
    return f"""module.exports = {{
  apps: [
    {{
      name: '{tenant_id}-backend',
      script: 'node',
      args: 'dist/server.js',
      cwd: '{config['path']}/backend',
      env: {{
        PORT: {config['backend_port']},
        NODE_ENV: 'production'
      }},
      env_file: '{config['path']}/.env.{tenant_id}'
    }},
    {{
      name: '{tenant_id}-frontend',
      script: 'npm',
      args: 'start',
      cwd: '{config['path']}/frontend',
      env: {{
        PORT: {config['frontend_port']},
        NODE_ENV: 'production'
      }}
    }},
    {{
      name: '{tenant_id}-python',
      script: 'python',
      args: 'main.py',
      cwd: '{config['path']}/backend/python-services',
      env: {{
        PORT: {config['python_port']},
        PYTHONUNBUFFERED: '1',
        PYTHON_ENV: 'production'
      }}
    }}
  ]
}};
"""

def write_config_files(tenant_id, config, environment='local'):
    """Write all configuration files for a tenant"""
    print(f"\n{'='*60}")
    print(f"Configuring {config['name']} ({tenant_id})")
    print(f"{'='*60}")

    base_path = Path(config['path'])

    # Create .env.lsemb (tenant-specific config)
    env_lsemb = create_env_lsemb(tenant_id, config, environment)
    env_lsemb_path = base_path / f'.env.{tenant_id}'
    print(f"\n1. Creating {env_lsemb_path}")
    with open(env_lsemb_path, 'w') as f:
        f.write(env_lsemb)
    print(f"   [OK] Created .env.{tenant_id}")

    # Create backend/.env if backend exists
    if config['backend_port']:
        backend_env = create_backend_env(tenant_id, config, environment)
        backend_env_path = base_path / 'backend' / '.env'
        print(f"\n2. Creating {backend_env_path}")
        os.makedirs(base_path / 'backend', exist_ok=True)
        with open(backend_env_path, 'w') as f:
            f.write(backend_env)
        print(f"   [OK] Created backend/.env")

    # Create frontend/.env.local
    frontend_env = create_frontend_env(tenant_id, config, environment)
    frontend_env_path = base_path / 'frontend' / '.env.local'
    print(f"\n3. Creating {frontend_env_path}")
    os.makedirs(base_path / 'frontend', exist_ok=True)
    with open(frontend_env_path, 'w') as f:
        f.write(frontend_env)
    print(f"   [OK] Created frontend/.env.local")

    # Create ecosystem.config.js for PM2
    ecosystem = create_ecosystem_config(tenant_id, config)
    ecosystem_path = base_path / 'ecosystem.config.js'
    print(f"\n4. Creating {ecosystem_path}")
    with open(ecosystem_path, 'w') as f:
        f.write(ecosystem)
    print(f"   [OK] Created ecosystem.config.js")

def setup_localhost():
    """Setup configuration for localhost development"""
    print("\n> Setting up LOCAL development environment")
    print("="*60)

    # Only configure LSEMB for local development
    tenant_id = 'lsemb'
    config = TENANTS[tenant_id]

    if os.path.exists(config['path']):
        write_config_files(tenant_id, config, 'local')
        print(f"\n[OK] {config['name']} configured for localhost")
        print(f"   Backend: http://localhost:{config['backend_port']}")
        print(f"   Frontend: http://localhost:{config['frontend_port']}")
        print(f"   Database: {config['db_name']}")
    else:
        print(f"[ERROR] Path not found: {config['path']}")

def create_deployment_script():
    """Create a deployment script for the server"""
    script_content = """#!/bin/bash
# Multi-tenant deployment script

echo "=== Multi-Tenant Configuration Deployment ==="

# Configure each tenant
for tenant in lsemb emlakai bookie; do
    echo ""
    echo "Configuring $tenant..."

    cd /var/www/$tenant

    # Pull latest code
    git pull origin main

    # Build backend if exists
    if [ -d "backend" ]; then
        cd backend
        npm install
        npm run build
        cd ..
    fi

    # Build frontend
    if [ -d "frontend" ]; then
        cd frontend
        npm install
        npm run build
        cd ..
    fi

    # Restart PM2 services
    pm2 restart $tenant-backend $tenant-frontend $tenant-python
done

# Configure luwi.dev
echo ""
echo "Configuring luwi.dev..."
cd /var/www/luwi-dev
git pull origin main
cd frontend
npm install
npm run build
pm2 restart luwi-frontend

echo ""
echo "=== All tenants configured and restarted ==="
pm2 list
"""

    script_path = Path('deploy-tenants.sh')
    with open(script_path, 'w') as f:
        f.write(script_content)

    print(f"\n[SCRIPT] Created deployment script: {script_path}")
    print("   Upload this to the server and run it")

def test_configurations():
    """Test if configurations are properly loaded"""
    print("\n[TEST] Testing configurations...")
    print("="*60)

    for tenant_id, config in TENANTS.items():
        print(f"\n{config['name']}:")

        # Check if paths exist
        base_path = Path(config['path'])
        if base_path.exists():
            print(f"  [OK] Path exists: {base_path}")

            # Check for config files
            env_lsemb = base_path / f'.env.{tenant_id}'
            if env_lsemb.exists():
                print(f"  [OK] .env.{tenant_id} exists")
            else:
                print(f"  [ERROR] .env.{tenant_id} missing")

            if config['backend_port']:
                backend_env = base_path / 'backend' / '.env'
                if backend_env.exists():
                    print(f"  [OK] backend/.env exists")
                else:
                    print(f"  [ERROR] backend/.env missing")
        else:
            print(f"  [ERROR] Path not found: {base_path}")

def main():
    print("""
==================================================
     MULTI-TENANT CONFIGURATION MANAGER
==================================================
""")

    print("Select environment:")
    print("1. Configure localhost (development)")
    print("2. Create server deployment script")
    print("3. Test current configurations")
    print("4. Configure all tenants locally (simulation)")
    print("0. Exit")

    choice = input("\nSelect option (0-4): ")

    if choice == '1':
        setup_localhost()
    elif choice == '2':
        create_deployment_script()
    elif choice == '3':
        test_configurations()
    elif choice == '4':
        # Simulate all tenants locally
        for tenant_id, config in TENANTS.items():
            if os.path.exists(config['path']):
                write_config_files(tenant_id, config, 'local')
        print("\n[OK] All existing tenants configured")
    elif choice == '0':
        print("Goodbye!")
        sys.exit(0)
    else:
        print("Invalid option")

    print("\n" + "="*60)
    print("Configuration complete!")
    print("\nNext steps:")
    print("1. Start backend: cd backend && npm run dev")
    print("2. Start frontend: cd frontend && npm run dev")
    print("3. Start Python service: cd backend/python-services && python main.py")

if __name__ == "__main__":
    main()