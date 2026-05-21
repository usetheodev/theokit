import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

export default {
  // Scan our app/ + server/ AND the TheoUI library so its component classes
  // are included in the build. TheoUI ships with @tailwind directives in
  // styles.css; without scanning its source, those utilities are pruned.
  content: [
    './app/**/*.{ts,tsx}',
    './server/**/*.{ts,tsx}',
    './node_modules/@usetheo/ui/dist/**/*.{js,mjs}',
  ],
  darkMode: ['class', '[data-theme-mode="dark"]'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          deep: 'hsl(var(--primary-deep))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        info: 'hsl(var(--info))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: 'var(--shadow-glow)',
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.3s ease-out',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      transitionTimingFunction: {
        'out-soft': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      transitionDuration: {
        base: '180ms',
      },
    },
  },
  plugins: [animate],
} satisfies Config
