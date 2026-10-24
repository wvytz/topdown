import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // Phaser to ~1.2 MB — wydzielamy go do osobnego chunka i podnosimy próg ostrzeżenia.
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      // Dwie strony (krok 96): gra PC i wersja mobilna — wspólny kod, osobne wejścia.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        mobile: fileURLToPath(new URL('./mobile.html', import.meta.url)),
      },
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
});
