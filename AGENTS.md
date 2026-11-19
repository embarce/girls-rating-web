# AGENTS.md

**详细版指引见 `CLAUDE.md`**（描述代码实际行为，与 README 冲突时以 CLAUDE.md 为准）。本文件是快速摘要。

## 项目定位

Cosplay 图片展示站「编辑式画廊」：瀑布流展墙 + 沉浸式观展视图，中英双语，含年龄门。站点域名 `https://girls-rating.com`。

## 常用命令

```bash
npm run dev       # 开发服务器，固定 3000 端口，监听 0.0.0.0
npm run build     # 生产构建 → dist/
npm run lint      # 仅 tsc --noEmit 类型检查（无 ESLint / Prettier / 测试）
npm run clean     # 删除 dist/
node scripts/mock-server.mjs  # 本地 mock 后端（监听 8080，覆盖画廊/抽卡/反馈接口，图片走 public/images）
```

- 依赖改动必须同时更新 `pnpm-lock.yaml`（`pnpm install --lockfile-only`），否则 Docker `--frozen-lockfile` 失败；`package-lock.json` 也同步更新，两条安装路径不能分叉。
- Docker：Node 24 alpine 构建 → nginx 托管，`--build-arg GEMINI_API_KEY=xxx` 与 `--build-arg TURNSTILE_SITE_KEY=xxx`（Turnstile 人机验证，注册/登录/邮件反馈）注入，勿把 `.env` 拷进镜像；BuildKit `--mount=type=cache` 需 `DOCKER_BUILDKIT=1`。

## 技术栈与硬约束

React 19.3 · TypeScript 7 · Vite 8（Rolldown）· Tailwind CSS v4（无 `tailwind.config.js`，主题在 `src/index.css` 的 `@theme`）· Motion 14 · lucide-react 1.x

- **无路由、无全局状态库、单文件应用**：`src/App.tsx`（约 2800 行）包含全部组件。新增弹窗/页面沿用此模式，不要拆文件或引入 react-router / redux，除非用户明确要求重构。
- 「关于」页 = `fixed inset-0` 全屏覆盖层（z-[70]），不是路由。
- 动画统一 `motion/react`（不是 `framer-motion` 包名）；入场用 `whileInView` + `viewport={{ once: true }}`。
- lucide-react 1.x 无品牌图标（`Github` 等），GitHub 标记是 App.tsx 内的内联 SVG。
- Vite 8 Rolldown 只接受**函数形式** `manualChunks`；alias `@/*` → 项目根，在 `vite.config.ts` 和 `tsconfig.json` 两处需同步。
- `src/vite-env.d.ts` 提供 `vite/client` 类型，缺了 CSS 副作用导入会报 TS2882。

## 数据与 API

开发代理 `/api` → `http://localhost:8080`。画廊接口：`GET /api/random`（热门，无分页）、`GET /api/cosplay?page=&pageSize=`（最新，分页）；抽卡接口：`POST /api/gacha/draw`（幂等补发）、`GET /api/gacha/status`、`GET /api/gacha/collection`（均需 `X-Device-Id` 请求头，设计见 `docs/gacha-design.md`）。统一约定：**只看 `code === 200`**，非 200 或抛错时清空列表、页码归 0、不弹提示。

- 选中态 `selectedImageId` 存的是 **`resourceUrl`** 不是 `id`，`findIndex` / 前后切换全按它匹配。
- `latest` 是「加载更多」**追加模式**（`load(cat, page, append)`），不是翻页替换。
- 瀑布流 `columnize` 是「最短列优先」贪心分列，**前缀稳定**——换成 `index % columns` 会在追加时整体重排。
- `CATEGORIES` 中 `qa` / `funny` 只打开弹窗不请求；`hot` 无分页（`totalPage` 强制 1）。

## i18n

所有用户文案进 `src/translations.ts` 的 `zh` / `en` 两份对象（键对称），**不要写死在 JSX 里**。`t` 类型是 `any`，无编译期保护。`translations.about` 复用了 `t.qa` / `t.footer` / `t.support` 的键，改那些键会影响关于页。

## 样式约定（编辑式画廊）

- 深色主题唯一，无浅色模式。用 token 不用 arbitrary value：`bg-canvas` / `bg-surface` / `text-bone` / `text-dim` / `border-line` / `text-accent`(#FF2D55)。
- `font-display`（Instrument Serif）只用于标题性文字；正文一律 `font-sans`。
- `.label` 是统一展签样式（10px / 0.26em / 全大写），不要临时改字号字距。
- 圆角一律直角或极小圆角 + `ring-1 ring-line`，**不要**引入 `rounded-xl` / `rounded-full` 卡片。
- 常用工具类：`.no-scrollbar`、`.skeleton`、`.reveal`、`.grain-overlay`。
- 层级：SideRail z-40 → Lightbox z-[60] → AboutPage/收藏夹/作者专区 z-[70] → 沉浸模式 z-[75] → GachaPage z-[80]（把玩态 z-[95]）→ 年龄门模糊背景 z-[99] → AgeGate z-[100] → 普通弹窗 z-[110] → toast z-[120]。
- 普通弹窗一律 `ModalShell` + `ModalHeader`；`SideRail` 的 `lg:right-2` 与页面容器右留白 `lg:px-16` 绑定，改 padding 会让工具栏压住图片。

## SEO / 其他

- `index.html` 含 SEO meta、JSON-LD、GA4、AdSense；页面内有 `sr-only` SEO 文本区块，勿删。
- 「让图片动起来」按钮是模拟动效（setTimeout + 撒花），无真实 AI 调用；`GEMINI_API_KEY` 虽注入但 `src/` 未使用。
- `@google/genai`、`express`、`dotenv`、`clsx`、`tailwind-merge`、`tsx`、`autoprefixer` 已声明但未使用，清理前确认。
