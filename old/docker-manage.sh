#!/bin/bash
# =====================================================
# Luwi Semantic Bridge - Docker Management Script
# =====================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo -e "${BLUE}"
    echo "========================================"
    echo "  $1"
    echo "========================================"
    echo -e "${NC}"
}

print_success() {
    echo -e "${GREEN}[OK] $1${NC}"
}

print_error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

# Check if Docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed!"
        echo "Install Docker from: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not installed!"
        echo "Install Docker Compose from: https://docs.docker.com/compose/install/"
        exit 1
    fi
    
    print_success "Docker and Docker Compose are installed"
}

# Check if .env.docker exists
check_env() {
    if [ ! -f ".env.docker" ]; then
        print_warning ".env.docker not found, creating from template..."
        cp .env.docker.template .env.docker 2>/dev/null || echo "Please create .env.docker manually"
        exit 1
    fi
    print_success "Environment file found"
}

# Start services
start_services() {
    print_header "Starting Services"
    check_docker
    check_env
    
    echo "Building and starting containers..."
    docker-compose --env-file .env.docker up -d --build
    
    echo ""
    print_success "Services started successfully"
    echo ""
    echo "Waiting for services to be healthy..."
    sleep 10
    
    docker-compose ps
    echo ""
    show_urls
}

# Stop services
stop_services() {
    print_header "Stopping Services"
    docker-compose --env-file .env.docker stop
    print_success "Services stopped"
}

# Restart services
restart_services() {
    print_header "Restarting Services"
    docker-compose --env-file .env.docker restart
    print_success "Services restarted"
}

# Show logs
show_logs() {
    service=${1:-""}
    if [ -z "$service" ]; then
        docker-compose --env-file .env.docker logs -f --tail=100
    else
        docker-compose --env-file .env.docker logs -f --tail=100 $service
    fi
}

# Show status
show_status() {
    print_header "Service Status"
    docker-compose --env-file .env.docker ps
    echo ""
    
    # Health checks
    print_header "Health Checks"
    
    echo "Backend API:"
    if curl -s http://localhost:8083/health > /dev/null 2>&1; then
        print_success "Backend is responding"
        curl -s http://localhost:8083/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:8083/health
    else
        print_error "Backend is not responding"
    fi
    
    echo ""
    echo "Frontend:"
    if curl -s http://localhost:3001 > /dev/null 2>&1; then
        print_success "Frontend is responding"
    else
        print_error "Frontend is not responding"
    fi
    
    echo ""
    show_urls
}

# Show service URLs
show_urls() {
    print_header "Service URLs"
    echo "Frontend:        http://localhost:3001"
    echo "Backend API:     http://localhost:8083"
    echo "Health Check:    http://localhost:8083/health"
    echo "Adminer (dev):   http://localhost:8080"
    echo "Redis UI (dev):  http://localhost:8081"
}

# Clean up everything
cleanup() {
    print_header "Cleaning Up"
    echo "This will remove all containers, volumes, and images!"
    read -p "Are you sure? (yes/no): " confirm
    
    if [ "$confirm" == "yes" ]; then
        docker-compose --env-file .env.docker down -v --rmi all
        print_success "Cleanup complete"
    else
        echo "Cleanup cancelled"
    fi
}

# Execute command in container
exec_command() {
    service=$1
    shift
    command=$@
    
    docker-compose --env-file .env.docker exec $service $command
}

# Database backup
backup_database() {
    print_header "Database Backup"
    timestamp=$(date +%Y%m%d_%H%M%S)
    backup_file="backup_${timestamp}.sql"
    
    echo "Creating backup: $backup_file"
    docker-compose --env-file .env.docker exec -T postgres pg_dump -U postgres asemb > "backups/$backup_file"
    
    if [ -f "backups/$backup_file" ]; then
        print_success "Backup created: backups/$backup_file"
    else
        print_error "Backup failed"
    fi
}

# Database restore
restore_database() {
    backup_file=$1
    
    if [ -z "$backup_file" ]; then
        echo "Available backups:"
        ls -1 backups/*.sql 2>/dev/null || echo "No backups found"
        read -p "Enter backup filename: " backup_file
    fi
    
    if [ ! -f "backups/$backup_file" ]; then
        print_error "Backup file not found: backups/$backup_file"
        exit 1
    fi
    
    print_header "Database Restore"
    echo "Restoring from: $backup_file"
    read -p "This will overwrite the current database. Continue? (yes/no): " confirm
    
    if [ "$confirm" == "yes" ]; then
        docker-compose --env-file .env.docker exec -T postgres psql -U postgres asemb < "backups/$backup_file"
        print_success "Database restored"
    else
        echo "Restore cancelled"
    fi
}

# Show help
show_help() {
    cat << EOF
Luwi Semantic Bridge - Docker Management

Usage: $0 [command] [options]

Commands:
  start              Start all services
  stop               Stop all services
  restart            Restart all services
  status             Show service status
  logs [service]     Show logs (optionally for specific service)
  exec <service> <command>  Execute command in service container
  backup             Backup database
  restore [file]     Restore database from backup
  clean              Remove all containers and volumes
  help               Show this help message

Examples:
  $0 start
  $0 logs backend
  $0 exec backend npm run migrate
  $0 backup
  $0 restore backup_20250106_120000.sql

EOF
}

# Main script
case "$1" in
    start)
        start_services
        ;;
    stop)
        stop_services
        ;;
    restart)
        restart_services
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs $2
        ;;
    exec)
        shift
        exec_command "$@"
        ;;
    backup)
        mkdir -p backups
        backup_database
        ;;
    restore)
        restore_database $2
        ;;
    clean)
        cleanup
        ;;
    help|--help|-h|"")
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
