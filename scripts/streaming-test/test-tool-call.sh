#!/bin/bash

# Tool Call Verification Script using curl
# This script tests the SSE stream directly without a browser

echo "🔍 Tool Call Verification Test"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check if server is running
echo "📡 Checking if server is running..."
if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Server is running${NC}"
else
    echo -e "${RED}❌ Server is not running${NC}"
    echo "Please start the server first: npm run dev"
    exit 1
fi

echo ""

# Test 2: Send a tool call request
echo "🔧 Sending tool call request..."
echo "================================"

# Create a test payload
PAYLOAD=$(cat <<EOF
{
  "model": "gpt-4o-mini",
  "messages": [
    {
      "role": "user",
      "content": "What is the weather in Tokyo?"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get the current weather in a location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string",
              "description": "The city and state, e.g. San Francisco, CA"
            },
            "unit": {
              "type": "string",
              "enum": ["celsius", "fahrenheit"],
              "description": "The temperature unit"
            }
          },
          "required": ["location"]
        }
      }
    }
  ],
  "stream": true
}
EOF
)

# Make the request and capture SSE stream
echo "📡 Sending request to http://localhost:3000/api/v1/chat/completions"
echo ""

CHUNK_COUNT=0
TOOL_CALL_COUNT=0
CONTENT_COUNT=0
DONE_RECEIVED=0

# Process SSE stream
response=$(curl -s -X POST http://localhost:3000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-api-key" \
  -d "$PAYLOAD")

echo "📥 Raw Response:"
echo "$response"
echo ""

# Parse SSE chunks
echo "🔍 Parsing SSE Chunks:"
echo "======================"

while IFS= read -r line; do
    if [[ $line == data:* ]]; then
        data="${line#data: }"

        if [[ $data == "[DONE]" ]]; then
            echo -e "${GREEN}✅ Chunk #((CHUNK_COUNT + 1)): [DONE]${NC}"
            DONE_RECEIVED=1
        else
            CHUNK_COUNT=$((CHUNK_COUNT + 1))

            # Check for tool_calls
            if echo "$data" | grep -q "tool_calls"; then
                TOOL_CALL_COUNT=$((TOOL_CALL_COUNT + 1))
                echo -e "${YELLOW}🔧 Chunk #$CHUNK_COUNT: TOOL CALL DETECTED${NC}"

                # Try to extract tool call info
                if command -v jq &> /dev/null; then
                    tool_calls=$(echo "$data" | jq -r '.choices[0].delta.tool_calls // empty' 2>/dev/null)
                    if [[ -n "$tool_calls" ]]; then
                        echo "   Tool Calls: $tool_calls"
                    fi
                fi
            fi

            # Check for content
            if echo "$data" | grep -q '"content"' && ! echo "$data" | grep -q '"content": null'; then
                CONTENT_COUNT=$((CONTENT_COUNT + 1))
                echo -e "📝 Chunk #$CHUNK_COUNT: Content"
            fi

            # Check for finish_reason
            if echo "$data" | grep -q "finish_reason"; then
                if command -v jq &> /dev/null; then
                    finish_reason=$(echo "$data" | jq -r '.choices[0].finish_reason // empty' 2>/dev/null)
                    echo -e "⏹️  Finish Reason: $finish_reason"
                fi
            fi
        fi
    fi
done <<< "$response"

echo ""
echo "================================"
echo "📊 TEST SUMMARY"
echo "================================"
echo "Total Chunks: $CHUNK_COUNT"
echo -e "Tool Call Chunks: ${YELLOW}$TOOL_CALL_COUNT${NC}"
echo "Content Chunks: $CONTENT_COUNT"
echo -e "Stream Completed: ${GREEN}$DONE_RECEIVED${NC}"
echo ""

# Final verdict
if [[ $TOOL_CALL_COUNT -gt 0 ]]; then
    echo -e "${GREEN}✅ SUCCESS: Tool calls were received in the stream${NC}"
    exit 0
else
    echo -e "${RED}❌ FAILURE: No tool calls detected in the stream${NC}"
    exit 1
fi
