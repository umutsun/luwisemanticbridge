#!/bin/bash

# Check what files are in the .next directory after build
echo "=== Checking .next directory structure ==="
ls -la frontend/.next/

echo -e "\n=== Checking if standalone directory exists ==="
if [ -d "frontend/.next/standalone" ]; then
    echo "Standalone directory exists. Contents:"
    ls -la frontend/.next/standalone/
else
    echo "Standalone directory does NOT exist"
fi

echo -e "\n=== Checking for server.js in various locations ==="
find frontend/.next -name "server.js" 2>/dev/null

echo -e "\n=== Checking package.json build script ==="
grep -A 5 -B 5 "build" frontend/package.json