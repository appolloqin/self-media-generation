/**
 * 智媒工坊 · 设计令牌 (Design Tokens)
 * 设计系统：浅色极简高端（近中性石墨主色）
 * 主色 Graphite #1F2937 / 背景 #FAFAFA
 *
 * 约定：本文件仅定义「视觉令牌」，不涉及任何业务逻辑。
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      /* ---------- 灰阶重映射 ----------
         Tailwind 默认 gray 偏浅（gray-400 ≈ 2.5:1），不满足 WCAG AA。
         这里将整套灰阶重映射为中性 Graphite/Slate：
           - 文本用的 400/500 加深至可读对比度
           - 边框用的 200/300 保证浅色模式下边框可见 */
      colors: {
        gray: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#6b7280',
          500: '#4b5563',
          600: '#374151',
          700: '#1f2937',
          800: '#111827',
          900: '#0a0a0a',
          950: '#09090b',
        },
        /* ---------- 品牌主色：Graphite / Ink ---------- */
        brand: {
          50: '#f4f4f5',
          100: '#e4e4e7',
          200: '#d4d4d8',
          300: '#a1a1aa',
          400: '#71717a',
          500: '#1f2937',
          600: '#111827',
          700: '#0a0a0a',
          800: '#09090b',
          900: '#09090b',
          950: '#000000',
        },
        /* ---------- 强调色：Emerald（仅成功态） ---------- */
        accent: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        /* ---------- 墨色：文字层级 ---------- */
        ink: {
          900: '#111827',
          800: '#1f2937',
          700: '#374151',
          600: '#4b5563',
          500: '#6b7280',
          400: '#6b7280',
        },
        /* ---------- 表面：背景层级 ---------- */
        surface: {
          DEFAULT: '#fafafa',
          sunken: '#f4f4f5',
          raised: '#ffffff',
        },
        /* ---------- 线条：可见边框 ---------- */
        line: {
          DEFAULT: '#e5e7eb',
          strong: '#d1d5db',
          soft: '#f4f4f5',
        },
      },
      /* ---------- 字体：本地系统栈（离线可用，中文优先） ---------- */
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          '"SFMono-Regular"',
          'Menlo',
          'Consolas',
          '"Courier New"',
          'monospace',
        ],
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '8px',
        md: '10px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
      },
      boxShadow: {
        xs: '0 1px 2px rgba(17, 24, 39, 0.04)',
        sm: '0 1px 2px rgba(17, 24, 39, 0.05)',
        DEFAULT: '0 1px 3px rgba(17, 24, 39, 0.06)',
        md: '0 2px 8px rgba(17, 24, 39, 0.06)',
        lg: '0 8px 24px rgba(17, 24, 39, 0.08)',
        xl: '0 12px 32px rgba(17, 24, 39, 0.10)',
        focus: '0 0 0 3px rgba(31, 41, 55, 0.14)',
        inset: 'inset 0 1px 2px rgba(17, 24, 39, 0.04)',
      },
      transitionDuration: {
        150: '150ms',
        200: '200ms',
        250: '250ms',
        300: '300ms',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      backgroundImage: {
        'brand-soft':
          'radial-gradient(50rem 28rem at 10% -10%, rgba(31,41,55,0.04), transparent 62%)',
        'brand-strong':
          'radial-gradient(44rem 26rem at 12% -8%, rgba(31,41,55,0.06), transparent 60%)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.98)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms cubic-bezier(0.4, 0, 0.2, 1) both',
        'slide-up': 'slide-up 250ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'scale-in': 'scale-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [],
};
