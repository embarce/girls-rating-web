import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  X,
  Heart,
  Download,
  Share2,
  Eye,
  Lock,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  ShieldCheck,
  HelpCircle,
  Mail,
  Plus,
  RefreshCw,
  Sparkles,
  ArrowUp,
  ArrowUpRight,
  ZoomIn,
  ZoomOut,
  Layers,
  Maximize2
} from 'lucide-react';
import { motion, AnimatePresence, useScroll, useSpring, useMotionValue } from 'motion/react';
import confetti from 'canvas-confetti';
import { translations, Language } from './translations';

// --- Types ---
interface CosplayImage {
  id: string;
  resourceUrl: string;
  width: number;
  height: number;
  rating: number;
  views: string;
  rarity?: GachaRarity; // photo 改造后返回；旧缓存可能缺失，按 R 兜底
  author: {
    id?: number; // authors.id，作者专区跳转用；旧数据缺失时不可点
    name: string;
    avatar: string;
  };
}

const API_BASE_URL = '/api';
const PAGE_SIZE = 10;

// --- Gacha types & helpers（每日抽卡，详见 docs/gacha-design.md） ---

type GachaRarity = 'R' | 'SR' | 'SSR';

interface GachaCardData {
  resourceUrl: string;
  width: number;
  height: number;
  rating: number;
  views: string;
  rarity: GachaRarity;
  author: { id?: number; name: string; avatar: string };
  drawDate?: string;
}

/** 收藏快照：点赞时随 url 一起写入 gr-like-details，收藏夹页据此渲染 */
interface LikeSnapshot {
  width: number;
  height: number;
  rating: number;
  views: string;
  rarity?: GachaRarity;
  author: { id?: number; name: string; avatar: string };
}

interface LikeDetail extends LikeSnapshot {
  url: string;
  likedAt: number;
}

interface GachaStats {
  totalDays: number;
  totalCards: number;
  ssr: number;
  sr: number;
  r: number;
}

interface GachaStatusResult {
  date: string;
  drawnToday: boolean;
  cards: GachaCardData[] | null;
  probabilities: Record<string, number>;
  stats: GachaStats;
  pool?: Record<string, number>;
}

/** 图鉴完成度：卡册内按 resourceUrl 去重的各档张数（后端 collection.catalog） */
interface GachaCatalog {
  total: number;
  ssr: number;
  sr: number;
  r: number;
}

const DEVICE_ID_KEY = 'gr-device-id';
const GACHA_POPUP_KEY = 'gr-gacha-popup-last';
const GACHA_CACHE_KEY = 'gr-gacha-cache';
const LIKE_DETAILS_KEY = 'gr-like-details';

/** 匿名设备标识：crypto.randomUUID() 生成，localStorage 持久化 */
const getDeviceId = () => {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
};

/** 抽卡接口统一走 /api/gacha/*，只认 code === 200 */
const gachaFetch = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}/gacha/${path}`, {
    ...init,
    headers: { 'X-Device-Id': getDeviceId(), ...(init?.headers ?? {}) },
  });
  const result = await response.json();
  if (result.code !== 200) throw new Error(result.msg || 'gacha request failed');
  return result.data as T;
};

/** 客户端按快照统计稀有度分布 */
const summarizeCards = (cards: GachaCardData[]): GachaStats => ({
  totalDays: 0,
  totalCards: cards.length,
  ssr: cards.filter(c => c.rarity === 'SSR').length,
  sr: cards.filter(c => c.rarity === 'SR').length,
  r: cards.filter(c => c.rarity === 'R').length,
});

/** 画廊照片 → 卡面数据（卡片预览 / 分享卡面共用；rarity 缺失按 R 兜底） */
const toGachaCardData = (img: CosplayImage): GachaCardData => ({
  resourceUrl: img.resourceUrl,
  width: img.width,
  height: img.height,
  rating: img.rating,
  views: img.views,
  rarity: img.rarity ?? 'R',
  author: img.author,
});

/** 下载原图：fetch → blob → a[download]，CORS 失败兜底开新窗口 */
const downloadImage = async (url: string, filename: string) => {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('download failed');
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
};

// --- Cloudflare Turnstile（人机验证，保护 注册/登录/邮件反馈） ---

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
let turnstileLoader: Promise<boolean> | null = null;

/** 按需加载 Turnstile 脚本（仅在需要渲染 widget 时注入，站点 key 未注入时直接返回 false） */
const loadTurnstile = (): Promise<boolean> => {
  if (!TURNSTILE_SITE_KEY) return Promise.resolve(false);
  if (window.turnstile) return Promise.resolve(true);
  turnstileLoader ??= new Promise<boolean>(resolve => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve(Boolean(window.turnstile));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return turnstileLoader;
};

const CATEGORIES = ['hot', 'latest', 'qa', 'funny'] as const;
type Category = typeof CATEGORIES[number];

const LOGO_URL = '/images/logo.png';

const FUNNY_LINKS = {
  zh: [
    { name: "Luck", url: "https://luck.girls-rating.com", desc: "测试你的运气" },
    { name: "Cat", url: "https://cat.girls-rating.com", desc: "猫咪天堂" },
    { name: "Worth Job", url: "https://worthjob.girls-rating.com", desc: "找到值得的工作" }
  ],
  en: [
    { name: "Luck", url: "https://luck.girls-rating.com", desc: "Test your luck" },
    { name: "Cat", url: "https://cat.girls-rating.com", desc: "Cat paradise" },
    { name: "Worth Job", url: "https://worthjob.girls-rating.com", desc: "Find a worthy job" }
  ]
};

// --- Helpers ---

const pad = (i: number) => String(i + 1).padStart(2, '0');

const ratioOf = (image: CosplayImage) =>
  image.width && image.height ? image.height / image.width : 1.4;

/** 把图片按最短列优先分配，得到平衡的瀑布流（无需 DOM 测量） */
const columnize = (items: CosplayImage[], count: number) => {
  const cols: CosplayImage[][] = Array.from({ length: count }, () => []);
  const heights = new Array(count).fill(0);
  items.forEach(item => {
    let target = 0;
    for (let i = 1; i < count; i += 1) if (heights[i] < heights[target]) target = i;
    cols[target].push(item);
    heights[target] += Math.min(Math.max(ratioOf(item), 0.5), 2.4) + 0.14;
  });
  return cols;
};

const useColumnCount = () => {
  const [count, setCount] = useState(4);
  useEffect(() => {
    const calc = () => {
      const w = window.innerWidth;
      setCount(w < 560 ? 2 : w < 900 ? 3 : w < 1360 ? 4 : 5);
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);
  return count;
};

// --- Shared UI ---

const Eyebrow = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <p className={`label text-dim ${className}`}>{children}</p>
);

/** lucide-react 1.x 不再提供品牌图标，GitHub 标记用内联 SVG */
const GitHubMark = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
    <path d="M12 .5C5.73.5.5 5.73.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.55v-1.93c-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.18-1.49 3.14-1.18 3.14-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.26 5.69.41.36.78 1.06.78 2.14v3.17c0 .3.2.66.8.55A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
  </svg>
);

const IconButton = ({
  onClick,
  label,
  active,
  children
}: {
  onClick?: () => void;
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    aria-label={label}
    title={label}
    className={`grid h-9 w-9 place-items-center border transition-colors ${
      active
        ? 'border-accent/60 bg-accent/10 text-accent'
        : 'border-line text-dim hover:border-bone/30 hover:text-bone'
    }`}
  >
    {children}
  </button>
);

const ModalShell = ({
  onClose,
  children,
  size = 'md'
}: {
  onClose: () => void;
  children: React.ReactNode;
  size?: 'md' | 'lg';
}) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    onClick={onClose}
    className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md md:p-6"
  >
    <motion.div
      initial={{ y: 18, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 8, opacity: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      onClick={e => e.stopPropagation()}
      className={`no-scrollbar max-h-[86vh] w-full overflow-y-auto border border-line bg-surface ${
        size === 'lg' ? 'max-w-2xl' : 'max-w-lg'
      }`}
    >
      {children}
    </motion.div>
  </motion.div>
);

const ModalHeader = ({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose: () => void }) => (
  <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5 md:px-8">
    <div>
      {subtitle && <p className="label mb-2 text-dim">{subtitle}</p>}
      <h2 className="font-display text-2xl leading-none md:text-3xl">{title}</h2>
    </div>
    <button
      onClick={onClose}
      aria-label="Close"
      className="grid h-8 w-8 shrink-0 place-items-center border border-line text-dim transition-colors hover:border-accent hover:text-accent"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  </div>
);

const ModalFooterButton = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className="w-full border border-line py-3.5 label text-dim transition-colors hover:border-bone/40 hover:text-bone"
  >
    {children}
  </button>
);

// --- Age Gate ---

const AgeGate = ({ onAccept, t }: { onAccept: () => void; t: any }) => {
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') onAccept();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onAccept]);

  if (closed) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-canvas px-6 text-center"
      >
        <Lock className="h-5 w-5 text-dim/30" strokeWidth={1.25} />
        <p className="mt-6 label text-dim/60">{t.ageGate.closed}</p>
        <p className="mt-3 font-display text-3xl leading-tight">{t.ageGate.closedHint}</p>
        <button
          onClick={() => setClosed(false)}
          className="mt-9 border border-line px-8 py-3.5 label text-dim transition-colors hover:border-bone/30 hover:text-bone"
        >
          {t.ageGate.reenter}
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] overflow-y-auto bg-canvas"
    >
      <div className="mx-auto flex min-h-full w-full max-w-[1680px] flex-col px-6 py-7 md:px-10 md:py-9 lg:px-16">
        {/* 顶部：品牌 + 年份 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={LOGO_URL}
              alt="Girls Rating"
              className="h-8 w-8 rounded-full object-cover ring-1 ring-line"
              referrerPolicy="no-referrer"
            />
            <span className="label text-dim">{t.header.logo}</span>
          </div>
          <Eyebrow className="text-dim/50">EST. 2026</Eyebrow>
        </div>

        {/* 主体 */}
        <div className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20 lg:py-6">
          <div className="max-w-xl">
            <Eyebrow className="text-accent/80">{t.ageGate.kicker}</Eyebrow>

            <h2 className="mt-5 font-display text-[clamp(2.8rem,7.5vw,5.75rem)] leading-[0.88] tracking-tight">
              {t.ageGate.title}
            </h2>

            <p className="mt-5 max-w-md text-sm leading-relaxed text-dim">{t.ageGate.subtitle}</p>

            <div className="mt-9 flex items-start gap-4 border-t border-line pt-6">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-accent/40 label text-accent">
                18+
              </span>
              <p className="max-w-md text-xs leading-relaxed text-dim">{t.ageGate.warning}</p>
            </div>

            <div className="mt-9 flex flex-wrap items-center gap-x-2 gap-y-4">
              <button
                onClick={onAccept}
                className="group flex items-center justify-center gap-3 bg-bone px-10 py-4 label text-canvas transition-colors hover:bg-white"
              >
                {t.ageGate.enter}
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </button>
              <button
                onClick={() => setClosed(true)}
                className="px-6 py-4 label text-dim transition-colors hover:text-bone"
              >
                {t.ageGate.exit}
              </button>
              <span className="hidden label text-dim/30 sm:ml-6 sm:block">{t.ageGate.hint}</span>
            </div>

            {/* 移动端：把展签里的元信息压成一条，避免整页太空 */}
            <div className="mt-12 grid grid-cols-3 divide-x divide-line/60 border-y border-line/50 lg:hidden">
              {t.ageGate.meta.map((item: { k: string; v: string }, i: number) => (
                <div key={item.k} className={i === 0 ? 'py-4 pr-4' : i === 1 ? 'px-4 py-4' : 'py-4 pl-4'}>
                  <p className="label text-dim/40">{item.k}</p>
                  <p className="mt-1.5 label text-bone/70 tabular-nums">{item.v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 右侧展签海报 */}
          <div className="relative hidden aspect-[4/5] max-h-[62vh] w-full overflow-hidden border border-line lg:block">
            <div className="absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_2%,#1c1714_0%,#0a0908_58%)]" />

            {/* 光圈 */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 120, repeat: Infinity, ease: 'linear' }}
              className="absolute left-1/2 top-[42%] h-[66%] w-[66%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-bone/[0.14]"
            />
            <div className="absolute left-1/2 top-[42%] h-[52%] w-[52%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-bone/[0.09]" />
            <div className="absolute left-1/2 top-[42%] h-[37%] w-[37%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-bone/[0.06]" />

            <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 text-center">
              <p className="font-display text-[4.5rem] leading-none tracking-tight">
                18<span className="text-accent">+</span>
              </p>
              <p className="mt-3 label text-dim/50">{t.ageGate.poster.mark}</p>
            </div>

            <p className="absolute right-5 top-6 label text-dim/40 [writing-mode:vertical-rl]">
              {t.ageGate.poster.vertical}
            </p>

            {/* 底部元数据 */}
            <div className="absolute inset-x-0 bottom-0 divide-y divide-line/50 border-t border-line/60 bg-canvas/40">
              {t.ageGate.meta.map((item: { k: string; v: string }) => (
                <div key={item.k} className="flex items-center justify-between px-5 py-3">
                  <span className="label text-dim/40">{item.k}</span>
                  <span className="label text-bone/70 tabular-nums">{item.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-line/50 py-4">
          <Eyebrow className="text-dim/40">{t.ageGate.footer}</Eyebrow>
          <Eyebrow className="text-dim/25">GIRLSRATING.COM</Eyebrow>
        </div>
      </div>
    </motion.div>
  );
};

// --- About page ---

const AboutPage = ({
  onClose,
  onOpenQA,
  onOpenTerms,
  onOpenPrivacy,
  onOpenSupport,
  blocked,
  t
}: {
  onClose: () => void;
  onOpenQA: () => void;
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
  onOpenSupport: () => void;
  blocked: boolean;
  t: any;
}) => {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      // 上面还压着 Q&A / 条款等弹窗时不抢 Esc
      if (e.key === 'Escape' && !blocked) onClose();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, blocked]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-[70] overflow-y-auto overscroll-contain bg-canvas"
    >
      <div className="grain-overlay" aria-hidden />

      {/* 顶栏 */}
      <div className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line/70 bg-canvas/90 px-5 backdrop-blur-xl md:px-10 lg:px-16">
        <button
          onClick={onClose}
          className="group flex items-center gap-2.5 label text-dim transition-colors hover:text-bone"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          {t.about.back}
        </button>
        <span className="label text-dim/40">{t.header.logo}</span>
        <button
          onClick={onClose}
          aria-label={t.modal.close}
          className="grid h-8 w-8 place-items-center border border-line text-dim transition-colors hover:border-accent hover:text-accent"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mx-auto max-w-[1240px] px-5 md:px-10 lg:px-16">
        {/* 封面 */}
        <section className="border-b border-line/70 py-14 md:py-20">
          <Eyebrow className="text-accent/80">{t.about.kicker}</Eyebrow>
          <div className="mt-6 grid gap-8 md:grid-cols-[1.15fr_0.85fr] md:items-end md:gap-16">
            <h1 className="font-display text-[clamp(2.4rem,6.5vw,5rem)] leading-[0.9] tracking-tight">
              {t.about.title}
            </h1>
            <p className="text-[13px] leading-[1.85] text-dim md:text-sm">{t.about.lead}</p>
          </div>
        </section>

        {/* 章节 */}
        {t.about.sections.map((section: any) => (
          <section
            key={section.no}
            className="grid gap-6 border-b border-line/70 py-12 md:grid-cols-[200px_1fr] md:gap-14 md:py-16"
          >
            <div className="md:sticky md:top-24 md:self-start">
              <span className="font-display text-xl text-dim/45 tabular-nums">{section.no}</span>
              <h2 className="mt-2 font-display text-2xl leading-tight md:text-[28px]">{section.title}</h2>
            </div>

            <div className="max-w-2xl">
              <div className="space-y-4">
                {section.body.map((paragraph: string, i: number) => (
                  <p key={i} className="text-[13px] leading-[1.85] text-dim md:text-sm">
                    {paragraph}
                  </p>
                ))}
              </div>

              {section.points && (
                <ul className="mt-7 divide-y divide-line/60 border-y border-line/60">
                  {section.points.map((point: string, i: number) => (
                    <li key={i} className="flex items-baseline gap-4 py-3">
                      <span className="label text-accent/50 tabular-nums">{pad(i)}</span>
                      <span className="text-[13px] text-bone/75">{point}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ))}

        {/* 数字 */}
        <section className="grid grid-cols-2 gap-px border-b border-line/70 bg-line/50 md:grid-cols-4">
          {t.about.stats.map((stat: { v: string; k: string }) => (
            <div key={stat.k} className="bg-canvas py-8 pr-4 md:py-10">
              <p className="font-display text-3xl leading-none md:text-4xl">{stat.v}</p>
              <p className="mt-3 label text-dim/40">{stat.k}</p>
            </div>
          ))}
        </section>

        {/* 相关入口 */}
        <section className="grid gap-px border-b border-line/70 bg-line/50 md:grid-cols-3">
          <button
            onClick={onOpenQA}
            className="group bg-canvas p-6 text-left transition-colors hover:bg-surface md:p-8"
          >
            <HelpCircle className="h-4 w-4 text-dim/50 transition-colors group-hover:text-accent" strokeWidth={1.5} />
            <p className="mt-8 font-display text-xl">{t.about.links.qa}</p>
            <p className="mt-2 text-xs leading-relaxed text-dim">{t.about.links.qaDesc}</p>
            <span className="mt-6 flex items-center gap-2 label text-dim/40 transition-colors group-hover:text-bone">
              {t.card.view}
              <ArrowUpRight className="h-3 w-3" />
            </span>
          </button>

          <a
            href="https://github.com/embarce/girls-rating-web"
            target="_blank"
            rel="noopener noreferrer"
            className="group bg-canvas p-6 text-left transition-colors hover:bg-surface md:p-8"
          >
            <GitHubMark className="h-4 w-4 text-dim/50 transition-colors group-hover:text-bone" />
            <p className="mt-8 font-display text-xl">{t.about.links.repo}</p>
            <p className="mt-2 text-xs leading-relaxed text-dim">{t.about.links.repoDesc}</p>
            <span className="mt-6 flex items-center gap-2 label text-dim/40 transition-colors group-hover:text-bone">
              GitHub
              <ArrowUpRight className="h-3 w-3" />
            </span>
          </a>

          <button
            onClick={onOpenSupport}
            className="group bg-canvas p-6 text-left transition-colors hover:bg-surface md:p-8"
          >
            <Mail className="h-4 w-4 text-dim/50 transition-colors group-hover:text-accent" strokeWidth={1.5} />
            <p className="mt-8 font-display text-xl">{t.about.links.contact}</p>
            <p className="mt-2 text-xs leading-relaxed text-dim">{t.about.links.contactDesc}</p>
            <span className="mt-6 flex items-center gap-2 label break-all text-dim/40 transition-colors group-hover:text-bone">
              {t.support.contactEmail}
            </span>
          </button>
        </section>

        {/* 页脚 */}
        <div className="flex flex-col gap-4 py-8 md:flex-row md:items-center md:justify-between">
          <p className="label text-dim/35">{t.about.footer}</p>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <button onClick={onOpenTerms} className="label text-dim/50 transition-colors hover:text-bone">
              {t.footer.terms}
            </button>
            <button onClick={onOpenPrivacy} className="label text-dim/50 transition-colors hover:text-bone">
              {t.footer.privacy}
            </button>
            <button onClick={onOpenSupport} className="label text-dim/50 transition-colors hover:text-bone">
              {t.footer.support}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// --- Modals ---

const QAModal = ({ onClose, t }: { onClose: () => void; t: any }) => (
  <ModalShell onClose={onClose} size="lg">
    <ModalHeader title={t.qa.title} subtitle={t.qa.subtitle} onClose={onClose} />
    <div className="divide-y divide-line/70 px-6 md:px-8">
      {t.qa.items.map((item: { q: string; a: string }, i: number) => (
        <div key={i} className="flex gap-5 py-6">
          <span className="label pt-1 text-accent/70 tabular-nums">{pad(i)}</span>
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-medium text-bone">{item.q}</p>
            <p className="text-[13px] leading-relaxed text-dim">{item.a}</p>
          </div>
        </div>
      ))}
    </div>
    <div className="px-6 pb-6 md:px-8">
      <ModalFooterButton onClick={onClose}>{t.qa.close}</ModalFooterButton>
    </div>
  </ModalShell>
);

const FunnyModal = ({ onClose, lang, t }: { onClose: () => void; lang: Language; t: any }) => (
  <ModalShell onClose={onClose}>
    <ModalHeader title={t.funny.title} subtitle={t.funny.subtitle} onClose={onClose} />
    <div className="divide-y divide-line/70 px-6 md:px-8">
      {FUNNY_LINKS[lang].map((link, i) => (
        <a
          key={link.url}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-4 py-5"
        >
          <span className="label text-dim/60 tabular-nums">{pad(i)}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-bone transition-colors group-hover:text-accent">{link.name}</p>
            <p className="mt-0.5 text-[13px] text-dim">{link.desc}</p>
          </div>
          <ArrowUpRight className="h-4 w-4 text-dim/50 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
        </a>
      ))}
    </div>
    <div className="px-6 pb-6 md:px-8">
      <ModalFooterButton onClick={onClose}>{t.funny.close}</ModalFooterButton>
    </div>
  </ModalShell>
);

/** Cloudflare Turnstile 人机验证组件（暗色主题；站点 key 未注入时渲染为空） */
const TurnstileWidget = ({ onToken }: { onToken: (token: string) => void }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    loadTurnstile().then(ok => {
      if (!ok || cancelled || !containerRef.current || widgetRef.current || !window.turnstile) return;
      widgetRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'dark',
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken('')
      });
    });
    return () => {
      cancelled = true;
      if (widgetRef.current && window.turnstile) {
        window.turnstile.remove(widgetRef.current);
        widgetRef.current = '';
      }
    };
  }, [onToken]);

  return <div ref={containerRef} />;
};

const SupportModal = ({
  onClose,
  notify,
  t
}: {
  onClose: () => void;
  notify: (msg: string) => void;
  t: any;
}) => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState('');
  const [sending, setSending] = useState(false);
  const [widgetEpoch, setWidgetEpoch] = useState(0);
  const handleToken = useCallback((tk: string) => setToken(tk), []);

  // 站点 key 未注入（本地/未启用）时不要求 token，交由服务端开关决定
  const turnstileOn = Boolean(TURNSTILE_SITE_KEY);
  const canSubmit = Boolean(email) && Boolean(message.trim()) && (!turnstileOn || Boolean(token)) && !sending;

  const handleSend = async () => {
    if (!canSubmit || sending) return;
    setSending(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/mail/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-Turnstile-Token': token } : {})
        },
        body: JSON.stringify({ email, name: '', message })
      });
      const result = await response.json();
      if (result.code !== 200) throw new Error(result.msg || 'send failed');
      notify(t.support.sent);
      setEmail('');
      setMessage('');
      setToken('');
      // token 一次性，重挂 widget 换取新 token
      setWidgetEpoch(e => e + 1);
    } catch {
      notify(t.support.sendFail);
    } finally {
      setSending(false);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title={t.support.title} subtitle={t.support.subtitle} onClose={onClose} />
      <div className="space-y-6 px-6 py-6 md:px-8">
        <p className="text-[13px] leading-relaxed text-dim">{t.support.description}</p>
        <div className="border border-line p-5">
          <Eyebrow>Email</Eyebrow>
          <a
            href={t.support.emailFormat}
            className="mt-2 block break-all font-display text-xl text-bone transition-colors hover:text-accent"
          >
            {t.support.contactEmail}
          </a>
        </div>

        {/* 反馈表单：经 Turnstile 人机验证后由 Resend 中继到支持邮箱 */}
        <div className="space-y-4 border border-line p-5">
          <Eyebrow>{t.support.formTitle}</Eyebrow>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder={t.support.formEmailLabel}
            maxLength={200}
            className="w-full border border-line bg-canvas px-4 py-3 text-[13px] text-bone placeholder:text-dim/50 focus:border-bone/40 focus:outline-none"
          />
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={t.support.formMessageLabel}
            rows={4}
            maxLength={5000}
            className="w-full resize-none border border-line bg-canvas px-4 py-3 text-[13px] leading-relaxed text-bone placeholder:text-dim/50 focus:border-bone/40 focus:outline-none"
          />
          {turnstileOn && <TurnstileWidget key={widgetEpoch} onToken={handleToken} />}
          <button
            onClick={handleSend}
            disabled={!canSubmit}
            className="flex w-full items-center justify-center gap-3 bg-accent px-6 py-3.5 label text-white transition-colors hover:bg-[#e6294d] disabled:opacity-50"
          >
            <Mail className="h-3.5 w-3.5" />
            {sending ? t.support.sending : t.support.formSend}
          </button>
          <p className="label text-dim/40">
            {t.support.sendEmail}：
            <a href={t.support.emailFormat} className="break-all transition-colors hover:text-bone">
              {t.support.contactEmail}
            </a>
          </p>
        </div>
      </div>
      <div className="px-6 pb-6 md:px-8">
        <ModalFooterButton onClick={onClose}>{t.support.close}</ModalFooterButton>
      </div>
    </ModalShell>
  );
};

const PrivacyModal = ({ onClose, t }: { onClose: () => void; t: any }) => (
  <ModalShell onClose={onClose}>
    <ModalHeader title={t.privacy.title} subtitle={t.privacy.subtitle} onClose={onClose} />
    <div className="space-y-6 px-6 py-6 md:px-8">
      <div className="flex items-start gap-4 border border-line bg-canvas/60 p-5">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400/80" strokeWidth={1.5} />
        <p className="text-[13px] leading-relaxed text-bone/80">{t.privacy.statement}</p>
      </div>
      <div className="divide-y divide-line/70">
        {t.privacy.details.map((item: string, i: number) => (
          <div key={i} className="flex items-baseline gap-4 py-3">
            <span className="label text-dim/50 tabular-nums">{pad(i)}</span>
            <p className="text-[13px] text-dim">
              {item.replace(/^•\s*/, '')}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs italic text-dim/70">{t.privacy.commitment}</p>
    </div>
    <div className="px-6 pb-6 md:px-8">
      <ModalFooterButton onClick={onClose}>{t.privacy.close}</ModalFooterButton>
    </div>
  </ModalShell>
);

const TermsModal = ({ onClose, t }: { onClose: () => void; t: any }) => (
  <ModalShell onClose={onClose} size="lg">
    <ModalHeader title={t.terms.title} subtitle={t.terms.lastUpdated} onClose={onClose} />
    <div className="divide-y divide-line/70 px-6 md:px-8">
      {t.terms.sections.map((section: { heading: string; content: string }, i: number) => (
        <div key={i} className="space-y-2 py-5">
          <h3 className="label text-accent/90">{section.heading}</h3>
          <p className="text-[13px] leading-relaxed text-dim">{section.content}</p>
        </div>
      ))}
    </div>
    <div className="px-6 py-6 md:px-8">
      <ModalFooterButton onClick={onClose}>{t.terms.close}</ModalFooterButton>
    </div>
  </ModalShell>
);

// --- Header ---

const Header = ({
  activeCategory,
  onCategoryChange,
  onOpenQA,
  onOpenFunny,
  onOpenAbout,
  onOpenImmersive,
  onOpenFavorites,
  lang,
  onLangChange,
  t
}: any) => {
  const [hidden, setHidden] = useState(false);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 240, damping: 40, restDelta: 0.001 });

  useEffect(() => {
    let last = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        setHidden(y > 160 && y > last + 6);
        last = y;
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.header
      animate={{ y: hidden ? '-101%' : '0%' }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="sticky top-0 z-50 border-b border-line/70 bg-canvas/85 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 max-w-[1680px] items-center justify-between gap-6 px-5 md:px-10 lg:px-16">
        <div className="flex items-center gap-7 md:gap-10">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex shrink-0 items-center gap-3"
            aria-label={t.header.logo}
          >
            <img
              src={LOGO_URL}
              alt=""
              className="h-7 w-7 rounded-full object-cover ring-1 ring-line"
              referrerPolicy="no-referrer"
            />
            <span className="hidden font-display text-[21px] leading-none tracking-tight sm:block">
              {t.header.logo}
            </span>
          </button>

          <nav className="flex items-center gap-5 md:gap-8">
            {[
              { key: 'hot', label: t.categories.hot, onClick: () => onCategoryChange('hot'), active: activeCategory === 'hot', cls: '' },
              { key: 'latest', label: t.categories.latest, onClick: () => onCategoryChange('latest'), active: activeCategory === 'latest', cls: '' },
              { key: 'immersive', label: t.immersive.nav, onClick: onOpenImmersive, active: false, cls: '' },
              { key: 'favorites', label: t.favorites.nav, onClick: onOpenFavorites, active: false, cls: '' },
              { key: 'about', label: t.about.nav, onClick: onOpenAbout, active: false, cls: '' },
              // Q&A 在窄屏收起，关于页里能进
              { key: 'qa', label: t.categories.qa, onClick: onOpenQA, active: false, cls: 'text-dim/60 hidden sm:block' },
              { key: 'funny', label: t.categories.funny, onClick: onOpenFunny, active: false, cls: 'text-dim/60' }
            ].map(item => (
              <button
                key={item.key}
                onClick={item.onClick}
                className={`relative py-1.5 label transition-colors ${
                  item.active ? 'text-bone' : 'text-dim hover:text-bone'
                } ${item.cls}`}
              >
                {item.label}
                {item.active && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute inset-x-0 -bottom-px h-px bg-accent"
                    transition={{ type: 'spring', stiffness: 480, damping: 42 }}
                  />
                )}
              </button>
            ))}
          </nav>
        </div>

        <button
          onClick={() => onLangChange(lang === 'zh' ? 'en' : 'zh')}
          className="border border-line px-3 py-1.5 label text-dim transition-colors hover:border-bone/30 hover:text-bone"
        >
          {lang === 'zh' ? 'EN' : '中文'}
        </button>
      </div>

      <motion.div
        style={{ scaleX: progress }}
        className="absolute inset-x-0 bottom-0 h-px origin-left bg-accent/60"
      />
    </motion.header>
  );
};

// --- Masthead ---

const Masthead = ({
  activeCategory,
  count,
  page,
  totalPages,
  onRefresh,
  isLoading,
  gachaLabel,
  onOpenGacha,
  t
}: {
  activeCategory: Category;
  count: number;
  page: number;
  totalPages: number;
  onRefresh: () => void;
  isLoading: boolean;
  gachaLabel: string;
  onOpenGacha: () => void;
  t: any;
}) => {
  const title = t.main.collectionTitles[activeCategory] ?? t.main.title;
  const subtitle = t.main.collectionSubtitles[activeCategory] ?? t.main.description;

  return (
    <section className="border-b border-line/70">
      <div className="mx-auto max-w-[1680px] px-5 pb-8 pt-8 md:px-10 md:pb-11 md:pt-16 lg:px-16">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between md:gap-16">
          <div className="max-w-2xl">
            <Eyebrow>
              {t.main.collectionLabel} · {activeCategory === 'latest' ? '02' : '01'}
            </Eyebrow>
            <h2 className="mt-3 font-display text-[clamp(2.2rem,6.5vw,5.5rem)] leading-[0.95] tracking-tight">
              {title}
            </h2>
            <p className="mt-4 max-w-md text-[13px] leading-relaxed text-dim md:mt-5">{subtitle}</p>
          </div>

          <div className="flex items-end justify-between gap-8 md:justify-end">
            <div className="md:text-right">
              <p className="label text-bone/80 tabular-nums">
                {t.main.works.replace('{count}', String(count))}
              </p>
              {activeCategory === 'latest' && totalPages > 0 && (
                <p className="label mt-2 text-dim/60 tabular-nums">
                  {t.main.page.replace('{current}', String(page)).replace('{total}', String(totalPages))}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* 每日抽卡主入口（docs/gacha-design.md §4.1）：两态文案 */}
              <button
                onClick={onOpenGacha}
                className="group flex items-center gap-2.5 bg-accent px-4 py-2.5 label text-white transition-colors hover:bg-[#e6294d]"
              >
                <Sparkles className="h-3 w-3" />
                {gachaLabel}
              </button>

              {activeCategory === 'hot' && (
                <button
                  onClick={onRefresh}
                  disabled={isLoading}
                  className="group flex items-center gap-2.5 border border-line px-4 py-2.5 label text-dim transition-colors hover:border-bone/30 hover:text-bone disabled:opacity-40"
                >
                  <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
                  {t.main.refresh}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

// --- Gallery tools（侧边工具栏） ---

const SideTool = ({
  onClick,
  label,
  spinning,
  children
}: {
  onClick: () => void;
  label: string;
  spinning?: boolean;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    aria-label={label}
    className="group relative grid h-10 w-10 place-items-center text-dim transition-colors hover:bg-white/[0.04] hover:text-bone lg:h-11 lg:w-11"
  >
    <span className={spinning ? 'animate-spin' : undefined}>{children}</span>
    <span className="pointer-events-none absolute right-full z-10 mr-3 hidden whitespace-nowrap bg-bone px-2.5 py-1.5 label text-canvas opacity-0 transition-opacity duration-150 group-hover:opacity-100 md:block">
      {label}
    </span>
  </button>
);

const SideRail = ({
  onTop,
  onRefresh,
  isLoading,
  t
}: {
  onTop: () => void;
  onRefresh: () => void;
  isLoading: boolean;
  t: any;
}) => (
  <motion.aside
    initial={{ opacity: 0, x: 12 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
    className="fixed bottom-5 right-3 z-40 flex flex-col overflow-hidden border border-line bg-canvas/85 backdrop-blur-md lg:bottom-auto lg:right-2 lg:top-1/2 lg:-translate-y-1/2"
  >
    <SideTool onClick={onTop} label={t.main.toolbar.top}>
      <ArrowUp className="h-4 w-4" strokeWidth={1.5} />
    </SideTool>
    <div className="h-px w-full bg-line" />
    <SideTool onClick={onRefresh} label={t.main.toolbar.refresh} spinning={isLoading}>
      <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
    </SideTool>
  </motion.aside>
);

// --- Gallery ---

const GalleryCard = ({
  image,
  index,
  onClick,
  onOpenAuthor,
  t
}: {
  image: CosplayImage;
  index: number;
  onClick: () => void;
  onOpenAuthor?: (author: CosplayImage['author']) => void;
  t: any;
}) => {
  const [loaded, setLoaded] = useState(false);
  const ratio = image.width && image.height ? `${image.width} / ${image.height}` : '3 / 4';

  return (
    <motion.figure
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay: Math.min(index % 6, 5) * 0.045, ease: [0.22, 1, 0.36, 1] }}
      className="group"
    >
      <button onClick={onClick} className="block w-full text-left" aria-label={image.author.name}>
        <div
          className={`relative overflow-hidden bg-surface ring-1 ring-line/70 transition-all duration-500 group-hover:ring-bone/25 ${
            loaded ? '' : 'skeleton'
          }`}
          style={{ aspectRatio: ratio }}
        >
          <img
            src={image.resourceUrl}
            alt={`${image.author.name} 的 cosplay 作品 — ${t.main.title}`}
            referrerPolicy="no-referrer"
            loading={index < 6 ? 'eager' : 'lazy'}
            fetchPriority={index < 3 ? 'high' : 'auto'}
            decoding="async"
            onLoad={() => setLoaded(true)}
            className={`absolute inset-0 h-full w-full object-cover transition-[transform,opacity] duration-[900ms] ease-out group-hover:scale-[1.04] ${
              loaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          <span className="absolute left-3 top-2.5 label text-white/75 opacity-0 transition-opacity duration-500 group-hover:opacity-100 tabular-nums">
            {pad(index)}
          </span>
          <span className="absolute bottom-3 right-3 flex translate-y-1 items-center gap-1.5 bg-bone px-2.5 py-1.5 label text-canvas opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
            {t.card.view}
            <ArrowUpRight className="h-3 w-3" />
          </span>
        </div>

        <figcaption className="mt-2.5 flex items-baseline justify-between gap-2">
          {onOpenAuthor && image.author.id ? (
            <span
              role="button"
              onClick={e => {
                // 画廊卡根节点是 button，作者名是嵌套入口：阻断冒泡避免顺带开图
                e.stopPropagation();
                e.preventDefault();
                onOpenAuthor(image.author);
              }}
              className="cursor-pointer truncate text-[10px] uppercase tracking-[0.14em] text-bone/60 transition-colors hover:text-accent sm:text-[11px] sm:tracking-[0.18em]"
            >
              {image.author.name}
            </span>
          ) : (
            <span className="truncate text-[10px] uppercase tracking-[0.14em] text-bone/60 transition-colors group-hover:text-bone sm:text-[11px] sm:tracking-[0.18em]">
              {image.author.name}
            </span>
          )}
          <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-dim tabular-nums sm:gap-2 sm:text-[11px]">
            <span className="flex items-center gap-1 text-accent/90">
              <Heart className="h-2.5 w-2.5 fill-current" />
              {image.rating}
            </span>
            <span className="hidden h-2 w-px bg-line sm:block" />
            <span className="hidden items-center gap-1 sm:flex">
              <Eye className="h-2.5 w-2.5" />
              {image.views}
            </span>
          </span>
        </figcaption>
      </button>
    </motion.figure>
  );
};

const Gallery = ({
  columns,
  indexMap,
  onOpen,
  onOpenAuthor,
  t
}: {
  columns: CosplayImage[][];
  indexMap: Map<string, number>;
  onOpen: (url: string) => void;
  onOpenAuthor?: (author: CosplayImage['author']) => void;
  t: any;
}) => (
  <div className="flex gap-3 md:gap-5">
    {columns.map((col, ci) => (
      <div key={ci} className="flex min-w-0 flex-1 flex-col gap-3 md:gap-5">
        {col.map(image => (
          <React.Fragment key={image.resourceUrl}>
            <GalleryCard
              image={image}
              index={indexMap.get(image.resourceUrl) ?? 0}
              onClick={() => onOpen(image.resourceUrl)}
              onOpenAuthor={onOpenAuthor}
              t={t}
            />
          </React.Fragment>
        ))}
      </div>
    ))}
  </div>
);

const GallerySkeleton = ({ columns }: { columns: number }) => {
  const shapes = ['3 / 4', '4 / 3', '2 / 3', '1 / 1'];
  return (
    <div className="flex gap-3 md:gap-5">
      {Array.from({ length: columns }).map((_, ci) => (
        <div key={ci} className="flex flex-1 flex-col gap-3 md:gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ aspectRatio: shapes[(ci + i) % shapes.length] }} />
          ))}
        </div>
      ))}
    </div>
  );
};

// --- Lightbox ---

const Lightbox = ({
  image,
  images,
  onClose,
  onNext,
  onPrev,
  onSelect,
  t,
  liked,
  onToggleLike,
  notify,
  direction,
  collectionTitle,
  blocked,
  onOpenAuthor,
  onEnterImmersive,
  onOpenGacha
}: {
  image: CosplayImage;
  images: CosplayImage[];
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSelect: (url: string) => void;
  t: any;
  liked: string[];
  onToggleLike: (url: string, detail?: LikeSnapshot) => void;
  notify: (msg: string) => void;
  direction: number;
  collectionTitle: string;
  blocked?: boolean;
  onOpenAuthor?: (author: CosplayImage['author']) => void;
  onEnterImmersive?: () => void;
  onOpenGacha?: () => void;
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnimated, setIsAnimated] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [cardPreview, setCardPreview] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);

  const index = images.findIndex(img => img.resourceUrl === image.resourceUrl);
  const isLiked = liked.includes(image.resourceUrl);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') onNext();
      else if (e.key === 'ArrowLeft') onPrev();
      else if (e.key === 'Escape') {
        // Esc 分层退出：卡片预览 → 放大 → 关闭；上层压着作者页时不抢
        if (cardPreview) setCardPreview(false);
        else if (zoomed) setZoomed(false);
        else if (!blocked) onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNext, onPrev, onClose, zoomed, cardPreview, blocked]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    setLoaded(false);
    setZoomed(false);
    setCardPreview(false);
    setIsAnimated(false);
    setIsProcessing(false);
  }, [image.resourceUrl]);

  // 预加载相邻两张，切换时不闪白
  useEffect(() => {
    if (images.length < 2) return;
    const near = [images[(index + 1) % images.length], images[(index - 1 + images.length) % images.length]];
    near.forEach(item => {
      const img = new Image();
      img.src = item.resourceUrl;
    });
  }, [index, images]);

  // 当前缩略图滚入视野
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [index]);

  const handleMakeMove = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    await new Promise(resolve => setTimeout(resolve, 3000));
    setIsProcessing(false);
    setIsAnimated(true);

    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };
    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval: any = setInterval(() => {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) return clearInterval(interval);
      const particleCount = 50 * (timeLeft / duration);
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);

    setTimeout(() => setIsAnimated(false), 5000);
  };

  const handleDownload = useCallback(async () => {
    await downloadImage(image.resourceUrl, `girls-rating-${image.id || Date.now()}.jpg`);
  }, [image]);

  const handleShare = useCallback(async () => {
    const data = { title: `${image.author.name} — ${t.main.title}`, url: image.resourceUrl };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(image.resourceUrl);
      notify(t.modal.copied);
    } catch {
      notify(t.modal.copied);
    }
  }, [image, notify, t]);

  const ctaLabel = isProcessing ? t.modal.processing : isAnimated ? t.modal.success : t.modal.action;
  const ctaIcon = isProcessing ? (
    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
  ) : isAnimated ? (
    <ShieldCheck className="h-3.5 w-3.5" />
  ) : (
    <Sparkles className="h-3.5 w-3.5" />
  );
  const ctaClass = `flex items-center justify-center gap-2 px-4 py-2.5 label transition-colors disabled:opacity-70 ${
    isAnimated ? 'bg-emerald-500 text-white' : 'bg-accent text-white hover:bg-[#e6294d]'
  }`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[60] flex flex-col bg-[#080706]"
    >
      {/* 氛围背景 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <img
          src={image.resourceUrl}
          alt=""
          className="h-full w-full scale-125 object-cover opacity-20 blur-[80px]"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-canvas/70 via-transparent to-canvas/90" />
      </div>

      {/* 顶栏 */}
      <div className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b border-line/60 px-4 md:h-16 md:px-8">
        <div className="flex items-center gap-4">
          <span className="label tabular-nums">
            <span className="text-accent">{pad(index)}</span>
            <span className="text-dim/40"> / {String(images.length).padStart(2, '0')}</span>
          </span>
          <span className="hidden h-3 w-px bg-line md:block" />
          <span className="hidden label text-dim/70 md:block">{t.header.logo}</span>
          <span className="hidden h-3 w-px bg-line lg:block" />
          <span className="hidden max-w-[28vw] truncate label text-dim/45 lg:block">{collectionTitle}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="mr-3 hidden label text-dim/40 lg:block">{t.modal.hint}</span>
          {onEnterImmersive && (
            <IconButton onClick={onEnterImmersive} label={t.immersive.fromLightbox}>
              <Maximize2 className="h-3.5 w-3.5" />
            </IconButton>
          )}
          <IconButton
            onClick={() => setZoomed(z => !z)}
            label={zoomed ? t.modal.zoomOut : t.modal.zoomIn}
            active={zoomed}
          >
            {zoomed ? <ZoomOut className="h-3.5 w-3.5" /> : <ZoomIn className="h-3.5 w-3.5" />}
          </IconButton>
          <IconButton onClick={onClose} label={t.modal.close}>
            <X className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      {/* 舞台 + 展签：桌面端右侧留出 340px 给展签栏 */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col lg:pr-[340px]">
      {/* 展品 */}
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 flex items-center justify-center px-2 py-3 md:px-24 md:py-8">
          {cardPreview ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex h-full w-full flex-col items-center justify-center gap-5"
            >
              <div className="w-full max-w-[340px] md:max-w-[400px]">
                <GachaCard card={toGachaCardData(image)} t={t} revealed interactive />
              </div>
              <div className="flex flex-col items-center gap-3 text-center">
                <p className="label text-dim/60">{t.gacha.cardHint}</p>
                {onOpenGacha && (
                  <button
                    onClick={onOpenGacha}
                    className="flex items-center gap-2.5 bg-accent px-6 py-3 label text-white transition-colors hover:bg-[#e6294d]"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {t.gacha.goDraw}
                  </button>
                )}
              </div>
            </motion.div>
          ) : (
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={image.resourceUrl}
              custom={direction}
              variants={{
                enter: (d: number) => ({ opacity: 0, x: d * 64 }),
                center: { opacity: 1, x: 0 },
                exit: (d: number) => ({ opacity: 0, x: d * -48 })
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex h-full w-full items-center justify-center overflow-hidden"
            >
              {!loaded && <div className="skeleton absolute inset-0" />}
              <motion.img
                src={image.resourceUrl}
                alt={`${image.author.name} — ${t.main.title}`}
                referrerPolicy="no-referrer"
                onLoad={() => setLoaded(true)}
                onClick={() => setZoomed(z => !z)}
                drag={zoomed ? true : 'x'}
                dragConstraints={
                  zoomed
                    ? { left: -260, right: 260, top: -260, bottom: 260 }
                    : { left: 0, right: 0, top: 0, bottom: 0 }
                }
                dragElastic={zoomed ? 0.12 : 0.4}
                onDragEnd={(_e, info) => {
                  if (zoomed) return;
                  if (info.offset.x < -70) onNext();
                  else if (info.offset.x > 70) onPrev();
                }}
                animate={{ scale: zoomed ? 1.6 : 1, opacity: loaded ? 1 : 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className={`max-h-full max-w-full select-none object-contain ring-1 ring-white/[0.06] ${
                  zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'
                }`}
              />
            </motion.div>
          </AnimatePresence>
          )}
        </div>

        <button
          onClick={onPrev}
          aria-label={t.modal.prev}
          className="absolute left-6 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 place-items-center border border-line/60 bg-canvas/50 text-dim backdrop-blur transition-colors hover:border-bone/30 hover:text-bone md:grid"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={1.25} />
        </button>
        <button
          onClick={onNext}
          aria-label={t.modal.next}
          className="absolute right-6 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 place-items-center border border-line/60 bg-canvas/50 text-dim backdrop-blur transition-colors hover:border-bone/30 hover:text-bone md:grid"
        >
          <ChevronRight className="h-6 w-6" strokeWidth={1.25} />
        </button>
      </div>

      {/* 展签 / 操作 */}
      <div className="relative z-10 shrink-0 border-t border-line/60 bg-canvas/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4 px-4 py-3 md:px-8 md:py-4 lg:hidden">
          <div className="flex min-w-0 items-center gap-3">
            {onOpenAuthor && image.author.id ? (
              <button
                onClick={() => onOpenAuthor(image.author)}
                className="group flex min-w-0 items-center gap-3 text-left"
                aria-label={t.author.viewWorks}
              >
                <img
                  src={image.author.avatar}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-line"
                  referrerPolicy="no-referrer"
                />
                <div className="min-w-0">
                  <p className="truncate font-display text-lg leading-tight md:text-xl">{image.author.name}</p>
                  <p className="label mt-1 text-dim/70 transition-colors group-hover:text-bone/80">
                    {t.author.viewWorks}
                  </p>
                </div>
              </button>
            ) : (
              <>
                <img
                  src={image.author.avatar}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-line"
                  referrerPolicy="no-referrer"
                />
                <div className="min-w-0">
                  <p className="truncate font-display text-lg leading-tight md:text-xl">{image.author.name}</p>
                  <p className="label mt-1 text-dim/70">
                    {t.modal.verified} · {image.width}×{image.height}
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-4 text-[11px] text-dim tabular-nums">
            <span className="flex items-center gap-1.5">
              <Heart className="h-3 w-3 text-accent" />
              {image.rating}
            </span>
            <span className="hidden items-center gap-1.5 sm:flex">
              <Eye className="h-3 w-3" />
              {image.views}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-line/40 px-4 py-2.5 md:px-8">
          <div ref={stripRef} className="no-scrollbar hidden flex-1 items-center gap-1.5 overflow-x-auto md:flex">
            {images.map((img, i) => (
              <button
                key={img.resourceUrl}
                data-active={i === index}
                onClick={() => onSelect(img.resourceUrl)}
                aria-label={`${t.modal.goto} ${i + 1}`}
                className={`relative h-12 w-9 shrink-0 overflow-hidden ring-1 transition-all ${
                  i === index
                    ? 'opacity-100 ring-accent'
                    : 'opacity-40 ring-line/60 hover:opacity-80'
                }`}
              >
                <img
                  src={img.resourceUrl}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>

          <div className="flex w-full items-center justify-between gap-1.5 md:w-auto md:justify-end lg:hidden">
            <div className="flex items-center gap-1.5">
              <IconButton
                onClick={() => {
                  onToggleLike(image.resourceUrl, image);
                  notify(isLiked ? t.modal.unliked : t.modal.liked);
                }}
                label={isLiked ? t.modal.unliked : t.modal.like}
                active={isLiked}
              >
                <Heart className={`h-3.5 w-3.5 ${isLiked ? 'fill-current' : ''}`} />
              </IconButton>
              <IconButton onClick={handleDownload} label={t.modal.download}>
                <Download className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton onClick={handleShare} label={t.modal.share}>
                <Share2 className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                onClick={() => setCardPreview(p => !p)}
                label={t.modal.cardPreview}
                active={cardPreview}
              >
                <Layers className="h-3.5 w-3.5" />
              </IconButton>
            </div>

            <motion.button
              onClick={handleMakeMove}
              disabled={isProcessing || isAnimated}
              whileTap={{ scale: 0.98 }}
              className={`${ctaClass} sm:ml-1`}
            >
              {ctaIcon}
              <span>{ctaLabel}</span>
            </motion.button>
          </div>
        </div>
      </div>
      </div>

      {/* 右侧展签栏：把作品信息做成美术馆墙上的标签 */}
      <aside className="absolute bottom-0 right-0 top-16 z-20 hidden w-[340px] flex-col overflow-y-auto border-l border-line/60 bg-canvas/60 backdrop-blur-xl lg:flex">
        <div className="flex items-baseline justify-between border-b border-line/50 px-7 py-5">
          <span className="label text-dim/50">{t.modal.workNo}</span>
          <span className="font-display text-[32px] leading-none tabular-nums">{pad(index)}</span>
        </div>

        <div className="flex items-center gap-3 border-b border-line/50 px-7 py-6">
          {onOpenAuthor && image.author.id ? (
            <button
              onClick={() => onOpenAuthor(image.author)}
              className="group flex min-w-0 flex-1 items-center gap-3 text-left"
              aria-label={t.author.viewWorks}
            >
              <img
                src={image.author.avatar}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-line"
                referrerPolicy="no-referrer"
              />
              <div className="min-w-0">
                <p className="truncate font-display text-xl leading-none">{image.author.name}</p>
                <p className="label mt-1.5 text-dim/55 transition-colors group-hover:text-bone/80">
                  {t.author.viewWorks}
                </p>
              </div>
              <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-dim/40 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
            </button>
          ) : (
            <>
              <img
                src={image.author.avatar}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-line"
                referrerPolicy="no-referrer"
              />
              <div className="min-w-0">
                <p className="truncate font-display text-xl leading-none">{image.author.name}</p>
                <p className="label mt-1.5 text-dim/55">{t.modal.verified}</p>
              </div>
            </>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-5 border-b border-line/50 px-7 py-6">
          {[
            { k: t.modal.dimensions, v: `${image.width} × ${image.height}` },
            { k: t.modal.rating, v: String(image.rating) },
            { k: t.modal.views, v: image.views },
            { k: t.modal.collection, v: collectionTitle }
          ].map(row => (
            <div key={row.k} className="min-w-0">
              <dt className="label text-dim/40">{row.k}</dt>
              <dd className="mt-1.5 truncate text-[13px] text-bone/85 tabular-nums">{row.v}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-col gap-px border-b border-line/50 bg-line/50">
          <button
            onClick={() => {
              onToggleLike(image.resourceUrl, image);
              notify(isLiked ? t.modal.unliked : t.modal.liked);
            }}
            className={`flex items-center gap-3 bg-canvas/60 px-7 py-3.5 text-left label transition-colors hover:bg-white/[0.04] ${
              isLiked ? 'text-accent' : 'text-dim hover:text-bone'
            }`}
          >
            <Heart className={`h-3.5 w-3.5 ${isLiked ? 'fill-current' : ''}`} />
            {isLiked ? t.modal.unliked : t.modal.like}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-3 bg-canvas/60 px-7 py-3.5 text-left label text-dim transition-colors hover:bg-white/[0.04] hover:text-bone"
          >
            <Download className="h-3.5 w-3.5" />
            {t.modal.download}
          </button>
          <button
            onClick={handleShare}
            className="flex items-center gap-3 bg-canvas/60 px-7 py-3.5 text-left label text-dim transition-colors hover:bg-white/[0.04] hover:text-bone"
          >
            <Share2 className="h-3.5 w-3.5" />
            {t.modal.share}
          </button>
          <button
            onClick={() => setCardPreview(p => !p)}
            className={`flex items-center gap-3 bg-canvas/60 px-7 py-3.5 text-left label transition-colors hover:bg-white/[0.04] ${
              cardPreview ? 'text-accent' : 'text-dim hover:text-bone'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            {t.modal.cardPreview}
          </button>
        </div>

        <div className="px-7 py-5">
          <motion.button
            onClick={handleMakeMove}
            disabled={isProcessing || isAnimated}
            whileTap={{ scale: 0.98 }}
            className={`${ctaClass} w-full`}
          >
            {ctaIcon}
            <span>{ctaLabel}</span>
          </motion.button>
        </div>

        <div className="border-t border-line/50 px-7 py-5">
          <div className="flex items-baseline justify-between">
            <span className="label text-dim/40">{t.modal.moreWorks}</span>
            <span className="label text-dim/30 tabular-nums">
              {index + 1} / {images.length}
            </span>
          </div>
          <div className="mt-3 flex flex-col">
            {[1, 2, 3].map(offset => {
              const nextIndex = (index + offset) % images.length;
              const next = images[nextIndex];
              if (!next) return null;
              return (
                <button
                  key={next.resourceUrl}
                  onClick={() => onSelect(next.resourceUrl)}
                  aria-label={`${t.modal.goto} ${nextIndex + 1}`}
                  className="group flex items-center gap-3 py-2.5 text-left"
                >
                  <span className="w-5 shrink-0 label text-dim/25 tabular-nums">{pad(nextIndex)}</span>
                  <img
                    src={next.resourceUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-12 w-9 shrink-0 object-cover opacity-60 ring-1 ring-line/60 transition-all group-hover:opacity-100 group-hover:ring-bone/30"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-[15px] leading-none">
                      {next.author.name}
                    </span>
                    <span className="mt-1.5 flex items-center gap-1 text-[10px] text-dim tabular-nums">
                      <Heart className="h-2.5 w-2.5 text-accent/80" />
                      {next.rating}
                    </span>
                  </span>
                  <ArrowUpRight className="h-3 w-3 shrink-0 text-dim/25 transition-colors group-hover:text-bone" />
                </button>
              );
            })}
          </div>
          <div className="mt-4 h-px w-full bg-line">
            <div
              className="h-px bg-accent transition-all duration-500"
              style={{ width: `${images.length ? ((index + 1) / images.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      </aside>
    </motion.div>
  );
};

// --- Immersive（沉浸式全屏上下刷，docs/features-batch2.md §二） ---

const IMMERSIVE_TAP_WINDOW = 300; // 双击判定窗口 ms
const AUTHOR_PAGE_SIZE = 20;

/** 单个全屏滑块：双击点赞 + 展签 + 操作 */
const ImmersiveSlide = ({
  image,
  active,
  isLiked,
  onToggleLike,
  notify,
  t
}: {
  image: CosplayImage;
  active: boolean;
  isLiked: boolean;
  onToggleLike: (url: string, detail?: LikeSnapshot) => void;
  notify: (msg: string) => void;
  t: any;
}) => {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [burst, setBurst] = useState(0);
  const lastTapRef = useRef(0);

  // 双击点赞（pointerup 时间窗判定，触屏/鼠标通用）
  const handlePointerUp = () => {
    const now = Date.now();
    if (now - lastTapRef.current < IMMERSIVE_TAP_WINDOW) {
      lastTapRef.current = 0;
      if (!isLiked) onToggleLike(image.resourceUrl, image);
      setBurst(b => b + 1);
    } else {
      lastTapRef.current = now;
    }
  };

  const rarityColor =
    image.rarity === 'SSR' ? 'text-accent' : image.rarity === 'SR' ? 'text-bone' : 'text-dim';

  return (
    <section className="relative h-full w-full snap-start snap-always overflow-hidden bg-[#080706]">
      <div className="absolute inset-0 flex items-center justify-center p-4 md:p-14" onPointerUp={handlePointerUp}>
        {!loaded && !failed && <div className="skeleton absolute inset-16" />}
        {failed ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <Lock className="h-6 w-6 text-dim/30" strokeWidth={1.25} />
            <p className="label text-dim/50">{t.immersive.loadFailed}</p>
          </div>
        ) : (
          <img
            src={image.resourceUrl}
            alt={`${image.author.name} 的 cosplay 作品 — ${t.main.title}`}
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={`max-h-full max-w-full select-none object-contain transition-opacity duration-500 ${
              loaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        {/* 双击点赞心形爆裂 */}
        {burst > 0 && (
          <Heart
            key={burst}
            className="immersive-burst pointer-events-none absolute h-24 w-24 fill-accent text-accent drop-shadow-[0_0_24px_rgba(255,45,85,0.45)]"
          />
        )}
      </div>

      {/* 底部展签 + 操作 */}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 to-transparent px-5 pb-5 pt-14 md:px-10">
        <div className="flex items-end justify-between gap-6">
          <div className="flex min-w-0 items-center gap-3">
            {image.author.avatar ? (
              <img
                src={image.author.avatar}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-line"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-10 w-10 shrink-0 rounded-full bg-surface ring-1 ring-line" />
            )}
            <div className="min-w-0">
              <p className="truncate font-display text-xl leading-none">{image.author.name}</p>
              <p className="label mt-1.5 flex items-center gap-3 text-dim/60 tabular-nums">
                <span className="flex items-center gap-1.5 text-accent/90">
                  <Heart className="h-3 w-3" />
                  {image.rating}
                </span>
                <span className="flex items-center gap-1.5">
                  <Eye className="h-3 w-3" />
                  {image.views}
                </span>
                <span className={rarityColor}>{image.rarity ?? 'R'}</span>
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <IconButton
              onClick={() => {
                onToggleLike(image.resourceUrl, image);
                notify(isLiked ? t.modal.unliked : t.modal.liked);
              }}
              label={isLiked ? t.modal.unliked : t.modal.like}
              active={isLiked}
            >
              <Heart className={`h-3.5 w-3.5 ${isLiked ? 'fill-current' : ''}`} />
            </IconButton>
            <IconButton
              onClick={() => downloadImage(image.resourceUrl, `girls-rating-${image.id || Date.now()}.jpg`)}
              label={t.modal.download}
            >
              <Download className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        </div>
        {active && (
          <p className="label mt-4 hidden text-dim/35 md:block">{t.immersive.doubleTap}</p>
        )}
      </div>
    </section>
  );
};

const ImmersiveFeed = ({
  mode,
  initialImages,
  startIndex,
  initialPage = 1,
  initialTotalPages = 1,
  liked,
  onToggleLike,
  notify,
  onClose,
  t
}: {
  mode: 'hot' | 'latest';
  initialImages: CosplayImage[];
  startIndex: number;
  initialPage?: number;
  initialTotalPages?: number;
  liked: string[];
  onToggleLike: (url: string, detail?: LikeSnapshot) => void;
  notify: (msg: string) => void;
  onClose: () => void;
  t: any;
}) => {
  const [slides, setSlides] = useState<CosplayImage[]>(initialImages);
  const [current, setCurrent] = useState(startIndex);
  const [exhausted, setExhausted] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef(new Set(initialImages.map(i => i.resourceUrl)));
  const nextPageRef = useRef(mode === 'latest' ? initialPage + 1 : 0);
  const moreRef = useRef(mode === 'latest' ? initialPage < initialTotalPages : true);
  const loadingRef = useRef(false);

  // 锁 body 滚动 + Esc
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // 进入时定位到起始张（不平滑，避免开场整屏滚动动画）
  useEffect(() => {
    const el = containerRef.current;
    if (el && startIndex > 0) el.scrollTo({ top: startIndex * el.clientHeight });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 滚动位置 → 当前滑块
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el || el.clientHeight === 0) return;
    const idx = Math.round(el.scrollTop / el.clientHeight);
    setCurrent(prev => (idx !== prev ? idx : prev));
  }, []);

  // 预加载相邻 ±2
  useEffect(() => {
    [current + 1, current + 2, current - 1].forEach(i => {
      const near = slides[i];
      if (!near) return;
      const img = new Image();
      img.src = near.resourceUrl;
    });
  }, [current, slides]);

  const appendSlides = useCallback((items: CosplayImage[]) => {
    const fresh = items.filter(i => i.resourceUrl && !seenRef.current.has(i.resourceUrl));
    fresh.forEach(i => seenRef.current.add(i.resourceUrl));
    if (fresh.length > 0) setSlides(prev => [...prev, ...fresh]);
    return fresh.length;
  }, []);

  // 无限追加：latest 顺延分页；hot 再抽一批并去重
  const loadMore = useCallback(async () => {
    if (!moreRef.current || loadingRef.current) return;
    loadingRef.current = true;
    setLoadFailed(false);
    try {
      if (mode === 'latest') {
        const response = await fetch(
          `${API_BASE_URL}/cosplay?page=${nextPageRef.current}&pageSize=${PAGE_SIZE}`
        );
        const result = await response.json();
        if (result.code !== 200) throw new Error('bad response');
        appendSlides((result.data?.list ?? []) as CosplayImage[]);
        nextPageRef.current = (result.data?.currPage ?? nextPageRef.current) + 1;
        moreRef.current = nextPageRef.current <= (result.data?.totalPage ?? 0);
        if (!moreRef.current) setExhausted(true);
      } else {
        const response = await fetch(`${API_BASE_URL}/random`);
        const result = await response.json();
        if (result.code !== 200) throw new Error('bad response');
        const added = appendSlides((result.data ?? []) as CosplayImage[]);
        // 一整批随机图都与已看重复 → 池耗尽
        moreRef.current = added > 0;
        if (!moreRef.current) setExhausted(true);
      }
    } catch {
      setLoadFailed(true);
    } finally {
      loadingRef.current = false;
    }
  }, [mode, appendSlides]);

  // 接近末尾时预取
  useEffect(() => {
    if (!exhausted && current >= slides.length - 3) loadMore();
  }, [current, slides.length, exhausted, loadMore]);

  const goTo = useCallback(
    (idx: number) => {
      const el = containerRef.current;
      if (!el) return;
      const target = Math.max(0, Math.min(idx, slides.length - 1));
      el.scrollTo({ top: target * el.clientHeight, behavior: 'smooth' });
    },
    [slides.length]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        goTo(current + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        goTo(current - 1);
      }
    },
    [current, goTo]
  );

  const progress = slides.length ? ((current + 1) / slides.length) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[75] bg-[#080706]"
    >
      {/* 顶栏 */}
      <div className="absolute inset-x-0 top-0 z-20 flex h-14 items-center justify-between border-b border-line/60 bg-canvas/70 px-4 backdrop-blur-xl md:h-16 md:px-8">
        <button
          onClick={onClose}
          className="group flex items-center gap-2.5 label text-dim transition-colors hover:text-bone"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          {t.immersive.back}
        </button>
        <div className="flex items-center gap-4">
          <span className="hidden label text-dim/40 md:block">{t.immersive.title}</span>
          <span className="label text-bone/80 tabular-nums">
            {t.immersive.counter
              .replace('{current}', String(Math.min(current + 1, slides.length)))
              .replace('{total}', String(slides.length))}
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label={t.modal.close}
          className="grid h-8 w-8 place-items-center border border-line text-dim transition-colors hover:border-accent hover:text-accent"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 右缘进度轨 */}
      <div className="absolute right-3 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-center gap-3 md:flex">
        <span className="label text-dim/50 tabular-nums">
          {String(Math.min(current + 1, slides.length)).padStart(2, '0')}
        </span>
        <div className="relative h-40 w-px bg-line">
          <div className="absolute left-0 top-0 w-px bg-accent" style={{ height: `${progress}%` }} />
        </div>
        <span className="label text-dim/25 tabular-nums">{String(slides.length).padStart(2, '0')}</span>
      </div>

      {/* 滑动容器：snap 原生吸附 */}
      <div
        ref={containerRef}
        tabIndex={0}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        role="region"
        aria-label={t.immersive.title}
        className="no-scrollbar h-full w-full snap-y snap-mandatory overflow-y-scroll overscroll-contain outline-none"
      >
        {slides.map((s, i) => (
          <ImmersiveSlide
            key={s.resourceUrl}
            image={s}
            active={i === current}
            isLiked={liked.includes(s.resourceUrl)}
            onToggleLike={onToggleLike}
            notify={notify}
            t={t}
          />
        ))}

        {/* 末尾态 */}
        {exhausted && (
          <section className="flex h-full w-full snap-start snap-always flex-col items-center justify-center gap-5 bg-[#080706] text-center">
            <Lock className="h-6 w-6 text-dim/30" strokeWidth={1.25} />
            <p className="font-display text-2xl text-bone/80">{t.immersive.end}</p>
            <button
              onClick={onClose}
              className="border border-line px-8 py-3.5 label text-dim transition-colors hover:border-bone/30 hover:text-bone"
            >
              {t.immersive.endBack}
            </button>
          </section>
        )}
      </div>

      {/* 追加失败轻提示 */}
      {loadFailed && !exhausted && (
        <div className="absolute bottom-24 left-1/2 z-20 -translate-x-1/2">
          <button
            onClick={loadMore}
            className="border border-line bg-canvas/80 px-6 py-3 label text-dim backdrop-blur transition-colors hover:border-bone/30 hover:text-bone"
          >
            {t.immersive.loadFailed} · {t.immersive.retry}
          </button>
        </div>
      )}
    </motion.div>
  );
};

// --- Favorites（收藏夹页，docs/features-batch2.md C1） ---

const FavoritesPage = ({
  onClose,
  details,
  onOpenImage,
  t
}: {
  onClose: () => void;
  details: LikeDetail[];
  onOpenImage: (url: string) => void;
  t: any;
}) => {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const images = useMemo<CosplayImage[]>(
    () =>
      details.map(d => ({
        id: '',
        resourceUrl: d.url,
        width: d.width,
        height: d.height,
        rating: d.rating,
        views: d.views,
        rarity: d.rarity,
        author: d.author
      })),
    [details]
  );
  const columns = useColumnCount();
  const laidOut = useMemo(() => columnize(images, columns), [images, columns]);
  const indexMap = useMemo(
    () => new Map(images.map((img, i) => [img.resourceUrl, i])),
    [images]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-[70] overflow-y-auto overscroll-contain bg-canvas"
    >
      <div className="grain-overlay" aria-hidden />

      {/* 顶栏 */}
      <div className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line/70 bg-canvas/90 px-5 backdrop-blur-xl md:px-10 lg:px-16">
        <button
          onClick={onClose}
          className="group flex items-center gap-2.5 label text-dim transition-colors hover:text-bone"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          {t.about.back}
        </button>
        <div className="flex items-center gap-4">
          <span className="label text-dim/40">{t.favorites.subtitle}</span>
          <span className="label text-bone/80 tabular-nums">
            {t.favorites.count.replace('{count}', String(details.length))}
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label={t.modal.close}
          className="grid h-8 w-8 place-items-center border border-line text-dim transition-colors hover:border-accent hover:text-accent"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mx-auto max-w-[1680px] px-5 py-10 md:px-10 md:py-14 lg:px-16">
        <Eyebrow className="text-accent/80">{t.favorites.nav}</Eyebrow>
        <h1 className="mt-4 font-display text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.95] tracking-tight">
          {t.favorites.title}
        </h1>

        <div className="mt-10">
          {details.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 border border-line/60 py-28 text-center">
              <Heart className="h-6 w-6 text-dim/30" strokeWidth={1.25} />
              <p className="font-display text-2xl text-bone/80">{t.favorites.empty}</p>
              <p className="text-xs text-dim">{t.favorites.emptyHint}</p>
            </div>
          ) : (
            <div className="flex gap-3 md:gap-5">
              {laidOut.map((col, ci) => (
                <div key={ci} className="flex min-w-0 flex-1 flex-col gap-3 md:gap-5">
                  {col.map(image => (
                    <GalleryCard
                      key={image.resourceUrl}
                      image={image}
                      index={indexMap.get(image.resourceUrl) ?? 0}
                      onClick={() => onOpenImage(image.resourceUrl)}
                      t={t}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// --- Author（作者专区，docs/features-batch2.md C2） ---

const AuthorPage = ({
  author,
  onClose,
  onOpenImage,
  t
}: {
  author: { id: number; name: string; avatar: string };
  onClose: () => void;
  onOpenImage: (url: string, images: CosplayImage[]) => void;
  t: any;
}) => {
  const [list, setList] = useState<CosplayImage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(
    async (nextPage: number, append: boolean) => {
      append ? setLoadingMore(true) : setLoading(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/cosplay?author_id=${author.id}&page=${nextPage}&pageSize=${AUTHOR_PAGE_SIZE}`
        );
        const result = await response.json();
        if (result.code !== 200) throw new Error('bad response');
        setList(prev => (append ? [...prev, ...(result.data.list ?? [])] : result.data.list ?? []));
        setTotal(result.data.totalCount ?? 0);
        setPage(result.data.currPage ?? nextPage);
        setError(false);
      } catch {
        if (!append) setError(true);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [author.id]
  );

  useEffect(() => {
    load(1, false);
  }, [load]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const columns = useColumnCount();
  const laidOut = useMemo(() => columnize(list, columns), [list, columns]);
  const canLoadMore = list.length < total;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-[70] overflow-y-auto overscroll-contain bg-canvas"
    >
      <div className="grain-overlay" aria-hidden />

      {/* 顶栏 */}
      <div className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line/70 bg-canvas/90 px-5 backdrop-blur-xl md:px-10 lg:px-16">
        <button
          onClick={onClose}
          className="group flex items-center gap-2.5 label text-dim transition-colors hover:text-bone"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          {t.about.back}
        </button>
        <span className="label text-dim/40">{t.author.worksLabel}</span>
        <button
          onClick={onClose}
          aria-label={t.modal.close}
          className="grid h-8 w-8 place-items-center border border-line text-dim transition-colors hover:border-accent hover:text-accent"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mx-auto max-w-[1680px] px-5 py-10 md:px-10 md:py-14 lg:px-16">
        {/* 作者展签 */}
        <div className="flex items-center gap-5 border-b border-line/70 pb-8 md:gap-7">
          {author.avatar ? (
            <img
              src={author.avatar}
              alt=""
              className="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-line md:h-20 md:w-20"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="h-16 w-16 shrink-0 rounded-full bg-surface ring-1 ring-line md:h-20 md:w-20" />
          )}
          <div className="min-w-0">
            <Eyebrow className="text-accent/80">{t.author.worksLabel}</Eyebrow>
            <h1 className="mt-3 truncate font-display text-[clamp(2rem,5vw,3.75rem)] leading-none tracking-tight">
              {author.name}
            </h1>
            <p className="label mt-3 text-dim/60 tabular-nums">
              {t.main.works.replace('{count}', String(total))}
            </p>
          </div>
        </div>

        <div className="mt-10">
          {loading ? (
            <GallerySkeleton columns={columns} />
          ) : error ? (
            <button
              onClick={() => load(1, false)}
              className="flex w-full flex-col items-center gap-4 border border-line/60 py-20 text-center transition-colors hover:border-bone/30"
            >
              <Lock className="h-6 w-6 text-dim/30" strokeWidth={1.25} />
              <p className="font-display text-2xl text-bone/80">{t.gacha.error}</p>
              <p className="label text-dim/50">{t.gacha.retry}</p>
            </button>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 border border-line/60 py-24 text-center">
              <Lock className="h-6 w-6 text-dim/30" strokeWidth={1.25} />
              <p className="font-display text-2xl text-bone/80">{t.author.empty}</p>
            </div>
          ) : (
            <>
              <div className="flex gap-3 md:gap-5">
                {laidOut.map((col, ci) => (
                  <div key={ci} className="flex min-w-0 flex-1 flex-col gap-3 md:gap-5">
                    {col.map(image => (
                      <GalleryCard
                        key={image.resourceUrl}
                        image={image}
                        index={list.findIndex(i => i.resourceUrl === image.resourceUrl)}
                        onClick={() => onOpenImage(image.resourceUrl, list)}
                        t={t}
                      />
                    ))}
                  </div>
                ))}
              </div>
              {canLoadMore && (
                <div className="mt-14 flex justify-center">
                  <button
                    onClick={() => load(page + 1, true)}
                    disabled={loadingMore}
                    className="flex items-center gap-3 border border-line px-10 py-4 label text-dim transition-colors hover:border-bone/35 hover:text-bone disabled:opacity-50"
                  >
                    {loadingMore ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    {loadingMore ? t.main.loadingMore : t.main.loadMore}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// --- Gacha（每日抽卡，docs/gacha-design.md） ---

const GACHA_CARD_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const GACHA_FLIP_STAGGER = 80; // 十张翻面错峰
const GACHA_SSR_AURA_MS = 1500; // SSR 光晕脉冲 2 × 700ms 后才翻面
const GACHA_DEAL_MS = 700; // 发牌入位后才开始翻面
const GACHA_RESULT_MS = GACHA_DEAL_MS + 400 + 9 * GACHA_FLIP_STAGGER + GACHA_SSR_AURA_MS + 900; // 翻面余量 900ms
const GACHA_COLLECTION_PAGE_SIZE = 30;

/** 卡背：暖黑 + 竖细纹 + 竖排品牌字 */
const GachaCardBack = ({ t }: { t: any }) => (
  <div className="gacha-card-back absolute inset-0 overflow-hidden ring-1 ring-line/70">
    <div className="absolute inset-2.5 border border-line/70" />
    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90 whitespace-nowrap label text-dim/45">
      {t.header.logo} · DAILY DRAW
    </span>
    <span className="absolute bottom-3.5 left-1/2 -translate-x-1/2 label text-accent/70">GR</span>
  </div>
);

/**
 * 闪卡：外层指针 tilt（±12°，spring 150/18）→ 内层翻面（spring 260/24）→
 * 正面三层视差（图 0 / foil 24px / glare 40px / 展签 12px）。
 * foil 强度分档：SSR 彩虹全开、SR 白炽一道、R 只有 glare。
 */
const GachaCard = ({
  card,
  t,
  revealed,
  flipDelay = 0,
  instant = false,
  interactive = true,
  celebrate = false,
  badge,
  onCardClick
}: {
  card: GachaCardData;
  t: any;
  revealed: boolean;
  flipDelay?: number;
  instant?: boolean;
  interactive?: boolean;
  celebrate?: boolean;
  badge?: string;
  onCardClick?: () => void;
}) => {
  const [loaded, setLoaded] = useState(false);
  const [flip, setFlip] = useState(false);
  const [shine, setShine] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const isSSR = card.rarity === 'SSR';
  const isSR = card.rarity === 'SR';

  // 翻面时序：信号到达后按 flipDelay 错峰；补发/卡册 instant 直接正脸无动画。
  // 图片加载完才翻（SSR 不能翻出空卡），faceVisible 同时门控两者。
  useEffect(() => {
    if (instant) {
      setFlip(true);
      return;
    }
    if (!revealed) return;
    const timer = window.setTimeout(() => setFlip(true), flipDelay);
    return () => window.clearTimeout(timer);
  }, [revealed, flipDelay, instant]);

  const rawRX = useMotionValue(0);
  const rawRY = useMotionValue(0);
  const rotateX = useSpring(rawRX, { stiffness: 150, damping: 18 });
  const rotateY = useSpring(rawRY, { stiffness: 150, damping: 18 });

  const faceVisible = flip && loaded;

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || !boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rawRY.set(px * 24);
    rawRX.set(-py * 24);
    boxRef.current.style.setProperty('--gx', `${(px + 0.5) * 100}%`);
    boxRef.current.style.setProperty('--gy', `${(py + 0.5) * 100}%`);
    const tilt = Math.min(Math.abs(px) + Math.abs(py), 1);
    boxRef.current.style.setProperty(
      '--foil-opacity',
      String(isSSR ? 0.3 + tilt * 0.45 : isSR ? 0.08 + tilt * 0.12 : 0.05)
    );
  };

  const handlePointerLeave = () => {
    rawRX.set(0);
    rawRY.set(0);
    if (boxRef.current) {
      boxRef.current.style.setProperty('--foil-opacity', isSSR ? '0.3' : isSR ? '0.08' : '0.05');
    }
  };

  const handleFlipDone = () => {
    if (!faceVisible) return;
    if (isSSR || isSR) setShine(true);
    // 撒花只在首抽 SSR 翻面时来一发
    if (isSSR && celebrate && !instant) {
      confetti({
        particleCount: 90,
        spread: 75,
        startVelocity: 38,
        origin: { y: 0.55 },
        colors: ['#FF2D55', '#E8C36A', '#FFFFFF'],
        zIndex: 90
      });
    }
  };

  const rarityRing = isSSR ? 'ring-accent/50' : isSR ? 'ring-bone/25' : 'ring-line';

  return (
    <div className="gacha-perspective">
      <motion.div
        ref={boxRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onClick={onCardClick}
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        className={`relative aspect-[3/4] w-full ${onCardClick ? 'cursor-pointer' : ''}`}
      >
        {/* SSR 翻面前的 accent 光晕脉冲（2 次 × 700ms，随翻面消失） */}
        {!instant && revealed && !flip && isSSR && (
          <div className="gacha-aura pointer-events-none absolute -inset-3 border border-accent/60 bg-accent/10" aria-hidden />
        )}

        {/* 翻面容器 */}
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={{ rotateY: faceVisible ? 0 : 180 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          style={{ transformStyle: 'preserve-3d' }}
          onAnimationComplete={handleFlipDone}
        >
          {/* 正面：三层视差 */}
          <div className="gacha-face absolute inset-0" style={{ transformStyle: 'preserve-3d' }}>
            <div className={`absolute inset-0 bg-surface ring-1 ${rarityRing}`}>
              {!loaded && <div className="skeleton absolute inset-0" />}
              <img
                src={card.resourceUrl}
                alt={card.author.name}
                referrerPolicy="no-referrer"
                loading="lazy"
                decoding="async"
                draggable={false}
                onLoad={() => setLoaded(true)}
                className={`absolute inset-0 h-full w-full select-none object-cover transition-opacity duration-500 ${
                  loaded ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </div>

            {(isSSR || isSR) && (
              <div
                className={`pointer-events-none absolute inset-0 ${isSSR ? 'gacha-foil' : 'gacha-foil-sr'}`}
                style={{ transform: 'translateZ(24px)' }}
              />
            )}

            <div className="gacha-glare pointer-events-none absolute inset-0" style={{ transform: 'translateZ(40px)' }} />

            {shine && (
              <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ transform: 'translateZ(42px)' }}>
                <div
                  className="gacha-shine absolute inset-y-0 left-0 w-1/3 bg-white/30"
                  onAnimationEnd={() => setShine(false)}
                />
              </div>
            )}

            {badge && (
              <span
                className="absolute left-3 top-3 label text-white/75 tabular-nums"
                style={{ transform: 'translateZ(12px)' }}
              >
                {badge}
              </span>
            )}

            <div
              className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2.5 pt-7"
              style={{ transform: 'translateZ(12px)' }}
            >
              <span className="truncate text-[10px] uppercase tracking-[0.14em] text-bone/85">{card.author.name}</span>
              <span className={`label shrink-0 ${isSSR ? 'text-accent' : isSR ? 'text-bone' : 'text-dim'}`}>
                {card.rarity}
              </span>
            </div>
          </div>

          {/* 卡背 */}
          <div className="gacha-face absolute inset-0" style={{ transform: 'rotateY(180deg)' }}>
            <GachaCardBack t={t} />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};

const GachaGrid = ({
  cards,
  revealed,
  instant = false,
  interactive = true,
  celebrate = false,
  onCardOpen,
  t
}: {
  cards: GachaCardData[];
  revealed: boolean;
  instant?: boolean;
  interactive?: boolean;
  celebrate?: boolean;
  onCardOpen?: (card: GachaCardData) => void;
  t: any;
}) => (
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 md:gap-4">
    {cards.map((card, i) => (
      <motion.div
        key={`${card.resourceUrl}-${i}`}
        initial={instant ? false : { opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: instant ? 0 : i * 0.05, ease: GACHA_CARD_EASE }}
      >
        <GachaCard
          card={card}
          t={t}
          revealed={revealed}
          instant={instant}
          interactive={interactive}
          celebrate={celebrate}
          // SSR 先播光晕脉冲（2×700ms）再翻面，其余按序错峰
          flipDelay={i * GACHA_FLIP_STAGGER + (card.rarity === 'SSR' ? GACHA_SSR_AURA_MS : 0)}
          onCardClick={onCardOpen ? () => onCardOpen(card) : undefined}
        />
      </motion.div>
    ))}
  </div>
);

/** 卡册：分页加载 + 稀有度筛选 + 统计条 + 图鉴完成度 */
const GachaCollection = ({
  onCardOpen,
  pool,
  t
}: {
  onCardOpen: (card: GachaCardData) => void;
  pool?: Record<string, number> | null;
  t: any;
}) => {
  const [list, setList] = useState<GachaCardData[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<GachaStats | null>(null);
  const [catalog, setCatalog] = useState<GachaCatalog | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<'all' | GachaRarity>('all');

  const load = useCallback(async (nextPage: number, append: boolean) => {
    append ? setLoadingMore(true) : setLoading(true);
    try {
      const data = await gachaFetch<{
        list: GachaCardData[];
        total: number;
        page: number;
        stats: GachaStats;
        catalog: GachaCatalog;
      }>(`collection?page=${nextPage}&pageSize=${GACHA_COLLECTION_PAGE_SIZE}`);
      setList(prev => (append ? [...prev, ...(data.list ?? [])] : data.list ?? []));
      setTotal(data.total ?? 0);
      setStats(data.stats ?? null);
      setCatalog(data.catalog ?? null);
      setPage(data.page ?? nextPage);
      setError(false);
    } catch {
      if (!append) setError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    load(1, false);
  }, [load]);

  const filtered = filter === 'all' ? list : list.filter(card => card.rarity === filter);
  const canLoadMore = list.length < total;
  const poolTotal = pool ? (pool.SSR ?? 0) + (pool.SR ?? 0) + (pool.R ?? 0) : 0;

  return (
    <section className="mx-auto w-full max-w-[1240px] px-5 py-10 md:px-10 md:py-12">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line/70 pb-5">
        <p className="label text-dim/60 tabular-nums">
          {stats
            ? t.gacha.statsTotal.replace('{days}', String(stats.totalDays)).replace('{cards}', String(stats.totalCards))
            : ''}
          {stats && (
            <span className="ml-4">
              <span className="text-gold">SSR {stats.ssr}</span>
              <span className="text-dim/40"> · </span>
              <span className="text-bone/80">SR {stats.sr}</span>
              <span className="text-dim/40"> · </span>
              <span className="text-dim">R {stats.r}</span>
            </span>
          )}
        </p>
        <div className="flex items-center gap-1.5">
          {(['all', 'SSR', 'SR', 'R'] as const).map(key => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`border px-3 py-1.5 label transition-colors ${
                filter === key
                  ? 'border-accent/60 bg-accent/10 text-accent'
                  : 'border-line text-dim hover:border-bone/30 hover:text-bone'
              }`}
            >
              {key === 'all' ? t.gacha.filterAll : key}
            </button>
          ))}
        </div>
      </div>

      {/* 图鉴完成度：卡册去重张数 vs 全站各档池存量 */}
      {catalog && (
        <div className="mt-5 border border-line/70 p-4 md:p-5">
          <div className="flex items-center justify-between gap-4">
            <p className="label text-dim/60">{t.gacha.catalogLabel}</p>
            <p className="label text-bone/85 tabular-nums">
              {poolTotal > 0
                ? t.gacha.catalogTotal
                    .replace('{current}', String(catalog.total))
                    .replace('{total}', String(poolTotal))
                : String(catalog.total)}
            </p>
          </div>
          {poolTotal > 0 && (
            <div className="mt-3 h-px w-full bg-line">
              <div
                className="h-px bg-gold transition-all duration-500"
                style={{ width: `${Math.min((catalog.total / poolTotal) * 100, 100)}%` }}
              />
            </div>
          )}
          {pool && poolTotal > 0 && (
            <p className="label mt-3 text-dim/50 tabular-nums">
              <span className="text-gold">SSR {catalog.ssr}/{pool.SSR ?? 0}</span>
              <span className="text-dim/40"> · </span>
              <span className="text-bone/80">SR {catalog.sr}/{pool.SR ?? 0}</span>
              <span className="text-dim/40"> · </span>
              <span className="text-dim">R {catalog.r}/{pool.R ?? 0}</span>
            </p>
          )}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 pt-8 sm:grid-cols-3 md:grid-cols-5 md:gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[3/4]" />
          ))}
        </div>
      ) : error ? (
        <button
          onClick={() => load(1, false)}
          className="mt-12 flex w-full flex-col items-center gap-4 border border-line/60 py-16 text-center transition-colors hover:border-bone/30"
        >
          <Lock className="h-6 w-6 text-dim/30" strokeWidth={1.25} />
          <p className="font-display text-2xl text-bone/80">{t.gacha.error}</p>
          <p className="label text-dim/50">{t.gacha.retry}</p>
        </button>
      ) : filtered.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center gap-4 border border-line/60 py-24 text-center">
          <Sparkles className="h-6 w-6 text-dim/30" strokeWidth={1.25} />
          <p className="font-display text-2xl text-bone/80">{t.gacha.collectionEmpty}</p>
          <p className="text-xs text-dim">{t.gacha.collectionEmptyHint}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 pt-8 sm:grid-cols-3 md:grid-cols-5 md:gap-4">
            {filtered.map((card, i) => (
              <GachaCard
                key={`${card.resourceUrl}-${i}`}
                card={card}
                t={t}
                revealed
                instant
                interactive={false}
                badge={card.drawDate}
                onCardClick={() => onCardOpen(card)}
              />
            ))}
          </div>
          {canLoadMore && (
            <div className="mt-12 flex justify-center">
              <button
                onClick={() => load(page + 1, true)}
                disabled={loadingMore}
                className="flex items-center gap-3 border border-line px-10 py-4 label text-dim transition-colors hover:border-bone/35 hover:text-bone disabled:opacity-50"
              >
                {loadingMore ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                {loadingMore ? t.main.loadingMore : t.main.loadMore}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
};

/** 把玩态：单卡大图 + 展签行 + 收藏/下载 */
const GachaPlayOverlay = ({
  card,
  liked,
  onToggleLike,
  notify,
  onClose,
  t
}: {
  card: GachaCardData;
  liked: string[];
  onToggleLike: (url: string, detail?: LikeSnapshot) => void;
  notify: (msg: string) => void;
  onClose: () => void;
  t: any;
}) => {
  const isLiked = liked.includes(card.resourceUrl);

  const handleDownload = useCallback(async () => {
    await downloadImage(card.resourceUrl, `girls-rating-card-${card.rarity}-${Date.now()}.jpg`);
  }, [card]);

  const handleShare = useCallback(async () => {
    await shareCardImage(card, notify, t.gacha.shareSaved, t.gacha.shareFail);
  }, [card, notify, t]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={onClose}
      className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-7 overflow-y-auto bg-canvas/95 p-6 backdrop-blur-xl"
    >
      <div className="gacha-perspective w-full max-w-[360px] shrink-0" onClick={e => e.stopPropagation()}>
        <GachaCard card={card} t={t} revealed instant interactive />
      </div>

      <div
        className="flex w-full max-w-md flex-col gap-4 border-t border-line/60 pt-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          {card.author.avatar ? (
            <img
              src={card.author.avatar}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-line"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="h-9 w-9 shrink-0 rounded-full bg-surface ring-1 ring-line" />
          )}
          <div className="min-w-0">
            <p className="truncate font-display text-lg leading-none">{card.author.name}</p>
            <p className="label mt-1 text-dim/55">{t.modal.verified}</p>
          </div>
          <span
            className={`ml-auto shrink-0 label ${
              card.rarity === 'SSR' ? 'text-gold' : card.rarity === 'SR' ? 'text-bone/80' : 'text-dim'
            }`}
          >
            {card.rarity}
          </span>
        </div>

        <dl className="grid grid-cols-3 gap-x-4">
          {[
            { k: t.gacha.playRating, v: String(card.rating) },
            { k: t.modal.views, v: card.views },
            { k: t.gacha.playDate, v: card.drawDate ?? '—' }
          ].map(row => (
            <div key={row.k} className="min-w-0">
              <dt className="label text-dim/40">{row.k}</dt>
              <dd className="mt-1 truncate text-[13px] text-bone/85 tabular-nums">{row.v}</dd>
            </div>
          ))}
        </dl>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              onToggleLike(card.resourceUrl, card);
              notify(isLiked ? t.modal.unliked : t.modal.liked);
            }}
            className={`flex flex-1 items-center justify-center gap-2.5 border px-4 py-3 label transition-colors ${
              isLiked
                ? 'border-accent/60 bg-accent/10 text-accent'
                : 'border-line text-dim hover:border-bone/30 hover:text-bone'
            }`}
          >
            <Heart className={`h-3.5 w-3.5 ${isLiked ? 'fill-current' : ''}`} />
            {isLiked ? t.modal.unliked : t.modal.like}
          </button>
          <button
            onClick={handleDownload}
            className="flex flex-1 items-center justify-center gap-2.5 border border-line px-4 py-3 label text-dim transition-colors hover:border-bone/30 hover:text-bone"
          >
            <Download className="h-3.5 w-3.5" />
            {t.modal.download}
          </button>
          <button
            onClick={handleShare}
            aria-label={t.gacha.share}
            title={t.gacha.share}
            className="grid h-11 w-11 shrink-0 place-items-center border border-line text-dim transition-colors hover:border-bone/30 hover:text-bone"
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            aria-label={t.modal.close}
            className="grid h-11 w-11 shrink-0 place-items-center border border-line text-dim transition-colors hover:border-accent hover:text-accent"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

/** 分享卡面：Canvas 2D 合成闪卡图（cover 裁切 + 稀有度框 + foil 近似 + 展签 + 水印）→ PNG */
const RARITY_COLORS: Record<GachaRarity, string> = {
  R: '#8b857b',
  SR: '#ece8e1',
  SSR: '#ff2d55'
};

const renderCardImage = async (card: GachaCardData): Promise<Blob> => {
  const W = 900;
  const H = 1200;

  // 先取 blob 再解码，避免 canvas 被跨域像素污染
  const res = await fetch(card.resourceUrl, { mode: 'cors' });
  if (!res.ok) throw new Error('image fetch failed');
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');

  // 底色 + cover 裁切绘制
  ctx.fillStyle = '#0a0908';
  ctx.fillRect(0, 0, W, H);
  const scale = Math.max(W / bitmap.width, H / bitmap.height);
  const dw = bitmap.width * scale;
  const dh = bitmap.height * scale;
  ctx.drawImage(bitmap, (W - dw) / 2, (H - dh) / 2, dw, dh);
  bitmap.close();

  // foil 近似：SSR 彩虹斜纹 / SR 一道白炽（canvas 无 blend-dodge，用低透明度叠加模拟）
  if (card.rarity === 'SSR') {
    const foil = ctx.createLinearGradient(0, H, W, 0);
    foil.addColorStop(0, 'rgba(255,45,85,0.20)');
    foil.addColorStop(0.25, 'rgba(232,195,106,0.20)');
    foil.addColorStop(0.5, 'rgba(124,212,253,0.20)');
    foil.addColorStop(0.75, 'rgba(183,134,251,0.20)');
    foil.addColorStop(1, 'rgba(255,45,85,0.20)');
    ctx.fillStyle = foil;
    ctx.fillRect(0, 0, W, H);
  } else if (card.rarity === 'SR') {
    const foil = ctx.createLinearGradient(0, H, W, 0);
    foil.addColorStop(0.35, 'rgba(255,255,255,0)');
    foil.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    foil.addColorStop(0.65, 'rgba(255,255,255,0)');
    ctx.fillStyle = foil;
    ctx.fillRect(0, 0, W, H);
  }

  // 底部展签
  const labelH = 150;
  const labelGrad = ctx.createLinearGradient(0, H - labelH, 0, H);
  labelGrad.addColorStop(0, 'rgba(10,9,8,0)');
  labelGrad.addColorStop(1, 'rgba(10,9,8,0.9)');
  ctx.fillStyle = labelGrad;
  ctx.fillRect(0, H - labelH, W, labelH);

  ctx.fillStyle = '#ece8e1';
  ctx.font = '600 30px Inter, sans-serif';
  ctx.fillText(card.author.name, 44, H - 88);
  ctx.fillStyle = '#8b857b';
  ctx.font = '500 18px Inter, sans-serif';
  ctx.fillText(`RATING ${card.rating} · VIEWS ${card.views}`, 44, H - 52);

  // 稀有度徽章
  ctx.font = '600 22px Inter, sans-serif';
  const badge = card.rarity;
  const badgeW = ctx.measureText(badge).width + 36;
  ctx.fillStyle = RARITY_COLORS[card.rarity];
  ctx.fillText(badge, W - 44 - ctx.measureText(badge).width, H - 88);
  ctx.strokeStyle = RARITY_COLORS[card.rarity];
  ctx.lineWidth = 2;
  ctx.strokeRect(W - 44 - badgeW, H - 116, badgeW, 42);

  // 顶部品牌 + 稀有度边框
  ctx.fillStyle = 'rgba(236,232,225,0.85)';
  ctx.font = '600 20px Inter, sans-serif';
  ctx.fillText('GIRLS RATING · DAILY DRAW', 44, 56);
  ctx.strokeStyle = RARITY_COLORS[card.rarity];
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, W - 6, H - 6);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/png'
    );
  });
};

const shareCardImage = async (card: GachaCardData, notify?: (msg: string) => void, savedMsg?: string, failMsg?: string) => {
  try {
    const blob = await renderCardImage(card);
    const file = new File([blob], `girls-rating-${card.rarity}-card.png`, { type: 'image/png' });

    // 优先系统分享（移动端），否则落到下载
    const nav = navigator as Navigator & {
      canShare?: (data: { files?: File[] }) => boolean;
    };
    if (nav.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title: `Girls Rating · ${card.rarity}` });
    } else {
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    }
    notify?.(savedMsg ?? '');
  } catch {
    notify?.(failMsg ?? '');
  }
};

/** 每日弹窗：每天最多出现一次，两按钮都写入 gr-gacha-popup-last */
const GachaPromoModal = ({ onGo, onSkip, t }: { onGo: () => void; onSkip: () => void; t: any }) => (
  <ModalShell onClose={onSkip}>
    <ModalHeader title={t.gacha.popupTitle} subtitle={t.gacha.title} onClose={onSkip} />
    <div className="px-6 py-6 md:px-8">
      <p className="text-[13px] leading-relaxed text-dim">{t.gacha.popupBody}</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          onClick={onGo}
          className="flex items-center justify-center gap-2.5 bg-accent px-6 py-3.5 label text-white transition-colors hover:bg-[#e6294d]"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {t.gacha.popupGo}
        </button>
        <button
          onClick={onSkip}
          className="border border-line px-6 py-3.5 label text-dim transition-colors hover:border-bone/40 hover:text-bone"
        >
          {t.gacha.popupSkip}
        </button>
      </div>
    </div>
  </ModalShell>
);

/**
 * 抽卡页：全屏覆盖层 z-[80]（AboutPage 之上、AgeGate 之下），不走路由。
 * 舞台状态机 loading → ready → drawing → deal → reveal → result / error；
 * 补发（replayed）直接进 result，无动画。
 */
const GachaPage = ({
  onClose,
  autoDraw,
  liked,
  onToggleLike,
  notify,
  onDrawnDate,
  t
}: {
  onClose: () => void;
  autoDraw: boolean;
  liked: string[];
  onToggleLike: (url: string, detail?: LikeSnapshot) => void;
  notify: (msg: string) => void;
  onDrawnDate?: (date: string) => void;
  t: any;
}) => {
  const [tab, setTab] = useState<'stage' | 'collection'>('stage');
  const [phase, setPhase] = useState<'loading' | 'ready' | 'drawing' | 'deal' | 'reveal' | 'result' | 'error'>(
    'loading'
  );
  const [cards, setCards] = useState<GachaCardData[]>([]);
  const [date, setDate] = useState('');
  const [replayed, setReplayed] = useState(false);
  const [cacheNote, setCacheNote] = useState(false);
  const [stats, setStats] = useState<GachaStats | null>(null);
  const [probabilities, setProbabilities] = useState<Record<string, number> | null>(null);
  const [pool, setPool] = useState<Record<string, number> | null>(null);
  const [playCard, setPlayCard] = useState<GachaCardData | null>(null);
  const drawingRef = useRef(false);
  const autoDrawRef = useRef(false);

  // 锁 body 滚动（AboutPage 同款）
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Esc：先退把玩态，再退抽卡页
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (playCard) setPlayCard(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, playCard]);

  const showCachedCards = () => {
    try {
      const raw = localStorage.getItem(GACHA_CACHE_KEY);
      if (!raw) return false;
      const cached = JSON.parse(raw) as { date: string; cards: GachaCardData[] };
      if (!cached.cards?.length) return false;
      setCards(cached.cards);
      setDate(cached.date);
      setStats(summarizeCards(cached.cards));
      setReplayed(true);
      setCacheNote(true);
      setPhase('result');
      return true;
    } catch {
      return false;
    }
  };

  // 进入时调 status：未抽 → 舞台待机；已抽 → 直接展示今日卡牌
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await gachaFetch<GachaStatusResult>('status');
        if (cancelled) return;
        setProbabilities(data.probabilities ?? null);
        setStats(data.stats ?? null);
        setPool(data.pool ?? null);
        setDate(data.date);
        if (data.drawnToday && data.cards?.length) {
          setCards(data.cards);
          setReplayed(true);
          setPhase('result');
        } else {
          setPhase('ready');
        }
      } catch {
        if (cancelled) return;
        // 接口失败：有本地快照就兜底展示，否则进错误态
        if (!showCachedCards()) setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDraw = useCallback(async () => {
    if (drawingRef.current) return;
    drawingRef.current = true;
    setCacheNote(false);
    setPhase('drawing');
    try {
      const data = await gachaFetch<{
        date: string;
        replayed: boolean;
        cards: GachaCardData[];
        stats: GachaStats;
      }>('draw', { method: 'POST' });

      setCards(data.cards ?? []);
      setDate(data.date);
      setStats(data.stats ?? summarizeCards(data.cards ?? []));
      onDrawnDate?.(data.date);

      if (data.replayed) {
        // 当日已抽：补发快照，跳过动画直接进展示态
        setReplayed(true);
        setPhase('result');
      } else {
        setReplayed(false);
        setPhase('deal');
        window.setTimeout(() => setPhase('reveal'), GACHA_DEAL_MS);
        window.setTimeout(() => setPhase('result'), GACHA_RESULT_MS);
        try {
          localStorage.setItem(GACHA_CACHE_KEY, JSON.stringify({ date: data.date, cards: data.cards }));
        } catch {
          /* ignore */
        }
      }
    } catch {
      setReplayed(false);
      if (!showCachedCards()) setPhase('error');
    } finally {
      drawingRef.current = false;
    }
  }, [onDrawnDate]);

  // 每日弹窗「去抽一发」：进入即自动开抽
  useEffect(() => {
    if (autoDraw && phase === 'ready' && !autoDrawRef.current) {
      autoDrawRef.current = true;
      handleDraw();
    }
  }, [autoDraw, phase, handleDraw]);

  const summaryText = stats
    ? t.gacha.summary
        .replace('{ssr}', String(stats.ssr))
        .replace('{sr}', String(stats.sr))
        .replace('{r}', String(stats.r))
    : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.35, ease: GACHA_CARD_EASE }}
      className="fixed inset-0 z-[80] overflow-y-auto overscroll-contain bg-canvas"
    >
      <div className="grain-overlay" aria-hidden />

      {/* 顶栏：返回 + 视图切换 + 关闭 */}
      <div className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line/70 bg-canvas/90 px-5 backdrop-blur-xl md:px-10">
        <button
          onClick={onClose}
          className="group flex items-center gap-2.5 label text-dim transition-colors hover:text-bone"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          {t.about.back}
        </button>

        <div className="flex items-center gap-6">
          {(['stage', 'collection'] as const).map(key => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`relative py-1.5 label transition-colors ${
                tab === key ? 'text-bone' : 'text-dim hover:text-bone'
              }`}
            >
              {key === 'stage' ? t.gacha.tabStage : t.gacha.tabCollection}
              {tab === key && (
                <motion.span
                  layoutId="gacha-tab-underline"
                  className="absolute inset-x-0 -bottom-px h-px bg-accent"
                  transition={{ type: 'spring', stiffness: 480, damping: 42 }}
                />
              )}
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          aria-label={t.modal.close}
          className="grid h-8 w-8 place-items-center border border-line text-dim transition-colors hover:border-accent hover:text-accent"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {tab === 'stage' ? (
        <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[1240px] flex-col items-center justify-center px-5 py-10 md:px-10">
          {phase === 'loading' && <div className="skeleton aspect-[3/4] w-52 md:w-60" />}

          {(phase === 'ready' || phase === 'drawing') && (
            <div className="flex flex-col items-center gap-9 text-center">
              <p className="label text-dim/60">{t.gacha.subtitle}</p>

              {/* 待机卡堆：无指针时缓慢摆动，开抽时散开 */}
              <div className="gacha-perspective">
                <div className="gacha-idle relative h-60 w-44 md:h-72 md:w-52" style={{ transformStyle: 'preserve-3d' }}>
                  {[10, 5, 0].map((offset, i) => (
                    <motion.div
                      key={i}
                      className="absolute inset-0"
                      animate={{
                        rotate: offset * (phase === 'drawing' ? 2.2 : 1),
                        x: offset * (phase === 'drawing' ? 5 : 1),
                        y: i * -4
                      }}
                      transition={{ duration: 0.5, ease: GACHA_CARD_EASE }}
                    >
                      <div className="absolute inset-0 border border-line/70 bg-surface" />
                    </motion.div>
                  ))}
                  <div className="absolute inset-0">
                    <GachaCardBack t={t} />
                  </div>
                </div>
              </div>

              <button
                onClick={handleDraw}
                disabled={phase === 'drawing'}
                className="flex items-center gap-3 bg-accent px-12 py-4 label text-white transition-colors hover:bg-[#e6294d] disabled:opacity-60"
              >
                <Sparkles className={`h-3.5 w-3.5 ${phase === 'drawing' ? 'animate-pulse' : ''}`} />
                {phase === 'drawing' ? t.gacha.drawing : t.gacha.draw}
              </button>

              <p className="label text-dim/45">
                {t.gacha.stageHint}
                {probabilities && (
                  <span className="ml-3 text-dim/70 tabular-nums">
                    {t.gacha.oddsLabel} R {probabilities.R} · SR {probabilities.SR} · SSR {probabilities.SSR}
                  </span>
                )}
              </p>
            </div>
          )}

          {(phase === 'deal' || phase === 'reveal' || phase === 'result') && (
            <div className="w-full">
              <div className="mb-8 flex flex-col items-center gap-3 text-center">
                {phase !== 'result' ? (
                  <p className="label text-dim/60">{t.gacha.drawing}</p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
                      <span className="label text-bone/85 tabular-nums">{summaryText}</span>
                      <span className="label text-dim/50 tabular-nums">
                        {date}
                        {replayed && ` · ${t.gacha.replayBadge}`}
                      </span>
                    </div>
                    <p className="label text-dim/45">{replayed ? t.gacha.stageHint : t.gacha.tomorrow}</p>
                    {cacheNote && <p className="label text-dim/40">{t.gacha.cacheNote}</p>}
                  </>
                )}
              </div>
              <div className="mx-auto max-w-[1080px]">
                <GachaGrid
                  cards={cards}
                  revealed={phase !== 'deal'}
                  interactive
                  celebrate={!replayed}
                  onCardOpen={setPlayCard}
                  t={t}
                />
              </div>
            </div>
          )}

          {phase === 'error' && (
            <button
              onClick={handleDraw}
              className="flex flex-col items-center gap-5 border border-line/60 px-16 py-16 text-center transition-colors hover:border-bone/30"
            >
              <Lock className="h-6 w-6 text-dim/30" strokeWidth={1.25} />
              <p className="font-display text-2xl text-bone/80">{t.gacha.error}</p>
              <p className="label text-dim/50">{t.gacha.retry}</p>
            </button>
          )}
        </section>
      ) : (
        <GachaCollection onCardOpen={setPlayCard} pool={pool} t={t} />
      )}

      {/* 把玩态（闪卡核心交互） */}
      <AnimatePresence>
        {playCard && (
          <GachaPlayOverlay
            card={playCard}
            liked={liked}
            onToggleLike={onToggleLike}
            notify={notify}
            onClose={() => setPlayCard(null)}
            t={t}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// --- Main App ---

export default function App() {
  const [isAged, setIsAged] = useState(false);
  const [isQAOpen, setIsQAOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isFunnyOpen, setIsFunnyOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [lang, setLang] = useState<Language>('zh');
  const [activeCategory, setActiveCategory] = useState<Category>('hot');
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [images, setImages] = useState<CosplayImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [toast, setToast] = useState<{ msg: string; k: number } | null>(null);
  const [direction, setDirection] = useState(1);
  const [liked, setLiked] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('gr-likes');
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  // 收藏快照（宽高/作者/档位），收藏夹页渲染用；旧版 gr-likes 只有 url，走占位快照
  const [likeDetails, setLikeDetails] = useState<Record<string, LikeDetail>>(() => {
    try {
      const raw = localStorage.getItem(LIKE_DETAILS_KEY);
      return raw ? (JSON.parse(raw) as Record<string, LikeDetail>) : {};
    } catch {
      return {};
    }
  });
  const [isImmersiveOpen, setIsImmersiveOpen] = useState(false);
  const [immersiveStart, setImmersiveStart] = useState(0);
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [authorView, setAuthorView] = useState<{ id: number; name: string; avatar: string } | null>(null);
  // Lightbox 的图片集合：画廊来源为空数组（回落 images），收藏夹/作者专区来源为对应列表
  const [lightboxImages, setLightboxImages] = useState<CosplayImage[]>([]);
  const [isGachaOpen, setIsGachaOpen] = useState(false);
  const [isGachaPromoOpen, setIsGachaPromoOpen] = useState(false);
  const [gachaAutoDraw, setGachaAutoDraw] = useState(false);
  const [gachaStatus, setGachaStatus] = useState<GachaStatusResult | null>(null);

  const t = translations[lang];
  const columns = useColumnCount();
  const laidOut = useMemo(() => columnize(images, columns), [images, columns]);
  const indexMap = useMemo(
    () => new Map(images.map((img, i) => [img.resourceUrl, i])),
    [images]
  );

  useEffect(() => {
    try {
      localStorage.setItem('gr-likes', JSON.stringify(liked));
    } catch {
      /* ignore */
    }
  }, [liked]);

  useEffect(() => {
    try {
      localStorage.setItem(LIKE_DETAILS_KEY, JSON.stringify(likeDetails));
    } catch {
      /* ignore */
    }
  }, [likeDetails]);

  // <html lang> 跟着界面语言走，初始值与 index.html 的 lang="zh-CN" 对齐
  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);

  // 年龄门未通过时锁住背景滚动（内容已挂载但被覆盖层盖住）
  useEffect(() => {
    if (isAged) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isAged]);

  const notify = useCallback((msg: string) => setToast({ msg, k: Date.now() }), []);

  // 抽卡：年龄门通过后拉一次 status —— 入口按钮两态 + 每日弹窗判定。
  // 弹窗条件（docs/gacha-design.md §4.2）：未抽 + 当日未弹过；status 失败静默不弹。
  useEffect(() => {
    if (!isAged) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await gachaFetch<GachaStatusResult>('status');
        if (cancelled) return;
        setGachaStatus(data);
        let last = '';
        try {
          last = localStorage.getItem(GACHA_POPUP_KEY) ?? '';
        } catch {
          /* ignore */
        }
        if (!data.drawnToday && last !== data.date) {
          window.setTimeout(() => {
            if (!cancelled) setIsGachaPromoOpen(true);
          }, 1200);
        }
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAged]);

  const closeGachaPromo = useCallback(() => {
    setIsGachaPromoOpen(false);
    if (gachaStatus?.date) {
      try {
        localStorage.setItem(GACHA_POPUP_KEY, gachaStatus.date);
      } catch {
        /* ignore */
      }
    }
  }, [gachaStatus]);

  const openGacha = useCallback((autoDraw: boolean) => {
    closeGachaPromo();
    setGachaAutoDraw(autoDraw);
    setIsGachaOpen(true);
  }, [closeGachaPromo]);

  const handleGachaDrawnDate = useCallback((date: string) => {
    setGachaStatus(prev => (prev ? { ...prev, drawnToday: true, date } : prev));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(id);
  }, [toast]);

  const load = useCallback(async (cat: Category, nextPage: number, append: boolean) => {
    if (cat !== 'hot' && cat !== 'latest') return;
    append ? setIsLoadingMore(true) : setIsLoading(true);

    try {
      const url =
        cat === 'latest'
          ? `${API_BASE_URL}/cosplay?page=${nextPage}&pageSize=${PAGE_SIZE}`
          : `${API_BASE_URL}/random`;
      const response = await fetch(url);
      const result = await response.json();

      if (result.code === 200) {
        if (cat === 'latest') {
          setImages(prev => (append ? [...prev, ...result.data.list] : result.data.list));
          setTotalPages(result.data.totalPage);
          setPage(result.data.currPage);
        } else {
          setImages(result.data);
          setTotalPages(1);
          setPage(1);
        }
      } else if (!append) {
        setImages([]);
      }
    } catch (error) {
      console.error('Failed to fetch images:', error);
      if (!append) {
        setImages([]);
        setTotalPages(0);
        setPage(0);
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    setSelectedImageId(null);
    setLightboxImages([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    load(activeCategory, 1, false);
  }, [activeCategory, load]);

  // Lightbox 图片集合：收藏夹/作者专区来源用列表，画廊来源回落 images
  const lightboxSource = lightboxImages.length > 0 ? lightboxImages : images;

  const selectedImage = useMemo(
    () => lightboxSource.find(img => img.resourceUrl === selectedImageId) || null,
    [selectedImageId, lightboxSource]
  );

  const handleNext = useCallback(() => {
    if (!selectedImageId || lightboxSource.length === 0) return;
    const currentIndex = lightboxSource.findIndex(img => img.resourceUrl === selectedImageId);
    setDirection(1);
    setSelectedImageId(lightboxSource[(currentIndex + 1) % lightboxSource.length].resourceUrl);
  }, [selectedImageId, lightboxSource]);

  const handlePrev = useCallback(() => {
    if (!selectedImageId || lightboxSource.length === 0) return;
    const currentIndex = lightboxSource.findIndex(img => img.resourceUrl === selectedImageId);
    setDirection(-1);
    setSelectedImageId(lightboxSource[(currentIndex - 1 + lightboxSource.length) % lightboxSource.length].resourceUrl);
  }, [selectedImageId, lightboxSource]);

  const scrollTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const refresh = useCallback(() => {
    load(activeCategory, 1, false);
    if (activeCategory === 'latest') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeCategory, load]);

  const toggleLike = useCallback(
    (url: string, detail?: LikeSnapshot) => {
      const isLiked = liked.includes(url);
      setLiked(prev => (isLiked ? prev.filter(u => u !== url) : [...prev, url]));
      setLikeDetails(prev => {
        if (isLiked) {
          const next = { ...prev };
          delete next[url];
          return next;
        }
        return {
          ...prev,
          [url]: {
            url,
            likedAt: Date.now(),
            ...(detail ?? { width: 0, height: 0, rating: 0, views: '', author: { name: '—', avatar: '' } })
          }
        };
      });
    },
    [liked]
  );

  // 收藏夹数据源：按 likedAt 倒序；旧版只有 url 的条目用占位快照兜底
  const favoriteDetails = useMemo<LikeDetail[]>(
    () =>
      liked
        .map(url => {
          const detail = likeDetails[url];
          if (detail) return detail;
          return {
            url,
            likedAt: 0,
            width: 0,
            height: 0,
            rating: 0,
            views: '',
            author: { name: '—', avatar: '' }
          } as LikeDetail;
        })
        .sort((a, b) => b.likedAt - a.likedAt),
    [liked, likeDetails]
  );

  const favoriteImages = useMemo<CosplayImage[]>(
    () =>
      favoriteDetails.map(d => ({
        id: '',
        resourceUrl: d.url,
        width: d.width,
        height: d.height,
        rating: d.rating,
        views: d.views,
        rarity: d.rarity,
        author: d.author
      })),
    [favoriteDetails]
  );

  const closeLightbox = useCallback(() => {
    setSelectedImageId(null);
    setLightboxImages([]);
  }, []);

  const openFromList = useCallback((list: CosplayImage[], url: string) => {
    setLightboxImages(list);
    setSelectedImageId(url);
  }, []);

  const openImmersive = useCallback(
    (startIndex: number) => {
      if (images.length === 0) return;
      setImmersiveStart(Math.max(0, Math.min(startIndex, images.length - 1)));
      setIsImmersiveOpen(true);
    },
    [images.length]
  );

  const enterImmersiveFromLightbox = useCallback(() => {
    const idx = images.findIndex(img => img.resourceUrl === selectedImageId);
    closeLightbox();
    openImmersive(Math.max(0, idx));
  }, [images, selectedImageId, closeLightbox, openImmersive]);

  const openAuthor = useCallback((author: CosplayImage['author']) => {
    if (!author.id) return;
    setAuthorView({ id: author.id, name: author.name, avatar: author.avatar });
  }, []);

  const openAuthorImage = useCallback(
    (url: string, list: CosplayImage[]) => {
      setAuthorView(null);
      openFromList(list, url);
    },
    [openFromList]
  );

  const canLoadMore = activeCategory === 'latest' && page < totalPages;

  // activeCategory 只会是 hot / latest（qa、funny 只开弹窗），这里收窄类型
  const collectionTitle =
    activeCategory === 'latest' ? t.main.collectionTitles.latest : t.main.collectionTitles.hot;

  return (
    <div className="min-h-screen bg-canvas font-sans">
      <div className="grain-overlay" aria-hidden />

      <AnimatePresence>{!isAged && <AgeGate onAccept={() => setIsAged(true)} t={t} />}</AnimatePresence>

      <AnimatePresence>{isQAOpen && <QAModal onClose={() => setIsQAOpen(false)} t={t} />}</AnimatePresence>

      <AnimatePresence>
        {isAboutOpen && (
          <AboutPage
            onClose={() => setIsAboutOpen(false)}
            onOpenQA={() => setIsQAOpen(true)}
            onOpenTerms={() => setIsTermsOpen(true)}
            onOpenPrivacy={() => setIsPrivacyOpen(true)}
            onOpenSupport={() => setIsSupportOpen(true)}
            blocked={isQAOpen || isTermsOpen || isPrivacyOpen || isSupportOpen}
            t={t}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isFunnyOpen && <FunnyModal onClose={() => setIsFunnyOpen(false)} lang={lang} t={t} />}
      </AnimatePresence>

      {/* 内容始终挂载：年龄门只是覆盖层，爬虫无需点击也能拿到完整 DOM */}
      <div inert={!isAged} aria-hidden={!isAged}>
          <Header
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            onOpenQA={() => setIsQAOpen(true)}
            onOpenFunny={() => setIsFunnyOpen(true)}
            onOpenAbout={() => setIsAboutOpen(true)}
            onOpenImmersive={() => openImmersive(0)}
            onOpenFavorites={() => setIsFavoritesOpen(true)}
            lang={lang}
            onLangChange={setLang}
            t={t}
          />

          <SideRail onTop={scrollTop} onRefresh={refresh} isLoading={isLoading} t={t} />

          <main>
            {/* 给读屏软件与爬虫准备的正文摘要（与关于页同源，不是隐藏关键词） */}
            <section className="sr-only">
              <h1>
                {t.main.title} — {t.main.collectionTitles.hot}
              </h1>
              <p>{t.main.description}</p>
              <p>{t.about.lead}</p>
              <h2>{t.about.sections[0].title}</h2>
              <p>{t.about.sections[0].body[0]}</p>
              <h2>{t.about.sections[1].title}</h2>
              <p>{t.about.sections[1].body[0]}</p>
            </section>

            <Masthead
              activeCategory={activeCategory}
              count={images.length}
              page={page}
              totalPages={totalPages}
              onRefresh={() => load('hot', 1, false)}
              isLoading={isLoading}
              gachaLabel={gachaStatus?.drawnToday ? t.gacha.entryDone : t.gacha.entry}
              onOpenGacha={() => openGacha(false)}
              t={t}
            />

            <section className="mx-auto max-w-[1680px] px-5 py-7 md:px-10 md:py-12 lg:px-16">
              {isLoading ? (
                <GallerySkeleton columns={columns} />
              ) : images.length > 0 ? (
                <>
                  <Gallery
                    columns={laidOut}
                    indexMap={indexMap}
                    onOpen={setSelectedImageId}
                    onOpenAuthor={openAuthor}
                    t={t}
                  />

                  {activeCategory === 'latest' && (
                    <div className="mt-14 flex flex-col items-center gap-5">
                      {canLoadMore ? (
                        <button
                          onClick={() => load('latest', page + 1, true)}
                          disabled={isLoadingMore}
                          className="group flex items-center gap-3 border border-line px-10 py-4 label text-dim transition-colors hover:border-bone/35 hover:text-bone disabled:opacity-50"
                        >
                          {isLoadingMore ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                          {isLoadingMore ? t.main.loadingMore : t.main.loadMore}
                        </button>
                      ) : (
                        <p className="label text-dim/40">{t.main.end}</p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center gap-4 border border-line/60 py-28 text-center">
                  <Lock className="h-6 w-6 text-dim/30" strokeWidth={1.25} />
                  <p className="font-display text-2xl text-bone/80">{t.main.empty}</p>
                  <p className="text-xs text-dim">{t.main.emptyHint}</p>
                </div>
              )}
            </section>
          </main>

          <footer className="mt-16 border-t border-line/70">
            <div className="mx-auto max-w-[1680px] px-5 py-10 md:px-10 md:py-12 lg:px-16">
              <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
                <div className="flex items-center gap-4">
                  <img
                    src={LOGO_URL}
                    alt="Girls Rating"
                    className="h-10 w-10 rounded-full object-cover ring-1 ring-line"
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <p className="font-display text-xl leading-none">{t.header.logo}</p>
                    <p className="label mt-2 text-dim/60">{t.ageGate.footer}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
                  <a
                    href="https://github.com/embarce/girls-rating-web"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 label text-dim transition-colors hover:text-bone"
                  >
                    <GitHubMark className="h-3.5 w-3.5" />
                    {t.footer.github}
                    <span className="text-accent">★</span>
                  </a>
                  <button
                    onClick={() => setIsAboutOpen(true)}
                    className="label text-dim transition-colors hover:text-bone"
                  >
                    {t.about.nav}
                  </button>
                  <button
                    onClick={() => setIsTermsOpen(true)}
                    className="label text-dim transition-colors hover:text-bone"
                  >
                    {t.footer.terms}
                  </button>
                  <button
                    onClick={() => setIsPrivacyOpen(true)}
                    className="label text-dim transition-colors hover:text-bone"
                  >
                    {t.footer.privacy}
                  </button>
                  <button
                    onClick={() => setIsSupportOpen(true)}
                    className="label text-dim transition-colors hover:text-bone"
                  >
                    {t.footer.support}
                  </button>
                  <span className="flex items-center gap-2 label text-dim/50">
                    <Eye className="h-3 w-3" />
                    {t.main.privateSession}
                  </span>
                </div>
              </div>

              <div className="mt-10 flex flex-col gap-2 border-t border-line/50 pt-6 md:flex-row md:items-center md:justify-between">
                <p className="label text-dim/40">{t.footer.colophon}</p>
                <p className="label text-dim/40">© 2026 GIRLS RATING GROUP</p>
              </div>
            </div>
          </footer>
      </div>

      <AnimatePresence>
        {selectedImage && (
          <Lightbox
            image={selectedImage}
            images={lightboxSource}
            onClose={closeLightbox}
            onNext={handleNext}
            onPrev={handlePrev}
            onSelect={setSelectedImageId}
            t={t}
            liked={liked}
            onToggleLike={toggleLike}
            notify={notify}
            direction={direction}
            collectionTitle={collectionTitle}
            blocked={!!authorView}
            onOpenAuthor={openAuthor}
            onEnterImmersive={lightboxImages.length === 0 ? enterImmersiveFromLightbox : undefined}
            onOpenGacha={() => {
              closeLightbox();
              openGacha(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* 沉浸模式：z-[75]，Lightbox 之上、GachaPage 之下 */}
      <AnimatePresence>
        {isImmersiveOpen && (
          <ImmersiveFeed
            mode={activeCategory === 'latest' ? 'latest' : 'hot'}
            initialImages={images}
            startIndex={immersiveStart}
            initialPage={page}
            initialTotalPages={totalPages}
            liked={liked}
            onToggleLike={toggleLike}
            notify={notify}
            onClose={() => setIsImmersiveOpen(false)}
            t={t}
          />
        )}
      </AnimatePresence>

      {/* 收藏夹页 */}
      <AnimatePresence>
        {isFavoritesOpen && (
          <FavoritesPage
            onClose={() => setIsFavoritesOpen(false)}
            details={favoriteDetails}
            onOpenImage={url => {
              setIsFavoritesOpen(false);
              openFromList(favoriteImages, url);
            }}
            t={t}
          />
        )}
      </AnimatePresence>

      {/* 作者专区 */}
      <AnimatePresence>
        {authorView && (
          <AuthorPage
            author={authorView}
            onClose={() => setAuthorView(null)}
            onOpenImage={openAuthorImage}
            t={t}
          />
        )}
      </AnimatePresence>

      {/* 抽卡页：层级在 AboutPage(z-70) 之上、AgeGate(z-100) 之下 */}
      <AnimatePresence>
        {isGachaOpen && (
          <GachaPage
            onClose={() => {
              setIsGachaOpen(false);
              setGachaAutoDraw(false);
            }}
            autoDraw={gachaAutoDraw}
            liked={liked}
            onToggleLike={toggleLike}
            notify={notify}
            onDrawnDate={handleGachaDrawnDate}
            t={t}
          />
        )}
      </AnimatePresence>

      {/* 每日抽卡弹窗 */}
      <AnimatePresence>
        {isGachaPromoOpen && (
          <GachaPromoModal onGo={() => openGacha(true)} onSkip={closeGachaPromo} t={t} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSupportOpen && <SupportModal onClose={() => setIsSupportOpen(false)} notify={notify} t={t} />}
      </AnimatePresence>

      <AnimatePresence>
        {isPrivacyOpen && <PrivacyModal onClose={() => setIsPrivacyOpen(false)} t={t} />}
      </AnimatePresence>

      <AnimatePresence>
        {isTermsOpen && <TermsModal onClose={() => setIsTermsOpen(false)} t={t} />}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.k}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="fixed left-1/2 top-20 z-[120] -translate-x-1/2 bg-bone px-4 py-2.5 label text-canvas shadow-lg"
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
