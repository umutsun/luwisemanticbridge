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
import time
from pathlib import Path
from typing import Dict, Optional
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

# ANSI Color Codes
class Colors:
    RESET = '\033[0m'
    BOLD = '\033[1m'
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    MAGENTA = '\033[95m'
    CYAN = '\033[96m'
    WHITE = '\033[97m'

    @staticmethod
    def success(text):
        return f"{Colors.GREEN}{text}{Colors.RESET}"

    @staticmethod
    def error(text):
        return f"{Colors.RED}{text}{Colors.RESET}"

    @staticmethod
    def warning(text):
        return f"{Colors.YELLOW}{text}{Colors.RESET}"

    @staticmethod
    def info(text):
        return f"{Colors.CYAN}{text}{Colors.RESET}"

    @staticmethod
    def bold(text):
        return f"{Colors.BOLD}{text}{Colors.RESET}"

class LSEMBSetup:
    """LSEMB Instance Setup Manager"""

    def __init__(self, project_name: str, interactive: bool = False):
        self.project_name = project_name
        self.interactive = interactive
        self.config: Dict = {}
        self.base_path = Path(f"/var/www/{project_name}")
        self.current_step = 0
        self.total_steps = 12

    def print_banner(self):
        """Print ASCII art banner"""
        banner = f"""
{Colors.CYAN}╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║                        {Colors.BOLD}{Colors.MAGENTA}┌─────────────────────┐{Colors.RESET}{Colors.CYAN}                       ║
║                        {Colors.BOLD}{Colors.MAGENTA}│                     │{Colors.RESET}{Colors.CYAN}                       ║
║                        {Colors.BOLD}{Colors.MAGENTA}│  {Colors.WHITE}Luwi Context{Colors.MAGENTA}    │{Colors.RESET}{Colors.CYAN}                       ║
║                        {Colors.BOLD}{Colors.MAGENTA}│  {Colors.WHITE}Engine{Colors.MAGENTA}          │{Colors.RESET}{Colors.CYAN}                       ║
║                        {Colors.BOLD}{Colors.MAGENTA}│                     │{Colors.RESET}{Colors.CYAN}                       ║
║                        {Colors.BOLD}{Colors.MAGENTA}└─────────────────────┘{Colors.RESET}{Colors.CYAN}                       ║
║                                                                      ║
║            {Colors.BOLD}{Colors.WHITE}Multi-Tenant Setup Microservice{Colors.RESET}{Colors.CYAN}                       ║
║            {Colors.WHITE}Automated Deployment System{Colors.RESET}{Colors.CYAN}                            ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝{Colors.RESET}
"""
        print(banner)

    def print_progress_bar(self, percentage, width=50):
        """Print a progress bar"""
        filled = int(width * percentage / 100)
        bar = '█' * filled + '░' * (width - filled)
        print(f"\r{Colors.CYAN}[{bar}] {percentage}%{Colors.RESET}", end='', flush=True)

    def print_step_header(self, step_name):
        """Print step header with progress"""
        self.current_step += 1
        percentage = int((self.current_step / self.total_steps) * 100)

        print(f"\n{Colors.BOLD}{Colors.BLUE}{'─' * 70}{Colors.RESET}")
        print(f"{Colors.BOLD}{Colors.WHITE}[{self.current_step}/{self.total_steps}] {step_name}{Colors.RESET}")
        print(f"{Colors.BOLD}{Colors.BLUE}{'─' * 70}{Colors.RESET}")
        self.print_progress_bar(percentage)
        print()  # New line after progress bar

    def print_substep(self, message, status="info"):
        """Print a substep with status icon"""
        icons = {
            "info": f"{Colors.CYAN}ℹ{Colors.RESET}",
            "success": f"{Colors.GREEN}✓{Colors.RESET}",
            "warning": f"{Colors.YELLOW}⚠{Colors.RESET}",
            "error": f"{Colors.RED}✗{Colors.RESET}",
            "working": f"{Colors.YELLOW}⟳{Colors.RESET}"
        }
        icon = icons.get(status, icons["info"])
        print(f"  {icon} {message}")

    def run(self):
        """Main setup workflow"""
        # Print banner
        self.print_banner()

        print(f"{Colors.BOLD}{Colors.WHITE}Project: {Colors.MAGENTA}{self.project_name.upper()}{Colors.RESET}")
        print(f"{Colors.WHITE}Mode: {Colors.CYAN}{'Interactive' if self.interactive else 'Automated'}{Colors.RESET}\n")

        try:
            # Step 1: Collect configuration
            self.print_step_header("📋 Configuration Collection")
            self.collect_configuration()

            # Step 2: Clone/Update repository
            self.print_step_header("📦 Repository Setup")
            self.setup_repository()

            # Step 3: Generate environment files
            self.print_step_header("📝 Environment Files Generation")
            self.generate_env_files()

            # Step 4: Initialize databases
            self.print_step_header("🗄️  Database Initialization")
            self.initialize_databases()

            # Step 5: Create admin user
            self.print_step_header("👤 Admin User Creation")
            self.create_admin_user()

            # Step 6: Generate ecosystem.config.js
            self.print_step_header("⚙️  PM2 Configuration")
            self.generate_ecosystem_config()

            # Step 7: Install dependencies
            self.print_step_header("📦 Dependencies Installation")
            self.install_dependencies()

            # Step 8: Compile backend
            self.print_step_header("🔨 Backend Compilation")
            self.build_backend()

            # Step 9: Build frontend
            self.print_step_header("🏗️  Frontend Build")
            self.build_frontend()

            # Step 10: Launch services
            self.print_step_header("🚀 Services Launch")
            self.launch_services()

            # Step 11: Configure nginx
            self.print_step_header("🌐 Nginx Configuration")
            self.configure_nginx()

            # Step 12: Setup SSL certificate
            self.print_step_header("🔒 SSL Certificate Setup")
            self.setup_ssl()

            # Final progress bar
            print()
            self.print_progress_bar(100)
            print(f"\n\n{Colors.BOLD}{Colors.GREEN}✅ Setup completed successfully!{Colors.RESET}")
            self.print_summary()

        except Exception as e:
            print(f"\n{Colors.BOLD}{Colors.RED}❌ Setup failed: {str(e)}{Colors.RESET}")
            sys.exit(1)

    def collect_configuration(self):
        """Collect configuration from user or config file"""
        if self.interactive:
            self.print_substep("Starting interactive configuration wizard", "working")
            self.config = self.interactive_config()
        else:
            self.print_substep("Loading default configuration", "working")
            self.config = self.load_default_config()

        self.print_substep(f"Configuration loaded for {self.project_name}", "success")
        self.print_substep(f"Domain: {self.config['domain']}", "info")
        self.print_substep(f"Ports: Frontend={self.config['frontend_port']}, Backend={self.config['backend_port']}, Python={self.config['python_port']}", "info")

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

        # Try to read DB credentials from /var/www/lsemb/.env.lsemb if exists
        db_host = os.getenv('DB_HOST', 'localhost')
        db_port = os.getenv('DB_PORT', '5432')
        db_user = os.getenv('DB_USER', 'postgres')
        db_password = os.getenv('DB_PASSWORD', '')

        # If not in env, try reading from lsemb's .env file
        lsemb_env = Path('/var/www/lsemb/.env.lsemb')
        if not db_password and lsemb_env.exists():
            try:
                with open(lsemb_env) as f:
                    for line in f:
                        if line.startswith('POSTGRES_PASSWORD='):
                            db_password = line.split('=', 1)[1].strip()
                        elif line.startswith('POSTGRES_HOST='):
                            db_host = line.split('=', 1)[1].strip()
                        elif line.startswith('POSTGRES_USER='):
                            db_user = line.split('=', 1)[1].strip()
                        elif line.startswith('POSTGRES_PORT='):
                            db_port = line.split('=', 1)[1].strip()
            except:
                pass

        return {
            'domain': f"{self.project_name}.luwi.dev",
            'frontend_port': str(defaults[0]),
            'backend_port': str(defaults[1]),
            'python_port': str(defaults[2]),
            'lsemb_db': f"{self.project_name}_lsemb",
            'source_db': f"{self.project_name}_db",
            'db_host': db_host,
            'db_port': db_port,
            'db_user': db_user,
            'db_password': db_password,
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
        if self.base_path.exists():
            self.print_substep(f"Directory exists: {self.base_path}", "info")
            self.print_substep("Pulling latest changes from GitHub", "working")
            result = subprocess.run(
                ["git", "pull", "origin", "main"],
                cwd=self.base_path,
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                self.print_substep("Repository updated successfully", "success")
            else:
                self.print_substep(f"Git pull failed: {result.stderr}", "warning")
        else:
            self.print_substep(f"Cloning repository to {self.base_path}", "working")
            result = subprocess.run(
                ["git", "clone", "https://github.com/umutsun/asemb.git", str(self.base_path)],
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                self.print_substep("Repository cloned successfully", "success")
            else:
                raise Exception(f"Git clone failed: {result.stderr}")

    def generate_env_files(self):
        """Generate all environment files"""
        # .env.lsemb (main settings DB)
        self.print_substep("Generating .env.lsemb (main configuration)", "working")
        self.generate_env_lsemb()
        self.print_substep(".env.lsemb created", "success")

        # Backend .env
        self.print_substep("Generating backend/.env", "working")
        self.generate_backend_env()
        self.print_substep("Backend environment configured", "success")

        # Frontend .env.production.local
        self.print_substep("Generating frontend/.env.production.local", "working")
        self.generate_frontend_env()
        self.print_substep("Frontend environment configured", "success")

        # Python services .env
        self.print_substep("Generating python-services/.env", "working")
        self.generate_python_env()
        self.print_substep("Python environment configured", "success")

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
        # Create databases if they don't exist
        self.print_substep(f"Creating settings database: {self.config['lsemb_db']}", "working")
        self.create_database(self.config['lsemb_db'])

        self.print_substep(f"Creating source database: {self.config['source_db']}", "working")
        self.create_database(self.config['source_db'])

        # Initialize schema
        self.print_substep("Initializing database schema", "working")
        self.initialize_schema()
        self.print_substep("Schema created (users, sessions, settings, embeddings)", "success")

        # Insert default settings
        self.print_substep("Inserting default application settings", "working")
        self.insert_default_settings()
        self.print_substep("Default settings configured", "success")

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
                self.print_substep(f"Database {db_name} created", "success")
            else:
                self.print_substep(f"Database {db_name} already exists", "info")

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
        try:
            import bcrypt

            # Hash password
            self.print_substep("Hashing admin password with bcrypt (12 rounds)", "working")
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
                self.print_substep(f"Creating admin user: {self.config['admin_email']}", "working")
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
                self.print_substep(f"Admin user created: {self.config['admin_email']}", "success")
                self.print_substep(f"Role: admin, Status: active, Email verified: Yes", "info")
            else:
                self.print_substep(f"Admin user already exists: {self.config['admin_email']}", "info")

            cur.close()
            conn.close()

        except Exception as e:
            self.print_substep(f"Admin user creation error: {str(e)}", "error")

    def generate_ecosystem_config(self):
        """Generate PM2 ecosystem.config.js"""

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
        self.print_substep("Creating logs directory", "working")
        logs_dir = self.base_path / "logs"
        logs_dir.mkdir(exist_ok=True)

        self.print_substep("Generating ecosystem.config.js for PM2", "working")
        config_path = self.base_path / "ecosystem.config.js"
        config_path.write_text(config_content)
        self.print_substep(f"PM2 config created with 3 services ({self.project_name}-backend, -frontend, -python)", "success")

    def install_dependencies(self):
        """Install npm dependencies"""
        # Backend
        self.print_substep("Installing backend npm packages", "working")
        subprocess.run(
            ["npm", "install"],
            cwd=self.base_path / "backend",
            capture_output=True
        )
        self.print_substep("Backend dependencies installed", "success")

        # Frontend
        self.print_substep("Installing frontend npm packages", "working")
        subprocess.run(
            ["npm", "install"],
            cwd=self.base_path / "frontend",
            capture_output=True
        )
        self.print_substep("Frontend dependencies installed", "success")

        # Python
        python_services = self.base_path / "backend" / "python-services"
        if python_services.exists():
            self.print_substep("Installing Python packages (pip3)", "working")
            subprocess.run(
                ["pip3", "install", "-r", "requirements.txt"],
                cwd=python_services,
                capture_output=True
            )
            self.print_substep("Python dependencies installed", "success")

    def build_frontend(self):
        """Build Next.js frontend"""
        self.print_substep("Running Next.js production build (this may take a few minutes)", "working")
        result = subprocess.run(
            ["npm", "run", "build"],
            cwd=self.base_path / "frontend",
            capture_output=True,
            text=True
        )

        if result.returncode == 0:
            self.print_substep("Frontend built successfully", "success")
        else:
            self.print_substep("Frontend build completed with warnings", "warning")

    def build_backend(self):
        """Compile TypeScript backend"""
        self.print_substep("Compiling TypeScript to JavaScript", "working")

        # Try npm run build first
        result = subprocess.run(
            ["npm", "run", "build"],
            cwd=self.base_path / "backend",
            capture_output=True,
            text=True
        )

        # If npm build doesn't work, try tsc directly
        if result.returncode != 0 or not (self.base_path / "backend" / "dist").exists():
            self.print_substep("npm build failed, trying tsc directly", "warning")
            result = subprocess.run(
                ["npx", "tsc"],
                cwd=self.base_path / "backend",
                capture_output=True,
                text=True
            )

        if (self.base_path / "backend" / "dist" / "server.js").exists():
            self.print_substep("Backend compiled successfully (dist/server.js created)", "success")
        else:
            self.print_substep("Backend compilation had issues", "error")

    def launch_services(self):
        """Launch services with PM2"""
        self.print_substep(f"Starting {self.project_name}-backend, {self.project_name}-frontend, {self.project_name}-python", "working")

        # Start with PM2
        result = subprocess.run(
            ["pm2", "start", "ecosystem.config.js"],
            cwd=self.base_path,
            capture_output=True,
            text=True
        )

        if result.returncode == 0:
            self.print_substep("All services launched with PM2", "success")

            # Save PM2 configuration
            subprocess.run(["pm2", "save"], capture_output=True)
            self.print_substep("PM2 configuration saved for startup persistence", "success")
        else:
            self.print_substep(f"PM2 launch warning: {result.stderr}", "warning")

    def configure_nginx(self):
        """Configure nginx reverse proxy"""

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
            self.print_substep(f"Creating nginx configuration at /etc/nginx/conf.d/{self.project_name}.conf", "working")
            config_path.write_text(nginx_config)
            self.print_substep("Nginx configuration file created", "success")

            # Test nginx configuration
            self.print_substep("Testing nginx configuration syntax", "working")
            result = subprocess.run(
                ["nginx", "-t"],
                capture_output=True,
                text=True
            )

            if result.returncode == 0:
                self.print_substep("Nginx configuration syntax is valid", "success")

                # Reload nginx
                self.print_substep("Reloading nginx service", "working")
                subprocess.run(["systemctl", "reload", "nginx"], capture_output=True)
                self.print_substep(f"Nginx reloaded - {self.config['domain']} is now accessible", "success")
            else:
                self.print_substep(f"Nginx test failed: {result.stderr}", "error")

        except PermissionError:
            self.print_substep("Permission denied - run script with sudo", "error")
            self.print_substep(f"Manual setup: sudo nano /etc/nginx/conf.d/{self.project_name}.conf", "warning")
        except Exception as e:
            self.print_substep(f"Nginx configuration error: {str(e)}", "error")

    def setup_ssl(self):
        """Setup SSL certificate with certbot"""
        try:
            # Ensure /tmp directory exists (certbot requirement)
            self.print_substep("Ensuring /tmp directory exists", "working")
            subprocess.run(["mkdir", "-p", "/tmp"], capture_output=True)
            subprocess.run(["chmod", "1777", "/tmp"], capture_output=True)

            # Check if certbot is installed
            self.print_substep("Checking for certbot installation", "working")
            result = subprocess.run(
                ["which", "certbot"],
                capture_output=True,
                text=True
            )

            if result.returncode != 0:
                self.print_substep("Certbot not installed", "warning")
                self.print_substep("Install with: sudo yum install certbot python3-certbot-nginx", "info")
                return

            self.print_substep("Certbot found", "success")

            # Run certbot
            self.print_substep(f"Requesting Let's Encrypt SSL certificate for {self.config['domain']}", "working")
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
                self.print_substep(f"SSL certificate installed for {self.config['domain']}", "success")
                self.print_substep("HTTPS auto-redirect enabled", "success")
            else:
                self.print_substep("SSL certificate request failed", "error")
                self.print_substep(f"Manual setup: sudo certbot --nginx -d {self.config['domain']}", "warning")

        except Exception as e:
            self.print_substep(f"SSL setup error: {str(e)}", "error")
            self.print_substep("You can setup SSL manually later", "info")
            print(f"  sudo certbot --nginx -d {self.config['domain']}")

    def print_summary(self):
        """Print setup summary"""
        print(f"\n{Colors.BOLD}{Colors.CYAN}{'═' * 70}{Colors.RESET}")
        print(f"{Colors.BOLD}{Colors.WHITE}📊 Setup Summary{Colors.RESET}")
        print(f"{Colors.BOLD}{Colors.CYAN}{'═' * 70}{Colors.RESET}\n")

        print(f"{Colors.BOLD}Project:{Colors.RESET}        {Colors.MAGENTA}{self.project_name.upper()}{Colors.RESET}")
        print(f"{Colors.BOLD}Domain:{Colors.RESET}         {Colors.GREEN}https://{self.config['domain']}{Colors.RESET}")
        print(f"{Colors.BOLD}Frontend:{Colors.RESET}       {Colors.CYAN}http://localhost:{self.config['frontend_port']}{Colors.RESET}")
        print(f"{Colors.BOLD}Backend API:{Colors.RESET}    {Colors.CYAN}http://localhost:{self.config['backend_port']}{Colors.RESET}")
        print(f"{Colors.BOLD}Python Service:{Colors.RESET} {Colors.CYAN}http://localhost:{self.config['python_port']}{Colors.RESET}")
        print(f"{Colors.BOLD}Database:{Colors.RESET}       {Colors.YELLOW}{self.config['lsemb_db']}{Colors.RESET}")
        print(f"{Colors.BOLD}Source DB:{Colors.RESET}      {Colors.YELLOW}{self.config['source_db']}{Colors.RESET}")
        print(f"{Colors.BOLD}Admin Email:{Colors.RESET}    {Colors.WHITE}{self.config['admin_email']}{Colors.RESET}")
        print(f"{Colors.BOLD}Admin Password:{Colors.RESET} {Colors.RED}{self.config['admin_password']}{Colors.RESET} {Colors.YELLOW}(CHANGE IMMEDIATELY!){Colors.RESET}")

        print(f"\n{Colors.BOLD}{Colors.WHITE}Next Steps:{Colors.RESET}")
        print(f"  {Colors.GREEN}1.{Colors.RESET} Visit {Colors.CYAN}https://{self.config['domain']}{Colors.RESET}")
        print(f"  {Colors.GREEN}2.{Colors.RESET} Login with admin credentials")
        print(f"  {Colors.GREEN}3.{Colors.RESET} {Colors.RED}Change admin password immediately{Colors.RESET}")
        print(f"  {Colors.GREEN}4.{Colors.RESET} Check PM2 status: {Colors.CYAN}pm2 list | grep {self.project_name}{Colors.RESET}")
        print(f"  {Colors.GREEN}5.{Colors.RESET} View logs: {Colors.CYAN}pm2 logs {self.project_name}-backend{Colors.RESET}")

        print(f"\n{Colors.BOLD}{Colors.CYAN}{'═' * 70}{Colors.RESET}\n")


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
