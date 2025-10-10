#!/bin/bash
# =====================================================
# Luwi Semantic Bridge - Automated Backup Script
# =====================================================

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="asb_backup_${TIMESTAMP}"

# Database configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-asemb}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD}"

# S3 Configuration (optional)
S3_BUCKET="${S3_BUCKET}"
S3_PATH="${S3_PATH:-backups/}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Create backup directory
mkdir -p "${BACKUP_DIR}"
mkdir -p "${BACKUP_DIR}/database"
mkdir -p "${BACKUP_DIR}/uploads"
mkdir -p "${BACKUP_DIR}/configs"

# =====================================================
# Backup Database
# =====================================================
backup_database() {
    log_info "Starting database backup..."
    
    local db_backup_file="${BACKUP_DIR}/database/${BACKUP_NAME}.sql"
    
    PGPASSWORD="${DB_PASSWORD}" pg_dump \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        -F c \
        -f "${db_backup_file}.backup"
    
    # Also create plain SQL dump for easy viewing
    PGPASSWORD="${DB_PASSWORD}" pg_dump \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        > "${db_backup_file}"
    
    # Compress backups
    gzip -f "${db_backup_file}"
    
    log_info "Database backup completed: ${db_backup_file}.gz"
}

# =====================================================
# Backup Uploaded Files
# =====================================================
backup_uploads() {
    log_info "Starting uploads backup..."
    
    local uploads_dir="./backend/uploads"
    if [ -d "${uploads_dir}" ]; then
        local uploads_backup="${BACKUP_DIR}/uploads/${BACKUP_NAME}_uploads.tar.gz"
        tar -czf "${uploads_backup}" -C "${uploads_dir}" .
        log_info "Uploads backup completed: ${uploads_backup}"
    else
        log_warning "Uploads directory not found, skipping"
    fi
}

# =====================================================
# Backup Configuration Files
# =====================================================
backup_configs() {
    log_info "Starting configuration backup..."
    
    local config_backup="${BACKUP_DIR}/configs/${BACKUP_NAME}_configs.tar.gz"
    
    tar -czf "${config_backup}" \
        --exclude='node_modules' \
        --exclude='.next' \
        --exclude='dist' \
        --exclude='*.log' \
        .env.* \
        ecosystem.config.js \
        docker-compose.yml \
        nginx.conf \
        2>/dev/null || true
    
    log_info "Configuration backup completed: ${config_backup}"
}

# =====================================================
# Upload to S3 (if configured)
# =====================================================
upload_to_s3() {
    if [ -z "${S3_BUCKET}" ]; then
        log_info "S3 bucket not configured, skipping cloud upload"
        return
    fi
    
    log_info "Uploading backups to S3..."
    
    aws s3 sync "${BACKUP_DIR}" "s3://${S3_BUCKET}/${S3_PATH}" \
        --exclude "*" \
        --include "*${BACKUP_NAME}*" \
        --storage-class STANDARD_IA
    
    log_info "S3 upload completed"
}

# =====================================================
# Clean Old Backups
# =====================================================
cleanup_old_backups() {
    log_info "Cleaning up old backups (retention: ${RETENTION_DAYS} days)..."
    
    find "${BACKUP_DIR}" -type f -mtime +${RETENTION_DAYS} -delete
    
    log_info "Cleanup completed"
}

# =====================================================
# Create Backup Manifest
# =====================================================
create_manifest() {
    local manifest_file="${BACKUP_DIR}/${BACKUP_NAME}_manifest.json"
    
    cat > "${manifest_file}" << EOF
{
  "backup_name": "${BACKUP_NAME}",
  "timestamp": "$(date -Iseconds)",
  "database": {
    "host": "${DB_HOST}",
    "port": "${DB_PORT}",
    "name": "${DB_NAME}",
    "backup_file": "database/${BACKUP_NAME}.sql.gz"
  },
  "uploads": {
    "backup_file": "uploads/${BACKUP_NAME}_uploads.tar.gz"
  },
  "configs": {
    "backup_file": "configs/${BACKUP_NAME}_configs.tar.gz"
  },
  "retention_days": ${RETENTION_DAYS},
  "s3_bucket": "${S3_BUCKET:-null}"
}
EOF
    
    log_info "Backup manifest created: ${manifest_file}"
}

# =====================================================
# Main Execution
# =====================================================
main() {
    log_info "Starting backup process..."
    log_info "Backup name: ${BACKUP_NAME}"
    
    backup_database
    backup_uploads
    backup_configs
    create_manifest
    
    if [ -n "${S3_BUCKET}" ]; then
        upload_to_s3
    fi
    
    cleanup_old_backups
    
    log_info "Backup process completed successfully!"
    log_info "Backup location: ${BACKUP_DIR}"
    
    # Show backup size
    du -sh "${BACKUP_DIR}" | awk '{print "Total backup size: " $1}'
}

# Run main function
main "$@"
