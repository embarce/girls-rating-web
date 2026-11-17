# 抽卡（Gacha）功能设计文档

> 状态：待评审 · 2026-11-17
> 关联文件：`src/App.tsx`、`src/translations.ts`、`src/index.css`
> 数据来源：`GET /api/random`（已确认后端实现：每次固定返回 100 条，`rating` 为整数，库内 decimal(10,1) 默认 4.0）

## 1. 目标

在现有编辑式画廊中新增「抽卡」玩法：消耗一次机会抽取一张照片，以**3D 闪卡（holo card）**形态揭示——卡背翻转、稀有度光效、全息箔片随指针倾斜流动。复用站内既有技术栈（motion / canvas-confetti），不引入路由与状态库，视觉上保持「展签」调性。

## 2. 稀有度与概率规则

### 2.1 三档稀有度

| 稀有度 | 概率 | 视觉 | 语义 |
| --- | --- | --- | --- |
| **R** | 70% | 灰白光晕，无 foil | 普通卡 |
| **SR** | 24% | 白炽光 + 扫光（无彩虹） | 优质卡 |
| **SSR** | 6% | **全息闪卡**：彩虹 foil + 撒花 + 屏幕闪光 | 闪卡 |

**稀有度 → 图片的映射：批次内相对排名**（关键决策）。

后端每次返回 100 条，进入抽卡页时拉一批，按 `rating` 降序排列后切池：

- Top 6 条 → SSR 池
- 第 7–30 条 → SR 池
- 其余 70 条 → R 池

抽卡时先按权重掷出稀有度，再从对应池均匀随机取一张。这样**「高分图必为高稀有度」**的直觉成立，且不依赖 rating 的绝对分布（库里默认 4.0、实际分布未知，绝对阈值方案在分布偏斜时会失效）。

### 2.2 保底（pity）

| 规则 | 内容 |
| --- | --- |
| SR 保底 | 连续 9 抽未出 SR/SSR，第 10 抽必从 SR∪SSR 池抽取 |
| SSR 保底 | 累计 30 抽未出 SSR，第 30 抽必出 SSR（触发后计数归零） |
| 十连补正 | 十连逐张掷点；若前 9 张无 SR+，第 10 张强制 SR+（与 SR 保底共用计数） |

计数在**掷点成功时**立即更新并持久化，与前端动画进度解耦。

### 2.3 卡池管理

- 进入抽卡页拉一批（100 条）入内存池；**池 < 12 张时**后台再拉一批合并。
- 抽中的卡从池中**移除**——同一会话内不会抽到重复卡（后端是 Redis Set 抽样，批内本就不重复）。
- 跨会话（刷新）池重置，允许重复。不做抽卡历史记录（留作二期）。

## 3. 交互流程

### 3.1 入口

`Header` 导航新增「抽卡」项（第 6 项，移动端可见、不设 `hidden`）。点击打开**全屏覆盖层 `GachaPage`**，完全沿用 AboutPage 模式：`fixed inset-0`、自带顶栏、锁 body 滚动、Esc 关闭、不走路由。

- z-index：`GachaPage z-[80]`（AboutPage z-[70] 之上、AgeGate z-[100] 之下）。
- 关闭抽卡页时若正处把玩态，先退把玩态再退页面。

### 3.2 单抽序列（SSR 为例）

```
舞台待机(卡堆悬浮) → 点「单抽」
  → 卡堆散开，一张卡背飞入舞台中央（约 600ms）
  → 稀有度光晕在卡背后方脉冲 2 次（颜色即预告稀有度）
  → 闪光 + 翻面（rotateY 0→180，spring）
  → SSR：shine 扫光 + canvas-confetti 撒花 + grain 闪光
  → 进入「把玩态」：指针驱动 3D 倾斜 + 全息箔片流动
```

R/SR 省略撒花；SR 有一次白炽扫光。翻面后底部出展签行（作者 / RATING / 稀有度）与操作按钮。

### 3.3 十连

10 张卡以网格排布，逐张快速翻面（stagger 80ms）；SSR 卡翻面时带 mini 闪光。点击任意卡进入单卡把玩态（大图居中），Esc / 返回键回网格。底部汇总「本次成果：SSR×1 · SR×3 · R×6」。

### 3.4 把玩态（闪卡核心交互）

指针在卡面移动 → 卡体倾斜（`rotateX/rotateY` ±12°，spring 平滑），foil 层随倾斜角变透明度与色相偏移，glare 高光跟随指针。移动端：`pointermove` 对触摸同样生效；无指针输入时播放缓慢的呼吸摆动（idle sway）兜底。卡上操作：**收藏**（复用 `liked` / `gr-likes` 逻辑）、**下载**（复用 Lightbox 的下载实现）、**再抽一张**。

## 4. 闪卡 3D 实现方案

### 4.1 技术选型

| 方案 | 依赖 | 说明 |
| --- | --- | --- |
| **A. motion + 纯 CSS（推荐）** | 零新增 | tilt/翻面用 `motion/react` 的 `useMotionValue` + `useSpring`；foil/glare 用 CSS 渐变 + `mix-blend-mode`。完全可控，与既有动效曲线统一 |
| B. `react-parallax-tilt` | +12KB | 自带 tilt + glare，但 foil 层仍要手写，且与翻面动画叠 transform 需嵌套，收益有限 |

结论：**方案 A**。撒花复用已装 `canvas-confetti`。用户允许引第三方库，若实现中发现 motion 方案细节成本过高，可随时切方案 B（接口面不变）。

### 4.2 卡片层叠（`transform-style: preserve-3d`）

```
.perspective 容器 (perspective: 1000px)
└─ 卡体（motion.div，rotateX/rotateY 由指针 spring 驱动）
   ├─ 正面（backface-hidden）
   │  ├─ 图片层           translateZ(0)
   │  ├─ foil 层          translateZ(24px)  ← 彩虹条纹 + 闪点，color-dodge
   │  ├─ glare 层         translateZ(40px)  ← radial 白高光跟随指针
   │  └─ 展签层（作者/评分）translateZ(12px)
   └─ 卡背（backface-hidden, rotateY 180°）
      暖黑底 + border-line 发丝框 + 竖排 .label 品牌字 + repeating-linear-gradient 细纹
```

三层视差（0 / 24 / 40px）在倾斜时产生纵深，即「立体效果」的来源。

### 4.3 foil 层配方（SSR）

```css
background:
  repeating-linear-gradient(115deg,
    #ff2d5566 0 8%, #e8c36a66 8% 16%, #7cd4fd66 16% 24%,
    #b786fb66 24% 32%, #ff2d5566 32% 40%),
  conic-gradient(from 45deg, transparent 0 70%, #ffffffaa 85%, transparent 100%);
mix-blend-mode: color-dodge;
opacity: var(--foil-opacity);   /* 0.25–0.7，随倾斜角速度变化 */
```

- 彩虹只出现在 foil 层——作为「材质」而非「页面颜色」，不破坏暖黑 + 单 accent 的编辑调性。
- SR 复用同配方但 `opacity` 封顶 0.15 且去掉彩虹条纹（仅白炽渐变）；R 无 foil，只有 glare。

### 4.4 动效参数

| 项 | 值 |
| --- | --- |
| 缓动曲线 | `[0.22, 1, 0.36, 1]`（全站约定） |
| 翻面 spring | `stiffness 260 / damping 24` |
| tilt spring | `stiffness 150 / damping 18` |
| shine 扫光 | 900ms，linear-gradient 白条 `translateX(-150% → 150%)` |
| 光晕脉冲 | 2 次 × 700ms，`scale 0.94→1.06` + opacity |
| confetti | SSR 翻面时一次，colors `['#FF2D55', '#E8C36A', '#FFFFFF']` |

### 4.5 新增颜色 token

`--color-gold: #E8C36A`（加进 `index.css` 的 `@theme`），仅用于 SR/SSR 光效与 confetti 粒子，不用于文字/按钮。稀有度色彩不使用游戏惯例的蓝/紫，避免污染编辑风调色板：**R=灰、SR=白、SSR=accent 红 + 全息彩虹**。

## 5. 代码组织（遵循仓库既有约束）

**不拆文件、不加路由/状态库**，全部加进 `src/App.tsx`：

- 组件声明顺序：`Lightbox` 之后新增 `GachaCard` → `GachaGrid`（十连）→ `GachaPage`；`App` 增加 `isGachaOpen` state 并传 `liked / onToggleLike` 进 `GachaPage`。
- `translations.ts` 新增顶层键 `gacha`（zh / en 对称）：导航标签、单抽/十连按钮、稀有度名（R/SR/SSR + 描述）、保底进度、汇总文案、错误文案等。`t` 在现有组件中类型为 `any`，无编译期保护，需人工保证两份同步。
- `index.css` 追加 gacha 相关工具类与 keyframes（`holo-foil`、`shine-sweep`、`aura-pulse`、`idle-sway`），色值走 `@theme` token。

## 6. 持久化（localStorage）

| 键 | 结构 | 说明 |
| --- | --- | --- |
| `gr-gacha-pity` | `{ total: number; sinceSR: number; sinceSSR: number }` | 与 `gr-likes` 同风格前缀；抽卡页顶栏展示「距 SR 保底 n 抽 / 距 SSR 保底 n 抽」 |
| （复用）`gr-likes` | `string[]`（resourceUrl） | 抽到的卡可一键收藏，与画廊收藏互通 |

## 7. 边界情况

| 场景 | 处理 |
| --- | --- |
| `/api/random` 非 200 / 网络错误 | 与主画廊「静默清空」约定不同——抽卡页需要明确反馈：按钮禁用 + 页内文案「暂无卡牌，点击重试」（gacha 键内新增） |
| 返回条数 < 100（甚至为空） | 相对排名按实际条数等比缩放（Top 6% / 24%），空池显示空态 |
| 图片加载失败 | 卡面显示 `.skeleton` 占位，允许「跳过动画」 |
| 首批图片未加载完就开抽 | 先抽到的卡进入把玩态时用 `<img onLoad>` 门控，未加载完显示 shimmer |
| 移动端 | 侧栏/导航降级已有约定；tilt 靠 touch pointermove，idle sway 兜底；十连网格单列 |
| 性能 | 非把玩态的十连小卡 foil 用静态低透明度；`will-change: transform` 只挂在正在动画的卡上 |

## 8. 验收清单

- [ ] `npm run lint`、`npm run build` 通过
- [ ] 单抽 / 十连全流程动画完整；SSR 出现 foil + 撒花；R/SR 无撒花
- [ ] 保底触发正确（临时把权重调成 0 自测第 10 抽 / 第 30 抽）
- [ ] 概率正确：脚本模拟 1000 次掷点，分布 ≈ 6% / 24% / 70%（±3%）
- [ ] Esc / 顶栏关闭正常；AgeGate > GachaPage > AboutPage 层级正确；body 滚动锁正常
- [ ] zh / en 文案同步；收藏与画廊互通
- [ ] 移动端可完成一次完整十连
