import subprocess
import sys
import os
import json
import time
from datetime import datetime

class SmartDeployer:
    def __init__(self):
        self.server = "91.99.229.96"
        self.user = "root"
        self.projects = {
            'lsemb': {'backend_port': 8083, 'frontend_port': 3002},
            'emlakai': {'backend_port': 8084, 'frontend_port': 3003},
            'bookie': {'backend_port': 8085, 'frontend_port': 3004},
            'luwi': {'backend_port': 8083, 'frontend_port': 3000}
        }

    def create_deployment_script(self, target='all'):
        """Create a comprehensive deployment script"""

        script = f"""#!/bin/bash
set -e

echo "========================================"
echo "  SMART DEPLOYMENT - {target.upper()}"
echo "  Time: $(date)"
echo "========================================"

# Colors for output
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
NC='\\033[0m'

# Function to print colored output
print_status() {{
    if [ "$1" = "success" ]; then
        echo -e "${{GREEN}}✓ $2${{NC}}"
    elif [ "$1" = "error" ]; then
        echo -e "${{RED}}✗ $2${{NC}}"
    else
        echo -e "${{YELLOW}}→ $2${{NC}}"
    fi
}}

# Function to build frontend with retry
build_frontend() {{
    local project=$1
    local port=$2
    local max_retries=2
    local retry=0

    print_status "info" "Building $project frontend (port $port)..."
    cd /var/www/$project/frontend

    # Update port in package.json
    sed -i "s/\\"start\\": \\"next start.*\\"/\\"start\\": \\"next start -p $port\\"/" package.json

    # Build with retry logic
    while [ $retry -lt $max_retries ]; do
        if npm run build 2>&1 | tail -5; then
            print_status "success" "$project frontend built successfully"
            break
        else
            retry=$((retry + 1))
            if [ $retry -lt $max_retries ]; then
                print_status "info" "Build failed, retrying ($retry/$max_retries)..."
                rm -rf .next
                sleep 2
            else
                print_status "error" "$project frontend build failed after $max_retries attempts"
                return 1
            fi
        fi
    done

    # Restart PM2 service
    pm2 delete $project-frontend 2>/dev/null || true
    pm2 start npm --name $project-frontend -- start
    print_status "success" "$project frontend started on port $port"
}}

# Function to build backend
build_backend() {{
    local project=$1
    print_status "info" "Building $project backend..."
    cd /var/www/$project/backend

    # TypeScript build (allow errors)
    npx tsc --noEmitOnError false 2>&1 | tail -3 || true

    # Restart PM2 service
    pm2 restart $project-backend
    print_status "success" "$project backend restarted"
}}

"""

        # Add deployment logic based on target
        if target in ['all', 'frontends']:
            script += """
# Deploy frontends
echo ""
echo "=== FRONTEND DEPLOYMENT ==="
build_frontend lsemb 3002 &
PID1=$!
build_frontend emlakai 3003 &
PID2=$!
build_frontend bookie 3004 &
PID3=$!
build_frontend luwi 3000 &
PID4=$!

# Wait for all builds to complete
wait $PID1 $PID2 $PID3 $PID4
"""

        if target in ['all', 'backends']:
            script += """
# Deploy backends
echo ""
echo "=== BACKEND DEPLOYMENT ==="
build_backend lsemb
build_backend emlakai
build_backend bookie
"""

        if target in ['lsemb', 'emlakai', 'bookie', 'luwi']:
            script += f"""
# Deploy {target}
echo ""
echo "=== DEPLOYING {target.upper()} ==="
build_backend {target}
build_frontend {target} {self.projects[target]['frontend_port']}
"""

        script += """
# Save PM2 configuration
pm2 save

# Verify deployment
echo ""
echo "=== VERIFICATION ==="

# Check port bindings
echo "Port bindings:"
ss -tulpn | grep -E ':(3000|3002|3003|3004|8083|8084|8085)' | grep LISTEN | while read line; do
    port=$(echo $line | grep -oE ':[0-9]{4}' | cut -d: -f2)
    case $port in
        3000) print_status "success" "Luwi frontend: $port" ;;
        3002) print_status "success" "LSEMB frontend: $port" ;;
        3003) print_status "success" "EmlakAI frontend: $port" ;;
        3004) print_status "success" "Bookie frontend: $port" ;;
        8083) print_status "success" "LSEMB backend: $port" ;;
        8084) print_status "success" "EmlakAI backend: $port" ;;
        8085) print_status "success" "Bookie backend: $port" ;;
    esac
done

# Test endpoints
echo ""
echo "Testing endpoints:"
curl -s http://localhost:8083/api/v2/health | grep -q '"status":"healthy"' && \
    print_status "success" "LSEMB backend: healthy" || print_status "error" "LSEMB backend: unhealthy"

curl -s http://localhost:8084/api/v2/health | grep -q '"status":"healthy"' && \
    print_status "success" "EmlakAI backend: healthy" || print_status "error" "EmlakAI backend: unhealthy"

curl -s http://localhost:8085/api/v2/health | grep -q '"status":"healthy"' && \
    print_status "success" "Bookie backend: healthy" || print_status "error" "Bookie backend: unhealthy"

# Test frontend endpoints
curl -I http://localhost:3000 2>/dev/null | head -1 | grep -q "200" && \
    print_status "success" "Luwi frontend: responding" || print_status "error" "Luwi frontend: not responding"

curl -I http://localhost:3002 2>/dev/null | head -1 | grep -q "200" && \
    print_status "success" "LSEMB frontend: responding" || print_status "error" "LSEMB frontend: not responding"

curl -I http://localhost:3003 2>/dev/null | head -1 | grep -q "200" && \
    print_status "success" "EmlakAI frontend: responding" || print_status "error" "EmlakAI frontend: not responding"

curl -I http://localhost:3004 2>/dev/null | head -1 | grep -q "200" && \
    print_status "success" "Bookie frontend: responding" || print_status "error" "Bookie frontend: not responding"

echo ""
echo "========================================"
echo "  DEPLOYMENT COMPLETE"
echo "========================================"

# Show PM2 status
pm2 list
"""

        return script

    def deploy_via_ssh(self, target='all'):
        """Deploy using a single SSH connection"""
        print(f"\n[DEPLOY] Starting deployment for: {target}")

        # Create deployment script
        script_content = self.create_deployment_script(target)

        # Write to temporary file
        temp_file = f"deploy_{target}_{int(time.time())}.sh"
        with open(temp_file, 'w', encoding='utf-8') as f:
            f.write(script_content)

        try:
            # Copy script to server
            print("[UPLOAD] Uploading deployment script...")
            scp_cmd = f"scp {temp_file} {self.user}@{self.server}:/tmp/deploy.sh"
            result = subprocess.run(scp_cmd, shell=True, capture_output=True, text=True, timeout=30)

            if result.returncode != 0:
                print(f"[ERROR] Failed to upload script: {result.stderr}")
                return False

            # Execute script
            print("[EXEC] Executing deployment...")
            ssh_cmd = f"ssh {self.user}@{self.server} 'chmod +x /tmp/deploy.sh && /tmp/deploy.sh && rm /tmp/deploy.sh'"

            # Run with real-time output
            process = subprocess.Popen(ssh_cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

            for line in iter(process.stdout.readline, ''):
                if line:
                    print(line.rstrip())

            process.wait()

            if process.returncode == 0:
                print("\n[SUCCESS] Deployment successful!")
                return True
            else:
                print("\n❌ Deployment failed!")
                return False

        except subprocess.TimeoutExpired:
            print("\n[WARNING] Deployment timed out but may still be running on server")
            return False

        finally:
            # Clean up temp file
            if os.path.exists(temp_file):
                os.remove(temp_file)

    def quick_fix_ports(self):
        """Quick fix for port conflicts"""
        print("\n[PORTFIX] Quick Port Fix")

        cmd = """ssh root@91.99.229.96 'bash -c "
            cd /var/www/emlakai/frontend && sed -i \\"s/3002/3003/g\\" package.json
            cd /var/www/bookie/frontend && sed -i \\"s/3002/3004/g\\" package.json
            pm2 restart emlakai-frontend bookie-frontend
            sleep 3
            ss -tulpn | grep -E \\":(3000|3002|3003|3004)\\" | grep LISTEN
        "'"""

        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
        print(result.stdout)

        if result.returncode == 0:
            print("[SUCCESS] Port fix completed")
        else:
            print("[ERROR] Port fix failed")

    def test_endpoints(self):
        """Test all endpoints"""
        print("\n[TEST] Testing Endpoints")

        cmd = """ssh root@91.99.229.96 'bash -c "
            echo \\"=== Backend Health Checks ===\\"
            curl -s http://localhost:8083/api/v2/health | python3 -m json.tool | head -5
            curl -s http://localhost:8084/api/v2/health | python3 -m json.tool | head -5
            curl -s http://localhost:8085/api/v2/health | python3 -m json.tool | head -5

            echo \\"\\"
            echo \\"=== Frontend Status ===\\"
            curl -I http://localhost:3000 2>/dev/null | head -1
            curl -I http://localhost:3002 2>/dev/null | head -1
            curl -I http://localhost:3003 2>/dev/null | head -1
            curl -I http://localhost:3004 2>/dev/null | head -1

            echo \\"\\"
            echo \\"=== External URLs ===\\"
            echo \\"https://luwi.dev\\"
            echo \\"https://lsemb.luwi.dev\\"
            echo \\"https://emlakai.luwi.dev\\"
            echo \\"https://bookie.luwi.dev\\"
        "'"""

        subprocess.run(cmd, shell=True, timeout=30)

    def setup_ssh_key(self):
        """Setup SSH key authentication"""
        print("\n[SSH] Setting up SSH key authentication")

        # Generate SSH key if not exists
        key_path = os.path.expanduser("~/.ssh/id_rsa")
        pub_key_path = key_path + ".pub"
        if not os.path.exists(key_path):
            print("Generating SSH key...")
            result = subprocess.run(["ssh-keygen", "-t", "rsa", "-b", "4096", "-f", key_path, "-N", ""], capture_output=True, text=True)
            if result.returncode != 0:
                print(f"[ERROR] Failed to generate SSH key: {result.stderr}")
                return

        # Copy public key to server
        print("Copying SSH key to server...")
        if os.name == 'nt':  # Windows
            copy_cmd = f"type \"{pub_key_path}\" | ssh {self.user}@{self.server} \"mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys\""
        else:  # Linux/Mac
            copy_cmd = f"ssh-copy-id {self.user}@{self.server}"

        result = subprocess.run(copy_cmd, shell=True, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"[ERROR] Failed to copy SSH key: {result.stderr}")
            return

        print("[SUCCESS] SSH key authentication setup complete")

def main():
    deployer = SmartDeployer()

    print("""
SMART DEPLOYMENT MANAGER
LSEMB Multi-Tenant Platform
    """)

    if len(sys.argv) > 1:
        # Command line mode
        command = sys.argv[1]
        if command == 'deploy':
            target = sys.argv[2] if len(sys.argv) > 2 else 'all'
            deployer.deploy_via_ssh(target)
        elif command == 'fix-ports':
            deployer.quick_fix_ports()
        elif command == 'test':
            deployer.test_endpoints()
        elif command == 'setup-ssh':
            deployer.setup_ssh_key()
        else:
            print(f"Unknown command: {command}")
            print("Usage: python smart-deploy.py [deploy|fix-ports|test|setup-ssh] [target]")
    else:
        # Interactive mode
        while True:
            print("\nOptions:")
            print("1. Deploy All")
            print("2. Deploy Frontends")
            print("3. Deploy Backends")
            print("4. Deploy LSEMB")
            print("5. Deploy EmlakAI")
            print("6. Deploy Bookie")
            print("7. Deploy Luwi")
            print("8. Quick Fix Ports")
            print("9. Test Endpoints")
            print("10. Setup SSH Key")
            print("0. Exit")

            choice = input("\nSelect option: ")

            if choice == '0':
                break
            elif choice == '1':
                deployer.deploy_via_ssh('all')
            elif choice == '2':
                deployer.deploy_via_ssh('frontends')
            elif choice == '3':
                deployer.deploy_via_ssh('backends')
            elif choice == '4':
                deployer.deploy_via_ssh('lsemb')
            elif choice == '5':
                deployer.deploy_via_ssh('emlakai')
            elif choice == '6':
                deployer.deploy_via_ssh('bookie')
            elif choice == '7':
                deployer.deploy_via_ssh('luwi')
            elif choice == '8':
                deployer.quick_fix_ports()
            elif choice == '9':
                deployer.test_endpoints()
            elif choice == '10':
                deployer.setup_ssh_key()

if __name__ == "__main__":
    main()