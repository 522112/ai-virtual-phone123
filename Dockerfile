# CloudBase 云托管构建用：Node 20，多阶段构建
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
COPY --from=builder /app ./
# 云托管会注入 PORT 环境变量，启动脚本优先读取 PORT
EXPOSE 3000
CMD ["bash", "-lc", "echo '[diag] NODE_ENV=$NODE_ENV HOST=$HOST PORT=$PORT'; echo '[diag] cwd=$(pwd)'; ls -la .next/BUILD_ID >/dev/null 2>&1 && echo '[diag] .next present' || echo '[diag] .next MISSING'; node scripts/local-next-server.mjs --prod --port ${PORT:-3000} --host 0.0.0.0"]
