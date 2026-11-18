# syntax=docker/dockerfile:1

# ============================== 构建阶段 ==============================
# Node 24 LTS：Vite 8 要求 node ^20.19 || >=22.12
FROM node:24-alpine AS builder

# 锁文件由 pnpm 10 生成，容器内固定同一大版本，避免 lockfile 解析差异
ARG PNPM_VERSION=10.33.0
RUN npm install -g pnpm@${PNPM_VERSION} && npm cache clean --force

WORKDIR /app

# 只先拷依赖清单：改业务代码不会让依赖层缓存失效
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

# 构建期变量走 build-arg 注入，不把本地 .env 带进镜像
ARG GEMINI_API_KEY=""
ENV GEMINI_API_KEY=${GEMINI_API_KEY}
# Cloudflare Turnstile 站点 key（注册/登录/邮件反馈的人机验证），VITE_ 前缀使其进入客户端 bundle
ARG TURNSTILE_SITE_KEY=""
ENV VITE_TURNSTILE_SITE_KEY=${TURNSTILE_SITE_KEY}

RUN pnpm build

# ============================== 运行阶段 ==============================
FROM nginx:stable-alpine AS runner

# 去掉默认站点，换成带 gzip / 强缓存 / 健康检查的配置
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/app.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
