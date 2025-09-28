#!/bin/bash

echo "=== Checking API container logs ==="
docker logs asemb-api --tail 30

echo -e "\n=== Checking frontend container logs ==="
docker logs asemb-frontend --tail 20

echo -e "\n=== Checking if .env.asemb exists and has keys ==="
if [ -f .env.asemb ]; then
    echo "✓ .env.asemb exists"
    echo "API Keys found:"
    grep -E "(OPENAI|DEEPSEEK|HUGGINGFACE|ANTHROPIC)_API_KEY" .env.asemb | head -5
else
    echo "✗ .env.asemb not found"
fi