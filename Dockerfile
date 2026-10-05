# CloudBase 云托管构建用：Node 20，多阶段构建
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV NEXT_PUBLIC_SELF_HOSTED_MODE=true
COPY --from=builder /app ./
# 云托管会注入 PORT 环境变量，启动脚本优先读取 PORT
EXPOSE 3000
CMD ["npm", "start"]