#!/bin/sh

# 创建静态配置 JS 文件，将环境变量注入到前端
# 该文件将被 index.html 加载
cat <<EOF > /app/dist/env-config.js
window.env = {
  VITE_API_BASE_URL: "${VITE_API_BASE_URL}"
};
EOF

echo "注入环境变量 VITE_API_BASE_URL: ${VITE_API_BASE_URL}"

# 启动应用
exec npm start
