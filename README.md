# Girls Rating Web

一个以「编辑式画廊」为定位的 Cosplay 图片展示站点：瀑布流展墙 + 沉浸式观展视图，支持中英文切换、收藏与键盘/手势浏览。

## 功能特性

- **展墙浏览** - 热门 / 最新两个展区，JS 分列瀑布流（追加式加载，不重排）
- **观展视图** - 全屏沉浸浏览，键盘 ←/→ 切换、移动端滑动切图、点击缩放拖拽、胶片条跳转
- **作品操作** - 原图下载、系统分享 / 复制链接、收藏（本地持久化）
- **多语言支持** - 中文 / English，文案全部走 `translations.ts`
- **年龄验证** - 进入前的年龄确认门
- **响应式设计** - 移动端 2 列、桌面端 3–5 列自适应

## 技术栈

- React 19.3
- TypeScript 7
- Vite 8（Rolldown）
- Tailwind CSS v4.3
- Motion 14
- Lucide React 1.x

## 快速开始

### 环境要求

- Node.js ≥ 22.12（推荐 24 LTS，Vite 8 要求 `^20.19 || >=22.12`）
- pnpm 10（仓库提交了 `pnpm-lock.yaml`，Docker 构建按它安装）

### 安装

```bash
pnpm install        # 或 npm install
```

### 开发

```bash
pnpm dev            # 开发服务器，固定 3000 端口，监听 0.0.0.0
pnpm lint           # TypeScript 类型检查（tsc --noEmit）
```

### 构建

```bash
pnpm build          # 产物在 dist/
pnpm preview        # 本地预览构建结果
```

## 部署

仓库内置多阶段 `Dockerfile`：Node 24 构建 → nginx 静态托管。

```bash
docker build -t girls-rating-web .
docker run --rm -p 80:80 girls-rating-web
```

- 构建期变量通过 `--build-arg` 注入，例如 `--build-arg GEMINI_API_KEY=xxx`，不要把 `.env` 打进镜像。
- `nginx.conf` 负责 gzip、带哈希资源的一年强缓存、`index.html` 不缓存、SPA 回退与安全响应头。
- 容器自带 `HEALTHCHECK`，探针地址 `GET /healthz`。
- `Dockerfile` 使用了 BuildKit 的 `--mount=type=cache`，若使用旧版构建器需开启 `DOCKER_BUILDKIT=1`。

## 项目结构

```
girls-rating-web/
├── src/
│   ├── App.tsx           # 单文件应用：全部组件与页面逻辑
│   ├── main.tsx          # 入口文件
│   ├── index.css         # Tailwind 引入、设计 token、工具类
│   ├── translations.ts   # zh / en 两份文案
│   └── vite-env.d.ts     # vite/client 类型（CSS 副作用导入需要）
├── public/               # 静态资源
├── index.html            # SEO meta / JSON-LD / GA / AdSense
├── nginx.conf            # 生产 nginx 站点配置
├── Dockerfile
├── tsconfig.json
├── vite.config.ts
└── .env.example
```

## 环境变量

复制 `.env.example` 为 `.env` 并配置：

```bash
GEMINI_API_KEY=your_gemini_api_key
APP_URL=your_app_url
```

> 目前 `src/` 并未真正调用 Gemini，「让图片动起来」是本地模拟的动效。

## API 配置

开发模式下，Vite 会把 `/api` 代理到 `http://localhost:8080`。

没有本地后端时，可以在 `.env.local` 里临时指向线上（不必改代码）：

```bash
API_PROXY_TARGET=https://www.girls-rating.com
```

### 后端接口

- `GET /api/cosplay?page=&pageSize=` - 获取图片列表（分页）
- `GET /api/random` - 获取随机图片
- `GET /images/:id` - 获取图片资源

## 截图

新版画廊界面截图待补充。旧版界面截图见 `doc/image/`（`index.png`、`detail.png` 为改版前效果）。

## 许可证

MIT
