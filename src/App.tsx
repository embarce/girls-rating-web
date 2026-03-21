import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, 
  X, 
  Heart, 
  Download, 
  Share2, 
  Maximize2, 
  Eye,
  Lock,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  HelpCircle,
  Plus,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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

// --- Components ---

const AgeGate = ({ onAccept, t }: { onAccept: () => void, t: any }) => {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-[#050505] flex items-center justify-center p-6"
    >
      <div className="max-w-md w-full text-center space-y-8">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-[#FF2D55]/10 flex items-center justify-center border border-[#FF2D55]/30">
            <ShieldCheck className="w-8 h-8 text-[#FF2D55]" />
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="flex justify-center mb-4">
            <img
              src={LOGO_URL}
              alt="Girls Rating Logo"
              className="w-24 h-24 rounded-full border-2 border-[#FF2D55]/30 shadow-[0_0_20px_rgba(255,45,85,0.2)]"
              referrerPolicy="no-referrer"
            />
          </div>
          <h1 className="text-3xl font-bold tracking-tighter uppercase italic">{t.ageGate.title}</h1>
          <p className="text-[#888] text-sm italic">
            {t.ageGate.subtitle}
          </p>
          <p className="text-[#888] text-xs mt-4">
            {t.ageGate.warning}
          </p>
        </div>

        <div className="space-y-4">
          <button 
            onClick={onAccept}
            className="w-full py-4 bg-[#FF2D55] hover:bg-[#E6294D] text-white font-bold rounded-full transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            {t.ageGate.enter} <ChevronRight className="w-4 h-4" />
          </button>
          <button className="w-full py-4 bg-transparent border border-white/10 hover:bg-white/5 text-[#888] font-medium rounded-full transition-all">
            {t.ageGate.exit}
          </button>
        </div>

        <p className="text-[10px] text-[#444] uppercase tracking-widest">
          {t.ageGate.footer}
        </p>
      </div>
    </motion.div>
  );
};

const QAModal = ({ onClose, t }: { onClose: () => void, t: any }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-md flex items-center justify-center p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-2xl w-full bg-[#0F0F10] border border-white/10 rounded-2xl p-8 space-y-8"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black tracking-tighter uppercase italic text-[#FF2D55]">{t.qa.title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-6">
          {t.qa.items.map((item: { q: string; a: string }, i: number) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="space-y-2"
            >
              <p className="text-sm font-bold text-[#FF2D55] uppercase tracking-wider">Q: {item.q}</p>
              <p className="text-sm text-[#888] leading-relaxed pl-4 border-l-2 border-[#FF2D55]/30">A: {item.a}</p>
            </motion.div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all"
        >
          {t.qa.close}
        </button>
      </motion.div>
    </motion.div>
  );
};

const FunnyModal = ({ onClose, lang, t }: { onClose: () => void, lang: Language, t: any }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-md flex items-center justify-center p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-2xl w-full bg-[#0F0F10] border border-white/10 rounded-2xl p-8 space-y-8"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-black tracking-tighter uppercase italic text-[#FF2D55]">{t.funny.title}</h2>
            <p className="text-xs text-[#888]">{t.funny.subtitle}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {FUNNY_LINKS[lang].map((link, i) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-6 rounded-xl bg-white/5 border border-white/5 hover:border-[#FF2D55]/50 hover:bg-[#FF2D55]/10 transition-all group flex items-center gap-4"
            >
              <div className="w-12 h-12 rounded-full bg-[#FF2D55]/10 flex items-center justify-center group-hover:bg-[#FF2D55]/20 transition-colors">
                <Share2 className="w-6 h-6 text-[#FF2D55]" />
              </div>
              <div className="flex-1">
                <p className="text-base font-bold text-white uppercase tracking-wider group-hover:text-[#FF2D55] transition-colors">{link.name}</p>
                <p className="text-xs text-[#888]">{link.desc}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-[#444] group-hover:text-[#FF2D55] transition-colors" />
            </a>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all"
        >
          {t.funny.close}
        </button>
      </motion.div>
    </motion.div>
  );
};

const SupportModal = ({ onClose, t }: { onClose: () => void, t: any }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-md flex items-center justify-center p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-lg w-full bg-[#0F0F10] border border-white/10 rounded-2xl p-8 space-y-8"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black tracking-tighter uppercase italic text-[#FF2D55]">{t.support.title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-6 text-center">
          <p className="text-sm text-[#888]">{t.support.description}</p>

          <div className="p-6 rounded-xl bg-white/5 border border-white/10">
            <p className="text-xs text-[#444] uppercase tracking-widest mb-2">Email</p>
            <a
              href={t.support.emailFormat}
              className="text-lg font-bold text-[#FF2D55] hover:underline break-all"
            >
              {t.support.contactEmail}
            </a>
          </div>

          <a
            href={t.support.emailFormat}
            className="inline-flex items-center justify-center gap-2 w-full py-4 bg-[#FF2D55] hover:bg-[#E6294D] text-white font-bold rounded-xl transition-all active:scale-95"
          >
            <Share2 className="w-5 h-5" />
            {t.support.sendEmail}
          </a>
        </div>

        <button
          onClick={onClose}
          className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all"
        >
          {t.support.close}
        </button>
      </motion.div>
    </motion.div>
  );
};

const PrivacyModal = ({ onClose, t }: { onClose: () => void, t: any }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-md flex items-center justify-center p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-lg w-full bg-[#0F0F10] border border-white/10 rounded-2xl p-8 space-y-8"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black tracking-tighter uppercase italic text-[#FF2D55]">{t.privacy.title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-6">
          <div className="p-6 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
            <ShieldCheck className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
            <p className="text-sm text-emerald-400 text-center font-bold">{t.privacy.statement}</p>
          </div>

          <div className="space-y-3">
            {t.privacy.details.map((item: string, i: number) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-center gap-3 p-3 rounded-lg bg-white/5"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-[#FF2D55] shrink-0" />
                <p className="text-sm text-[#888]">{item}</p>
              </motion.div>
            ))}
          </div>

          <p className="text-xs text-[#444] text-center italic">{t.privacy.commitment}</p>
        </div>

        <button
          onClick={onClose}
          className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all"
        >
          {t.privacy.close}
        </button>
      </motion.div>
    </motion.div>
  );
};

const TermsModal = ({ onClose, t }: { onClose: () => void, t: any }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-md flex items-center justify-center p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-2xl w-full bg-[#0F0F10] border border-white/10 rounded-2xl p-8 space-y-8 max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black tracking-tighter uppercase italic text-[#FF2D55]">{t.terms.title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-6">
          {t.terms.sections.map((section: { heading: string; content: string }, i: number) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="space-y-2"
            >
              <h3 className="text-sm font-bold text-[#FF2D55] uppercase tracking-wider">{section.heading}</h3>
              <p className="text-sm text-[#888] leading-relaxed pl-4 border-l-2 border-[#FF2D55]/30">{section.content}</p>
            </motion.div>
          ))}
        </div>

        <div className="pt-4 border-t border-white/10">
          <p className="text-xs text-[#444] text-center">{t.terms.lastUpdated}</p>
        </div>

        <button
          onClick={onClose}
          className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all"
        >
          {t.terms.close}
        </button>
      </motion.div>
    </motion.div>
  );
};

const Header = ({ activeCategory, onCategoryChange, onOpenQA, onOpenFunny, lang, onLangChange, t }: any) => {
  return (
    <header className="sticky top-0 z-50 glass-vault border-b border-white/5 px-6 py-4">
      <div className="max-w-[1800px] mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 overflow-hidden">
          <div className="flex items-center gap-2 shrink-0">
            <img
              src={LOGO_URL}
              alt="Logo"
              className="w-8 h-8 rounded-full border border-[#FF2D55]/50"
              referrerPolicy="no-referrer"
            />
            <h2 className="text-xl font-black tracking-tighter uppercase italic text-[#FF2D55] hidden sm:block">{t.header.logo}</h2>
          </div>
          <div className="h-4 w-[1px] bg-white/10 hidden md:block shrink-0" />
          <nav className="flex items-center gap-6 overflow-x-auto no-scrollbar pb-1 md:pb-0">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => {
                  if (cat === 'qa') onOpenQA();
                  else if (cat === 'funny') onOpenFunny();
                  else onCategoryChange(cat);
                }}
                className={`text-xs font-bold uppercase tracking-widest transition-colors whitespace-nowrap ${
                  activeCategory === cat ? 'text-[#FF2D55]' : 'text-[#888] hover:text-white'
                }`}
              >
                {t.categories[cat]}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => onLangChange(lang === 'zh' ? 'en' : 'zh')}
            className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95"
          >
            {lang === 'zh' ? 'EN' : '中文'}
          </button>
        </div>
      </div>
    </header>
  );
};

const ImageCard = ({ image, onClick }: { image: CosplayImage; onClick: () => void }) => {
  const imageUrl = image.resourceUrl;
  
  return (
    <motion.article 
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="vault-card group relative cursor-pointer"
      onClick={onClick}
    >
      <img 
        src={imageUrl} 
        alt={`Cosplay by ${image.author.name}`}
        referrerPolicy="no-referrer"
        className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-110"
        loading="lazy"
      />
      
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <img 
              src={image.author.avatar} 
              alt={image.author.name} 
              className="w-5 h-5 rounded-full border border-white/20"
              referrerPolicy="no-referrer"
            />
            <span className="text-[10px] text-white font-bold uppercase tracking-widest">{image.author.name}</span>
          </div>
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-[10px] text-[#888] font-medium">
                <Eye className="w-3 h-3" /> {image.views}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-[#FF2D55] font-bold">
                <Heart className="w-3 h-3 fill-[#FF2D55]" /> {image.rating}
              </span>
            </div>
            <div className="flex gap-2">
              <button className="p-1.5 rounded-full bg-white/10 hover:bg-[#FF2D55] transition-colors" aria-label="Like image">
                <Heart className="w-3 h-3" />
              </button>
              <button className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors" aria-label="View fullscreen">
                <Maximize2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.article>
  );
};

const ImageModal = ({
  image,
  allImages,
  onClose,
  onNext,
  onPrev,
  t
}: {
  image: CosplayImage;
  allImages: CosplayImage[];
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  t: any;
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnimated, setIsAnimated] = useState(false);
  const [displayUrl, setDisplayUrl] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') onNext();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNext, onPrev, onClose]);

  const originalUrl = useMemo(() =>
    image.resourceUrl
  , [image.resourceUrl]);

  useEffect(() => {
    setDisplayUrl(originalUrl);
    setIsAnimated(false);
    setIsProcessing(false);
  }, [originalUrl]);

  const handleMakeMove = async () => {
    if (isProcessing) return;

    setIsProcessing(true);

    // Simulate API request
    await new Promise(resolve => setTimeout(resolve, 3000));

    setIsProcessing(false);
    setIsAnimated(true);

    // Success Fireworks
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval: any = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);

    // Reset after 5 seconds so user can generate again
    setTimeout(() => {
      setIsAnimated(false);
    }, 5000);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-[#050505] flex items-center justify-center overflow-hidden"
    >
      {/* Atmospheric Background */}
      <div className="absolute inset-0 z-0">
        <div 
          className="absolute inset-0 bg-cover bg-center scale-110 blur-[100px] opacity-30"
          style={{ backgroundImage: `url(${originalUrl})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80" />
      </div>

      {/* Close Button */}
      <button 
        onClick={onClose}
        className="absolute top-6 right-6 z-[80] p-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all hover:rotate-90 active:scale-90"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Navigation Buttons */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-[70] flex justify-between px-4 md:px-12 pointer-events-none">
        <button 
          onClick={onPrev}
          className="p-4 rounded-full bg-black/40 backdrop-blur-md border border-white/10 hover:bg-[#FF2D55] hover:border-[#FF2D55] transition-all active:scale-90 pointer-events-auto group"
        >
          <ChevronLeft className="w-8 h-8 group-hover:scale-110 transition-transform" />
        </button>
        <button 
          onClick={onNext}
          className="p-4 rounded-full bg-black/40 backdrop-blur-md border border-white/10 hover:bg-[#FF2D55] hover:border-[#FF2D55] transition-all active:scale-90 pointer-events-auto group"
        >
          <ChevronRight className="w-8 h-8 group-hover:scale-110 transition-transform" />
        </button>
      </div>

      <div className="relative z-10 w-full h-full flex flex-col md:flex-row max-w-[1800px] mx-auto overflow-hidden">
        {/* Main Image View */}
        <div className="flex-1 relative flex items-center justify-center p-4 md:p-12 group">
          <AnimatePresence mode="wait">
            <motion.div
              key={displayUrl}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ 
                opacity: 1, 
                scale: 1, 
                y: 0,
                filter: isProcessing ? "blur(10px) grayscale(1)" : "blur(0px) grayscale(0)"
              }}
              exit={{ opacity: 0, scale: 1.05, y: -20 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className={`relative max-w-full max-h-full shadow-[0_0_100px_rgba(0,0,0,0.5)] rounded-lg overflow-hidden ${isAnimated ? 'ring-4 ring-[#FF2D55] ring-offset-4 ring-offset-black' : ''}`}
            >
              {isProcessing && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40">
                  <div className="w-16 h-16 border-4 border-[#FF2D55]/20 border-t-[#FF2D55] rounded-full animate-spin mb-4" />
                  <p className="text-sm font-black uppercase tracking-widest text-white animate-pulse">{t.modal.processing}</p>
                </div>
              )}
              
              <motion.img 
                src={displayUrl} 
                alt={`Cosplay by ${image.author.name} - Full View`}
                referrerPolicy="no-referrer"
                className={`max-w-full max-h-[85vh] object-contain transition-all duration-1000 ${isAnimated ? 'scale-105 rotate-1' : ''}`}
                animate={isAnimated ? {
                  scale: [1.05, 1.08, 1.05],
                  rotate: [1, -1, 1],
                } : {}}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              />
              
              {/* Quick Actions Overlay */}
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-6 px-8 py-4 rounded-full bg-black/60 backdrop-blur-xl border border-white/10 opacity-0 group-hover:opacity-100 transition-all translate-y-4 group-hover:translate-y-0">
                <button className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] hover:text-[#FF2D55] transition-colors">
                  <Heart className="w-4 h-4" /> Like
                </button>
                <div className="w-[1px] h-4 bg-white/20" />
                <button className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] hover:text-[#FF2D55] transition-colors">
                  <Download className="w-4 h-4" /> Download
                </button>
                <div className="w-[1px] h-4 bg-white/20" />
                <button className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] hover:text-[#FF2D55] transition-colors">
                  <Share2 className="w-4 h-4" /> Share
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Sidebar Info */}
        <motion.div 
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="w-full md:w-[450px] h-full bg-black/40 backdrop-blur-3xl border-l border-white/10 flex flex-col"
        >
          <div className="p-8 space-y-8 overflow-y-auto no-scrollbar flex-1">
            {/* Header */}
            <div className="space-y-2">
              <motion.p 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-[10px] font-black text-[#FF2D55] uppercase tracking-[0.4em]"
              >
                Exclusive Archive
              </motion.p>
              <motion.h2 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-5xl font-black tracking-tighter uppercase italic leading-none"
              >
                {image.author.name}
              </motion.h2>
            </div>
            
            {/* Artist Card */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="flex items-center gap-4 p-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all group cursor-pointer"
            >
              <div className="relative">
                <img 
                  src={image.author.avatar} 
                  alt={image.author.name} 
                  className="w-14 h-14 rounded-full border-2 border-[#FF2D55]/50 p-0.5"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="flex-1">
                <p className="text-[10px] text-[#888] font-black uppercase tracking-widest">{t.modal.verified}</p>
                <p className="text-lg font-bold">@{image.author.name}</p>
              </div>
            </motion.div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Rating', value: `${image.rating}/5`, icon: Heart, color: 'text-[#FF2D55]' },
                { label: 'Views', value: image.views, icon: Eye, color: 'text-white' },
                { label: 'Resolution', value: `${image.width}x${image.height}`, icon: Maximize2, color: 'text-white' },
                { label: 'Format', value: 'RAW / 4K', icon: ShieldCheck, color: 'text-emerald-400' }
              ].map((stat, i) => (
                <motion.div 
                  key={stat.label}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 + (i * 0.1) }}
                  className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <stat.icon className={`w-3 h-3 ${stat.color}`} />
                    <span className="text-[8px] font-black text-[#444] uppercase tracking-widest">{stat.label}</span>
                  </div>
                  <p className="text-sm font-bold tracking-tight">{stat.value}</p>
                </motion.div>
              ))}
            </div>

            {/* Tags */}
            <div className="space-y-3">
              <p className="text-[10px] font-black text-[#444] uppercase tracking-[0.2em]">Tags</p>
              <div className="flex flex-wrap gap-2">
                {['Cosplay', 'Premium', '4K', 'Cinematic', 'Exclusive'].map((tag, i) => (
                  <span key={tag} className="px-3 py-1.5 rounded-full bg-white/5 border border-white/5 text-[10px] font-bold text-[#888] hover:text-white hover:border-white/20 cursor-default transition-all">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>

            {/* More from Artist */}
            <div className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black text-[#444] uppercase tracking-[0.2em]">{t.modal.moreFromArtist}</p>
                <ChevronRight className="w-4 h-4 text-[#444]" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(() => {
                  const currentIndex = allImages.findIndex(img => img.resourceUrl === image.resourceUrl);
                  const nextImages = allImages.slice(currentIndex + 1, currentIndex + 4);
                  return nextImages.map((img, i) => (
                    <div key={img.id || i} className="aspect-[3/4] rounded-lg bg-white/5 border border-white/5 overflow-hidden group cursor-pointer hover:border-[#FF2D55]/50 transition-colors">
                      <img
                        src={img.resourceUrl}
                        alt={`Next ${i + 1}`}
                        className="w-full h-full object-cover opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ));
                })()}
                {allImages.length - allImages.findIndex(img => img.resourceUrl === image.resourceUrl) - 1 === 0 && (
                  <p className="col-span-3 text-xs text-[#444] text-center py-4">没有更多图片了</p>
                )}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-8 border-t border-white/10 bg-black/20">
            <motion.button 
              onClick={handleMakeMove}
              disabled={isProcessing || isAnimated}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              animate={{ 
                boxShadow: isProcessing 
                  ? "0 0 30px rgba(255,45,85,0.6)" 
                  : ["0 0 0 rgba(255,45,85,0)", "0 0 20px rgba(255,45,85,0.4)", "0 0 0 rgba(255,45,85,0)"]
              }}
              transition={{ duration: 2, repeat: Infinity }}
              className={`w-full py-4 font-black uppercase tracking-[0.2em] rounded-2xl transition-all flex items-center justify-center gap-3 shadow-[0_10px_30px_rgba(255,45,85,0.3)] ${
                isAnimated 
                  ? 'bg-emerald-500 text-white' 
                  : 'bg-[#FF2D55] hover:bg-[#E6294D] text-white'
              } disabled:opacity-80`}
            >
              {isProcessing ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : isAnimated ? (
                <ShieldCheck className="w-5 h-5" />
              ) : (
                <Sparkles className="w-5 h-5" />
              )}
              {isProcessing ? t.modal.processing : isAnimated ? t.modal.success : t.modal.action}
            </motion.button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

// --- Main App ---

export default function App() {
  const [isAged, setIsAged] = useState(false);
  const [isQAOpen, setIsQAOpen] = useState(false);
  const [isFunnyOpen, setIsFunnyOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [lang, setLang] = useState<Language>('zh');
  const [activeCategory, setActiveCategory] = useState<Category>('hot');
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [images, setImages] = useState<CosplayImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize] = useState(10);

  const t = translations[lang];

  const fetchImages = useCallback(async (page = 1, category = activeCategory) => {
    setIsLoading(true);
    try {
      let url = '';
      if (category === 'latest') {
        url = `${API_BASE_URL}/cosplay?page=${page}&pageSize=${pageSize}`;
      } else if (category === 'hot') {
        url = `${API_BASE_URL}/random`;
      }

      if (url) {
        const response = await fetch(url);
        const result = await response.json();

        if (result.code === 200) {
          if (category === 'latest') {
            setImages(result.data.list);
            setTotalPages(result.data.totalPage);
            setCurrentPage(result.data.currPage);
          } else {
            setImages(result.data);
            setTotalPages(1);
            setCurrentPage(1);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch images:', error);
      setImages([]);
      setTotalPages(0);
      setCurrentPage(0);
    } finally {
      setIsLoading(false);
    }
  }, [activeCategory, pageSize]);

  useEffect(() => {
    fetchImages(1, activeCategory);
  }, [activeCategory, fetchImages]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchImages(newPage, activeCategory);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleRefreshHot = () => {
    if (activeCategory === 'hot') {
      fetchImages(1, 'hot');
    }
  };

  const selectedImage = useMemo(() => {
    return images.find(img => img.resourceUrl === selectedImageId) || null;
  }, [selectedImageId, images]);

  const handleNext = useCallback(() => {
    if (!selectedImageId) return;
    const currentIndex = images.findIndex(img => img.resourceUrl === selectedImageId);
    if (currentIndex < images.length - 1) {
      setSelectedImageId(images[currentIndex + 1].resourceUrl);
    } else {
      setSelectedImageId(images[0].resourceUrl); // Loop to start
    }
  }, [selectedImageId, images]);

  const handlePrev = useCallback(() => {
    if (!selectedImageId) return;
    const currentIndex = images.findIndex(img => img.resourceUrl === selectedImageId);
    if (currentIndex > 0) {
      setSelectedImageId(images[currentIndex - 1].resourceUrl);
    } else {
      setSelectedImageId(images[images.length - 1].resourceUrl); // Loop to end
    }
  }, [selectedImageId, images]);

  return (
    <div className="min-h-screen bg-[#050505] font-sans selection:bg-[#FF2D55] selection:text-white">
      {/* JSON-LD Structured Data for SEO */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ImageGallery",
          "name": "Girls Rating",
          "description": "All images sourced online.",
          "author": {
            "@type": "Organization",
            "name": "Girls Rating"
          },
          "genre": "Cosplay Photography",
          "accessMode": "visual"
        })}
      </script>

      <AnimatePresence>
        {!isAged && <AgeGate onAccept={() => setIsAged(true)} t={t} />}
      </AnimatePresence>

      <AnimatePresence>
        {isQAOpen && <QAModal onClose={() => setIsQAOpen(false)} t={t} />}
      </AnimatePresence>

      <AnimatePresence>
        {isFunnyOpen && <FunnyModal onClose={() => setIsFunnyOpen(false)} lang={lang} t={t} />}
      </AnimatePresence>

      {isAged && (
        <>
          <Header 
            activeCategory={activeCategory} 
            onCategoryChange={setActiveCategory} 
            onOpenQA={() => setIsQAOpen(true)}
            onOpenFunny={() => setIsFunnyOpen(true)}
            lang={lang}
            onLangChange={setLang}
            t={t}
          />

          <main className="max-w-[1800px] mx-auto px-6 py-8">
            {/* SEO Content for Crawlers */}
            <section className="sr-only">
              <h1>{t.main.title} - {t.main.description}</h1>
              <p>
                Welcome to {t.main.title}, the ultimate destination for curated, high-quality cosplay photography. 
                Our collection features the finest work from top artists worldwide, showcasing incredible craftsmanship, 
                stunning visuals, and exclusive archives. Explore our hot and latest collections, and join our community 
                of enthusiasts.
              </p>
              <h2>Featured Artists and Cosplay Collections</h2>
              <p>
                Discover breathtaking cosplay from popular series, games, and original designs. Each piece is hand-selected 
                for its artistic merit and technical excellence.
              </p>
            </section>

            <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
              <div className="space-y-2">
                <h1 className="text-3xl font-black tracking-tighter uppercase italic text-white leading-none">{t.main.title}</h1>
                <p className="text-sm text-[#FF2D55] font-bold uppercase tracking-wider">
                  {t.main.description}
                </p>
                <p className="text-[10px] text-[#444] font-bold uppercase tracking-widest">
                  {activeCategory === 'latest' ? t.main.page.replace('{current}', currentPage.toString()).replace('{total}', totalPages.toString()) : t.main.curated}
                </p>
              </div>
              <div className="flex items-center gap-4">
                {activeCategory === 'hot' && (
                  <button 
                    onClick={handleRefreshHot}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-[#FF2D55] hover:text-white transition-all active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                    {t.main.refresh}
                  </button>
                )}
                <div className="flex items-center gap-2 text-[#444]">
                  <Eye className="w-4 h-4" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">{t.main.privateSession}</span>
                </div>
              </div>
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-32 space-y-4">
                <div className="w-12 h-12 border-4 border-[#FF2D55]/20 border-t-[#FF2D55] rounded-full animate-spin" />
                <p className="text-xs font-bold uppercase tracking-widest text-[#444]">{t.main.loading}</p>
              </div>
            ) : images.length > 0 ? (
              <>
                <div className="vault-grid">
                  {images.map((img, idx) => (
                    <div key={img.id || img.resourceUrl} className="animate-vault-in" style={{ animationDelay: `${(idx % 10) * 0.05}s` }}>
                      <ImageCard image={img} onClick={() => setSelectedImageId(img.resourceUrl)} />
                    </div>
                  ))}
                </div>

                {/* Pagination for '最新' */}
                {activeCategory === 'latest' && totalPages > 1 && (
                  <div className="flex justify-center items-center gap-4 mt-12">
                    <button 
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="p-3 rounded-full bg-white/5 border border-white/10 hover:bg-[#FF2D55] disabled:opacity-30 disabled:hover:bg-white/5 transition-all"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    
                    <div className="flex items-center gap-2">
                      {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                        // Simple pagination logic to show around current page
                        let pageNum = i + 1;
                        if (totalPages > 5) {
                          if (currentPage > 3) pageNum = currentPage - 3 + i;
                          if (pageNum > totalPages) pageNum = totalPages - 5 + i + 1;
                        }
                        if (pageNum <= 0) return null;
                        if (pageNum > totalPages) return null;

                        return (
                          <button
                            key={pageNum}
                            onClick={() => handlePageChange(pageNum)}
                            className={`w-10 h-10 rounded-full text-[10px] font-black transition-all ${
                              currentPage === pageNum 
                                ? 'bg-[#FF2D55] text-white' 
                                : 'bg-white/5 text-[#888] hover:text-white hover:bg-white/10'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>

                    <button 
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="p-3 rounded-full bg-white/5 border border-white/10 hover:bg-[#FF2D55] disabled:opacity-30 disabled:hover:bg-white/5 transition-all"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-32 text-center space-y-4">
                <Lock className="w-12 h-12 text-[#151516]" />
                <p className="text-[#444] font-bold uppercase tracking-widest">{t.main.noImages}</p>
              </div>
            )}
          </main>

          <footer className="border-t border-white/5 py-12 px-6 mt-20">
            <div className="max-w-[1800px] mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
              <div className="flex items-center gap-4">
                <img
                  src={LOGO_URL}
                  alt="Girls Rating Logo"
                  className="w-12 h-12 rounded-full border border-[#FF2D55]/30"
                  referrerPolicy="no-referrer"
                />
                <div className="space-y-1">
                  <h2 className="text-lg font-black tracking-tighter uppercase italic text-[#FF2D55]">{t.header.logo}</h2>
                  <p className="text-[10px] text-[#444] font-bold uppercase tracking-[0.3em]">{t.ageGate.subtitle}</p>
                </div>
              </div>
              <div className="flex gap-8">
                <button onClick={() => setIsTermsOpen(true)} className="text-[10px] font-bold text-[#444] hover:text-white uppercase tracking-widest transition-colors">Terms</button>
                <button onClick={() => setIsPrivacyOpen(true)} className="text-[10px] font-bold text-[#444] hover:text-white uppercase tracking-widest transition-colors">Privacy</button>
                <button onClick={() => setIsSupportOpen(true)} className="text-[10px] font-bold text-[#444] hover:text-white uppercase tracking-widest transition-colors">Support</button>
              </div>
              <p className="text-[10px] text-[#222] font-bold uppercase tracking-widest">© 2026 Girls Rating Group</p>
            </div>
          </footer>
        </>
      )}

      <AnimatePresence>
        {selectedImage && (
          <ImageModal
            image={selectedImage}
            allImages={images}
            onClose={() => setSelectedImageId(null)}
            onNext={handleNext}
            onPrev={handlePrev}
            t={t}
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
    </div>
  );
}
