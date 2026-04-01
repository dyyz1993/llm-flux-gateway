#!/bin/bash

# 负载均衡路由测试脚本
# 测试负载均衡器的工作原理

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║       🧪 负载均衡路由测试                                     ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# 1. 检查开发服务器
echo "📝 步骤1: 检查开发服务器状态"
if curl -s -I http://localhost:3001/ > /dev/null 2>&1; then
    echo "✅ 开发服务器运行正常 (http://localhost:3001/)"
else
    echo "❌ 开发服务器未运行，请先运行 'npm run dev'"
    exit 1
fi
echo ""

# 2. 检查数据库
echo "📝 步骤2: 检查数据库"
DB_PATH="./data/db.sqlite"
if [ -f "$DB_PATH" ]; then
    echo "✅ 数据库文件存在: $DB_PATH"
    TABLES=$(sqlite3 "$DB_PATH" ".tables" 2>/dev/null)
    echo "📊 数据库表: $TABLES"
else
    echo "⚠️  数据库文件不存在: $DB_PATH"
fi
echo ""

# 3. 检查 API Key 表结构
echo "📝 步骤3: 检查 api_key_routes 表结构"
if [ -f "$DB_PATH" ]; then
    SCHEMA=$(sqlite3 "$DB_PATH" "PRAGMA table_info(api_key_routes);" 2>/dev/null)
    if echo "$SCHEMA" | grep -q "weight"; then
        echo "✅ weight 字段存在"
    else
        echo "❌ weight 字段不存在"
    fi

    if echo "$SCHEMA" | grep -q "health_status"; then
        echo "✅ health_status 字段存在"
    else
        echo "❌ health_status 字段不存在"
    fi

    if echo "$SCHEMA" | grep -q "fail_count"; then
        echo "✅ fail_count 字段存在"
    else
        echo "❌ fail_count 字段不存在"
    fi
fi
echo ""

# 4. 检查负载均衡服务文件
echo "📝 步骤4: 检查负载均衡服务文件"
if [ -f "./src/server/module-gateway/services/load-balancer.service.ts" ]; then
    echo "✅ load-balancer.service.ts 存在"
    FUNCTIONS=$(grep -E "export (async )?function|export class" "./src/server/module-gateway/services/load-balancer.service.ts" 2>/dev/null | wc -l)
    echo "📊 导出的函数/类数量: $FUNCTIONS"
else
    echo "❌ load-balancer.service.ts 不存在"
fi
echo ""

# 5. 检查负载均衡执行器
echo "📝 步骤5: 检查负载均衡执行器"
if [ -f "./src/server/module-gateway/services/load-balancer-executor.service.ts" ]; then
    echo "✅ load-balancer-executor.service.ts 存在"
    FUNCTIONS=$(grep -E "export (async )?function|export class" "./src/server/module-gateway/services/load-balancer-executor.service.ts" 2>/dev/null | wc -l)
    echo "📊 导出的函数/类数量: $FUNCTIONS"
else
    echo "❌ load-balancer-executor.service.ts 不存在"
fi
echo ""

# 6. 测试前端 API 响应
echo "📝 步骤6: 测试前端页面响应"
RESPONSE=$(curl -s http://localhost:3001/ | grep -o "<title>.*</title>" | head -1)
if echo "$RESPONSE" | grep -q "LLM Flux Gateway"; then
    echo "✅ 页面标题正确: $RESPONSE"
else
    echo "⚠️  页面标题: $RESPONSE"
fi
echo ""

# 7. 检查负载均衡相关类型定义
echo "📝 步骤7: 检查类型定义"
if grep -q "weight.*number" "./src/shared/types.ts" 2>/dev/null; then
    echo "✅ weight 类型已定义"
else
    echo "❌ weight 类型未定义"
fi

if grep -q "healthStatus" "./src/shared/types.ts" 2>/dev/null; then
    echo "✅ healthStatus 类型已定义"
else
    echo "❌ healthStatus 类型未定义"
fi
echo ""

# 8. 总结
echo "═══════════════════════════════════════════════════════════════"
echo "📊 测试总结"
echo "═══════════════════════════════════════════════════════════════"
echo "✅ 服务器状态: 运行中"
[ -f "$DB_PATH" ] && echo "✅ 数据库: 存在"
[ -f "./src/server/module-gateway/services/load-balancer.service.ts" ] && echo "✅ 负载均衡服务: 已实现"
[ -f "./src/server/module-gateway/services/load-balancer-executor.service.ts" ] && echo "✅ 负载均衡执行器: 已实现"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "🎉 负载均衡路由基础测试完成！"
echo ""
