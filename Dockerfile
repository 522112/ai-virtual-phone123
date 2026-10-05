# CloudBase 云托管构建用：Node 22，多阶段构建 + Next standalone 输出
FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV NEXT_PUBLIC_SELF_HOSTED_MODE=true
# 只拷贝 standalone 运行产物（含必需的最小 node_modules 与 server.js），镜像体积大幅减小
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]