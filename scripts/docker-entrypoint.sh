#!/bin/sh

# 创建静态配置 JS 文件，将环境变量注入到前端
# 该文件将被 index.html 加载
cat <<EOF > /app/dist/env-config.js
window.env = {
  VITE_API_BASE_URL: "${VITE_API_BASE_URL}"
};
EOF

echo "注入环境变量 VITE_API_BASE_URL: ${VITE_API_BASE_URL}"

# 如果挂载了空的 config 目录，则恢复默认配置文件
if [ ! -f /app/config/vendors.yaml ]; then
  echo "检测到 /app/config/vendors.yaml 不存在，正在从默认配置恢复..."
  mkdir -p /app/config
  cp /app/config.dist/vendors.yaml /app/config/vendors.yaml
fi

# 确保 data 目录存在
mkdir -p /app/data

# 数据库表创建和迁移由 initDatabase() 在应用启动时自动处理
# 无需 drizzle-kit push，因为它需要 better-sqlite3 原生绑定

# 启动应用
# 注意：直接使用 node 而不是 npm start，因为 npm 会吞掉 SIGTERM 信号
# 导致优雅关闭无法正常工作
exec node dist-server/index.js
