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
RUN npm install

COPY . .
RUN npm run build

# 运行阶段
FROM base AS runner

WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 复制 package.json 用于安装运行时依赖
COPY package*.json ./
# 只安装生产环境依赖，且包含 native modules 的构建
RUN npm install --omit=dev

# 复制构建产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/config ./config

# 创建数据目录
RUN mkdir -p data

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["npm", "start"]
