# CloudBase 云托管构建用：Node 22，多阶段构建
FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV NEXT_PUBLIC_SELF_HOSTED_MODE=true
COPY --from=builder /app ./
# 云托管容器端口固定为 3000；显式绑定 0.0.0.0:3000，避免探针 connection refused。
# 堆内存限制调小，避免小规格实例启动时内存分配失败。
EXPOSE 3000
CMD ["node", "--max-old-space-size=1024", "scripts/local-next-server.mjs", "--prod", "--host", "0.0.0.0", "--port", "3000"]