import type { Config } from 'tailwindcss'

/**
 * Tailwind config — TheoUI requires Tailwind 3 to process its `@tailwind`
 * directives and to find the classes used by the compiled component code.
 *
 * `content` MUST include:
 *   - the app's source (so classes you write yourself are emitted)
 *   - the TheoUI compiled JS (so the classes baked into its components
 *     are emitted even though they're inside a node_module)
 */

const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './app/**/*.{ts,tsx,js,jsx}',
    './server/**/*.{ts,tsx}',
    './index.html',
    // TheoUI components ship as compiled JS — Tailwind needs to scan them
    // to know which utility classes to emit.
    './node_modules/@usetheo/ui/dist/**/*.{js,mjs,cjs}',
  ],
  theme: {
    extend: {
      // TheoUI tokens.css declares HSL custom properties (--background,
      // --foreground, --primary, etc.). Map them so utilities like
      // `bg-background`, `text-foreground`, `bg-primary` work.
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
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
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: 'var(--font-body)',
        display: 'var(--font-display)',
        mono: 'var(--font-mono)',
      },
    },
  },
  // tailwindcss-animate is a peer dep of @usetheo/ui — load it so the
  // animation utilities the components use are emitted.
  plugins: [require('tailwindcss-animate')],
}

export default config
