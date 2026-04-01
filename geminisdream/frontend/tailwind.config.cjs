/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#020308',
        card: 'rgba(15, 17, 26, 0.7)',
        border: 'rgba(255, 255, 255, 0.08)',
        text: '#f8fafc',
        muted: '#94a3b8',
        accent: {
          DEFAULT: '#6366f1',
          glow: 'rgba(99, 102, 241, 0.4)',
        },
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
