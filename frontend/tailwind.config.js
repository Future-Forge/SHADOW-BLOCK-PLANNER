/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Tactical Canvas
        'tactical-base': '#0D1311',
        'tactical-panel': '#1A2421',
        'tactical-grid': '#2C3A35',
        'tactical-steel': '#E2EAF4',

        // Operational Indicators
        'accent-maintenance': '#A7F3D0',
        'train-premium': '#FCD34D',
        'train-modern': '#38BDF8',
        'status-caution': 'rgb(var(--status-caution) / <alpha-value>)',
        'status-critical': 'rgb(var(--status-critical) / <alpha-value>)',
        'status-nominal': 'rgb(var(--status-nominal) / <alpha-value>)',
        status: {
          critical: 'rgb(var(--status-critical) / <alpha-value>)',
          caution: 'rgb(var(--status-caution) / <alpha-value>)',
          nominal: 'rgb(var(--status-nominal) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Rajdhani', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        'tactical-glow': '0 0 12px rgba(167, 243, 208, 0.3)',
        'tactical-critical': '0 0 16px rgba(239, 68, 68, 0.4)',
        'tactical-caution': '0 0 14px rgba(249, 115, 22, 0.35)',
        'tactical-panel': '0 8px 32px rgba(0, 0, 0, 0.65)',
      },
    },
  },
  plugins: [],
};
