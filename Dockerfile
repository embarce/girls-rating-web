# ==============================
# 第一阶段：构建 React / Vite 应用
# ==============================
FROM node:22-alpine AS builder

# 启用 corepack 并使用 pnpm 11（版本可控）
RUN corepack enable && corepack prepare pnpm@11.2.2 --activate

WORKDIR /app

# ✅ 先拷贝 rc 文件（非常关键）
COPY .npmrc package.json pnpm-lock.yaml* ./

# 安装依赖（不会报 ERR_PNPM_IGNORED_BUILDS）
RUN pnpm install --frozen-lockfile

# 拷贝源码
COPY . .

# 构建生产版本
RUN pnpm build

# ==============================
# 第二阶段：运行环境
# ==============================
FROM nginx:alpine

# 从构建阶段复制静态资源
COPY --from=builder /app/dist /usr/share/nginx/html

# 暴露端口
EXPOSE 80

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]
