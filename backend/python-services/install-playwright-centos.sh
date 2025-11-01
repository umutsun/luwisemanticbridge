#!/bin/bash
# Playwright Dependencies Installation for CentOS 7/8

echo "🔧 Installing Playwright system dependencies for CentOS..."

# Update system
sudo yum update -y

# Install required libraries for Chromium
sudo yum install -y \
    alsa-lib \
    atk \
    cups-libs \
    gtk3 \
    ipa-gothic-fonts \
    libXcomposite \
    libXcursor \
    libXdamage \
    libXext \
    libXi \
    libXrandr \
    libXScrnSaver \
    libXtst \
    pango \
    xorg-x11-fonts-100dpi \
    xorg-x11-fonts-75dpi \
    xorg-x11-fonts-cyrillic \
    xorg-x11-fonts-misc \
    xorg-x11-fonts-Type1 \
    xorg-x11-utils \
    nss \
    nspr \
    liberation-fonts \
    wget

# Install additional dependencies
sudo yum install -y \
    libgbm \
    libdrm \
    mesa-libgbm

echo "✅ System dependencies installed"

# Install Playwright browsers (Chromium)
echo "🌐 Installing Playwright Chromium browser..."
cd /var/www/lsemb/backend/python-services

# Activate venv
source venv/bin/activate

# Install playwright
pip install playwright

# Install Chromium browser binary
playwright install chromium

# Install system deps for playwright
playwright install-deps chromium

echo "✅ Playwright Chromium installed successfully"
echo ""
echo "📋 Test installation:"
echo "python -c 'from playwright.sync_api import sync_playwright; print(\"✅ Playwright works!\")'"
