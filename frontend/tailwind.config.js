export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {
    fontFamily: { sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'], mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'] },
    colors: { ink: '#05060f', navy: '#0a1030', violet: { 450: '#8b5cf6' } },
  } },
  plugins: [],
}
