#!/bin/bash
# PostgreSQL Extension Installation Script for pgai and pgvectorscale
# Run this script on your PostgreSQL server (91.99.229.96)

set -e

echo "🚀 Starting PostgreSQL extension installation..."
echo "================================================"

# Check PostgreSQL version
PG_VERSION=$(psql -V | grep -oP '\d+' | head -1)
echo "📌 PostgreSQL Version: $PG_VERSION"

# Function to check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        echo "⚠️  This script should be run as root or with sudo"
        exit 1
    fi
}

# Install pgai extension
install_pgai() {
    echo ""
    echo "📦 Installing pgai extension..."
    echo "================================"

    # Install pgai from timescaledb repository
    if [ -f /etc/debian_version ]; then
        # Debian/Ubuntu
        echo "Detected Debian/Ubuntu system"

        # Add TimescaleDB repository
        echo "Adding TimescaleDB repository..."
        apt-get update
        apt-get install -y gnupg postgresql-common apt-transport-https lsb-release wget

        # Add the repository
        sh /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
        echo "deb https://packagecloud.io/timescale/timescaledb/ubuntu/ $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/timescaledb.list
        wget --quiet -O - https://packagecloud.io/timescale/timescaledb/gpgkey | apt-key add -

        apt-get update

        # Install pgai
        apt-get install -y postgresql-$PG_VERSION-pgai

    elif [ -f /etc/redhat-release ]; then
        # RedHat/CentOS
        echo "Detected RedHat/CentOS system"

        # Add TimescaleDB repository
        tee /etc/yum.repos.d/timescale_timescaledb.repo <<EOL
[timescale_timescaledb]
name=timescale_timescaledb
baseurl=https://packagecloud.io/timescale/timescaledb/el/\$releasever/\$basearch
repo_gpgcheck=1
gpgcheck=0
enabled=1
gpgkey=https://packagecloud.io/timescale/timescaledb/gpgkey
sslverify=1
sslcacert=/etc/pki/tls/certs/ca-bundle.crt
metadata_expire=300
EOL

        yum update -y
        yum install -y pgai_$PG_VERSION
    fi

    echo "✅ pgai installed successfully"
}

# Install pgvectorscale extension
install_pgvectorscale() {
    echo ""
    echo "📦 Installing pgvectorscale extension..."
    echo "========================================"

    if [ -f /etc/debian_version ]; then
        # Debian/Ubuntu
        apt-get install -y postgresql-$PG_VERSION-pgvectorscale

    elif [ -f /etc/redhat-release ]; then
        # RedHat/CentOS
        yum install -y pgvectorscale_$PG_VERSION
    fi

    echo "✅ pgvectorscale installed successfully"
}

# Enable extensions in database
enable_extensions() {
    echo ""
    echo "🔧 Enabling extensions in lsemb database..."
    echo "==========================================="

    # You'll need to update these credentials
    export PGPASSWORD='12Kemal1221'

    # Enable pgai
    echo "Enabling pgai extension..."
    psql -U postgres -d lsemb -c "CREATE EXTENSION IF NOT EXISTS ai CASCADE;" || {
        echo "⚠️  Failed to create ai extension. Trying with vectorizer..."
        psql -U postgres -d lsemb -c "CREATE EXTENSION IF NOT EXISTS vectorizer CASCADE;"
    }

    # Enable pgvectorscale
    echo "Enabling pgvectorscale extension..."
    psql -U postgres -d lsemb -c "CREATE EXTENSION IF NOT EXISTS vectorscale CASCADE;"

    # Verify installations
    echo ""
    echo "📊 Verification:"
    psql -U postgres -d lsemb -c "SELECT extname, extversion FROM pg_extension WHERE extname IN ('ai', 'vectorizer', 'vectorscale', 'vector') ORDER BY extname;"

    unset PGPASSWORD

    echo ""
    echo "✅ All extensions enabled successfully!"
}

# Install pg_cron (optional, for scheduled tasks)
install_pgcron() {
    echo ""
    echo "📦 Installing pg_cron (optional)..."
    echo "===================================="

    if [ -f /etc/debian_version ]; then
        apt-get install -y postgresql-$PG_VERSION-cron
    elif [ -f /etc/redhat-release ]; then
        yum install -y pg_cron_$PG_VERSION
    fi

    # Add to postgresql.conf
    echo "shared_preload_libraries = 'pg_cron'" >> /etc/postgresql/$PG_VERSION/main/postgresql.conf

    echo "✅ pg_cron installed (requires PostgreSQL restart)"
}

# Main installation
main() {
    check_root

    echo "Starting installation..."

    # Install extensions
    install_pgai
    install_pgvectorscale

    # Optional: install pg_cron
    read -p "Do you want to install pg_cron for scheduled tasks? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        install_pgcron
        echo "⚠️  Please restart PostgreSQL: systemctl restart postgresql"
    fi

    # Enable extensions in database
    enable_extensions

    echo ""
    echo "🎉 Installation completed successfully!"
    echo ""
    echo "Next steps:"
    echo "1. If you installed pg_cron, restart PostgreSQL"
    echo "2. Run the pgai worker service"
    echo "3. Configure auto-embedding for your tables"
}

# Run main function
main
