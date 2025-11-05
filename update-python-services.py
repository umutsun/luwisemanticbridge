#!/usr/bin/env python3
"""
Update Python Services Configuration
This script updates all Python service configurations for proper multi-tenant setup
"""

import os
import json
import subprocess
import sys

def update_ecosystem_config():
    """Update ecosystem.config.js for LSEMB Python service"""
    print(">> Updating ecosystem.config.js...")

    config_path = "ecosystem.config.js"

    # Read existing config
    with open(config_path, 'r') as f:
        content = f.read()

    # Update Python service port from 8001 to 8002
    content = content.replace("PORT: '8001'", "PORT: '8002'")

    # Write back
    with open(config_path, 'w') as f:
        f.write(content)

    print("[OK] Updated ecosystem.config.js")

def update_python_integration_service():
    """Update Python integration service to use correct ports"""
    print(">> Updating Python integration service...")

    # Update python-integration.service.ts
    integration_path = "backend/src/services/python-integration.service.ts"

    with open(integration_path, 'r') as f:
        content = f.read()

    # For LSEMB, it should use port 8002 (we'll handle this with env var)
    # Just ensure it reads from environment
    if "process.env.PYTHON_SERVICE_URL || 'http://localhost:8001'" in content:
        content = content.replace(
            "process.env.PYTHON_SERVICE_URL || 'http://localhost:8001'",
            "process.env.PYTHON_SERVICE_URL || 'http://localhost:8002'"
        )

    with open(integration_path, 'w') as f:
        f.write(content)

    print("[OK] Updated python-integration.service.ts")

    # Update whisper-integration.service.ts
    whisper_path = "backend/src/services/whisper-integration.service.ts"

    with open(whisper_path, 'r') as f:
        content = f.read()

    if "process.env.PYTHON_SERVICE_URL || 'http://localhost:8001'" in content:
        content = content.replace(
            "process.env.PYTHON_SERVICE_URL || 'http://localhost:8001'",
            "process.env.PYTHON_SERVICE_URL || 'http://localhost:8002'"
        )

    with open(whisper_path, 'w') as f:
        f.write(content)

    print("[OK] Updated whisper-integration.service.ts")

def update_settings_service():
    """Add Python services configuration to settings service"""
    print(">> Updating settings service...")

    settings_path = "backend/src/services/settings.service.ts"

    with open(settings_path, 'r') as f:
        lines = f.readlines()

    # Find the ServicePortConfig interface
    interface_start = -1
    interface_end = -1

    for i, line in enumerate(lines):
        if "export interface ServicePortConfig" in line:
            interface_start = i
        if interface_start > -1 and line.strip() == "}" and interface_end == -1:
            interface_end = i
            break

    # Add Python services to the interface
    if interface_start > -1 and interface_end > -1:
        # Check if python services already exist
        interface_content = "".join(lines[interface_start:interface_end])
        if "python?" not in interface_content:
            # Add Python services configuration
            python_config = """  python?: {
    port: number;
    host?: string;
    services?: {
      crawl4ai?: boolean;
      whisper?: boolean;
      pgai?: boolean;
    };
  };
  whisper?: {
    enabled: boolean;
    model?: string;
    language?: string;
  };
  pgai?: {
    enabled: boolean;
    autoEmbedding?: boolean;
  };
"""
            lines.insert(interface_end, python_config)
            print("[OK] Added Python services to ServicePortConfig interface")

    # Write back the file
    with open(settings_path, 'w') as f:
        f.writelines(lines)

    print("[OK] Updated settings.service.ts")

def create_env_files():
    """Create .env files for different tenants"""
    print(">> Creating .env files...")

    # LSEMB backend .env
    lsemb_env = """# LSEMB Backend Environment
NODE_ENV=development
PORT=8083
DATABASE_URL=postgresql://postgres:12Kemal1221@localhost:5432/lsemb
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=2
PYTHON_SERVICE_URL=http://localhost:8002
INTERNAL_API_KEY=lsemb-internal-key-2024
JWT_SECRET=your-jwt-secret-key
CORS_ORIGIN=http://localhost:3002

# OpenAI - Set OPENAI_API_KEY environment variable
# Do not hardcode API keys in source code
"""

    # LSEMB Python service .env
    python_env = """# LSEMB Python Service Environment
PORT=8002
DATABASE_URL=postgresql://postgres:12Kemal1221@localhost:5432/lsemb
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=2
ENVIRONMENT=development
LOG_LEVEL=INFO
CORS_ORIGINS=http://localhost:3002,http://localhost:8083
INTERNAL_API_KEY=lsemb-internal-key-2024

# OpenAI (for Whisper) - Set OPENAI_API_KEY environment variable
# Do not hardcode API keys in source code

# Embeddings
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
"""

    # Write backend .env
    with open("backend/.env", 'w') as f:
        f.write(lsemb_env)
    print("[OK] Created backend/.env")

    # Write Python service .env
    os.makedirs("backend/python-services", exist_ok=True)
    with open("backend/python-services/.env", 'w') as f:
        f.write(python_env)
    print("[OK] Created backend/python-services/.env")

def install_python_dependencies():
    """Check and install Python dependencies if needed"""
    print("[PKG] Checking Python dependencies...")

    python_dir = "backend/python-services"

    # Check if venv exists
    venv_path = os.path.join(python_dir, "venv")
    if not os.path.exists(venv_path):
        print("Creating virtual environment...")
        subprocess.run([sys.executable, "-m", "venv", venv_path], cwd=python_dir)

    # Install requirements
    requirements_path = os.path.join(python_dir, "requirements.txt")

    # Create minimal requirements.txt if not exists
    if not os.path.exists(requirements_path):
        requirements = """fastapi==0.115.5
uvicorn==0.32.1
python-dotenv==1.0.1
asyncpg==0.30.0
redis==5.2.0
loguru==0.7.2
pydantic==2.10.2
httpx==0.27.2
crawl4ai==0.4.241
openai==1.30.1
"""
        with open(requirements_path, 'w') as f:
            f.write(requirements)
        print("[OK] Created requirements.txt")

    # Install packages
    pip_path = os.path.join(venv_path, "Scripts", "pip.exe") if os.name == 'nt' else os.path.join(venv_path, "bin", "pip")
    if os.path.exists(pip_path):
        print("Installing Python packages...")
        subprocess.run([pip_path, "install", "-r", "requirements.txt"], cwd=python_dir)
        print("[OK] Installed Python dependencies")

def build_typescript():
    """Build TypeScript files"""
    print("[BUILD] Building TypeScript...")

    result = subprocess.run(["npm", "run", "build"], cwd="backend", capture_output=True, text=True)
    if result.returncode == 0:
        print("[OK] TypeScript build successful")
    else:
        print(f"[WARN] TypeScript build had issues: {result.stderr}")

def main():
    print("[START] Starting Python Services Configuration Update\n")

    # Check if we're in the right directory
    if not os.path.exists("package.json"):
        print("[ERROR] Error: Must run from LSEMB root directory")
        sys.exit(1)

    try:
        # Update configurations
        update_ecosystem_config()
        update_python_integration_service()
        update_settings_service()
        create_env_files()
        install_python_dependencies()
        build_typescript()

        print("\n[SUCCESS] All updates complete!")
        print("\n[NOTE] Next steps:")
        print("1. Start Python service: cd backend/python-services && venv/Scripts/python main.py")
        print("2. Start backend: cd backend && npm run dev")
        print("3. Start frontend: cd frontend && npm run dev")
        print("4. Deploy to production: git add . && git commit && git push")

    except Exception as e:
        print(f"[ERROR] Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()