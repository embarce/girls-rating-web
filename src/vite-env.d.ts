/// <reference types="vite/client" />

// 构建期注入的 Turnstile 站点 key（Docker build-arg TURNSTILE_SITE_KEY → VITE_TURNSTILE_SITE_KEY）
interface ImportMetaEnv {
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

// Cloudflare Turnstile 显式渲染 API（https://developers.cloudflare.com/turnstile/）
interface Window {
  turnstile?: {
    render: (el: HTMLElement, params: Record<string, unknown>) => string;
    reset: (widgetId?: string) => void;
    remove: (widgetId: string) => void;
  };
}
