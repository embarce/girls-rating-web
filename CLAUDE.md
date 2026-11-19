# CLAUDE.md

工作区指引。本文件描述的是**代码实际行为**，若与 README 冲突以本文件为准。

## 常用命令

```bash
npm run dev       # 开发服务器，固定 3000 端口，监听 0.0.0.0
npm run build     # 生产构建，输出 dist/
npm run preview   # 预览构建产物
npm run lint      # 仅 tsc --noEmit 类型检查（无 ESLint / Prettier / 测试）
npm run clean     # 删除 dist/
```

Docker 构建走 `Dockerfile`（多阶段）：

| 阶段 | 镜像 | 要点 |
| --- | --- | --- |
| builder | `node:24-alpine` | `pnpm@10.33.0`（与锁文件同代）、`--frozen-lockfile`、`--mount=type=cache` 缓存 pnpm store |
| runner | `nginx:stable-alpine` | 复制 `dist/` + `nginx.conf`，`HEALTHCHECK` 探针 `GET /healthz` |

- 构建期变量用 `--build-arg GEMINI_API_KEY=xxx` 注入，`.dockerignore` 已排除 `.env*`，不要再把 `.env` 拷进镜像。
- `Dockerfile` 用了 BuildKit 的 `--mount=type=cache`，旧构建器需 `DOCKER_BUILDKIT=1`。
- 改动依赖时**必须同时更新 `pnpm-lock.yaml`**（`pnpm install --lockfile-only`），否则 `--frozen-lockfile` 会失败；`package-lock.json` 同步更新以免两条安装路径分叉。

## 技术栈

React 19.3 · TypeScript 7 · Vite 8（Rolldown）· Tailwind CSS 4.3 · Motion 14 · lucide-react 1.x · canvas-confetti

- Tailwind v4 通过 `@tailwindcss/vite` 插件接入，**没有** `tailwind.config.js`，主题在 `src/index.css` 的 `@theme` 中定义。
- 动画统一用 `motion/react`（不是 `framer-motion` 包名）。
- 路径别名 `@/*` → 项目根目录，同时在 `vite.config.ts` 与 `tsconfig.json` 的 `paths` 中配置，两处需同步。
- 已安装 `@types/react` / `@types/react-dom`，`npm run lint` **会**校验 JSX 属性与图标导出（此前缺失时自定义组件传 `key` 会误报）。
- `src/vite-env.d.ts` 提供 `vite/client` 类型：TS 7 下 `import './index.css'` 这类副作用导入没有它会报 TS2882。
- **lucide-react 1.x 移除了品牌图标**（`Github`、`Twitter` 等），GitHub 标记改用 `App.tsx` 内的内联 `GitHubMark`。
- Vite 8 的 Rolldown 只接受**函数形式**的 `manualChunks`，对象形式会直接报 `manualChunks is not a function`；`vite.config.ts` 里已按 react / motion 拆分 chunk。
- `vite.config.ts` 用 `import.meta.dirname` 取代 `__dirname`（Vite 未来默认的 native config loader 不支持后者）。

## 结构

```
index.html            # 入口，承载全部 SEO meta / JSON-LD / GA / AdSense
src/main.tsx          # createRoot + StrictMode
src/App.tsx           # 单文件应用：全部组件与页面逻辑
src/translations.ts   # zh / en 两份文案对象，导出 Language 类型
src/index.css         # Tailwind 引入、设计 token、工具类、滚动条、动画
src/vite-env.d.ts     # vite/client 类型引用
nginx.conf            # 生产 nginx 站点配置（gzip / 缓存 / SPA 回退 / 安全头）
public/               # 静态资源；images/cosplay 下是本地示例图（页面实际走 API）
```

`App.tsx` 内部组件顺序：`AgeGate` → `AboutPage` → `QAModal` / `FunnyModal` / `SupportModal` / `PrivacyModal` / `TermsModal`（共用 `ModalShell` + `ModalHeader`）→ `Header` → `Masthead` → `SideRail`（`SideTool`）→ `GalleryCard` / `Gallery` / `GallerySkeleton` → `Lightbox` → `ImmersiveSlide` / `ImmersiveFeed` → `FavoritesPage` → `AuthorPage` → `renderCardImage` / `shareCardImage` → `GachaCardBack` / `GachaCard` / `GachaGrid` / `GachaCollection` / `GachaPlayOverlay` / `GachaPromoModal` / `GachaPage` → `App`。
新增弹窗请沿用此单文件模式，不要为此引入路由或状态库。

## 数据与 API

`vite.config.ts` 开发代理：`/api` → `API_PROXY_TARGET`，默认 `http://localhost:8080`（`changeOrigin: true`）。没有本地后端时用 `.env.local` 指向线上即可，**不要在配置里写死生产域名**。生产由 nginx/网关负责，前端不含后端代码。

```ts
const API_BASE_URL = '/api';

// 热门：每次请求返回随机一批，无分页
GET /api/random  → { code: 200, data: CosplayImage[] }
// 最新：分页（author_id 可选，作者专区按作者过滤）
GET /api/cosplay?page=1&pageSize=10&author_id=
                 → { code: 200, data: { list: CosplayImage[], totalPage: number, currPage: number } }
// 入口页背景不再单独取图：直接用年龄门后面已挂载的画廊做模糊（`/api/latest` 前端已不再调用）
// 抽卡（docs/gacha-design.md，匿名 X-Device-Id 请求头）
POST /api/gacha/draw        → { code: 200, data: { date, replayed, cards, stats } }  // 幂等补发，无 409
GET  /api/gacha/status      → { code: 200, data: { date, drawnToday, cards, probabilities, stats, pool } }
GET  /api/gacha/collection  → { code: 200, data: { list, total, page, pageSize, stats, catalog } }
```

统一约定：**只看 `code === 200`**，非 200 或抛错时清空列表并把页码重置为 0（不弹错误提示）。抽卡接口失败走页内错误态/静默，不破坏画廊。

```ts
interface CosplayImage {
  id: string;
  resourceUrl: string;   // 完整图片 URL，直接当 <img src> 用
  width: number;
  height: number;
  rating: number;
  views: string;         // 注意是字符串，如 "1.2k"
  rarity?: 'R' | 'SR' | 'SSR';  // 上传时定档；缺失按 R 兜底
  author: { id?: number; name: string; avatar: string };  // id 供作者专区跳转，缺失不可点
}

// 抽卡卡面 = 后端 PhotoResponse 形状
interface GachaCardData {
  resourceUrl: string;
  width: number;
  height: number;
  rating: number;
  views: string;
  rarity: 'R' | 'SR' | 'SSR';
  author: { id?: number; name: string; avatar: string };
  drawDate?: string;     // 仅卡册展开时携带
}
```

本地存储：`gr-likes`（收藏 url 列表，点赞状态唯一权威）、`gr-like-details`（收藏快照 map，收藏夹页渲染用）、`gr-device-id`（UUID 设备标识）、`gr-gacha-popup-last`（每日弹窗去重，存服务端 date）、`gr-gacha-cache`（断网兜底快照）。

## 关键状态与易踩的坑

- **选中态用 `resourceUrl` 而不是 `id`**：`selectedImageId` 存的是 `resourceUrl`，`handleNext/handlePrev`、`selectedImage` 的 `findIndex` 全部按 `resourceUrl` 匹配。若改成按 `id` 匹配，需整条链路一起改。
- **分类不是筛选器**：`CATEGORIES = ['hot','latest','qa','funny']` 中 `qa`、`funny` 只负责打开弹窗；只有 `hot`（random 接口）和 `latest`（分页接口）会触发请求。
- **`hot` 分类下没有分页**：`totalPage` 被强制设为 1，`Masthead` 的「换一批」与「加载更多」都只在对应分类出现。
- **`latest` 是「加载更多」追加模式**，不是翻页：`load(cat, page, append)` 第三参数决定 `setImages` 是替换还是追加；`page/totalPages` 用于判断 `canLoadMore`。改成替换式会让已加载内容消失。
- **瀑布流是 JS 分列**（`columnize`）：按「最短列优先」把图分进 N 个 flex 列，列的图片高度用 `height/width` 估算。该贪心算法**前缀稳定**，追加新图时已有图片不会跳列——换成 `index % columns` 之类的分配方式就会在加载更多时整体重排。
- **年龄门不持久化**：`isAged` 只存在内存，刷新即重新验证。`AgeGate` 内含三种形态：正文（桌面端右侧是 `EntranceTicket` 入场券——主券 + 竖向虚线撕口 + 票根，票根里放 `ageGate.meta` 三行与竖排条码；移动端把 `ageGate.meta` 压成一条信息带）、按 `Enter` 直接进入（`closed` 态下按 `Enter` 无效）、点「退出」后的 `closed` 空状态（只保留重新进入）。
- **入场券按「横版」设计**：右栏实测约 1.18:1（`lg:h-[clamp(23rem,58vh,32rem)]`，宽度由 `grid-cols-[1.1fr_0.9fr]` 决定），所以是左右分栏而不是上下堆叠；改成竖版比例要同时重排主券内部。条码是 `TICKET_BARS` 的 `flexGrow` 疏密，别写成固定像素。
- **入口页背景 = 模糊后的主页**：不另铺图墙，`AgeGateBackdrop`（`z-[99]`）对下面已经挂载好的画廊做 34px `backdrop-filter` + 左侧斜向渐隐、四角压深两层 scrim，可读但不可用。
- **进场是三拍编排**（改之前先读这段）：① `AgeGate` 点「进入」不直接调 `onAccept`，先置 `leaving` 让票根撕开、文案淡出，400ms 后才交接；② App 的 `gateVeil` 由 `in → opening → gone` 三态驱动遮罩，`opening` 时 `.gate-veil[data-open]` 把 `--gate-blur` 从 34px 过渡到 0（820ms ease-in-out，`@property` 注册才能插值），scrim 晚 140ms 再退；③ `<main>` 同时从 `scale-[1.03]` 回到 `scale-100`（1100ms）。所以入场总时长约 1.3s，抽卡弹窗延到 2600ms 才弹。
- **`backdrop-filter` 必须挂在带透明度/模糊过渡的那个元素本身**，不能挂子元素：父级 opacity < 1 会新建 backdrop root，模糊会在第一帧整个消失。同理不要给 `.gate-veil` 加进场 opacity 动画（会有一瞬间露出未模糊的画面）。
- **首屏内容已挂载，`AgeGate` 只是覆盖层**（见下方 SEO 一节），`entrance-bg` 那套固定网格图墙已废弃，不要再引入 `/api/latest` 专门给入口供图。
- **"让图片动起来"按钮是模拟的**：`Lightbox.handleMakeMove` 里是 `setTimeout 3000ms` + 撒花 + 5 秒后复位，没有真实 AI 调用。`GEMINI_API_KEY` 虽被 `vite.config.ts` 注入到 `process.env`，但 `src/` 中未被使用。

## i18n

所有面向用户的文案必须同时加到 `translations.ts` 的 `zh` 和 `en` 两份对象中，键名保持对称（`ageGate / header / categories / main / card / modal / qa / funny / support / privacy / terms / gacha / footer`）。

原先写死在组件里的中英文（`Exclusive Archive`、`Rating`/`Views`/`Tags`、`Like`/`Download`/`Share`、`没有更多图片了`）已全部收进 `translations.ts`，新增文案不要再写死在 JSX 里。

`t` 在各组件里的类型是 `any`，新增键不会得到编译期保护。

## 样式约定

视觉定位是**编辑式画廊（editorial gallery）**：照片是主角，界面退成「展签」。

- 深色主题唯一，无浅色模式。色值定义在 `index.css` 的 `@theme` 中，用 token 而不是 arbitrary value：
  `bg-canvas`(#0a0908 暖黑) / `bg-surface`(卡片底) / `text-bone`(主文字) / `text-dim`(次要) / `border-line`(发丝线) / `text-accent`(#FF2D55)。
- 字体：`font-display`（Instrument Serif，中文回退宋体）只用于品牌名、展区标题、作者名这类「标题性」文字；正文/标签一律 `font-sans`。
- `.label` 是全站统一的展签样式（10px / 字距 0.26em / 全大写），导航、按钮、元信息都用它，不要临时改字号字距。
- 圆角一律直角或极小圆角：图片框 `rounded-none` + `ring-1 ring-line`，按钮用直角描边。**不要**再引入 `rounded-xl`/`rounded-full` 的卡片。
- 常用工具类：`no-scrollbar`、`.skeleton`（加载占位 + shimmer）、`.reveal`、`.grain-overlay`（全站纸面颗粒）、`.label`。
- 移动端优先：`md:` 以上才出现侧向布局与胶片条；移动端靠滑动切图，不显示左右箭头。
- 动效统一用 `motion/react`，入场用 `whileInView` + `viewport={{ once: true }}`，曲线 `[0.22, 1, 0.36, 1]`。

## 弹窗与动效模式

```tsx
<AnimatePresence>
  {open && <XxxModal onClose={() => setOpen(false)} t={t} />}
</AnimatePresence>

// 普通弹窗一律用 ModalShell + ModalHeader（遮罩 onClick=onClose，内容 stopPropagation）
// 层级：SideRail z-40，Lightbox z-[60]，沉浸模式 z-[75]，AboutPage / 收藏夹 / 作者专区 z-[70]（Lightbox 之上靠 blocked 属性抑制下层 Esc），
// GachaPage z-[80]（把玩态 z-[95]），AgeGateBackdrop z-[99]，AgeGate z-[100]，普通弹窗 z-[110]，toast z-[120]
```

`Lightbox` 额外注册了全局 `keydown`：`ArrowLeft`/`ArrowRight` 切换（首尾循环）、`Escape` 先退出放大再关闭；打开时锁 `body` 滚动，并预加载相邻两张；移动端用 `drag="x"` 滑动切图（阈值 ±70px）。切换方向由 `App` 的 `direction` state 传入，`AnimatePresence` 的 variants 据此做左右滑入。

### 「关于」页 = 全屏覆盖层，不是路由

项目**没有路由**。`AboutPage` 是一个 `fixed inset-0 z-[70]` 的可滚动全屏层，`Header` 的「关于」和页脚的「关于」都只是把 `isAboutOpen` 置真——这样既拿到了「独立页面」的观感，又不用引入 react-router。新增同类页面沿用这个模式：全屏层 + 自带 sticky 顶栏 + 锁 `body` 滚动 + Esc 关闭。

内容全部来自 `translations.about`：`sections[]`（`no / title / body[] / points[]`）、`stats[]`、`links`。改文案只动 `translations.ts`，不要写进 JSX。它复用了 `t.qa.items`、`t.footer.*`、`t.support.contactEmail`，所以改那些键会同时影响弹窗和关于页。

`AboutPage` 的 Esc 处理器带 `blocked` 参数：当 Q&A / 条款等弹窗压在它上面时（`isQAOpen || isTermsOpen || ...`），不让 Esc 把底下这层也一起关掉。

导航有 5 项（热门 / 最新 / 关于 / Q&A / 有趣），`Q&A` 在 `< sm` 隐藏（`hidden sm:block`），窄屏仍可从关于页进入。

### 右侧留白与侧边工具栏

`SideRail` 是 `fixed` 定位，桌面端落在内容区右侧的留白里（`lg:right-2`，宽 44px）。页面容器用 `px-5 md:px-10 lg:px-16` 预留了 64px 右留白，**改这个 padding 就会让工具栏压住最后一列图片**——两者是绑定的。移动端工具栏降级为右下角竖排两个 40px 按钮。

`Lightbox` 桌面端靠 `lg:pr-[340px]` 给右侧展签栏（`aside`，绝对定位 `top-16 bottom-0`）留位，展签栏内含作品编号、作者、规格、操作、CTA、「接下来」列表与进度线。


## SEO / 统计

**核心前提：内容始终挂载。** 年龄门只是 `z-[100]` 的覆盖层，`Header / main / footer` 不再受 `isAged` 控制。这是爬虫（以及不执行 JS 的抓取器）能拿到图库 DOM 的关键——不要改回 `{isAged && ...}`。未通过时给容器加 `inert` + `aria-hidden`，并锁 `body` 滚动。覆盖层本身半透明，靠 `AgeGateBackdrop`（`z-[99]`，34px 高斯模糊 + scrim）把底下的画廊糊成一片，可读但不可用；模糊强度与 scrim 透明度调低到「能认出有内容」的程度就够了，别再继续调亮。

- **head**：`index.html` 是唯一配置处。`robots` 只有一条（`index, follow, max-image-preview:large, max-snippet:-1`），`googlebot` 单独一条；canonical / `og:url` 固定 `https://girls-rating.com/`。
- **JSON-LD**：单个 `@graph` 串起 WebSite / Organization / WebPage / ImageGallery。`App.tsx` 里原来那段重复的 `ImageGallery` 已删除，**不要再往组件里塞第二段**。
- **lang**：`index.html` 写死 `zh-CN`（默认界面语言是中文），切换语言时 `App` 用 effect 改 `document.documentElement.lang`。
- **标题层级**：全站只有 1 个 `h1`（`sr-only` 区块里的「品牌 — 展区」）；`Masthead` 的可见大标题是 `h2`，年龄门标题也是 `h2`。
- **图片**：`alt` 为「{作者} 的 cosplay 作品 — Girls Rating」；前 6 张 `loading="eager"`、前 3 张 `fetchPriority="high"`，其余 lazy + `decoding="async"`。改瀑布流时注意 `index` 是全局序号（来自 `indexMap`），不是列内序号。
- **无 JS 回退**：`index.html` 里的 `<noscript>` 是一张有内容的落地页（介绍 + 联系邮箱 + 子站链接），不是空壳。
- **robots.txt**：只有 `Allow: /`、`Disallow: /api/`、`Googlebot-Image` 放开、`Sitemap`。**不要再加 `Host:`（仅 Yandex 识别）和 `Crawl-delay`（会拖慢 Bing）。**
- **sitemap.xml**：只列 `/`。站点没有前端路由，`?category=hot` 会被忽略并渲染同一首页，属于重复内容，不要提交；`lastmod` 手动维护，发版时更新。`sitemap-0.xml` 是别的项目遗留的假站点地图（全是 `/tts`、`/faceswap` 这类不存在的路径），已删除。
- **静态资源**：`og-image.jpg`（1200×630）、`apple-touch-icon.png`、`favicon-32x32.png`、`favicon-16x16.png` 都由 `public/images/logo.png` 派生。换 logo 后要重新生成：图标用 `sips -z`，OG 图用无头 Chrome 截图一张 1200×630 的 HTML 卡片。
- **nginx**：未知路径返回 404（`try_files $uri $uri/ =404`），不再 SPA 回退，避免软 404。以后接入客户端路由再改回 ` /index.html`。
- **统计**：GA4 `G-RB52NX2T7F`、AdSense `ca-pub-5878954173858501`，均在 `index.html`。

**已知上限**：没有逐图 URL，图片 SEO 只能覆盖首页这一层。要突破必须上 SSR / 构建期预渲染，或给每张图生成独立可索引页面——这需要后端配合（图片 id → 独立 URL）。

## 已声明但未使用的依赖

`@google/genai`、`express`、`dotenv`、`clsx`、`tailwind-merge`、`tsx`、`autoprefixer` 在 `package.json` 中但 `src/` 无引用（Tailwind v4 用 Lightning CSS，不需要 autoprefixer；`tsx` 属旧 express 服务残留）。清理前先确认无计划接入，避免误删将来要用的包。

## 修改时的一般原则

1. 文案改动 → 双语同步。
2. 接口或字段改动 → 同步 `CosplayImage` 类型与 `load()` 的两条分支。
3. 交互改动 → 检查 `Lightbox` 的键盘快捷键、滑动切图与首尾循环是否仍成立。
4. 不加路由、不加全局状态库、不拆文件，除非用户明确要求重构。
5. 升级依赖后依次跑 `npm run lint`、`npm run build`，并确认 `pnpm-lock.yaml` 与 `package-lock.json` 都已更新。
