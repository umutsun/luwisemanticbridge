#!/usr/bin/env python3
"""
LSEMB PM2 Management Menu
Interactive console menu for managing PM2 services
"""

import subprocess
import sys
import os
from typing import Optional

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

def clear_screen():
    """Clear console screen"""
    os.system('cls' if os.name == 'nt' else 'clear')

def print_header():
    """Print menu header"""
    print(f"{Colors.HEADER}{Colors.BOLD}")
    print("=" * 60)
    print("       LSEMB PM2 SERVICE MANAGEMENT MENU")
    print("=" * 60)
    print(f"{Colors.ENDC}")

def run_command(cmd: str, capture_output: bool = False) -> Optional[str]:
    """Run shell command"""
    try:
        if capture_output:
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            return result.stdout
        else:
            subprocess.run(cmd, shell=True)
            return None
    except Exception as e:
        print(f"{Colors.FAIL}❌ Error: {e}{Colors.ENDC}")
        return None

def show_status():
    """Show PM2 service status"""
    clear_screen()
    print_header()
    print(f"{Colors.OKCYAN}📊 Current Service Status:{Colors.ENDC}\n")
    run_command("pm2 list")
    input(f"\n{Colors.OKBLUE}Press Enter to continue...{Colors.ENDC}")

def start_all():
    """Start all services"""
    clear_screen()
    print_header()
    print(f"{Colors.OKGREEN}🚀 Starting all services...{Colors.ENDC}\n")
    run_command("pm2 start ecosystem.config.js")
    print(f"\n{Colors.OKGREEN}✅ All services started!{Colors.ENDC}")
    input(f"\n{Colors.OKBLUE}Press Enter to continue...{Colors.ENDC}")

def stop_all():
    """Stop all services"""
    clear_screen()
    print_header()
    print(f"{Colors.WARNING}⏸️  Stopping all services...{Colors.ENDC}\n")
    run_command("pm2 stop all")
    print(f"\n{Colors.OKGREEN}✅ All services stopped!{Colors.ENDC}")
    input(f"\n{Colors.OKBLUE}Press Enter to continue...{Colors.ENDC}")

def restart_all():
    """Restart all services"""
    clear_screen()
    print_header()
    print(f"{Colors.OKGREEN}🔄 Restarting all services...{Colors.ENDC}\n")
    run_command("pm2 restart all")
    print(f"\n{Colors.OKGREEN}✅ All services restarted!{Colors.ENDC}")
    input(f"\n{Colors.OKBLUE}Press Enter to continue...{Colors.ENDC}")

def delete_all():
    """Delete all PM2 processes"""
    clear_screen()
    print_header()
    print(f"{Colors.FAIL}🗑️  Deleting all PM2 processes...{Colors.ENDC}\n")
    confirm = input(f"{Colors.WARNING}Are you sure? (y/N): {Colors.ENDC}").lower()
    if confirm == 'y':
        run_command("pm2 delete all")
        print(f"\n{Colors.OKGREEN}✅ All processes deleted!{Colors.ENDC}")
    else:
        print(f"\n{Colors.OKBLUE}ℹ️  Cancelled.{Colors.ENDC}")
    input(f"\n{Colors.OKBLUE}Press Enter to continue...{Colors.ENDC}")

def view_logs():
    """View PM2 logs"""
    clear_screen()
    print_header()
    print(f"{Colors.OKCYAN}📋 Available Services:{Colors.ENDC}\n")
    print("1. All services")
    print("2. lsemb-backend")
    print("3. lsemb-frontend")
    print("4. lsemb-python")
    print("0. Back to main menu")

    choice = input(f"\n{Colors.OKBLUE}Select service (0-4): {Colors.ENDC}")

    commands = {
        '1': 'pm2 logs',
        '2': 'pm2 logs lsemb-backend',
        '3': 'pm2 logs lsemb-frontend',
        '4': 'pm2 logs lsemb-python'
    }

    if choice in commands:
        print(f"\n{Colors.WARNING}Press Ctrl+C to exit logs view{Colors.ENDC}\n")
        input("Press Enter to start...")
        run_command(commands[choice])

def manage_individual():
    """Manage individual service"""
    clear_screen()
    print_header()
    print(f"{Colors.OKCYAN}🔧 Individual Service Management:{Colors.ENDC}\n")
    print("1. Backend (lsemb-backend)")
    print("2. Frontend (lsemb-frontend)")
    print("3. Python Services (lsemb-python)")
    print("0. Back to main menu")

    service_choice = input(f"\n{Colors.OKBLUE}Select service (0-3): {Colors.ENDC}")

    services = {
        '1': 'lsemb-backend',
        '2': 'lsemb-frontend',
        '3': 'lsemb-python'
    }

    if service_choice not in services:
        return

    service = services[service_choice]

    print(f"\n{Colors.OKCYAN}Actions for {service}:{Colors.ENDC}\n")
    print("1. Start")
    print("2. Stop")
    print("3. Restart")
    print("4. View logs")
    print("5. Show details")
    print("0. Back")

    action = input(f"\n{Colors.OKBLUE}Select action (0-5): {Colors.ENDC}")

    actions = {
        '1': f'pm2 start ecosystem.config.js --only {service}',
        '2': f'pm2 stop {service}',
        '3': f'pm2 restart {service}',
        '4': f'pm2 logs {service}',
        '5': f'pm2 describe {service}'
    }

    if action in actions:
        print()
        run_command(actions[action])
        if action != '4':  # Logs will exit on its own
            input(f"\n{Colors.OKBLUE}Press Enter to continue...{Colors.ENDC}")

def monitoring():
    """Open PM2 monitoring"""
    clear_screen()
    print_header()
    print(f"{Colors.OKCYAN}📊 Opening PM2 Monitor...{Colors.ENDC}\n")
    print(f"{Colors.WARNING}Press Ctrl+C to exit monitor{Colors.ENDC}\n")
    input("Press Enter to start...")
    run_command("pm2 monit")

def check_redis():
    """Check Redis status"""
    clear_screen()
    print_header()
    print(f"{Colors.OKCYAN}🔍 Checking Redis...{Colors.ENDC}\n")

    # Try to ping Redis
    result = run_command("redis-cli ping 2>&1", capture_output=True)

    if result and "PONG" in result:
        print(f"{Colors.OKGREEN}✅ Redis is running!{Colors.ENDC}")
    else:
        print(f"{Colors.FAIL}❌ Redis is not running!{Colors.ENDC}")
        print(f"\n{Colors.WARNING}To start Redis:{Colors.ENDC}")
        print(f"{Colors.OKBLUE}Windows (Admin PowerShell): net start Redis{Colors.ENDC}")
        print(f"{Colors.OKBLUE}Linux: sudo systemctl start redis{Colors.ENDC}")

    input(f"\n{Colors.OKBLUE}Press Enter to continue...{Colors.ENDC}")

def service_info():
    """Show service information"""
    clear_screen()
    print_header()
    print(f"{Colors.OKCYAN}ℹ️  Service Information:{Colors.ENDC}\n")
    print(f"{Colors.OKGREEN}Backend API:{Colors.ENDC} http://localhost:8083")
    print(f"  - Node.js/TypeScript")
    print(f"  - GraphQL + REST APIs")
    print(f"  - Database operations")
    print()
    print(f"{Colors.OKGREEN}Frontend:{Colors.ENDC} http://localhost:3002")
    print(f"  - Next.js 14")
    print(f"  - Server-side rendering")
    print(f"  - User interface")
    print()
    print(f"{Colors.OKGREEN}Python Services:{Colors.ENDC} http://localhost:8001")
    print(f"  - FastAPI")
    print(f"  - Crawl4AI web scraping")
    print(f"  - Whisper transcription")
    print(f"  - pgai embeddings")
    print()
    print(f"{Colors.OKCYAN}Useful Commands:{Colors.ENDC}")
    print(f"  pm2 save         - Save process list")
    print(f"  pm2 resurrect    - Restore saved processes")
    print(f"  pm2 flush        - Clear all logs")
    print(f"  pm2 web          - Web monitoring (port 9615)")

    input(f"\n{Colors.OKBLUE}Press Enter to continue...{Colors.ENDC}")

def main_menu():
    """Display main menu"""
    while True:
        clear_screen()
        print_header()
        print(f"{Colors.OKGREEN}Main Menu:{Colors.ENDC}\n")
        print("1. 📊 Show Status")
        print("2. 🚀 Start All Services")
        print("3. ⏸️  Stop All Services")
        print("4. 🔄 Restart All Services")
        print("5. 🗑️  Delete All Processes")
        print("6. 📋 View Logs")
        print("7. 🔧 Manage Individual Service")
        print("8. 📊 Monitoring Dashboard")
        print("9. 🔍 Check Redis Status")
        print("10. ℹ️  Service Information")
        print("0. 🚪 Exit")

        choice = input(f"\n{Colors.OKBLUE}Select option (0-10): {Colors.ENDC}")

        menu_options = {
            '1': show_status,
            '2': start_all,
            '3': stop_all,
            '4': restart_all,
            '5': delete_all,
            '6': view_logs,
            '7': manage_individual,
            '8': monitoring,
            '9': check_redis,
            '10': service_info,
            '0': lambda: sys.exit(0)
        }

        if choice in menu_options:
            menu_options[choice]()
        else:
            print(f"{Colors.FAIL}❌ Invalid option!{Colors.ENDC}")
            input(f"\n{Colors.OKBLUE}Press Enter to continue...{Colors.ENDC}")

if __name__ == "__main__":
    try:
        main_menu()
    except KeyboardInterrupt:
        print(f"\n\n{Colors.OKGREEN}👋 Goodbye!{Colors.ENDC}\n")
        sys.exit(0)
