# 使用 Node.js 22 作为基础镜像
FROM node:22-slim AS base

# 安装基础依赖
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 构建阶段
FROM base AS builder

COPY package*.json ./
# 禁用 husky 以避免在 Docker 环境中构建失败
RUN npm install --ignore-scripts

COPY . .
RUN npm run build

# 清理开发依赖
RUN npm prune --omit=dev --ignore-scripts

# 运行阶段
FROM base AS runner

WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 从构建阶段复制 node_modules (已完成 prune)
COPY --from=builder /app/node_modules ./node_modules
# 复制 package.json
COPY package*.json ./
# 复制构建产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/config ./config

# 复制入口脚本
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
RUN chmod +x ./scripts/docker-entrypoint.sh

# 创建数据目录
RUN mkdir -p data

# 暴露端口
EXPOSE 3000

# 启动命令
ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
