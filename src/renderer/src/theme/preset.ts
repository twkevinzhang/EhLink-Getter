import { definePreset } from '@primevue/themes'
import Aura from '@primevue/themes/aura'

export const EHPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#fbe6e7',
      100: '#f5bcc1',
      200: '#eb9098',
      300: '#e16570',
      400: '#d84552',
      500: '#c1212f',
      600: '#a71d29',
      700: '#8d1822',
      800: '#73141c',
      900: '#5c1217',
      950: '#3c0c0f',
    },
    colorScheme: {
      light: {
        surface: {
          0: '#ffffff',
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#d1d5db', // Similar to EH borders
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
          950: '#030712',
        },
      },
      dark: {
        surface: {
          0: '#ffffff',
          50: '#3f3f3f',
          100: '#3a3a3a',
          200: '#34353B', // EH Dark Body
          300: '#2D2D2D', // EH Dark Panel
          400: '#252525',
          500: '#1e1e1e',
          600: '#181818',
          700: '#121212',
          800: '#0c0c0c',
          900: '#060606',
          950: '#000000',
        },
      },
    },
  },
})
