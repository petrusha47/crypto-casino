import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        'casino-bg': '#050510',
        'casino-purple': '#7b2fff',
        'casino-cyan': '#00f5ff',
        'casino-dark': '#0a0a1a',
        'casino-border': '#1a1a3e',
      },
      boxShadow: {
        'glow-purple': '0 0 15px #7b2fff, 0 0 30px #7b2fff44',
        'glow-cyan': '0 0 15px #00f5ff, 0 0 30px #00f5ff44',
        'glow-sm-purple': '0 0 8px #7b2fff',
        'glow-sm-cyan': '0 0 8px #00f5ff',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
