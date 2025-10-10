#!/bin/bash
# =====================================================
# Test Deepseek LLM Integration
# =====================================================

echo "================================"
echo "Testing Deepseek Integration"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test 1: Check LLM Status
echo "Test 1: Checking LLM Services Status..."
echo ""

response=$(curl -s http://localhost:8083/api/v2/settings/llm-status)

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Backend is responding${NC}"
    echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
else
    echo -e "${RED}❌ Backend not responding${NC}"
    echo "Please start backend: cd backend && npm run dev"
    exit 1
fi

echo ""
echo "--------------------------------"
echo ""

# Test 2: Test Chat with Deepseek
echo "Test 2: Testing Chat Endpoint..."
echo ""

chat_response=$(curl -s -X POST http://localhost:8083/api/v2/rag/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello! Please respond with: DEEPSEEK_TEST_OK",
    "collection_name": "test"
  }')

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Chat endpoint responding${NC}"
    echo "Response:"
    echo "$chat_response" | python3 -m json.tool 2>/dev/null || echo "$chat_response"
    
    # Check which provider was used
    if echo "$chat_response" | grep -q "deepseek"; then
        echo ""
        echo -e "${GREEN}✅ DeepSeek was used as primary provider!${NC}"
    elif echo "$chat_response" | grep -q "openai"; then
        echo ""
        echo -e "${YELLOW}⚠️  OpenAI was used (fallback)${NC}"
    elif echo "$chat_response" | grep -q "claude"; then
        echo ""
        echo -e "${YELLOW}⚠️  Claude was used (fallback)${NC}"
    fi
else
    echo -e "${RED}❌ Chat endpoint not responding${NC}"
fi

echo ""
echo "================================"
echo "Test Complete!"
echo "================================"
