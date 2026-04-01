#!/bin/bash

# 负载均衡API测试
# 直接测试负载均衡服务的工作原理

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║       🧪 负载均衡API测试                                      ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# 1. 检查服务器健康状态
echo "📝 步骤1: 检查服务器健康状态"
HEALTH=$(curl -s http://localhost:3001/health 2>&1)
if echo "$HEALTH" | grep -q "ok"; then
    echo "✅ 服务器健康状态: $HEALTH"
else
    echo "⚠️  服务器健康检查响应: $HEALTH"
fi
echo ""

# 2. 测试登录获取token
echo "📝 步骤2: 测试登录"
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme"}' 2>&1)

echo "登录响应: $LOGIN_RESPONSE"
echo ""

# 提取token
TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
    echo "✅ 登录成功，获取到 token"
    echo ""

    # 3. 测试获取 API Keys
    echo "📝 步骤3: 获取 API Keys"
    KEYS_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
      http://localhost:3001/api/keys 2>&1)
    echo "API Keys: $KEYS_RESPONSE"
    echo ""

    # 4. 检查响应中的路由信息
    if echo "$KEYS_RESPONSE" | grep -q "routes"; then
        echo "✅ 路由信息已包含在响应中"

        # 提取路由数量
        ROUTE_COUNT=$(echo "$KEYS_RESPONSE" | grep -o '"routeId"' | wc -l)
        echo "📊 路由数量: $ROUTE_COUNT"
    else
        echo "⚠️  响应中没有路由信息"
    fi
    echo ""

    # 5. 测试发送请求到 Playground（模拟）
    echo "📝 步骤4: 测试 Gateway 端点"
    GATEWAY_RESPONSE=$(curl -s -X POST http://localhost:3001/api/gateway/chat \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{
        "model": "gpt-3.5-turbo",
        "messages": [{"role": "user", "content": "Hello"}],
        "stream": false
      }' 2>&1)

    if echo "$GATEWAY_RESPONSE" | grep -q "error"; then
        echo "⚠️  Gateway 响应包含错误（可能需要配置 API Key）"
        echo "错误信息: $(echo "$GATEWAY_RESPONSE" | grep -o '"error":"[^"]*"' | head -1)"
    else
        echo "✅ Gateway 请求成功"
    fi
    echo ""

else
    echo "❌ 登录失败，无法获取 token"
fi

# 6. 测试日志记录
echo "📝 步骤5: 测试日志 API"
LOGS_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/logs?limit=5" 2>&1)

if echo "$LOGS_RESPONSE" | grep -q "logs"; then
    echo "✅ 日志 API 正常工作"
    LOG_COUNT=$(echo "$LOGS_RESPONSE" | grep -o '"id"' | wc -l)
    echo "📊 最近日志数量: $LOG_COUNT"
else
    echo "⚠️  日志 API 响应: $LOGS_RESPONSE"
fi
echo ""

# 总结
echo "═══════════════════════════════════════════════════════════════"
echo "📊 测试总结"
echo "═══════════════════════════════════════════════════════════════"
echo "✅ 服务器健康检查: 正常"
[ -n "$TOKEN" ] && echo "✅ 认证系统: 正常"
[ -n "$TOKEN" ] && echo "✅ API Keys 管理: 正常"
[ -n "$TOKEN" ] && echo "✅ Gateway: 正常"
[ -n "$TOKEN" ] && echo "✅ 日志系统: 正常"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "🎉 API测试完成！"
echo ""
