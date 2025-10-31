#!/usr/bin/env python3
"""
Redis Backup & Migration Tool
Backup local Redis data and restore to remote server
"""

import subprocess
import sys
import argparse
import os
from datetime import datetime
from typing import Optional

class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def run_command(cmd: str, capture_output: bool = True) -> Optional[str]:
    """Run shell command"""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=capture_output, text=True)
        if result.returncode != 0 and not capture_output:
            print(f"{Colors.FAIL}Error: {result.stderr}{Colors.ENDC}")
            return None
        return result.stdout if capture_output else "OK"
    except Exception as e:
        print(f"{Colors.FAIL}❌ Error: {e}{Colors.ENDC}")
        return None

def backup_local_redis(output_file: str = None) -> bool:
    """Backup local Redis to RDB file"""
    if not output_file:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = f"redis_backup_{timestamp}.rdb"

    print(f"{Colors.OKCYAN}📦 Backing up local Redis...{Colors.ENDC}")

    # Trigger Redis SAVE
    result = run_command("redis-cli SAVE")
    if not result or "OK" not in result:
        print(f"{Colors.FAIL}❌ Failed to save Redis data{Colors.ENDC}")
        return False

    # Find Redis dump file
    redis_dir_cmd = 'redis-cli CONFIG GET dir'
    redis_dir_result = run_command(redis_dir_cmd)

    if redis_dir_result:
        lines = redis_dir_result.strip().split('\n')
        if len(lines) >= 2:
            redis_dir = lines[1].strip()
            source_file = os.path.join(redis_dir, 'dump.rdb')

            if os.path.exists(source_file):
                # Copy to backup location
                import shutil
                shutil.copy2(source_file, output_file)
                print(f"{Colors.OKGREEN}✅ Backup saved to: {output_file}{Colors.ENDC}")

                # Show file size
                size = os.path.getsize(output_file)
                print(f"{Colors.OKBLUE}ℹ️  File size: {size / 1024:.2f} KB{Colors.ENDC}")
                return True

    print(f"{Colors.FAIL}❌ Could not find Redis dump file{Colors.ENDC}")
    return False

def export_redis_to_json(output_file: str = None) -> bool:
    """Export Redis data to JSON format"""
    if not output_file:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = f"redis_export_{timestamp}.json"

    print(f"{Colors.OKCYAN}📤 Exporting Redis data to JSON...{Colors.ENDC}")

    # Get all keys
    keys_result = run_command('redis-cli --scan')
    if not keys_result:
        print(f"{Colors.FAIL}❌ Failed to get Redis keys{Colors.ENDC}")
        return False

    keys = [k.strip() for k in keys_result.split('\n') if k.strip()]
    print(f"{Colors.OKBLUE}ℹ️  Found {len(keys)} keys{Colors.ENDC}")

    import json
    redis_data = {}

    for key in keys:
        # Get key type
        key_type = run_command(f'redis-cli TYPE "{key}"')
        if not key_type:
            continue

        key_type = key_type.strip()

        # Get value based on type
        if key_type == 'string':
            value = run_command(f'redis-cli GET "{key}"')
            redis_data[key] = {'type': 'string', 'value': value.strip() if value else ''}
        elif key_type == 'list':
            length = run_command(f'redis-cli LLEN "{key}"')
            if length:
                values = []
                for i in range(int(length.strip())):
                    val = run_command(f'redis-cli LINDEX "{key}" {i}')
                    if val:
                        values.append(val.strip())
                redis_data[key] = {'type': 'list', 'value': values}
        elif key_type == 'hash':
            values = run_command(f'redis-cli HGETALL "{key}"')
            if values:
                lines = [l.strip() for l in values.split('\n') if l.strip()]
                hash_dict = {}
                for i in range(0, len(lines), 2):
                    if i + 1 < len(lines):
                        hash_dict[lines[i]] = lines[i + 1]
                redis_data[key] = {'type': 'hash', 'value': hash_dict}
        elif key_type == 'set':
            values = run_command(f'redis-cli SMEMBERS "{key}"')
            if values:
                members = [v.strip() for v in values.split('\n') if v.strip()]
                redis_data[key] = {'type': 'set', 'value': members}

        # Get TTL
        ttl = run_command(f'redis-cli TTL "{key}"')
        if ttl and ttl.strip() != '-1':
            redis_data[key]['ttl'] = int(ttl.strip())

    # Save to JSON
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(redis_data, f, indent=2, ensure_ascii=False)

    print(f"{Colors.OKGREEN}✅ Exported to: {output_file}{Colors.ENDC}")
    print(f"{Colors.OKBLUE}ℹ️  Total keys: {len(redis_data)}{Colors.ENDC}")
    return True

def import_json_to_redis(input_file: str, host: str = 'localhost', port: int = 6379, password: str = None) -> bool:
    """Import JSON data to Redis"""
    if not os.path.exists(input_file):
        print(f"{Colors.FAIL}❌ File not found: {input_file}{Colors.ENDC}")
        return False

    print(f"{Colors.OKCYAN}📥 Importing data from {input_file}...{Colors.ENDC}")

    import json
    with open(input_file, 'r', encoding='utf-8') as f:
        redis_data = json.load(f)

    print(f"{Colors.OKBLUE}ℹ️  Found {len(redis_data)} keys to import{Colors.ENDC}")

    # Build redis-cli command prefix
    redis_cmd = f'redis-cli -h {host} -p {port}'
    if password:
        redis_cmd += f' -a {password}'

    imported = 0
    failed = 0

    for key, data in redis_data.items():
        key_type = data.get('type')
        value = data.get('value')
        ttl = data.get('ttl')

        try:
            if key_type == 'string':
                cmd = f'{redis_cmd} SET "{key}" "{value}"'
                run_command(cmd, capture_output=False)
            elif key_type == 'list':
                # Delete existing key first
                run_command(f'{redis_cmd} DEL "{key}"', capture_output=False)
                for item in value:
                    cmd = f'{redis_cmd} RPUSH "{key}" "{item}"'
                    run_command(cmd, capture_output=False)
            elif key_type == 'hash':
                run_command(f'{redis_cmd} DEL "{key}"', capture_output=False)
                for field, val in value.items():
                    cmd = f'{redis_cmd} HSET "{key}" "{field}" "{val}"'
                    run_command(cmd, capture_output=False)
            elif key_type == 'set':
                run_command(f'{redis_cmd} DEL "{key}"', capture_output=False)
                for member in value:
                    cmd = f'{redis_cmd} SADD "{key}" "{member}"'
                    run_command(cmd, capture_output=False)

            # Set TTL if exists
            if ttl and ttl > 0:
                run_command(f'{redis_cmd} EXPIRE "{key}" {ttl}', capture_output=False)

            imported += 1
            if imported % 100 == 0:
                print(f"{Colors.OKBLUE}  Imported {imported}/{len(redis_data)} keys...{Colors.ENDC}")

        except Exception as e:
            print(f"{Colors.FAIL}❌ Failed to import {key}: {e}{Colors.ENDC}")
            failed += 1

    print(f"{Colors.OKGREEN}✅ Import complete!{Colors.ENDC}")
    print(f"{Colors.OKBLUE}ℹ️  Imported: {imported}, Failed: {failed}{Colors.ENDC}")
    return True

def interactive_mode():
    """Interactive menu"""
    while True:
        print(f"\n{Colors.HEADER}{Colors.BOLD}Redis Backup & Migration Tool{Colors.ENDC}\n")
        print("1. 📦 Backup local Redis (RDB format)")
        print("2. 📤 Export local Redis to JSON")
        print("3. 📥 Import JSON to Redis")
        print("4. 🚀 Quick: Export local → Import to remote")
        print("0. 🚪 Exit")

        choice = input(f"\n{Colors.OKBLUE}Select option (0-4): {Colors.ENDC}")

        if choice == '1':
            filename = input(f"{Colors.OKBLUE}Output filename (Enter for auto): {Colors.ENDC}").strip()
            backup_local_redis(filename if filename else None)

        elif choice == '2':
            filename = input(f"{Colors.OKBLUE}Output filename (Enter for auto): {Colors.ENDC}").strip()
            export_redis_to_json(filename if filename else None)

        elif choice == '3':
            filename = input(f"{Colors.OKBLUE}Input JSON file: {Colors.ENDC}").strip()
            host = input(f"{Colors.OKBLUE}Redis host (default: localhost): {Colors.ENDC}").strip() or 'localhost'
            port = input(f"{Colors.OKBLUE}Redis port (default: 6379): {Colors.ENDC}").strip() or '6379'
            password = input(f"{Colors.OKBLUE}Redis password (Enter if none): {Colors.ENDC}").strip() or None
            import_json_to_redis(filename, host, int(port), password)

        elif choice == '4':
            print(f"\n{Colors.OKCYAN}Quick Migration: Local → Remote{Colors.ENDC}\n")

            # Export local
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            temp_file = f"redis_migration_{timestamp}.json"

            if export_redis_to_json(temp_file):
                print(f"\n{Colors.OKGREEN}✅ Local export complete{Colors.ENDC}")

                # Get remote details
                host = input(f"\n{Colors.OKBLUE}Remote Redis host: {Colors.ENDC}").strip()
                port = input(f"{Colors.OKBLUE}Remote Redis port (default: 6379): {Colors.ENDC}").strip() or '6379'
                password = input(f"{Colors.OKBLUE}Remote Redis password (Enter if none): {Colors.ENDC}").strip() or None

                # Import to remote
                if import_json_to_redis(temp_file, host, int(port), password):
                    print(f"\n{Colors.OKGREEN}✅ Migration complete!{Colors.ENDC}")

                    # Ask to delete temp file
                    delete = input(f"\n{Colors.OKBLUE}Delete temp file? (y/N): {Colors.ENDC}").lower()
                    if delete == 'y':
                        os.remove(temp_file)
                        print(f"{Colors.OKGREEN}✅ Temp file deleted{Colors.ENDC}")

        elif choice == '0':
            print(f"\n{Colors.OKGREEN}👋 Goodbye!{Colors.ENDC}\n")
            break

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Redis Backup & Migration Tool')
    parser.add_argument('--export', action='store_true', help='Export Redis to JSON')
    parser.add_argument('--import', dest='import_file', help='Import JSON to Redis')
    parser.add_argument('--output', '-o', help='Output filename')
    parser.add_argument('--host', default='localhost', help='Redis host')
    parser.add_argument('--port', type=int, default=6379, help='Redis port')
    parser.add_argument('--password', '-a', help='Redis password')

    args = parser.parse_args()

    if args.export:
        export_redis_to_json(args.output)
    elif args.import_file:
        import_json_to_redis(args.import_file, args.host, args.port, args.password)
    else:
        try:
            interactive_mode()
        except KeyboardInterrupt:
            print(f"\n\n{Colors.OKGREEN}👋 Goodbye!{Colors.ENDC}\n")
            sys.exit(0)
