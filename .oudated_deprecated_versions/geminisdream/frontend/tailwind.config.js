/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Direct mapping for HSL variables
        primary: 'hsl(var(--bg-primary))',
        secondary: 'hsl(var(--bg-secondary))',
        accent: 'hsl(var(--accent))',
        'accent-glow': 'hsla(var(--accent-glow))',
        'text-primary': 'hsl(var(--text-primary))', // Still keeping these for specific use
        muted: 'hsl(var(--text-muted))',           // This fixes text-muted/bg-muted
        border: 'hsl(var(--border))',
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        error: 'hsl(var(--error))',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'JetBrains Mono', 'monospace'],
      },
      backdropBlur: {
        xl: '40px',
      }
    },
  },
  plugins: [],
}
