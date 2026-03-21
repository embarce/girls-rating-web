# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start development server on port 3000
npm run build     # Build for production
npm run preview   # Preview production build
npm run lint      # TypeScript type checking
npm run clean     # Remove dist folder
```

## Architecture

**Stack:** React 19 + TypeScript + Vite + Tailwind CSS v4 + Motion (Framer Motion fork)

**Key dependencies:**
- `@google/genai` - Google Gemini AI integration for image animation features
- `lucide-react` - Icon library
- `canvas-confetti` - Confetti effects
- `clsx` + `tailwind-merge` - Class name utilities

**Structure:**
- Single-page application with `App.tsx` as the main component
- `translations.ts` - i18n system supporting Chinese (zh) and English (en)
- `index.css` - Global styles with Tailwind v4, custom CSS variables for theming
- Path alias `@/*` configured to resolve to project root

**API Integration:**
- Backend expected at `http://localhost:8080`
- Endpoints: `/api/cosplay` (paginated), `/api/random`, `/images/*`
- Uses `GEMINI_API_KEY` and `APP_URL` from environment (configured via `.env`)

**Component patterns:**
- Modals use `AnimatePresence` for enter/exit animations
- Image modal has keyboard navigation (Arrow keys, Escape)
- Age verification gate controls initial access

**SEO:**
- `index.html` contains comprehensive meta tags, Open Graph, Twitter cards, and JSON-LD structured data
- `public/robots.txt` allows all search engines
- `public/sitemap.xml` includes main pages and sub-sites (luck, cat, worthjob)
- Multilingual support with `inLanguage` annotations for en and zh-CN
