/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta Santander: rojo corporativo como primario.
        // Editar estos valores para cambiar el color principal de marca.
        primary: {
          50:  '#FFF1F1',
          100: '#FFE0E0',
          200: '#FFB8B8',
          300: '#FF8585',
          400: '#FF4D4D',
          500: '#EC0000', // Santander Red oficial
          600: '#CC0000',
          700: '#A50000',
          800: '#7A0000',
          900: '#4D0000',
        },
        // Alias semánticos para acceso rápido
        brand: {
          blue:       '#EC0000',
          'blue-700': '#A50000',
          'blue-50':  '#FFF1F1',
          dark:      '#0F172A',
          gray:      '#475569',
          'gray-light': '#F1F5F9',
        },
        accent: { 400: '#FFD24C', 500: '#FFC107', 600: '#E0A800' },
        // Light surfaces para hero, cards, header
        surface: {
          0:   '#FFFFFF',
          50:  '#F8FAFC',
          100: '#F1F5F9',
          150: '#E5E7EB',
          200: '#CBD5E1',
          // mantenemos tonos oscuros para zonas tipo "panel de control"
          800: '#1F2937',
          850: '#111827',
          900: '#0F172A',
          950: '#020617',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
