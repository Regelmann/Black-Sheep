/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#f3efe9',
        elevated: '#faf8f5',
        surface: '#ffffff',
        ink: {
          DEFAULT: '#1a1614',
          soft: '#57534e',
        },
        muted: '#a8a29e',
        line: {
          DEFAULT: '#ebe6df',
          strong: '#d6cfc6',
        },
        brand: {
          DEFAULT: '#c2410c',
          dark: '#9a3412',
          soft: '#fff4eb',
        },
        navy: {
          DEFAULT: '#1a1614',
          2: '#2a2421',
        },
        ok: {
          DEFAULT: '#15803d',
          soft: '#ecfdf3',
        },
        warn: {
          DEFAULT: '#d97706',
          soft: '#fffbeb',
        },
        danger: {
          DEFAULT: '#dc2626',
          soft: '#fef2f2',
        },
        info: {
          DEFAULT: '#2563eb',
          soft: '#eff6ff',
        },
        wsp: '#16a34a',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        card: '18px',
        chip: '9999px',
        sheet: '24px',
      },
      boxShadow: {
        card: '0 4px 24px rgba(26, 22, 20, 0.06)',
        soft: '0 1px 3px rgba(26, 22, 20, 0.05)',
        sheet: '0 12px 40px rgba(26, 22, 20, 0.14)',
      },
      maxWidth: {
        phone: '480px',
      },
      spacing: {
        nav: '72px',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
  // Keep existing class names working; don't purge unknown from old CSS
  safelist: [
    { pattern: /^(bg|text|border)-(brand|ok|warn|danger|info|navy|wsp)(-\w+)?$/ },
  ],
}
