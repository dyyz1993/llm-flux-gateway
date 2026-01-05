#!/bin/bash

# Test Script for Attribute Overrides Feature
#
# This script tests the Attribute Overrides functionality by sending requests
# that should trigger different route matching scenarios.

set -e

API_KEY="${API_KEY:-your-api-key-here}"
BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "=========================================="
echo "Attribute Overrides Test Script"
echo "=========================================="
echo ""

# Check if API key is set
if [ "$API_KEY" = "your-api-key-here" ]; then
  echo "❌ ERROR: Please set API_KEY environment variable"
  echo "   Example: export API_KEY=sk-xxxxx"
  exit 1
fi

echo "📍 Base URL: $BASE_URL"
echo "🔑 API Key: ${API_KEY:0:10}..."
echo ""

# Test 1: Request with model that has override rules (gpt-4 → glm-4.6)
echo "=========================================="
echo "Test 1: Model with Override Rules"
echo "=========================================="
echo "Requesting model: gpt-4"
echo "Expected route: coding (with override rules)"
echo "Expected transformation: gpt-4 → glm-4.6"
echo ""

RESPONSE1=$(curl -s -X POST "$BASE_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Test message"}],
    "stream": false
  }')

echo "Response:"
echo "$RESPONSE1" | jq '.model' 2>/dev/null || echo "$RESPONSE1"
echo ""

# Test 2: Request with wildcard override (any model → glm-4.7)
echo "=========================================="
echo "Test 2: Wildcard Override Rules"
echo "=========================================="
echo "Requesting model: gpt-3.5-turbo"
echo "Expected route: coding (with wildcard override)"
echo "Expected transformation: gpt-3.5-turbo → glm-4.7"
echo ""

RESPONSE2=$(curl -s -X POST "$BASE_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Test message"}],
    "stream": false
  }')

echo "Response:"
echo "$RESPONSE2" | jq '.model' 2>/dev/null || echo "$RESPONSE2"
echo ""

# Test 3: Request with model that has NO override rules
echo "=========================================="
echo "Test 3: Model WITHOUT Override Rules"
echo "=========================================="
echo "Requesting model: glm-4-air"
echo "Expected route: glm-coding-anthropic (NO override rules)"
echo "Expected transformation: glm-4-air → glm-4-air (pass-through)"
echo ""

RESPONSE3=$(curl -s -X POST "$BASE_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "model": "glm-4-air",
    "messages": [{"role": "user", "content": "Test message"}],
    "stream": false
  }')

echo "Response:"
echo "$RESPONSE3" | jq '.model' 2>/dev/null || echo "$RESPONSE3"
echo ""

# Summary
echo "=========================================="
echo "Next Steps:"
echo "=========================================="
echo "1. Open the Logs UI in your browser"
echo "2. Check the latest 3 requests"
echo "3. Verify:"
echo "   - Request 1 (gpt-4): Should show 'Attribute Overrides' section"
echo "   - Request 2 (gpt-3.5-turbo): Should show 'Attribute Overrides' section"
echo "   - Request 3 (glm-4-air): Should NOT show 'Attribute Overrides' section"
echo ""
echo "4. Click on each log to see details:"
echo "   - original_model vs final_model"
echo "   - overwritten_attributes content"
echo "=========================================="
