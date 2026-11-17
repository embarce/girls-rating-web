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
  ZoomOut
} from 'lucide-react';
import { motion, AnimatePresence, useScroll, useSpring } from 'motion/react';
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
  author: {
    name: string;
    avatar: string;
  };
}

const API_BASE_URL = '/api';
const PAGE_SIZE = 10;

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

const SupportModal = ({ onClose, t }: { onClose: () => void; t: any }) => (
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
      <a
        href={t.support.emailFormat}
        className="flex w-full items-center justify-center gap-3 bg-accent px-6 py-3.5 label text-white transition-colors hover:bg-[#e6294d]"
      >
        <Share2 className="h-3.5 w-3.5" />
        {t.support.sendEmail}
      </a>
    </div>
    <div className="px-6 pb-6 md:px-8">
      <ModalFooterButton onClick={onClose}>{t.support.close}</ModalFooterButton>
    </div>
  </ModalShell>
);

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
  t
}: {
  activeCategory: Category;
  count: number;
  page: number;
  totalPages: number;
  onRefresh: () => void;
  isLoading: boolean;
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
  t
}: {
  image: CosplayImage;
  index: number;
  onClick: () => void;
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
          <span className="truncate text-[10px] uppercase tracking-[0.14em] text-bone/60 transition-colors group-hover:text-bone sm:text-[11px] sm:tracking-[0.18em]">
            {image.author.name}
          </span>
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
  t
}: {
  columns: CosplayImage[][];
  indexMap: Map<string, number>;
  onOpen: (url: string) => void;
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
  collectionTitle
}: {
  image: CosplayImage;
  images: CosplayImage[];
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSelect: (url: string) => void;
  t: any;
  liked: string[];
  onToggleLike: (url: string) => void;
  notify: (msg: string) => void;
  direction: number;
  collectionTitle: string;
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnimated, setIsAnimated] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);

  const index = images.findIndex(img => img.resourceUrl === image.resourceUrl);
  const isLiked = liked.includes(image.resourceUrl);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') onNext();
      else if (e.key === 'ArrowLeft') onPrev();
      else if (e.key === 'Escape') {
        if (zoomed) setZoomed(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNext, onPrev, onClose, zoomed]);

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
    try {
      const res = await fetch(image.resourceUrl, { mode: 'cors' });
      if (!res.ok) throw new Error('download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `girls-rating-${image.id || Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(image.resourceUrl, '_blank', 'noopener');
    }
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
                  onToggleLike(image.resourceUrl);
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
              onToggleLike(image.resourceUrl);
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
    load(activeCategory, 1, false);
  }, [activeCategory, load]);

  const selectedImage = useMemo(
    () => images.find(img => img.resourceUrl === selectedImageId) || null,
    [selectedImageId, images]
  );

  const handleNext = useCallback(() => {
    if (!selectedImageId || images.length === 0) return;
    const currentIndex = images.findIndex(img => img.resourceUrl === selectedImageId);
    setDirection(1);
    setSelectedImageId(images[(currentIndex + 1) % images.length].resourceUrl);
  }, [selectedImageId, images]);

  const handlePrev = useCallback(() => {
    if (!selectedImageId || images.length === 0) return;
    const currentIndex = images.findIndex(img => img.resourceUrl === selectedImageId);
    setDirection(-1);
    setSelectedImageId(images[(currentIndex - 1 + images.length) % images.length].resourceUrl);
  }, [selectedImageId, images]);

  const scrollTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const refresh = useCallback(() => {
    load(activeCategory, 1, false);
    if (activeCategory === 'latest') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeCategory, load]);

  const toggleLike = useCallback((url: string) => {
    setLiked(prev => (prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]));
  }, []);

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
            images={images}
            onClose={() => setSelectedImageId(null)}
            onNext={handleNext}
            onPrev={handlePrev}
            onSelect={setSelectedImageId}
            t={t}
            liked={liked}
            onToggleLike={toggleLike}
            notify={notify}
            direction={direction}
            collectionTitle={collectionTitle}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSupportOpen && <SupportModal onClose={() => setIsSupportOpen(false)} t={t} />}
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
