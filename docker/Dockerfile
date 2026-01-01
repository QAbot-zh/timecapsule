# ============ 构建阶段 ============
FROM node:20-alpine AS builder

WORKDIR /app

# 安装构建依赖（better-sqlite3 需要编译）
RUN apk add --no-cache python3 make g++

# 复制 package.json 并安装所有依赖
COPY package.json ./
RUN npm install

# 复制源代码并构建
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# 只保留生产依赖
RUN rm -rf node_modules && \
    npm install --omit=dev && \
    npm cache clean --force && \
    # 清理 better-sqlite3 不需要的文件
    rm -rf node_modules/better-sqlite3/build/Release/.deps \
           node_modules/better-sqlite3/build/Release/obj* \
           node_modules/better-sqlite3/prebuilds \
           node_modules/better-sqlite3/src \
           node_modules/better-sqlite3/deps \
           node_modules/better-sqlite3/*.md \
           node_modules/better-sqlite3/binding.gyp \
           node_modules/*/.github \
           node_modules/*/test \
           node_modules/*/tests \
           node_modules/*/*.md \
           node_modules/*/.travis.yml \
           node_modules/*/CHANGELOG* \
           node_modules/*/LICENSE* 2>/dev/null || true

# ============ 运行阶段 ============
FROM node:20-alpine AS runtime

WORKDIR /app

# 只安装运行时必需的库
RUN apk add --no-cache libstdc++

# 从构建阶段复制必要文件
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY schema.sql ./

# 创建数据目录并设置权限
RUN mkdir -p /app/data && \
    # 删除不必要的文件
    rm -rf /var/cache/apk/* /tmp/*

# 暴露端口
EXPOSE 21839

# 环境变量
ENV DATABASE_PATH=/app/data/capsules.db \
    PORT=21839 \
    NODE_ENV=production

# 启动服务
CMD ["node", "dist/index.js"]
