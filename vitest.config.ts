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
      // Testy arkuszy grafik (piksele, kafle) czytają duże PNG — na wolniejszym dysku (OneDrive, Windows) przekraczały 5 s.
      testTimeout: 30_000,
    },
  }),
);
