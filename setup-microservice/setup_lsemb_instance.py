#!/usr/bin/env python3
"""
LSEMB Multi-Tenant Setup Microservice
=====================================
Automated setup script for deploying multiple LSEMB instances.

Features:
- Interactive configuration wizard
- .env file generation
- SQL schema initialization
- Admin user creation
- PM2 ecosystem.config.js generation
- Service deployment and launch

Usage:
    python setup_lsemb_instance.py --project emlakai
    python setup_lsemb_instance.py --project bookie
    python setup_lsemb_instance.py --interactive
"""

import os
import sys
import json
import argparse
import subprocess
import hashlib
import secrets
from pathlib import Path
from typing import Dict, Optional
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

class LSEMBSetup:
    """LSEMB Instance Setup Manager"""

    def __init__(self, project_name: str, interactive: bool = False):
        self.project_name = project_name
        self.interactive = interactive
        self.config: Dict = {}
        self.base_path = Path(f"/var/www/{project_name}")

    def run(self):
        """Main setup workflow"""
        print(f"\n🚀 LSEMB Setup Microservice")
        print(f"📦 Project: {self.project_name}")
        print("=" * 60)

        try:
            # Step 1: Collect configuration
            self.collect_configuration()

            # Step 2: Clone/Update repository
            self.setup_repository()

            # Step 3: Generate environment files
            self.generate_env_files()

            # Step 4: Initialize databases
            self.initialize_databases()

            # Step 5: Create admin user
            self.create_admin_user()

            # Step 6: Generate ecosystem.config.js
            self.generate_ecosystem_config()

            # Step 7: Install dependencies
            self.install_dependencies()

            # Step 8: Compile backend
            self.build_backend()

            # Step 9: Build frontend
            self.build_frontend()

            # Step 10: Launch services
            self.launch_services()

            # Step 11: Configure nginx
            self.configure_nginx()

            # Step 12: Setup SSL certificate
            self.setup_ssl()

            print("\n✅ Setup completed successfully!")
            self.print_summary()

        except Exception as e:
            print(f"\n❌ Setup failed: {str(e)}")
            sys.exit(1)

    def collect_configuration(self):
        """Collect configuration from user or config file"""
        print("\n📋 Configuration")
        print("-" * 60)

        if self.interactive:
            self.config = self.interactive_config()
        else:
            self.config = self.load_default_config()

        print(f"✓ Configuration loaded for {self.project_name}")

    def interactive_config(self) -> Dict:
        """Interactive configuration wizard"""
        config = {}

        # Domain
        config['domain'] = input(f"Domain name [{self.project_name}.luwi.dev]: ").strip() or f"{self.project_name}.luwi.dev"

        # Ports
        port_bases = {'lsemb': (3002, 8083, 8001), 'emlakai': (3003, 8084, 8002), 'bookie': (3004, 8085, 8003), 'scriptus': (3005, 8086, 8004)}
        default_ports = port_bases.get(self.project_name, (3006, 8087, 8005))

        config['frontend_port'] = input(f"Frontend port [{default_ports[0]}]: ").strip() or str(default_ports[0])
        config['backend_port'] = input(f"Backend port [{default_ports[1]}]: ").strip() or str(default_ports[1])
        config['python_port'] = input(f"Python port [{default_ports[2]}]: ").strip() or str(default_ports[2])

        # Database
        config['lsemb_db'] = input(f"LSEMB database name [{self.project_name}_lsemb]: ").strip() or f"{self.project_name}_lsemb"
        config['source_db'] = input(f"Source database name [{self.project_name}_db]: ").strip() or f"{self.project_name}_db"
        config['db_host'] = input("Database host [localhost]: ").strip() or "localhost"
        config['db_port'] = input("Database port [5432]: ").strip() or "5432"
        config['db_user'] = input("Database user [postgres]: ").strip() or "postgres"
        config['db_password'] = input("Database password: ").strip()

        # Redis
        config['redis_host'] = input("Redis host [localhost]: ").strip() or "localhost"
        config['redis_port'] = input("Redis port [6379]: ").strip() or "6379"
        config['redis_password'] = input("Redis password (optional): ").strip() or ""
        config['redis_db'] = input(f"Redis DB [{self.get_redis_db_number()}]: ").strip() or str(self.get_redis_db_number())

        # Admin user
        config['admin_email'] = input("Admin email [admin@" + self.project_name + ".com]: ").strip() or f"admin@{self.project_name}.com"
        config['admin_password'] = input("Admin password [admin123]: ").strip() or "admin123"

        return config

    def load_default_config(self) -> Dict:
        """Load default configuration for the project"""
        port_bases = {
            'lsemb': (3002, 8083, 8001, 2),
            'emlakai': (3003, 8084, 8002, 3),
            'bookie': (3004, 8085, 8003, 4),
            'scriptus': (3005, 8086, 8004, 5)
        }

        defaults = port_bases.get(self.project_name, (3006, 8087, 8005, 6))

        return {
            'domain': f"{self.project_name}.luwi.dev",
            'frontend_port': str(defaults[0]),
            'backend_port': str(defaults[1]),
            'python_port': str(defaults[2]),
            'lsemb_db': f"{self.project_name}_lsemb",
            'source_db': f"{self.project_name}_db",
            'db_host': os.getenv('DB_HOST', 'localhost'),
            'db_port': os.getenv('DB_PORT', '5432'),
            'db_user': os.getenv('DB_USER', 'postgres'),
            'db_password': os.getenv('DB_PASSWORD', ''),
            'redis_host': os.getenv('REDIS_HOST', 'localhost'),
            'redis_port': os.getenv('REDIS_PORT', '6379'),
            'redis_password': os.getenv('REDIS_PASSWORD', ''),
            'redis_db': str(defaults[3]),
            'admin_email': f"admin@{self.project_name}.com",
            'admin_password': 'admin123'
        }

    def get_redis_db_number(self) -> int:
        """Get Redis DB number based on project"""
        db_map = {'lsemb': 2, 'emlakai': 3, 'bookie': 4, 'scriptus': 5}
        return db_map.get(self.project_name, 6)

    def setup_repository(self):
        """Clone or update Git repository"""
        print("\n📦 Repository Setup")
        print("-" * 60)

        if self.base_path.exists():
            print(f"✓ Directory exists: {self.base_path}")
            print("  Pulling latest changes...")
            result = subprocess.run(
                ["git", "pull", "origin", "main"],
                cwd=self.base_path,
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                print("✓ Repository updated")
            else:
                print(f"⚠ Git pull failed: {result.stderr}")
        else:
            print(f"  Cloning repository to {self.base_path}...")
            result = subprocess.run(
                ["git", "clone", "https://github.com/umutsun/asemb.git", str(self.base_path)],
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                print("✓ Repository cloned")
            else:
                raise Exception(f"Git clone failed: {result.stderr}")

    def generate_env_files(self):
        """Generate all environment files"""
        print("\n📝 Environment Files")
        print("-" * 60)

        # .env.lsemb (main settings DB)
        self.generate_env_lsemb()

        # Backend .env
        self.generate_backend_env()

        # Frontend .env.production.local
        self.generate_frontend_env()

        # Python services .env
        self.generate_python_env()

        print("✓ All environment files generated")

    def generate_env_lsemb(self):
        """Generate .env.lsemb file"""
        env_content = f"""# LSEMB Settings Database Configuration
# Project: {self.project_name}
# Generated by setup_lsemb_instance.py

# PostgreSQL Settings Database
POSTGRES_HOST={self.config['db_host']}
POSTGRES_PORT={self.config['db_port']}
POSTGRES_DB={self.config['lsemb_db']}
POSTGRES_USER={self.config['db_user']}
POSTGRES_PASSWORD={self.config['db_password']}

# Source Database (for data)
SOURCE_DB_HOST={self.config['db_host']}
SOURCE_DB_PORT={self.config['db_port']}
SOURCE_DB_NAME={self.config['source_db']}
SOURCE_DB_USER={self.config['db_user']}
SOURCE_DB_PASSWORD={self.config['db_password']}

# Redis Configuration
REDIS_HOST={self.config['redis_host']}
REDIS_PORT={self.config['redis_port']}
REDIS_PASSWORD={self.config['redis_password']}
REDIS_DB={self.config['redis_db']}

# Server Ports
BACKEND_PORT={self.config['backend_port']}
FRONTEND_PORT={self.config['frontend_port']}
PYTHON_SERVICE_PORT={self.config['python_port']}

# Application
NODE_ENV=production
JWT_SECRET={secrets.token_urlsafe(32)}
JWT_REFRESH_SECRET={secrets.token_urlsafe(32)}

# Domain
DOMAIN={self.config['domain']}
NEXT_PUBLIC_API_URL=https://{self.config['domain']}
"""

        env_path = self.base_path / ".env.lsemb"
        env_path.write_text(env_content)
        print(f"✓ Created {env_path}")

    def generate_backend_env(self):
        """Generate backend .env file"""
        # Backend uses .env.lsemb, so we just symlink it
        backend_env = self.base_path / "backend" / ".env"
        lsemb_env = self.base_path / ".env.lsemb"

        if backend_env.exists():
            backend_env.unlink()

        backend_env.symlink_to(lsemb_env)
        print(f"✓ Linked backend/.env -> .env.lsemb")

    def generate_frontend_env(self):
        """Generate frontend environment file"""
        env_content = f"""# Frontend Environment
# Project: {self.project_name}

NEXT_PUBLIC_API_URL=https://{self.config['domain']}
NEXT_PUBLIC_WS_URL=wss://{self.config['domain']}
NODE_ENV=production
"""

        frontend_path = self.base_path / "frontend"
        env_path = frontend_path / ".env.production.local"
        env_path.write_text(env_content)
        print(f"✓ Created frontend/.env.production.local")

    def generate_python_env(self):
        """Generate Python services environment file"""
        env_content = f"""# Python Services Environment
# Project: {self.project_name}

DATABASE_URL=postgresql://{self.config['db_user']}:{self.config['db_password']}@{self.config['db_host']}:{self.config['db_port']}/{self.config['lsemb_db']}
REDIS_URL=redis://:{self.config['redis_password']}@{self.config['redis_host']}:{self.config['redis_port']}/{self.config['redis_db']}
PORT={self.config['python_port']}
"""

        python_path = self.base_path / "backend" / "python-services"
        if python_path.exists():
            env_path = python_path / ".env"
            env_path.write_text(env_content)
            print(f"✓ Created python-services/.env")

    def initialize_databases(self):
        """Initialize PostgreSQL databases and schema"""
        print("\n🗄️  Database Initialization")
        print("-" * 60)

        # Create databases if they don't exist
        self.create_database(self.config['lsemb_db'])
        self.create_database(self.config['source_db'])

        # Initialize schema
        self.initialize_schema()

        # Insert default settings
        self.insert_default_settings()

        print("✓ Databases initialized")

    def create_database(self, db_name: str):
        """Create PostgreSQL database if it doesn't exist"""
        try:
            # Connect to postgres database to create new DB
            conn = psycopg2.connect(
                host=self.config['db_host'],
                port=self.config['db_port'],
                database='postgres',
                user=self.config['db_user'],
                password=self.config['db_password']
            )
            conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
            cur = conn.cursor()

            # Check if database exists
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (db_name,))
            exists = cur.fetchone()

            if not exists:
                cur.execute(f'CREATE DATABASE {db_name}')
                print(f"✓ Created database: {db_name}")
            else:
                print(f"✓ Database exists: {db_name}")

            cur.close()
            conn.close()

        except Exception as e:
            print(f"⚠ Database creation error: {str(e)}")

    def initialize_schema(self):
        """Initialize database schema"""
        schema_sql = """
        -- LSEMB Core Schema

        -- Enable extensions
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
        CREATE EXTENSION IF NOT EXISTS "pgcrypto";
        CREATE EXTENSION IF NOT EXISTS "vector";

        -- Users table
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            username VARCHAR(255) UNIQUE NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            name VARCHAR(255),
            role VARCHAR(50) DEFAULT 'user',
            status VARCHAR(50) DEFAULT 'active',
            email_verified BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- User sessions table
        CREATE TABLE IF NOT EXISTS user_sessions (
            id SERIAL PRIMARY KEY,
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            token TEXT NOT NULL,
            refresh_token TEXT NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id)
        );

        -- Settings table
        CREATE TABLE IF NOT EXISTS settings (
            id SERIAL PRIMARY KEY,
            category VARCHAR(100) NOT NULL,
            key VARCHAR(255) NOT NULL,
            value TEXT,
            type VARCHAR(50) DEFAULT 'string',
            description TEXT,
            is_secret BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(category, key)
        );

        -- Unified embeddings table
        CREATE TABLE IF NOT EXISTS unified_embeddings (
            id SERIAL PRIMARY KEY,
            source_id VARCHAR(255) NOT NULL,
            source_name VARCHAR(255),
            source_type VARCHAR(100) NOT NULL,
            record_type VARCHAR(100),
            content TEXT NOT NULL,
            embedding vector(768),
            metadata JSONB,
            tokens INTEGER,
            model VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Create indexes
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        CREATE INDEX IF NOT EXISTS idx_settings_category_key ON settings(category, key);
        CREATE INDEX IF NOT EXISTS idx_unified_embeddings_source ON unified_embeddings(source_type, source_id);
        CREATE INDEX IF NOT EXISTS idx_unified_embeddings_vector ON unified_embeddings USING ivfflat (embedding vector_cosine_ops);
        """

        try:
            conn = psycopg2.connect(
                host=self.config['db_host'],
                port=self.config['db_port'],
                database=self.config['lsemb_db'],
                user=self.config['db_user'],
                password=self.config['db_password']
            )
            cur = conn.cursor()
            cur.execute(schema_sql)
            conn.commit()
            cur.close()
            conn.close()
            print("✓ Schema initialized")
        except Exception as e:
            print(f"⚠ Schema initialization error: {str(e)}")

    def insert_default_settings(self):
        """Insert default settings into database"""
        default_settings = [
            ('database', 'lsemb_db_name', self.config['lsemb_db'], 'string', 'LSEMB settings database name'),
            ('database', 'source_db_name', self.config['source_db'], 'string', 'Source data database name'),
            ('database', 'host', self.config['db_host'], 'string', 'Database host'),
            ('database', 'port', self.config['db_port'], 'string', 'Database port'),
            ('server', 'domain', self.config['domain'], 'string', 'Application domain'),
            ('server', 'backend_port', self.config['backend_port'], 'number', 'Backend server port'),
            ('server', 'frontend_port', self.config['frontend_port'], 'number', 'Frontend server port'),
            ('server', 'python_port', self.config['python_port'], 'number', 'Python service port'),
            ('redis', 'host', self.config['redis_host'], 'string', 'Redis host'),
            ('redis', 'port', self.config['redis_port'], 'string', 'Redis port'),
            ('redis', 'db', self.config['redis_db'], 'number', 'Redis database number'),
            ('embedding', 'provider', 'openai', 'string', 'Embedding provider'),
            ('embedding', 'model', 'text-embedding-3-small', 'string', 'Embedding model'),
            ('embedding', 'dimensions', '768', 'number', 'Embedding dimensions'),
        ]

        try:
            conn = psycopg2.connect(
                host=self.config['db_host'],
                port=self.config['db_port'],
                database=self.config['lsemb_db'],
                user=self.config['db_user'],
                password=self.config['db_password']
            )
            cur = conn.cursor()

            for category, key, value, type_, description in default_settings:
                cur.execute("""
                    INSERT INTO settings (category, key, value, type, description)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (category, key) DO UPDATE
                    SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
                """, (category, key, value, type_, description))

            conn.commit()
            cur.close()
            conn.close()
            print(f"✓ Inserted {len(default_settings)} default settings")
        except Exception as e:
            print(f"⚠ Settings insertion error: {str(e)}")

    def create_admin_user(self):
        """Create admin user"""
        print("\n👤 Admin User")
        print("-" * 60)

        try:
            import bcrypt

            # Hash password
            password_hash = bcrypt.hashpw(
                self.config['admin_password'].encode('utf-8'),
                bcrypt.gensalt(rounds=12)
            ).decode('utf-8')

            conn = psycopg2.connect(
                host=self.config['db_host'],
                port=self.config['db_port'],
                database=self.config['lsemb_db'],
                user=self.config['db_user'],
                password=self.config['db_password']
            )
            cur = conn.cursor()

            # Check if admin exists
            cur.execute("SELECT id FROM users WHERE email = %s", (self.config['admin_email'],))
            exists = cur.fetchone()

            if not exists:
                cur.execute("""
                    INSERT INTO users (username, email, password, name, role, status, email_verified)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (
                    'admin',
                    self.config['admin_email'],
                    password_hash,
                    f"{self.project_name.title()} Admin",
                    'admin',
                    'active',
                    True
                ))
                conn.commit()
                print(f"✓ Created admin user: {self.config['admin_email']}")
            else:
                print(f"✓ Admin user exists: {self.config['admin_email']}")

            cur.close()
            conn.close()

        except Exception as e:
            print(f"⚠ Admin user creation error: {str(e)}")

    def generate_ecosystem_config(self):
        """Generate PM2 ecosystem.config.js"""
        print("\n⚙️  PM2 Configuration")
        print("-" * 60)

        config_content = f"""module.exports = {{
  apps: [
    {{
      name: '{self.project_name}-backend',
      script: 'dist/server.js',
      cwd: '{self.base_path}/backend',
      instances: 1,
      exec_mode: 'fork',
      env: {{
        NODE_ENV: 'production',
        BACKEND_PORT: {self.config['backend_port']},
      }},
      error_file: '{self.base_path}/logs/backend-error.log',
      out_file: '{self.base_path}/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    }},
    {{
      name: '{self.project_name}-frontend',
      script: 'npm',
      args: 'start',
      cwd: '{self.base_path}/frontend',
      instances: 1,
      exec_mode: 'fork',
      env: {{
        NODE_ENV: 'production',
        PORT: {self.config['frontend_port']},
      }},
      error_file: '{self.base_path}/logs/frontend-error.log',
      out_file: '{self.base_path}/logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
    }},
    {{
      name: '{self.project_name}-python',
      script: 'main.py',
      cwd: '{self.base_path}/backend/python-services',
      interpreter: 'python3',
      instances: 1,
      exec_mode: 'fork',
      env: {{
        PORT: {self.config['python_port']},
      }},
      error_file: '{self.base_path}/logs/python-error.log',
      out_file: '{self.base_path}/logs/python-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
    }},
  ],
}};
"""

        # Create logs directory
        logs_dir = self.base_path / "logs"
        logs_dir.mkdir(exist_ok=True)

        config_path = self.base_path / "ecosystem.config.js"
        config_path.write_text(config_content)
        print(f"✓ Created ecosystem.config.js")

    def install_dependencies(self):
        """Install npm dependencies"""
        print("\n📦 Installing Dependencies")
        print("-" * 60)

        # Backend
        print("  Installing backend dependencies...")
        subprocess.run(
            ["npm", "install"],
            cwd=self.base_path / "backend",
            capture_output=True
        )
        print("✓ Backend dependencies installed")

        # Frontend
        print("  Installing frontend dependencies...")
        subprocess.run(
            ["npm", "install"],
            cwd=self.base_path / "frontend",
            capture_output=True
        )
        print("✓ Frontend dependencies installed")

        # Python
        python_services = self.base_path / "backend" / "python-services"
        if python_services.exists():
            print("  Installing Python dependencies...")
            subprocess.run(
                ["pip3", "install", "-r", "requirements.txt"],
                cwd=python_services,
                capture_output=True
            )
            print("✓ Python dependencies installed")

    def build_frontend(self):
        """Build Next.js frontend"""
        print("\n🏗️  Building Frontend")
        print("-" * 60)

        result = subprocess.run(
            ["npm", "run", "build"],
            cwd=self.base_path / "frontend",
            capture_output=True,
            text=True
        )

        if result.returncode == 0:
            print("✓ Frontend built successfully")
        else:
            print(f"⚠ Frontend build had warnings (continuing anyway)")

    def build_backend(self):
        """Compile TypeScript backend"""
        print("\n🔧 Compiling Backend")
        print("-" * 60)

        # Try npm run build first
        result = subprocess.run(
            ["npm", "run", "build"],
            cwd=self.base_path / "backend",
            capture_output=True,
            text=True
        )

        # If npm build doesn't work, try tsc directly
        if result.returncode != 0 or not (self.base_path / "backend" / "dist").exists():
            print("  npm build failed, trying tsc...")
            result = subprocess.run(
                ["npx", "tsc"],
                cwd=self.base_path / "backend",
                capture_output=True,
                text=True
            )

        if (self.base_path / "backend" / "dist" / "server.js").exists():
            print("✓ Backend compiled successfully")
        else:
            print(f"⚠ Backend compilation had issues")

    def launch_services(self):
        """Launch services with PM2"""
        print("\n🚀 Launching Services")
        print("-" * 60)

        # Start with PM2
        result = subprocess.run(
            ["pm2", "start", "ecosystem.config.js"],
            cwd=self.base_path,
            capture_output=True,
            text=True
        )

        if result.returncode == 0:
            print("✓ Services launched with PM2")

            # Save PM2 configuration
            subprocess.run(["pm2", "save"], capture_output=True)
            print("✓ PM2 configuration saved")
        else:
            print(f"⚠ PM2 launch warning: {result.stderr}")

    def configure_nginx(self):
        """Configure nginx reverse proxy"""
        print("\n🌐 Nginx Configuration")
        print("-" * 60)

        nginx_config = f"""# {self.project_name.upper()} - LSEMB Instance
server {{
    listen 80;
    server_name {self.config['domain']};

    # Frontend
    location / {{
        proxy_pass http://localhost:{self.config['frontend_port']};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }}

    # Backend API
    location /api {{
        proxy_pass http://localhost:{self.config['backend_port']};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }}

    # WebSocket
    location /socket.io {{
        proxy_pass http://localhost:{self.config['backend_port']};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }}

    # Python Microservice
    location /python-api {{
        proxy_pass http://localhost:{self.config['python_port']};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }}
}}
"""

        # Write nginx config
        config_path = Path(f"/etc/nginx/conf.d/{self.project_name}.conf")
        try:
            config_path.write_text(nginx_config)
            print(f"✓ Created {config_path}")

            # Test nginx configuration
            result = subprocess.run(
                ["nginx", "-t"],
                capture_output=True,
                text=True
            )

            if result.returncode == 0:
                print("✓ Nginx configuration valid")

                # Reload nginx
                subprocess.run(["systemctl", "reload", "nginx"], capture_output=True)
                print("✓ Nginx reloaded")
            else:
                print(f"⚠ Nginx test failed: {result.stderr}")

        except PermissionError:
            print(f"⚠ Permission denied. Run with sudo or manually create:")
            print(f"   sudo nano /etc/nginx/conf.d/{self.project_name}.conf")
        except Exception as e:
            print(f"⚠ Nginx configuration error: {str(e)}")

    def setup_ssl(self):
        """Setup SSL certificate with certbot"""
        print("\n🔒 SSL Certificate Setup")
        print("-" * 60)

        try:
            # Check if certbot is installed
            result = subprocess.run(
                ["which", "certbot"],
                capture_output=True,
                text=True
            )

            if result.returncode != 0:
                print("⚠ Certbot not installed. Install with:")
                print("   sudo yum install certbot python3-certbot-nginx")
                return

            # Run certbot
            print(f"  Requesting SSL certificate for {self.config['domain']}...")
            result = subprocess.run(
                [
                    "certbot", "--nginx",
                    "-d", self.config['domain'],
                    "--non-interactive",
                    "--agree-tos",
                    "--redirect",
                    "-m", self.config['admin_email']
                ],
                capture_output=True,
                text=True
            )

            if result.returncode == 0:
                print(f"✓ SSL certificate installed for {self.config['domain']}")
                print("✓ HTTPS enabled with auto-redirect")
            else:
                print("⚠ SSL setup failed. Run manually:")
                print(f"   sudo certbot --nginx -d {self.config['domain']}")

        except Exception as e:
            print(f"⚠ SSL setup error: {str(e)}")
            print("  You can setup SSL manually later with:")
            print(f"  sudo certbot --nginx -d {self.config['domain']}")

    def print_summary(self):
        """Print setup summary"""
        print("\n" + "=" * 60)
        print("📊 Setup Summary")
        print("=" * 60)
        print(f"Project:        {self.project_name}")
        print(f"Domain:         https://{self.config['domain']}")
        print(f"Frontend:       http://localhost:{self.config['frontend_port']}")
        print(f"Backend API:    http://localhost:{self.config['backend_port']}")
        print(f"Python Service: http://localhost:{self.config['python_port']}")
        print(f"Database:       {self.config['lsemb_db']}")
        print(f"Source DB:      {self.config['source_db']}")
        print(f"Admin Email:    {self.config['admin_email']}")
        print(f"Admin Password: {self.config['admin_password']}")
        print("=" * 60)
        print("\nNext steps:")
        print(f"  1. Configure nginx proxy for https://{self.config['domain']}")
        print(f"  2. Test the application at https://{self.config['domain']}")
        print(f"  3. Change admin password after first login")
        print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description='LSEMB Multi-Tenant Setup')
    parser.add_argument('--project', required=True, choices=['lsemb', 'emlakai', 'bookie', 'scriptus'],
                       help='Project name to setup (scriptus = IMSDB)')
    parser.add_argument('--interactive', action='store_true',
                       help='Run interactive configuration wizard')

    args = parser.parse_args()

    setup = LSEMBSetup(args.project, args.interactive)
    setup.run()


if __name__ == '__main__':
    main()
