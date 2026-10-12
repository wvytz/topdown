import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Dziedziczymy aliasy (@/…) z konfiguracji Vite, żeby testy importowały moduły tak jak gra.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['tests/**/*.test.ts'],
      // Testujemy czystą logikę — bez przeglądarki i bez Phasera.
      environment: 'node',
    },
  }),
);
