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

# 启动应用
exec npm start
