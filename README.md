# Girls Rating Web

一个基于 React 的 Cosplay 图片展示应用，支持中英文切换，提供私密浏览体验。

## 功能特性

- **图片浏览** - 热门/最新分类，瀑布流展示
- **图片详情** - 全屏查看，左右切换，键盘导航
- **多语言支持** - 中文 / English
- **年龄验证** - 进入前的年龄确认门
- **动画效果** - 基于 Motion 的流畅过渡动画
- **响应式设计** - 适配移动端和桌面端

## 图片预览

### 首页预览

![首页预览](/doc/image/index.png)

### 图片详情

![图片详情](/doc/image/detail.png)

## 技术栈

- React 19
- TypeScript
- Vite 6
- Tailwind CSS v4
- Motion (Framer Motion fork)
- Lucide React Icons

## 快速开始

### 环境要求

- Node.js 18+
- npm

### 安装

```bash
npm install
```

### 开发

```bash
# 启动开发服务器
npm run dev

# TypeScript 检查
npm run lint
```

### 构建

```bash
# 生产构建
npm run build

# 预览构建结果
npm run preview
```

## 项目结构

```
girls-rating-web/
├── src/
│   ├── App.tsx          # 主应用组件
│   ├── main.tsx         # 入口文件
│   ├── index.css        # 全局样式
│   └── translations.ts  # 国际化翻译
├── index.html
├── package.json
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

## API 配置

开发模式下，Vite 已配置代理将 `/api` 请求转发到 `http://localhost:8080/api`。

### 后端接口

- `GET /api/cosplay?page=&pageSize=` - 获取图片列表（分页）
- `GET /api/random` - 获取随机图片
- `GET /images/:id` - 获取图片资源

## 许可证

MIT
