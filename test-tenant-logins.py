#!/usr/bin/env python3
"""
Multi-Tenant Login Test Script
Tests authentication for all tenant instances
"""

import requests
import json
import sys
from typing import Dict, Any

# Define tenant configurations
TENANTS = {
    'lsemb': {
        'name': 'LSEMB',
        'local_url': 'http://localhost:8083',
        'remote_url': 'https://lsemb.luwi.dev',
        'test_user': {
            'email': 'admin@lsemb.com',
            'password': 'admin123'
        }
    },
    'emlakai': {
        'name': 'EmlakAI',
        'local_url': 'http://localhost:8084',
        'remote_url': 'https://emlakai.luwi.dev',
        'test_user': {
            'email': 'admin@emlakai.com',
            'password': 'admin123'
        }
    },
    'bookie': {
        'name': 'Bookie',
        'local_url': 'http://localhost:8085',
        'remote_url': 'https://bookie.luwi.dev',
        'test_user': {
            'email': 'admin@bookie.com',
            'password': 'admin123'
        }
    }
}

class TenantTester:
    def __init__(self, environment='local'):
        """Initialize tester with environment (local or remote)"""
        self.environment = environment
        self.results = {}

    def test_health(self, tenant_id: str, config: Dict[str, Any]) -> bool:
        """Test health endpoint for a tenant"""
        url = config['local_url'] if self.environment == 'local' else config['remote_url']

        try:
            response = requests.get(f"{url}/api/v2/health", timeout=5)
            if response.status_code == 200:
                data = response.json()
                if data.get('status') == 'healthy':
                    print(f"  [OK] Health check passed")
                    return True
                else:
                    print(f"  [WARN] Service unhealthy: {data.get('status')}")
                    return False
            else:
                print(f"  [ERROR] Health check failed: HTTP {response.status_code}")
                return False
        except requests.exceptions.RequestException as e:
            print(f"  [ERROR] Cannot connect: {str(e)}")
            return False

    def test_login(self, tenant_id: str, config: Dict[str, Any]) -> bool:
        """Test login for a tenant"""
        url = config['local_url'] if self.environment == 'local' else config['remote_url']

        # Prepare login payload
        payload = {
            'email': config['test_user']['email'],
            'password': config['test_user']['password']
        }

        headers = {
            'Content-Type': 'application/json'
        }

        try:
            # Try login endpoint
            response = requests.post(
                f"{url}/api/v2/auth/login",
                json=payload,
                headers=headers,
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                if 'token' in data or 'accessToken' in data:
                    print(f"  [OK] Login successful for {config['test_user']['email']}")
                    return True
                else:
                    print(f"  [ERROR] Login response missing token")
                    return False
            elif response.status_code == 404:
                print(f"  [WARN] Login endpoint not found (might need setup)")
                return False
            elif response.status_code == 401:
                print(f"  [ERROR] Invalid credentials")
                return False
            else:
                print(f"  [ERROR] Login failed: HTTP {response.status_code}")
                if response.text:
                    error_msg = response.text[:200]
                    print(f"  Response: {error_msg}")
                return False

        except requests.exceptions.RequestException as e:
            print(f"  [ERROR] Login request failed: {str(e)}")
            return False

    def test_database_connection(self, tenant_id: str, config: Dict[str, Any]) -> bool:
        """Test database connection through API"""
        url = config['local_url'] if self.environment == 'local' else config['remote_url']

        try:
            response = requests.get(f"{url}/api/v2/database/stats", timeout=10)
            if response.status_code == 200:
                print(f"  [OK] Database connection verified")
                return True
            else:
                print(f"  [ERROR] Database check failed: HTTP {response.status_code}")
                return False
        except requests.exceptions.RequestException as e:
            print(f"  [ERROR] Database check failed: {str(e)}")
            return False

    def test_tenant(self, tenant_id: str, config: Dict[str, Any]) -> Dict[str, bool]:
        """Run all tests for a tenant"""
        print(f"\n{'='*60}")
        print(f"Testing {config['name']} ({tenant_id})")
        print(f"URL: {config['local_url'] if self.environment == 'local' else config['remote_url']}")
        print(f"{'='*60}")

        results = {}

        # Test health endpoint
        print("\n1. Health Check:")
        results['health'] = self.test_health(tenant_id, config)

        # Test database connection
        print("\n2. Database Connection:")
        results['database'] = self.test_database_connection(tenant_id, config)

        # Test login
        print("\n3. Login Test:")
        results['login'] = self.test_login(tenant_id, config)

        return results

    def run_all_tests(self):
        """Run tests for all tenants"""
        print(f"\n{'='*60}")
        print(f"  MULTI-TENANT LOGIN TEST SUITE")
        print(f"  Environment: {self.environment.upper()}")
        print(f"{'='*60}")

        # Test each tenant
        for tenant_id, config in TENANTS.items():
            self.results[tenant_id] = self.test_tenant(tenant_id, config)

        # Print summary
        self.print_summary()

    def print_summary(self):
        """Print test summary"""
        print(f"\n{'='*60}")
        print("  TEST SUMMARY")
        print(f"{'='*60}\n")

        all_passed = True

        for tenant_id, results in self.results.items():
            tenant_name = TENANTS[tenant_id]['name']
            health = "[OK]" if results.get('health') else "[FAIL]"
            database = "[OK]" if results.get('database') else "[FAIL]"
            login = "[OK]" if results.get('login') else "[FAIL]"

            tenant_passed = all(results.values())
            status = "[PASSED]" if tenant_passed else "[FAILED]"

            print(f"{tenant_name:15} {status:10} Health: {health:6} DB: {database:6} Login: {login:6}")

            if not tenant_passed:
                all_passed = False

        print(f"\n{'='*60}")
        if all_passed:
            print("  [SUCCESS] All tests passed!")
        else:
            print("  [WARNING] Some tests failed. Check the details above.")
        print(f"{'='*60}\n")

def create_test_users():
    """Create test users for each tenant (for initial setup)"""
    print("\n========== Creating Test Users ==========\n")

    # This would normally connect to each database and create users
    # For now, we'll just print the SQL commands

    for tenant_id, config in TENANTS.items():
        print(f"-- {config['name']} ({tenant_id})")
        email = config['test_user']['email']

        # Password hash for 'admin123' (bcrypt)
        password_hash = "$2b$12$ZK8ReaD4UW/b/CPdvwUcAO1pPWBPEfmoZv5bC4vHO.3/4w4Iv2Pwm"

        print(f"INSERT INTO users (username, email, password, name, role, status, email_verified)")
        print(f"VALUES ('admin', '{email}', '{password_hash}', '{config['name']} Admin', 'admin', 'active', TRUE);")
        print()

def main():
    """Main function"""
    print("""
==================================================
     MULTI-TENANT LOGIN TEST SUITE
==================================================
""")

    print("Select action:")
    print("1. Test local environment (localhost)")
    print("2. Test remote environment (production)")
    print("3. Create test users (SQL commands)")
    print("0. Exit")

    choice = input("\nSelect option (0-3): ")

    if choice == '1':
        tester = TenantTester('local')
        tester.run_all_tests()
    elif choice == '2':
        tester = TenantTester('remote')
        tester.run_all_tests()
    elif choice == '3':
        create_test_users()
    elif choice == '0':
        print("Goodbye!")
        sys.exit(0)
    else:
        print("Invalid option")

if __name__ == "__main__":
    # Check if requests is installed
    try:
        import requests
    except ImportError:
        print("[ERROR] requests library not installed")
        print("Install it with: pip install requests")
        sys.exit(1)

    main()