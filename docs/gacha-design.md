# 抽卡（Gacha）功能设计文档

> 状态：待评审 · v0.2（2026-11-17，按拍板决策修订：每日一抽 10 张 / 无保底 / 稀有度上传时定档 / 卡册页 / 每日弹窗）
> 后端设计：`girls-rating-api/docs/design/gacha-system.md`（接口、表结构、抽样算法以后端文档为准）
> 关联文件：`src/App.tsx`、`src/translations.ts`、`src/index.css`

## 1. 目标

在编辑式画廊中新增「每日抽卡」玩法：**每台设备每天抽一次，一次出 10 张卡**，卡牌是图库真实图片，SSR 以 3D 闪卡形态呈现（卡背翻转、全息箔片随指针流动）。抽到的卡进入**卡册**持久收藏。纯娱乐，无保底、无货币。

## 2. 玩法规则（拍板）

| 规则 | 内容 |
| --- | --- |
| 次数 | **每天 1 次 × 固定 10 张**，按服务端日期（`Asia/Shanghai`）判定，前端不自算 |
| 稀有度 | **上传时定档**（后端）：上传时显式指定或按 rating 推导（≥9 SSR、≥7 SR、其余 R） |
| 概率 | 服务端固定权重抽样：R 70% / SR 24% / SSR 6%，经 `/api/gacha/status` 公示 |
| 保底 | **无**（已拍板砍掉） |
| 补发 | 当天已抽时，draw 接口幂等补发当日结果（`replayed: true`），前端跳过抽取动画直接进展示态 |
| 重复 | 单次 10 张内不重复；跨天允许抽到重复图（卡册里标「已拥有 ×n」可选） |

## 3. 后端 API 对接

新增三个公开接口（无需登录，请求头带 `X-Device-Id`，详见后端设计文档 §五）：

```
POST /api/gacha/draw        抽卡（幂等补发）
GET  /api/gacha/status      今日状态 + 公示概率 + 累计统计
GET  /api/gacha/collection  卡册分页
```

- **deviceId**：`crypto.randomUUID()` 生成，localStorage 键 `gr-device-id` 持久化；缺失时接口 400。
- 开发代理沿用 `vite.config.ts` 的 `/api` → `http://localhost:8080`，无需改动。

## 4. 交互流程

### 4.1 入口

首页（热门 tab）**Masthead 操作区**新增「今日一抽」按钮作为主入口（顶部在显眼位，文案区分已抽/未抽两态：未抽「今日一抽」、已抽「查看今日卡牌」）。**每日弹窗**作为补充触达（见 4.2）。不在 Header 导航加项。

### 4.2 每日弹窗

- 触发条件（全部满足）：AgeGate 已通过 → `status.drawnToday === false` → localStorage `gr-gacha-popup-last` ≠ 服务端今日 `date`。
- 形态：轻量提示卡，复用现有弹窗模式（`ModalShell` 遮罩 + stopPropagation），z-[110]。
- 内容：`t.gacha.popup` 文案（「今日卡牌已备好」）+ 两按钮「去抽一发」/「今天不了」；点去抽 → 打开抽卡页并自动开抽。
- 点击任意按钮写入 `gr-gacha-popup-last = date`，**每天最多出现一次**；`status` 请求失败则不弹（静默）。

### 4.3 抽卡页 `GachaPage`

全屏覆盖层，沿用 AboutPage 模式：`fixed inset-0`、自带顶栏、锁 body 滚动、Esc 关闭、不走路由，`z-[80]`（AboutPage z-[70] 之上、AgeGate z-[100] 之下）。顶栏两个视图切换：

- **舞台（默认）**：卡堆悬浮待机。状态机：
  1. 进入时调 `GET /status` → 未抽：按钮「今日一抽」；已抽：直接展示今日 10 张（补发快照）。
  2. 点击开抽 → `POST /draw` → 卡堆散开，10 张卡背飞入排布 → 逐张翻面（stagger 80ms）。
  3. 翻面节奏：R 直接翻；SR 翻面 + 白炽扫光；SSR 翻面前光晕脉冲（accent 红）+ 翻面后 shine 扫光 + `canvas-confetti` 撒花。`replayed=true` 时全部按已翻面态渲染，无动画。
  4. 结果网格（2 列移动 / 5 列桌面）+ 汇总行「SSR×1 · SR×3 · R×6」+ 已抽态文案「明天再来」。
- **卡册**：`GET /collection` 分页加载，稀有度筛选（全部/SSR/SR/R）+ 统计条（累计 n 张 · SSR n · SR n · R n）。点任意卡进入单卡把玩态。

### 4.4 把玩态（闪卡核心交互）

网格/结果中的卡点击后进入单卡大图态：指针驱动 3D 倾斜 + foil 流动（见 §5），底部展签行（作者 / RATING / 稀有度）与操作按钮：**收藏**（复用 `liked` / `gr-likes`）、**下载**（复用 Lightbox 下载实现）、**关闭**。移动端 pointermove 对触摸生效；无指针输入时播放缓慢 idle sway 兜底。Esc 先退把玩态，再退抽卡页。

## 5. 闪卡 3D 实现方案

### 5.1 技术选型

| 方案 | 依赖 | 说明 |
| --- | --- | --- |
| **A. motion + 纯 CSS（推荐）** | 零新增 | tilt/翻面用 `motion/react` 的 `useMotionValue` + `useSpring`；foil/glare 用 CSS 渐变 + `mix-blend-mode`。与既有动效曲线统一，完全可控 |
| B. `react-parallax-tilt` | +12KB | 自带 tilt + glare，但 foil 层仍要手写、与翻面动画叠 transform 需嵌套 |

已确认可引入第三方依赖：仍选 **A**（现有依赖 motion + canvas-confetti 已覆盖全部动效需求，引库反而多一层 transform 嵌套）；若实现中tilt手感调不出来，切方案 B，接口面不变。

### 5.2 卡片层叠（`transform-style: preserve-3d`）

```
.perspective 容器 (perspective: 1000px)
└─ 卡体（motion.div，rotateX/rotateY 由指针 spring 驱动，±12°）
   ├─ 正面（backface-hidden）
   │  ├─ 图片层           translateZ(0)
   │  ├─ foil 层          translateZ(24px)  ← 仅 SSR/SR，color-dodge
   │  ├─ glare 层         translateZ(40px)  ← radial 白高光跟随指针
   │  └─ 展签层（作者/评分）translateZ(12px)
   └─ 卡背（backface-hidden, rotateY 180°）
      暖黑底 + border-line 发丝框 + 竖排 .label 品牌字 + repeating-linear-gradient 细纹
```

三层视差（0 / 24 / 40px）产生纵深，即立体感来源。foil 强度分档：SSR 彩虹全开（opacity 0.25–0.7 随倾斜变化）、SR 仅白炽渐变（≤0.15）、R 无 foil 只有 glare。

### 5.3 foil 层配方（SSR）

```css
background:
  repeating-linear-gradient(115deg,
    #ff2d5566 0 8%, #e8c36a66 8% 16%, #7cd4fd66 16% 24%,
    #b786fb66 24% 32%, #ff2d5566 32% 40%),
  conic-gradient(from 45deg, transparent 0 70%, #ffffffaa 85%, transparent 100%);
mix-blend-mode: color-dodge;
opacity: var(--foil-opacity);
```

彩虹只出现在 foil 层——作为「材质」而非「页面颜色」，不破坏暖黑 + 单 accent 的编辑调性。稀有度色彩沿用站内体系：**R=灰（text-dim）、SR=白（bone）、SSR=accent 红 + 全息彩虹**，不用游戏惯例的蓝/紫。

### 5.4 动效参数

| 项 | 值 |
| --- | --- |
| 缓动曲线 | `[0.22, 1, 0.36, 1]`（全站约定） |
| 翻面 spring | `stiffness 260 / damping 24` |
| tilt spring | `stiffness 150 / damping 18` |
| shine 扫光 | 900ms，白条 `translateX(-150% → 150%)` |
| 光晕脉冲（SSR 翻面前） | 2 次 × 700ms，`scale 0.94→1.06` + opacity |
| confetti | SSR 翻面时一次，colors `['#FF2D55', '#E8C36A', '#FFFFFF']` |
| 十张 stagger | 80ms |

新增颜色 token：`--color-gold: #E8C36A`（加进 `index.css` 的 `@theme`），仅用于光效与 confetti 粒子。

## 6. 代码组织（遵循仓库既有约束）

**不拆文件、不加路由/状态库**，全部加进 `src/App.tsx`：

- 组件声明顺序：`Lightbox` 之后新增 `GachaCard` → `GachaGrid` → `GachaCollection` → `GachaPage`；`App` 增加 `isGachaOpen` state 与每日弹窗 `isGachaPromoOpen`，`liked / onToggleLike` 透传进 `GachaPage`。
- `translations.ts` 新增顶层键 `gacha`（zh / en 对称）：入口按钮两态、弹窗文案、按钮（单抽位→今日一抽）、稀有度名与描述、汇总/统计、卡册筛选、把玩态操作、错误文案等。
- `index.css` 追加 gacha 工具类与 keyframes（`holo-foil`、`shine-sweep`、`aura-pulse`、`idle-sway`），色值走 `@theme` token。

## 7. 本地存储

| 键 | 内容 | 说明 |
| --- | --- | --- |
| `gr-device-id` | UUID | 设备标识，抽卡/卡册接口共用 |
| `gr-gacha-popup-last` | 服务端 `date` 字符串 | 每日弹窗去重 |
| `gr-gacha-cache` | 最近一次 draw 响应快照 | 仅作断网/接口失败兜底展示，不参与每日判定（判定以后端为准） |
| （复用）`gr-likes` | `string[]`（resourceUrl） | 抽到的卡一键收藏，与画廊互通 |

## 8. 边界情况

| 场景 | 处理 |
| --- | --- |
| 接口非 200 / 网络错误 | 舞台按钮禁用 + 页内文案「暂无卡牌，点击重试」；status 失败则不弹每日弹窗（静默） |
| 已抽后刷新/重进 | status → `drawnToday=true` + 当日卡牌，直接展示态（服务端补发为准，本地 cache 仅兜底） |
| 图片加载失败/慢 | 卡面 `.skeleton` shimmer + `<img onLoad>` 门控，翻面动画等加载完再播（SSR 尤其不能翻出空卡） |
| 跨天临界 | 一切「今天」以服务端 `date` 字段为准，前端不本地判定 |
| 池空 / 图库 <10 张 | 后端降级兜底（见后端文档 §七）；前端只需处理正常与错误两态 |
| 移动端 | 弹窗/网格单列或 2 列；tilt 靠 touch pointermove；idle sway 兜底 |
| 性能 | 结果网格小卡 foil 用静态低透明度；`will-change: transform` 只挂在动画中的卡上 |

## 9. 验收清单

- [ ] `npm run lint`、`npm run build` 通过
- [ ] 首抽全流程动画完整：SSR 光晕 + 彩虹 foil + 撒花；R/SR 无撒花；`replayed=true` 直接展示态
- [ ] 每日弹窗：每日一次、未抽才弹、AgeGate 之后出现、两按钮行为正确
- [ ] 卡册分页、筛选、统计正确；把玩态 tilt + foil 手感正常；收藏与画廊互通
- [ ] Esc / 顶栏关闭正常；AgeGate > GachaPage > AboutPage 层级正确；body 滚动锁正常
- [ ] zh / en 文案同步
- [ ] 移动端可完成一次完整抽卡并翻阅卡册
