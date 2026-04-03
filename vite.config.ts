import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ModoCalendar',
      fileName: (format) => `modo-calendar.${format}.js`,
    },
    rollupOptions: {
      output: {
        assetFileNames: 'modo-calendar.[ext]',
      },
    },
    cssCodeSplit: false,
    sourcemap: true,
  },
});
